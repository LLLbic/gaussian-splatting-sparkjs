#!/bin/bash

# =================================================================
# Gaussian Splatting 全流程自动化处理脚本 (Video -> 3D Scene)
# =================================================================

# 1. 配置参数
VIDEO_PATH="datasets/Ballroom.mp4"         # 视频路径
SCENE_NAME="ballroom_scene"                # 场景名称
FPS=2                                      # 视频抽帧频率 (每秒几帧)
DATASET_PATH="datasets/$SCENE_NAME"        # 数据集存放目录
CONDA_ENV_NAME="gaussian_splatting"        # Conda 环境名称

echo "开始处理视频: $VIDEO_PATH"

# 2. 准备目录结构
echo "正在创建目录..."
mkdir -p "$DATASET_PATH/input"

# 3. 使用 FFmpeg 提取视频帧
echo "正在从视频中提取帧 (FPS=$FPS)..."
ffmpeg -i "$VIDEO_PATH" -qscale:v 1 -qmin 1 -vf "fps=$FPS" "$DATASET_PATH/input/%04d.jpg"

if [ $? -ne 0 ]; then
    echo "错误: FFmpeg 提取帧失败。"
    exit 1
fi

# 4. 激活环境并运行 COLMAP 转换
echo "正在运行 COLMAP 进行相机位姿计算..."
# 注意：在 Windows Git Bash 中运行 python 可能需要使用 winpty 或者直接调用 python.exe
python convert.py -s "$DATASET_PATH"

if [ $? -ne 0 ]; then
    echo "错误: COLMAP 转换失败。"
    exit 1
fi

# 5. 开始训练模型
echo "开始训练 Gaussian Splatting 模型..."
python train.py -s "$DATASET_PATH"

if [ $? -ne 0 ]; then
    echo "错误: 训练过程出错。"
    exit 1
fi

# 6. 训练完成后的提示
echo "================================================================="
echo "处理完成！"
echo "数据集路径: $DATASET_PATH"
echo "训练结果保存在: output/ 目录下的最新文件夹中"
echo ""
echo "你可以运行以下命令查看结果 (替换 <ITERATION> 和 <MODEL_PATH>):"
echo "python render.py -m output/<MODEL_ID> -s $DATASET_PATH"
echo "================================================================="
