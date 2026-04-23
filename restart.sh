#!/bin/bash

# Clothora 快捷重启脚本 - 停止所有开发服务器后重新启动

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Stopping existing dev servers..."
bash "$ROOT_DIR/stop.sh"

sleep 1

echo "Restarting Clothora dev servers..."
bash "$ROOT_DIR/dev.sh"
