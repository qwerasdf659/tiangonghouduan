#!/bin/bash

# 统一进程管理脚本 - 解决端口冲突问题
# 餐厅积分抽奖系统 v4.0

set -e  # 遇到错误立即退出

# 配置
PORT=3000
APP_NAME="restaurant-lottery-backend"
PROJECT_DIR="/home/devbox/project"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查端口占用
check_port_conflicts() {
    log_info "检查端口${PORT}冲突..."
    
    local port_usage=$(netstat -tlnp 2>/dev/null | grep ":${PORT} " || echo "")
    
    if [ -n "$port_usage" ]; then
        log_warning "发现端口${PORT}被占用:"
        echo "$port_usage"
        
        # 提取PID
        local pids=$(echo "$port_usage" | awk '{print $7}' | cut -d'/' -f1 | grep -E '^[0-9]+$' || echo "")
        
        if [ -n "$pids" ]; then
            echo "占用端口的进程PID: $pids"
            return 1
        fi
    else
        log_success "端口${PORT}可用"
        return 0
    fi
}

# 清理端口冲突进程
cleanup_port_conflicts() {
    log_info "清理端口${PORT}冲突进程..."
    
    # 查找占用端口的进程
    local pids=$(netstat -tlnp 2>/dev/null | grep ":${PORT} " | awk '{print $7}' | cut -d'/' -f1 | grep -E '^[0-9]+$' || echo "")
    
    if [ -n "$pids" ]; then
        for pid in $pids; do
            local process_info=$(ps -p $pid -o pid,ppid,cmd --no-headers 2>/dev/null || echo "")
            if [ -n "$process_info" ]; then
                log_warning "终止进程 PID:$pid - $process_info"
                kill -TERM $pid 2>/dev/null || kill -KILL $pid 2>/dev/null || true
                sleep 1
            fi
        done
        log_success "端口冲突进程已清理"
    else
        log_info "未发现端口冲突进程"
    fi
}

# 清理所有相关Node.js进程
cleanup_all_node_processes() {
    log_info "清理所有项目相关Node.js进程..."
    
    # 查找项目相关的Node.js进程（排除Cursor）
    local node_pids=$(ps aux | grep -E "(node.*app\.js|npm.*dev|nodemon)" | grep -v grep | grep -v cursor | awk '{print $2}' || echo "")
    
    if [ -n "$node_pids" ]; then
        for pid in $node_pids; do
            local process_info=$(ps -p $pid -o pid,cmd --no-headers 2>/dev/null || echo "")
            if [ -n "$process_info" ]; then
                log_warning "终止Node.js进程 PID:$pid - $(echo $process_info | cut -c1-80)..."
                kill -TERM $pid 2>/dev/null || kill -KILL $pid 2>/dev/null || true
            fi
        done
        sleep 2
        log_success "Node.js进程已清理"
    else
        log_info "未发现项目相关Node.js进程"
    fi
}

# 检查PM2状态
check_pm2_status() {
    log_info "检查PM2状态..."
    
    if command -v pm2 &> /dev/null; then
        local pm2_list=$(pm2 jlist 2>/dev/null || echo "[]")
        local app_count=$(echo "$pm2_list" | jq ". | length" 2>/dev/null || echo "0")
        
        if [ "$app_count" -gt 0 ]; then
            log_warning "发现PM2管理的应用:"
            pm2 status
            return 1
        else
            log_info "PM2未管理任何应用"
            return 0
        fi
    else
        log_info "PM2未安装"
        return 0
    fi
}

# 停止PM2应用
stop_pm2_apps() {
    log_info "停止PM2应用..."
    
    if command -v pm2 &> /dev/null; then
        pm2 stop all 2>/dev/null || true
        pm2 delete all 2>/dev/null || true
        log_success "PM2应用已停止"
    else
        log_warning "PM2未安装，跳过"
    fi
}

# 智能启动服务
start_service() {
    local mode=${1:-"auto"}
    
    log_info "启动服务模式: $mode"
    
    # 切换到项目目录
    cd "$PROJECT_DIR" || exit 1
    
    case $mode in
        "pm2")
            log_info "使用PM2启动服务..."
            pm2 start ecosystem.config.js
            sleep 3
            pm2 status
            ;;
        "dev")
            log_info "使用nodemon启动开发服务..."
            echo "使用 Ctrl+C 停止服务"
            npm run dev
            ;;
        "prod")
            log_info "使用node直接启动生产服务..."
            npm start
            ;;
        "auto")
            if command -v pm2 &> /dev/null; then
                log_info "检测到PM2，使用PM2启动..."
                start_service "pm2"
            else
                log_info "PM2未安装，使用nodemon启动开发服务..."
                start_service "dev"
            fi
            ;;
        *)
            log_error "未知启动模式: $mode"
            echo "可用模式: pm2, dev, prod, auto"
            exit 1
            ;;
    esac
}

# 显示服务状态
show_status() {
    log_info "系统状态检查..."
    
    echo "=== 端口状态 ==="
    netstat -tlnp 2>/dev/null | grep ":${PORT} " || echo "端口${PORT}未被占用"
    
    echo ""
    echo "=== Node.js进程 ==="
    ps aux | grep -E "(node.*app\.js|npm.*dev|nodemon)" | grep -v grep | grep -v cursor || echo "未发现项目相关Node.js进程"
    
    echo ""
    echo "=== PM2状态 ==="
    if command -v pm2 &> /dev/null; then
        pm2 status
    else
        echo "PM2未安装"
    fi
    
    echo ""
    echo "=== 服务健康检查 ==="
    if curl -s -m 5 http://localhost:${PORT}/health >/dev/null 2>&1; then
        log_success "服务正在运行并响应健康检查"
    else
        log_warning "服务未运行或健康检查失败"
    fi
}

# 完整的清理和重启
full_restart() {
    local mode=${1:-"auto"}
    
    log_info "执行完整清理和重启..."
    
    # 1. 停止所有相关服务
    stop_pm2_apps
    cleanup_all_node_processes
    cleanup_port_conflicts
    
    # 2. 等待进程清理完成
    sleep 3
    
    # 3. 验证清理结果
    if check_port_conflicts; then
        log_success "端口清理成功"
    else
        log_error "端口清理失败，请检查"
        exit 1
    fi
    
    # 4. 启动服务
    start_service "$mode"
}

# 主函数
main() {
    local command=${1:-"status"}
    
    echo "=================================="
    echo "  统一进程管理工具 v1.0"
    echo "  解决端口冲突和进程管理问题"
    echo "=================================="
    echo ""
    
    case $command in
        "status"|"check")
            show_status
            ;;
        "cleanup")
            stop_pm2_apps
            cleanup_all_node_processes
            cleanup_port_conflicts
            log_success "清理完成"
            ;;
        "start")
            local mode=${2:-"auto"}
            if check_port_conflicts; then
                start_service "$mode"
            else
                log_warning "检测到端口冲突，执行自动清理..."
                full_restart "$mode"
            fi
            ;;
        "restart")
            local mode=${2:-"auto"}
            full_restart "$mode"
            ;;
        "stop")
            stop_pm2_apps
            cleanup_all_node_processes
            log_success "服务已停止"
            ;;
        "help"|"--help"|"-h")
            echo "用法: $0 <command> [options]"
            echo ""
            echo "命令:"
            echo "  status          显示当前状态"
            echo "  cleanup         清理所有冲突进程"
            echo "  start [mode]    启动服务 (auto|pm2|dev|prod)"
            echo "  restart [mode]  重启服务 (auto|pm2|dev|prod)"
            echo "  stop            停止所有服务"
            echo "  help            显示帮助信息"
            echo ""
            echo "示例:"
            echo "  $0 status              # 检查状态"
            echo "  $0 start pm2           # 使用PM2启动"
            echo "  $0 restart dev         # 重启为开发模式"
            echo "  $0 cleanup             # 清理冲突进程"
            ;;
        *)
            log_error "未知命令: $command"
            echo "使用 '$0 help' 查看帮助信息"
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@" 