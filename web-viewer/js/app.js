// 主应用逻辑
window.app = {
    currentFile: null,
    currentJobId: null,
    pollingInterval: null,
    uploadedVideos: [], // 存储多个上传的视频

    // 初始化应用
    init() {
        this.setupEventListeners();
        this.setupMusic();
        this.checkUrlParams(); // 检查 URL 参数
    },

    // 检查 URL 参数中的 moduleID
    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const moduleID = urlParams.get('moduleID');
        if (moduleID) {
            console.log('Detected moduleID in URL:', moduleID);
            // 延迟一会等组件加载完
            setTimeout(() => {
                this.downloadAndDisplay(moduleID);
            }, 500);
        }
    },

    // 设置事件监听器
    setupEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');

        // 点击上传区域
        if (uploadArea) {
            uploadArea.addEventListener('click', () => {
                fileInput.click();
            });

            // 拖放
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('drag-over');
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('drag-over');
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('drag-over');

                const file = e.dataTransfer.files[0];
                this.handleFileSelect(file);
            });
        }

        // 文件选择
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileSelect(e.target.files[0]);
            });
        }
    },

    // 设置背景音乐
    setupMusic() {
        const musicToggle = document.getElementById('musicToggle');
        const bgMusic = document.getElementById('bgMusic');
        let isPlaying = false;

        if (!musicToggle || !bgMusic) return;

        // 设置音量
        bgMusic.volume = 0.3;

        // 尝试自动播放（某些浏览器可能会阻止）
        const tryAutoPlay = () => {
            bgMusic.play()
                .then(() => {
                    isPlaying = true;
                    musicToggle.classList.add('playing');
                    musicToggle.classList.remove('muted');
                    console.log('背景音乐自动播放成功');
                })
                .catch(err => {
                    console.log('自动播放被阻止，需要用户交互:', err);
                    // 浏览器阻止了自动播放，等待用户点击
                    musicToggle.classList.add('muted');
                });
        };

        // 页面加载后尝试自动播放
        setTimeout(tryAutoPlay, 500);

        // 如果自动播放失败，在用户首次点击页面时播放
        const startOnInteraction = () => {
            if (!isPlaying) {
                bgMusic.play()
                    .then(() => {
                        isPlaying = true;
                        musicToggle.classList.add('playing');
                        musicToggle.classList.remove('muted');
                        console.log('用户交互后音乐开始播放');
                        // 移除监听器
                        document.removeEventListener('click', startOnInteraction);
                        document.removeEventListener('touchstart', startOnInteraction);
                    })
                    .catch(err => {
                        console.log('播放仍然失败:', err);
                    });
            }
        };

        // 添加用户交互监听
        document.addEventListener('click', startOnInteraction, { once: true });
        document.addEventListener('touchstart', startOnInteraction, { once: true });

        // 点击切换播放/暂停
        musicToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发 startOnInteraction
            if (isPlaying) {
                bgMusic.pause();
                musicToggle.classList.remove('playing');
                musicToggle.classList.add('muted');
                isPlaying = false;
            } else {
                bgMusic.play().catch(err => {
                    console.log('音乐播放失败:', err);
                    showNotification('音乐播放失败，请检查音乐文件', 'error');
                });
                musicToggle.classList.add('playing');
                musicToggle.classList.remove('muted');
                isPlaying = true;
            }
        });
    },

    // 处理文件选择
    handleFileSelect(file) {
        if (!file) return;

        // 验证文件类型
        if (!CONFIG.UPLOAD.ALLOWED_FORMATS.includes(file.type)) {
            showNotification('Invalid file format. Please upload MP4, MOV, or AVI', 'error');
            return;
        }

        // 验证文件大小
        if (file.size > CONFIG.UPLOAD.MAX_FILE_SIZE) {
            showNotification('File too large. Maximum size is 2GB', 'error');
            return;
        }

        this.currentFile = file;

        this.showFilePreview(file);
    },

    // 显示文件预览
    showFilePreview(file) {
        document.getElementById('uploadArea').style.display = 'none';
        document.getElementById('filePreview').style.display = 'block';

        const nameEl = document.getElementById('fileName');
        const sizeEl = document.getElementById('fileSize');
        if (nameEl) nameEl.textContent = file.name;
        if (sizeEl) sizeEl.textContent = this.formatFileSize(file.size);

        // 显示"添加更多视频"按钮
        const addBtn = document.getElementById('addMoreBtn');
        if (addBtn) addBtn.style.display = 'inline-flex';
    },

    // 清除文件
    clearFile() {
        this.currentFile = null;
        document.getElementById('uploadArea').style.display = 'block';
        document.getElementById('filePreview').style.display = 'none';
        document.getElementById('fileInput').value = '';
        const nameInput = document.getElementById('projectNameInput');
        if (nameInput) nameInput.value = '';
    },

    // 上传文件
    async uploadFile() {
        if (!this.currentFile) return;

        // 获取用户输入的项目名称
        const projectNameInput = document.getElementById('projectNameInput');
        const projectName = projectNameInput ? projectNameInput.value.trim() : '';

        if (!projectName) {
            showNotification('Please enter a Project Name', 'error');
            // 高亮输入框
            if (projectNameInput) projectNameInput.focus();
            return;
        }

        // 简单的前端验证 (只允许英文、数字、下划线)
        if (!/^[a-zA-Z0-9_]+$/.test(projectName)) {
            showNotification('Project Name must contain only English letters, numbers, and underscores.', 'error');
            return;
        }

        if (window.distributedUpload) {
            // 使用 DistributedUploadManager
            window.distributedUpload.uploadVideo(this.currentFile, projectName)
                .then(() => {
                    // 成功开始上传后，开始轮询状态以防 Socket 断开
                    this.startPolling(projectName);
                })
                .catch(err => {
                    console.error("Distributed upload failed", err);
                    // 错误提示由 distributed-upload 处理，但也可能需要在这里额外处理
                    // 错误提示由 distributed-upload 处理，但也可能需要在这里额外处理
                    if (err.message && (err.message.includes('exist') || err.message.includes('存在') || err.message.includes('duplicate'))) {
                        alert(err.message); // 弹窗提示重名
                    }
                });
        } else {
            showNotification('Upload manager not loaded', 'error');
        }
    },

    // 检查状态并加载 (Check Status / View Result)
    async checkStatusAndLoad(projectName) {
        if (!projectName) {
            showNotification('Please enter a Project Name', 'error');
            return;
        }

        try {
            showNotification('Checking status...', 'info');
            const res = await fetch(`/api/task/${projectName}`);

            if (res.status === 404) {
                showNotification(`Project "${projectName}" not found.`, 'error');
                return;
            }

            const task = await res.json();

            // 更新当前可能有用的上下文
            this.currentJobId = projectName;

            if (task.status === 'completed') {
                showNotification('Training completed! Loading scene...', 'success');
                this.downloadAndDisplay(projectName);
            } else if (task.status === 'failed') {
                alert(`Project "${projectName}" Failed.\nReason: ${task.error || 'Unknown error'}`);

                // 将界面重置回上传页以便重试
                this.startNew();
            } else {
                // 正在处理中 (queued, processing, uploading)
                // 切换到进度界面
                this.showSection('progressSection');
                this.hideSection('uploadSection');
                this.hideSection('viewerSection');

                const jobIdEl = document.getElementById('jobId');
                if (jobIdEl) jobIdEl.innerText = projectName;
                this.updateStatus(task.status, task.message, task.progress);

                // 开始轮询更新
                this.startPolling(projectName);

                if (task.status === 'queued' && task.queue_position > 0) {
                    showNotification(`In Queue: Position ${task.queue_position}`, 'info');
                }
            }

        } catch (e) {
            console.error(e);
            showNotification('Error checking status: ' + e.message, 'error');
        }
    },

    // 轮询状态
    startPolling(taskId) {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        console.log(`Starting polling for task: ${taskId}`);

        this.pollingInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/task/${taskId}`);
                if (res.ok) {
                    const task = await res.json();
                    this.updateStatus(task.status, task.message, task.progress);

                    if (task.status === 'completed') {
                        clearInterval(this.pollingInterval);
                        showNotification('Training Completed!', 'success');
                        // 可以在这里自动跳转，或者显示"查看结果"按钮
                        // 这里选择直接加载
                        this.downloadAndDisplay(taskId);
                    } else if (task.status === 'failed') {
                        clearInterval(this.pollingInterval);
                        alert(`Task Failed: ${task.error}`);
                        this.updateStatus('Failed', task.error, 0, 'error');
                    }
                }
            } catch (err) {
                console.warn("Polling error:", err);
            }
        }, 3000); // 每3秒轮询一次
    },

    // 下载并显示结果
    async downloadAndDisplay(moduleID = null) {
        try {
            // 如果传入了 moduleID，则使用 it；否则使用当前 job ID
            const targetScene = moduleID || this.currentJobId;

            if (!targetScene) {
                throw new Error("未指定场景 ID (Project Name) 或 Job ID");
            }

            // 停止轮询（如果正在轮询）
            if (this.pollingInterval) clearInterval(this.pollingInterval);

            // 0. 检查是否为预设演示场景
            if (window.viewer && window.viewer.demoScenes && window.viewer.demoScenes[targetScene]) {
                console.log(`Loading preset demo scene: ${targetScene}`);

                this.showSection('viewerSection');
                this.hideSection('progressSection');
                this.hideSection('uploadSection');

                if (!viewer.scene) viewer.init();
                if (typeof viewer.onWindowResize === 'function') {
                    requestAnimationFrame(() => viewer.onWindowResize());
                    setTimeout(() => viewer.onWindowResize(), 650);
                }

                await viewer.loadDemoScene(targetScene);

                if (typeof viewer.onWindowResize === 'function') {
                    requestAnimationFrame(() => viewer.onWindowResize());
                }
                return;
            }
            // 1. 获取动态 URL
            const modelUrl = await api.getModuleModelUrl(targetScene);

            this.showSection('viewerSection');
            this.hideSection('progressSection');
            this.hideSection('uploadSection'); // 确保隐藏上传区域

            // 2. 初始化查看器
            if (!viewer.scene) {
                viewer.init();
            }
            if (typeof viewer.onWindowResize === 'function') {
                requestAnimationFrame(() => viewer.onWindowResize());
                setTimeout(() => viewer.onWindowResize(), 650);
            }

            // 3. 流式加载
            showNotification(`正在流式加载模型 (支持边下边看)...`, 'info');
            await viewer.loadSceneUrl(modelUrl);

            if (typeof viewer.onWindowResize === 'function') {
                requestAnimationFrame(() => viewer.onWindowResize());
            }

            showNotification(`场景 "${targetScene}" 加载成功！`, 'success');

        } catch (error) {
            console.error('Display error:', error);
            showNotification('无法加载 3D 模型: ' + error.message, 'error');
        }
    },

    // 更新状态
    updateStatus(badge, text, progress, type = 'processing') {
        const statusBadge = document.getElementById('statusBadge');
        const statusText = document.getElementById('statusText');
        const progressFill = document.getElementById('progressFill');
        const progressPercent = document.getElementById('progressPercent');

        if (statusBadge) {
            statusBadge.textContent = badge;
            statusBadge.className = 'status-badge ' + type;
        }
        if (statusText) statusText.textContent = text;
        if (progressFill) progressFill.style.width = progress + '%';
        if (progressPercent) progressPercent.textContent = Math.round(progress) + '%';
    },

    // 更新上传进度
    updateProgress(percent) {
        const progressFill = document.getElementById('progressFill');
        const progressPercent = document.getElementById('progressPercent');

        if (progressFill) progressFill.style.width = percent + '%';
        if (progressPercent) progressPercent.textContent = Math.round(percent) + '%';
    },

    // 显示区域（带动画）
    showSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section) return;

        // 先设置为可见但透明
        section.style.display = 'block';
        section.classList.remove('hiding');

        // 使用 requestAnimationFrame 确保动画触发
        requestAnimationFrame(() => {
            section.classList.add('showing');
        });

        // 动画结束后清理类名
        setTimeout(() => {
            section.classList.remove('showing');
        }, 600);
    },

    // 隐藏区域（带动画）
    hideSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section) return;

        section.classList.add('hiding');

        // 等待动画完成后隐藏
        setTimeout(() => {
            section.style.display = 'none';
            section.classList.remove('hiding');
        }, 600);
    },

    // 开始新的上传
    startNew() {
        this.currentFile = null;
        this.currentJobId = null;

        this.hideSection('viewerSection');
        this.hideSection('progressSection');
        this.showSection('uploadSection');

        this.clearFile();

        if (window.viewer && viewer.scene && typeof viewer.clearViewer === 'function') {
            viewer.clearViewer();
        }
    },

    // 添加更多视频
    addMoreVideos() {
        // 将当前文件添加到列表
        if (this.currentFile && !this.uploadedVideos.find(v => v.name === this.currentFile.name)) {
            this.uploadedVideos.push(this.currentFile);
            this.updateVideosList();
        }

        // 重置当前文件并显示上传区域
        this.currentFile = null;
        document.getElementById('uploadArea').style.display = 'block';
        document.getElementById('filePreview').style.display = 'none';
        document.getElementById('fileInput').value = '';
        const addBtn = document.getElementById('addMoreBtn');
        if (addBtn) addBtn.style.display = 'none';
    },

    // 更新已上传视频列表
    updateVideosList() {
        const videosList = document.getElementById('uploadedVideosList');
        const videoItems = document.getElementById('videoItems');
        const videoCount = document.getElementById('videoCount');

        if (this.uploadedVideos.length === 0) {
            if (videosList) videosList.style.display = 'none';
            return;
        }

        if (videosList) videosList.style.display = 'block';
        if (videoCount) videoCount.textContent = this.uploadedVideos.length;

        if (videoItems) {
            videoItems.innerHTML = this.uploadedVideos.map((video, index) => `
                <div class="video-item">
                    <div class="video-item-info">
                        <div class="video-item-icon">🎬</div>
                        <div class="video-item-details">
                            <div class="video-item-name">${video.name}</div>
                            <div class="video-item-size">${this.formatFileSize(video.size)}</div>
                        </div>
                    </div>
                    <button class="video-item-remove" onclick="app.removeVideo(${index})">移除</button>
                </div>
            `).join('');
        }
    },

    // 移除视频
    removeVideo(index) {
        this.uploadedVideos.splice(index, 1);
        this.updateVideosList();
        showNotification('视频已移除', 'info');
    },

    // 格式化文件大小
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
};

let notificationTimeout;

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;

    // 清除之前的定时器
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
    }

    notification.textContent = message;
    notification.className = 'notification ' + type + ' show';

    notificationTimeout = setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Make showNotification global so it can be used by viewer.js
window.showNotification = showNotification;

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app.init();
    });
} else {
    // DOM already loaded, initialize immediately
    app.init();
}
