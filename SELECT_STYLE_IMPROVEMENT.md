# 下拉框样式优化说明

## ✅ 已完成的改进

### 样式优化

**之前**: 使用内联样式，颜色搭配不协调
```html
<select style="width: 100%; padding: ...; background: rgba(255, 255, 255, 0.05); ...">
```

**现在**: 使用CSS类，与整体主题完美融合
```html
<select id="fpsSelect">
```

### 新增CSS样式

在 `styles.css` 中添加了完整的select样式：

```css
.input-group select {
  /* 基础样式 - 与输入框一致 */
  width: 100%;
  padding: var(--spacing-sm);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 1rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  
  /* 自定义下拉箭头 */
  appearance: none;
  background-image: url("data:image/svg+xml,...");
  background-repeat: no-repeat;
  background-position: right var(--spacing-sm) center;
  padding-right: calc(var(--spacing-sm) * 2 + 12px);
}

/* 悬停效果 */
.input-group select:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

/* 焦点效果 */
.input-group select:focus {
  outline: none;
  border-color: var(--primary-color);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

/* 下拉选项样式 */
.input-group select option {
  background: var(--bg-secondary);
  color: var(--text-primary);
  padding: var(--spacing-sm);
}
```

## 🎨 视觉效果

### 颜色搭配

| 状态 | 背景色 | 边框色 | 文字色 |
|------|--------|--------|--------|
| 默认 | `rgba(255, 255, 255, 0.05)` | `rgba(255, 255, 255, 0.1)` | `#ffffff` |
| 悬停 | `rgba(255, 255, 255, 0.08)` | `rgba(255, 255, 255, 0.2)` | `#ffffff` |
| 焦点 | `rgba(255, 255, 255, 0.08)` | `#6366f1` (主题色) | `#ffffff` |
| 选项 | `#13131a` (深色背景) | - | `#ffffff` |

### 交互效果

1. **悬停 (Hover)**
   - 背景略微变亮
   - 边框更明显
   - 平滑过渡动画

2. **焦点 (Focus)**
   - 紫色主题边框
   - 发光效果 (box-shadow)
   - 背景变亮

3. **自定义箭头**
   - SVG箭头图标
   - 颜色与文字一致
   - 位置固定在右侧

## 🎯 设计理念

### 与主题一致
- ✅ 使用相同的颜色变量
- ✅ 玻璃拟态效果
- ✅ 与输入框风格统一
- ✅ 符合极光主题

### 用户体验
- ✅ 清晰的视觉反馈
- ✅ 平滑的过渡动画
- ✅ 易于识别的状态
- ✅ 良好的可访问性

### 技术优势
- ✅ 使用CSS变量，易于维护
- ✅ 移除内联样式，代码更清晰
- ✅ 自定义下拉箭头，跨浏览器一致
- ✅ 响应式设计

## 📱 浏览器兼容性

| 浏览器 | 支持情况 |
|--------|----------|
| Chrome | ✅ 完全支持 |
| Firefox | ✅ 完全支持 |
| Safari | ✅ 完全支持 |
| Edge | ✅ 完全支持 |

## 🔧 自定义选项

### 修改箭头颜色

在CSS中修改SVG的fill颜色：
```css
background-image: url("data:image/svg+xml,%3Csvg...fill='%23NEW_COLOR'...");
```

### 修改焦点颜色

使用不同的主题色：
```css
.input-group select:focus {
  border-color: var(--accent-color); /* 使用青色 */
}
```

### 修改选项背景

```css
.input-group select option {
  background: #1a1a2e; /* 更深的背景 */
}
```

## 📊 对比效果

### 修改前
```
┌─────────────────────────────┐
│ Frame Rate (FPS)        ▼   │ ← 系统默认样式
├─────────────────────────────┤   颜色不协调
│ 1 FPS (Very Slow)           │   无悬停效果
│ 2 FPS (Slow)                │   无焦点高亮
│ ...                         │
└─────────────────────────────┘
```

### 修改后
```
┌─────────────────────────────┐
│ Frame Rate (FPS)        ▼   │ ← 自定义样式
├─────────────────────────────┤   玻璃拟态效果
│ 10 FPS (Standard)       ✓   │   悬停变亮
│ 15 FPS (Medium)             │   焦点紫色边框
│ ...                         │   平滑动画
└─────────────────────────────┘
```

## 🎨 颜色示例

### 默认状态
- 背景: 半透明白色 (5% 不透明度)
- 边框: 半透明白色 (10% 不透明度)
- 文字: 纯白色

### 悬停状态
- 背景: 半透明白色 (8% 不透明度) ↑
- 边框: 半透明白色 (20% 不透明度) ↑
- 文字: 纯白色

### 焦点状态
- 背景: 半透明白色 (8% 不透明度)
- 边框: 紫色主题色 `#6366f1` ⭐
- 发光: 紫色光晕
- 文字: 纯白色

---

**更新日期**: 2026-02-07
**影响文件**: 
- `web-viewer/css/styles.css` (新增select样式)
- `web-viewer/index.html` (移除内联样式)
