# Clothora 一键启动脚本（前后端并行）

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting Clothora dev servers..." -ForegroundColor Cyan

# Start backend
$backend = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory "$RootDir\server" -PassThru -NoNewWindow
Write-Host "Backend  PID: $($backend.Id) (Koa)" -ForegroundColor Green

# Start frontend
$frontend = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory "$RootDir\client" -PassThru -NoNewWindow
Write-Host "Frontend PID: $($frontend.Id) (Vite)" -ForegroundColor Green

Write-Host ""
Write-Host "Press Ctrl+C to stop all servers." -ForegroundColor Yellow

# Save PIDs for stop script
"$($backend.Id)`n$($frontend.Id)" | Out-File -FilePath "$RootDir\.dev-pids" -Encoding utf8

try {
    # Keep script running
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    Write-Host "Shutting down..." -ForegroundColor Yellow
    Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue
    Stop-Process -Id $frontend.Id -ErrorAction SilentlyContinue
    Remove-Item "$RootDir\.dev-pids" -ErrorAction SilentlyContinue
}
