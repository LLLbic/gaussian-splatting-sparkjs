// 配置文件
window.CONFIG = {
    // 服务器配置（预设，无需用户配置）
    // ⚠️ 重要：请在此处填写您的实际服务器地址
    SERVER_IP: 'http://your-server-ip:5000', // 修改为您的服务器地址，例如: 'http://192.168.1.100:5000'
    
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
window.getApiUrl = function(endpoint) {
    // 如果 SERVER_IP 包含 'your-server-ip'，则自动使用当前页面的域名
    const base = window.CONFIG.SERVER_IP.includes('your-server-ip') 
        ? window.location.origin 
        : window.CONFIG.SERVER_IP;
    return base + endpoint;
}

// 修改 CONFIG.SERVER_IP 的默认逻辑，使其在 downloadResult 中也能正确工作
window.BASE_URL = window.CONFIG.SERVER_IP.includes('your-server-ip') 
    ? window.location.origin 
    : window.CONFIG.SERVER_IP;
