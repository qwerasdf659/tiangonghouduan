#!/bin/bash
# 商家积分审核功能测试脚本
# 用于验证前后端联动是否正常

set -e

# 配置
BASE_URL="http://localhost:3000"
API_PREFIX="/api/v4"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  商家积分审核功能测试${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# 检查服务是否运行
echo -e "${YELLOW}[1] 检查服务健康状态...${NC}"
HEALTH_RESPONSE=$(curl -s "${BASE_URL}/health" || echo "FAILED")
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo -e "${GREEN}✅ 服务运行正常${NC}"
else
    echo -e "${RED}❌ 服务未运行或不健康${NC}"
    echo "响应: $HEALTH_RESPONSE"
    exit 1
fi
echo ""

# 获取管理员Token（需要先登录）
echo -e "${YELLOW}[2] 尝试获取管理员Token...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/console/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"mobile":"13800138000","password":"admin123"}' || echo "FAILED")

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | head -1 | sed 's/"token":"//;s/"//')
    echo -e "${GREEN}✅ 管理员登录成功${NC}"
    echo "Token: ${TOKEN:0:50}..."
else
    echo -e "${YELLOW}⚠️ 管理员登录失败，尝试使用普通用户登录测试...${NC}"
    # 尝试普通登录
    LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"mobile":"13800138001","password":"test123"}' || echo "FAILED")
    
    if echo "$LOGIN_RESPONSE" | grep -q "token"; then
        TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | head -1 | sed 's/"token":"//;s/"//')
        echo -e "${GREEN}✅ 普通用户登录成功（将使用此Token测试）${NC}"
    else
        echo -e "${RED}❌ 登录失败${NC}"
        echo "响应: $LOGIN_RESPONSE"
        # 继续执行，不退出
        TOKEN=""
    fi
fi
echo ""

# 测试待审核统计API（不需要认证的测试）
echo -e "${YELLOW}[3] 测试待审核统计API...${NC}"
if [ -n "$TOKEN" ]; then
    STATS_RESPONSE=$(curl -s "${BASE_URL}${API_PREFIX}/console/merchant-points/stats/pending" \
        -H "Authorization: Bearer $TOKEN" || echo "FAILED")
else
    STATS_RESPONSE=$(curl -s "${BASE_URL}${API_PREFIX}/console/merchant-points/stats/pending" || echo "FAILED")
fi

echo "API响应: $STATS_RESPONSE"
if echo "$STATS_RESPONSE" | grep -q "pending_count"; then
    PENDING_COUNT=$(echo "$STATS_RESPONSE" | grep -o '"pending_count":[0-9]*' | head -1 | sed 's/"pending_count"://')
    echo -e "${GREEN}✅ 待审核统计API正常 - 待审核数量: ${PENDING_COUNT}${NC}"
else
    echo -e "${RED}❌ 待审核统计API异常${NC}"
fi
echo ""

# 测试申请列表API
echo -e "${YELLOW}[4] 测试申请列表API...${NC}"
if [ -n "$TOKEN" ]; then
    LIST_RESPONSE=$(curl -s "${BASE_URL}${API_PREFIX}/console/merchant-points?page=1&page_size=5" \
        -H "Authorization: Bearer $TOKEN" || echo "FAILED")
else
    LIST_RESPONSE=$(curl -s "${BASE_URL}${API_PREFIX}/console/merchant-points?page=1&page_size=5" || echo "FAILED")
fi

echo "API响应: ${LIST_RESPONSE:0:500}..."
if echo "$LIST_RESPONSE" | grep -q '"rows"'; then
    ROW_COUNT=$(echo "$LIST_RESPONSE" | grep -o '"audit_id"' | wc -l)
    echo -e "${GREEN}✅ 申请列表API正常 - 返回记录数: ${ROW_COUNT}${NC}"
    
    # 检查字段结构
    if echo "$LIST_RESPONSE" | grep -q '"points_amount"'; then
        echo -e "${GREEN}  ✓ 字段 points_amount 存在${NC}"
    else
        echo -e "${YELLOW}  ⚠ 字段 points_amount 不存在（可能无数据）${NC}"
    fi
    
    if echo "$LIST_RESPONSE" | grep -q '"applicant"'; then
        echo -e "${GREEN}  ✓ 字段 applicant 存在${NC}"
    else
        echo -e "${YELLOW}  ⚠ 字段 applicant 不存在（可能无数据）${NC}"
    fi
    
    if echo "$LIST_RESPONSE" | grep -q '"status"'; then
        echo -e "${GREEN}  ✓ 字段 status 存在${NC}"
    else
        echo -e "${YELLOW}  ⚠ 字段 status 不存在（可能无数据）${NC}"
    fi
else
    echo -e "${RED}❌ 申请列表API异常${NC}"
fi
echo ""

# 检查数据库中是否有测试数据
echo -e "${YELLOW}[5] 检查审核记录表数据...${NC}"
echo "提示: 如果页面显示空数据，可能是因为数据库中没有商家积分申请记录"
echo "可以通过以下方式创建测试数据:"
echo "  1. 通过用户端API提交积分申请: POST /api/v4/merchant-points"
echo "  2. 直接在数据库插入测试数据"
echo ""

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  测试完成${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo "如果API返回正常但页面无数据，说明:"
echo "  1. 前后端联动正常"
echo "  2. 数据库中没有商家积分申请记录"
echo ""
echo "建议: 运行下面的命令创建测试数据"
echo "  node scripts/create-test-merchant-points.js"

