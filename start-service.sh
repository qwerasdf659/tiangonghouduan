#!/bin/bash

# 餐厅积分抽奖系统 v2.0 - PM2服务管理脚本
# 创建时间：2025年08月10日

set -e

SERVICE_NAME="restaurant-lottery-backend"
PROJECT_DIR="/home/devbox/project"

echo "🚀 餐厅积分抽奖系统 v2.0 - 服务管理"
echo "========================================"

case $1 in
  "start")
    echo "📡 启动服务..."
    cd $PROJECT_DIR
    pm2 start ecosystem.config.js
    echo "✅ 服务启动成功！"
    ;;
  "stop")
    echo "🛑 停止服务..."
    pm2 stop $SERVICE_NAME
    echo "✅ 服务已停止！"
    ;;
  "restart")
    echo "🔄 重启服务..."
    pm2 restart $SERVICE_NAME
    echo "✅ 服务重启成功！"
    ;;
  "status")
    echo "📊 服务状态："
    pm2 list
    echo ""
    echo "🔍 健康检查："
    curl -s http://localhost:3000/health | head -c 200
    echo ""
    ;;
  "logs")
    echo "📝 查看服务日志："
    pm2 logs $SERVICE_NAME --lines 50
    ;;
  "health")
    echo "🔍 健康检查："
    curl -s http://localhost:3000/health
    echo ""
    ;;
  "help"|*)
    echo "使用方法: ./start-service.sh [命令]"
    echo ""
    echo "可用命令:"
    echo "  start    - 启动服务"
    echo "  stop     - 停止服务"
    echo "  restart  - 重启服务"
    echo "  status   - 查看服务状态"
    echo "  logs     - 查看服务日志"
    echo "  health   - 健康检查"
    echo "  help     - 显示帮助信息"
    echo ""
    echo "示例:"
    echo "  ./start-service.sh start"
    echo "  ./start-service.sh status"
    echo "  ./start-service.sh logs"
    ;;
esac 