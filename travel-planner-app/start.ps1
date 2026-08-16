# 旅行定制助手 - 启动脚本
# 用法：在 PowerShell 中运行  .\start.ps1
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

# 1. 首次运行自动安装依赖（npm 默认缓存目录在 D 盘被沙箱限制，这里重定向到项目内）
if (-not (Test-Path "node_modules")) {
    Write-Host "首次运行，正在安装依赖..." -ForegroundColor Cyan
    npm install --cache (Join-Path $PSScriptRoot ".npm-cache")
}

# 2. 检查 API Key 配置
if (-not (Test-Path ".env")) {
    Write-Warning "未找到 .env，AI 对话功能不可用。请复制 .env.example 为 .env 并填入 LLM_API_KEY。"
}

# 3. 启动开发服务器（端口 3000）
Write-Host "启动开发服务器：http://localhost:3000/" -ForegroundColor Green
npm run dev
