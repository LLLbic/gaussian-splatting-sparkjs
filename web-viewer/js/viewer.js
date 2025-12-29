
import { attachSpreading } from './spark-spread.js';

// Three.js 3D 查看器
window.viewer = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    pointCloud: null,
    currentSplat: null,
    animationId: null,
    notificationTimeouts: [],
    keyboardControls: {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false
    },
    moveSpeed: 0.1,
    
    // 演示场景配置
    demoScenes: {
        bedroom: {
            url: "https://storage.googleapis.com/forge-dev-public/painted_bedroom.spz",
            name: "彩色卧室",
            camera: { x: 0, y: 0.8, z: 0 },
            lookAt: { x: 1, y: 0.8, z: 0 }
        },
        fireplace: {
            url: "https://sparkjs.dev/assets/splats/fireplace.spz",
            name: "壁炉",
            camera: { x: 0, y: 0.5, z: 0 },
            lookAt: { x: 0, y: 0.5, z: -2 }
        },
        valley: {
            url: "https://sparkjs.dev/assets/splats/valley.spz",
            name: "山谷",
            camera: { x: 0, y: 1, z: 0 },
            lookAt: { x: 3, y: 1, z: -3 }
        }
    },
    
    // 初始化查看器
    init() {
        this.initRenderer();
        
        // 添加方向光
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);
        
        // 设置键盘控制
        this.setupKeyboardControls();
        
        // 开始渲染循环
        this.animate();
        
        // 显示场景选择器
        const sceneSelector = document.getElementById('sceneSelector');
        if (sceneSelector) {
            sceneSelector.style.display = 'block';
        }
        
        console.log('Viewer initialized with Spark support');
    },

    // 初始化 WebGL 渲染器
    initRenderer() {
        const container = document.getElementById('canvas-container');
        const canvas = document.getElementById('viewer-canvas');
        
        // 针对 Splatting 优化的渲染器配置
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: false, // 关闭抗锯齿以避免纹理格式不匹配问题
            alpha: false,     // 关闭 alpha 以获得更好的性能和避免合成问题
            powerPreference: 'high-performance',
            stencil: false,
            depth: true
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setClearColor(new THREE.Color(0x000000), 1); // 不透明背景
        
        // 启用 WebGL 2 特性支持 (虽然 Three.js 默认会自动处理)
        if (this.renderer.capabilities.isWebGL2) {
            console.log('WebGL 2 enabled');
        } else {
            console.warn('WebGL 2 not available - Splatting may not work correctly');
        }
        
        // 场景与相机
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 10);
        
        // 控制器
        this.controls = new window.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // 环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        this.scene.add(ambientLight);
        
        // 处理窗口调整
        window.addEventListener('resize', () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        });
    },
    
    // 加载 .ply 文件
    async loadPLY(data) {
        try {
            // 移除旧的点云
            if (this.pointCloud) {
                this.scene.remove(this.pointCloud);
                this.pointCloud.geometry.dispose();
                this.pointCloud.material.dispose();
            }
            
            // 使用 PLYLoader 加载
            const loader = new THREE.PLYLoader();
            
            // 将 Blob 转换为 ArrayBuffer
            const arrayBuffer = await data.arrayBuffer();
            
            // 解析 PLY
            const geometry = loader.parse(arrayBuffer);
            
            // 计算法线（如果没有）
            if (!geometry.attributes.normal) {
                geometry.computeVertexNormals();
            }
            
            // 创建材质
            const material = new THREE.PointsMaterial({
                size: 0.01,
                vertexColors: true,
                transparent: true,
                opacity: 0.8
            });
            
            // 创建点云
            this.pointCloud = new THREE.Points(geometry, material);
            this.scene.add(this.pointCloud);
            
            // 居中并缩放
            this.centerAndScale();
            
            return true;
        } catch (error) {
            console.error('Error loading PLY:', error);
            throw new Error('Failed to load 3D model');
        }
    },
    
    // 居中并缩放模型
    centerAndScale() {
        if (!this.pointCloud) return;
        
        // 计算包围盒
        const box = new THREE.Box3().setFromObject(this.pointCloud);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // 居中
        this.pointCloud.position.sub(center);
        
        // 缩放以适应视图
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / maxDim;
        this.pointCloud.scale.setScalar(scale);
        
        // 调整初始相机位置
        this.camera.position.set(0, 0, 5); 
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    },
    
    // 设置键盘控制
    setupKeyboardControls() {
        // 键盘按下事件
        window.addEventListener('keydown', (e) => {
            switch(e.key.toLowerCase()) {
                case 'w':
                    this.keyboardControls.forward = true;
                    break;
                case 's':
                    this.keyboardControls.backward = true;
                    break;
                case 'a':
                    this.keyboardControls.left = true;
                    break;
                case 'd':
                    this.keyboardControls.right = true;
                    break;
                case 'q':
                    this.keyboardControls.up = true;
                    break;
                case 'e':
                    this.keyboardControls.down = true;
                    break;
            }
        });
        
        // 键盘释放事件
        window.addEventListener('keyup', (e) => {
            switch(e.key.toLowerCase()) {
                case 'w':
                    this.keyboardControls.forward = false;
                    break;
                case 's':
                    this.keyboardControls.backward = false;
                    break;
                case 'a':
                    this.keyboardControls.left = false;
                    break;
                case 'd':
                    this.keyboardControls.right = false;
                    break;
                case 'q':
                    this.keyboardControls.up = false;
                    break;
                case 'e':
                    this.keyboardControls.down = false;
                    break;
            }
        });
    },
    
    // 更新相机位置（基于键盘输入）
    updateCameraPosition() {
        if (!this.camera || !this.controls) return;
        
        const direction = new THREE.Vector3();
        const right = new THREE.Vector3();
        
        // 获取相机的前方和右方向量
        this.camera.getWorldDirection(direction);
        right.crossVectors(this.camera.up, direction).normalize();
        
        // W/S - 前后移动
        if (this.keyboardControls.forward) {
            this.camera.position.addScaledVector(direction, this.moveSpeed);
            this.controls.target.addScaledVector(direction, this.moveSpeed);
        }
        if (this.keyboardControls.backward) {
            this.camera.position.addScaledVector(direction, -this.moveSpeed);
            this.controls.target.addScaledVector(direction, -this.moveSpeed);
        }
        
        // A/D - 左右移动
        if (this.keyboardControls.left) {
            this.camera.position.addScaledVector(right, this.moveSpeed);
            this.controls.target.addScaledVector(right, this.moveSpeed);
        }
        if (this.keyboardControls.right) {
            this.camera.position.addScaledVector(right, -this.moveSpeed);
            this.controls.target.addScaledVector(right, -this.moveSpeed);
        }
        
        // Q/E 或 空格/Shift - 上下移动
        if (this.keyboardControls.up) {
            this.camera.position.y += this.moveSpeed;
            this.controls.target.y += this.moveSpeed;
        }
        if (this.keyboardControls.down) {
            this.camera.position.y -= this.moveSpeed;
            this.controls.target.y -= this.moveSpeed;
        }
    },
    
    // 渲染循环
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        // 更新键盘控制
        this.updateCameraPosition();
        
        if (this.controls) {
            this.controls.update();
        }
        
        // Update splat uniforms/effects
        if (this.currentSplat) {
            this.currentSplat.updateVersion();
        }

        // 渲染每一帧
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    },
    
    // 窗口大小变化
    onWindowResize() {
        const container = document.getElementById('canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    },
    
    // 重置相机
    resetCamera() {
        this.camera.position.set(
            CONFIG.VIEWER.CAMERA_POSITION.x,
            CONFIG.VIEWER.CAMERA_POSITION.y,
            CONFIG.VIEWER.CAMERA_POSITION.z
        );
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    },
    
    // 全屏切换
    toggleFullscreen() {
        const container = document.getElementById('canvas-container');
        
        if (!document.fullscreenElement) {
            container.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    },
    
    // 截图
    takeScreenshot() {
        const dataURL = this.renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'gaussian-splatting-screenshot.png';
        link.href = dataURL;
        link.click();
        showNotification('Screenshot saved!', 'success');
    },
    
    // 加载演示场景
    async loadDemoScene(sceneKey) {
        const sceneConfig = this.demoScenes[sceneKey];
        if (!sceneConfig) return;
        
        console.log('Loading scene: ' + sceneConfig.name);
        window.showNotification('正在渲染...', 'info');
        
        // 1. 清理
        this.clearViewer();
        
        try {
            if (!window.SplatMesh) throw new Error('Spark SplatMesh engine not loaded');

            // 2. 创建 SplatMesh
            const splat = new window.SplatMesh({ 
                url: sceneConfig.url,
                stream: true 
            });
            
            // 3. 变换
            splat.rotation.x = Math.PI;

            // Apply Spread effect
            const controller = attachSpreading(splat, {
                effectType: 'Magic',
                speed: 1.0,
                soft: 0.5,
                opacityScale: 1.0,
                // Optional: blend color for the edge
                colorBlend: { enabled: true, color: [0.2, 0.6, 1.0], strength: 0.5 },
                // Time source auto uses performance.now()
                timeSource: 'auto',
                // New options
                duration: sceneConfig.renderSettings?.duration ?? 10.0,
                maxRadius: sceneConfig.renderSettings?.maxRadius ?? 10.0,
                onComplete: (timeTaken) => {
                    window.showNotification(`渲染完成 (耗时: ${timeTaken.toFixed(2)}s)`, 'success');
                }
            }).__spreadController;
            
            // Reset time to start effect from 0
            controller.reset();

            this.scene.add(splat);
            this.currentSplat = splat;
            
            // 5. 相机设置
            if (sceneConfig.camera) {
                const c = sceneConfig.camera;
                const l = sceneConfig.lookAt || { x: 0, y: 0, z: 0 };
                this.camera.position.set(c.x, c.y, c.z);
                this.controls.target.set(l.x, l.y, l.z);
            }
            this.controls.update();

        } catch (err) {
            console.error('Error loading scene:', err);
            window.showNotification('Load failed: ' + err.message, 'error');
        }
    },
    
    // 辅助方法：清理查看器
    clearViewer() {
        // 清除所有待处理的通知
        if (this.notificationTimeouts) {
            this.notificationTimeouts.forEach(id => clearTimeout(id));
            this.notificationTimeouts = [];
        }

        if (this.pointCloud) {
            this.scene.remove(this.pointCloud);
            if (this.pointCloud.geometry) this.pointCloud.geometry.dispose();
            if (this.pointCloud.material) this.pointCloud.material.dispose();
            this.pointCloud = null;
        }
        
        if (this.currentSplat) {
            this.scene.remove(this.currentSplat);
            if (typeof this.currentSplat.dispose === 'function') {
                this.currentSplat.dispose();
            }
            this.currentSplat = null;
        }
    },
    
    // 清理资源
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.pointCloud) {
            this.scene.remove(this.pointCloud);
            this.pointCloud.geometry.dispose();
            this.pointCloud.material.dispose();
        }
        
        if (this.renderer) {
            this.renderer.dispose();
        }
    }
};
