#!/bin/bash
# 管理后台前端功能测试脚本
# 测试后端API和验证数据结构

echo "🚀 管理后台前端功能测试"
echo "=============================================="
echo "测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

BASE_URL="http://localhost:3000"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
  local name=$1
  local endpoint=$2
  local expected_status=$3
  
  echo -n "测试: $name ... "
  
  response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$endpoint" 2>/dev/null)
  
  if [ "$response" == "$expected_status" ]; then
    echo -e "${GREEN}✅ 通过 (HTTP $response)${NC}"
    return 0
  else
    echo -e "${RED}❌ 失败 (预期 $expected_status, 实际 $response)${NC}"
    return 1
  fi
}

# 测试API数据结构
test_api_structure() {
  local name=$1
  local endpoint=$2
  
  echo ""
  echo "📊 $name API数据结构分析:"
  
  response=$(curl -s "$BASE_URL$endpoint" 2>/dev/null)
  
  if [ -z "$response" ]; then
    echo -e "${RED}   ❌ 无响应${NC}"
    return 1
  fi
  
  # 使用Node.js解析JSON
  node -e "
    try {
      const data = JSON.parse('$response'.replace(/'/g, \"'\"))
      
      if (data.success) {
        console.log('   ✅ 请求成功')
        
        // 检查公告数据
        const announcements = data.data?.announcements || data.data?.list || []
        console.log('   📋 公告数量: ' + announcements.length)
        
        if (announcements.length > 0) {
          const item = announcements[0]
          console.log('   📌 后端字段:')
          Object.keys(item).forEach(key => {
            const val = item[key]
            const type = typeof val
            console.log('      - ' + key + ' (' + type + ')')
          })
        }
      } else {
        console.log('   ⚠️ 请求失败: ' + (data.message || 'unknown'))
      }
    } catch (e) {
      console.log('   ⚠️ JSON解析失败')
    }
  " 2>/dev/null
}

echo "1️⃣ 基础连接测试"
echo "----------------------------------------------"
test_endpoint "健康检查" "/health" "200"
test_endpoint "公开公告API" "/api/v4/system/announcements" "200"
test_endpoint "管理端公告(无认证)" "/api/v4/console/system/announcements" "401"

echo ""
echo "2️⃣ 静态资源测试"
echo "----------------------------------------------"
test_endpoint "公告管理页面" "/admin/announcements.html" "200"
test_endpoint "通知中心页面" "/admin/notifications.html" "200"
test_endpoint "通用JS" "/admin/js/admin-common.js" "200"
test_endpoint "公告页面JS" "/admin/js/pages/announcements.js" "200"

echo ""
echo "3️⃣ API数据结构验证"
echo "----------------------------------------------"
# 获取公开API数据进行分析
response=$(curl -s "$BASE_URL/api/v4/system/announcements" 2>/dev/null)

if [ ! -z "$response" ]; then
  node -e "
    const data = JSON.parse(process.argv[1])
    
    if (!data.success) {
      console.log('❌ API返回失败')
      process.exit(1)
    }
    
    const announcements = data.data?.announcements || []
    console.log('📋 公告数量: ' + announcements.length)
    
    if (announcements.length > 0) {
      const item = announcements[0]
      
      // 检查关键后端字段
      const backendFields = ['id', 'title', 'content', 'type', 'priority', 'is_active', 'created_at', 'expires_at']
      console.log('')
      console.log('📌 后端字段检查:')
      
      let allPresent = true
      backendFields.forEach(field => {
        const present = item[field] !== undefined
        const icon = present ? '✅' : '❌'
        console.log('   ' + icon + ' ' + field + ': ' + (present ? '存在' : '缺失'))
        if (!present && field !== 'expires_at') allPresent = false
      })
      
      console.log('')
      if (allPresent) {
        console.log('🎉 所有关键字段存在，前端可正常解析')
      } else {
        console.log('⚠️ 部分字段缺失，需检查后端返回')
      }
    }
  " "$response" 2>/dev/null
fi

echo ""
echo "=============================================="
echo "✅ 测试完成"
echo ""
echo "📝 前端修复说明:"
echo "   - 公告页面直接使用后端字段 (is_active, priority, expires_at 等)"
echo "   - formatDate 函数已支持中文日期格式"
echo "   - formatRelativeTime 函数已支持中文日期格式"
echo "   - 类型和状态徽章已适配后端枚举值"



