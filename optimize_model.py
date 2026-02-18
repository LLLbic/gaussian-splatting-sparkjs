#!/usr/bin/env python3
"""
智能模型优化工具
根据目标设备类型自动选择最佳优化策略

支持的设备类型：
- mobile: 手机端（降采样 + SPZ 压缩）
- desktop: 桌面端（SPZ 压缩）
- auto: 自动选择（推荐）
"""
import sys
import os
from pathlib import Path
import subprocess
import json

def get_file_size_mb(file_path):
    """获取文件大小（MB）"""
    if not file_path.exists():
        return 0
    return file_path.stat().st_size / (1024 * 1024)

def optimize_model(access_code, device='auto', downsample_ratio=None):
    """
    智能优化模型
    
    Args:
        access_code: 访问码
        device: 目标设备类型
            - 'mobile': 手机端优化（降采样 + SPZ）
            - 'desktop': 桌面端优化（SPZ 压缩）
            - 'auto': 自动选择（推荐）
        downsample_ratio: 降采样比例（0.0-1.0），仅用于 mobile，None 则自动选择
    """
    # 配置路径
    # 配置路径: 自动定位到脚本所在目录
    base_dir = Path(__file__).resolve().parent
    
    datasets_folder = base_dir / 'datasets'
    model_dir = datasets_folder / access_code / 'model'
    point_cloud_dir = model_dir / 'point_cloud' / 'iteration_30000'
    original_ply = point_cloud_dir / 'point_cloud.ply'
    
    if not original_ply.exists():
        print(f"❌ 错误: 找不到模型文件 {original_ply}")
        return False
    
    # 分析原始文件
    original_size = get_file_size_mb(original_ply)
    
    print(f"\n{'='*60}")
    print(f"🚀 智能模型优化工具")
    print(f"{'='*60}")
    print(f"访问码: {access_code}")
    print(f"目标设备: {device}")
    print(f"\n📊 原始模型:")
    print(f"   文件: {original_ply.name}")
    print(f"   大小: {original_size:.2f} MB")
    
    # 自动选择设备类型
    if device == 'auto':
        if original_size > 100:
            device = 'mobile'
            print(f"\n💡 文件较大（{original_size:.2f} MB），推荐手机端优化")
        else:
            device = 'desktop'
            print(f"\n💡 文件适中（{original_size:.2f} MB），推荐桌面端优化")
    
    results = {
        'original_size_mb': original_size,
        'device_type': device,
        'optimizations': []
    }
    
    # ==========================================
    # 1. 始终生成：全分辨率 SPZ (桌面端/通用)
    # ==========================================
    print(f"\n{'='*60}")
    print(f"📦 阶段 1: 生成全分辨率 SPZ (桌面端/通用)")
    print(f"{'='*60}")
    print(f"优化方案: SPZ 压缩（保持高质量，无降采样）")
    
    optimized_spz = point_cloud_dir / 'point_cloud_optimized.spz'
    
    cmd = [
        sys.executable,
        str(base_dir / 'convert_ply_to_spz.py'),
        str(original_ply),
        str(optimized_spz)
    ]
    
    result = subprocess.run(cmd)
    
    if result.returncode == 0 and optimized_spz.exists():
        spz_size = get_file_size_mb(optimized_spz)
        results['optimizations'].append({
            'type': 'spz_compression',
            'file': str(optimized_spz),
            'size_mb': spz_size,
            'reduction_percent': ((original_size - spz_size) / original_size * 100)
        })
        print(f"✅ 全分辨率 SPZ 压缩完成: {spz_size:.2f} MB")
    else:
        print(f"❌ 全分辨率 SPZ 压缩失败")

    # ==========================================
    # 2. 按需生成：移动端优化 (降采样 + SPZ)
    # ==========================================
    if device == 'mobile':
        print(f"\n{'='*60}")
        print(f"📱 阶段 2: 手机端优化策略 (降采样)")
        print(f"{'='*60}")
        print(f"优化方案: 降采样 + SPZ 压缩 + LOD")
        
        # 自动选择降采样比例
        if downsample_ratio is None:
            if original_size > 200:
                downsample_ratio = 0.3
            elif original_size > 100:
                downsample_ratio = 0.4
            else:
                downsample_ratio = 0.5
        
        print(f"降采样比例: {downsample_ratio*100:.0f}%")
        
        # 步骤 1: 降采样
        print(f"\n📉 步骤 2.1: 降采样（保留 {downsample_ratio*100:.0f}%）")
        
        mobile_dir = point_cloud_dir.parent / 'iteration_mobile'
        mobile_dir.mkdir(parents=True, exist_ok=True)
        mobile_ply = mobile_dir / 'point_cloud.ply'
        
        cmd = [
            sys.executable,
            str(base_dir / 'downsample_ply.py'),
            str(original_ply),
            str(downsample_ratio),
            str(mobile_ply)
        ]
        
        result = subprocess.run(cmd)
        
        if result.returncode == 0 and mobile_ply.exists():
            mobile_ply_size = get_file_size_mb(mobile_ply)
            results['optimizations'].append({
                'type': 'downsample_ply',
                'file': str(mobile_ply),
                'size_mb': mobile_ply_size,
                'reduction_percent': ((original_size - mobile_ply_size) / original_size * 100)
            })
            print(f"✅ 降采样完成: {mobile_ply_size:.2f} MB")
            
            # 步骤 2: SPZ 压缩降采样版本
            print(f"\n📦 步骤 2.2: SPZ 压缩降采样版本")
            
            mobile_spz = mobile_dir / 'point_cloud.spz'
            
            cmd = [
                sys.executable,
                str(base_dir / 'convert_ply_to_spz.py'),
                str(mobile_ply),
                str(mobile_spz)
            ]
            
            result = subprocess.run(cmd)
            
            if result.returncode == 0 and mobile_spz.exists():
                mobile_spz_size = get_file_size_mb(mobile_spz)
                results['optimizations'].append({
                    'type': 'downsample_spz',
                    'file': str(mobile_spz),
                    'size_mb': mobile_spz_size,
                    'reduction_percent': ((original_size - mobile_spz_size) / original_size * 100)
                })
                print(f"✅ SPZ 压缩完成: {mobile_spz_size:.2f} MB")
            else:
                print(f"⚠️  SPZ 压缩失败，但降采样版本可用")
        else:
            print(f"❌ 降采样失败")
            # 不返回 False，因为全分辨率可能已经成功了
    
    # 更新 scene_info.json
    print(f"\n{'='*60}")
    print(f"📝 更新场景信息")
    print(f"{'='*60}")
    
    scene_info_file = datasets_folder / access_code / 'scene_info.json'
    if scene_info_file.exists():
        with open(scene_info_file, 'r', encoding='utf-8') as f:
            scene_info = json.load(f)
        
        scene_info['optimization'] = results
        scene_info['optimized'] = True
        
        with open(scene_info_file, 'w', encoding='utf-8') as f:
            json.dump(scene_info, f, indent=2, ensure_ascii=False)
        
        print(f"✅ 已更新 scene_info.json")
    
    # 创建优化信息文件
    if device == 'mobile':
        info_file = mobile_dir / 'optimization_info.txt'
    else:
        info_file = point_cloud_dir / 'optimization_info.txt'
    
    with open(info_file, 'w', encoding='utf-8') as f:
        f.write(f"模型优化信息\n")
        f.write(f"{'='*40}\n")
        f.write(f"访问码: {access_code}\n")
        f.write(f"优化时间: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"目标设备: {device}\n")
        if device == 'mobile':
            f.write(f"降采样比例: {downsample_ratio*100:.0f}%\n")
        f.write(f"\n原始文件: {original_size:.2f} MB\n")
        for opt in results['optimizations']:
            f.write(f"{opt['type']}: {opt['size_mb']:.2f} MB\n")
    
    # 总结
    print(f"\n{'='*60}")
    print(f"📊 优化总结")
    print(f"{'='*60}")
    print(f"\n原始文件: {original_size:.2f} MB")
    print(f"目标设备: {device}")
    print(f"\n优化结果:")
    
    for i, opt in enumerate(results['optimizations'], 1):
        opt_type = opt['type'].replace('_', ' ').title()
        print(f"  {i}. {opt_type}: {opt['size_mb']:.2f} MB (减少 {opt['reduction_percent']:.1f}%)")
    
    # 推荐使用
    if device == 'mobile':
        best_opt = min(results['optimizations'], key=lambda x: x['size_mb'])
        print(f"\n💡 手机端将优先使用: {Path(best_opt['file']).parent.name}/{Path(best_opt['file']).name}")
        print(f"   - 文件最小: {best_opt['size_mb']:.2f} MB")
        print(f"   - 加载提升: 预计 {original_size/best_opt['size_mb']:.1f}x")
        print(f"   - 配合 LOD: 动态质量调整")
    else:
        # 查找全分辨率优化版
        best_opt = next((x for x in results['optimizations'] if x['type'] == 'spz_compression'), None)
        if best_opt:
            print(f"\n💡 桌面端将使用: {Path(best_opt['file']).name}")
            print(f"   - 文件大小: {best_opt['size_mb']:.2f} MB")
            print(f"   - 加载提升: 预计 {original_size/best_opt['size_mb']:.1f}x")
            print(f"   - 质量: 无损压缩")
    
    print(f"\n{'='*60}")
    print(f"✅ 优化完成!")
    print(f"{'='*60}")
    
    # 下一步提示
    print(f"\n🎯 下一步:")
    if device == 'mobile':
        print(f"   1. 在手机浏览器中访问前端页面")
        print(f"   2. 输入访问码: {access_code}")
        print(f"   3. 观察加载速度和帧率")
        print(f"   4. 测试 LOD 效果（拉远/拉近相机）")
        print(f"\n💡 预期效果:")
        print(f"   - 加载时间: 3-15 秒")
        print(f"   - 帧率: 30-60 FPS")
        print(f"   - 不发烫、省电")
    else:
        print(f"   1. 在桌面浏览器中访问前端页面")
        print(f"   2. 输入访问码: {access_code}")
        print(f"   3. 享受快速加载和高质量渲染")
        print(f"\n💡 预期效果:")
        print(f"   - 加载时间: 2-5 秒")
        print(f"   - 帧率: 50-60 FPS")
        print(f"   - 高质量渲染")
    
    print()
    return True

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python optimize_model.py <access_code> [device] [downsample_ratio]")
        print("\n参数:")
        print("  access_code       - 访问码（必需）")
        print("  device            - 目标设备类型（可选，默认 auto）")
        print("                      • mobile  - 手机端优化（降采样 + SPZ）")
        print("                      • desktop - 桌面端优化（SPZ 压缩）")
        print("                      • auto    - 自动选择（推荐）")
        print("  downsample_ratio  - 降采样比例，0.0-1.0（可选，仅用于 mobile）")
        print("\n示例:")
        print("  python optimize_model.py KKDWL42P")
        print("  python optimize_model.py KKDWL42P mobile")
        print("  python optimize_model.py KKDWL42P mobile 0.3")
        print("  python optimize_model.py KKDWL42P desktop")
        print("\n推荐降采样比例（mobile）:")
        print("  0.5 - 高端手机（旗舰机）")
        print("  0.4 - 中端手机（推荐）")
        print("  0.3 - 低端手机")
        print("\n设备选择建议:")
        print("  • 文件 > 100 MB → 推荐 mobile")
        print("  • 文件 < 100 MB → 推荐 desktop")
        print("  • 不确定 → 使用 auto（自动选择）")
        sys.exit(1)
    
    access_code = sys.argv[1]
    device = sys.argv[2] if len(sys.argv) > 2 else 'auto'
    ratio = float(sys.argv[3]) if len(sys.argv) > 3 else None
    
    # 验证参数
    if device not in ['mobile', 'desktop', 'auto']:
        print(f"❌ 错误: 设备类型必须是 mobile、desktop 或 auto")
        sys.exit(1)
    
    if ratio is not None and (ratio <= 0 or ratio > 1):
        print("❌ 错误: 降采样比例必须在 0.0-1.0 之间")
        sys.exit(1)
    
    success = optimize_model(access_code, device, ratio)
    sys.exit(0 if success else 1)
