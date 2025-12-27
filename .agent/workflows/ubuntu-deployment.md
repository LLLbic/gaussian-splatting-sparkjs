---
description: 在 Ubuntu 系统中部署和运行 Gaussian Splatting 项目
---

# 在 Ubuntu 系统中部署 Gaussian Splatting 项目

本工作流将指导您如何在 Ubuntu 系统上部署 Gaussian Splatting 项目，进行训练计算，并将结果传回 Windows 系统。

## 前置要求

### Ubuntu 系统硬件要求

- CUDA-ready GPU with Compute Capability 7.0+
- 24 GB VRAM（用于论文评估质量的训练）
- 足够的磁盘空间（至少 50GB）

### Ubuntu 系统软件要求

- Ubuntu 22.04（推荐）或 Ubuntu 20.04
- CUDA SDK 11（推荐 11.8，避免使用 11.6）
- C++ 编译器（g++）
- Conda
- Git

## 步骤 1：在 Ubuntu 系统上安装基础依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础开发工具
sudo apt install -y build-essential git wget

# 安装 CUDA（如果尚未安装）
# 请访问 https://developer.nvidia.com/cuda-downloads 下载适合您系统的 CUDA 11.8
# 或使用以下命令安装 CUDA 11.8
wget https://developer.download.nvidia.com/compute/cuda/11.8.0/local_installers/cuda_11.8.0_520.61.05_linux.run
sudo sh cuda_11.8.0_520.61.05_linux.run

# 配置 CUDA 环境变量（添加到 ~/.bashrc）
echo 'export PATH=/usr/local/cuda-11.8/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc
```

## 步骤 2：安装 Conda（如果尚未安装）

```bash
# 下载 Miniconda
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh

# 安装 Miniconda
bash Miniconda3-latest-Linux-x86_64.sh -b -p $HOME/miniconda3

# 初始化 Conda
$HOME/miniconda3/bin/conda init bash
source ~/.bashrc
```

## 步骤 3：从 Windows 传输项目到 Ubuntu

有几种方式可以将项目传输到 Ubuntu 系统：

### 方式 A：使用 Git（推荐）

```bash
# 在 Ubuntu 上克隆仓库
git clone https://github.com/graphdeco-inria/gaussian-splatting --recursive
cd gaussian-splatting
```

### 方式 B：使用 SCP/SFTP

在 Windows 上使用 PowerShell 或 WinSCP：

```powershell
# 使用 SCP 传输整个项目（在 Windows PowerShell 中执行）
scp -r "c:\Users\dingr\source\repos\gaussian-splatting" username@ubuntu-ip:/home/username/
```

### 方式 C：使用共享文件夹（如果使用虚拟机）

如果 Ubuntu 运行在虚拟机中，可以配置共享文件夹。

## 步骤 4：在 Ubuntu 上设置 Python 环境

```bash
# 进入项目目录
cd ~/gaussian-splatting  # 或您的项目路径

# 创建 Conda 环境
conda env create --file environment.yml

# 激活环境
conda activate gaussian_splatting
```

## 步骤 5：编译 CUDA 扩展

```bash
# 确保环境已激活
conda activate gaussian_splatting

# 安装子模块
pip install submodules/diff-gaussian-rasterization
pip install submodules/simple-knn
pip install submodules/fused-ssim
```

## 步骤 6：准备训练数据

### 选项 A：使用预下载的数据集

```bash
# 下载示例数据集（Tanks & Temples + Deep Blending）
wget https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/datasets/input/tandt_db.zip
unzip tandt_db.zip -d ./data/
```

### 选项 B：从 Windows 传输您的数据

```bash
# 在 Windows PowerShell 中执行
scp -r "c:\Users\dingr\your-dataset" username@ubuntu-ip:/home/username/gaussian-splatting/data/
```

数据集应该符合以下结构：

```
<location>
|---images
|   |---<image 0>
|   |---<image 1>
|   |---...
|---sparse
    |---0
        |---cameras.bin
        |---images.bin
        |---points3D.bin
```

## 步骤 7：运行训练

```bash
# 激活环境
conda activate gaussian_splatting

# 基础训练命令
python train.py -s <path to COLMAP or NeRF Synthetic dataset>

# 示例：使用评估模式训练
python train.py -s ./data/your-scene --eval

# 使用更多选项的训练（推荐）
python train.py -s ./data/your-scene \
    --eval \
    --iterations 30000 \
    --save_iterations 7000 30000 \
    --test_iterations 7000 30000 \
    --data_device cpu  # 如果 VRAM 不足，使用 CPU 存储数据
```

### 常用训练参数说明：

- `-s`: 数据集路径
- `--eval`: 使用训练/测试分割
- `--iterations`: 训练迭代次数（默认 30000）
- `--save_iterations`: 保存模型的迭代点
- `--data_device cpu`: 将数据存储在 CPU 以节省 VRAM
- `-r 1`: 使用原始分辨率（默认会自动缩放到 1.6K）

### 内存优化选项（如果 VRAM < 24GB）：

```bash
python train.py -s ./data/your-scene \
    --data_device cpu \
    --densify_grad_threshold 0.0005 \
    --test_iterations -1
```

## 步骤 8：监控训练进度

训练过程中可以：

1. 查看终端输出的损失值
2. 使用 TensorBoard（如果配置）
3. 训练的模型默认保存在 `output/<random>` 目录

## 步骤 9：渲染和评估结果

```bash
# 渲染训练好的模型
python render.py -m <path to trained model>

# 计算评估指标
python metrics.py -m <path to trained model>
```

## 步骤 10：将结果传回 Windows

### 方式 A：使用 SCP（在 Windows PowerShell 中）

```powershell
# 下载整个输出目录
scp -r username@ubuntu-ip:/home/username/gaussian-splatting/output ./output-from-ubuntu

# 或只下载特定模型
scp -r username@ubuntu-ip:/home/username/gaussian-splatting/output/your-model-folder ./
```

### 方式 B：使用 SFTP 客户端

使用 WinSCP、FileZilla 等图形化工具下载：

1. 连接到 Ubuntu 服务器
2. 导航到 `~/gaussian-splatting/output/`
3. 下载需要的模型文件夹

### 方式 C：压缩后传输（推荐用于大文件）

在 Ubuntu 上：

```bash
# 压缩输出结果
cd ~/gaussian-splatting
tar -czf output-results.tar.gz output/

# 然后在 Windows 上下载
# scp username@ubuntu-ip:/home/username/gaussian-splatting/output-results.tar.gz ./
```

## 步骤 11：在 Windows 上查看结果

训练完成后，您可以：

1. **查看渲染图像**：在 `output/<model>/train` 和 `output/<model>/test` 目录中
2. **查看评估指标**：在 `output/<model>/results.json` 文件中
3. **使用实时查看器**（需要在 Windows 上编译 SIBR 查看器）

## 故障排除

### CUDA 版本不匹配

```bash
# 检查 CUDA 版本
nvcc --version
nvidia-smi

# 如果需要，修改 environment.yml 中的 cudatoolkit 版本
```

### 编译错误

```bash
# 确保安装了正确的编译工具
sudo apt install -y build-essential

# 清理并重新安装
pip uninstall diff-gaussian-rasterization simple-knn -y
cd submodules/diff-gaussian-rasterization && rm -rf build && cd ../..
pip install submodules/diff-gaussian-rasterization
pip install submodules/simple-knn
```

### VRAM 不足

```bash
# 使用较小的数据集或降低分辨率
python train.py -s ./data/your-scene -r 4  # 使用 1/4 分辨率

# 或增加密集化阈值
python train.py -s ./data/your-scene --densify_grad_threshold 0.001
```

## 自动化脚本示例

创建一个训练脚本 `train_and_transfer.sh`：

```bash
#!/bin/bash

# 配置
DATASET_PATH="./data/your-scene"
OUTPUT_NAME="my-model-$(date +%Y%m%d-%H%M%S)"
WINDOWS_USER="your-windows-username"
WINDOWS_IP="your-windows-ip"

# 激活环境
source ~/miniconda3/bin/activate gaussian_splatting

# 训练
python train.py -s $DATASET_PATH --eval -m output/$OUTPUT_NAME

# 渲染
python render.py -m output/$OUTPUT_NAME

# 评估
python metrics.py -m output/$OUTPUT_NAME

# 压缩结果
tar -czf ${OUTPUT_NAME}.tar.gz output/$OUTPUT_NAME

# 传输到 Windows（需要配置 SSH 密钥）
scp ${OUTPUT_NAME}.tar.gz ${WINDOWS_USER}@${WINDOWS_IP}:~/Downloads/

echo "训练完成！结果已传输到 Windows"
```

## 性能优化建议

1. **使用加速版本**（可选）：

```bash
pip uninstall diff-gaussian-rasterization -y
cd submodules/diff-gaussian-rasterization
rm -r build
git checkout 3dgs_accel
pip install .
cd ../..

# 训练时使用
python train.py -s ./data/your-scene --optimizer_type sparse_adam
```

2. **使用深度正则化**（可选，提高质量）：
   需要先生成深度图，参考 README 第 519-540 行的说明。

3. **曝光补偿**（适用于手机拍摄的数据）：

```bash
python train.py -s ./data/your-scene \
    --exposure_lr_init 0.001 \
    --exposure_lr_final 0.0001 \
    --exposure_lr_delay_steps 5000 \
    --exposure_lr_delay_mult 0.001 \
    --train_test_exp
```

## 总结

完整的工作流程：

1. Ubuntu 系统准备（CUDA、Conda、Git）
2. 传输项目代码到 Ubuntu
3. 设置 Python 环境和编译扩展
4. 传输或准备训练数据
5. 运行训练
6. 渲染和评估
7. 将结果传回 Windows
8. 在 Windows 上查看和分析结果
