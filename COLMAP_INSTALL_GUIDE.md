# COLMAP Windows 安装指南

## 📦 快速安装（推荐）

### 方法 1：使用自动安装脚本

1. **以管理员身份运行 PowerShell**

   - 按 `Win + X`，选择 "Windows PowerShell (管理员)"

2. **允许脚本执行**（如果是首次运行脚本）

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

3. **运行安装脚本**

   ```powershell
   cd "c:\Users\dingr\source\repos\gaussian-splatting"
   .\install_colmap_windows.ps1
   ```

4. **按照提示选择版本**

   - 选项 1: COLMAP with CUDA (有 NVIDIA GPU 推荐，246 MB)
   - 选项 2: COLMAP without CUDA (无 NVIDIA GPU，90.7 MB)

5. **等待安装完成**，然后重启 PowerShell

---

## 🔧 方法 2：手动下载安装

### 步骤 1: 下载 COLMAP

访问 GitHub Releases 页面：

```
https://github.com/colmap/colmap/releases/tag/3.13.0
```

根据您的系统选择下载：

**有 NVIDIA GPU（推荐）：**

- 文件名: `colmap-x64-windows-cuda.zip`
- 大小: 246 MB
- 直接下载链接:
  ```
  https://github.com/colmap/colmap/releases/download/3.13.0/colmap-x64-windows-cuda.zip
  ```

**无 NVIDIA GPU 或仅使用 CPU：**

- 文件名: `colmap-x64-windows-nocuda.zip`
- 大小: 90.7 MB
- 直接下载链接:
  ```
  https://github.com/colmap/colmap/releases/download/3.13.0/colmap-x64-windows-nocuda.zip
  ```

### 步骤 2: 解压文件

1. 将下载的 ZIP 文件解压到您选择的位置，例如：

   ```
   C:\Program Files\COLMAP
   ```

2. 解压后的目录结构应该类似：
   ```
   C:\Program Files\COLMAP\
   ├── bin\
   │   ├── colmap.bat
   │   ├── colmap.exe
   │   └── ...
   ├── lib\
   └── share\
   ```

### 步骤 3: 添加到系统 PATH

**方式 A：通过图形界面**

1. 右键点击 "此电脑" → "属性"
2. 点击 "高级系统设置"
3. 点击 "环境变量"
4. 在 "用户变量" 或 "系统变量" 中找到 `Path`
5. 点击 "编辑" → "新建"
6. 添加路径：`C:\Program Files\COLMAP\bin`
7. 点击 "确定" 保存

**方式 B：使用 PowerShell**

```powershell
# 添加到用户 PATH
$colmapPath = "C:\Program Files\COLMAP\bin"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$currentPath;$colmapPath", "User")

# 更新当前会话
$env:Path = "$env:Path;$colmapPath"
```

### 步骤 4: 验证安装

打开新的 PowerShell 或命令提示符窗口：

```powershell
# 检查 COLMAP 是否可用
colmap -h

# 查看版本
colmap --version

# 启动 GUI（可选）
colmap gui
```

如果看到 COLMAP 的帮助信息，说明安装成功！

---

## 🚀 在 Gaussian Splatting 中使用

### 测试 COLMAP 集成

```powershell
# 进入项目目录
cd "c:\Users\dingr\source\repos\gaussian-splatting"

# 激活 Conda 环境
conda activate gaussian_splatting

# 测试 convert.py 脚本（需要准备图像数据）
python convert.py -s <your_image_folder>
```

### 示例：处理自己的图像

1. **准备图像文件夹**

   ```
   my_scene/
   └── input/
       ├── IMG_001.jpg
       ├── IMG_002.jpg
       ├── IMG_003.jpg
       └── ...
   ```

2. **运行 COLMAP 处理**

   ```powershell
   python convert.py -s my_scene
   ```

3. **处理完成后的结构**

   ```
   my_scene/
   ├── input/          # 原始图像
   ├── images/         # 去畸变后的图像
   ├── sparse/         # COLMAP 重建结果
   │   └── 0/
   │       ├── cameras.bin
   │       ├── images.bin
   │       └── points3D.bin
   └── distorted/      # 临时文件
   ```

4. **开始训练**
   ```powershell
   python train.py -s my_scene
   ```

---

## 🛠️ 故障排除

### 问题 1: "colmap 不是内部或外部命令"

**解决方案：**

1. 确认 COLMAP 已添加到 PATH
2. 重启 PowerShell 或命令提示符
3. 检查路径是否正确：
   ```powershell
   $env:Path -split ';' | Select-String "COLMAP"
   ```

### 问题 2: CUDA 版本运行错误

**解决方案：**

- 如果出现 CUDA 相关错误，下载并使用 no-CUDA 版本
- 或者更新 NVIDIA 驱动程序

### 问题 3: convert.py 找不到 COLMAP

**解决方案：**

```powershell
# 手动指定 COLMAP 路径
python convert.py -s my_scene --colmap_executable "C:\Program Files\COLMAP\bin\colmap.bat"
```

### 问题 4: 缺少 DLL 文件

**解决方案：**
安装 Visual C++ Redistributable:

```
https://aka.ms/vs/17/release/vc_redist.x64.exe
```

---

## 📋 版本信息

- **当前最新版本**: COLMAP 3.13.0 (2025-11-07)
- **支持系统**: Windows 10/11 (64-bit)
- **CUDA 版本**: 需要 CUDA 11.x 或更高版本（仅 CUDA 版本）

---

## 🔗 相关链接

- **官方网站**: https://colmap.github.io/
- **GitHub 仓库**: https://github.com/colmap/colmap
- **文档**: https://colmap.github.io/tutorial.html
- **发布页面**: https://github.com/colmap/colmap/releases

---

## ✅ 安装检查清单

- [ ] 下载正确的 COLMAP 版本（CUDA 或 no-CUDA）
- [ ] 解压到合适的目录
- [ ] 添加到系统 PATH
- [ ] 重启 PowerShell/命令提示符
- [ ] 验证安装：`colmap -h`
- [ ] 测试 GUI：`colmap gui`
- [ ] 在 Gaussian Splatting 中测试：`python convert.py -s <folder>`

---

## 💡 提示

1. **CUDA vs No-CUDA**: 如果有 NVIDIA GPU，强烈推荐使用 CUDA 版本，速度快很多
2. **磁盘空间**: 确保有足够空间存储 COLMAP 输出（通常是输入图像的 2-3 倍）
3. **图像质量**: 使用高质量、清晰的图像可以获得更好的重建效果
4. **图像数量**: 建议至少 20-50 张不同角度的照片

---

安装完成后，您就可以开始使用 COLMAP 进行 3D 重建了！
