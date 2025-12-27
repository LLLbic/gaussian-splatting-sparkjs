// 配置文件
const CONFIG = {
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
function getApiUrl(endpoint) {
    // 直接使用预设的服务器地址
    return CONFIG.SERVER_IP + endpoint;
}
