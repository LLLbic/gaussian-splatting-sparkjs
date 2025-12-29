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
        this.setupNavigation();
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
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });
        
        // 文件选择
        fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0]);
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
        musicToggle.addEventListener('click', () => {
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
    
    // 设置导航箭头
    setupNavigation() {
        const navArrow = document.getElementById('navArrow');
        const backButton = document.getElementById('backButton');
        
        // 导航箭头 - 前往查看器
        if (navArrow) {
            navArrow.addEventListener('click', () => {
                // 切换到查看器界面
                this.hideSection('uploadSection');
                this.hideSection('progressSection');
                this.showSection('viewerSection');
                
                // 隐藏导航箭头，显示返回按钮
                navArrow.style.display = 'none';
                if (backButton) backButton.style.display = 'flex';
                
                // 如果查看器还未初始化，初始化它
                if (!viewer.scene) {
                    viewer.init();
                }
            });
        }
        
        // 返回按钮 - 返回首页
        if (backButton) {
            backButton.addEventListener('click', () => {
                // 返回上传界面
                this.hideSection('viewerSection');
                this.hideSection('progressSection');
                this.showSection('uploadSection');
                
                // 显示导航箭头，隐藏返回按钮
                if (navArrow) navArrow.style.display = 'flex';
                backButton.style.display = 'none';
            });
        }
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
        
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = this.formatFileSize(file.size);
        
        // 显示"添加更多视频"按钮
        document.getElementById('addMoreBtn').style.display = 'inline-flex';
    },
    
    // 清除文件
    clearFile() {
        this.currentFile = null;
        document.getElementById('uploadArea').style.display = 'block';
        document.getElementById('filePreview').style.display = 'none';
        document.getElementById('fileInput').value = '';
    },
    
    // 上传文件
    async uploadFile() {
        if (!this.currentFile) return;
        
        try {
            // 显示进度区域
            this.showSection('progressSection');
            this.hideSection('uploadSection');
            
            // 更新状态
            this.updateStatus('Processing', 'Uploading video...', 0);
            
            // 上传文件
            const response = await api.uploadVideo(this.currentFile, (percent) => {
                this.updateProgress(percent);
            });
            
            // 保存 job ID
            this.currentJobId = response.job_id || response.jobId || response.id;
            document.getElementById('jobId').textContent = this.currentJobId;
            
            showNotification('Upload successful! Processing started...', 'success');
            
            // 显示导航箭头
            const navArrow = document.getElementById('navArrow');
            if (navArrow) navArrow.style.display = 'flex';
            
            // 开始轮询状态
            this.startPolling();
            
        } catch (error) {
            console.error('Upload error:', error);
            showNotification('Upload failed: ' + error.message, 'error');
            this.updateStatus('Error', error.message, 0, 'error');
        }
    },
    
    // 开始轮询状态
    async startPolling() {
        try {
            this.updateStatus('Processing', 'Processing video on server...', 10);
            
            await api.pollStatus(this.currentJobId, (status) => {
                // 更新进度
                const progress = status.progress || 0;
                const stage = status.stage || 'Processing';
                
                this.updateStatus('Processing', stage, progress);
            });
            
            // 处理完成
            this.updateStatus('Completed', 'Processing complete! Downloading result...', 100, 'success');
            
            // 下载结果
            await this.downloadAndDisplay();
            
        } catch (error) {
            console.error('Processing error:', error);
            showNotification('Processing failed: ' + error.message, 'error');
            this.updateStatus('Failed', error.message, 0, 'error');
        }
    },
    
    // 下载并显示结果
    async downloadAndDisplay(moduleID = null) {
        try {
            // 如果传入了 moduleID，则使用 it；否则使用当前 job ID
            const targetScene = moduleID || this.currentJobId;
            
            if (!targetScene) {
                throw new Error("未指定场景 ID (moduleID) 或 Job ID");
            }

            // 下载 .ply 文件
            const plyData = await api.downloadResult(targetScene);
            
            // 初始化查看器
            if (!viewer.scene) {
                viewer.init();
            }
            
            // 加载 .ply 文件
            await viewer.loadPLY(plyData);
            
            // 显示查看器
            this.showSection('viewerSection');
            this.hideSection('progressSection');
            this.hideSection('uploadSection'); // 确保隐藏上传区域
            
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
        
        statusBadge.textContent = badge;
        statusBadge.className = 'status-badge ' + type;
        statusText.textContent = text;
        progressFill.style.width = progress + '%';
        progressPercent.textContent = Math.round(progress) + '%';
    },
    
    // 更新上传进度
    updateProgress(percent) {
        const progressFill = document.getElementById('progressFill');
        const progressPercent = document.getElementById('progressPercent');
        
        progressFill.style.width = percent + '%';
        progressPercent.textContent = Math.round(percent) + '%';
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
        
        if (viewer.scene) {
            viewer.dispose();
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
        document.getElementById('addMoreBtn').style.display = 'none';
    },
    
    // 更新已上传视频列表
    updateVideosList() {
        const videosList = document.getElementById('uploadedVideosList');
        const videoItems = document.getElementById('videoItems');
        const videoCount = document.getElementById('videoCount');
        
        if (this.uploadedVideos.length === 0) {
            videosList.style.display = 'none';
            return;
        }
        
        videosList.style.display = 'block';
        videoCount.textContent = this.uploadedVideos.length;
        
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
