#!/usr/bin/env python3
"""
自动化视频处理脚本 - 3D Gaussian Splatting 训练流程
Automated Video Processing Script for 3D Gaussian Splatting Training

功能 (Features):
1. 从视频中提取帧 (Extract frames from video)
2. 运行 COLMAP 进行相机位姿估计 (Run COLMAP for camera pose estimation)
3. 可选：生成深度图 (Optional: Generate depth maps)
4. 自动训练 3DGS 模型 (Automatically train 3DGS model)
5. 可选：渲染结果 (Optional: Render results)

作者: AI Assistant
日期: 2026-02-06
"""

import os
import sys
import subprocess
import argparse
import json
import shutil
from pathlib import Path
from datetime import datetime
import logging
import secrets
import string

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('video_processing.log', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class VideoTo3DGS:
    """视频到3DGS模型的自动化处理类"""
    
    def __init__(self, config):
        self.config = config
        self.video_path = Path(config['video_path'])
        self.scene_name = config.get('scene_name', self.video_path.stem)
        
        # 生成唯一的访问码
        self.access_code = self._generate_access_code()
        
        # 使用访问码作为主文件夹名
        self.output_base = Path(config.get('output_base', 'datasets'))
        self.dataset_path = self.output_base / self.access_code
        
        # 创建必要的目录
        self.input_dir = self.dataset_path / 'input'
        self.input_dir.mkdir(parents=True, exist_ok=True)
        
        # 保存场景元数据
        self.metadata = {
            'access_code': self.access_code,
            'scene_name': self.scene_name,
            'video_path': str(self.video_path),
            'created_at': datetime.now().isoformat(),
            'status': 'initializing'
        }
        
        logger.info("=" * 60)
        logger.info(f"🎯 访问码: {self.access_code}")
        logger.info(f"📁 场景名称: {self.scene_name}")
        logger.info(f"📂 数据集路径: {self.dataset_path}")
        logger.info("=" * 60)
        
        # 保存访问码映射
        self._save_access_code_mapping()
    
    def _generate_access_code(self):
        """生成8位唯一访问码"""
        # 使用大写字母和数字，避免混淆的字符（如 0/O, 1/I/l）
        chars = string.ascii_uppercase.replace('O', '').replace('I', '') + string.digits.replace('0', '').replace('1', '')
        
        # 生成8位随机码
        access_code = ''.join(secrets.choice(chars) for _ in range(8))
        
        # 确保访问码唯一（检查是否已存在）
        access_codes_file = Path('datasets') / '.access_codes.json'
        if access_codes_file.exists():
            with open(access_codes_file, 'r', encoding='utf-8') as f:
                existing_codes = json.load(f)
                # 如果访问码已存在，递归生成新的
                if access_code in existing_codes:
                    return self._generate_access_code()
        
        return access_code
    
    def _save_access_code_mapping(self):
        """保存访问码到场景的映射"""
        access_codes_file = Path('datasets') / '.access_codes.json'
        
        # 读取现有映射
        if access_codes_file.exists():
            with open(access_codes_file, 'r', encoding='utf-8') as f:
                mappings = json.load(f)
        else:
            mappings = {}
        
        # 添加新映射
        mappings[self.access_code] = {
            'scene_name': self.scene_name,
            'video_path': str(self.video_path),
            'dataset_path': str(self.dataset_path),
            'created_at': self.metadata['created_at'],
            'status': 'processing'
        }
        
        # 保存映射
        access_codes_file.parent.mkdir(exist_ok=True)
        with open(access_codes_file, 'w', encoding='utf-8') as f:
            json.dump(mappings, f, indent=4, ensure_ascii=False)
        
        logger.info(f"✓ 访问码已保存: {self.access_code}")
    
    def _update_status(self, status, **kwargs):
        """更新访问码状态"""
        access_codes_file = Path('datasets') / '.access_codes.json'
        
        if access_codes_file.exists():
            with open(access_codes_file, 'r', encoding='utf-8') as f:
                mappings = json.load(f)
            
            if self.access_code in mappings:
                mappings[self.access_code]['status'] = status
                mappings[self.access_code]['updated_at'] = datetime.now().isoformat()
                
                # 添加额外信息
                for key, value in kwargs.items():
                    mappings[self.access_code][key] = value
                
                with open(access_codes_file, 'w', encoding='utf-8') as f:
                    json.dump(mappings, f, indent=4, ensure_ascii=False)

    
    def check_dependencies(self):
        """检查必要的依赖是否安装"""
        logger.info("检查依赖...")
        
        dependencies = {
            'ffmpeg': 'FFmpeg (视频处理)',
            'colmap': 'COLMAP (相机位姿估计)',
        }
        
        missing = []
        for cmd, desc in dependencies.items():
            if not self._command_exists(cmd):
                missing.append(f"{cmd} ({desc})")
        
        if missing:
            logger.error(f"缺少以下依赖: {', '.join(missing)}")
            logger.error("请安装缺失的依赖后重试")
            return False
        
        logger.info("✓ 所有依赖检查通过")
        return True
    
    def _command_exists(self, command):
        """检查命令是否存在"""
        try:
            subprocess.run(
                [command, '--version'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False
            )
            return True
        except FileNotFoundError:
            return False
    
    def extract_frames(self):
        """从视频中提取帧"""
        logger.info("=" * 60)
        logger.info("步骤 1: 从视频中提取帧")
        logger.info("=" * 60)
        
        if not self.video_path.exists():
            logger.error(f"视频文件不存在: {self.video_path}")
            return False
        
        fps = self.config.get('fps', 2)
        quality = self.config.get('quality', 1)  # 1 = 最高质量
        
        output_pattern = str(self.input_dir / '%04d.jpg')
        
        cmd = [
            'ffmpeg',
            '-i', str(self.video_path),
            '-qscale:v', str(quality),
            '-qmin', '1',
            '-vf', f'fps={fps}',
            output_pattern,
            '-y'  # 覆盖已存在的文件
        ]
        
        logger.info(f"提取帧率: {fps} FPS")
        logger.info(f"输出目录: {self.input_dir}")
        logger.info(f"执行命令: {' '.join(cmd)}")
        
        try:
            result = subprocess.run(
                cmd,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # 统计提取的帧数
            frame_count = len(list(self.input_dir.glob('*.jpg')))
            logger.info(f"✓ 成功提取 {frame_count} 帧")
            
            if frame_count == 0:
                logger.error("未提取到任何帧，请检查视频文件")
                return False
            
            return True
            
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg 提取帧失败: {e}")
            logger.error(f"错误输出: {e.stderr}")
            return False
    
    def run_colmap(self):
        """运行 COLMAP 进行相机位姿估计"""
        logger.info("=" * 60)
        logger.info("步骤 2: 运行 COLMAP 进行相机位姿估计")
        logger.info("=" * 60)
        
        # 使用项目中的 convert.py 脚本
        convert_script = Path(__file__).parent / 'convert.py'
        
        if not convert_script.exists():
            logger.error(f"convert.py 脚本不存在: {convert_script}")
            return False
        
        cmd = [
            sys.executable,  # 使用当前 Python 解释器
            str(convert_script),
            '-s', str(self.dataset_path)
        ]
        
        # 添加可选参数
        if self.config.get('no_gpu', False):
            cmd.append('--no_gpu')
        
        if self.config.get('resize', False):
            cmd.append('--resize')
        
        if self.config.get('colmap_executable'):
            cmd.extend(['--colmap_executable', self.config['colmap_executable']])
        
        logger.info(f"执行命令: {' '.join(cmd)}")
        
        try:
            result = subprocess.run(
                cmd,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True
            )
            
            logger.info(result.stdout)
            logger.info("✓ COLMAP 处理完成")
            
            # 验证输出
            sparse_dir = self.dataset_path / 'sparse' / '0'
            required_files = ['cameras.bin', 'images.bin', 'points3D.bin']
            
            for file in required_files:
                if not (sparse_dir / file).exists():
                    logger.error(f"COLMAP 输出文件缺失: {file}")
                    return False
            
            logger.info("✓ COLMAP 输出验证通过")
            return True
            
        except subprocess.CalledProcessError as e:
            logger.error(f"COLMAP 处理失败: {e}")
            logger.error(f"输出: {e.stdout}")
            return False
    
    def generate_depth_maps(self):
        """生成深度图（可选）"""
        if not self.config.get('generate_depth', False):
            logger.info("跳过深度图生成（未启用）")
            return True
        
        logger.info("=" * 60)
        logger.info("步骤 3: 生成深度图")
        logger.info("=" * 60)
        
        depth_anything_path = self.config.get('depth_anything_path')
        
        if not depth_anything_path or not Path(depth_anything_path).exists():
            logger.warning("Depth-Anything-V2 路径未配置或不存在，跳过深度图生成")
            logger.info("提示: 下载 Depth-Anything-V2 以启用深度正则化")
            return True
        
        depth_output = self.dataset_path / 'depths'
        depth_output.mkdir(exist_ok=True)
        
        images_dir = self.dataset_path / 'images'
        
        cmd = [
            sys.executable,
            str(Path(depth_anything_path) / 'run.py'),
            '--encoder', 'vitl',
            '--pred-only',
            '--grayscale',
            '--img-path', str(images_dir),
            '--outdir', str(depth_output)
        ]
        
        logger.info(f"执行命令: {' '.join(cmd)}")
        
        try:
            subprocess.run(cmd, check=True)
            logger.info("✓ 深度图生成完成")
            
            # 生成 depth_params.json
            self._generate_depth_params()
            
            return True
            
        except subprocess.CalledProcessError as e:
            logger.error(f"深度图生成失败: {e}")
            return False
    
    def _generate_depth_params(self):
        """生成深度参数文件"""
        depth_scale_script = Path(__file__).parent / 'utils' / 'make_depth_scale.py'
        
        if not depth_scale_script.exists():
            logger.warning("make_depth_scale.py 不存在，跳过深度参数生成")
            return
        
        cmd = [
            sys.executable,
            str(depth_scale_script),
            '--base_dir', str(self.dataset_path),
            '--depths_dir', str(self.dataset_path / 'depths')
        ]
        
        try:
            subprocess.run(cmd, check=True)
            logger.info("✓ 深度参数文件生成完成")
        except subprocess.CalledProcessError as e:
            logger.error(f"深度参数生成失败: {e}")
    
    def train_model(self):
        """训练 3DGS 模型"""
        logger.info("=" * 60)
        logger.info("步骤 4: 训练 3D Gaussian Splatting 模型")
        logger.info("=" * 60)
        
        train_script = Path(__file__).parent / 'train.py'
        
        if not train_script.exists():
            logger.error(f"train.py 脚本不存在: {train_script}")
            return False
        
        cmd = [
            sys.executable,
            str(train_script),
            '-s', str(self.dataset_path)
        ]
        
        # 添加训练参数
        train_config = self.config.get('training', {})
        
        if train_config.get('iterations'):
            cmd.extend(['--iterations', str(train_config['iterations'])])
        
        if train_config.get('eval', False):
            cmd.append('--eval')
        
        if train_config.get('resolution'):
            cmd.extend(['-r', str(train_config['resolution'])])
        
        if train_config.get('optimizer_type'):
            cmd.extend(['--optimizer_type', train_config['optimizer_type']])
        
        if train_config.get('antialiasing', False):
            cmd.append('--antialiasing')
        
        # 深度正则化
        if self.config.get('generate_depth', False):
            depth_dir = self.dataset_path / 'depths'
            if depth_dir.exists():
                cmd.extend(['-d', str(depth_dir)])
                logger.info("启用深度正则化")
        
        # 曝光补偿
        if train_config.get('exposure_compensation', False):
            cmd.extend([
                '--exposure_lr_init', '0.001',
                '--exposure_lr_final', '0.0001',
                '--exposure_lr_delay_steps', '5000',
                '--exposure_lr_delay_mult', '0.001',
                '--train_test_exp'
            ])
            logger.info("启用曝光补偿")
        
        # 自定义模型输出路径
        if train_config.get('model_path'):
            cmd.extend(['-m', train_config['model_path']])
        
        logger.info(f"执行命令: {' '.join(cmd)}")
        logger.info("训练开始，这可能需要较长时间...")
        
        try:
            # 实时输出训练日志
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            
            for line in process.stdout:
                print(line, end='')
                logger.info(line.rstrip())
            
            process.wait()
            
            if process.returncode == 0:
                logger.info("✓ 模型训练完成")
                return True
            else:
                logger.error(f"训练失败，退出码: {process.returncode}")
                return False
                
        except Exception as e:
            logger.error(f"训练过程出错: {e}")
            return False
    
    def _find_latest_model(self):
        """查找最新的训练模型"""
        output_dir = Path('output')
        if not output_dir.exists():
            return None
        
        model_dirs = sorted(output_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True)
        return model_dirs[0] if model_dirs else None
    
    def render_results(self):
        """渲染训练结果（可选）"""
        if not self.config.get('render', False):
            logger.info("跳过渲染步骤（未启用）")
            return True
        
        logger.info("=" * 60)
        logger.info("步骤 5: 渲染训练结果")
        logger.info("=" * 60)
        
        render_script = Path(__file__).parent / 'render.py'
        
        if not render_script.exists():
            logger.error(f"render.py 脚本不存在: {render_script}")
            return False
        
        # 使用已保存的模型路径或查找最新的
        model_path = getattr(self, 'model_path', None) or self._find_latest_model()
        
        if not model_path:
            logger.error("未找到训练好的模型")
            return False
        
        logger.info(f"使用模型: {model_path}")
        
        cmd = [
            sys.executable,
            str(render_script),
            '-m', str(model_path),
            '-s', str(self.dataset_path)
        ]
        
        logger.info(f"执行命令: {' '.join(cmd)}")
        
        # 更新状态为渲染中
        self._update_status('rendering')
        
        try:
            subprocess.run(cmd, check=True)
            logger.info("✓ 渲染完成")
            logger.info(f"渲染结果保存在: {model_path}")
            
            # 更新状态和渲染路径
            render_output = model_path / 'renders'
            self._update_status('completed', render_path=str(render_output))
            
            return True
            
        except subprocess.CalledProcessError as e:
            logger.error(f"渲染失败: {e}")
            self._update_status('render_failed')
            return False
    
    def run_pipeline(self):
        """运行完整的处理流程"""
        logger.info("=" * 60)
        logger.info("3D Gaussian Splatting 自动化处理流程")
        logger.info("=" * 60)
        logger.info(f"视频: {self.video_path}")
        logger.info(f"场景名称: {self.scene_name}")
        logger.info(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info("=" * 60)
        
        # 检查依赖
        if not self.check_dependencies():
            self._update_status('failed', error='依赖检查失败')
            return False
        
        # 步骤 1: 提取帧
        self._update_status('extracting_frames')
        if not self.extract_frames():
            logger.error("提取帧失败，流程终止")
            self._update_status('failed', error='提取帧失败')
            return False
        
        # 步骤 2: COLMAP
        self._update_status('running_colmap')
        if not self.run_colmap():
            logger.error("COLMAP 处理失败，流程终止")
            self._update_status('failed', error='COLMAP处理失败')
            return False
        
        # 步骤 3: 深度图（可选）
        if not self.generate_depth_maps():
            logger.warning("深度图生成失败，继续执行")
        
        # 步骤 4: 训练模型
        if not self.train_model():
            logger.error("模型训练失败，流程终止")
            return False
        
        # 步骤 5: 渲染结果（可选）
        if not self.render_results():
            logger.warning("渲染失败，但训练已完成")
            # 如果没有渲染，至少标记为已训练
            self._update_status('trained')
        
        # 保存完成信息到数据集文件夹
        self._save_completion_info()
        
        logger.info("=" * 60)
        logger.info("✓ 所有步骤完成！")
        logger.info("=" * 60)
        logger.info(f"🎯 访问码: {self.access_code}")
        logger.info(f"📁 场景名称: {self.scene_name}")
        logger.info(f"📂 数据集位置: {self.dataset_path}")
        if hasattr(self, 'model_path'):
            logger.info(f"🎨 模型位置: {self.model_path}")
        logger.info(f"⏰ 结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info("=" * 60)
        logger.info("")
        logger.info("💡 使用访问码查看结果:")
        logger.info(f"   访问码: {self.access_code}")
        logger.info(f"   数据路径: {self.dataset_path}")
        logger.info("")
        logger.info("📝 访问码已保存到: datasets/.access_codes.json")
        logger.info("=" * 60)
        
        return True
    
    def _save_completion_info(self):
        """保存完成信息到数据集文件夹"""
        info_file = self.dataset_path / 'scene_info.json'
        
        info = {
            'access_code': self.access_code,
            'scene_name': self.scene_name,
            'video_path': str(self.video_path),
            'dataset_path': str(self.dataset_path),
            'created_at': self.metadata['created_at'],
            'completed_at': datetime.now().isoformat(),
            'model_path': str(self.model_path) if hasattr(self, 'model_path') else None
        }
        
        with open(info_file, 'w', encoding='utf-8') as f:
            json.dump(info, f, indent=4, ensure_ascii=False)
        
        logger.info(f"✓ 场景信息已保存: {info_file}")


def load_config(config_file):
    """从 JSON 配置文件加载配置"""
    if not Path(config_file).exists():
        logger.error(f"配置文件不存在: {config_file}")
        return None
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"配置文件格式错误: {e}")
        return None


def create_default_config(output_file='config_template.json'):
    """创建默认配置文件模板"""
    default_config = {
        "video_path": "datasets/example_video.mp4",
        "scene_name": "my_scene",
        "output_base": "datasets",
        "fps": 2,
        "quality": 1,
        "no_gpu": False,
        "resize": False,
        "colmap_executable": "",
        "generate_depth": False,
        "depth_anything_path": "",
        "render": True,
        "training": {
            "iterations": 30000,
            "eval": False,
            "resolution": 1,
            "optimizer_type": "default",
            "antialiasing": False,
            "exposure_compensation": False,
            "model_path": ""
        }
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(default_config, f, indent=4, ensure_ascii=False)
    
    logger.info(f"默认配置文件已创建: {output_file}")
    return default_config


def main():
    parser = argparse.ArgumentParser(
        description='自动化视频处理脚本 - 3D Gaussian Splatting 训练流程',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例用法:

1. 使用配置文件:
   python auto_video_to_3dgs.py --config config.json

2. 快速模式（命令行参数）:
   python auto_video_to_3dgs.py --video datasets/my_video.mp4 --scene my_scene --fps 2

3. 生成配置文件模板:
   python auto_video_to_3dgs.py --create-config

4. 完整示例（启用所有功能）:
   python auto_video_to_3dgs.py --video datasets/video.mp4 --scene room --fps 3 \\
       --generate-depth --render --iterations 30000 --antialiasing
        """
    )
    
    parser.add_argument('--config', type=str, help='配置文件路径 (JSON 格式)')
    parser.add_argument('--create-config', action='store_true', help='创建配置文件模板')
    
    # 基本参数
    parser.add_argument('--video', type=str, help='视频文件路径')
    parser.add_argument('--scene', type=str, help='场景名称')
    parser.add_argument('--output-base', type=str, default='datasets', help='输出基础目录')
    
    # 视频处理参数
    parser.add_argument('--fps', type=int, default=2, help='提取帧率 (默认: 2)')
    parser.add_argument('--quality', type=int, default=1, help='图像质量 (1-31, 1最高)')
    
    # COLMAP 参数
    parser.add_argument('--no-gpu', action='store_true', help='COLMAP 不使用 GPU')
    parser.add_argument('--resize', action='store_true', help='生成多分辨率图像')
    parser.add_argument('--colmap-executable', type=str, help='COLMAP 可执行文件路径')
    
    # 深度图参数
    parser.add_argument('--generate-depth', action='store_true', help='生成深度图')
    parser.add_argument('--depth-anything-path', type=str, help='Depth-Anything-V2 路径')
    
    # 训练参数
    parser.add_argument('--iterations', type=int, default=30000, help='训练迭代次数')
    parser.add_argument('--eval', action='store_true', help='使用训练/测试分割')
    parser.add_argument('--resolution', type=int, default=1, help='图像分辨率')
    parser.add_argument('--optimizer-type', type=str, choices=['default', 'sparse_adam'], 
                       default='default', help='优化器类型')
    parser.add_argument('--antialiasing', action='store_true', help='启用抗锯齿')
    parser.add_argument('--exposure-compensation', action='store_true', help='启用曝光补偿')
    
    # 其他参数
    parser.add_argument('--render', action='store_true', help='训练后渲染结果')
    
    args = parser.parse_args()
    
    # 创建配置文件模板
    if args.create_config:
        create_default_config()
        return
    
    # 加载配置
    if args.config:
        config = load_config(args.config)
        if config is None:
            sys.exit(1)
    else:
        # 从命令行参数构建配置
        if not args.video:
            parser.print_help()
            logger.error("\n错误: 必须提供 --video 参数或 --config 参数")
            sys.exit(1)
        
        config = {
            'video_path': args.video,
            'scene_name': args.scene or Path(args.video).stem,
            'output_base': args.output_base,
            'fps': args.fps,
            'quality': args.quality,
            'no_gpu': args.no_gpu,
            'resize': args.resize,
            'colmap_executable': args.colmap_executable or '',
            'generate_depth': args.generate_depth,
            'depth_anything_path': args.depth_anything_path or '',
            'render': args.render,
            'training': {
                'iterations': args.iterations,
                'eval': args.eval,
                'resolution': args.resolution,
                'optimizer_type': args.optimizer_type,
                'antialiasing': args.antialiasing,
                'exposure_compensation': args.exposure_compensation,
                'model_path': ''
            }
        }
    
    # 运行处理流程
    processor = VideoTo3DGS(config)
    success = processor.run_pipeline()
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
