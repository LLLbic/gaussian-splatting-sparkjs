// Three.js 3D 查看器
const viewer = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    pointCloud: null,
    currentSplat: null,
    animationId: null,
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
        const canvas = document.getElementById('viewer-canvas');
        const container = document.getElementById('canvas-container');
        
        // 创建场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(CONFIG.VIEWER.BACKGROUND_COLOR);
        
        // 创建相机
        const aspect = container.clientWidth / container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(
            CONFIG.VIEWER.FOV,
            aspect,
            CONFIG.VIEWER.NEAR,
            CONFIG.VIEWER.FAR
        );
        this.camera.position.set(
            CONFIG.VIEWER.CAMERA_POSITION.x,
            CONFIG.VIEWER.CAMERA_POSITION.y,
            CONFIG.VIEWER.CAMERA_POSITION.z
        );
        
        // 创建渲染器
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // 添加轨道控制器
        this.controls = new window.OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 1;
        this.controls.maxDistance = 100;
        
        // 添加环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        // 添加方向光
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);
        
        // 网格辅助线已移除
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => this.onWindowResize());
        
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
            
            // 创建增强的粒子材质（使用自定义着色器）
            const material = createEnhancedParticleMaterial();
            
            // 添加随机缩放属性
            const count = geometry.attributes.position.count;
            const scales = new Float32Array(count);
            const randomness = new Float32Array(count * 3);
            
            for (let i = 0; i < count; i++) {
                scales[i] = Math.random() * 0.5 + 0.5;
                randomness[i * 3] = (Math.random() - 0.5) * 0.2;
                randomness[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
                randomness[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
            }
            
            geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
            geometry.setAttribute('aRandomness', new THREE.BufferAttribute(randomness, 3));
            
            // 创建点云
            this.pointCloud = new THREE.Points(geometry, material);
            this.scene.add(this.pointCloud);
            
            // 居中并缩放
            this.centerAndScale();
            
            // 移除网格辅助线
            const gridHelper = this.scene.children.find(child => child instanceof THREE.GridHelper);
            if (gridHelper) {
                this.scene.remove(gridHelper);
            }
            
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
        
        // 调整相机
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
        
        // 更新键盘控制的相机移动
        this.updateCameraPosition();
        
        if (this.controls) {
            this.controls.update();
        }
        
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
    loadDemoScene(sceneKey) {
        const sceneConfig = this.demoScenes[sceneKey];
        if (!sceneConfig) {
            console.error('Unknown scene:', sceneKey);
            return;
        }
        
        console.log('Loading demo scene:', sceneConfig.name);
        showLoading('加载场景: ' + sceneConfig.name);
        
        // 移除旧的点云或Splat
        if (this.pointCloud) {
            this.scene.remove(this.pointCloud);
            this.pointCloud.geometry.dispose();
            this.pointCloud.material.dispose();
            this.pointCloud = null;
        }
        
        if (this.currentSplat) {
            this.scene.remove(this.currentSplat);
            this.currentSplat = null;
        }
        
        // 检查SplatMesh是否可用
        if (typeof window.SplatMesh === 'undefined') {
            showNotification('Spark库未加载，无法加载场景', 'error');
            hideLoading();
            return;
        }
        
        // 创建Spark SplatMesh
        const splat = new window.SplatMesh({ url: sceneConfig.url });
        
        // 修正场景方向
        splat.rotation.x = Math.PI;
        
        // 设置相机位置
        this.camera.position.set(
            sceneConfig.camera.x,
            sceneConfig.camera.y,
            sceneConfig.camera.z
        );
        
        // 设置观察目标
        if (sceneConfig.lookAt) {
            this.controls.target.set(
                sceneConfig.lookAt.x,
                sceneConfig.lookAt.y,
                sceneConfig.lookAt.z
            );
        }
        
        this.controls.update();
        
        // 添加到场景
        this.scene.add(splat);
        this.currentSplat = splat;
        
        // 监听加载完成
        let loaded = false;
        
        splat.addEventListener('load', () => {
            if (!loaded) {
                loaded = true;
                console.log('Scene loaded:', sceneConfig.name);
                hideLoading();
                showNotification('场景加载完成: ' + sceneConfig.name, 'success');
            }
        });
        
        // 轮询检查
        const checkLoaded = setInterval(() => {
            if (splat.isLoaded && !loaded) {
                loaded = true;
                hideLoading();
                showNotification('场景加载完成: ' + sceneConfig.name, 'success');
                clearInterval(checkLoaded);
            }
        }, 100);
        
        // 超时保护
        setTimeout(() => {
            if (!loaded) {
                loaded = true;
                hideLoading();
                clearInterval(checkLoaded);
            }
        }, 15000);
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

// PLYLoader 实现（简化版）
if (typeof THREE !== 'undefined') {
    THREE.PLYLoader = function() {};
    THREE.PLYLoader.prototype = {
        parse: function(data) {
            const geometry = new THREE.BufferGeometry();
            const dataView = new DataView(data);
            
            // 这里需要实现完整的 PLY 解析
            // 简化版：假设数据已经是正确格式
            // 实际使用时应该使用完整的 PLYLoader 库
            
            // 示例：创建一个简单的点云用于测试
            const vertices = [];
            const colors = [];
            
            // 解析 PLY 头部和数据
            // ... (实际实现需要完整的 PLY 解析逻辑)
            
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            
            return geometry;
        }
    };
}
