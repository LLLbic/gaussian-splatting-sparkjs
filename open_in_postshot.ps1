# Jawset PostShot 快速启动脚本
# 自动查找并打开最新的 Gaussian Splatting 训练结果

param(
    [string]$ModelName = "",
    [switch]$AutoLaunch = $false
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Jawset PostShot 快速启动工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 配置
$OUTPUT_DIR = "c:\Users\dingr\source\repos\gaussian-splatting\output"
$POSTSHOT_EXE = "C:\Program Files\Jawset\PostShot\PostShot.exe"  # 默认安装路径

# 检查输出目录是否存在
if (-not (Test-Path $OUTPUT_DIR)) {
    Write-Host "✗ 错误：输出目录不存在" -ForegroundColor Red
    Write-Host "  路径：$OUTPUT_DIR" -ForegroundColor Gray
    Write-Host ""
    Write-Host "请先运行 Gaussian Splatting 训练" -ForegroundColor Yellow
    exit 1
}

# 查找所有模型
Write-Host "正在搜索训练模型..." -ForegroundColor Yellow
$models = Get-ChildItem -Path $OUTPUT_DIR -Directory

if ($models.Count -eq 0) {
    Write-Host "✗ 未找到任何训练模型" -ForegroundColor Red
    Write-Host ""
    Write-Host "请先运行训练：" -ForegroundColor Yellow
    Write-Host "  python train.py -s <your_dataset>" -ForegroundColor Gray
    exit 1
}

Write-Host "✓ 找到 $($models.Count) 个模型" -ForegroundColor Green
Write-Host ""

# 选择模型
$selectedModel = $null

if ($ModelName -ne "") {
    # 使用指定的模型名称
    $selectedModel = $models | Where-Object { $_.Name -eq $ModelName }
    if (-not $selectedModel) {
        Write-Host "✗ 未找到模型：$ModelName" -ForegroundColor Red
        Write-Host ""
        Write-Host "可用的模型：" -ForegroundColor Yellow
        $models | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }
        exit 1
    }
} elseif ($models.Count -eq 1) {
    # 只有一个模型，自动选择
    $selectedModel = $models[0]
    Write-Host "自动选择模型：$($selectedModel.Name)" -ForegroundColor Green
} else {
    # 多个模型，让用户选择
    Write-Host "找到多个模型，请选择：" -ForegroundColor Cyan
    for ($i = 0; $i -lt $models.Count; $i++) {
        $model = $models[$i]
        $lastModified = $model.LastWriteTime.ToString("yyyy-MM-dd HH:mm")
        Write-Host "  [$($i + 1)] $($model.Name) (最后修改: $lastModified)" -ForegroundColor White
    }
    Write-Host ""
    
    $choice = Read-Host "请输入编号 (1-$($models.Count))"
    $index = [int]$choice - 1
    
    if ($index -lt 0 -or $index -ge $models.Count) {
        Write-Host "✗ 无效的选择" -ForegroundColor Red
        exit 1
    }
    
    $selectedModel = $models[$index]
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "选定模型：$($selectedModel.Name)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 查找 point_cloud 目录
$pointCloudDir = Join-Path $selectedModel.FullName "point_cloud"

if (-not (Test-Path $pointCloudDir)) {
    Write-Host "✗ 错误：未找到 point_cloud 目录" -ForegroundColor Red
    Write-Host "  路径：$pointCloudDir" -ForegroundColor Gray
    Write-Host ""
    Write-Host "该模型可能训练未完成" -ForegroundColor Yellow
    exit 1
}

# 查找所有迭代
$iterations = Get-ChildItem -Path $pointCloudDir -Directory | Where-Object { $_.Name -like "iteration_*" }

if ($iterations.Count -eq 0) {
    Write-Host "✗ 未找到任何迭代检查点" -ForegroundColor Red
    exit 1
}

# 按迭代次数排序，选择最高的
$sortedIterations = $iterations | Sort-Object { 
    [int]($_.Name -replace "iteration_", "") 
} -Descending

Write-Host "可用的迭代：" -ForegroundColor Yellow
foreach ($iter in $sortedIterations) {
    $iterNum = $iter.Name -replace "iteration_", ""
    $plyFile = Join-Path $iter.FullName "point_cloud.ply"
    if (Test-Path $plyFile) {
        $size = (Get-Item $plyFile).Length / 1MB
        Write-Host "  - $($iter.Name) (文件大小: $([math]::Round($size, 2)) MB)" -ForegroundColor Gray
    }
}
Write-Host ""

# 选择最高迭代
$latestIteration = $sortedIterations[0]
$plyPath = Join-Path $latestIteration.FullName "point_cloud.ply"

if (-not (Test-Path $plyPath)) {
    Write-Host "✗ 错误：未找到 .ply 文件" -ForegroundColor Red
    Write-Host "  路径：$plyPath" -ForegroundColor Gray
    exit 1
}

# 显示文件信息
$fileInfo = Get-Item $plyPath
$fileSizeMB = $fileInfo.Length / 1MB

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "找到训练结果！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "迭代：$($latestIteration.Name)" -ForegroundColor White
Write-Host "文件：$($fileInfo.Name)" -ForegroundColor White
Write-Host "大小：$([math]::Round($fileSizeMB, 2)) MB" -ForegroundColor White
Write-Host "路径：" -ForegroundColor White
Write-Host "  $plyPath" -ForegroundColor Gray
Write-Host ""

# 在文件资源管理器中打开
Write-Host "正在打开文件位置..." -ForegroundColor Yellow
explorer.exe /select,"$plyPath"
Write-Host "✓ 已在资源管理器中打开" -ForegroundColor Green
Write-Host ""

# 检查 PostShot 是否安装
if (Test-Path $POSTSHOT_EXE) {
    Write-Host "检测到 Jawset PostShot 安装" -ForegroundColor Green
    Write-Host "路径：$POSTSHOT_EXE" -ForegroundColor Gray
    Write-Host ""
    
    if ($AutoLaunch) {
        Write-Host "正在启动 PostShot..." -ForegroundColor Yellow
        Start-Process $POSTSHOT_EXE -ArgumentList "`"$plyPath`""
        Write-Host "✓ PostShot 已启动" -ForegroundColor Green
    } else {
        $launch = Read-Host "是否启动 PostShot 并打开此文件? (Y/N)"
        if ($launch -eq "Y" -or $launch -eq "y") {
            Write-Host "正在启动 PostShot..." -ForegroundColor Yellow
            Start-Process $POSTSHOT_EXE -ArgumentList "`"$plyPath`""
            Write-Host "✓ PostShot 已启动" -ForegroundColor Green
        }
    }
} else {
    Write-Host "! 未检测到 PostShot 安装" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "请手动操作：" -ForegroundColor Cyan
    Write-Host "1. 打开 Jawset PostShot" -ForegroundColor White
    Write-Host "2. 将上述 .ply 文件拖入 PostShot 窗口" -ForegroundColor White
    Write-Host "   或使用 File → Open 菜单打开" -ForegroundColor White
    Write-Host ""
    Write-Host "下载 PostShot：" -ForegroundColor Cyan
    Write-Host "https://www.jawset.com/public_download/jawset.postshot/win/" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "使用提示：" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "• 在 PostShot 中导航：" -ForegroundColor White
Write-Host "  - 旋转：鼠标左键拖动" -ForegroundColor Gray
Write-Host "  - 平移：鼠标中键或 Shift+左键" -ForegroundColor Gray
Write-Host "  - 缩放：鼠标滚轮" -ForegroundColor Gray
Write-Host ""
Write-Host "• 查看其他迭代：" -ForegroundColor White
Write-Host "  - 在 PostShot 中使用 File → Import" -ForegroundColor Gray
Write-Host "  - 或重新运行此脚本选择不同模型" -ForegroundColor Gray
Write-Host ""
Write-Host "完成！" -ForegroundColor Green
