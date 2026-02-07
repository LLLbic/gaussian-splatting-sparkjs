#!/usr/bin/env python3
"""
访问码管理工具 - 查询和管理3DGS训练结果
Access Code Manager - Query and manage 3DGS training results

功能 (Features):
1. 列出所有访问码和对应的场景
2. 通过访问码查询场景详情
3. 生成前端查看器加载链接
4. 删除指定访问码的数据

作者: AI Assistant
日期: 2026-02-06
"""

import json
import argparse
from pathlib import Path
from datetime import datetime
import sys

class AccessCodeManager:
    """访问码管理器"""
    
    def __init__(self):
        self.access_codes_file = Path('datasets') / '.access_codes.json'
        self.codes = self._load_codes()
    
    def _load_codes(self):
        """加载访问码映射"""
        if not self.access_codes_file.exists():
            return {}
        
        try:
            with open(self.access_codes_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"错误: 访问码文件格式错误")
            return {}
    
    def _save_codes(self):
        """保存访问码映射"""
        with open(self.access_codes_file, 'w', encoding='utf-8') as f:
            json.dump(self.codes, f, indent=4, ensure_ascii=False)
    
    def list_all(self):
        """列出所有访问码"""
        if not self.codes:
            print("暂无任何训练记录")
            return
        
        print("=" * 80)
        print("所有训练场景")
        print("=" * 80)
        print(f"{'访问码':<12} {'场景名称':<20} {'状态':<15} {'创建时间':<20}")
        print("-" * 80)
        
        for code, info in sorted(self.codes.items(), key=lambda x: x[1].get('created_at', ''), reverse=True):
            scene_name = info.get('scene_name', 'N/A')
            status = info.get('status', 'unknown')
            created_at = info.get('created_at', 'N/A')
            
            # 格式化时间
            if created_at != 'N/A':
                try:
                    dt = datetime.fromisoformat(created_at)
                    created_at = dt.strftime('%Y-%m-%d %H:%M')
                except:
                    pass
            
            # 状态翻译
            status_map = {
                'processing': '处理中',
                'extracting_frames': '提取帧中',
                'running_colmap': 'COLMAP处理中',
                'training': '训练中',
                'rendering': '渲染中',
                'trained': '已训练',
                'completed': '已完成',
                'failed': '失败',
                'training_failed': '训练失败',
                'render_failed': '渲染失败'
            }
            status_cn = status_map.get(status, status)
            
            print(f"{code:<12} {scene_name:<20} {status_cn:<15} {created_at:<20}")
        
        print("=" * 80)
        print(f"总计: {len(self.codes)} 个场景")
        print()
    
    def get_info(self, access_code):
        """获取指定访问码的详细信息"""
        if access_code not in self.codes:
            print(f"错误: 访问码 '{access_code}' 不存在")
            return None
        
        info = self.codes[access_code]
        
        print("=" * 80)
        print(f"场景详情 - 访问码: {access_code}")
        print("=" * 80)
        print(f"场景名称:     {info.get('scene_name', 'N/A')}")
        print(f"视频路径:     {info.get('video_path', 'N/A')}")
        print(f"数据集路径:   {info.get('dataset_path', 'N/A')}")
        print(f"状态:         {info.get('status', 'N/A')}")
        print(f"创建时间:     {info.get('created_at', 'N/A')}")
        
        if 'updated_at' in info:
            print(f"更新时间:     {info['updated_at']}")
        
        if 'model_path' in info:
            print(f"模型路径:     {info['model_path']}")
        
        if 'render_path' in info:
            print(f"渲染路径:     {info['render_path']}")
        
        if 'error' in info:
            print(f"错误信息:     {info['error']}")
        
        print("=" * 80)
        
        # 检查场景信息文件
        dataset_path = Path(info.get('dataset_path', ''))
        scene_info_file = dataset_path / 'scene_info.json'
        
        if scene_info_file.exists():
            print("\n📄 场景详细信息:")
            try:
                with open(scene_info_file, 'r', encoding='utf-8') as f:
                    scene_info = json.load(f)
                    print(json.dumps(scene_info, indent=2, ensure_ascii=False))
            except:
                pass
        
        print()
        return info
    
    def get_viewer_command(self, access_code):
        """生成查看器加载命令"""
        if access_code not in self.codes:
            print(f"错误: 访问码 '{access_code}' 不存在")
            return
        
        info = self.codes[access_code]
        dataset_path = info.get('dataset_path', '')
        model_path = info.get('model_path', '')
        
        print("=" * 80)
        print(f"查看器加载命令 - 访问码: {access_code}")
        print("=" * 80)
        
        if model_path:
            print("\n🎨 使用 SIBR 实时查看器:")
            print(f"   SIBR_gaussianViewer_app -m {model_path}")
            print()
            print("🖼️  渲染图像:")
            print(f"   python render.py -m {model_path} -s {dataset_path}")
            print()
            print("📊 计算指标:")
            print(f"   python metrics.py -m {model_path}")
        else:
            print("\n⚠️  模型尚未训练完成或训练失败")
            print(f"   数据集路径: {dataset_path}")
        
        print("=" * 80)
        print()
    
    def delete_code(self, access_code, remove_files=False):
        """删除指定访问码"""
        if access_code not in self.codes:
            print(f"错误: 访问码 '{access_code}' 不存在")
            return False
        
        info = self.codes[access_code]
        dataset_path = Path(info.get('dataset_path', ''))
        
        # 从映射中删除
        del self.codes[access_code]
        self._save_codes()
        
        print(f"✓ 访问码 '{access_code}' 已从记录中删除")
        
        # 可选：删除文件
        if remove_files and dataset_path.exists():
            import shutil
            try:
                shutil.rmtree(dataset_path)
                print(f"✓ 数据集文件已删除: {dataset_path}")
            except Exception as e:
                print(f"⚠️  删除文件失败: {e}")
        
        return True
    
    def export_json(self, output_file='access_codes_export.json'):
        """导出访问码信息为JSON"""
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(self.codes, f, indent=4, ensure_ascii=False)
        
        print(f"✓ 访问码信息已导出到: {output_file}")


def main():
    parser = argparse.ArgumentParser(
        description='访问码管理工具 - 查询和管理3DGS训练结果',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例用法:

1. 列出所有访问码:
   python access_code_manager.py --list

2. 查询指定访问码的详情:
   python access_code_manager.py --info ABC12345

3. 生成查看器加载命令:
   python access_code_manager.py --viewer ABC12345

4. 删除访问码记录:
   python access_code_manager.py --delete ABC12345

5. 删除访问码及其文件:
   python access_code_manager.py --delete ABC12345 --remove-files

6. 导出所有访问码信息:
   python access_code_manager.py --export
        """
    )
    
    parser.add_argument('--list', '-l', action='store_true', help='列出所有访问码')
    parser.add_argument('--info', '-i', type=str, metavar='CODE', help='查询指定访问码的详情')
    parser.add_argument('--viewer', '-v', type=str, metavar='CODE', help='生成查看器加载命令')
    parser.add_argument('--delete', '-d', type=str, metavar='CODE', help='删除指定访问码')
    parser.add_argument('--remove-files', action='store_true', help='删除访问码时同时删除文件')
    parser.add_argument('--export', '-e', action='store_true', help='导出所有访问码信息')
    parser.add_argument('--output', '-o', type=str, default='access_codes_export.json', help='导出文件名')
    
    args = parser.parse_args()
    
    manager = AccessCodeManager()
    
    # 如果没有提供任何参数，显示列表
    if not any([args.list, args.info, args.viewer, args.delete, args.export]):
        manager.list_all()
        return
    
    if args.list:
        manager.list_all()
    
    if args.info:
        manager.get_info(args.info)
    
    if args.viewer:
        manager.get_viewer_command(args.viewer)
    
    if args.delete:
        confirm = input(f"确认删除访问码 '{args.delete}' 吗? (y/N): ")
        if confirm.lower() == 'y':
            manager.delete_code(args.delete, args.remove_files)
        else:
            print("已取消删除")
    
    if args.export:
        manager.export_json(args.output)


if __name__ == '__main__':
    main()
