#!/bin/bash
# 餐厅抽奖系统快速管理脚本
# 创建时间: 2025年11月23日

PROJECT_DIR="/home/devbox/project"
SERVICE_NAME="restaurant-lottery-backend"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 显示菜单
show_menu() {
    clear
    echo "======================================"
    echo "  餐厅抽奖系统 - 快速管理工具"
    echo "======================================"
    echo ""
    echo "  1) 查看服务状态"
    echo "  2) 查看详细信息"
    echo "  3) 查看实时日志"
    echo "  4) 重启服务"
    echo "  5) 停止服务"
    echo "  6) 启动服务"
    echo "  7) 健康检查"
    echo "  8) 查看端口占用"
    echo "  9) 清理日志"
    echo "  10) 完全重置服务"
    echo "  0) 退出"
    echo ""
    echo "======================================"
}

# 1. 查看服务状态
check_status() {
    print_info "查看PM2服务状态..."
    pm2 list
    echo ""
    print_info "端口监听状态:"
    netstat -tlnp 2>/dev/null | grep :3000 || echo "3000端口未监听"
}

# 2. 查看详细信息
show_details() {
    print_info "查看服务详细信息..."
    pm2 show $SERVICE_NAME
}

# 3. 查看实时日志
show_logs() {
    print_info "实时查看日志（按Ctrl+C退出）..."
    pm2 logs $SERVICE_NAME --lines 50
}

# 4. 重启服务
restart_service() {
    print_info "重启服务..."
    cd $PROJECT_DIR
    pm2 reload ecosystem.config.js --update-env
    sleep 2
    pm2 save
    print_success "服务已重启并保存状态"
    pm2 list
}

# 5. 停止服务
stop_service() {
    print_warning "停止服务..."
    pm2 stop $SERVICE_NAME
    print_success "服务已停止"
    pm2 list
}

# 6. 启动服务
start_service() {
    print_info "启动服务..."
    cd $PROJECT_DIR
    
    # 检查端口是否被占用
    if netstat -tlnp 2>/dev/null | grep -q :3000; then
        print_warning "端口3000已被占用，尝试停止现有进程..."
        pm2 stop $SERVICE_NAME 2>/dev/null
        sleep 2
    fi
    
    pm2 start ecosystem.config.js
    sleep 3
    pm2 save
    print_success "服务已启动并保存状态"
    pm2 list
}

# 7. 健康检查
health_check() {
    print_info "执行健康检查..."
    echo ""
    
    # API健康检查
    print_info "1️⃣ API健康状态:"
    if curl -s http://localhost:3000/health | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f\"  ✅ 状态: {data['data']['status']}\")
    print(f\"  ✅ 版本: {data['data']['version']}\")
    print(f\"  ✅ 数据库: {data['data']['systems']['database']}\")
    print(f\"  ✅ Redis: {data['data']['systems']['redis']}\")
    print(f\"  ✅ Node.js: {data['data']['systems']['nodejs']}\")
except:
    print('  ❌ API无响应')
" 2>/dev/null; then
        echo ""
    else
        print_error "API健康检查失败"
    fi
    
    # PM2状态检查
    echo ""
    print_info "2️⃣ PM2进程状态:"
    if pm2 list | grep -q "online"; then
        print_success "PM2进程正常运行"
    else
        print_error "PM2进程异常"
    fi
    
    # 端口检查
    echo ""
    print_info "3️⃣ 端口监听状态:"
    if netstat -tlnp 2>/dev/null | grep -q :3000; then
        print_success "3000端口正常监听"
    else
        print_error "3000端口未监听"
    fi
    
    # Redis检查
    echo ""
    print_info "4️⃣ Redis连接状态:"
    if redis-cli ping 2>/dev/null | grep -q "PONG"; then
        print_success "Redis连接正常"
    else
        print_error "Redis连接失败"
    fi
}

# 8. 查看端口占用
check_port() {
    print_info "查看3000端口占用情况..."
    netstat -tlnp 2>/dev/null | grep :3000
    echo ""
    print_info "相关进程信息:"
    ps aux | grep -E "(node|pm2)" | grep -v grep
}

# 9. 清理日志
clean_logs() {
    print_warning "清理PM2日志..."
    pm2 flush
    print_success "日志已清理"
    
    print_info "项目日志文件:"
    ls -lh $PROJECT_DIR/logs/ 2>/dev/null || print_warning "logs目录不存在"
}

# 10. 完全重置服务
reset_service() {
    print_warning "⚠️  此操作将完全重置服务（删除所有PM2进程并重新启动）"
    read -p "确认执行？(yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_info "操作已取消"
        return
    fi
    
    print_info "停止并删除PM2进程..."
    pm2 delete $SERVICE_NAME 2>/dev/null || print_warning "服务不存在或已停止"
    
    sleep 2
    
    print_info "清理日志..."
    pm2 flush
    
    print_info "重新启动服务..."
    cd $PROJECT_DIR
    pm2 start ecosystem.config.js
    
    sleep 3
    
    print_info "保存PM2状态..."
    pm2 save
    
    print_success "服务重置完成"
    pm2 list
}

# 主程序
main() {
    while true; do
        show_menu
        read -p "请选择操作 [0-10]: " choice
        echo ""
        
        case $choice in
            1) check_status ;;
            2) show_details ;;
            3) show_logs ;;
            4) restart_service ;;
            5) stop_service ;;
            6) start_service ;;
            7) health_check ;;
            8) check_port ;;
            9) clean_logs ;;
            10) reset_service ;;
            0) 
                print_success "退出管理工具"
                exit 0
                ;;
            *)
                print_error "无效的选择，请重试"
                ;;
        esac
        
        echo ""
        read -p "按Enter键继续..." dummy
    done
}

# 如果提供了参数，直接执行对应功能
if [ $# -gt 0 ]; then
    case $1 in
        status) check_status ;;
        restart) restart_service ;;
        start) start_service ;;
        stop) stop_service ;;
        health) health_check ;;
        logs) show_logs ;;
        reset) reset_service ;;
        *)
            echo "用法: $0 [status|restart|start|stop|health|logs|reset]"
            echo "或直接运行脚本进入交互模式"
            exit 1
            ;;
    esac
else
    # 交互模式
    main
fi


