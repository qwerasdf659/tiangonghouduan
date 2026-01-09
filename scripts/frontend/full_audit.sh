#!/bin/bash
# 前端Web管理系统全面审计脚本
# 用途: 全面排查CSP、WebSocket、外部依赖等潜在问题
# 创建时间: 2025年11月23日

echo "🔍 ========================================="
echo "   前端Web管理系统全面审计报告"
echo "   审计时间: $(date '+%Y年%m月%d日 %H:%M:%S')"
echo "========================================="
echo ""

# 1. HTML文件总览
echo "📋 1. HTML文件总览"
echo "-------------------------------------------"
HTML_COUNT=$(find public/admin -name "*.html" -type f ! -path "*/templates/*" | wc -l)
echo "总文件数: $HTML_COUNT 个（不含模板）"
echo ""

# 2. CSP策略审计
echo "🔐 2. CSP安全策略审计"
echo "-------------------------------------------"
CSP_CONFIGURED=0
CSP_MISSING=0

for file in public/admin/*.html; do
  if [ "$file" = "public/admin/*.html" ]; then break; fi
  filename=$(basename "$file")
  
  if grep -q "Content-Security-Policy" "$file" 2>/dev/null; then
    ((CSP_CONFIGURED++))
  else
    ((CSP_MISSING++))
    echo "❌ $filename - 缺少CSP策略"
  fi
done

echo ""
echo "统计:"
echo "  ✅ 已配置CSP: $CSP_CONFIGURED 个"
echo "  ❌ 缺少CSP: $CSP_MISSING 个"
echo ""

# 3. 外部CDN依赖审计
echo "🌐 3. 外部CDN依赖审计"
echo "-------------------------------------------"

# 检查socket.io CDN引用
SOCKETIO_CDN_COUNT=0
for file in public/admin/*.html; do
  if [ "$file" = "public/admin/*.html" ]; then break; fi
  if grep -q "cdn.socket.io\|unpkg.com.*socket.io" "$file" 2>/dev/null; then
    filename=$(basename "$file")
    echo "❌ $filename - 使用socket.io外部CDN"
    ((SOCKETIO_CDN_COUNT++))
  fi
done

if [ $SOCKETIO_CDN_COUNT -eq 0 ]; then
  echo "✅ 所有页面已本地化socket.io（或不使用）"
else
  echo ""
  echo "⚠️ 发现 $SOCKETIO_CDN_COUNT 个文件使用socket.io外部CDN"
fi

# 检查其他第三方库CDN
echo ""
echo "其他第三方库CDN使用情况:"
echo "  - Bootstrap: $(grep -l "cdn.jsdelivr.net.*bootstrap" public/admin/*.html 2>/dev/null | wc -l) 个文件（正常，CSP已允许）"
echo "  - Chart.js: $(grep -l "chart.js" public/admin/*.html 2>/dev/null | wc -l) 个文件"
echo "  - 其他CDN: $(grep -l "unpkg.com\|cdnjs.com" public/admin/*.html 2>/dev/null | wc -l) 个文件"
echo ""

# 4. WebSocket使用审计
echo "🔌 4. WebSocket功能使用审计"
echo "-------------------------------------------"
WS_FILES=0
for file in public/admin/*.html; do
  if [ "$file" = "public/admin/*.html" ]; then break; fi
  if grep -q "socket\.io\|initWebSocket\|wsConnection" "$file" 2>/dev/null; then
    filename=$(basename "$file")
    echo "📡 $filename - 使用WebSocket"
    ((WS_FILES++))
    
    # 检查WebSocket事件监听
    echo "   事件监听:"
    grep -o "\.on(['\"][^'\"]*['\"]" "$file" 2>/dev/null | sort -u | head -10 || echo "   无"
  fi
done

echo ""
echo "统计: $WS_FILES 个文件使用WebSocket功能"
echo ""

# 5. 本地化资源检查
echo "📦 5. 本地化资源检查"
echo "-------------------------------------------"
if [ -d "public/admin/js/vendor" ]; then
  echo "✅ vendor目录已创建"
  echo "本地化资源:"
  ls -lh public/admin/js/vendor/*.js 2>/dev/null | awk '{print "  ✅", $9, "-", $5}' || echo "  无JavaScript库"
else
  echo "❌ vendor目录不存在"
fi
echo ""

# 6. 后端WebSocket服务检查
echo "🏭 6. 后端WebSocket服务检查"
echo "-------------------------------------------"

if [ -f "services/ChatWebSocketService.js" ]; then
  echo "✅ ChatWebSocketService.js 存在"
  
  # 检查WebSocket事件发送
  echo "发送的事件:"
  grep -o "\.emit(['\"][^'\"]*['\"]" services/ChatWebSocketService.js 2>/dev/null | \
    sed "s/\.emit(['\"]//g; s/['\"]//g" | sort -u | head -15 | \
    while read event; do
      # 检查事件命名是否符合规范（包含冒号）
      if echo "$event" | grep -q ":"; then
        echo "  ✅ $event"
      else
        echo "  ⚠️ $event (建议改为 模块:操作 格式)"
      fi
    done
else
  echo "❌ ChatWebSocketService.js 不存在"
fi
echo ""

# 7. 前后端事件一致性检查
echo "🔗 7. 前后端WebSocket事件一致性检查"
echo "-------------------------------------------"

# 提取后端发送的事件
BACKEND_EVENTS=$(grep -o "\.emit(['\"][^'\"]*['\"]" services/ChatWebSocketService.js 2>/dev/null | \
  sed "s/\.emit(['\"]//g; s/['\"]//g" | sort -u)

# 提取前端监听的事件
FRONTEND_EVENTS=$(grep -ohr "wsConnection\.on(['\"][^'\"]*['\"]" public/admin/*.html 2>/dev/null | \
  sed "s/wsConnection\.on(['\"]//g; s/['\"]//g" | sort -u)

echo "后端发送的事件 (共 $(echo "$BACKEND_EVENTS" | wc -l) 个):"
echo "$BACKEND_EVENTS" | while read event; do
  if [ -n "$event" ]; then
    echo "  📤 $event"
  fi
done

echo ""
echo "前端监听的事件 (共 $(echo "$FRONTEND_EVENTS" | grep -v '^$' | wc -l) 个):"
echo "$FRONTEND_EVENTS" | while read event; do
  if [ -n "$event" ]; then
    # 检查后端是否发送此事件
    if echo "$BACKEND_EVENTS" | grep -q "^${event}$"; then
      echo "  ✅ $event (后端已实现)"
    else
      echo "  ⚠️ $event (后端未发送，可能是系统事件)"
    fi
  fi
done
echo ""

# 8. 潜在风险点识别
echo "⚠️ 8. 潜在风险点识别"
echo "-------------------------------------------"
RISKS=0

# 检查是否有inline onclick等不安全的事件绑定
INLINE_EVENTS=$(grep -hr "onclick=\|onload=\|onerror=" public/admin/*.html 2>/dev/null | wc -l)
if [ $INLINE_EVENTS -gt 0 ]; then
  echo "⚠️ 发现 $INLINE_EVENTS 处内联事件绑定 (onclick/onload/onerror)"
  echo "   建议: 使用addEventListener替代"
  ((RISKS++))
fi

# 检查是否有eval或Function构造器
EVAL_COUNT=$(grep -hr "eval(\|new Function(" public/admin/*.html 2>/dev/null | wc -l)
if [ $EVAL_COUNT -gt 0 ]; then
  echo "❌ 发现 $EVAL_COUNT 处使用eval或Function构造器（高风险）"
  ((RISKS++))
fi

# 检查是否有硬编码的token或密钥
HARDCODED_SECRETS=$(grep -hr "token.*=.*['\"][a-zA-Z0-9]{20,}['\"]" public/admin/*.html 2>/dev/null | wc -l)
if [ $HARDCODED_SECRETS -gt 0 ]; then
  echo "⚠️ 发现 $HARDCODED_SECRETS 处疑似硬编码token"
  ((RISKS++))
fi

if [ $RISKS -eq 0 ]; then
  echo "✅ 未发现明显的安全风险"
fi
echo ""

# 9. 综合评分
echo "📊 9. 综合安全评分"
echo "-------------------------------------------"

# 计算评分
TOTAL_SCORE=100
CSP_PENALTY=$((CSP_MISSING * 10))
SOCKETIO_PENALTY=$((SOCKETIO_CDN_COUNT * 15))
RISK_PENALTY=$((RISKS * 5))

TOTAL_SCORE=$((TOTAL_SCORE - CSP_PENALTY - SOCKETIO_PENALTY - RISK_PENALTY))

if [ $TOTAL_SCORE -lt 0 ]; then
  TOTAL_SCORE=0
fi

echo "评分计算:"
echo "  基础分: 100"
echo "  CSP缺失扣分: -$CSP_PENALTY ($CSP_MISSING 个文件 × 10分)"
echo "  Socket.IO CDN扣分: -$SOCKETIO_PENALTY ($SOCKETIO_CDN_COUNT 个文件 × 15分)"
echo "  安全风险扣分: -$RISK_PENALTY ($RISKS 个风险 × 5分)"
echo ""
echo "综合评分: $TOTAL_SCORE / 100"

if [ $TOTAL_SCORE -ge 90 ]; then
  echo "评级: 🟢 优秀"
elif [ $TOTAL_SCORE -ge 70 ]; then
  echo "评级: 🟡 良好"
elif [ $TOTAL_SCORE -ge 50 ]; then
  echo "评级: 🟠 一般"
else
  echo "评级: 🔴 需改进"
fi
echo ""

# 10. 改进建议
echo "💡 10. 改进建议"
echo "-------------------------------------------"

if [ $CSP_MISSING -gt 0 ]; then
  echo "🔧 建议1: 为 $CSP_MISSING 个页面添加CSP策略"
  echo "   执行: 参考 public/admin/templates/page-template.html"
  echo ""
fi

if [ $SOCKETIO_CDN_COUNT -gt 0 ]; then
  echo "🔧 建议2: 本地化 $SOCKETIO_CDN_COUNT 个文件的socket.io引用"
  echo "   修改: 将CDN引用改为 /admin/js/vendor/socket.io.min.js"
  echo ""
fi

# 检查是否有Chart.js需要本地化
if grep -q "chart.js" public/admin/*.html 2>/dev/null; then
  echo "🔧 建议3: 考虑本地化Chart.js库"
  echo "   当前: 使用CDN（https://cdn.jsdelivr.net/npm/chart.js）"
  echo "   建议: 下载到 public/admin/js/vendor/chart.min.js"
  echo ""
fi

echo "========================================="
echo "✅ 审计完成"
echo "========================================="


