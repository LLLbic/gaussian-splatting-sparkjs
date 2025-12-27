// 粒子渲染着色器 - 灵感来自 World Labs
// 创建漂亮的点云粒子效果

const ParticleShader = {
    vertexShader: `
        uniform float uTime;
        uniform float uSize;
        uniform float uPixelRatio;
        
        attribute float aScale;
        attribute vec3 aRandomness;
        
        varying vec3 vColor;
        varying float vAlpha;
        
        void main() {
            // 位置计算
            vec4 modelPosition = modelMatrix * vec4(position, 1.0);
            
            // 添加随机性和动画
            modelPosition.xyz += aRandomness * 0.1 * sin(uTime * 0.5 + position.x * 10.0);
            
            vec4 viewPosition = viewMatrix * modelPosition;
            vec4 projectedPosition = projectionMatrix * viewPosition;
            
            gl_Position = projectedPosition;
            
            // 粒子大小 - 根据距离调整
            float sizeAttenuation = 1.0 / -viewPosition.z;
            gl_PointSize = uSize * aScale * sizeAttenuation * uPixelRatio;
            
            // 颜色变化
            vColor = color;
            
            // 透明度基于距离
            vAlpha = smoothstep(0.0, 1.0, 1.0 - length(viewPosition.xyz) / 20.0);
        }
    `,
    
    fragmentShader: `
        uniform sampler2D uTexture;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uTime;
        
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
            
            // 最终颜色和透明度
            gl_FragColor = vec4(finalColor, alpha * vAlpha * 0.8);
            
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
function createParticleGeometry(count = 10000) {
    const geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const randomness = new Float32Array(count * 3);
    
    const colorInside = new THREE.Color(0x6366f1);
    const colorOutside = new THREE.Color(0x06b6d4);
    
    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        
        // 球形分布
        const radius = Math.random() * 5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = radius * Math.cos(phi);
        
        // 颜色渐变
        const mixedColor = colorInside.clone();
        mixedColor.lerp(colorOutside, radius / 5);
        
        colors[i3] = mixedColor.r;
        colors[i3 + 1] = mixedColor.g;
        colors[i3 + 2] = mixedColor.b;
        
        // 随机缩放
        scales[i] = Math.random() * 0.5 + 0.5;
        
        // 随机性
        randomness[i3] = (Math.random() - 0.5) * 2;
        randomness[i3 + 1] = (Math.random() - 0.5) * 2;
        randomness[i3 + 2] = (Math.random() - 0.5) * 2;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute('aRandomness', new THREE.BufferAttribute(randomness, 3));
    
    return geometry;
}
