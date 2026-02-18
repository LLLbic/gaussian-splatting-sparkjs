/**
 * 分布式上传管理器
 * Distributed Upload Manager
 * 
 * 处理视频分块上传到计算服务器，实时显示进度
 */

class DistributedUploadManager {
    constructor() {
        // 使用 config.js 中的全局配置
        this.serverUrl = typeof CONFIG !== 'undefined' ? CONFIG.SERVER_IP : '';
        this.socket = null;
        this.currentTaskId = null;
        this.currentAccessCode = null;
        this.chunkSize = (typeof CONFIG !== 'undefined' && CONFIG.UPLOAD) ? CONFIG.UPLOAD.CHUNK_SIZE : 5 * 1024 * 1024;
    }

    /**
     * 初始化WebSocket连接
     */
    connectWebSocket() {
        if (this.socket && this.socket.connected) {
            return;
        }

        // 加载Socket.IO
        if (typeof io === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
            script.onload = () => {
                this._initSocket();
            };
            document.head.appendChild(script);
        } else {
            this._initSocket();
        }
    }

    _initSocket() {
        this.socket = io(this.serverUrl);

        this.socket.on('connect', () => {
            console.log('WebSocket connected');
            window.showNotification('Connected to compute server', 'success');
        });

        this.socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
        });

        this.socket.on('task_update', (data) => {
            console.log('Task update:', data);
            this.handleTaskUpdate(data);
        });
    }

    /**
     * 处理任务更新
     */
    handleTaskUpdate(data) {
        const { status, progress, message, access_code, error } = data;

        console.log('Task update received:', { status, progress, message });

        // 根据状态显示对应的进度和消息
        let displayProgress = progress || 0;
        let displayMessage = message || status;

        // 根据不同阶段设置状态徽章和消息
        const statusBadge = document.getElementById('statusBadge');

        if (status === 'extracting') {
            displayMessage = message || `正在提取视频帧... ${progress}%`;
            if (statusBadge) {
                statusBadge.textContent = 'Extracting Frames';
                statusBadge.className = 'status-badge processing';
            }
        } else if (status === 'colmap') {
            displayMessage = message || `COLMAP 相机重建中... ${progress}%`;
            if (statusBadge) {
                statusBadge.textContent = 'COLMAP Processing';
                statusBadge.className = 'status-badge processing';
            }
        } else if (status === 'training') {
            displayMessage = message || `模型训练中... ${progress}%`;
            if (statusBadge) {
                statusBadge.textContent = 'Training Model';
                statusBadge.className = 'status-badge processing';
            }
        } else if (status === 'rendering') {
            displayMessage = message || `渲染结果中... ${progress}%`;
            if (statusBadge) {
                statusBadge.textContent = 'Rendering';
                statusBadge.className = 'status-badge processing';
            }
        } else if (status === 'queued') {
            // 排队状态
            displayMessage = message || '排队中...';
            if (statusBadge) {
                statusBadge.textContent = 'Queued';
                statusBadge.className = 'status-badge warning';  // 使用警告样式（黄色）
            }
            // 如果有队列位置信息，显示在消息中
            if (data.queue_position && data.queue_position > 0) {
                displayMessage = message || `排队中，前面还有 ${data.queue_position - 1} 个任务...`;
            }
        } else if (status === 'processing') {
            // 通用处理状态
            displayMessage = message || `处理中... ${progress}%`;
            if (statusBadge) {
                statusBadge.textContent = 'Processing';
                statusBadge.className = 'status-badge processing';
            }
        } else if (status === 'completed') {
            displayProgress = 100;
            displayMessage = message || '处理完成！';
            if (statusBadge) {
                statusBadge.textContent = 'Completed';
                statusBadge.className = 'status-badge success';
            }
        } else if (status === 'failed') {
            displayProgress = 0;
            displayMessage = error || message || '处理失败';
            if (statusBadge) {
                statusBadge.textContent = 'Failed';
                statusBadge.className = 'status-badge error';
            }
            window.showNotification('Processing failed: ' + (error || 'Unknown error'), 'error');
        }

        this.updateTrainingProgress(displayProgress, displayMessage);

        if (status === 'completed' && access_code) {
            this.showAccessCode(access_code);
        }
    }

    /**
     * 更新上传进度
     */
    updateUploadProgress(progress, message = '') {
        const progressFill = document.getElementById('uploadProgressFill');
        const progressPercent = document.getElementById('uploadProgressPercent');
        const statusText = document.getElementById('uploadStatusText');

        // 兼容 app.js 的 UI
        const mainProgressFill = document.getElementById('progressFill');
        const mainProgressPercent = document.getElementById('progressPercent');
        const mainStatusText = document.getElementById('statusText');
        const mainStatusBadge = document.getElementById('statusBadge');

        if (progressFill) progressFill.style.width = progress + '%';
        if (progressPercent) progressPercent.textContent = Math.round(progress) + '%';
        if (statusText && message) statusText.textContent = message;

        // 更新主 UI
        if (mainProgressFill) mainProgressFill.style.width = progress + '%';
        if (mainProgressPercent) mainProgressPercent.textContent = Math.round(progress) + '%';
        if (mainStatusText && message) mainStatusText.textContent = message;
        if (mainStatusBadge) {
            mainStatusBadge.textContent = 'Uploading';
            mainStatusBadge.className = 'status-badge processing';
        }
    }

    /**
     * 更新训练进度
     */
    updateTrainingProgress(progress, message = '') {
        const progressFill = document.getElementById('trainingProgressFill');
        const progressPercent = document.getElementById('trainingProgressPercent');
        const statusText = document.getElementById('trainingStatusText');

        // 兼容 app.js 的 UI
        const mainProgressFill = document.getElementById('progressFill');
        const mainProgressPercent = document.getElementById('progressPercent');
        const mainStatusText = document.getElementById('statusText');
        const mainStatusBadge = document.getElementById('statusBadge');

        if (progressFill) progressFill.style.width = progress + '%';
        if (progressPercent) progressPercent.textContent = Math.round(progress) + '%';
        if (statusText && message) statusText.textContent = message;

        // 更新主 UI
        if (mainProgressFill) mainProgressFill.style.width = progress + '%';
        if (mainProgressPercent) mainProgressPercent.textContent = Math.round(progress) + '%';
        if (mainStatusText && message) mainStatusText.textContent = message;
        if (mainStatusBadge) {
            mainStatusBadge.textContent = progress === 100 ? 'Completed' : 'Processing';
            mainStatusBadge.className = progress === 100 ? 'status-badge success' : 'status-badge processing';
        }
    }

    /**
     * 显示访问码
     */
    showAccessCode(accessCode) {
        this.currentAccessCode = accessCode;

        const accessCodeDisplay = document.getElementById('accessCodeDisplay');
        const accessCodeSection = document.getElementById('accessCodeSection');

        // 兼容 app.js UI
        const mainAcSection = document.getElementById('accessCodeSuccess');
        const mainAcSpan = document.getElementById('generatedAccessCode');

        if (accessCodeDisplay) accessCodeDisplay.textContent = accessCode;
        if (accessCodeSection) accessCodeSection.style.display = 'block';

        if (mainAcSpan) mainAcSpan.textContent = accessCode;
        if (mainAcSection) {
            mainAcSection.style.display = 'block';
            mainAcSection.scrollIntoView({ behavior: 'smooth' });
        }

        window.showNotification('Processing complete! Access code: ' + accessCode, 'success');

        // 自动加载结果
        if (window.app && window.app.downloadAndDisplay) {
            setTimeout(() => {
                window.app.downloadAndDisplay(accessCode);
            }, 1000);
        }
    }

    /**
     * 上传视频文件
     */
    async uploadVideo(file, sceneName) {
        try {
            // 显示进度区域 (兼容 app.js)
            if (window.app && window.app.showSection) {
                window.app.showSection('progressSection');
                window.app.hideSection('uploadSection');
            }



            // 连接WebSocket
            this.connectWebSocket();

            // 读取前端设置的 FPS 值
            const fpsInput = document.getElementById('fpsSelect');
            const fps = fpsInput ? parseInt(fpsInput.value) : 10;
            console.log(`DEBUG: Frontend sending FPS to backend: ${fps}`);

            // 初始化上传
            const initResponse = await fetch(`${this.serverUrl}/api/upload/init`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    scene_name: sceneName,
                    video_filename: file.name,
                    file_size: file.size,
                    fps: fps  // 传递 FPS 参数给后端
                })
            });

            if (!initResponse.ok) {
                // 尝试解析后端返回的错误信息
                let errorMessage = 'Failed to initialize upload';
                try {
                    const errorData = await initResponse.json();
                    if (errorData && errorData.error) {
                        errorMessage = errorData.error;
                    }
                } catch (e) {
                    // ignore JSON parse error
                    errorMessage = `Upload failed: ${initResponse.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const initData = await initResponse.json();
            this.currentTaskId = initData.task_id;

            // 更新任务ID显示
            const taskIdDisplay = document.getElementById('taskId');
            const jobIdDisplay = document.getElementById('jobId'); // 兼容 app.js UI
            if (taskIdDisplay) taskIdDisplay.textContent = this.currentTaskId;
            if (jobIdDisplay) jobIdDisplay.textContent = this.currentTaskId;

            // 订阅任务更新
            if (this.socket) {
                this.socket.emit('subscribe_task', { task_id: this.currentTaskId });
            }

            // 分块上传
            await this.uploadFileInChunks(file, this.currentTaskId);

            // 完成上传
            await fetch(`${this.serverUrl}/api/upload/complete/${this.currentTaskId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    total_chunks: Math.ceil(file.size / this.chunkSize)
                })
            });

            this.updateUploadProgress(100, 'Upload complete!');
            window.showNotification('Video uploaded successfully, processing started...', 'success');

        } catch (error) {
            console.error('Upload error:', error);
            window.showNotification('Upload failed: ' + error.message, 'error');

            // 发生错误时，切回上传界面，防止卡在进度条界面
            if (window.app && window.app.showSection) {
                setTimeout(() => {
                    window.app.hideSection('progressSection');
                    window.app.showSection('uploadSection');
                }, 2000); // 延迟2秒让用户看清错误提示
            }

            throw error;
        }
    }

    /**
     * 分块上传文件
     */
    async uploadFileInChunks(file, taskId) {
        const totalChunks = Math.ceil(file.size / this.chunkSize);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.chunkSize;
            const end = Math.min(start + this.chunkSize, file.size);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append('chunk', chunk);
            formData.append('chunk_index', i);
            formData.append('total_chunks', totalChunks);

            const response = await fetch(`${this.serverUrl}/api/upload/chunk/${taskId}`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Failed to upload chunk ${i + 1}`);
            }

            // 更新进度
            const progress = Math.round((i + 1) / totalChunks * 100);
            this.updateUploadProgress(progress, `Uploading... (${i + 1}/${totalChunks} chunks)`);
        }
    }
}

// 创建全局实例并暴露给 window
window.distributedUpload = new DistributedUploadManager();
console.log('Distributed Upload Manager loaded', window.distributedUpload.serverUrl);
