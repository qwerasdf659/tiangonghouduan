#!/bin/bash
# 配置工具API测试脚本（带认证）
# 用法: ./test-config-api-auth.sh [token]

API_BASE="http://localhost:3000"

# 如果没有传入token，尝试登录获取
TOKEN=${1:-""}

echo "========================================================================"
echo "🔍 配置工具API测试（带认证）"
echo "========================================================================"

# 测试健康检查
echo -e "\n📋 1. 测试健康检查"
curl -s "$API_BASE/health" | head -c 300
echo -e "\n"

# 如果没有token，先尝试登录
if [ -z "$TOKEN" ]; then
    echo -e "\n📋 2. 尝试使用测试账号登录获取Token"
    # 尝试使用常见的测试账号
    LOGIN_RESULT=$(curl -s -X POST "$API_BASE/api/v4/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"mobile":"13800138000","password":"123456"}')
    
    echo "登录响应: $(echo $LOGIN_RESULT | head -c 200)"
    
    # 尝试提取token
    TOKEN=$(echo $LOGIN_RESULT | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$TOKEN" ]; then
        echo "⚠️ 无法自动获取Token，请手动传入Token参数"
        echo "用法: ./test-config-api-auth.sh <your-admin-token>"
        echo ""
        echo "📋 无认证测试（API应返回401）:"
    fi
fi

echo -e "\n========================================================================"
echo "📋 测试系统设置API"
echo "========================================================================"

# 测试获取设置概览
echo -e "\n🔸 GET /api/v4/console/settings (获取设置概览)"
if [ -n "$TOKEN" ]; then
    curl -s "$API_BASE/api/v4/console/settings" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
else
    curl -s "$API_BASE/api/v4/console/settings" \
        -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
fi
echo -e "\n"

# 测试获取基础设置
echo -e "\n🔸 GET /api/v4/console/settings/basic (获取基础设置)"
if [ -n "$TOKEN" ]; then
    curl -s "$API_BASE/api/v4/console/settings/basic" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
else
    curl -s "$API_V4/console/settings/basic" \
        -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
fi
echo -e "\n"

# 测试获取积分设置
echo -e "\n🔸 GET /api/v4/console/settings/points (获取积分设置)"
if [ -n "$TOKEN" ]; then
    curl -s "$API_BASE/api/v4/console/settings/points" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
else
    curl -s "$API_BASE/api/v4/console/settings/points" \
        -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
fi
echo -e "\n"

# 测试获取市场设置
echo -e "\n🔸 GET /api/v4/console/settings/marketplace (获取市场设置)"
if [ -n "$TOKEN" ]; then
    curl -s "$API_BASE/api/v4/console/settings/marketplace" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
else
    curl -s "$API_BASE/api/v4/console/settings/marketplace" \
        -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
fi
echo -e "\n"

echo "========================================================================"
echo "🎉 API测试完成"
echo "========================================================================"
echo ""
echo "📋 前端修改说明:"
echo "- 已将 /api/v4/console/system/config 改为 /api/v4/console/settings"
echo "- 已将 /api/v4/console/system/cache/clear 改为 /api/v4/console/cache/clear"
echo "- 前端数据结构已适配后端返回格式"
echo ""
echo "📋 下一步:"
echo "1. 刷新管理后台页面: /admin/config-tools.html"
echo "2. 检查配置列表是否正常显示"
echo "3. 点击分类查看详细配置"

