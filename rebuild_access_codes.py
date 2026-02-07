#!/usr/bin/env python3
"""
重建访问码映射文件
Rebuild Access Codes Mapping File

当 .access_codes.json 文件丢失或损坏时，使用此脚本重建映射
"""

import json
from pathlib import Path
from datetime import datetime

def rebuild_access_codes():
    """扫描datasets文件夹并重建访问码映射"""
    datasets_dir = Path('datasets')
    
    if not datasets_dir.exists():
        print("错误: datasets 目录不存在")
        return
    
    codes = {}
    found_count = 0
    
    print("正在扫描 datasets 文件夹...")
    print()
    
    for folder in datasets_dir.iterdir():
        # 跳过非目录和特殊文件
        if not folder.is_dir() or folder.name.startswith('.'):
            continue
        
        # 检查是否是访问码格式（8位字符）
        if len(folder.name) == 8:
            scene_info_file = folder / 'scene_info.json'
            
            # 尝试从 scene_info.json 读取信息
            if scene_info_file.exists():
                try:
                    with open(scene_info_file, 'r', encoding='utf-8') as f:
                        info = json.load(f)
                    
                    codes[folder.name] = {
                        'scene_name': info.get('scene_name', folder.name),
                        'video_path': info.get('video_path', 'N/A'),
                        'dataset_path': str(folder),
                        'created_at': info.get('created_at', datetime.now().isoformat()),
                        'status': 'completed' if info.get('model_path') else 'unknown',
                        'model_path': info.get('model_path', '')
                    }
                    
                    found_count += 1
                    print(f"✓ 找到场景: {folder.name} - {info.get('scene_name', 'N/A')}")
                    
                except Exception as e:
                    print(f"⚠️  读取 {folder.name}/scene_info.json 失败: {e}")
            else:
                # 如果没有 scene_info.json，创建基本条目
                codes[folder.name] = {
                    'scene_name': folder.name,
                    'video_path': 'N/A',
                    'dataset_path': str(folder),
                    'created_at': datetime.fromtimestamp(folder.stat().st_ctime).isoformat(),
                    'status': 'unknown'
                }
                
                found_count += 1
                print(f"⚠️  找到场景（无详细信息）: {folder.name}")
    
    if found_count == 0:
        print("未找到任何场景")
        return
    
    # 保存重建的映射
    access_codes_file = datasets_dir / '.access_codes.json'
    
    with open(access_codes_file, 'w', encoding='utf-8') as f:
        json.dump(codes, f, indent=4, ensure_ascii=False)
    
    print()
    print("=" * 60)
    print(f"✓ 重建完成！")
    print(f"  找到 {found_count} 个场景")
    print(f"  保存到: {access_codes_file}")
    print("=" * 60)


if __name__ == '__main__':
    print("=" * 60)
    print("访问码映射重建工具")
    print("=" * 60)
    print()
    
    rebuild_access_codes()
