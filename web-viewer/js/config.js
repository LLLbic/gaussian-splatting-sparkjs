window.CONFIG = {
    // 后端服务器地址 (Tailscale 内网 IP)
    SERVER_IP: '',

    // API 端点
    ENDPOINTS: {
        // UPLOAD 端点在 distributed-upload.js 中处理 (init/chunk/complete)
        STATUS: '/api/task',
        DOWNLOAD: '/api/download/model'
    },

    // 上传配置
    UPLOAD: {
        MAX_FILE_SIZE: 10 * 1024 * 1024 * 1024, // 10GB
        ALLOWED_FORMATS: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
        CHUNK_SIZE: 5 * 1024 * 1024 // 5MB chunks
    },

    // 轮询配置 (作为 WebSocket 的备选)
    POLLING: {
        INTERVAL: 2000, // 2秒
        MAX_RETRIES: 3
    },

    // 查看器配置
    VIEWER: {
        CAMERA_POSITION: { x: 0, y: 0, z: 5 },
        BACKGROUND_COLOR: 0x000000,
        FOV: 75,
        NEAR: 0.1,
        FAR: 1000
    }
};

// 获取完整的 API URL
window.getApiUrl = function (endpoint) {
    if (endpoint.startsWith('http')) return endpoint;
    return window.CONFIG.SERVER_IP + endpoint;
}

// 设置全局 BASE_URL
window.BASE_URL = window.CONFIG.SERVER_IP;
