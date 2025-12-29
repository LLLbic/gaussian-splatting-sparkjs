// 粒子渲染着色器 - 灵感来自 World Labs
// 创建漂亮的点云粒子效果

const ParticleShader = {
    vertexShader: `
        uniform float uTime;
        uniform float uSize;
        uniform float uPixelRatio;
        uniform float uProgress;
        
        attribute float aScale;
        attribute vec3 aRandomness;
        attribute float aLoadOrder; // 新增：加载顺序属性
        
        varying vec3 vColor;
        varying float vAlpha;
        
        void main() {
            // 位置计算
            vec4 modelPosition = modelMatrix * vec4(position, 1.0);
            
            // 逐步出现效果：
            // 使用 aLoadOrder 和 uProgress 决定粒子的显示状态
            // 为了让过程更平滑，我们不仅控制 visibility，还控制缩放和偏移
            
            // 1. 基础可见度
            float visibility = smoothstep(aLoadOrder - 0.1, aLoadOrder, uProgress);
            
            // 2. 动态生长效果：未到达进度的粒子会向中心坍缩，并逐渐向外扩散
            float spawnFactor = clamp((uProgress - aLoadOrder) * 5.0, 0.0, 1.0);
            
            // 粒子在出现时，从中心点扩散出来，并伴随一定的随机抖动
            vec3 spawnOffset = aRandomness * (1.0 - spawnFactor) * 3.0;
            modelPosition.xyz += spawnOffset;
            
            // 添加持续的微小浮动动画
            modelPosition.y += sin(uTime * 0.5 + position.x * 5.0) * 0.05;
            
            vec4 viewPosition = viewMatrix * modelPosition;
            vec4 projectedPosition = projectionMatrix * viewPosition;
            
            gl_Position = projectedPosition;
            
            // 3. 粒子大小控制：
            // a. 基础缩放 aScale
            // b. 距离衰减 sizeAttenuation
            // c. 生长过程中的大小变化 (从 0 变到 1)
            float sizeAttenuation = 1.0 / -viewPosition.z;
            gl_PointSize = uSize * aScale * sizeAttenuation * uPixelRatio * spawnFactor;
            
            // 颜色和透明度
            vColor = color;
            vAlpha = spawnFactor * smoothstep(0.0, 1.0, 1.0 - length(viewPosition.xyz) / 100.0);
        }
    `,
    
    fragmentShader: `
        uniform sampler2D uTexture;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uTime;
        uniform float uOpacity; // 新增：全局透明度控制
        
        varying vec3 vColor;
        varying float vAlpha;
        
        void main() {
            // 创建圆形粒子
            vec2 uv = gl_PointCoord;
            float distanceToCenter = length(uv - vec2(0.5));
            
            // 柔和的边缘
            float alpha = 1.0 - smoothstep(0.3, 0.5, distanceToCenter);
            
            // 发光效果
            float glow = exp(-distanceToCenter * 3.0);
            
            // 颜色混合
            vec3 mixedColor = mix(uColorA, uColorB, sin(uTime * 0.5) * 0.5 + 0.5);
            vec3 finalColor = mix(vColor, mixedColor, 0.3) * glow;
            
            // 最终颜色和透明度，结合 uOpacity 实现平滑淡出
            gl_FragColor = vec4(finalColor, alpha * vAlpha * 0.8 * uOpacity);
            
            // 如果完全透明，丢弃片段
            if (gl_FragColor.a < 0.01) discard;
        }
    `
};

// 创建增强的粒子材质
function createEnhancedParticleMaterial() {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSize: { value: 8.0 },
            uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
            uProgress: { value: 0.0 }, // 新增：全局加载进度
            uOpacity: { value: 1.0 }, // 新增：全局透明度控制
            uColorA: { value: new THREE.Color(0x6366f1) }, // 紫色
            uColorB: { value: new THREE.Color(0x06b6d4) }, // 青色
        },
        vertexShader: ParticleShader.vertexShader,
        fragmentShader: ParticleShader.fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true
    });
    
    return material;
}

// 创建粒子几何体
function createParticleGeometry(count = 20000, sceneKey = 'default') {
    const geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const randomness = new Float32Array(count * 3);
    
    // 基础颜色定义
    const colorA = new THREE.Color();
    const colorB = new THREE.Color();
    
    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        let x, y, z;
        let r, g, b;
        
        if (sceneKey === 'bedroom') {
            // 卧室分布：改为更自然的球形随机分布，不再使用生硬的矩形
            const radius = 3.0 + Math.random() * 2.0;
            const theta = Math.random() * Math.PI * 2.0;
            const phi = Math.acos(2.0 * Math.random() - 1.0);
            
            x = radius * Math.sin(phi) * Math.cos(theta);
            y = radius * Math.sin(phi) * Math.sin(theta);
            z = radius * Math.cos(phi);
            
            // 颜色：温暖的室内色调
            colorA.set(0xd2b48c); // 浅褐色
            colorB.set(0xfff5ee); // 贝壳白
        } else if (sceneKey === 'fireplace') {
            // 壁炉分布：深色房间 + 明亮核心
            const isFire = Math.random() > 0.85;
            if (isFire) {
                x = (Math.random() - 0.5) * 1.2;
                y = Math.random() * 0.8 - 0.5;
                z = -2.5 + (Math.random() - 0.5) * 0.5;
                colorA.set(0xff4500); 
                colorB.set(0xffa500); 
            } else {
                const side = Math.floor(Math.random() * 3);
                if (side === 0) { // Floor
                    x = (Math.random() - 0.5) * 8;
                    y = -0.5;
                    z = (Math.random() - 0.7) * 6;
                    colorA.set(0x3d2b1f);
                    colorB.set(0x1a1a1a);
                } else { // Back wall and sides
                    x = (Math.random() - 0.5) * 8;
                    y = Math.random() * 4 - 0.5;
                    z = -3;
                    colorA.set(0x2f4f4f);
                    colorB.set(0x000000);
                }
            }
        } else if (sceneKey === 'valley') {
            // 山谷分布：起伏地形 + 远山
            const isMountain = Math.random() > 0.6;
            if (isMountain) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 10 + Math.random() * 10;
                x = Math.cos(angle) * radius;
                z = Math.sin(angle) * radius;
                y = Math.random() * 8 + Math.abs(x * 0.2); // 远处山更高
                colorA.set(0x4b3621); // 深褐色
                colorB.set(0x808080); // 灰色
            } else {
                x = (Math.random() - 0.5) * 25;
                z = (Math.random() - 0.5) * 25;
                y = Math.sin(x * 0.2) * 1.5 + Math.cos(z * 0.2) * 1.5 - 2;
                colorA.set(0x228b22);
                colorB.set(0x32cd32);
            }
        } else {
            // 默认球形分布
            const radius = Math.random() * 5;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            x = radius * Math.sin(phi) * Math.cos(theta);
            y = radius * Math.sin(phi) * Math.sin(theta);
            z = radius * Math.cos(phi);
            colorA.set(0x6366f1);
            colorB.set(0x06b6d4);
        }
        
        positions[i3] = x;
        positions[i3 + 1] = y;
        positions[i3 + 2] = z;
        
        const mixedColor = colorA.clone().lerp(colorB, Math.random());
        colors[i3] = mixedColor.r;
        colors[i3 + 1] = mixedColor.g;
        colors[i3 + 2] = mixedColor.b;
        
        scales[i] = Math.random() * 0.5 + 0.5;
        randomness[i3] = (Math.random() - 0.5) * 0.5; // 减小随机偏移，使结构更清晰
        randomness[i3 + 1] = (Math.random() - 0.5) * 0.5;
        randomness[i3 + 2] = (Math.random() - 0.5) * 0.5;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute('aRandomness', new THREE.BufferAttribute(randomness, 3));
    
    return geometry;
}
