#!/bin/bash
# 快速启动脚本 - 计算服务器（学校服务器）

echo "=========================================="
echo "3DGS 计算服务器启动脚本"
echo "=========================================="
echo ""

# 检查conda环境
if ! command -v conda &> /dev/null; then
    echo "错误: 未找到conda，请先安装Miniconda或Anaconda"
    exit 1
fi

# 激活环境
echo "激活conda环境..."
source $(conda info --base)/etc/profile.d/conda.sh
conda activate gaussian_splatting

if [ $? -ne 0 ]; then
    echo "错误: 无法激活gaussian_splatting环境"
    echo "请先运行: conda create -n gaussian_splatting python=3.8"
    exit 1
fi

# 检查依赖
echo "检查Python依赖..."
if ! python -c "import flask" 2>/dev/null; then
    echo "安装后端依赖..."
    pip install -r backend_requirements.txt
fi

# 获取Tailscale IP
echo ""
echo "=========================================="
echo "Tailscale VPN 信息"
echo "=========================================="
if command -v tailscale &> /dev/null; then
    # 获取当前设备IP
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null)
    
    if [ -n "$TAILSCALE_IP" ]; then
        # 获取当前设备名称
        DEVICE_NAME=$(tailscale status --self 2>/dev/null | awk '{print $2}')
        
        echo "当前设备:"
        echo "  设备名称: ${DEVICE_NAME:-未知}"
        echo "  Tailscale IP: $TAILSCALE_IP"
        echo "  后端访问地址: http://$TAILSCALE_IP:5000"
        echo ""
        
        # 显示VPN组内所有设备
        echo "VPN组内所有设备:"
        tailscale status 2>/dev/null | grep -v "^#" | while read -r line; do
            if [ -n "$line" ]; then
                # 提取IP和设备名
                device_ip=$(echo "$line" | awk '{print $1}')
                device_name=$(echo "$line" | awk '{print $2}')
                echo "  - $device_name: $device_ip"
            fi
        done
        echo ""
        echo "提示: 前端应配置为: http://$TAILSCALE_IP:5000"
    else
        echo "  警告: Tailscale未连接"
        echo "  请运行: sudo tailscale up"
    fi
else
    echo "  警告: 未安装Tailscale"
    echo "  安装命令: curl -fsSL https://tailscale.com/install.sh | sh"
fi
echo "=========================================="

echo ""
echo "=========================================="
echo "启动后端服务器..."
echo "=========================================="
echo ""

# 启动服务器
python backend_server.py
