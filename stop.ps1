# Clothora 快捷停止脚本

Write-Host "Stopping Clothora dev servers..." -ForegroundColor Cyan

$pidFile = Join-Path $PSScriptRoot ".dev-pids"

if (Test-Path $pidFile) {
    $pids = Get-Content $pidFile
    foreach ($pid in $pids) {
        if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
            Stop-Process -Id $pid -Force
            Write-Host "Stopped process $pid" -ForegroundColor Green
        }
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

# Fallback: kill by process name
Get-Process -Name "node" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'nodemon|vite' } |
    ForEach-Object { Stop-Process -Id $_.Id -Force; Write-Host "Stopped $($_.ProcessName) [$($_.Id)]" -ForegroundColor Green }

Write-Host "All dev servers stopped." -ForegroundColor Cyan
