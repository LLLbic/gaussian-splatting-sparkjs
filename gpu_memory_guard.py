#!/usr/bin/env python3
"""
GPU 显存保护系统
防止多个程序同时竞争显存导致崩溃

功能：
1. 实时监控 GPU 显存使用情况
2. 当显存不足时自动暂停训练进程
3. 显存恢复后自动恢复训练
4. 优雅降级，避免 OOM 崩溃
"""

import subprocess
import time
import signal
import os
import sys
from pathlib import Path
import psutil
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [GPU Guard] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class GPUMemoryGuard:
    """GPU 显存守护进程"""
    
    def __init__(self, 
                 min_free_memory_mb=6144,      # 最小空闲显存 (6GB)
                 critical_memory_mb=4096,       # 危险阈值 (4GB)
                 check_interval=5,              # 检查间隔（秒）
                 grace_period=30):              # 宽限期（秒）
        """
        参数:
            min_free_memory_mb: 正常运行所需的最小空闲显存
            critical_memory_mb: 低于此值将立即暂停进程
            check_interval: 显存检查间隔
            grace_period: 显存不足后等待多久才暂停（避免误判）
        """
        self.min_free_memory = min_free_memory_mb
        self.critical_memory = critical_memory_mb
        self.check_interval = check_interval
        self.grace_period = grace_period
        
        self.monitored_process = None
        self.is_paused = False
        self.low_memory_start_time = None
        
    def get_gpu_memory_info(self):
        """获取 GPU 显存信息"""
        try:
            result = subprocess.run(
                ['nvidia-smi', '--query-gpu=memory.free,memory.used,memory.total', 
                 '--format=csv,noheader,nounits'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                values = result.stdout.strip().split(',')
                free_mb = int(values[0])
                used_mb = int(values[1])
                total_mb = int(values[2])
                
                return {
                    'free': free_mb,
                    'used': used_mb,
                    'total': total_mb,
                    'usage_percent': (used_mb / total_mb) * 100
                }
        except Exception as e:
            logger.error(f"获取 GPU 信息失败: {e}")
        
        return None
    
    def pause_process(self, pid):
        """暂停进程（发送 SIGSTOP）"""
        try:
            os.kill(pid, signal.SIGSTOP)
            self.is_paused = True
            logger.warning(f"⏸️  进程 {pid} 已暂停（显存不足）")
            return True
        except Exception as e:
            logger.error(f"暂停进程失败: {e}")
            return False
    
    def resume_process(self, pid):
        """恢复进程（发送 SIGCONT）"""
        try:
            os.kill(pid, signal.SIGCONT)
            self.is_paused = False
            logger.info(f"▶️  进程 {pid} 已恢复（显存充足）")
            return True
        except Exception as e:
            logger.error(f"恢复进程失败: {e}")
            return False
    
    def monitor_and_protect(self, target_pid):
        """监控并保护目标进程"""
        logger.info("=" * 60)
        logger.info("GPU 显存保护系统已启动")
        logger.info(f"监控进程 PID: {target_pid}")
        logger.info(f"最小空闲显存: {self.min_free_memory} MB")
        logger.info(f"危险阈值: {self.critical_memory} MB")
        logger.info(f"检查间隔: {self.check_interval} 秒")
        logger.info("=" * 60)
        
        try:
            process = psutil.Process(target_pid)
        except psutil.NoSuchProcess:
            logger.error(f"进程 {target_pid} 不存在")
            return
        
        while True:
            try:
                # 检查进程是否还在运行
                if not process.is_running():
                    logger.info(f"进程 {target_pid} 已结束，退出监控")
                    break
                
                # 获取 GPU 显存信息
                gpu_info = self.get_gpu_memory_info()
                
                if gpu_info is None:
                    logger.warning("无法获取 GPU 信息，跳过本次检查")
                    time.sleep(self.check_interval)
                    continue
                
                free_memory = gpu_info['free']
                
                # 显示当前状态
                status_icon = "✅" if free_memory >= self.min_free_memory else "⚠️"
                logger.info(
                    f"{status_icon} GPU 显存: {free_memory} MB 空闲 / "
                    f"{gpu_info['total']} MB 总量 "
                    f"({gpu_info['usage_percent']:.1f}% 使用中)"
                )
                
                # 判断是否需要暂停
                if free_memory < self.critical_memory:
                    # 危险！立即暂停
                    if not self.is_paused:
                        logger.error(
                            f"🚨 显存严重不足！({free_memory} MB < {self.critical_memory} MB) "
                            f"立即暂停进程"
                        )
                        self.pause_process(target_pid)
                        self.low_memory_start_time = None
                
                elif free_memory < self.min_free_memory:
                    # 显存不足，但还在宽限期内
                    if self.low_memory_start_time is None:
                        self.low_memory_start_time = time.time()
                        logger.warning(
                            f"⚠️  显存不足 ({free_memory} MB < {self.min_free_memory} MB)，"
                            f"宽限期 {self.grace_period} 秒"
                        )
                    else:
                        elapsed = time.time() - self.low_memory_start_time
                        if elapsed >= self.grace_period and not self.is_paused:
                            logger.error(
                                f"🚨 显存持续不足超过 {self.grace_period} 秒，暂停进程"
                            )
                            self.pause_process(target_pid)
                
                else:
                    # 显存充足
                    self.low_memory_start_time = None
                    
                    if self.is_paused:
                        logger.info(f"✅ 显存已恢复 ({free_memory} MB)，恢复进程")
                        self.resume_process(target_pid)
                
                time.sleep(self.check_interval)
                
            except KeyboardInterrupt:
                logger.info("收到中断信号，退出监控")
                if self.is_paused:
                    logger.info("恢复被暂停的进程")
                    self.resume_process(target_pid)
                break
            except Exception as e:
                logger.error(f"监控循环错误: {e}")
                time.sleep(self.check_interval)


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("用法: python gpu_memory_guard.py <进程PID>")
        print("示例: python gpu_memory_guard.py 12345")
        sys.exit(1)
    
    try:
        target_pid = int(sys.argv[1])
    except ValueError:
        print("错误: PID 必须是数字")
        sys.exit(1)
    
    # 创建守护进程
    guard = GPUMemoryGuard(
        min_free_memory_mb=6144,   # 6GB 最小空闲
        critical_memory_mb=4096,    # 4GB 危险阈值
        check_interval=5,           # 每 5 秒检查一次
        grace_period=30             # 30 秒宽限期
    )
    
    # 开始监控
    guard.monitor_and_protect(target_pid)


if __name__ == '__main__':
    main()
