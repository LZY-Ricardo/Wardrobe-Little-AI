#!/bin/bash

# Clothora 快捷停止脚本 - 终止所有 node 开发服务器进程

echo "Stopping Clothora dev servers..."

# Kill nodemon and vite dev server processes
pkill -f "nodemon app.js" 2>/dev/null && echo "Backend (nodemon) stopped." || echo "Backend not running."
pkill -f "vite" 2>/dev/null && echo "Frontend (vite) stopped." || echo "Frontend not running."

echo "All dev servers stopped."
