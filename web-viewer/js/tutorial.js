// 教程系统
window.tutorial = {
    currentStep: 0,
    totalSteps: 5,
    isActive: false,
    
    steps: [
        {
            title: "欢迎来到 Lethe River",
            icon: "🎬",
            description: "让我们一起学习如何拍摄高质量的视频来定格美好时光",
            tips: [
                "整个过程只需要 2-3 分钟",
                "请准备好您的手机或相机",
                "确保拍摄对象周围有足够空间"
            ],
            animation: "fade-in"
        },
        {
            title: "选择合适的拍摄对象",
            icon: "🎯",
            description: "选择一个您想要 3D 重建的物体或场景",
            tips: [
                "✅ 推荐：静态物体（雕塑、家具、建筑）",
                "✅ 物体表面有纹理和细节",
                "✅ 大小适中，便于环绕拍摄",
                "❌ 避免：透明、反光或纯色物体",
                "❌ 避免：移动的人或动物"
            ],
            animation: "slide-in-right"
        },
        {
            title: "确保充足的光线",
            icon: "💡",
            description: "良好的光线是成功重建的关键",
            tips: [
                "🌞 使用自然光或均匀的室内照明",
                "✨ 避免强烈的阴影和高光",
                "🔆 确保物体各个角度光线一致",
                "❌ 不要逆光拍摄",
                "❌ 避免频闪的光源"
            ],
            animation: "slide-in-right"
        },
        {
            title: "环绕拍摄技巧",
            icon: "🔄",
            description: "以物体为中心，进行多角度环绕拍摄",
            tips: [
                "📹 保持相机稳定，匀速移动",
                "🔄 完整环绕物体 360°",
                "📏 保持与物体的距离一致",
                "⬆️ 从多个不同高度和角度拍摄",
                "⏱️ 每圈大约 30-60 秒",
                "❌ 避免快速移动或抖动"
            ],
            animation: "slide-in-right",
            hasDemo: true
        },
        {
            title: "开始拍摄！",
            icon: "🎥",
            description: "现在您已经准备好了，让我们开始拍摄",
            tips: [
                "📱 打开相机，设置为视频模式",
                "🎬 点击录制，开始环绕拍摄",
                "✅ 记住：稳定、匀速、多角度",
                "⏹️ 完成后停止录制",
                "📤 上传视频到本系统"
            ],
            animation: "slide-in-right",
            isLastStep: true
        }
    ],
    
    // 开始教程
    start() {
        this.isActive = true;
        this.currentStep = 0;
        this.showTutorial();
        document.getElementById('tutorialOverlay').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },
    
    // 显示当前步骤
    showTutorial() {
        const step = this.steps[this.currentStep];
        const container = document.getElementById('tutorialContent');
        
        // 清理之前的 3D 演示
        if (typeof tutorialDemo !== 'undefined' && tutorialDemo.renderer) {
            tutorialDemo.dispose();
        }
        
        // 创建步骤内容
        let tipsHtml = step.tips.map(tip => `<li>${tip}</li>`).join('');
        
        let demoHtml = '';
        if (step.hasDemo) {
            demoHtml = `
                <div class="tutorial-demo">
                    <div id="tutorial-3d-demo" class="demo-3d-container"></div>
                    <p class="demo-label">环绕拍摄 3D 示意图</p>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div class="tutorial-step ${step.animation}">
                <div class="step-header">
                    <div class="step-icon">${step.icon}</div>
                    <h2>${step.title}</h2>
                    <p class="step-description">${step.description}</p>
                </div>
                ${demoHtml}
                <div class="step-content">
                    <ul class="tips-list">
                        ${tipsHtml}
                    </ul>
                </div>
                <div class="step-progress">
                    <div class="progress-dots">
                        ${this.steps.map((_, i) => `
                            <div class="dot ${i === this.currentStep ? 'active' : ''} ${i < this.currentStep ? 'completed' : ''}"></div>
                        `).join('')}
                    </div>
                    <p class="progress-text">步骤 ${this.currentStep + 1} / ${this.totalSteps}</p>
                </div>
                <div class="step-actions">
                    ${this.currentStep > 0 ? '<button class="btn btn-secondary" onclick="tutorial.prev()">上一步</button>' : ''}
                    ${!step.isLastStep ? 
                        '<button class="btn btn-primary" onclick="tutorial.next()">下一步</button>' : 
                        '<button class="btn btn-primary" onclick="tutorial.finish()">开始上传</button>'
                    }
                    <button class="btn-text" onclick="tutorial.skip()">跳过教程</button>
                </div>
            </div>
        `;
        
        // 触发动画
        setTimeout(() => {
            container.querySelector('.tutorial-step').classList.add('active');
            
            // 如果有 3D 演示，初始化 Three.js 场景
            if (step.hasDemo) {
                setTimeout(() => {
                    tutorialDemo.init('tutorial-3d-demo');
                }, 100);
            }
        }, 50);
    },
    
    // 下一步
    next() {
        if (this.currentStep < this.totalSteps - 1) {
            this.currentStep++;
            this.showTutorial();
        }
    },
    
    // 上一步
    prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showTutorial();
        }
    },
    
    // 跳过教程
    skip() {
        if (confirm('确定要跳过教程吗？您可以随时点击"查看教程"按钮重新查看。')) {
            this.close();
        }
    },
    
    // 完成教程
    finish() {
        this.close();
        showNotification('教程完成！现在可以上传视频了 🎉', 'success');
    },
    
    // 关闭教程
    close() {
        this.isActive = false;
        
        // 清理 3D 演示
        if (tutorialDemo.renderer) {
            tutorialDemo.dispose();
        }
        
        document.getElementById('tutorialOverlay').style.display = 'none';
        document.body.style.overflow = 'auto';
        localStorage.setItem('tutorialCompleted', 'true');
    },
    
    // 检查是否需要显示教程
    checkFirstVisit() {
        const completed = localStorage.getItem('tutorialCompleted');
        if (!completed) {
            // 延迟显示，给页面加载时间
            setTimeout(() => {
                this.start();
            }, 1000);
        }
    }
};

// 页面加载时检查是否需要显示教程
document.addEventListener('DOMContentLoaded', () => {
    tutorial.checkFirstVisit();
});
