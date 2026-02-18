#!/bin/bash
# 3DGS 生产服务器启动脚本 (使用 Gunicorn)

echo "=========================================="
echo "3DGS 生产环境启动 (Gunicorn + Gevent)"
echo "=========================================="

# 检查依赖
if ! pip show gunicorn > /dev/null 2>&1; then
    echo "安装生产环境依赖..."
    pip install -r backend_requirements.txt
fi

# 确保安装 eventlet
if ! pip show eventlet > /dev/null 2>&1; then
    echo "安装 eventlet..."
    pip install eventlet
fi

# 启动 Gunicorn
# -k eventlet: 使用 Eventlet Worker，完美支持 Flask-SocketIO 的 WebSocket 和文件上传
# -w 1: SocketIO 应用在没有 Redis/RabbitMQ 时必须限制为 1 个 worker 进程
# --timeout 600: 为上传大文件和长训练提供足够超时时间
# --bind 0.0.0.0:5000: 监听所有网卡

export FLASK_ENV=production
export PYTHONUNBUFFERED=1

echo "正在启动 Gunicorn (使用 Eventlet worker)..."
exec gunicorn -k eventlet -w 1 --bind 0.0.0.0:5000 --timeout 600 backend_server:app
