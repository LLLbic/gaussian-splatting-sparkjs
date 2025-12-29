// Three.js 3D 教程演示
window.tutorialDemo = {
    scene: null,
    camera: null,
    renderer: null,
    orbitCamera: null,
    targetObject: null,
    orbitPath: null,
    animationId: null,
    angle: 0,
    
    // 初始化 3D 场景
    init(containerId) {
        console.log('tutorialDemo.init called with:', containerId);
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Container not found:', containerId);
            return;
        }
        console.log('Container found:', container);
        
        // 检查 THREE 是否加载
        if (typeof THREE === 'undefined') {
            console.error('THREE.js not loaded!');
            return;
        }
        console.log('THREE.js loaded successfully');
        
        // 创建场景
        this.scene = new THREE.Scene();
        
        // 创建相机（观察者视角）
        this.camera = new THREE.PerspectiveCamera(
            50,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(4, 3, 5);
        this.camera.lookAt(0, 0, 0);
        
        // 创建渲染器
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true 
        });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setClearColor(0x000000, 0);
        container.appendChild(this.renderer.domElement);
        
        // 添加环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        // 添加方向光
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);
        
        // 创建中心目标物体
        const modelGroup = new THREE.Group();
        
        // 可选模型列表（随机选择一个）
        const models = [
            { name: 'Flamingo', url: 'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/Flamingo.glb', scale: 0.035, yOffset: -0.5 },
            { name: 'Parrot', url: 'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/Parrot.glb', scale: 0.025, yOffset: -0.3 },
            { name: 'Stork', url: 'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/Stork.glb', scale: 0.035, yOffset: -0.8 },
            { name: 'Horse', url: 'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/Horse.glb', scale: 0.01, yOffset: -0.5 },
            { name: 'RobotExpressive', url: 'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/RobotExpressive/RobotExpressive.glb', scale: 0.5, yOffset: -0.5 }
        ];
        
        // 随机选择一个模型（或使用火烈鸟作为默认）
        const selectedModel = models[4]; // 使用火烈鸟
        console.log('Selected model:', selectedModel.name);
        

        
        this.targetObject = modelGroup;
        this.scene.add(this.targetObject);
        
        // 尝试加载 GLTF 模型
        this.loadGLTFModel(modelGroup, selectedModel);
        
        // 创建三个轨道路径（不同高度）
        const orbitGeometry = new THREE.TorusGeometry(2, 0.02, 16, 100);
        
        // 中间轨道（水平）
        const orbitMaterialMid = new THREE.MeshBasicMaterial({ 
            color: 0x22d3ee,
            transparent: true,
            opacity: 0.6
        });
        this.orbitPath = new THREE.Mesh(orbitGeometry, orbitMaterialMid);
        this.orbitPath.rotation.x = Math.PI / 2;
        this.scene.add(this.orbitPath);
        
        // 上层轨道（斜向下拍摄）
        const orbitMaterialHigh = new THREE.MeshBasicMaterial({ 
            color: 0x10b981,
            transparent: true,
            opacity: 0.5
        });
        this.orbitPathHigh = new THREE.Mesh(orbitGeometry, orbitMaterialHigh);
        this.orbitPathHigh.rotation.x = Math.PI / 2;
        this.orbitPathHigh.position.y = 0.8;
        this.scene.add(this.orbitPathHigh);
        
        // 下层轨道（斜向上拍摄）
        const orbitMaterialLow = new THREE.MeshBasicMaterial({ 
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.5
        });
        this.orbitPathLow = new THREE.Mesh(orbitGeometry, orbitMaterialLow);
        this.orbitPathLow.rotation.x = Math.PI / 2;
        this.orbitPathLow.position.y = -0.8;
        this.scene.add(this.orbitPathLow);
        
        // 创建三个相机模型（用于三个不同高度的轨道）
        this.cameras = [];
        
        for (let i = 0; i < 3; i++) {
            const cameraGroup = this.createCameraModel();
            this.cameras.push(cameraGroup);
            this.scene.add(cameraGroup);
        }
        
        // 保持向后兼容
        this.orbitCamera = this.cameras[0];
        
        // 添加网格辅助线
        const gridHelper = new THREE.GridHelper(6, 12, 0x444444, 0x222222);
        gridHelper.position.y = -1;
        this.scene.add(gridHelper);
        
        // 开始动画
        this.animate();
        
        console.log('3D demo initialized successfully!');
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => this.onWindowResize(container));
    },
    
    // 加载 GLTF 模型
    loadGLTFModel(modelGroup, modelConfig) {
        if (typeof GLTFLoader === 'undefined') {
            console.log('GLTFLoader not available');
            return;
        }
        
        const loader = new GLTFLoader();
        const modelUrl = modelConfig.url;
        
        console.log('Loading GLTF model:', modelConfig.name, 'from:', modelUrl);
        
        loader.load(
            modelUrl,
            (gltf) => {
                console.log('GLTF model loaded successfully:', modelConfig.name);
                
                // 清空现有模型
                while(modelGroup.children.length > 0) {
                    const child = modelGroup.children[0];
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                    modelGroup.remove(child);
                }
                
                // 添加加载的模型
                const model = gltf.scene;
                model.scale.set(modelConfig.scale, modelConfig.scale, modelConfig.scale);
                model.position.y = modelConfig.yOffset;
                modelGroup.add(model);
                
                // 如果有动画，播放第一个
                if (gltf.animations && gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(model);
                    const action = this.mixer.clipAction(gltf.animations[0]);
                    action.play();
                    console.log('Playing animation for', modelConfig.name);
                }
            },
            (progress) => {
                const percent = (progress.loaded / progress.total * 100).toFixed(0);
                if (percent % 20 === 0) { // 每20%显示一次
                    console.log('Loading progress:', percent + '%');
                }
            },
            (error) => {
                console.error('Error loading GLTF model:', error);
                console.log('Keeping Christmas tree model');
            }
        );
    },
    
    // 创建圣诞树模型
    createChristmasTree(treeGroup) {
        // 树干（圆柱体）
        const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.2, 0.4, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            metalness: 0.1,
            roughness: 0.8
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = -0.6;
        treeGroup.add(trunk);
        
        // 树叶（三层圆锥体）
        const createTreeLayer = (radius, height, yPos, color) => {
            const geometry = new THREE.ConeGeometry(radius, height, 8);
            const material = new THREE.MeshStandardMaterial({ 
                color: color,
                metalness: 0.2,
                roughness: 0.6
            });
            const cone = new THREE.Mesh(geometry, material);
            cone.position.y = yPos;
            return cone;
        };
        
        // 底层（深绿色）
        const layer1 = createTreeLayer(0.6, 0.8, -0.2, 0x0d5c0d);
        treeGroup.add(layer1);
        
        // 中层（绿色）
        const layer2 = createTreeLayer(0.5, 0.7, 0.3, 0x228B22);
        treeGroup.add(layer2);
        
        // 顶层（浅绿色）
        const layer3 = createTreeLayer(0.4, 0.6, 0.75, 0x32CD32);
        treeGroup.add(layer3);
        
        // 星星（顶部装饰）
        const starGeometry = new THREE.SphereGeometry(0.12, 8, 8);
        const starMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xFFD700,
            emissive: 0xFFD700,
            emissiveIntensity: 0.8,
            metalness: 0.8,
            roughness: 0.2
        });
        const star = new THREE.Mesh(starGeometry, starMaterial);
        star.position.y = 1.2;
        treeGroup.add(star);
        
        // 添加装饰球（红色和金色）
        const ornamentColors = [0xFF0000, 0xFFD700, 0xFF69B4, 0x00CED1];
        const ornamentPositions = [
            { x: 0.3, y: 0, z: 0.3 },
            { x: -0.3, y: 0.1, z: 0.2 },
            { x: 0.2, y: 0.4, z: -0.2 },
            { x: -0.25, y: 0.5, z: 0.15 },
            { x: 0.15, y: 0.8, z: 0.1 },
            { x: -0.15, y: 0.9, z: -0.1 }
        ];
        
        ornamentPositions.forEach((pos, i) => {
            const ornamentGeometry = new THREE.SphereGeometry(0.08, 8, 8);
            const ornamentMaterial = new THREE.MeshStandardMaterial({ 
                color: ornamentColors[i % ornamentColors.length],
                metalness: 0.7,
                roughness: 0.3,
                emissive: ornamentColors[i % ornamentColors.length],
                emissiveIntensity: 0.3
            });
            const ornament = new THREE.Mesh(ornamentGeometry, ornamentMaterial);
            ornament.position.set(pos.x, pos.y, pos.z);
            treeGroup.add(ornament);
        });
        
        console.log('Christmas tree created!');
    },
    
    // 创建简单几何体人物（作为后备方案）
    createSimplePerson(personGroup) {
        // 头部（球体）
        const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffdbac,
            metalness: 0.1,
            roughness: 0.8
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 0.7;
        personGroup.add(head);
        
        // 身体（圆柱体）
        const bodyGeometry = new THREE.CylinderGeometry(0.15, 0.18, 0.5, 16);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x6366f1,
            metalness: 0.2,
            roughness: 0.6
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.25;
        personGroup.add(body);
        
        // 左臂
        const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
        const armMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffdbac,
            metalness: 0.1,
            roughness: 0.8
        });
        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.25, 0.3, 0);
        leftArm.rotation.z = Math.PI / 6;
        personGroup.add(leftArm);
        
        // 右臂
        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.25, 0.3, 0);
        rightArm.rotation.z = -Math.PI / 6;
        personGroup.add(rightArm);
        
        // 左腿
        const legGeometry = new THREE.CylinderGeometry(0.06, 0.05, 0.4, 8);
        const leftLeg = new THREE.Mesh(legGeometry, armMaterial);
        leftLeg.position.set(-0.1, -0.2, 0);
        personGroup.add(leftLeg);
        
        // 右腿
        const rightLeg = new THREE.Mesh(legGeometry, armMaterial);
        rightLeg.position.set(0.1, -0.2, 0);
        personGroup.add(rightLeg);
    },
    
    // 创建相机模型（提取为独立方法）
    createCameraModel() {
        const cameraGroup = new THREE.Group();
        
        // 相机机身（立方体）
        const cameraBodyGeometry = new THREE.BoxGeometry(0.25, 0.18, 0.15);
        const cameraBodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x2c2c2c,
            metalness: 0.6,
            roughness: 0.3
        });
        const cameraBody = new THREE.Mesh(cameraBodyGeometry, cameraBodyMaterial);
        cameraGroup.add(cameraBody);
        
        // 镜头（圆柱体）
        const lensGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 16);
        const lensMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x1a1a1a,
            metalness: 0.8,
            roughness: 0.2
        });
        const lens = new THREE.Mesh(lensGeometry, lensMaterial);
        lens.rotation.z = Math.PI / 2;
        lens.position.set(0, 0, -0.15);
        cameraGroup.add(lens);
        
        // 镜头玻璃（深色圆盘）
        const glassGeometry = new THREE.CircleGeometry(0.07, 16);
        const glassMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x0a0a0a,
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0x1a4d7a,
            emissiveIntensity: 0.3
        });
        const glass = new THREE.Mesh(glassGeometry, glassMaterial);
        glass.position.set(0, 0, -0.23);
        cameraGroup.add(glass);
        
        // 取景器（小立方体）
        const viewfinderGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.06);
        const viewfinderMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x1a1a1a,
            metalness: 0.5,
            roughness: 0.4
        });
        const viewfinder = new THREE.Mesh(viewfinderGeometry, viewfinderMaterial);
        viewfinder.position.set(0, 0.13, 0.05);
        cameraGroup.add(viewfinder);
        
        // 闪光灯（小圆柱）
        const flashGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8);
        const flashMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.5
        });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.set(-0.1, 0.1, 0);
        cameraGroup.add(flash);
        
        return cameraGroup;
    },
    
    // 动画循环
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        // 更新动画混合器（如果有）
        if (this.mixer) {
            this.mixer.update(0.016); // 约60fps
        }
        
        // 更新角度
        this.angle += 0.01;
        
        // 计算相机在轨道上的位置
        const radius = 2;
        const x = Math.cos(this.angle) * radius;
        const z = Math.sin(this.angle) * radius;
        
        // 更新三个相机的位置和朝向
        // 中间相机（水平拍摄）
        this.cameras[0].position.set(x, 0, z);
        this.cameras[0].lookAt(0, 0, 0);
        this.cameras[0].rotateY(Math.PI);
        
        // 上层相机（斜向下拍摄，相位偏移120度）
        const angleHigh = this.angle + (Math.PI * 2 / 3);
        const xHigh = Math.cos(angleHigh) * radius;
        const zHigh = Math.sin(angleHigh) * radius;
        this.cameras[1].position.set(xHigh, 0.8, zHigh);
        this.cameras[1].lookAt(0, 0.3, 0); // 朝向小人上半身
        this.cameras[1].rotateY(Math.PI);
        
        // 下层相机（斜向上拍摄，相位偏移240度）
        const angleLow = this.angle + (Math.PI * 4 / 3);
        const xLow = Math.cos(angleLow) * radius;
        const zLow = Math.sin(angleLow) * radius;
        this.cameras[2].position.set(xLow, -0.8, zLow);
        this.cameras[2].lookAt(0, -0.3, 0); // 朝向小人下半身
        this.cameras[2].rotateY(Math.PI);
        
        // 轨道路径轻微脉动
        const scale = 1 + Math.sin(this.angle * 2) * 0.02;
        this.orbitPath.scale.set(scale, scale, scale);
        this.orbitPathHigh.scale.set(scale, scale, scale);
        this.orbitPathLow.scale.set(scale, scale, scale);
        
        // 渲染场景
        this.renderer.render(this.scene, this.camera);
    },
    
    // 窗口大小变化
    onWindowResize(container) {
        if (!container || !this.renderer || !this.camera) return;
        
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    },
    
    // 清理资源
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.renderer) {
            const container = this.renderer.domElement.parentElement;
            if (container && this.renderer.domElement) {
                container.removeChild(this.renderer.domElement);
            }
            this.renderer.dispose();
            this.renderer = null;
        }
        
        // 清理几何体和材质
        if (this.targetObject) {
            this.targetObject.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        
        if (this.orbitPath) {
            if (this.orbitPath.geometry) this.orbitPath.geometry.dispose();
            if (this.orbitPath.material) this.orbitPath.material.dispose();
        }
        
        if (this.orbitPathHigh) {
            if (this.orbitPathHigh.geometry) this.orbitPathHigh.geometry.dispose();
            if (this.orbitPathHigh.material) this.orbitPathHigh.material.dispose();
        }
        
        if (this.orbitPathLow) {
            if (this.orbitPathLow.geometry) this.orbitPathLow.geometry.dispose();
            if (this.orbitPathLow.material) this.orbitPathLow.material.dispose();
        }
        
        if (this.cameras && Array.isArray(this.cameras)) {
            this.cameras.forEach(camera => {
                if (camera) {
                    camera.traverse((child) => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => m.dispose());
                            } else {
                                child.material.dispose();
                            }
                        }
                    });
                }
            });
        }
        
        console.log('3D demo resources disposed');
    }
};
