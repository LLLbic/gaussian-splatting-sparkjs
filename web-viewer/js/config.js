window.CONFIG = {
    SERVER_IP: 'http://100.73.115.55:5000',
    // API 端点
    ENDPOINTS: {
        UPLOAD: '/api/upload',
        STATUS: '/api/status',
        DOWNLOAD: '/api/download'
    },

    // 上传配置
    UPLOAD: {
        MAX_FILE_SIZE: 2 * 1024 * 1024 * 1024, // 2GB
        ALLOWED_FORMATS: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
        CHUNK_SIZE: 5 * 1024 * 1024 // 5MB chunks
    },

    // 轮询配置
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
    // 直接使用配置的 SERVER_IP，避免开发环境下端口不一致导致请求失败
    return window.CONFIG.SERVER_IP + endpoint;
}

// 设置全局 BASE_URL
window.BASE_URL = window.CONFIG.SERVER_IP;
