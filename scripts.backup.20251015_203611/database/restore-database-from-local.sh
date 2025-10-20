#!/bin/bash
# 数据库还原脚本 - 使用本地备份文件
# 创建时间：2025年10月13日 23:30 北京时间
# 功能：从本地SQL备份文件还原Sealos数据库

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}数据库还原脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 读取环境变量
if [ -f "config.example" ]; then
    echo -e "${YELLOW}📋 读取数据库配置...${NC}"
    source config.example
else
    echo -e "${RED}❌ 错误：找不到 config.example 文件${NC}"
    exit 1
fi

# 确认数据库配置
echo -e "${YELLOW}📊 数据库连接信息：${NC}"
echo "   主机: $DB_HOST"
echo "   端口: $DB_PORT"
echo "   数据库: $DB_NAME"
echo "   用户: $DB_USER"
echo ""

# 检查备份文件
BACKUP_FILE="backups/COMPLETE_BACKUP_2025-10-13T17-19-15-446Z.sql"

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ 错误：找不到备份文件${NC}"
    echo "   期望位置: $BACKUP_FILE"
    echo ""
    echo -e "${YELLOW}可用的备份文件：${NC}"
    ls -lh backups/*.sql 2>/dev/null || echo "   没有找到SQL备份文件"
    exit 1
fi

echo -e "${GREEN}✅ 找到备份文件：${NC}"
echo "   文件: $BACKUP_FILE"
echo "   大小: $(du -h "$BACKUP_FILE" | cut -f1)"
echo ""

# 最后确认
echo -e "${RED}⚠️  警告：此操作将完全覆盖数据库 $DB_NAME 的所有数据！${NC}"
echo -e "${RED}⚠️  警告：此操作无法撤销！${NC}"
echo ""
read -p "确认要继续吗？(输入 YES 继续): " CONFIRM

if [ "$CONFIRM" != "YES" ]; then
    echo -e "${YELLOW}❌ 操作已取消${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}🔄 开始还原数据库...${NC}"
echo ""

# 停止服务
echo -e "${YELLOW}1️⃣ 停止后端服务...${NC}"
pm2 stop all 2>/dev/null || echo "   (pm2服务未运行)"
sleep 2
echo -e "${GREEN}   ✅ 服务已停止${NC}"
echo ""

# 测试数据库连接
echo -e "${YELLOW}2️⃣ 测试数据库连接...${NC}"
if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ 数据库连接成功${NC}"
else
    echo -e "${RED}   ❌ 数据库连接失败${NC}"
    echo -e "${RED}   请检查数据库配置和密码${NC}"
    exit 1
fi
echo ""

# 创建临时备份（以防万一）
echo -e "${YELLOW}3️⃣ 创建当前数据库的临时备份...${NC}"
TEMP_BACKUP="backups/temp_before_restore_$(date +%Y%m%d_%H%M%S).sql"
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
    --single-transaction --quick --lock-tables=false \
    "$DB_NAME" > "$TEMP_BACKUP" 2>/dev/null || {
    echo -e "${YELLOW}   ⚠️  无法创建临时备份（可能数据库为空）${NC}"
}

if [ -f "$TEMP_BACKUP" ]; then
    echo -e "${GREEN}   ✅ 临时备份已创建: $TEMP_BACKUP${NC}"
else
    echo -e "${YELLOW}   ⚠️  未创建临时备份${NC}"
fi
echo ""

# 清空现有数据库
echo -e "${YELLOW}4️⃣ 清空现有数据库...${NC}"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
    -e "DROP DATABASE IF EXISTS $DB_NAME; CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" || {
    echo -e "${RED}   ❌ 清空数据库失败${NC}"
    exit 1
}
echo -e "${GREEN}   ✅ 数据库已清空并重新创建${NC}"
echo ""

# 还原数据
echo -e "${YELLOW}5️⃣ 还原备份数据...${NC}"
echo "   (这可能需要几分钟，请耐心等待...)"
echo ""

# 显示进度
pv "$BACKUP_FILE" 2>/dev/null | mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" || \
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$BACKUP_FILE" || {
    echo -e "${RED}   ❌ 数据还原失败${NC}"
    echo ""
    echo -e "${YELLOW}尝试回滚到临时备份...${NC}"
    if [ -f "$TEMP_BACKUP" ]; then
        mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$TEMP_BACKUP"
        echo -e "${GREEN}   ✅ 已回滚到还原前的状态${NC}"
    fi
    exit 1
}

echo ""
echo -e "${GREEN}   ✅ 数据还原完成${NC}"
echo ""

# 验证还原结果
echo -e "${YELLOW}6️⃣ 验证还原结果...${NC}"
TABLE_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME';" -s -N)
echo "   表数量: $TABLE_COUNT"

if [ "$TABLE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}   ✅ 数据表已成功还原${NC}"
    
    # 检查关键表
    echo ""
    echo -e "${YELLOW}   检查关键数据表：${NC}"
    
    # 用户表
    USER_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -e "SELECT COUNT(*) FROM users;" -s -N 2>/dev/null || echo "0")
    echo "   - users: $USER_COUNT 条记录"
    
    # 商品表
    PRODUCT_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -e "SELECT COUNT(*) FROM products;" -s -N 2>/dev/null || echo "0")
    echo "   - products: $PRODUCT_COUNT 条记录"
    
    # 抽奖记录表
    LOTTERY_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -e "SELECT COUNT(*) FROM lottery_records;" -s -N 2>/dev/null || echo "0")
    echo "   - lottery_records: $LOTTERY_COUNT 条记录"
else
    echo -e "${RED}   ❌ 数据表未成功还原${NC}"
    exit 1
fi
echo ""

# 重启服务
echo -e "${YELLOW}7️⃣ 重启后端服务...${NC}"
cd /home/devbox/project
pm2 start ecosystem.config.js || npm run dev &
sleep 5
echo -e "${GREEN}   ✅ 服务已重启${NC}"
echo ""

# 健康检查
echo -e "${YELLOW}8️⃣ 执行健康检查...${NC}"
sleep 3
HEALTH_CHECK=$(curl -s http://localhost:3000/health 2>/dev/null || echo '{"status":"failed"}')
echo "   响应: $HEALTH_CHECK"

if echo "$HEALTH_CHECK" | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}   ✅ 健康检查通过${NC}"
else
    echo -e "${RED}   ❌ 健康检查失败${NC}"
    echo -e "${YELLOW}   请检查服务日志: pm2 logs${NC}"
fi
echo ""

# 完成
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ 数据库还原完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}📋 还原信息总结：${NC}"
echo "   备份文件: $BACKUP_FILE"
echo "   还原时间: $(date '+%Y年%m月%d日 %H:%M:%S')"
echo "   数据库: $DB_NAME"
echo "   表数量: $TABLE_COUNT"
echo "   用户数: $USER_COUNT"
echo "   商品数: $PRODUCT_COUNT"
echo "   抽奖记录: $LOTTERY_COUNT"
echo ""

if [ -f "$TEMP_BACKUP" ]; then
    echo -e "${YELLOW}💾 临时备份已保存：${NC}"
    echo "   位置: $TEMP_BACKUP"
    echo "   如果还原有问题，可以用这个文件回滚"
    echo ""
fi

echo -e "${GREEN}🎉 所有操作已完成！${NC}"
echo ""
echo -e "${YELLOW}后续建议：${NC}"
echo "1. 测试前端登录功能"
echo "2. 检查商品数据是否正确"
echo "3. 验证抽奖功能是否正常"
echo "4. 查看服务日志：pm2 logs"
echo ""

