#!/bin/bash
# 数据完整性验证脚本
# 创建时间：2025年10月13日 北京时间
# 功能：验证从 Sealos 恢复的数据是否完整

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}📊 数据完整性验证脚本${NC}"
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

echo -e "${BLUE}🔍 开始验证数据...${NC}"
echo ""

# 1. 验证数据库连接
echo -e "${YELLOW}1️⃣ 测试数据库连接...${NC}"
if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ 数据库连接成功${NC}"
else
    echo -e "${RED}   ❌ 数据库连接失败${NC}"
    exit 1
fi
echo ""

# 2. 检查表结构
echo -e "${YELLOW}2️⃣ 检查数据表完整性...${NC}"
TABLE_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME';" -s -N)
echo "   数据表总数: $TABLE_COUNT"

# 预期的核心表列表
EXPECTED_TABLES=(
    "users"
    "products"
    "prizes"
    "lottery_records"
    "order_items"
    "orders"
    "transactions"
    "user_inventory"
)

echo ""
echo -e "${YELLOW}   检查核心表存在性：${NC}"
MISSING_TABLES=()

for table in "${EXPECTED_TABLES[@]}"; do
    if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -e "SHOW TABLES LIKE '$table';" -s -N | grep -q "$table"; then
        echo -e "   ${GREEN}✅ $table${NC}"
    else
        echo -e "   ${RED}❌ $table (缺失)${NC}"
        MISSING_TABLES+=("$table")
    fi
done

if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}⚠️  警告：发现 ${#MISSING_TABLES[@]} 个核心表缺失！${NC}"
else
    echo ""
    echo -e "${GREEN}   ✅ 所有核心表都存在${NC}"
fi
echo ""

# 3. 检查数据记录数
echo -e "${YELLOW}3️⃣ 检查数据记录数量...${NC}"

# 用户表
USER_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM users;" -s -N 2>/dev/null || echo "0")
echo "   👤 用户数: $USER_COUNT"

# 商品表
PRODUCT_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM products;" -s -N 2>/dev/null || echo "0")
echo "   📦 商品数: $PRODUCT_COUNT"

# 奖品表
PRIZE_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM prizes;" -s -N 2>/dev/null || echo "0")
echo "   🎁 奖品数: $PRIZE_COUNT"

# 抽奖记录表
LOTTERY_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM lottery_records;" -s -N 2>/dev/null || echo "0")
echo "   🎲 抽奖记录: $LOTTERY_COUNT"

# 订单表
ORDER_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM orders;" -s -N 2>/dev/null || echo "0")
echo "   📝 订单数: $ORDER_COUNT"

# 交易记录表
TRANSACTION_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM transactions;" -s -N 2>/dev/null || echo "0")
echo "   💰 交易记录: $TRANSACTION_COUNT"

echo ""

# 4. 检查关键用户数据
echo -e "${YELLOW}4️⃣ 验证关键用户数据...${NC}"

# 检查是否有管理员
ADMIN_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM users WHERE role='admin';" -s -N 2>/dev/null || echo "0")
echo "   👨‍💼 管理员账户: $ADMIN_COUNT"

if [ "$ADMIN_COUNT" -eq 0 ]; then
    echo -e "   ${RED}⚠️  警告：没有管理员账户！${NC}"
fi

# 检查用户余额总和（防止数据丢失）
TOTAL_BALANCE=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COALESCE(SUM(balance), 0) FROM users;" -s -N 2>/dev/null || echo "0")
echo "   💵 用户总余额: $TOTAL_BALANCE"

echo ""

# 5. 检查数据一致性
echo -e "${YELLOW}5️⃣ 检查数据一致性...${NC}"

# 检查订单项是否有对应的订单
ORPHAN_ORDER_ITEMS=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id WHERE o.id IS NULL;" -s -N 2>/dev/null || echo "0")

if [ "$ORPHAN_ORDER_ITEMS" -gt 0 ]; then
    echo -e "   ${RED}⚠️  发现 $ORPHAN_ORDER_ITEMS 个孤立的订单项（没有对应订单）${NC}"
else
    echo -e "   ${GREEN}✅ 订单数据一致性正常${NC}"
fi

# 检查抽奖记录是否有对应的用户
ORPHAN_LOTTERY=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM lottery_records lr LEFT JOIN users u ON lr.user_id = u.id WHERE u.id IS NULL;" -s -N 2>/dev/null || echo "0")

if [ "$ORPHAN_LOTTERY" -gt 0 ]; then
    echo -e "   ${RED}⚠️  发现 $ORPHAN_LOTTERY 个孤立的抽奖记录（没有对应用户）${NC}"
else
    echo -e "   ${GREEN}✅ 抽奖记录一致性正常${NC}"
fi

echo ""

# 6. 性能指标检查
echo -e "${YELLOW}6️⃣ 检查数据库性能指标...${NC}"

# 检查表大小
echo "   📊 表大小统计（前5个最大的表）："
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT 
        table_name AS '表名',
        ROUND((data_length + index_length) / 1024 / 1024, 2) AS '大小(MB)'
    FROM information_schema.tables 
    WHERE table_schema = '$DB_NAME' 
    ORDER BY (data_length + index_length) DESC 
    LIMIT 5;" 2>/dev/null | sed 's/^/   /'

echo ""

# 7. 生成验证报告
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}📋 验证报告总结${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

TOTAL_RECORDS=$((USER_COUNT + PRODUCT_COUNT + PRIZE_COUNT + LOTTERY_COUNT + ORDER_COUNT + TRANSACTION_COUNT))

echo "📊 数据统计："
echo "   - 数据表数量: $TABLE_COUNT"
echo "   - 总记录数: $TOTAL_RECORDS"
echo "   - 用户数: $USER_COUNT"
echo "   - 商品数: $PRODUCT_COUNT"
echo "   - 订单数: $ORDER_COUNT"
echo ""

# 健康度评分
HEALTH_SCORE=100

if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
    HEALTH_SCORE=$((HEALTH_SCORE - 30))
fi

if [ "$ADMIN_COUNT" -eq 0 ]; then
    HEALTH_SCORE=$((HEALTH_SCORE - 20))
fi

if [ "$ORPHAN_ORDER_ITEMS" -gt 0 ] || [ "$ORPHAN_LOTTERY" -gt 0 ]; then
    HEALTH_SCORE=$((HEALTH_SCORE - 15))
fi

if [ "$TOTAL_RECORDS" -eq 0 ]; then
    HEALTH_SCORE=$((HEALTH_SCORE - 50))
fi

echo "🏥 数据健康度: $HEALTH_SCORE/100"

if [ $HEALTH_SCORE -ge 90 ]; then
    echo -e "${GREEN}   ✅ 优秀 - 数据完整且一致${NC}"
elif [ $HEALTH_SCORE -ge 70 ]; then
    echo -e "${YELLOW}   ⚠️  良好 - 有轻微问题但可用${NC}"
elif [ $HEALTH_SCORE -ge 50 ]; then
    echo -e "${YELLOW}   ⚠️  警告 - 存在明显问题，需要修复${NC}"
else
    echo -e "${RED}   ❌ 严重 - 数据可能不完整或损坏${NC}"
fi

echo ""
echo -e "${BLUE}📅 验证时间: $(date '+%Y年%m月%d日 %H:%M:%S')${NC}"
echo ""

if [ $HEALTH_SCORE -lt 70 ]; then
    echo -e "${RED}建议：立即检查数据并考虑重新恢复备份${NC}"
else
    echo -e "${GREEN}🎉 恭喜！数据验证通过，可以正常使用了！${NC}"
fi

echo ""

