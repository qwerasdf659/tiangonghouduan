#!/bin/bash

# ====================================================================
# Web管理后台外部访问测试脚本
# 创建时间：2025年11月23日 12:23
# 功能：快速验证外部访问配置是否正确
# ====================================================================

set -e

echo "=================================================="
echo "🔍 Web管理后台外部访问配置测试"
echo "=================================================="
echo ""

# 获取当前时间
CURRENT_TIME=$(date '+%Y年%m月%d日 %H:%M:%S')
echo "⏰ 测试时间：$CURRENT_TIME"
echo ""

# ====================================================================
# 步骤1：检查服务运行状态
# ====================================================================
echo "📊 步骤1：检查服务运行状态"
echo "--------------------------------------------------"

NODE_PROCESS=$(ps aux | grep -E 'node.*app\.js' | grep -v grep | head -1)

if [ -n "$NODE_PROCESS" ]; then
    PID=$(echo "$NODE_PROCESS" | awk '{print $2}')
    echo "✅ 服务正在运行"
    echo "   进程ID：$PID"
    echo "   命令：$(echo "$NODE_PROCESS" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}')"
else
    echo "❌ 服务未运行"
    echo "   请先启动服务：npm run pm:start"
    exit 1
fi
echo ""

# ====================================================================
# 步骤2：检查端口监听状态
# ====================================================================
echo "📊 步骤2：检查端口监听状态"
echo "--------------------------------------------------"

PORT_STATUS=$(netstat -tlnp 2>/dev/null | grep :3000 | head -1 || ss -tlnp 2>/dev/null | grep :3000 | head -1)

if [ -n "$PORT_STATUS" ]; then
    if echo "$PORT_STATUS" | grep -q "0.0.0.0:3000"; then
        echo "✅ 端口监听正确：0.0.0.0:3000（监听所有网络接口）"
    elif echo "$PORT_STATUS" | grep -q "127.0.0.1:3000"; then
        echo "⚠️  端口监听：127.0.0.1:3000（仅本地访问）"
        echo "   建议：修改为监听0.0.0.0以支持外部访问"
    else
        echo "✅ 端口3000正在监听"
    fi
else
    echo "❌ 未检测到3000端口监听"
    exit 1
fi
echo ""

# ====================================================================
# 步骤3：获取网络地址信息
# ====================================================================
echo "📊 步骤3：获取网络地址信息"
echo "--------------------------------------------------"

# 获取内网IP
INTERNAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || ip addr show | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d/ -f1)

if [ -n "$INTERNAL_IP" ]; then
    echo "✅ 内网IP地址：$INTERNAL_IP"
    echo "   局域网访问地址："
    echo "   http://$INTERNAL_IP:3000/admin"
else
    echo "⚠️  无法获取内网IP地址"
fi

# 尝试获取公网IP（如果在云服务器上）
echo ""
echo "🌐 尝试获取公网IP地址..."
PUBLIC_IP=$(curl -s --connect-timeout 3 ifconfig.me 2>/dev/null || curl -s --connect-timeout 3 ipinfo.io/ip 2>/dev/null || echo "")

if [ -n "$PUBLIC_IP" ]; then
    echo "✅ 公网IP地址：$PUBLIC_IP"
    echo "   公网访问地址（需配置云平台安全组）："
    echo "   http://$PUBLIC_IP:3000/admin"
else
    echo "⚠️  无法获取公网IP（可能在内网环境）"
fi
echo ""

# ====================================================================
# 步骤4：测试本地访问
# ====================================================================
echo "📊 步骤4：测试本地访问"
echo "--------------------------------------------------"

# 健康检查测试
echo "🔍 测试健康检查端点..."
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null)

if [ "$HEALTH_CODE" = "200" ]; then
    echo "✅ 健康检查通过（HTTP $HEALTH_CODE）"
    HEALTH_DATA=$(curl -s http://localhost:3000/health 2>/dev/null)
    echo "   系统状态：$(echo "$HEALTH_DATA" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
    echo "   版本：$(echo "$HEALTH_DATA" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)"
else
    echo "⚠️  健康检查异常（HTTP $HEALTH_CODE）"
fi
echo ""

# 管理后台登录页测试
echo "🔍 测试管理后台登录页..."
ADMIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/login.html 2>/dev/null)

if [ "$ADMIN_CODE" = "200" ]; then
    echo "✅ 管理后台登录页访问正常（HTTP $ADMIN_CODE）"
else
    echo "⚠️  管理后台登录页异常（HTTP $ADMIN_CODE）"
fi
echo ""

# ====================================================================
# 步骤5：测试内网IP访问
# ====================================================================
if [ -n "$INTERNAL_IP" ]; then
    echo "📊 步骤5：测试内网IP访问"
    echo "--------------------------------------------------"
    
    echo "🔍 测试通过内网IP访问..."
    INTERNAL_HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$INTERNAL_IP:3000/health 2>/dev/null)
    
    if [ "$INTERNAL_HEALTH_CODE" = "200" ]; then
        echo "✅ 内网IP访问正常（HTTP $INTERNAL_HEALTH_CODE）"
        echo "   其他设备可通过此地址访问："
        echo "   http://$INTERNAL_IP:3000/admin"
    else
        echo "⚠️  内网IP访问异常（HTTP $INTERNAL_HEALTH_CODE）"
        echo "   可能原因：防火墙阻拦或网络配置问题"
    fi
    echo ""
fi

# ====================================================================
# 步骤6：检查防火墙状态
# ====================================================================
echo "📊 步骤6：检查防火墙状态"
echo "--------------------------------------------------"

# 检查UFW防火墙
if command -v ufw &> /dev/null; then
    UFW_STATUS=$(sudo ufw status 2>/dev/null | head -1 || echo "需要sudo权限")
    echo "🔥 UFW防火墙：$UFW_STATUS"
    
    if echo "$UFW_STATUS" | grep -q "active"; then
        echo "   检查3000端口规则..."
        sudo ufw status | grep 3000 || echo "   ⚠️  未配置3000端口规则"
    fi
# 检查firewalld
elif command -v firewall-cmd &> /dev/null; then
    FIREWALLD_STATUS=$(sudo firewall-cmd --state 2>/dev/null || echo "未运行")
    echo "🔥 Firewalld防火墙：$FIREWALLD_STATUS"
    
    if [ "$FIREWALLD_STATUS" = "running" ]; then
        echo "   检查3000端口规则..."
        sudo firewall-cmd --list-ports | grep 3000 || echo "   ⚠️  未配置3000端口规则"
    fi
else
    echo "✅ 未检测到系统防火墙（或无需配置）"
fi
echo ""

# ====================================================================
# 步骤7：检查CORS配置
# ====================================================================
echo "📊 步骤7：检查CORS配置"
echo "--------------------------------------------------"

echo "🔍 测试CORS配置..."
CORS_RESPONSE=$(curl -s -H "Origin: http://test-origin.com" \
                     -H "Access-Control-Request-Method: GET" \
                     -X OPTIONS \
                     http://localhost:3000/api/v4/auth/login 2>/dev/null)

if echo "$CORS_RESPONSE" | grep -q "Access-Control"; then
    echo "✅ CORS配置已启用"
else
    echo "⚠️  CORS配置可能未正确启用"
fi
echo ""

# ====================================================================
# 步骤8：生成访问二维码（如果支持）
# ====================================================================
if [ -n "$INTERNAL_IP" ] && command -v qrencode &> /dev/null; then
    echo "📊 步骤8：生成访问二维码"
    echo "--------------------------------------------------"
    
    ADMIN_URL="http://$INTERNAL_IP:3000/admin"
    echo "扫描二维码快速访问："
    qrencode -t UTF8 "$ADMIN_URL"
    echo ""
fi

# ====================================================================
# 测试总结
# ====================================================================
echo "=================================================="
echo "📋 测试总结"
echo "=================================================="
echo ""

echo "✅ 已完成的检查项："
echo "   1. 服务运行状态检查"
echo "   2. 端口监听状态验证"
echo "   3. 网络地址获取"
echo "   4. 本地访问测试"

if [ -n "$INTERNAL_IP" ]; then
    echo "   5. 内网IP访问测试"
fi

echo "   6. 防火墙状态检查"
echo "   7. CORS配置验证"
echo ""

echo "🎯 推荐访问方式："
echo ""

if [ -n "$INTERNAL_IP" ]; then
    echo "📱 局域网访问（推荐）："
    echo "   地址：http://$INTERNAL_IP:3000/admin"
    echo "   适用：同一Wi-Fi网络下的所有设备"
    echo ""
fi

if [ -n "$PUBLIC_IP" ]; then
    echo "🌍 公网访问："
    echo "   地址：http://$PUBLIC_IP:3000/admin"
    echo "   注意：需要在云平台配置安全组开放3000端口"
    echo ""
fi

echo "📖 详细配置文档："
echo "   查看：docs/web-admin-external-access-guide.md"
echo ""

echo "🔧 常用命令："
echo "   重启服务：npm run pm:restart"
echo "   查看日志：tail -f logs/app.log"
echo "   查看状态：npm run pm:status"
echo ""

echo "=================================================="
echo "✅ 测试完成！"
echo "=================================================="

