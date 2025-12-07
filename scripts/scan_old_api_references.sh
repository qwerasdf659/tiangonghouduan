#!/bin/bash
# 深度扫描旧版客服接口引用脚本
# 用于确保删除干净，无残留引用
# 创建日期：2025年12月7日

echo "🔍 =========================================="
echo "🔍 开始深度扫描旧版客服接口引用"
echo "🔍 =========================================="
echo ""

FOUND_ISSUES=0

# 1. 扫描JavaScript文件
echo "📁 [1/6] 扫描JavaScript文件..."
echo "搜索关键词: /api/v4/system/chat, /api/v4/system/admin/chat"
echo ""

JS_RESULTS=$(grep -rn "/api/v4/system/chat\|/api/v4/system/admin/chat" . \
  --include="*.js" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=scripts \
  --color=always 2>/dev/null || true)

if [ -n "$JS_RESULTS" ]; then
  echo "❌ 发现JavaScript文件中的引用:"
  echo "$JS_RESULTS"
  echo ""
  FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
  echo "✅ JavaScript文件: 无引用"
  echo ""
fi

# 2. 扫描HTML文件
echo "📁 [2/6] 扫描HTML文件..."
echo "搜索路径: public/"
echo ""

HTML_RESULTS=$(grep -rn "/api/v4/system/chat\|/api/v4/system/admin/chat" public/ \
  --include="*.html" \
  --color=always 2>/dev/null || true)

if [ -n "$HTML_RESULTS" ]; then
  echo "❌ 发现HTML文件中的引用:"
  echo "$HTML_RESULTS"
  echo ""
  FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
  echo "✅ HTML文件: 无引用"
  echo ""
fi

# 3. 扫描配置文件
echo "📁 [3/6] 扫描配置文件..."
echo "文件类型: *.json, *.yaml, *.yml"
echo ""

CONFIG_RESULTS=$(grep -rn "system.*chat.*admin\|/api/v4/system/chat" . \
  --include="*.json" \
  --include="*.yaml" \
  --include="*.yml" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --color=always 2>/dev/null || true)

if [ -n "$CONFIG_RESULTS" ]; then
  echo "❌ 发现配置文件中的引用:"
  echo "$CONFIG_RESULTS"
  echo ""
  FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
  echo "✅ 配置文件: 无引用"
  echo ""
fi

# 4. 扫描文档文件
echo "📁 [4/6] 扫描文档文件..."
echo "搜索关键词: 旧版.*客服, 废弃.*客服, DEPRECATED.*chat"
echo ""

DOC_RESULTS=$(grep -rn "旧版.*客服\|废弃.*客服\|DEPRECATED.*chat" docs/ \
  --include="*.md" \
  --exclude="*删除*" \
  --color=always 2>/dev/null || true)

if [ -n "$DOC_RESULTS" ]; then
  echo "⚠️ 发现文档文件中的引用（可能需要更新）:"
  echo "$DOC_RESULTS"
  echo ""
  echo "💡 提示: 这些引用可能需要更新为'已删除'状态"
  echo ""
else
  echo "✅ 文档文件: 无需更新的引用"
  echo ""
fi

# 5. 扫描测试文件
echo "📁 [5/6] 扫描测试文件..."
echo "搜索路径: tests/"
echo ""

if [ -d "tests" ]; then
  TEST_RESULTS=$(grep -rn "system.*chat.*admin\|/api/v4/system/chat" tests/ \
    --include="*.test.js" \
    --include="*.spec.js" \
    --color=always 2>/dev/null || true)

  if [ -n "$TEST_RESULTS" ]; then
    echo "❌ 发现测试文件中的引用:"
    echo "$TEST_RESULTS"
    echo ""
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
  else
    echo "✅ 测试文件: 无引用"
    echo ""
  fi
else
  echo "ℹ️ 测试目录不存在，跳过"
  echo ""
fi

# 6. 扫描DEPRECATED标记
echo "📁 [6/6] 扫描DEPRECATED标记..."
echo "搜索路径: routes/"
echo ""

DEPRECATED_RESULTS=$(grep -rn "DEPRECATED\|废弃" routes/ \
  --include="*.js" \
  --color=always 2>/dev/null || true)

if [ -n "$DEPRECATED_RESULTS" ]; then
  echo "⚠️ 发现DEPRECATED标记:"
  echo "$DEPRECATED_RESULTS"
  echo ""
  echo "💡 提示: 如果这些标记与旧版客服接口相关，需要删除"
  echo ""
else
  echo "✅ DEPRECATED标记: 无残留"
  echo ""
fi

# 生成扫描报告
echo "📊 =========================================="
echo "📊 扫描结果汇总"
echo "📊 =========================================="
echo ""

if [ $FOUND_ISSUES -eq 0 ]; then
  echo "🎉 扫描完成：未发现旧版API引用"
  echo ""
  echo "✅ 所有检查项通过:"
  echo "   ✅ JavaScript文件: 无引用"
  echo "   ✅ HTML文件: 无引用"
  echo "   ✅ 配置文件: 无引用"
  echo "   ✅ 测试文件: 无引用"
  echo "   ✅ DEPRECATED标记: 无残留"
  echo ""
  echo "✅ 结论: 旧版客服接口已彻底删除，无残留引用"
  exit 0
else
  echo "⚠️ 扫描完成：发现 $FOUND_ISSUES 处需要处理的引用"
  echo ""
  echo "❌ 需要处理的问题:"
  
  if [ -n "$JS_RESULTS" ]; then
    echo "   ❌ JavaScript文件中有引用"
  fi
  
  if [ -n "$HTML_RESULTS" ]; then
    echo "   ❌ HTML文件中有引用"
  fi
  
  if [ -n "$CONFIG_RESULTS" ]; then
    echo "   ❌ 配置文件中有引用"
  fi
  
  if [ -n "$TEST_RESULTS" ]; then
    echo "   ❌ 测试文件中有引用"
  fi
  
  echo ""
  echo "⚠️ 建议操作:"
  echo "   1. 检查上述引用是否为旧版API"
  echo "   2. 如果是，请手动删除或更新"
  echo "   3. 重新运行本扫描脚本验证"
  echo ""
  echo "❌ 结论: 删除不完整，需要进一步清理"
  exit 1
fi

