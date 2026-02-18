#!/usr/bin/env python3
"""
3DGS 计算服务器 - 后端API
运行在学校服务器（计算节点）

功能：
1. 接收视频文件（支持分块上传）
2. 处理视频并训练3DGS模型
3. 实时推送处理进度
4. 提供模型下载和查看器访问
"""

from flask import Flask, request, jsonify, send_file, Response, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import sys
import os
import json
import threading
import subprocess
from pathlib import Path
from datetime import datetime
import hashlib
import time
import logging
from werkzeug.utils import secure_filename

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-this'
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 * 1024  # 10GB max file size

# 启用CORS和SocketIO
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, 
                    cors_allowed_origins="*", 
                    max_http_buffer_size=100 * 1024 * 1024,
                    async_mode='eventlet',  # 明确指定使用 eventlet
                    ping_timeout=60,
                    ping_interval=25)

# 强制添加CORS头，解决某些情况下(如静态文件)CORS失效的问题
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response



# 配置
# 使用绝对路径，确保无论从哪里启动脚本都能正确访问
if os.name == 'nt':
    # Windows 开发环境
    BASE_DIR = Path.home() / 'drt' / 'gaussian-splatting'
else:
    # Linux 生产环境 (学校服务器)
    BASE_DIR = Path('/home/zml/drt/gaussian-splatting')

UPLOAD_FOLDER = BASE_DIR / 'uploads'
DATASETS_FOLDER = BASE_DIR / 'datasets'

# 确保目录存在
print(f"Base Directory: {BASE_DIR}")
print(f"Uploads: {UPLOAD_FOLDER}")
print(f"Datasets: {DATASETS_FOLDER}")
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
DATASETS_FOLDER.mkdir(parents=True, exist_ok=True)

# 全局任务状态
tasks = {}
tasks_lock = threading.Lock()

# 任务队列系统
import queue
task_queue = queue.Queue()  # 等待处理的任务队列
processing_tasks = set()    # 正在处理的任务集合
processing_lock = threading.Lock()

# GPU 并发限制（同时只处理一个任务，避免显存不足）
MAX_CONCURRENT_TASKS = 1


def check_gpu_memory():
    """检查 GPU 显存是否足够（需要至少 8GB 空闲显存，确保训练过程中不会显存不足）"""
    try:
        import subprocess
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=memory.free', '--format=csv,noheader,nounits'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            free_memory = int(result.stdout.strip().split('\n')[0])
            required_memory = 8192  # 至少 8GB 空闲显存（增加安全余量）
            
            if free_memory < required_memory:
                print(f"GPU 显存不足: 当前空闲 {free_memory} MB，需要 {required_memory} MB")
            else:
                print(f"GPU 显存充足: 当前空闲 {free_memory} MB")
            
            return free_memory >= required_memory
    except Exception as e:
        print(f"GPU 显存检测失败: {e}")
        return True  # 检测失败时假设有足够显存
    return True

def get_queue_position(task_id):
    """获取任务在队列中的位置"""
    queue_list = list(task_queue.queue)
    for i, item in enumerate(queue_list):
        # 队列中存储的是 (task_id, video_path) 元组
        if isinstance(item, tuple) and item[0] == task_id:
            return i + 1
    return 0  # 不在队列中


# ==========================================
# 启动队列处理器线程（应用初始化时）
# ==========================================

_queue_processor_started = False
_queue_processor_lock = threading.Lock()

def start_queue_processor():
    """启动队列处理器线程（只启动一次）"""
    global _queue_processor_started
    
    with _queue_processor_lock:
        if _queue_processor_started:
            print("[启动] 队列处理器已经在运行，跳过")
            return
        
        print("=" * 60)
        print("[启动] 正在启动任务队列处理器线程...")
        print("=" * 60)
        
        # 注意：task_queue_processor 函数在文件后面定义
        # 这里使用延迟导入避免循环依赖
        queue_thread = threading.Thread(target=lambda: task_queue_processor(), daemon=True, name="QueueProcessor")
        queue_thread.start()
        
        _queue_processor_started = True
        print(f"[启动] 任务队列处理器线程已启动 (线程ID: {queue_thread.ident})")
        print(f"[启动] GPU 并发限制: {MAX_CONCURRENT_TASKS} 个任务")
        print("=" * 60)


# 任务日志目录
TASK_LOGS_DIR = BASE_DIR / 'logs' / 'tasks'
TASK_LOGS_DIR.mkdir(parents=True, exist_ok=True)

class TaskProgress:
    """任务进度跟踪"""
    
    def __init__(self, task_id, scene_name, video_filename):
        self.task_id = task_id
        self.scene_name = scene_name
        self.video_filename = video_filename
        self.status = 'uploading'
        self.progress = 0
        self.message = '准备上传'
        self.access_code = None
        self.dataset_path = None
        self.model_path = None
        self.created_at = datetime.now().isoformat()
        self.updated_at = datetime.now().isoformat()
        self.error = None
        self.queue_position = 0  # 队列位置
        self.fps = 10  # 默认FPS，稍后会被覆盖
    
    def update(self, status=None, progress=None, message=None, **kwargs):
        """更新任务状态"""
        if status:
            self.status = status
        if progress is not None:
            self.progress = progress
        if message:
            self.message = message
        
        for key, value in kwargs.items():
            setattr(self, key, value)
        
        self.updated_at = datetime.now().isoformat()
        
        # 保存到磁盘持久化
        self.save_to_disk()
        
        # 通过WebSocket推送更新
        try:
            socketio.emit('task_update', self.to_dict(), room=self.task_id)
        except Exception:
            pass # 忽略 SocketIO 错误
    
    def save_to_disk(self):
        """将任务状态保存到磁盘"""
        try:
            file_path = TASK_LOGS_DIR / f"{self.task_id}.json"
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving task {self.task_id}: {e}")

    @classmethod
    def load_from_disk(cls, task_id):
        """从磁盘加载任务状态"""
        try:
            file_path = TASK_LOGS_DIR / f"{task_id}.json"
            if file_path.exists():
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # 重建对象
                task = cls(task_id, data.get('scene_name'), data.get('video_filename'))
                task.status = data.get('status')
                task.progress = data.get('progress')
                task.message = data.get('message')
                task.access_code = data.get('access_code')
                task.created_at = data.get('created_at')
                task.updated_at = data.get('updated_at')
                task.error = data.get('error')
                task.model_path = data.get('model_path') # 注意：这可能是相对路径或URL，视情况而定
                
                return task
        except Exception as e:
            print(f"Error loading task {task_id}: {e}")
        return None

    def to_dict(self):
        """转换为字典"""
        model_url = None
        if self.model_path:
            try:
                # 尝试转换为相对于 DATASETS_FOLDER 的 Web 路径
                # 如果已经是 URL 或者是相对路径，则可能不需要处理
                mod_path = Path(self.model_path)
                if mod_path.is_absolute() and mod_path.is_relative_to(DATASETS_FOLDER):
                     rel = mod_path.relative_to(DATASETS_FOLDER)
                     model_url = f"/datasets/{str(rel).replace('\\', '/')}"
                else:
                     model_url = str(self.model_path)
            except Exception:
                # 转换失败则保留原值
                model_url = str(self.model_path)

        return {
            'task_id': self.task_id,
            'scene_name': self.scene_name,
            'video_filename': self.video_filename,
            'status': self.status,
            'progress': self.progress,
            'message': self.message,
            'access_code': self.access_code,
            'dataset_path': str(self.dataset_path) if self.dataset_path else None,
            'model_path': model_url,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'error': self.error,
            'queue_position': self.queue_position  # 队列位置
        }


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        'status': 'ok',
        'server': 'compute',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/task/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """查询任务状态（支持断线重连）"""
    # 1. 尝试从内存获取
    with tasks_lock:
        task = tasks.get(task_id)
    
    # 2. 如果内存中没有，尝试从磁盘加载
    if not task:
        task = TaskProgress.load_from_disk(task_id)
        if task:
            # 恢复到内存中以便后续更新（如果需要）
            with tasks_lock:
                tasks[task_id] = task
    
    if task:
        return jsonify(task.to_dict())
    else:
        return jsonify({'error': '任务不存在'}), 404


@app.route('/api/upload/init', methods=['POST'])
def init_upload():
    """初始化上传"""
    data = request.json
    # scene_name 现在作为项目名称/ID使用
    project_name = data.get('scene_name') 
    video_filename = data.get('video_filename')
    
    if not project_name:
        return jsonify({'error': '请输入项目名称'}), 400
    
    if not video_filename:
        return jsonify({'error': '缺少视频文件名'}), 400
    
    # 1. 安全处理项目名称 (作为唯一ID)
    # secure_filename 会移除中文和特殊字符
    safe_name = secure_filename(project_name)
    if not safe_name:
        return jsonify({'error': '项目名称无效，请使用英文、数字或下划线'}), 400
        
    task_id = safe_name
    
    # 2. 重名检查
    import shutil

    # A. 检查内存中是否正在运行
    with tasks_lock:
        if task_id in tasks:
            # 如果是正在运行或排队，拒绝
            if tasks[task_id].status not in ['failed']:
                return jsonify({'error': f'项目 "{safe_name}" 正在上传或处理中，请更换名称'}), 409
            else:
                # 如果是内存中的失败任务，移除它，允许重试
                del tasks[task_id]

    # B. 检查历史记录
    existing_task = TaskProgress.load_from_disk(task_id)
    if existing_task:
        if existing_task.status == 'failed':
            # 允许覆盖失败的任务
            # 清理旧数据
            dataset_path = DATASETS_FOLDER / task_id
            if dataset_path.exists():
                try:
                    shutil.rmtree(dataset_path)
                    print(f"Removed failed dataset folder: {dataset_path}")
                except Exception as e:
                    logger.warning(f"清理旧任务失败目录出错: {e}")
        else:
            status_msg = "已完成" if existing_task.status == 'completed' else "正在处理"
            return jsonify({
                'error': f'项目 "{safe_name}" 记录已存在 ({status_msg})。\n请更换名称。'
            }), 409

    # C. 检查文件夹是否存在 (如果不是已知的失败任务，但文件夹存在)
    if (DATASETS_FOLDER / task_id).exists():
        return jsonify({
            'error': f'项目名称 "{safe_name}" 已存在目录。\n请更换名称。'
        }), 409

    
    # 获取FPS参数
    fps = data.get('fps', 10)
    print(f"DEBUG: Frontend requested FPS: {fps}")

    # 创建任务
    task = TaskProgress(task_id, project_name, video_filename)
    task.fps = fps 
    task.access_code = task_id # 兼容旧逻辑，access_code = task_id
    
    with tasks_lock:
        tasks[task_id] = task
    
    return jsonify({
        'task_id': task_id,
        'upload_url': f'/api/upload/chunk/{task_id}',
        'message': '上传初始化成功'
    })


@app.route('/api/upload/chunk/<task_id>', methods=['POST'])
def upload_chunk(task_id):
    """分块上传视频"""
    with tasks_lock:
        task = tasks.get(task_id)
    
    if not task:
        return jsonify({'error': '任务不存在'}), 404
    
    chunk = request.files.get('chunk')
    chunk_index = int(request.form.get('chunk_index', 0))
    total_chunks = int(request.form.get('total_chunks', 1))
    
    if not chunk:
        return jsonify({'error': '缺少文件块'}), 400
    
    # 保存文件块
    upload_path = UPLOAD_FOLDER / task_id
    upload_path.mkdir(exist_ok=True)
    
    chunk_path = upload_path / f'chunk_{chunk_index}'
    chunk.save(str(chunk_path))
    
    # 更新进度
    progress = int((chunk_index + 1) / total_chunks * 100)
    task.update(
        status='uploading',
        progress=progress,
        message=f'上传中 ({chunk_index + 1}/{total_chunks})'
    )
    
    return jsonify({
        'task_id': task_id,
        'chunk_index': chunk_index,
        'progress': progress,
        'message': '文件块上传成功'
    })


@app.route('/api/upload/complete/<task_id>', methods=['POST'])
def complete_upload(task_id):
    """完成上传并合并文件"""
    with tasks_lock:
        task = tasks.get(task_id)
    
    if not task:
        return jsonify({'error': '任务不存在'}), 404
    
    data = request.json
    total_chunks = data.get('total_chunks', 0)
    
    task.update(status='merging', progress=100, message='合并文件中...')
    
    # 在后台线程中合并文件
    threading.Thread(
        target=merge_and_process,
        args=(task_id, total_chunks),
        daemon=True
    ).start()
    
    return jsonify({
        'task_id': task_id,
        'message': '开始合并文件'
    })


def merge_and_process(task_id, total_chunks):
    """合并文件并加入处理队列"""
    with tasks_lock:
        task = tasks.get(task_id)
    
    if not task:
        return
    
    try:
        upload_path = UPLOAD_FOLDER / task_id
        video_path = UPLOAD_FOLDER / f"{task_id}_{task.video_filename}"
        
        # 合并文件块
        with open(video_path, 'wb') as outfile:
            for i in range(total_chunks):
                chunk_path = upload_path / f'chunk_{i}'
                if chunk_path.exists():
                    with open(chunk_path, 'rb') as infile:
                        outfile.write(infile.read())
                    chunk_path.unlink()  # 删除临时块
        
        # 删除临时目录
        upload_path.rmdir()
        
        # 将任务加入队列
        task_queue.put((task_id, video_path))
        
        # 更新任务状态为排队中
        # 更新任务状态为排队中
        queue_pos = get_queue_position(task_id)
        task.queue_position = queue_pos
        
        # 计算前面有多少个任务（队列中的前面任务 + 正在运行的任务）
        with processing_lock:
            running_count = len(processing_tasks)
            
        # queue_pos 至少为 1（因为刚放进去）
        # 前面的任务数 = (自己在队列中的位置 - 1) + 正在运行的任务数
        total_ahead = max(0, queue_pos - 1) + running_count
        
        if total_ahead > 0:
            task.update(
                status='queued', 
                progress=0, 
                message=f'排队中，前面还有 {total_ahead} 个任务...'
            )
        else:
            task.update(status='queued', progress=0, message='准备开始处理...')
        
    except Exception as e:
        task.update(status='failed', error=str(e), message=f'合并失败: {e}')


def process_video(task_id, video_path):
    """处理视频并训练模型"""
    with tasks_lock:
        task = tasks.get(task_id)
    
    if not task:
        return
    
    try:
        # 注意: 如果前端没传，init_upload 默认是 10
        fps = getattr(task, 'fps', 10)

        # 调用自动化脚本
        cmd = [
            sys.executable, 
            str(BASE_DIR / 'auto_video_to_3dgs.py'),
            '--video', str(video_path),
            '--scene', task.scene_name,
            '--id', task_id,  # 传递 ID，确保文件夹名与 task_id 一致
            '--fps', str(fps),
            '--output-base', str(DATASETS_FOLDER),
            '--render'
        ]
        
        print(f"DEBUG: Full command: {' '.join(cmd)}")
        
        # ==========================================
        # 动态资源分配 (Dynamic Resource Allocation)
        # ==========================================
        import multiprocessing
        import os
        
        total_cores = multiprocessing.cpu_count()
        
        # 1. 获取系统当前负载 (1分钟平均负载)
        try:
            # os.getloadavg() 只在 Unix/Linux 上可用
            # 返回 (1min, 5min, 15min) 负载
            current_sys_load = os.getloadavg()[0]
        except (AttributeError, OSError):
            current_sys_load = 0
            
        # 2. 计算"空闲"的核心数
        # 负载值大致对应正在使用的核心数
        # 我们假设当前负载中的进程会持续运行
        free_cores = max(0, total_cores - current_sys_load)
        
        # 3. 分配策略:
        # - 只使用空闲核心的 80% (留出余量防止波动)
        # - 总量不超过总核心数的 75% (防止霸占独吞)
        # - 至少保证 2 个线程 (防止饿死)
        target_threads = int(free_cores * 0.8)
        cap_limit = int(total_cores * 0.75)
        
        safe_threads = min(target_threads, cap_limit)
        safe_threads = max(2, safe_threads) # 最小保底
        
        print(f"[Resource Manager] Total Cores: {total_cores}, Current Load: {current_sys_load:.2f}")
        print(f"[Resource Manager] Allocating {safe_threads} threads for this task.")
        
        # 设置环境变量
        env = os.environ.copy()
        env['OMP_NUM_THREADS'] = str(safe_threads)
        env['MKL_NUM_THREADS'] = str(safe_threads)
        env['QT_QPA_PLATFORM'] = 'offscreen'
        # 优化 PyTorch 显存分配，减少碎片化，避免 OOM
        env['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'

        #而在 Linux 下，为了支持 COLMAP 使用 GPU (OpenGL)，必须使用 xvfb-run 提供虚拟显示环境
        # 同时使用 nice 降低优先级
        if os.name != 'nt':
            # 顺序: nice -> xvfb-run -> python
            # -a: 自动寻找空闲的 display number
            cmd = ['nice', '-n', '15', 'xvfb-run', '-a'] + cmd

        task.update(status='processing', progress=5, message='启动处理流程...')
        
        # 启动子进程
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env  # 传入限制后的环境变量
        )
        
        # ==========================================
        # 启动 GPU 显存保护守护进程
        # ==========================================
        guard_process = None
        if os.name != 'nt':  # 仅在 Linux 上启用（Windows 不支持 SIGSTOP/SIGCONT）
            try:
                guard_script = BASE_DIR / 'gpu_memory_guard.py'
                if guard_script.exists():
                    logger.info(f"[GPU Guard] 启动显存保护守护进程，监控 PID {process.pid}")
                    guard_process = subprocess.Popen(
                        [sys.executable, str(guard_script), str(process.pid)],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True
                    )
                    logger.info(f"[GPU Guard] 守护进程已启动 (PID: {guard_process.pid})")
            except Exception as e:
                logger.warning(f"[GPU Guard] 启动失败: {e}，继续运行但无显存保护")
        
        # 实时读取输出并更新进度
        import re
        access_code = task_id # 直接使用 task_id 作为访问码
        # 确保 task 对象中的 access_code 也被设置
        task.update(access_code=task_id)
        total_frames = 0
        
        # 初始状态：开始处理
        task.update(status='processing', progress=0, message='开始处理视频...')
        
        for line in process.stdout:
            print(line, end='')

            
            # 这里的 log 解析容易出错且不必要，因为我们已经通过 --id 传递了 task_id
            # 且 auto_video_to_3dgs.py 会尊重这个 ID
            # if '访问码:' in line or 'access_code:' in line:
            #     parts = line.split(':')
            #     if len(parts) > 1:
            #         access_code = parts[1].strip()
            #         task.update(access_code=access_code)
            
            # 辅助函数：防止进度倒退
            def safe_update(status, progress, msg):
                if progress >= task.progress:
                   task.update(status=status, progress=progress, message=msg)
            
            # 1. 检测提取帧阶段开始
            if '步骤 1: 从视频中提取帧' in line or '提取帧率:' in line:
                safe_update('extracting', 5, '正在提取视频帧...')
            
            # 2. 解析总帧数（修复正则表达式，添加 ✓ 符号）
            elif re.search(r'[✓√]?\s*成功提取\s+(\d+)\s+帧', line):
                frame_match = re.search(r'[✓√]?\s*成功提取\s+(\d+)\s+帧', line)
                total_frames = int(frame_match.group(1))
                safe_update('extracting', 15, f'已提取 {total_frames} 帧，准备重建...')
            
            # 3. 检测 COLMAP 阶段开始
            elif '步骤 2: 运行 COLMAP' in line or 'Running COLMAP' in line:
                safe_update('colmap', 16, 'COLMAP 相机重建开始...')
            
            # 4. 检测 COLMAP 完成
            elif 'COLMAP 处理完成' in line or 'COLMAP 输出验证通过' in line:
                safe_update('colmap', 40, 'COLMAP 重建完成，准备训练...')

            
            # 5. 检测训练阶段开始
            elif '步骤 4: 训练 3D Gaussian Splatting 模型' in line or '训练开始' in line:
                safe_update('training', 41, '模型训练开始...')
            
            # 6. 检测渲染阶段
            elif '步骤 5: 渲染训练结果' in line or ('渲染' in line and '完成' not in line and '开始' in line):
                safe_update('rendering', 95, '渲染结果中(可能需要几分钟)...')

            # 7. 根据当前阶段解析进度
            elif estimate_progress(line) is not None:
                prog = estimate_progress(line)
                # 训练阶段：映射到 41% - 94% (区间跨度 53)
                real_prog = 41 + int(prog * 0.53)
                real_prog = min(94, real_prog)
                safe_update('training', real_prog, f'训练中... {prog}%')


        
        process.wait()
        
        # ==========================================
        # 清理 GPU 显存保护守护进程
        # ==========================================
        if guard_process is not None:
            try:
                guard_process.terminate()
                guard_process.wait(timeout=5)
                print(f"[GPU Guard] 守护进程已终止")
            except Exception as e:
                print(f"[GPU Guard] 终止守护进程失败: {e}")
                try:
                    guard_process.kill()
                except:
                    pass
        
        # 立即删除原始视频文件以节约空间
        try:
            if video_path.exists():
                video_path.unlink()
                print(f"已删除原始视频文件: {video_path}")
        except Exception as e:
            print(f"删除视频文件失败: {e}")
        
        if process.returncode == 0:
            # 处理成功 - 开始优化
            if access_code:
                # 读取场景信息
                dataset_path = DATASETS_FOLDER / access_code
                scene_info_file = dataset_path / 'scene_info.json'
                
                model_path = None
                if scene_info_file.exists():
                    with open(scene_info_file, 'r', encoding='utf-8') as f:
                        scene_info = json.load(f)
                        model_path = scene_info.get('model_path')
                
                # ==========================================
                # 自动优化模型
                # ==========================================
                task.update(status='optimizing', progress=98, message='正在优化模型...')
                
                try:
                    print(f"\n[INFO] 开始自动优化模型: {access_code}")
                    optimize_script = BASE_DIR / 'optimize_model.py'
                    
                    if optimize_script.exists():
                        # 使用 auto 模式自动选择最佳优化策略
                        optimize_cmd = [sys.executable, str(optimize_script), access_code, 'auto']
                        
                        optimize_process = subprocess.run(
                            optimize_cmd,
                            capture_output=True,
                            text=True,
                            timeout=300  # 5分钟超时
                        )
                        
                        if optimize_process.returncode == 0:
                            print(f"[INFO] 模型优化成功")
                            print(optimize_process.stdout)
                        else:
                            print(f"[WARNING] 模型优化失败 (Code {optimize_process.returncode})")
                            print(f"STDOUT: {optimize_process.stdout}")
                            print(f"STDERR: {optimize_process.stderr}")
                            # 优化失败不影响主流程
                    else:
                        print(f"[WARNING] 优化脚本不存在: {optimize_script}")
                
                except Exception as e:
                    print(f"[WARNING] 模型优化出错: {e}")
                    # 优化失败不影响主流程
                
                # 最终完成
                task.update(
                    status='completed',
                    progress=100,
                    message='处理完成！',
                    dataset_path=dataset_path,
                    model_path=model_path
                )
            else:
                task.update(
                    status='completed',
                    progress=100,
                    message='处理完成（未获取访问码）'
                )
        else:
            task.update(
                status='failed',
                error=f'处理失败，退出码: {process.returncode}',
                message='处理失败'
            )
        
        # 清理上传的视频文件
        if video_path.exists():
            video_path.unlink()
    
    except Exception as e:
        task.update(status='failed', error=str(e), message=f'处理出错: {e}')


def estimate_progress(line):
    """估算训练进度（增强版）- 排除非训练阶段的输出"""
    import re
    
    # 排除非训练阶段的关键词
    # 包括：COLMAP 相关、相机加载、帧提取等
    exclude_keywords = [
        'Registering',           # COLMAP 注册图像
        'COLMAP', 'colmap',      # COLMAP 相关
        'Extracting',            # 提取帧
        'Matching',              # 特征匹配
        'Triangulation',         # 三角化
        'Reading camera',        # 读取相机（训练开始时加载数据）
        'Loading',               # 加载数据
        'Preparing'              # 准备阶段
    ]
    if any(keyword in line for keyword in exclude_keywords):
        return None
    
    # 策略 1: 匹配精确的迭代次数 (例如: 700/30000)
    # 这通常提供比百分比更"精确"的进度
    iter_match = re.search(r'(\d+)\s*/\s*(\d+)', line)
    if iter_match:
        try:
            current = int(iter_match.group(1))
            total = int(iter_match.group(2))
            # 严格验证: 3DGS 训练通常至少几千次迭代（提高阈值避免误判）
            # 并且 current 必须 <= total
            if total >= 1000 and current <= total:
                # 防止除零错误，尽管正则匹配保证了数字存在
                return int((current / total) * 100)
        except ValueError:
            pass

    # 策略 2: 匹配 tqdm 风格的百分比 (例如: 10%|...|)
    percent_match = re.search(r'(\d+)%\|', line)
    if percent_match:
        try:
            return int(percent_match.group(1))
        except ValueError:
            pass

    # 策略 3: 匹配普通百分比文本 (例如: Progress: 50%)
    # 但要小心不要误判，比如 "100% loss"
    text_match = re.search(r'(?:progress|进度).*?(\d+)%', line, re.IGNORECASE)
    if text_match:
        try:
            return int(text_match.group(1))
        except ValueError:
            pass
            
    return None

@app.route('/api/tasks', methods=['GET'])
def list_tasks():
    """列出所有任务"""
    with tasks_lock:
        tasks_list = [task.to_dict() for task in tasks.values()]
    
    # 按创建时间倒序排序
    tasks_list.sort(key=lambda x: x['created_at'], reverse=True)
    
    return jsonify(tasks_list)


@app.route('/api/scenes', methods=['GET'])
def list_scenes():
    """列出所有场景（从访问码文件读取）"""
    access_codes_file = DATASETS_FOLDER / '.access_codes.json'
    
    if not access_codes_file.exists():
        return jsonify({})
    
    try:
        with open(access_codes_file, 'r', encoding='utf-8') as f:
            codes = json.load(f)
        return jsonify(codes)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/scenes/<access_code>', methods=['GET'])
def get_scene(access_code):
    """获取场景详情"""
    access_codes_file = DATASETS_FOLDER / '.access_codes.json'
    
    if not access_codes_file.exists():
        return jsonify({'error': '访问码文件不存在'}), 404
    
    try:
        with open(access_codes_file, 'r', encoding='utf-8') as f:
            codes = json.load(f)
        
        if access_code in codes:
            scene_data = codes[access_code]
            # 转换绝对路径为Web路径
            if 'model_path' in scene_data and scene_data['model_path']:
                try:
                    p = Path(scene_data['model_path'])
                    if str(DATASETS_FOLDER) in str(p):
                        rel = p.relative_to(DATASETS_FOLDER)
                        scene_data['model_path'] = f"/datasets/{str(rel).replace('\\', '/')}"
                except Exception:
                    pass
            return jsonify(scene_data)
        else:
            return jsonify({'error': '场景不存在'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/download/model/<access_code>', methods=['GET'])
def download_model(access_code):
    """下载模型文件"""
    # 这里可以实现模型文件的打包下载
    # 简化版：返回模型路径
    access_codes_file = DATASETS_FOLDER / '.access_codes.json'
    
    if not access_codes_file.exists():
        return jsonify({'error': '访问码文件不存在'}), 404
    
    try:
        with open(access_codes_file, 'r', encoding='utf-8') as f:
            codes = json.load(f)
        
        if access_code not in codes:
            return jsonify({'error': '场景不存在'}), 404
        
        model_path = codes[access_code].get('model_path')
        
        if not model_path:
            return jsonify({'error': '模型尚未生成'}), 404
        
        # 返回正确的文件下载URL (基于静态文件服务)
        # 将绝对路径转换为Web路径
        try:
            rel_path = Path(model_path).relative_to(DATASETS_FOLDER)
            web_path = f"/datasets/{str(rel_path).replace('\\', '/')}"
        except Exception:
            # 如果不在datasets目录下，回退到默认结构
            web_path = f"/datasets/{access_code}/model"

        return jsonify({
            'access_code': access_code,
            'model_path': model_path,
            'download_url': web_path
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/datasets/<path:filename>')
def serve_datasets(filename):
    """Serve files from the datasets directory"""
    return send_from_directory(DATASETS_FOLDER, filename)


@app.route('/api/list-dirs', methods=['GET'])
def list_dirs():
    """List subdirectories in a given path (relative to DATASETS_FOLDER)"""
    # Fix: Remove 'datasets/' prefix if present in the path argument
    # because DATASETS_FOLDER is already the root
    rel_path_arg = request.args.get('path', '')
    
    if rel_path_arg.startswith('datasets/'):
        rel_path = rel_path_arg[9:] # Remove 'datasets/' prefix
    else:
        rel_path = rel_path_arg
    
    # Security check: prevent traversal
    if '..' in rel_path or rel_path.startswith('/'):
        return jsonify({'error': 'Invalid path'}), 400
        
    target_path = DATASETS_FOLDER / rel_path
    
    if not target_path.exists():
        return jsonify({'error': 'Path not found'}), 404
        
    if not target_path.is_dir():
        return jsonify({'error': 'Path is not a directory'}), 400
        
    try:
        # List only directories
        dirs = [d.name for d in target_path.iterdir() if d.is_dir()]
        return jsonify({'directories': dirs})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# WebSocket事件处理
@socketio.on('connect')
def handle_connect():
    """客户端连接"""
    print(f'客户端连接: {request.sid}')
    emit('connected', {'message': '连接成功'})


@socketio.on('disconnect')
def handle_disconnect():
    """客户端断开"""
    print(f'客户端断开: {request.sid}')


@socketio.on('subscribe_task')
def handle_subscribe_task(data):
    """订阅任务更新"""
    task_id = data.get('task_id')
    if task_id:
        # 将客户端加入任务房间
        from flask_socketio import join_room
        join_room(task_id)
        
        # 发送当前状态
        with tasks_lock:
            task = tasks.get(task_id)
        
        if task:
            emit('task_update', task.to_dict())



# ==========================================
# 前端静态文件托管 (Web Viewer Integration)
# ==========================================

@app.route('/')
def serve_index():
    """服务 Web Viewer 前端主页"""
    return send_from_directory(BASE_DIR / 'web-viewer', 'index.html')

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(BASE_DIR / 'web-viewer/js', filename)

@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(BASE_DIR / 'web-viewer/css', filename)

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(BASE_DIR / 'web-viewer/assets', filename)

@app.route('/spark/<path:filename>') # Spark 引擎可能用的 assets
def serve_spark_assets(filename):
    return send_from_directory(BASE_DIR / 'web-viewer/spark', filename)


# ==========================================
# 任务队列处理器
# ==========================================

def task_queue_processor():
    """后台线程：处理任务队列"""
    print("=" * 60)
    print("任务队列处理器已启动，等待任务...")
    print("=" * 60)
    
    while True:
        try:
            print(f"[队列处理器] 等待从队列中获取任务... (当前队列大小: {task_queue.qsize()})")
            
            # 从队列中获取任务（阻塞等待）
            task_id, video_path = task_queue.get()
            
            print(f"[队列处理器] 从队列取出任务: {task_id}")
            
            with tasks_lock:
                task = tasks.get(task_id)
            
            if not task:
                print(f"[队列处理器] 警告：任务 {task_id} 不存在，跳过")
                task_queue.task_done()
                continue
            
            # 任务已从队列取出，开始检查条件
            print(f"[队列处理器] 任务 {task_id}: 开始检查 GPU 资源")
            task.update(status='queued', progress=0, message='正在检查 GPU 资源...')
            
            # 等待直到有足够的 GPU 显存和并发槽位
            check_count = 0
            while True:
                check_count += 1
                print(f"[队列处理器] 任务 {task_id}: 第 {check_count} 次检查条件")
                
                with processing_lock:
                    # 检查并发限制
                    current_processing = len(processing_tasks)
                    print(f"[队列处理器] 当前正在处理的任务数: {current_processing}/{MAX_CONCURRENT_TASKS}")
                    
                    if current_processing >= MAX_CONCURRENT_TASKS:
                        # 任务已取出但被并发限制卡住，说明它是"下一个"
                        # 此时它不在 task_queue 中，get_queue_position 会返回 0
                        print(f"[队列处理器] 任务 {task_id}: 并发限制，等待空闲槽位")
                        task.update(
                            status='queued',
                            message=f'排队中，正在等待 {current_processing} 个任务完成...'
                        )
                        time.sleep(5)  # 等待 5 秒后重试
                        continue
                    
                    # 检查 GPU 显存
                    print(f"[队列处理器] 任务 {task_id}: 检查 GPU 显存...")
                    gpu_ok = check_gpu_memory()
                    
                    if not gpu_ok:
                        print(f"[队列处理器] 任务 {task_id}: GPU 显存不足，等待中...")
                        task.update(
                            status='queued',
                            message='等待 GPU 显存释放...（需要至少 8GB 空闲显存）'
                        )
                        time.sleep(10)  # 等待 10 秒后重试
                        continue
                    
                    # 可以开始处理
                    print(f"[队列处理器] 任务 {task_id}: 条件检查通过，准备开始处理")
                    processing_tasks.add(task_id)
                    task.update(status='queued', progress=0, message='GPU 检查通过，准备开始处理...')
                    break
            
            # 开始处理任务
            try:
                print(f"[队列处理器] 任务 {task_id}: 开始处理视频")
                task.update(status='processing', progress=0, message='开始处理视频...')
                process_video(task_id, video_path)
                print(f"[队列处理器] 任务 {task_id}: 处理完成")
            except Exception as e:
                print(f"[队列处理器] 任务 {task_id}: 处理失败 - {e}")
                import traceback
                traceback.print_exc()
            finally:
                # 处理完成后从处理集合中移除
                with processing_lock:
                    processing_tasks.discard(task_id)
                    print(f"[队列处理器] 任务 {task_id}: 从处理集合移除")
                task_queue.task_done()
                
        except Exception as e:
            print(f"[队列处理器] 错误: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(1)


if __name__ == '__main__':
    print("=" * 60)
    print("3DGS 计算服务器启动 (开发模式)")
    print("=" * 60)
    # 确保所有必要目录存在
    (BASE_DIR / 'web-viewer').mkdir(parents=True, exist_ok=True)
    
    # 队列处理器已在应用加载时启动（见 start_queue_processor()）
    # 这里只需要启动 Flask 服务器
    
    print(f"Starting server on 0.0.0.0:5000")
    print(f"Web Viewer available at: http://localhost:5000/")
    print(f"Data Directory: {DATASETS_FOLDER}")
    
    # 禁用 reloader 防止队列处理器线程丢失
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, use_reloader=False, allow_unsafe_werkzeug=True)


# ==========================================
# 启动队列处理器（应用加载时自动执行）
# ==========================================
# 无论是直接运行 (python backend_server.py) 还是用 Gunicorn 启动，
# 这行代码都会在模块加载时执行，确保队列处理器正常启动
start_queue_processor()
