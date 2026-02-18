#!/usr/bin/env python3
"""
对 PLY 模型进行降采样
用于移动设备优化
"""
import numpy as np
import sys
from pathlib import Path

def downsample_ply(input_path, output_path, ratio=0.5):
    """
    降采样 PLY 文件
    ratio: 保留的点云比例 (0.0-1.0)
    """
    try:
        from plyfile import PlyData, PlyElement
    except ImportError:
        print("❌ 错误: 需要安装 plyfile 库")
        print("请运行: pip install plyfile")
        return False
    
    input_path = Path(input_path)
    output_path = Path(output_path)
    
    if not input_path.exists():
        print(f"❌ 错误: 文件不存在 {input_path}")
        return False
    
    print(f"📊 开始降采样:")
    print(f"   输入: {input_path}")
    print(f"   输出: {output_path}")
    print(f"   保留比例: {ratio*100:.1f}%")
    
    try:
        # 读取 PLY
        print(f"\n🔄 读取 PLY 文件...")
        plydata = PlyData.read(str(input_path))
        vertex = plydata['vertex']
        
        # 随机采样
        num_points = len(vertex)
        num_keep = int(num_points * ratio)
        
        print(f"   原始点数: {num_points:,}")
        print(f"   保留点数: {num_keep:,}")
        
        if num_keep <= 0:
            print(f"❌ 错误: 保留点数太少")
            return False
        
        print(f"\n🔄 进行随机采样...")
        indices = np.random.choice(num_points, num_keep, replace=False)
        indices = np.sort(indices)
        
        # 创建新的顶点数据
        new_vertex = vertex[indices]
        
        # 保存
        print(f"🔄 保存降采样后的文件...")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        new_plydata = PlyData([PlyElement.describe(new_vertex, 'vertex')])
        new_plydata.write(str(output_path))
        
        # 计算文件大小
        original_size = input_path.stat().st_size / (1024 * 1024)
        new_size = output_path.stat().st_size / (1024 * 1024)
        reduction = ((original_size - new_size) / original_size * 100)
        
        print(f"\n✅ 降采样完成!")
        print(f"   原始文件: {original_size:.2f} MB")
        print(f"   新文件: {new_size:.2f} MB")
        print(f"   减少: {reduction:.1f}%")
        print(f"   文件: {output_path}")
        
        return True
        
    except Exception as e:
        print(f"❌ 降采样失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python downsample_ply.py <ply_file> [ratio] [output_file]")
        print("示例: python downsample_ply.py model.ply 0.5")
        print("示例: python downsample_ply.py model.ply 0.3 model_mobile.ply")
        sys.exit(1)
    
    input_file = Path(sys.argv[1])
    ratio = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
    
    if len(sys.argv) > 3:
        output_file = Path(sys.argv[3])
    else:
        output_file = input_file.parent / f"{input_file.stem}_downsampled{input_file.suffix}"
    
    success = downsample_ply(input_file, output_file, ratio)
    sys.exit(0 if success else 1)
