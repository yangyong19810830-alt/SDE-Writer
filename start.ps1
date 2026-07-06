$ErrorActionPreference = "Stop"

$siteDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $siteDir

if (-not $env:DEEPSEEK_API_KEY) {
  $key = Read-Host "请输入 DeepSeek API Key"
  if (-not $key) {
    Write-Host "没有输入 API Key，已取消启动。"
    exit 1
  }
  $env:DEEPSEEK_API_KEY = $key
}

if (-not $env:PORT) {
  $env:PORT = "5173"
}

$bundledNode = "C:\Users\Fred\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (Test-Path $bundledNode) {
  & $bundledNode server.js
} else {
  & node server.js
}
