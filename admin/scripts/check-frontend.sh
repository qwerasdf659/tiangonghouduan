#!/bin/bash
# 文件名: check-frontend.sh
# 用途: 前端项目质量检查脚本
# 创建时间: 2026-01-23
# 使用方法: bash scripts/check-frontend.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 切换到 admin 目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ADMIN_DIR"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Web端管理后台前端项目质量检查                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "检查路径: ${YELLOW}$ADMIN_DIR${NC}"
echo -e "检查时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 统计变量
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# 检查函数
check_pass() {
  echo -e "   ${GREEN}✅ $1${NC}"
  ((PASSED_CHECKS++))
  ((TOTAL_CHECKS++))
}

check_fail() {
  echo -e "   ${RED}❌ $1${NC}"
  ((FAILED_CHECKS++))
  ((TOTAL_CHECKS++))
}

check_warn() {
  echo -e "   ${YELLOW}⚠️  $1${NC}"
  ((WARNING_CHECKS++))
  ((TOTAL_CHECKS++))
}

# ========== 检查 1: ECharts CDN 依赖 ==========
echo -e "${BLUE}【1/8】检查 ECharts CDN 依赖...${NC}"
CDN_FILES=$(grep -rl "cdn.jsdelivr.*echarts" *.html 2>/dev/null || true)
CDN_COUNT=$(echo "$CDN_FILES" | grep -c "." 2>/dev/null || echo "0")

if [ "$CDN_COUNT" -gt 0 ]; then
  check_fail "发现 $CDN_COUNT 个文件使用 CDN 引用 ECharts"
  echo -e "   ${RED}涉及文件:${NC}"
  for f in $CDN_FILES; do
    LINE=$(grep -n "cdn.jsdelivr.*echarts" "$f" | head -1 | cut -d: -f1)
    echo -e "   ${RED}  - $f:$LINE${NC}"
  done
else
  check_pass "无 ECharts CDN 依赖"
fi
echo ""

# ========== 检查 2: 硬编码 API 路径 ==========
echo -e "${BLUE}【2/8】检查硬编码 API 路径...${NC}"
HARDCODE_COUNT=$(grep -rn "'/api/v4\|\"\/api\/v4" src/modules/ --include="*.js" 2>/dev/null | wc -l || echo "0")

if [ "$HARDCODE_COUNT" -gt 0 ]; then
  check_warn "发现 $HARDCODE_COUNT 处可能的硬编码 API 路径（需人工确认）"
  echo -e "   ${YELLOW}建议执行以下命令查看详情:${NC}"
  echo -e "   ${YELLOW}grep -rn \"'/api/v4\" src/modules/ --include=\"*.js\"${NC}"
else
  check_pass "无硬编码 API 路径"
fi
echo ""

# ========== 检查 3: HTML 页面数量 ==========
echo -e "${BLUE}【3/8】检查 HTML 页面...${NC}"
HTML_COUNT=$(ls -1 *.html 2>/dev/null | wc -l)
echo -e "   📄 共 ${GREEN}$HTML_COUNT${NC} 个 HTML 页面"

# 检查每个 HTML 是否有对应的 JS
MISSING_JS=0
for html in *.html; do
  PAGE_NAME=$(basename "$html" .html)
  if [ "$PAGE_NAME" != "login" ]; then
    # 搜索对应的 JS 文件
    JS_FILE=$(find src/modules -name "${PAGE_NAME}.js" 2>/dev/null | head -1)
    if [ -z "$JS_FILE" ]; then
      # 尝试其他命名方式
      JS_FILE=$(find src/modules -name "*.js" -exec grep -l "function ${PAGE_NAME}Page\|Alpine.data('${PAGE_NAME}" {} \; 2>/dev/null | head -1)
    fi
    if [ -z "$JS_FILE" ]; then
      ((MISSING_JS++))
      echo -e "   ${YELLOW}⚠️  $html 未找到对应 JS 模块${NC}"
    fi
  fi
done

if [ "$MISSING_JS" -eq 0 ]; then
  check_pass "所有页面有对应的 JS 模块"
else
  check_warn "$MISSING_JS 个页面可能缺少 JS 模块"
fi
echo ""

# ========== 检查 4: JS 模块数量 ==========
echo -e "${BLUE}【4/8】检查 JS 模块...${NC}"
JS_COUNT=$(find src/modules -name "*.js" 2>/dev/null | wc -l)
echo -e "   📦 共 ${GREEN}$JS_COUNT${NC} 个 JS 模块"

# 检查模块分布
echo -e "   模块分布:"
for dir in src/modules/*/pages; do
  if [ -d "$dir" ]; then
    MODULE_NAME=$(basename "$(dirname "$dir")")
    MODULE_COUNT=$(ls -1 "$dir"/*.js 2>/dev/null | wc -l)
    echo -e "   - $MODULE_NAME: ${MODULE_COUNT}个"
  fi
done
check_pass "JS 模块结构正常"
echo ""

# ========== 检查 5: package.json 依赖 ==========
echo -e "${BLUE}【5/8】检查 package.json 依赖...${NC}"

DEPS_OK=true

if grep -q '"echarts"' package.json; then
  ECHARTS_VER=$(grep '"echarts"' package.json | grep -oP '"\^?[\d.]+"' | tr -d '"')
  echo -e "   ✅ ECharts: $ECHARTS_VER"
else
  check_fail "ECharts 未在 package.json 中定义"
  DEPS_OK=false
fi

if grep -q '"alpinejs"' package.json; then
  ALPINE_VER=$(grep '"alpinejs"' package.json | grep -oP '"\^?[\d.]+"' | tr -d '"')
  echo -e "   ✅ Alpine.js: $ALPINE_VER"
else
  check_fail "Alpine.js 未在 package.json 中定义"
  DEPS_OK=false
fi

if grep -q '"tailwindcss"' package.json; then
  TAILWIND_VER=$(grep '"tailwindcss"' package.json | grep -oP '"\^?[\d.]+"' | tr -d '"')
  echo -e "   ✅ Tailwind CSS: $TAILWIND_VER"
else
  check_fail "Tailwind CSS 未在 package.json 中定义"
  DEPS_OK=false
fi

if [ "$DEPS_OK" = true ]; then
  check_pass "核心依赖完整"
fi
echo ""

# ========== 检查 6: api-config.js 完整性 ==========
echo -e "${BLUE}【6/8】检查 api-config.js 完整性...${NC}"
API_CONFIG="src/api/api-config.js"

if [ -f "$API_CONFIG" ]; then
  API_LINES=$(wc -l < "$API_CONFIG")
  ENDPOINT_COUNT=$(grep -c ":" "$API_CONFIG" 2>/dev/null || echo "0")
  echo -e "   📄 api-config.js: ${API_LINES} 行"
  echo -e "   🔗 API 端点定义: 约 ${ENDPOINT_COUNT} 个"
  
  # 检查关键模块
  MODULES=("AUTH" "USER" "STORE" "LOTTERY" "ASSETS" "MARKETPLACE" "SYSTEM")
  MISSING_MODULES=""
  for mod in "${MODULES[@]}"; do
    if ! grep -q "^  $mod:" "$API_CONFIG" && ! grep -q "^  ${mod}:" "$API_CONFIG"; then
      MISSING_MODULES="$MISSING_MODULES $mod"
    fi
  done
  
  if [ -z "$MISSING_MODULES" ]; then
    check_pass "api-config.js 核心模块完整"
  else
    check_warn "缺少模块:$MISSING_MODULES"
  fi
else
  check_fail "api-config.js 文件不存在"
fi
echo ""

# ========== 检查 7: EJS 模板结构 ==========
echo -e "${BLUE}【7/8】检查 EJS 模板结构...${NC}"
TEMPLATE_DIR="src/templates"

if [ -d "$TEMPLATE_DIR" ]; then
  echo -e "   📁 模板目录: $TEMPLATE_DIR"
  
  if [ -f "$TEMPLATE_DIR/partials/head.ejs" ]; then
    echo -e "   ✅ partials/head.ejs 存在"
  else
    echo -e "   ${RED}❌ partials/head.ejs 不存在${NC}"
  fi
  
  # 检查 HTML 是否使用 EJS include
  EJS_USAGE=$(grep -l "<%- include" *.html 2>/dev/null | wc -l)
  echo -e "   📄 使用 EJS include 的页面: ${EJS_USAGE}/${HTML_COUNT}"
  
  if [ "$EJS_USAGE" -gt 0 ]; then
    check_pass "EJS 模板结构正常"
  else
    check_warn "部分页面未使用 EJS 模板"
  fi
else
  check_fail "模板目录不存在"
fi
echo ""

# ========== 检查 8: Vite 构建配置 ==========
echo -e "${BLUE}【8/8】检查 Vite 构建配置...${NC}"

if [ -f "vite.config.js" ]; then
  echo -e "   ✅ vite.config.js 存在"
  
  # 检查多页面配置
  if grep -q "rollupOptions" vite.config.js && grep -q "input" vite.config.js; then
    echo -e "   ✅ 多页面入口配置存在"
  else
    echo -e "   ${YELLOW}⚠️  未检测到多页面配置${NC}"
  fi
  
  # 检查 EJS 插件
  if grep -q "ViteEjsPlugin\|vite-plugin-ejs" vite.config.js; then
    echo -e "   ✅ EJS 插件已配置"
  else
    echo -e "   ${YELLOW}⚠️  未检测到 EJS 插件${NC}"
  fi
  
  check_pass "Vite 配置正常"
else
  check_fail "vite.config.js 不存在"
fi
echo ""

# ========== 汇总报告 ==========
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                      检查结果汇总                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "   总检查项: ${TOTAL_CHECKS}"
echo -e "   ${GREEN}通过: ${PASSED_CHECKS}${NC}"
echo -e "   ${YELLOW}警告: ${WARNING_CHECKS}${NC}"
echo -e "   ${RED}失败: ${FAILED_CHECKS}${NC}"
echo ""

if [ "$FAILED_CHECKS" -eq 0 ]; then
  if [ "$WARNING_CHECKS" -eq 0 ]; then
    echo -e "${GREEN}🎉 所有检查通过！前端项目质量良好。${NC}"
  else
    echo -e "${YELLOW}⚠️  检查完成，有 ${WARNING_CHECKS} 项警告需要关注。${NC}"
  fi
  exit 0
else
  echo -e "${RED}❌ 检查完成，有 ${FAILED_CHECKS} 项失败需要修复。${NC}"
  echo ""
  echo -e "请参考文档: ${YELLOW}docs/frontend-completion-plan.md${NC}"
  exit 1
fi

