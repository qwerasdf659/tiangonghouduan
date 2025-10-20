#!/bin/bash
# 抽奖服务整合验证脚本
# 创建时间：2025年10月15日 北京时间
# 用途：验证整合后的服务是否正常工作

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}抽奖服务整合验证脚本${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 验证计数器
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# 验证函数
check_pass() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    echo -e "${RED}❌ $1${NC}"
}

# ====================
# 验证1：目录结构检查
# ====================
echo -e "${YELLOW}[验证1/5] 检查目录结构...${NC}"

if [ -d "services/UnifiedLotteryEngine/services" ]; then
    check_pass "services/UnifiedLotteryEngine/services/ 目录存在"
else
    check_fail "services/UnifiedLotteryEngine/services/ 目录不存在"
fi

if [ -f "services/UnifiedLotteryEngine/services/LotteryUserService.js" ]; then
    check_pass "LotteryUserService.js 文件存在"
else
    check_fail "LotteryUserService.js 文件不存在"
fi

if [ -f "services/UnifiedLotteryEngine/services/LotteryHistoryService.js" ]; then
    check_pass "LotteryHistoryService.js 文件存在"
else
    check_fail "LotteryHistoryService.js 文件不存在"
fi

if [ ! -d "services/lottery" ]; then
    check_pass "旧的services/lottery目录已删除"
else
    echo -e "${YELLOW}⚠️  旧的services/lottery目录仍然存在（建议删除）${NC}"
fi

echo ""

# ====================
# 验证2：文件语法检查
# ====================
echo -e "${YELLOW}[验证2/5] 检查文件语法...${NC}"

if node -c services/UnifiedLotteryEngine/services/LotteryUserService.js 2>/dev/null; then
    check_pass "LotteryUserService.js 语法正确"
else
    check_fail "LotteryUserService.js 语法错误"
fi

if node -c services/UnifiedLotteryEngine/services/LotteryHistoryService.js 2>/dev/null; then
    check_pass "LotteryHistoryService.js 语法正确"
else
    check_fail "LotteryHistoryService.js 语法错误"
fi

echo ""

# ====================
# 验证3：引用路径检查
# ====================
echo -e "${YELLOW}[验证3/5] 检查引用路径...${NC}"

# 检查是否使用了正确的相对路径
if grep -q "require('../../../models')" services/UnifiedLotteryEngine/services/LotteryUserService.js; then
    check_pass "LotteryUserService.js 引用路径正确"
else
    check_fail "LotteryUserService.js 引用路径可能不正确"
fi

if grep -q "require('../../../models')" services/UnifiedLotteryEngine/services/LotteryHistoryService.js; then
    check_pass "LotteryHistoryService.js 引用路径正确"
else
    check_fail "LotteryHistoryService.js 引用路径可能不正确"
fi

# 检查路由文件中是否还有旧的引用
OLD_REFS=$(grep -r "services/lottery/LotteryUserService\|services/lottery/LotteryHistoryService" routes --include="*.js" 2>/dev/null | wc -l)
if [ "$OLD_REFS" -eq 0 ]; then
    check_pass "路由文件中无旧引用"
else
    check_fail "路由文件中仍有 $OLD_REFS 处旧引用需要更新"
    echo -e "${YELLOW}请运行以下命令查看详情：${NC}"
    echo "grep -rn 'services/lottery/Lottery' routes --include='*.js'"
fi

echo ""

# ====================
# 验证4：模块加载测试
# ====================
echo -e "${YELLOW}[验证4/5] 测试模块加载...${NC}"

# 测试LotteryUserService是否可以正常加载
node -e "
try {
  const LotteryUserService = require('./services/UnifiedLotteryEngine/services/LotteryUserService');
  console.log('✅ LotteryUserService 可正常加载');
  process.exit(0);
} catch (error) {
  console.error('❌ LotteryUserService 加载失败:', error.message);
  process.exit(1);
}
" && check_pass "LotteryUserService 模块加载成功" || check_fail "LotteryUserService 模块加载失败"

# 测试LotteryHistoryService是否可以正常加载
node -e "
try {
  const LotteryHistoryService = require('./services/UnifiedLotteryEngine/services/LotteryHistoryService');
  console.log('✅ LotteryHistoryService 可正常加载');
  process.exit(0);
} catch (error) {
  console.error('❌ LotteryHistoryService 加载失败:', error.message);
  process.exit(1);
}
" && check_pass "LotteryHistoryService 模块加载成功" || check_fail "LotteryHistoryService 模块加载失败"

echo ""

# ====================
# 验证5：文件完整性检查
# ====================
echo -e "${YELLOW}[验证5/5] 检查文件完整性...${NC}"

# 检查文件大小（确保不是空文件）
USER_SERVICE_SIZE=$(stat -f%z services/UnifiedLotteryEngine/services/LotteryUserService.js 2>/dev/null || stat -c%s services/UnifiedLotteryEngine/services/LotteryUserService.js 2>/dev/null)
HISTORY_SERVICE_SIZE=$(stat -f%z services/UnifiedLotteryEngine/services/LotteryHistoryService.js 2>/dev/null || stat -c%s services/UnifiedLotteryEngine/services/LotteryHistoryService.js 2>/dev/null)

if [ "$USER_SERVICE_SIZE" -gt 1000 ]; then
    check_pass "LotteryUserService.js 文件完整（${USER_SERVICE_SIZE} 字节）"
else
    check_fail "LotteryUserService.js 文件可能不完整（${USER_SERVICE_SIZE} 字节）"
fi

if [ "$HISTORY_SERVICE_SIZE" -gt 1000 ]; then
    check_pass "LotteryHistoryService.js 文件完整（${HISTORY_SERVICE_SIZE} 字节）"
else
    check_fail "LotteryHistoryService.js 文件可能不完整（${HISTORY_SERVICE_SIZE} 字节）"
fi

echo ""

# ====================
# 生成验证报告
# ====================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}验证结果总结${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "总检查项: ${TOTAL_CHECKS}"
echo -e "${GREEN}通过: ${PASSED_CHECKS}${NC}"
echo -e "${RED}失败: ${FAILED_CHECKS}${NC}"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}🎉 所有验证通过！整合成功！${NC}"
    echo ""
    echo -e "${BLUE}下一步建议：${NC}"
    echo "1. 启动开发服务器：npm run dev"
    echo "2. 运行单元测试：npm test"
    echo "3. 测试抽奖功能"
    echo "4. 提交代码：git commit -m 'feat: 整合抽奖服务'"
    echo ""
    exit 0
else
    echo -e "${RED}⚠️  验证失败！请检查上述错误并修复${NC}"
    echo ""
    echo -e "${YELLOW}建议操作：${NC}"
    echo "1. 查看详细错误信息"
    echo "2. 参考 docs/方案A执行手册_详细步骤.md"
    echo "3. 或执行回滚：bash scripts/refactor/rollback-integration.sh"
    echo ""
    exit 1
fi



