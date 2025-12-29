// API 通信模块
window.api = {
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
    
    // 从项目目录下载结果文件 (.ply)
    async downloadResult(moduleID) {
        try {
            // 使用 config.js 中计算出的 BASE_URL
            const base = typeof BASE_URL !== 'undefined' ? BASE_URL : CONFIG.SERVER_IP;
            
            // 优先从 datasets 目录查找 (用户指定)
            // 路径 1: datasets/<moduleID>/point_cloud.ply (手动放入)
            const datasetsUrl = `${base}/datasets/${moduleID}/point_cloud.ply`;
            // 路径 2: datasets/<moduleID>/sparse/0/points3D.ply (COLMAP 结果)
            const sparseUrl = `${base}/datasets/${moduleID}/sparse/0/points3D.ply`;
            // 路径 3: datasets/<moduleID>/point_cloud/iteration_30000/point_cloud.ply
            const trainUrl = `${base}/datasets/${moduleID}/point_cloud/iteration_30000/point_cloud.ply`;
            
            // 同时也检查根目录下的 output 目录 (训练输出的默认位置)
            const outputUrl = `${base}/output/${moduleID}/point_cloud/iteration_30000/point_cloud.ply`;

            const paths = [datasetsUrl, sparseUrl, trainUrl, outputUrl];

            for (const url of paths) {
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        return await response.blob();
                    }
                } catch (e) {
                    console.warn(`Failed to fetch from ${url}:`, e);
                }
            }
            throw new Error('无法在 datasets 或 output 目录中找到该场景的模型文件 (.ply)');
        } catch (error) {
            throw new Error(`下载错误: ${error.message}`);
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
