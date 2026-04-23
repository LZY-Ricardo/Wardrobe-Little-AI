#!/bin/bash

# Clothora 一键启动脚本（前后端并行）

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting Clothora dev servers..."

# Start backend in background
(cd "$ROOT_DIR/server" && npm run dev) &
BACKEND_PID=$!

# Start frontend in background
(cd "$ROOT_DIR/client" && npm run dev) &
FRONTEND_PID=$!

echo "Backend  PID: $BACKEND_PID (server - Koa on default port)"
echo "Frontend PID: $FRONTEND_PID (client - Vite on default port)"
echo ""
echo "Press Ctrl+C to stop all servers."

# Wait for Ctrl+C, then kill both
trap "echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
