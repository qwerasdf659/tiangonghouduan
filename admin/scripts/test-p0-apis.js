#!/usr/bin/env node
/**
 * P0 运营优化方案 - API 测试脚本
 * 
 * 测试范围：
 * 1. 核销订单列表 API
 * 2. 核销订单统计 API
 * 3. 反馈列表 API
 * 4. 导航徽标 API
 * 5. 待处理中心汇总 API
 * 
 * 使用方式：node admin/scripts/test-p0-apis.js
 * 
 * @temporary 完成测试后删除
 */

const http = require('http')
const path = require('path')

// 加载 .env
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`
const TEST_MOBILE = '13612227930'
const TEST_CODE = '123456'

/**
 * 简单的 HTTP 请求函数
 */
function makeRequest(method, urlPath, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL)
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`
    }
    const req = http.request(options, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) })
        } catch {
          resolve({ status: res.statusCode, data: body })
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    if (data) req.write(JSON.stringify(data))
    req.end()
  })
}

async function runTests() {
  console.log('='.repeat(60))
  console.log('📋 P0 运营优化方案 - API 测试')
  console.log('='.repeat(60))
  
  let token = null
  let passed = 0
  let failed = 0
  
  // 1. 登录获取 Token
  console.log('\n🔐 [1/6] 登录获取 Token...')
  try {
    const loginRes = await makeRequest('POST', '/api/v4/auth/login', {
      mobile: TEST_MOBILE,
      verification_code: TEST_CODE
    })
    if (loginRes.data?.success && loginRes.data?.data?.token) {
      token = loginRes.data.data.token
      console.log('   ✅ 登录成功，用户ID:', loginRes.data.data.user?.user_id || 'N/A')
      passed++
    } else {
      console.log('   ❌ 登录失败:', loginRes.data?.message || '未知错误')
      failed++
      console.log('\n⚠️ 无法继续测试（需要有效Token）')
      process.exit(1)
    }
  } catch (error) {
    console.log('   ❌ 登录请求失败:', error.message)
    console.log('   提示：请确保后端服务正在运行（npm run pm:start:pm2）')
    process.exit(1)
  }
  
  // 2. 核销订单列表
  console.log('\n🎫 [2/6] 核销订单列表 API...')
  try {
    const res = await makeRequest('GET', '/api/v4/console/business-records/redemption-orders?page=1&page_size=5', null, token)
    if (res.data?.success) {
      const data = res.data.data
      console.log('   ✅ 获取成功')
      console.log(`   📊 总记录数: ${data.pagination?.total || 0}`)
      console.log(`   📄 当前页: ${(data.items || data.list || []).length} 条`)
      passed++
    } else {
      console.log('   ❌ 获取失败:', res.data?.message || `HTTP ${res.status}`)
      failed++
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
    failed++
  }
  
  // 3. 核销订单统计
  console.log('\n📊 [3/6] 核销订单统计 API...')
  try {
    const res = await makeRequest('GET', '/api/v4/console/business-records/redemption-orders/statistics', null, token)
    if (res.data?.success) {
      const stats = res.data.data
      console.log('   ✅ 获取成功')
      console.log(`   📊 总数: ${stats.total || 0}`)
      console.log(`   ⏳ 待核销: ${stats.pending || 0}`)
      console.log(`   ✅ 已核销: ${stats.fulfilled || 0}`)
      console.log(`   ⏰ 已过期: ${stats.expired || 0}`)
      console.log(`   ❌ 已取消: ${stats.cancelled || 0}`)
      passed++
    } else {
      console.log('   ❌ 获取失败:', res.data?.message || `HTTP ${res.status}`)
      failed++
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
    failed++
  }
  
  // 4. 反馈列表
  console.log('\n📝 [4/6] 反馈列表 API...')
  try {
    const res = await makeRequest('GET', '/api/v4/console/system/feedbacks?limit=5', null, token)
    if (res.data?.success) {
      const data = res.data.data
      const items = data.feedbacks || data.items || data.list || []
      console.log('   ✅ 获取成功')
      console.log(`   📊 返回: ${Array.isArray(items) ? items.length : 0} 条反馈`)
      passed++
    } else {
      console.log('   ❌ 获取失败:', res.data?.message || `HTTP ${res.status}`)
      failed++
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
    failed++
  }
  
  // 5. 导航徽标
  console.log('\n🔔 [5/6] 导航徽标 API...')
  try {
    const res = await makeRequest('GET', '/api/v4/console/nav/badges', null, token)
    if (res.data?.success) {
      const data = res.data.data
      console.log('   ✅ 获取成功')
      console.log(`   🔔 总待处理: ${data.total || 0}`)
      console.log(`   📋 消费审核: ${data.badges?.consumption || 0}`)
      console.log(`   💬 客服会话: ${data.badges?.customer_service || 0}`)
      console.log(`   ⚠️ 风控告警: ${data.badges?.risk_alert || 0}`)
      console.log(`   🎰 抽奖告警: ${data.badges?.lottery_alert || 0}`)
      console.log(`   🎫 兑换核销: ${data.badges?.redemption || 0}`)
      passed++
    } else {
      console.log('   ❌ 获取失败:', res.data?.message || `HTTP ${res.status}`)
      failed++
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
    failed++
  }
  
  // 6. 待处理中心汇总
  console.log('\n📋 [6/6] 待处理中心汇总 API...')
  try {
    const res = await makeRequest('GET', '/api/v4/console/pending/summary', null, token)
    if (res.data?.success) {
      const data = res.data.data
      console.log('   ✅ 获取成功')
      if (data.segments && Array.isArray(data.segments)) {
        data.segments.forEach(seg => {
          console.log(`   ${seg.category_name || seg.category}: ${seg.count || 0} (紧急: ${seg.urgent_count || 0})`)
        })
      }
      console.log(`   📊 总计: ${data.total?.total_count || 0} (紧急: ${data.total?.urgent_count || 0})`)
      passed++
    } else {
      console.log('   ❌ 获取失败:', res.data?.message || `HTTP ${res.status}`)
      failed++
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
    failed++
  }
  
  // 汇总
  console.log('\n' + '='.repeat(60))
  console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败 (共 ${passed + failed} 项)`)
  console.log('='.repeat(60))
  
  process.exit(failed > 0 ? 1 : 0)
}

runTests().catch(error => {
  console.error('❌ 测试执行失败:', error.message)
  process.exit(1)
})

