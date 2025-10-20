#!/bin/bash
# Sealos数据库异常诊断脚本
# 创建时间：2025年10月13日 23:45 北京时间
# 功能：诊断Sealos数据库为什么无法启动

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Sealos数据库异常诊断${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 读取配置
if [ -f "config.example" ]; then
    source config.example
else
    echo -e "${RED}❌ 找不到 config.example 文件${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 数据库配置信息：${NC}"
echo "   主机: $DB_HOST"
echo "   端口: $DB_PORT"
echo "   数据库: $DB_NAME"
echo "   用户: $DB_USER"
echo ""

# 1. 网络连接测试
echo -e "${YELLOW}1️⃣ 测试网络连接...${NC}"
if ping -c 3 dbconn.sealosbja.site > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ 主机网络可达${NC}"
else
    echo -e "${RED}   ❌ 主机网络不可达${NC}"
    echo -e "${YELLOW}   建议：检查Sealos集群网络状态${NC}"
fi
echo ""

# 2. 端口连接测试
echo -e "${YELLOW}2️⃣ 测试端口连接...${NC}"
if timeout 5 bash -c "cat < /dev/null > /dev/tcp/$DB_HOST/$DB_PORT" 2>/dev/null; then
    echo -e "${GREEN}   ✅ 端口 $DB_PORT 可连接${NC}"
else
    echo -e "${RED}   ❌ 端口 $DB_PORT 无法连接${NC}"
    echo -e "${YELLOW}   可能原因：${NC}"
    echo "   - MySQL容器还在启动中"
    echo "   - MySQL服务异常崩溃"
    echo "   - 端口配置错误"
fi
echo ""

# 3. MySQL连接测试
echo -e "${YELLOW}3️⃣ 测试MySQL连接...${NC}"
if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
    --connect-timeout=5 -e "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ MySQL连接成功${NC}"
    
    # 获取MySQL状态
    echo ""
    echo -e "${YELLOW}   MySQL服务器状态：${NC}"
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
        -e "SHOW STATUS LIKE 'Uptime';" 2>/dev/null | tail -1 | awk '{print "   运行时间: "$2" 秒"}'
    
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
        -e "SHOW STATUS LIKE 'Threads_connected';" 2>/dev/null | tail -1 | awk '{print "   活动连接: "$2}'
    
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
        -e "SELECT VERSION();" 2>/dev/null | tail -1 | awk '{print "   MySQL版本: "$1}'
else
    echo -e "${RED}   ❌ MySQL连接失败${NC}"
    
    ERROR_MSG=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
        --connect-timeout=5 -e "SELECT 1;" 2>&1 | tail -3)
    
    echo -e "${YELLOW}   错误信息：${NC}"
    echo "   $ERROR_MSG"
    echo ""
    
    # 分析常见错误
    if echo "$ERROR_MSG" | grep -q "Can't connect"; then
        echo -e "${YELLOW}   🔍 诊断：数据库服务未启动${NC}"
        echo "   可能原因："
        echo "   1. MySQL容器正在启动中（通常需要2-5分钟）"
        echo "   2. 资源不足导致容器无法启动"
        echo "   3. 配置错误导致启动失败"
        echo ""
        echo -e "${BLUE}   💡 解决建议：${NC}"
        echo "   1. 在Sealos界面查看Pod日志"
        echo "   2. 等待3-5分钟后重试"
        echo "   3. 检查Sealos集群资源使用情况"
        
    elif echo "$ERROR_MSG" | grep -q "Access denied"; then
        echo -e "${YELLOW}   🔍 诊断：密码错误${NC}"
        echo -e "${BLUE}   💡 解决建议：${NC}"
        echo "   1. 在Sealos界面重置数据库密码"
        echo "   2. 更新 config.example 中的 DB_PASSWORD"
        
    elif echo "$ERROR_MSG" | grep -q "timeout"; then
        echo -e "${YELLOW}   🔍 诊断：连接超时${NC}"
        echo -e "${BLUE}   💡 解决建议：${NC}"
        echo "   1. 检查网络连接"
        echo "   2. 检查数据库是否在重启"
        echo "   3. 等待几分钟后重试"
    fi
fi
echo ""

# 4. 数据库可用性测试
echo -e "${YELLOW}4️⃣ 测试数据库可用性...${NC}"
if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
    --connect-timeout=5 -e "USE $DB_NAME; SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ 数据库 $DB_NAME 可访问${NC}"
    
    # 获取表数量
    TABLE_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
        "$DB_NAME" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME';" -s -N 2>/dev/null)
    echo "   数据表数量: $TABLE_COUNT"
else
    echo -e "${RED}   ❌ 数据库 $DB_NAME 不可访问${NC}"
    echo -e "${YELLOW}   可能是数据库还在初始化中${NC}"
fi
echo ""

# 5. 后端服务连接测试
echo -e "${YELLOW}5️⃣ 测试后端服务连接...${NC}"
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
    echo -e "${GREEN}   ✅ 后端服务运行中${NC}"
    echo "   响应: $HEALTH_RESPONSE"
    
    if echo "$HEALTH_RESPONSE" | grep -q '"database":"connected"'; then
        echo -e "${GREEN}   ✅ 后端已连接到数据库${NC}"
    else
        echo -e "${RED}   ❌ 后端无法连接数据库${NC}"
    fi
else
    echo -e "${RED}   ❌ 后端服务未运行${NC}"
    echo -e "${YELLOW}   可能需要启动后端服务: pm2 start all${NC}"
fi
echo ""

# 总结
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}📊 诊断总结${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 判断问题严重程度
CAN_CONNECT_NETWORK=false
CAN_CONNECT_PORT=false
CAN_CONNECT_MYSQL=false
CAN_ACCESS_DB=false

if ping -c 1 dbconn.sealosbja.site > /dev/null 2>&1; then
    CAN_CONNECT_NETWORK=true
fi

if timeout 5 bash -c "cat < /dev/null > /dev/tcp/$DB_HOST/$DB_PORT" 2>/dev/null; then
    CAN_CONNECT_PORT=true
fi

if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
    --connect-timeout=5 -e "SELECT 1;" > /dev/null 2>&1; then
    CAN_CONNECT_MYSQL=true
fi

if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
    --connect-timeout=5 -e "USE $DB_NAME; SELECT 1;" > /dev/null 2>&1; then
    CAN_ACCESS_DB=true
fi

# 根据诊断结果给出建议
if [ "$CAN_ACCESS_DB" = true ]; then
    echo -e "${GREEN}✅ 数据库完全正常，可以进行还原操作${NC}"
    echo ""
    echo -e "${YELLOW}📋 下一步操作：${NC}"
    echo "1. 在Sealos界面选择备份 test-db-20251013150002"
    echo "2. 点击还原按钮"
    echo "3. 等待还原完成"
    echo ""
    
elif [ "$CAN_CONNECT_MYSQL" = true ]; then
    echo -e "${YELLOW}⚠️  MySQL服务正常，但数据库不可访问${NC}"
    echo ""
    echo -e "${YELLOW}📋 建议操作：${NC}"
    echo "1. 等待数据库初始化完成（通常1-3分钟）"
    echo "2. 或者执行还原操作来创建数据库"
    echo ""
    
elif [ "$CAN_CONNECT_PORT" = true ]; then
    echo -e "${YELLOW}⚠️  端口可连接，但MySQL服务未响应${NC}"
    echo ""
    echo -e "${YELLOW}📋 建议操作：${NC}"
    echo "1. 等待MySQL服务启动完成（通常2-5分钟）"
    echo "2. 在Sealos界面查看MySQL容器日志"
    echo "3. 检查容器是否在重启循环"
    echo ""
    
elif [ "$CAN_CONNECT_NETWORK" = true ]; then
    echo -e "${RED}❌ 网络可达但端口无法连接${NC}"
    echo ""
    echo -e "${YELLOW}📋 建议操作：${NC}"
    echo "1. 检查Sealos数据库容器状态"
    echo "2. 查看容器是否正在启动"
    echo "3. 查看容器日志获取启动失败原因"
    echo "4. 检查资源配额是否充足"
    echo ""
    echo -e "${BLUE}💡 在Sealos界面操作：${NC}"
    echo "1. 找到数据库集群 test-db"
    echo "2. 点击详情查看Pod状态"
    echo "3. 查看日志了解启动失败原因"
    echo ""
    
else
    echo -e "${RED}❌ 网络连接失败${NC}"
    echo ""
    echo -e "${YELLOW}📋 建议操作：${NC}"
    echo "1. 检查Sealos集群是否正常运行"
    echo "2. 检查网络配置"
    echo "3. 联系Sealos支持团队"
    echo ""
fi

echo -e "${YELLOW}🔄 持续监控命令：${NC}"
echo "   watch -n 5 'bash $0'"
echo ""

echo -e "${YELLOW}📞 获取更多帮助：${NC}"
echo "1. 查看Sealos数据库日志"
echo "2. 截图错误信息"
echo "3. 提供给技术支持"
echo ""

