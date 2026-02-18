#!/usr/bin/env python3
"""
将 PLY 模型转换为压缩的 SPZ 格式
使用 nianticlabs/spz 库 (C++ 实现的 Python 绑定)
"""
import sys
import os
from pathlib import Path
import subprocess
import importlib.util

def install_spz():
    """尝试自动安装 nianticlabs/spz"""
    print("⏳ 正在安装 nianticlabs/spz 库 (需要编译 C++，可能需要几分钟)...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "git+https://github.com/nianticlabs/spz.git"])
        print("✅ 安装成功！")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ 安装失败: {e}")
        return False

def check_spz_installed():
    """检查 spz 库是否已安装"""
    if importlib.util.find_spec("spz") is None:
        print("⚠️  检测到未安装 spz 库")
        return install_spz()
    return True

def convert_ply_to_spz(ply_path, spz_path=None):
    """
    使用 spz 库转换 PLY 到 SPZ
    """
    if not check_spz_installed():
        print("❌ 无法继续：缺少 spz 库")
        print("请尝试手动安装: pip install git+https://github.com/nianticlabs/spz.git")
        return False
        
    import spz
    import numpy as np
    
    ply_path = Path(ply_path)
    
    if not ply_path.exists():
        print(f"❌ 错误: 文件不存在 {ply_path}")
        return False
    
    if spz_path is None:
        spz_path = ply_path.with_suffix('.spz')
    else:
        spz_path = Path(spz_path)
    
    print(f"📦 开始转换:")
    print(f"   输入: {ply_path}")
    print(f"   输出: {spz_path}")
    
    # 获取原始文件大小
    original_size = ply_path.stat().st_size / (1024 * 1024)
    print(f"   原始大小: {original_size:.2f} MB")
    
    try:
        print(f"🔄正在加载 PLY 文件...")
        # 加载 PLY
        cloud = spz.load_splat_from_ply(str(ply_path), spz.UnpackOptions())
        
        print(f"   点云数量: {cloud.num_points}")
        print(f"   SH 阶数: {cloud.sh_degree}")
        
        print(f"🔄 正在保存为 SPZ...")
        # 保存为 SPZ
        success = spz.save_spz(cloud, spz.PackOptions(), str(spz_path))
        
        if success and spz_path.exists():
            compressed_size = spz_path.stat().st_size / (1024 * 1024)
            reduction = ((original_size - compressed_size) / original_size * 100)
            
            print(f"\n✅ 转换成功!")
            print(f"   压缩后大小: {compressed_size:.2f} MB")
            print(f"   压缩率: {reduction:.1f}%")
            print(f"   文件: {spz_path}")
            return True
        else:
            print(f"❌ 错误: 保存失败")
            return False
            
    except Exception as e:
        print(f"❌ 转换过程中出错: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python convert_ply_to_spz.py <ply_file> [output_spz_file]")
        sys.exit(1)
    
    ply_file = sys.argv[1]
    spz_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    success = convert_ply_to_spz(ply_file, spz_file)
    sys.exit(0 if success else 1)
