# Gaussian Splatting Web Viewer

现代化的 Three.js Gaussian Splatting 3D 查看器，支持视频上传、自动服务器处理和实时 3D 可视化。

## ✨ 特性

- 🎨 **现代化 UI** - 简约设计，玻璃态效果，流畅动画
- 📤 **视频上传** - 支持 MP4, MOV, AVI 格式，拖放上传
- 🔄 **实时进度** - 自动轮询服务器状态，实时更新进度
- 🎮 **3D 查看器** - 基于 Three.js 的交互式 3D 渲染
- 📱 **响应式设计** - 完美适配桌面和移动设备
- ⚡ **自动处理** - 上传后自动发送到预设服务器

## 🚀 快速开始

### 1. 配置服务器地址

在 `js/config.js` 文件中修改服务器地址：

```javascript
SERVER_IP: 'http://your-server-ip:5000', // 修改为您的实际服务器地址
```

例如：

```javascript
SERVER_IP: 'http://192.168.1.100:5000',
// 或
SERVER_IP: 'https://api.example.com',
```

### 2. 部署前端

```bash
# 本地测试
cd web-viewer
python -m http.server 8080

# 访问
http://localhost:8080
```

### 3. 使用流程

1. 打开网页
2. 拖放或选择视频文件（MP4, MOV, AVI）
3. 自动上传到服务器
4. 实时查看处理进度
5. 自动加载 3D 模型
6. 交互查看结果

## 📁 文件结构

```
web-viewer/
├── index.html              # 主页面
├── css/
│   └── styles.css         # 样式文件
└── js/
    ├── config.js          # 配置文件（修改服务器地址）
    ├── api.js             # API 通信
    ├── viewer.js          # Three.js 查看器
    ├── app.js             # 主应用逻辑
    └── plyloader.js       # PLY 加载器
```

## 🔧 服务器 API 要求

您的服务器需要提供以下 API 端点：

### 1. 上传视频

```http
POST /api/upload
Content-Type: multipart/form-data

Body:
{
  "video": File
}

Response:
{
  "job_id": "string",
  "status": "processing"
}
```

### 2. 查询状态

```http
GET /api/status/:job_id

Response:
{
  "status": "processing" | "completed" | "failed",
  "progress": 0-100,
  "stage": "string",
  "result_url": "string" (when completed)
}
```

### 3. 下载结果

```http
GET /api/download/:job_id

Response: .ply file (binary)
```

## 🎮 查看器控制

- **旋转**: 鼠标左键拖动
- **平移**: 鼠标右键拖动或 Shift + 左键
- **缩放**: 鼠标滚轮
- **重置**: 点击重置按钮
- **全屏**: 点击全屏按钮
- **截图**: 点击相机按钮

## ⚙️ 配置选项

在 `js/config.js` 中可以修改：

```javascript
// 服务器地址（必须配置）
SERVER_IP: 'http://your-server-ip:5000'

// 上传限制
MAX_FILE_SIZE: 2GB
ALLOWED_FORMATS: ['video/mp4', 'video/quicktime', 'video/x-msvideo']

// 轮询间隔
POLLING_INTERVAL: 2000ms (2秒)

// 查看器设置
CAMERA_POSITION: { x: 0, y: 0, z: 5 }
BACKGROUND_COLOR: 0x000000
```

## 🌐 生产部署

### 前端部署

1. 修改 `js/config.js` 中的 `SERVER_IP`
2. 上传所有文件到 Web 服务器
3. 确保服务器支持 CORS
4. 配置 HTTPS（推荐）

### 后端部署

确保后端服务器：

- 监听配置的端口
- 支持 CORS
- 实现了所需的 API 端点

## 🔒 CORS 配置

如果前端和后端在不同域名，需要配置 CORS：

### Python Flask 示例

```python
from flask_cors import CORS
app = Flask(__name__)
CORS(app)
```

### Node.js Express 示例

```javascript
const cors = require("cors");
app.use(cors());
```

## 📝 服务器端实现示例

### Python Flask 完整示例

```python
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import uuid
import os

app = Flask(__name__)
CORS(app)

jobs = {}

@app.route('/api/upload', methods=['POST'])
def upload():
    video = request.files['video']
    job_id = str(uuid.uuid4())

    # 保存视频
    os.makedirs('uploads', exist_ok=True)
    video_path = f'uploads/{job_id}.mp4'
    video.save(video_path)

    # 初始化任务状态
    jobs[job_id] = {
        'status': 'processing',
        'progress': 0,
        'stage': 'Video uploaded'
    }

    # 启动后台处理（这里需要您的 Gaussian Splatting 代码）
    # process_video_async(job_id, video_path)

    return jsonify({'job_id': job_id, 'status': 'processing'})

@app.route('/api/status/<job_id>')
def status(job_id):
    if job_id in jobs:
        return jsonify(jobs[job_id])
    return jsonify({'error': 'Job not found'}), 404

@app.route('/api/download/<job_id>')
def download(job_id):
    ply_path = f'results/{job_id}.ply'
    if os.path.exists(ply_path):
        return send_file(ply_path, mimetype='application/octet-stream')
    return jsonify({'error': 'Result not found'}), 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

## 🐛 故障排除

### 问题：无法上传文件

**解决方案：**

1. 检查 `js/config.js` 中的服务器地址是否正确
2. 确认服务器正在运行
3. 检查网络连接
4. 查看浏览器控制台错误信息

### 问题：CORS 错误

**解决方案：**
在服务器端添加 CORS 头：

```python
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST')
    return response
```

### 问题：3D 模型无法加载

**解决方案：**

1. 确认 .ply 文件格式正确
2. 检查浏览器是否支持 WebGL
3. 更新显卡驱动
4. 尝试其他浏览器

## 📊 浏览器兼容性

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

需要 WebGL 2.0 支持

## 🔗 相关资源

- [Three.js 文档](https://threejs.org/docs/)
- [Gaussian Splatting 论文](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)
- [WebGL 规范](https://www.khronos.org/webgl/)

## 📄 许可证

MIT License

---

**注意**:

- 使用前必须在 `js/config.js` 中配置服务器地址
- 需要配合后端 Gaussian Splatting 处理服务器使用
- 确保服务器已正确配置 CORS
