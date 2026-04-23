# Clothora 快捷重启脚本

Write-Host "Restarting Clothora dev servers..." -ForegroundColor Cyan
& "$PSScriptRoot\stop.ps1"
Start-Sleep -Seconds 1
& "$PSScriptRoot\dev.ps1"
