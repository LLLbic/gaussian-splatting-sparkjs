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
    
    // 获取场景模型文件的 URL (不下载)
    async getModuleModelUrl(moduleID) {
        try {
            // 使用 config.js 中计算出的 BASE_URL
            const base = typeof BASE_URL !== 'undefined' ? BASE_URL : CONFIG.SERVER_IP;
            let dynamicOutputUrl = null;
            
            try {
                // 1. 尝试通过 API 获取目录列表 (优先尝试直接在 datasets/<moduleID> 下找)
                const listDirsUrl = `${base}/api/list-dirs?path=datasets/${moduleID}`;
                console.log(`Resolving model path for ${moduleID} via API...`);
                
                const listResp = await fetch(listDirsUrl);
                if (listResp.ok) {
                    const data = await listResp.json();
                    if (data.directories && data.directories.length > 0) {
                        // 寻找最像输出目录的文件夹 (例如以 output 开头，或者排除掉 input/images 等)
                        const outputDirName = data.directories.find(d => d.startsWith('output')) || 
                                             data.directories.find(d => !['images', 'input', 'distorted'].includes(d)) ||
                                             data.directories[0];
                        
                        dynamicOutputUrl = `${base}/datasets/${moduleID}/${outputDirName}/point_cloud/iteration_30000/point_cloud.ply`;
                        console.log(`Resolved model URL via API: ${dynamicOutputUrl}`);
                        return dynamicOutputUrl;
                    }
                }
            } catch (e) {
                console.warn('API list-dirs failed or server unreachable, trying fallback paths...', e);
            }

            // 2. 兜底逻辑：如果 API 失败（如 ERR_CONNECTION_REFUSED），尝试常见的默认路径
            // 这种方式不需要 API 支持，只要静态文件服务器能访问到即可
            const commonOutputs = ['output1', 'output2', 'output', 'd192f0c7-1']; 
            for (const outputDir of commonOutputs) {
                const testUrl = `${base}/datasets/${moduleID}/${outputDir}/point_cloud/iteration_30000/point_cloud.ply`;
                try {
                    // 使用 HEAD 请求检查文件是否存在，比 GET 更轻量
                    const checkResp = await fetch(testUrl, { method: 'HEAD' });
                    if (checkResp.ok) {
                        console.log(`Resolved model URL via fallback: ${testUrl}`);
                        return testUrl;
                    }
                } catch (err) {
                    // 忽略错误，继续尝试下一个
                }
            }
            
            throw new Error('无法通过 API 或兜底路径找到该场景的模型文件');
        } catch (error) {
            throw new Error(`Path resolution error: ${error.message}`);
        }
    },

    // 从项目目录下载结果文件 (.ply)
    async downloadResult(moduleID) {
        try {
            const url = await this.getModuleModelUrl(moduleID);
            
            try {
                const response = await fetch(url);
                if (response.ok) {
                    return await response.blob();
                }
            } catch (e) {
                console.warn(`Failed to fetch from ${url}:`, e);
            }

            throw new Error('无法下载模型文件');
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
