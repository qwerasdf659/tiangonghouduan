#!/bin/bash
# 前端资源完整性验证脚本
# 用途: 检查第三方库是否已本地化，避免依赖外部CDN
# 创建时间: 2025年11月23日

set -e

echo "🔍 检查前端资源完整性..."

# 检查vendor目录是否存在
if [ ! -d "public/admin/js/vendor" ]; then
  echo "❌ vendor目录不存在"
  echo "修复: mkdir -p public/admin/js/vendor"
  exit 1
fi

# 检查socket.io是否本地化
if [ ! -f "public/admin/js/vendor/socket.io.min.js" ]; then
  echo "❌ socket.io.min.js 未本地化"
  echo "修复: cd public/admin/js/vendor && curl -o socket.io.min.js https://cdn.socket.io/4.7.2/socket.io.min.js"
  exit 1
fi

# 检查文件大小（应该是49KB左右）
SOCKET_SIZE=$(stat -c%s "public/admin/js/vendor/socket.io.min.js" 2>/dev/null || echo "0")
if [ $SOCKET_SIZE -lt 40000 ] || [ $SOCKET_SIZE -gt 60000 ]; then
  echo "⚠️ socket.io.min.js 文件大小异常: ${SOCKET_SIZE} bytes (预期: ~49KB)"
  echo "建议重新下载"
  exit 1
fi

# 检查vendor目录的README文档
if [ ! -f "public/admin/js/vendor/README.md" ]; then
  echo "⚠️ vendor/README.md 版本说明文档缺失"
  echo "建议创建版本管理文档"
fi

# 检查HTML文件中是否还有外部CDN引用
echo ""
echo "🔍 检查HTML文件中的CDN引用..."
HTML_FILES=$(find public/admin -name "*.html" -type f 2>/dev/null || echo "")

if [ -z "$HTML_FILES" ]; then
  echo "⚠️ 未找到HTML文件"
else
  CDN_ISSUES=0
  for file in $HTML_FILES; do
    # 检查是否引用了socket.io的CDN
    if grep -q "cdn.socket.io\|unpkg.com.*socket.io" "$file" 2>/dev/null; then
      echo "  ❌ $file 仍然引用socket.io CDN"
      ((CDN_ISSUES++))
    fi
  done
  
  if [ $CDN_ISSUES -eq 0 ]; then
    echo "  ✅ 所有HTML文件已本地化socket.io"
  else
    echo ""
    echo "❌ 发现 $CDN_ISSUES 个文件仍使用CDN，请修改为本地路径: /admin/js/vendor/socket.io.min.js"
    exit 1
  fi
fi

echo ""
echo "✅ 前端资源验证通过"
echo "   - vendor目录: ✓"
echo "   - socket.io本地化: ✓ (${SOCKET_SIZE} bytes)"
echo "   - HTML文件CDN检查: ✓"

