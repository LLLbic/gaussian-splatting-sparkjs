// API 通信模块
window.api = {
    // 查询处理状态
    async getTaskStatus(taskId) {
        try {
            // 使用配置的 STATUS 端点 ( /api/task )
            const url = getApiUrl(`${CONFIG.ENDPOINTS.STATUS}/${taskId}`);
            const response = await fetch(url);

            if (!response.ok) {
                // 如果是 404，可能是任务还没创建好，或者ID错误
                if (response.status === 404) return null;
                throw new Error(`Status check failed: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Status check error:", error);
            // 不抛出错误，而是返回 null 以便重试
            return null;
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
                        // 优先查找标准的 'model' 目录
                        const outputDirName = data.directories.find(d => d === 'model') ||
                            data.directories.find(d => d.startsWith('output')) ||
                            data.directories.find(d => !['images', 'input', 'distorted'].includes(d)) ||
                            data.directories[0];

                        // 检测设备类型
                        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                        console.log(`[v2] Device type: ${isMobile ? 'Mobile' : 'Desktop'}`);

                        // 构建优化版本的 URL 列表（按优先级）
                        // 构建优化版本的 URL 列表（按优先级）
                        // 注意：这里需要正确构建完整的 URL
                        const basePath = `${base}/datasets/${moduleID}/${outputDirName}/point_cloud`;
                        const candidateUrls = [];

                        if (isMobile) {
                            // 移动设备：用户指定优先使用全分辨率SPZ（高质量）
                            candidateUrls.push(
                                `${basePath}/iteration_30000/point_cloud_optimized.spz`,  // 全分辨率SPZ（优先）
                                `${basePath}/iteration_mobile/point_cloud.spz`,           // 降采样SPZ（备选）
                                `${basePath}/iteration_mobile/point_cloud.ply`,           // 降采样PLY
                                `${basePath}/iteration_30000/point_cloud.ply`             // 原始PLY（兜底）
                            );
                        } else {
                            // 桌面设备：优先使用 SPZ 压缩版本
                            candidateUrls.push(
                                `${basePath}/iteration_30000/point_cloud_optimized.spz`,  // 桌面端SPZ优化版
                                `${basePath}/iteration_30000/point_cloud.spz`,            // 桌面端SPZ普通版
                                // 如果没有桌面端优化版，尝试移动端优化版（也比原始PLY快且省流）
                                `${basePath}/iteration_mobile/point_cloud.spz`,           // 移动端SPZ
                                `${basePath}/iteration_mobile/point_cloud.ply`,           // 移动端PLY
                                `${basePath}/iteration_30000/point_cloud.ply`             // 原始PLY
                            );
                        }

                        // 尝试每个候选 URL
                        for (const url of candidateUrls) {
                            try {
                                const checkResp = await fetch(url, { method: 'HEAD' });
                                if (checkResp.ok) {
                                    const fileType = url.endsWith('.spz') ? 'SPZ (compressed)' : 'PLY';
                                    let version = '30000';
                                    if (url.includes('mobile')) version = 'mobile';
                                    else if (url.includes('optimized')) version = 'optimized';

                                    console.log(`✓ Found optimized model: ${fileType}, version: ${version}`);
                                    console.log(`Resolved model URL: ${url}`);
                                    return url;
                                }
                            } catch (err) {
                                // 继续尝试下一个
                            }
                        }

                        // 如果都没找到，返回默认路径
                        dynamicOutputUrl = `${basePath}/iteration_30000/point_cloud.ply`;
                        console.log(`Using default model URL: ${dynamicOutputUrl}`);
                        return dynamicOutputUrl;
                    }
                }
            } catch (e) {
                console.warn('API list-dirs failed or server unreachable, trying fallback paths...', e);
            }

            // 2. 兜底逻辑：如果 API 失败（如 ERR_CONNECTION_REFUSED），尝试常见的默认路径
            // 这种方式不需要 API 支持，只要静态文件服务器能访问到即可
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            const commonOutputs = ['model', 'output1', 'output2', 'output', 'd192f0c7-1'];
            for (const outputDir of commonOutputs) {
                // 定义 basePath，注意作用域
                const basePath = `${base}/datasets/${moduleID}/${outputDir}/point_cloud`;
                const candidateUrls = []; // 使用 const 因为数组是可变的

                if (isMobile) {
                    // 移动设备：用户指定优先使用全分辨率SPZ
                    candidateUrls.push(
                        `${basePath}/iteration_30000/point_cloud_optimized.spz`,
                        `${basePath}/iteration_mobile/point_cloud.spz`,
                        `${basePath}/iteration_mobile/point_cloud.ply`,
                        `${basePath}/iteration_30000/point_cloud.ply`
                    );
                } else {
                    // 桌面设备：优先使用SPZ压缩
                    candidateUrls.push(
                        `${basePath}/iteration_30000/point_cloud_optimized.spz`,
                        `${basePath}/iteration_30000/point_cloud.spz`,
                        `${basePath}/iteration_30000/point_cloud.ply`
                    );
                }

                // 尝试每个候选 URL
                for (const testUrl of candidateUrls) {
                    try {
                        const checkResp = await fetch(testUrl, { method: 'HEAD' });
                        if (checkResp.ok) {
                            console.log(`✓ Found fallback model: ${testUrl}`);
                            return testUrl;
                        }
                    } catch (err) {
                        // 忽略错误，继续尝试下一个
                    }
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
