#!/bin/bash

# Claude Rules Compliance Supervisor - 安装脚本
# 自动安装和配置Claude规则监督系统

set -e

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

# 检查运行环境
check_environment() {
    log_info "检查运行环境..."
    
    # 检查Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装，请先安装 Node.js 14+ 版本"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | sed 's/v//')
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1)
    if [ "$MAJOR_VERSION" -lt 14 ]; then
        log_error "Node.js 版本过低 ($NODE_VERSION)，需要 14+ 版本"
        exit 1
    fi
    
    log_success "Node.js 版本: $NODE_VERSION ✓"
    
    # 检查当前目录
    if [ ! -f "package.json" ]; then
        log_warning "未检测到 package.json，确保在项目根目录运行此脚本"
    fi
    
    # 检查.cursor/rules目录
    if [ ! -d ".cursor/rules" ]; then
        log_error ".cursor/rules 目录不存在，请确保规则文档已配置"
        exit 1
    fi
    
    log_success "环境检查完成 ✓"
}

# 创建监督系统目录结构
setup_directories() {
    log_info "创建监督系统目录结构..."
    
    # 创建必要目录
    mkdir -p supervisor/reports
    mkdir -p supervisor/alerts
    mkdir -p supervisor/logs
    mkdir -p supervisor/backups
    
    log_success "目录结构创建完成 ✓"
}

# 设置权限
setup_permissions() {
    log_info "设置文件权限..."
    
    # 设置可执行权限
    chmod +x supervisor/claude_supervisor.js
    chmod +x supervisor/auto_runner.js
    chmod +x supervisor/install.sh
    
    # 设置配置文件权限
    chmod 644 supervisor/config.json
    chmod 644 supervisor/dashboard.html
    
    log_success "文件权限设置完成 ✓"
}

# 验证配置文件
validate_config() {
    log_info "验证配置文件..."
    
    if [ ! -f "supervisor/config.json" ]; then
        log_error "配置文件 supervisor/config.json 不存在"
        exit 1
    fi
    
    # 验证JSON格式
    if ! node -e "JSON.parse(require('fs').readFileSync('supervisor/config.json', 'utf8'))" 2>/dev/null; then
        log_error "配置文件格式错误，请检查 JSON 语法"
        exit 1
    fi
    
    log_success "配置文件验证通过 ✓"
}

# 创建systemd服务（可选）
create_systemd_service() {
    if [ "$EUID" -eq 0 ] && command -v systemctl &> /dev/null; then
        log_info "创建 systemd 服务..."
        
        CURRENT_DIR=$(pwd)
        SERVICE_FILE="/etc/systemd/system/claude-supervisor.service"
        
        cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Claude Rules Compliance Supervisor
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$CURRENT_DIR
ExecStart=/usr/bin/node supervisor/auto_runner.js start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
        
        systemctl daemon-reload
        systemctl enable claude-supervisor
        
        log_success "systemd 服务创建完成 ✓"
        log_info "使用以下命令管理服务:"
        log_info "  启动: sudo systemctl start claude-supervisor"
        log_info "  停止: sudo systemctl stop claude-supervisor"
        log_info "  状态: sudo systemctl status claude-supervisor"
    else
        log_warning "跳过 systemd 服务创建（需要 root 权限或不支持 systemd）"
    fi
}

# 创建启动脚本
create_startup_scripts() {
    log_info "创建启动脚本..."
    
    # 创建启动脚本
    cat > supervisor/start.sh << 'EOF'
#!/bin/bash
# Claude Supervisor 启动脚本

cd "$(dirname "$0")"

echo "🚀 启动 Claude 规则监督系统..."

# 检查是否已在运行
if pgrep -f "auto_runner.js" > /dev/null; then
    echo "⚠️ 监督系统已在运行中"
    exit 1
fi

# 启动监督程序
nohup node auto_runner.js start > logs/supervisor.log 2>&1 &
PID=$!

echo "✅ 监督系统已启动 (PID: $PID)"
echo "📊 仪表板: file://$(pwd)/dashboard.html"
echo "📋 日志: tail -f logs/supervisor.log"

# 等待启动完成
sleep 3

# 检查启动状态
if kill -0 $PID 2>/dev/null; then
    echo "🟢 监督系统运行正常"
    echo "PID: $PID" > logs/supervisor.pid
else
    echo "❌ 监督系统启动失败，请检查日志"
    exit 1
fi
EOF

    # 创建停止脚本
    cat > supervisor/stop.sh << 'EOF'
#!/bin/bash
# Claude Supervisor 停止脚本

cd "$(dirname "$0")"

echo "🛑 停止 Claude 规则监督系统..."

# 查找进程并停止
if pgrep -f "auto_runner.js" > /dev/null; then
    pkill -f "auto_runner.js"
    echo "✅ 监督系统已停止"
    
    # 清理PID文件
    rm -f logs/supervisor.pid
else
    echo "⚠️ 监督系统未在运行"
fi
EOF

    # 创建状态检查脚本
    cat > supervisor/status.sh << 'EOF'
#!/bin/bash
# Claude Supervisor 状态检查脚本

cd "$(dirname "$0")"

echo "📊 Claude 规则监督系统状态"
echo "================================"

# 检查进程状态
if pgrep -f "auto_runner.js" > /dev/null; then
    PID=$(pgrep -f "auto_runner.js")
    echo "🟢 状态: 运行中 (PID: $PID)"
    
    # 显示内存使用
    if command -v ps &> /dev/null; then
        MEMORY=$(ps -o pid,vsz,rss,comm -p $PID | tail -1)
        echo "💾 内存: $MEMORY"
    fi
    
    # 显示运行时间
    if [ -f "logs/supervisor.pid" ]; then
        START_TIME=$(stat -c %Y logs/supervisor.pid)
        CURRENT_TIME=$(date +%s)
        UPTIME=$((CURRENT_TIME - START_TIME))
        HOURS=$((UPTIME / 3600))
        MINUTES=$(((UPTIME % 3600) / 60))
        echo "⏱️ 运行时间: ${HOURS}小时${MINUTES}分钟"
    fi
else
    echo "🔴 状态: 未运行"
fi

# 检查最新报告
if [ -d "reports" ] && [ "$(ls -A reports)" ]; then
    LATEST_REPORT=$(ls -t reports/*.json | head -1)
    if [ -f "$LATEST_REPORT" ]; then
        echo "📄 最新报告: $(basename "$LATEST_REPORT")"
        
        # 提取关键信息
        if command -v node &> /dev/null; then
            SCORE=$(node -e "const data=JSON.parse(require('fs').readFileSync('$LATEST_REPORT','utf8')); console.log(data.compliance_score || 'N/A');")
            VIOLATIONS=$(node -e "const data=JSON.parse(require('fs').readFileSync('$LATEST_REPORT','utf8')); console.log(data.violations_summary?.total || 'N/A');")
            echo "📊 合规分数: $SCORE"
            echo "⚠️ 违规次数: $VIOLATIONS"
        fi
    fi
else
    echo "📄 报告: 无可用报告"
fi

echo "================================"
echo "📋 管理命令:"
echo "  启动: ./start.sh"
echo "  停止: ./stop.sh"
echo "  仪表板: 打开 dashboard.html"
EOF

    # 设置执行权限
    chmod +x supervisor/start.sh
    chmod +x supervisor/stop.sh
    chmod +x supervisor/status.sh
    
    log_success "启动脚本创建完成 ✓"
}

# 运行初始测试
run_initial_test() {
    log_info "运行初始测试..."
    
    # 测试监督程序
    cd supervisor
    if timeout 30 node claude_supervisor.js 2>/dev/null; then
        log_success "监督程序测试通过 ✓"
    else
        log_warning "监督程序测试未完全通过，但安装继续"
    fi
    cd ..
}

# 创建使用说明
create_usage_guide() {
    log_info "创建使用说明..."
    
    cat > supervisor/README.md << 'EOF'
# Claude Rules Compliance Supervisor

## 系统概述

Claude规则遵守监督系统是一个自动化工具，用于监督Claude是否严格遵守全局规则和项目规则。

## 功能特性

- ✅ **自动监督**: 定期检查Claude的行为是否符合规则
- 📊 **合规评分**: 实时计算合规分数，满分100分
- 🚨 **违规检测**: 自动检测各类违规行为并分级处理
- 📈 **趋势分析**: 分析合规性趋势和改进空间
- 💡 **智能建议**: 提供具体的改进建议和优化方案
- 📱 **可视化仪表板**: 美观的Web界面展示监督结果

## 监督范围

### 全局规则监督
- 核心开发规范
- 工具调用优化规范
- 编码处理和Git管理规范
- 会话工作流程标准
- 问题诊断和状态管理规范
- 文档生成和缓存管理规范

### 用户规则监督
- 代码质量要求
- 错误处理规范
- 中文回答要求
- 深度思考要求
- Git操作规范

## 快速开始

### 1. 启动监督系统
```bash
cd supervisor
./start.sh
```

### 2. 查看状态
```bash
./status.sh
```

### 3. 打开仪表板
在浏览器中打开 `dashboard.html` 文件

### 4. 停止系统
```bash
./stop.sh
```

## 高级用法

### 命令行操作
```bash
# 单次检查
node claude_supervisor.js

# 自动运行
node auto_runner.js start

# 查看仪表板数据
node auto_runner.js dashboard

# 检查状态
node auto_runner.js status
```

### 配置修改
编辑 `config.json` 文件可以调整：
- 监控间隔
- 违规阈值
- 规则权重
- 检查项目

### 报告分析
- 报告保存在 `reports/` 目录
- 警报保存在 `alerts/` 目录
- 日志保存在 `logs/` 目录

## 故障排除

### 常见问题

1. **监督程序无法启动**
   - 检查Node.js版本（需要14+）
   - 验证配置文件格式
   - 确保规则文档存在

2. **权限错误**
   - 运行 `chmod +x *.sh` 设置权限
   - 检查文件夹写入权限

3. **配置文件错误**
   - 验证JSON格式
   - 检查规则文件路径

### 日志查看
```bash
# 查看实时日志
tail -f logs/supervisor.log

# 查看错误日志
grep -i error logs/supervisor.log
```

## 系统架构

```
supervisor/
├── claude_supervisor.js    # 核心监督程序
├── auto_runner.js          # 自动运行器
├── config.json            # 配置文件
├── dashboard.html         # 可视化仪表板
├── start.sh              # 启动脚本
├── stop.sh               # 停止脚本
├── status.sh             # 状态检查脚本
├── reports/              # 报告目录
├── alerts/               # 警报目录
└── logs/                 # 日志目录
```

## 性能监控

系统会监控以下性能指标：
- 工具调用次数和效率
- 并行化执行比例
- 重复操作检测
- 响应质量评估
- Git操作合规性
- 代码质量检查

## 定制开发

系统采用模块化设计，支持：
- 自定义规则添加
- 检查逻辑扩展
- 通知方式定制
- 报告格式调整

## 技术支持

如有问题请检查：
1. 系统日志
2. 配置文件
3. 环境变量
4. 权限设置

## 更新日志

- v1.0.0: 初始版本发布
- 支持全面的规则监督
- 提供可视化仪表板
- 实现自动化运行

EOF

    log_success "使用说明创建完成 ✓"
}

# 主安装函数
main() {
    echo ""
    echo "🤖 Claude Rules Compliance Supervisor"
    echo "======================================"
    echo "正在安装Claude规则遵守监督系统..."
    echo ""
    
    # 执行安装步骤
    check_environment
    setup_directories
    setup_permissions
    validate_config
    create_startup_scripts
    create_usage_guide
    run_initial_test
    create_systemd_service
    
    echo ""
    echo "🎉 安装完成!"
    echo "============"
    log_success "Claude规则监督系统已成功安装"
    echo ""
    echo "📋 快速开始:"
    echo "  cd supervisor"
    echo "  ./start.sh          # 启动监督系统"
    echo "  ./status.sh         # 查看状态" 
    echo "  打开 dashboard.html  # 查看仪表板"
    echo ""
    echo "📖 详细说明请查看: supervisor/README.md"
    echo ""
}

# 错误处理
trap 'log_error "安装过程中发生错误，请检查上述日志"; exit 1' ERR

# 运行主函数
main "$@" 