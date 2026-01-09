#!/bin/bash
# CSP策略验证脚本
# 用途: 检查所有HTML页面是否配置了正确的CSP策略
# 创建时间: 2025年11月23日

echo "🔍 检查所有HTML页面的CSP策略..."

# 查找所有HTML文件
HTML_FILES=$(find public/admin -name "*.html" -type f 2>/dev/null || echo "")

if [ -z "$HTML_FILES" ]; then
  echo "⚠️ 未找到HTML文件"
  exit 0
fi

TOTAL_FILES=0
MISSING_CSP=0
INCOMPLETE_CSP=0
CORRECT_CSP=0

for file in $HTML_FILES; do
  ((TOTAL_FILES++))
  filename=$(basename "$file")
  
  # 检查是否包含CSP meta标签
  if ! grep -q "Content-Security-Policy" "$file" 2>/dev/null; then
    echo "  ❌ $filename: 缺少CSP策略"
    ((MISSING_CSP++))
    continue
  fi
  
  # 检查CSP策略的完整性
  HAS_ISSUES=0
  
  # 检查是否包含WebSocket connect-src
  if ! grep -q "connect-src.*ws:" "$file" 2>/dev/null; then
    echo "  ⚠️ $filename: CSP缺少WebSocket支持 (connect-src ws: wss:)"
    HAS_ISSUES=1
  fi
  
  # 检查是否允许本地脚本
  if ! grep -q "script-src.*'self'" "$file" 2>/dev/null; then
    echo "  ⚠️ $filename: CSP缺少本地脚本支持 (script-src 'self')"
    HAS_ISSUES=1
  fi
  
  # 检查是否允许内联脚本（管理后台需要）
  if ! grep -q "script-src.*'unsafe-inline'" "$file" 2>/dev/null; then
    echo "  ⚠️ $filename: CSP缺少内联脚本支持 (script-src 'unsafe-inline')"
    HAS_ISSUES=1
  fi
  
  if [ $HAS_ISSUES -eq 1 ]; then
    ((INCOMPLETE_CSP++))
  else
    echo "  ✅ $filename: CSP配置正确"
    ((CORRECT_CSP++))
  fi
done

echo ""
echo "📊 CSP策略检查统计:"
echo "   总文件数: $TOTAL_FILES"
echo "   配置正确: $CORRECT_CSP"
echo "   配置不完整: $INCOMPLETE_CSP"
echo "   缺少CSP: $MISSING_CSP"

if [ $MISSING_CSP -gt 0 ] || [ $INCOMPLETE_CSP -gt 0 ]; then
  echo ""
  echo "❌ CSP策略验证失败"
  echo ""
  echo "建议添加标准CSP配置（放在<head>标签内）:"
  echo '  <meta http-equiv="Content-Security-Policy"'
  echo '        content="default-src '\''self'\'';'
  echo '                 script-src '\''self'\'' '\''unsafe-inline'\'' https://cdn.jsdelivr.net;'
  echo '                 style-src '\''self'\'' '\''unsafe-inline'\'' https://cdn.jsdelivr.net;'
  echo '                 font-src '\''self'\'' https://cdn.jsdelivr.net;'
  echo '                 connect-src '\''self'\'' ws: wss: http://localhost:* https://localhost:*;'
  echo '                 img-src '\''self'\'' data: https:;">'
  exit 1
fi

echo ""
echo "✅ CSP策略验证通过"

