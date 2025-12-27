#!/bin/bash
# Gaussian Splatting 云端上传脚本
# 用于将训练结果上传到云存储，方便手机查看

echo "========================================"
echo "Gaussian Splatting 云端上传工具"
echo "========================================"
echo ""

# 配置
OUTPUT_DIR="$HOME/gaussian-splatting/output"

# 检查 rclone 是否安装
if ! command -v rclone &> /dev/null; then
    echo "✗ 错误：rclone 未安装"
    echo ""
    echo "请先安装 rclone："
    echo "  curl https://rclone.org/install.sh | sudo bash"
    echo ""
    echo "然后配置云存储："
    echo "  rclone config"
    exit 1
fi

# 检查输出目录
if [ ! -d "$OUTPUT_DIR" ]; then
    echo "✗ 错误：输出目录不存在"
    echo "  路径：$OUTPUT_DIR"
    exit 1
fi

# 查找所有模型
echo "正在搜索训练模型..."
models=($(find "$OUTPUT_DIR" -maxdepth 1 -type d ! -path "$OUTPUT_DIR"))

if [ ${#models[@]} -eq 0 ]; then
    echo "✗ 未找到任何训练模型"
    exit 1
fi

echo "✓ 找到 ${#models[@]} 个模型"
echo ""

# 选择模型
if [ ${#models[@]} -eq 1 ]; then
    selected_model="${models[0]}"
    model_name=$(basename "$selected_model")
    echo "自动选择模型：$model_name"
else
    echo "请选择模型："
    for i in "${!models[@]}"; do
        model_name=$(basename "${models[$i]}")
        echo "  [$((i+1))] $model_name"
    done
    echo ""
    read -p "请输入编号 (1-${#models[@]}): " choice
    
    if [ "$choice" -lt 1 ] || [ "$choice" -gt ${#models[@]} ]; then
        echo "✗ 无效的选择"
        exit 1
    fi
    
    selected_model="${models[$((choice-1))]}"
    model_name=$(basename "$selected_model")
fi

echo ""
echo "========================================"
echo "选定模型：$model_name"
echo "========================================"
echo ""

# 查找迭代
point_cloud_dir="$selected_model/point_cloud"

if [ ! -d "$point_cloud_dir" ]; then
    echo "✗ 错误：未找到 point_cloud 目录"
    exit 1
fi

# 查找所有迭代并排序
iterations=($(find "$point_cloud_dir" -maxdepth 1 -type d -name "iteration_*" | sort -t_ -k2 -n -r))

if [ ${#iterations[@]} -eq 0 ]; then
    echo "✗ 未找到任何迭代检查点"
    exit 1
fi

echo "可用的迭代："
for iter in "${iterations[@]}"; do
    iter_name=$(basename "$iter")
    ply_file="$iter/point_cloud.ply"
    if [ -f "$ply_file" ]; then
        size=$(du -h "$ply_file" | cut -f1)
        echo "  - $iter_name (大小: $size)"
    fi
done
echo ""

# 选择最新迭代
latest_iteration="${iterations[0]}"
ply_file="$latest_iteration/point_cloud.ply"

if [ ! -f "$ply_file" ]; then
    echo "✗ 错误：未找到 .ply 文件"
    exit 1
fi

# 文件信息
file_size=$(du -h "$ply_file" | cut -f1)
iter_name=$(basename "$latest_iteration")

echo "========================================"
echo "找到训练结果！"
echo "========================================"
echo "迭代：$iter_name"
echo "文件：point_cloud.ply"
echo "大小：$file_size"
echo ""

# 询问是否压缩
read -p "是否压缩文件以加快上传? (Y/N): " compress

if [ "$compress" = "Y" ] || [ "$compress" = "y" ]; then
    echo "正在压缩..."
    gzip -k "$ply_file"  # -k 保留原文件
    upload_file="${ply_file}.gz"
    compressed_size=$(du -h "$upload_file" | cut -f1)
    echo "✓ 压缩完成"
    echo "  原始大小：$file_size"
    echo "  压缩后：$compressed_size"
else
    upload_file="$ply_file"
fi

echo ""

# 列出可用的云存储
echo "可用的云存储配置："
rclone listremotes

echo ""
read -p "请输入目标云存储名称 (例如: gdrive): " remote_name

if [ -z "$remote_name" ]; then
    echo "✗ 未指定云存储"
    exit 1
fi

# 验证云存储配置
if ! rclone listremotes | grep -q "^${remote_name}:$"; then
    echo "✗ 错误：云存储配置不存在：$remote_name"
    echo ""
    echo "请先配置："
    echo "  rclone config"
    exit 1
fi

# 目标路径
read -p "请输入云端目录路径 (例如: GaussianSplatting/): " cloud_path

if [ -z "$cloud_path" ]; then
    cloud_path="GaussianSplatting/"
fi

# 完整的云端路径
full_cloud_path="${remote_name}:${cloud_path}"

echo ""
echo "========================================"
echo "上传信息"
echo "========================================"
echo "本地文件：$(basename "$upload_file")"
echo "文件大小：$(du -h "$upload_file" | cut -f1)"
echo "目标位置：$full_cloud_path"
echo ""

read -p "确认上传? (Y/N): " confirm

if [ "$confirm" != "Y" ] && [ "$confirm" != "y" ]; then
    echo "上传已取消"
    exit 0
fi

# 开始上传
echo ""
echo "正在上传..."
echo "========================================"

if rclone copy "$upload_file" "$full_cloud_path" --progress; then
    echo ""
    echo "✓ 上传成功！"
    echo ""
    echo "========================================"
    echo "下一步操作"
    echo "========================================"
    echo "1. 在手机上打开云存储 App"
    echo "2. 导航到：$cloud_path"
    echo "3. 下载：$(basename "$upload_file")"
    
    if [ "$compress" = "Y" ] || [ "$compress" = "y" ]; then
        echo "4. 解压 .gz 文件"
        echo "5. 使用查看器打开 .ply 文件"
    else
        echo "4. 使用查看器打开 .ply 文件"
    fi
    
    echo ""
    echo "推荐查看器："
    echo "• SuperSplat (Web): https://playcanvas.com/supersplat/editor"
    echo "• PolyCam (iOS App)"
    echo "• Luma AI (iOS/Android App)"
    echo ""
    
    # 清理压缩文件
    if [ "$compress" = "Y" ] || [ "$compress" = "y" ]; then
        read -p "是否删除本地压缩文件? (Y/N): " cleanup
        if [ "$cleanup" = "Y" ] || [ "$cleanup" = "y" ]; then
            rm "$upload_file"
            echo "✓ 已清理压缩文件"
        fi
    fi
else
    echo ""
    echo "✗ 上传失败"
    exit 1
fi

echo ""
echo "完成！"
