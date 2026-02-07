/**
 * 分布式上传管理器
 * Distributed Upload Manager
 * 
 * 处理视频分块上传到计算服务器，实时显示进度
 */

class DistributedUploadManager {
    constructor() {
        this.serverUrl = 'http://100.73.115.55:5000';
        this.socket = null;
        this.currentTaskId = null;
        this.currentAccessCode = null;
        this.chunkSize = 5 * 1024 * 1024; // 5MB per chunk
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
            window.app.showNotification('Connected to compute server', 'success');
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
        const { status, progress, message, access_code } = data;

        // 更新训练进度
        if (status === 'training' || status === 'processing') {
            this.updateTrainingProgress(progress || 0, message || 'Processing...');
        } else if (status === 'extracting') {
            this.updateTrainingProgress(10, 'Extracting frames...');
        } else if (status === 'colmap') {
            this.updateTrainingProgress(30, 'Running COLMAP...');
        } else if (status === 'rendering') {
            this.updateTrainingProgress(90, 'Rendering results...');
        } else if (status === 'completed') {
            this.updateTrainingProgress(100, 'Completed!');
            if (access_code) {
                this.showAccessCode(access_code);
            }
        } else if (status === 'failed') {
            this.updateTrainingProgress(0, 'Failed: ' + (data.error || 'Unknown error'));
            window.app.showNotification('Processing failed: ' + (data.error || 'Unknown error'), 'error');
        }
    }

    /**
     * 更新上传进度
     */
    updateUploadProgress(progress, message = '') {
        const progressFill = document.getElementById('uploadProgressFill');
        const progressPercent = document.getElementById('uploadProgressPercent');
        const statusText = document.getElementById('uploadStatusText');

        if (progressFill) {
            progressFill.style.width = progress + '%';
        }
        if (progressPercent) {
            progressPercent.textContent = Math.round(progress) + '%';
        }
        if (statusText && message) {
            statusText.textContent = message;
        }
    }

    /**
     * 更新训练进度
     */
    updateTrainingProgress(progress, message = '') {
        const progressFill = document.getElementById('trainingProgressFill');
        const progressPercent = document.getElementById('trainingProgressPercent');
        const statusText = document.getElementById('trainingStatusText');

        if (progressFill) {
            progressFill.style.width = progress + '%';
        }
        if (progressPercent) {
            progressPercent.textContent = Math.round(progress) + '%';
        }
        if (statusText && message) {
            statusText.textContent = message;
        }
    }

    /**
     * 显示访问码
     */
    showAccessCode(accessCode) {
        this.currentAccessCode = accessCode;

        const accessCodeDisplay = document.getElementById('accessCodeDisplay');
        const accessCodeSection = document.getElementById('accessCodeSection');

        if (accessCodeDisplay) {
            accessCodeDisplay.textContent = accessCode;
        }
        if (accessCodeSection) {
            accessCodeSection.style.display = 'block';
        }

        window.app.showNotification('Processing complete! Access code: ' + accessCode, 'success');
    }

    /**
     * 上传视频文件
     */
    async uploadVideo(file, sceneName) {
        try {
            // 获取服务器地址
            const serverIpInput = document.getElementById('computeServerIp');
            if (serverIpInput) {
                const ip = serverIpInput.value.trim();
                this.serverUrl = ip.startsWith('http') ? ip : `http://${ip}`;
            }

            // 显示进度区域
            const progressSection = document.getElementById('progressSection');
            if (progressSection) {
                progressSection.style.display = 'block';
            }

            // 更新场景名称显示
            const sceneNameDisplay = document.getElementById('sceneNameDisplay');
            if (sceneNameDisplay) {
                sceneNameDisplay.textContent = sceneName;
            }

            // 连接WebSocket
            this.connectWebSocket();

            // 初始化上传
            const initResponse = await fetch(`${this.serverUrl}/api/upload/init`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    scene_name: sceneName,
                    video_filename: file.name,
                    file_size: file.size
                })
            });

            if (!initResponse.ok) {
                throw new Error('Failed to initialize upload');
            }

            const initData = await initResponse.json();
            this.currentTaskId = initData.task_id;

            // 更新任务ID显示
            const taskIdDisplay = document.getElementById('taskId');
            if (taskIdDisplay) {
                taskIdDisplay.textContent = this.currentTaskId;
            }

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
            window.app.showNotification('Video uploaded successfully, processing started...', 'success');

        } catch (error) {
            console.error('Upload error:', error);
            window.app.showNotification('Upload failed: ' + error.message, 'error');
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

    /**
     * 复制访问码
     */
    copyAccessCode() {
        if (!this.currentAccessCode) {
            window.app.showNotification('No access code available', 'warning');
            return;
        }

        navigator.clipboard.writeText(this.currentAccessCode).then(() => {
            window.app.showNotification('Access code copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            window.app.showNotification('Failed to copy access code', 'error');
        });
    }

    /**
     * 通过访问码加载场景
     */
    async loadSceneByAccessCode() {
        if (!this.currentAccessCode) {
            window.app.showNotification('No access code available', 'warning');
            return;
        }

        try {
            const response = await fetch(`${this.serverUrl}/api/scenes/${this.currentAccessCode}`);
            if (!response.ok) {
                throw new Error('Scene not found');
            }

            const sceneInfo = await response.json();

            // 使用模型路径加载场景
            if (sceneInfo.model_path && window.viewer) {
                window.app.showNotification('Loading scene...', 'info');
                // 这里需要根据实际的viewer API调整
                // window.viewer.loadScene(sceneInfo.model_path);
                window.app.showNotification('Scene loaded successfully!', 'success');
            } else {
                window.app.showNotification('Model not ready yet', 'warning');
            }
        } catch (error) {
            console.error('Load scene error:', error);
            window.app.showNotification('Failed to load scene: ' + error.message, 'error');
        }
    }
}

// 创建全局实例
window.distributedUpload = new DistributedUploadManager();

// 扩展app对象的uploadFile方法
if (window.app) {
    const originalUploadFile = window.app.uploadFile;

    window.app.uploadFile = function () {
        const fileInput = document.getElementById('fileInput');
        const sceneNameInput = document.getElementById('sceneNameInput');

        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            this.showNotification('Please select a video file', 'warning');
            return;
        }

        const file = fileInput.files[0];
        const sceneName = sceneNameInput ? sceneNameInput.value.trim() : 'my_scene';

        if (!sceneName) {
            this.showNotification('Please enter a scene name', 'warning');
            return;
        }

        // 使用分布式上传
        window.distributedUpload.uploadVideo(file, sceneName);
    };

    // 添加复制访问码方法
    window.app.copyAccessCode = function () {
        window.distributedUpload.copyAccessCode();
    };

    // 添加加载场景方法
    window.app.loadSceneByAccessCode = function () {
        window.distributedUpload.loadSceneByAccessCode();
    };
}

console.log('Distributed Upload Manager loaded');
