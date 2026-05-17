# Clothora 快捷停止脚本

Write-Host "Stopping Clothora dev servers..." -ForegroundColor Cyan

$pidFile = Join-Path $PSScriptRoot ".dev-pids"

if (Test-Path $pidFile) {
    $processIds = Get-Content $pidFile
    foreach ($processId in $processIds) {
        if ($processId -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
            Stop-Process -Id $processId -Force
            Write-Host "Stopped process $processId" -ForegroundColor Green
        }
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

# Fallback: kill by process name
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'nodemon|vite' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "Stopped node [$($_.ProcessId)]" -ForegroundColor Green }

Write-Host "All dev servers stopped." -ForegroundColor Cyan
