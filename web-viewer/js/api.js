// API 通信模块
const api = {
    // 上传视频文件
    async uploadVideo(file, onProgress) {
        try {
            const formData = new FormData();
            formData.append('video', file);
            
            const xhr = new XMLHttpRequest();
            
            return new Promise((resolve, reject) => {
                // 上传进度
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable && onProgress) {
                        const percent = (e.loaded / e.total) * 100;
                        onProgress(percent);
                    }
                });
                
                // 完成
                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            resolve(response);
                        } catch (e) {
                            reject(new Error('Invalid server response'));
                        }
                    } else {
                        reject(new Error(`Upload failed: ${xhr.status}`));
                    }
                });
                
                // 错误
                xhr.addEventListener('error', () => {
                    reject(new Error('Network error during upload'));
                });
                
                // 发送请求
                xhr.open('POST', getApiUrl(CONFIG.ENDPOINTS.UPLOAD));
                xhr.send(formData);
            });
        } catch (error) {
            throw new Error(`Upload error: ${error.message}`);
        }
    },
    
    // 查询处理状态
    async getStatus(jobId) {
        try {
            const url = getApiUrl(CONFIG.ENDPOINTS.STATUS + '/' + jobId);
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Status check failed: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            throw new Error(`Status check error: ${error.message}`);
        }
    },
    
    // 下载结果文件
    async downloadResult(jobId) {
        try {
            const url = getApiUrl(CONFIG.ENDPOINTS.DOWNLOAD + '/' + jobId);
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Download failed: ${response.status}`);
            }
            
            // 返回 Blob 数据
            return await response.blob();
        } catch (error) {
            throw new Error(`Download error: ${error.message}`);
        }
    },
    
    // 轮询状态直到完成
    async pollStatus(jobId, onUpdate) {
        let retries = 0;
        
        while (retries < CONFIG.POLLING.MAX_RETRIES) {
            try {
                const status = await this.getStatus(jobId);
                
                if (onUpdate) {
                    onUpdate(status);
                }
                
                // 检查是否完成
                if (status.status === 'completed') {
                    return status;
                } else if (status.status === 'failed') {
                    throw new Error(status.error || 'Processing failed');
                }
                
                // 等待后继续轮询
                await new Promise(resolve => setTimeout(resolve, CONFIG.POLLING.INTERVAL));
                retries = 0; // 重置重试计数
                
            } catch (error) {
                retries++;
                if (retries >= CONFIG.POLLING.MAX_RETRIES) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, CONFIG.POLLING.INTERVAL));
            }
        }
        
        throw new Error('Max retries exceeded');
    }
};
