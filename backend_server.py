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
import os
import json
import threading
import subprocess
from pathlib import Path
from datetime import datetime
import hashlib
import time
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-this'
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 * 1024  # 10GB max file size

# 启用CORS和SocketIO
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=100 * 1024 * 1024)

# 强制添加CORS头，解决某些情况下(如静态文件)CORS失效的问题
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response



# 配置
# 使用绝对路径，确保无论从哪里启动脚本都能正确访问
BASE_DIR = Path.home() / 'drt' / 'gaussian-splatting'
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
        
        # 通过WebSocket推送更新
        socketio.emit('task_update', self.to_dict(), room=self.task_id)
    
    def to_dict(self):
        """转换为字典"""
        return {
            'task_id': self.task_id,
            'scene_name': self.scene_name,
            'video_filename': self.video_filename,
            'status': self.status,
            'progress': self.progress,
            'message': self.message,
            'access_code': self.access_code,
            'dataset_path': str(self.dataset_path) if self.dataset_path else None,
            'model_path': str(self.model_path) if self.model_path else None,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'error': self.error
        }


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        'status': 'ok',
        'server': 'compute',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/upload/init', methods=['POST'])
def init_upload():
    """初始化上传"""
    data = request.json
    scene_name = data.get('scene_name', 'scene')
    video_filename = data.get('video_filename')
    file_size = data.get('file_size', 0)
    
    if not video_filename:
        return jsonify({'error': '缺少视频文件名'}), 400
    
    # 生成任务ID
    task_id = hashlib.md5(f"{scene_name}{video_filename}{time.time()}".encode()).hexdigest()[:16]
    
    # 获取FPS参数
    fps = data.get('fps', 30)

    # 创建任务
    task = TaskProgress(task_id, scene_name, video_filename)
    task.fps = fps # 保存到任务对象
    
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
    """合并文件并开始处理"""
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
        
        task.update(status='processing', progress=0, message='文件合并完成，开始处理...')
        
        # 开始处理视频
        process_video(task_id, video_path)
        
    except Exception as e:
        task.update(status='failed', error=str(e), message=f'合并失败: {e}')


def process_video(task_id, video_path):
    """处理视频并训练模型"""
    with tasks_lock:
        task = tasks.get(task_id)
    
    if not task:
        return
    
    try:
        # 获取任务配置的 FPS，默认为 30 (应用户要求提高性能)
        # 注意: 如果前端没传，init_upload 默认是 10
        fps = getattr(task, 'fps', 30)

        # 调用自动化脚本
        cmd = [
            sys.executable, 
            str(BASE_DIR / 'auto_video_to_3dgs.py'),
            '--video', str(video_path),
            '--scene', task.scene_name,
            '--fps', str(fps),
            '--output-base', str(DATASETS_FOLDER),
            '--render'
        ]
        
        task.update(status='processing', progress=5, message='启动处理流程...')
        
        # 启动子进程
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        
        # 实时读取输出并更新进度
        access_code = None
        for line in process.stdout:
            print(line, end='')
            
            # 解析访问码
            if '访问码:' in line or 'access_code:' in line:
                parts = line.split(':')
                if len(parts) > 1:
                    access_code = parts[1].strip()
                    task.update(access_code=access_code)
            
            # 1. 优先匹配明确的阶段关键词
            if '提取帧' in line or 'extract' in line.lower():
                task.update(status='extracting', progress=10, message='提取视频帧中...')
            
            elif 'COLMAP' in line:
                task.update(status='colmap', progress=20, message='COLMAP处理中...')
            
            elif '渲染' in line or 'render' in line.lower():
                # 渲染阶段设为 95%，确保比训练结束时高
                task.update(status='rendering', progress=95, message='渲染结果中...')

            else:
                # 2. 尝试解析训练进度
                # 将训练进度(0-100)映射到总进度(30-90)
                prog = estimate_progress(line)
                if prog is not None:
                    # 映射公式: 30 + (prog * 0.6)
                    real_prog = 30 + int(prog * 0.6)
                    real_prog = min(94, real_prog) # 留一点空间给渲染
                    
                    task.update(
                        status='training',
                        progress=real_prog,
                        message=f'训练中... {prog}%'
                    )
        
        process.wait()
        
        if process.returncode == 0:
            # 处理成功
            if access_code:
                # 读取场景信息
                dataset_path = DATASETS_FOLDER / access_code
                scene_info_file = dataset_path / 'scene_info.json'
                
                model_path = None
                if scene_info_file.exists():
                    with open(scene_info_file, 'r', encoding='utf-8') as f:
                        scene_info = json.load(f)
                        model_path = scene_info.get('model_path')
                
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
    """估算训练进度（增强版）"""
    import re
    
    # 策略 1: 匹配精确的迭代次数 (例如: 700/30000)
    # 这通常提供比百分比更"紧缺"（精确）的进度
    iter_match = re.search(r'(\d+)\s*/\s*(\d+)', line)
    if iter_match:
        try:
            current = int(iter_match.group(1))
            total = int(iter_match.group(2))
            # 简单的验证: total 应该比较大，且 current <= total
            # 3DGS 训练通常至少几千次迭代
            if total >= 100:
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


@app.route('/api/task/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """获取任务状态"""
    with tasks_lock:
        task = tasks.get(task_id)
    
    if not task:
        return jsonify({'error': '任务不存在'}), 404
    
    return jsonify(task.to_dict())


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
            return jsonify(codes[access_code])
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
        return jsonify({
            'access_code': access_code,
            'model_path': model_path,
            'download_url': f'/datasets/{access_code}/{model_path}'
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


if __name__ == '__main__':
    print("=" * 60)
    print("3DGS 计算服务器启动")
    print("=" * 60)
    print(f"监听地址: 0.0.0.0:5000")
    print(f"Tailscale IP: 请在Tailscale管理界面查看")
    print("=" * 60)
    
    # 启动服务器
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
