#!/bin/bash
# 检查迁移文件是否使用了禁止的sync()方法
#
# 用途: 在提交代码前自动检查迁移文件
# 使用: ./scripts/database/check-migration-sync.sh
#
# 创建时间: 2025年10月14日

set -e

echo "======================================================"
echo "🔍 检查迁移文件中的sync()调用"
echo "======================================================"
echo ""

# 定义要检查的模式
FORBIDDEN_PATTERNS=(
  "sequelize\.sync"
  "models\.sequelize\.sync"
  "sync\(\s*\{"
)

# 检查结果
VIOLATIONS_FOUND=false
TOTAL_FILES=0
CHECKED_FILES=0

# 遍历migrations目录中的所有js文件
for file in migrations/*.js; do
  # 跳过不存在的文件
  if [ ! -f "$file" ]; then
    continue
  fi
  
  # 跳过模板文件和旧文件
  if [[ "$file" == *.template ]] || [[ "$file" == *.old ]]; then
    continue
  fi
  
  TOTAL_FILES=$((TOTAL_FILES + 1))
  
  # 检查实际代码中的sync()调用（排除注释）
  # 只检查 await 或直接调用 sync() 的情况
  if grep -n "await.*\.sync\s*(" "$file" 2>/dev/null | grep -v "^\s*//" | grep -v "^\s*\*"; then
    if [ "$VIOLATIONS_FOUND" = false ]; then
      echo "❌ 发现禁止的sync()调用！"
      echo ""
      VIOLATIONS_FOUND=true
    fi
    
    echo "📄 文件: $file"
    echo "🚫 实际代码中使用了 sync() 方法"
    grep -n "await.*\.sync\s*(" "$file" | grep -v "^\s*//" | grep -v "^\s*\*" | while read -r line; do
      echo "   $line"
    done
    echo ""
  fi
  
  CHECKED_FILES=$((CHECKED_FILES + 1))
done

echo "======================================================"
echo "📊 检查统计"
echo "======================================================"
echo "检查文件: $CHECKED_FILES/$TOTAL_FILES"

if [ "$VIOLATIONS_FOUND" = true ]; then
  echo "状态: ❌ 失败"
  echo ""
  echo "💡 修复建议:"
  echo "   1. 删除使用sync()的迁移文件"
  echo "   2. 使用显式定义方法（queryInterface.createTable）"
  echo "   3. 参考模板: migrations/TEMPLATE-baseline-explicit.js.template"
  echo "   4. 参考示例: migrations/20251014000000-baseline-v1.0.0-explicit.js"
  echo ""
  echo "📚 详细文档: docs/生产环境数据库迁移最佳实践.md"
  echo "======================================================"
  exit 1
else
  echo "状态: ✅ 通过"
  echo "说明: 未发现禁止的sync()调用"
  echo "======================================================"
  exit 0
fi

