/**
 * 临时测试脚本 - 测试奖品管理 API
 * 用完请删除
 */

const http = require('http')

// 测试配置
const BASE_URL = 'http://localhost:3000'
const TEST_TOKEN = process.env.TEST_TOKEN || '' // 从环境变量获取或需要手动设置

async function makeRequest(path, method = 'GET', token = TEST_TOKEN) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }
    
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ status: res.statusCode, data: json })
        } catch (e) {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })
    
    req.on('error', reject)
    req.end()
  })
}

async function testAPIs() {
  console.log('='.repeat(60))
  console.log('🔍 测试奖品管理 API')
  console.log('='.repeat(60))
  
  // 测试 1: 检查服务器是否运行
  console.log('\n📡 测试 1: 检查服务器状态...')
  try {
    const health = await makeRequest('/health')
    console.log('  状态码:', health.status)
    console.log('  响应:', JSON.stringify(health.data, null, 2).substring(0, 200))
  } catch (e) {
    console.log('  ❌ 服务器可能未运行:', e.message)
    return
  }
  
  // 测试 2: 奖品列表 API (无认证)
  console.log('\n📡 测试 2: 奖品列表 API (无认证)...')
  try {
    const prizes = await makeRequest('/api/v4/console/prize-pool/list')
    console.log('  状态码:', prizes.status)
    console.log('  响应结构:', Object.keys(prizes.data || {}))
    if (prizes.data?.data) {
      console.log('  数据结构:', Object.keys(prizes.data.data))
    }
  } catch (e) {
    console.log('  ❌ 请求失败:', e.message)
  }
  
  // 测试 3: 活动列表 API (无认证)
  console.log('\n📡 测试 3: 活动列表 API (无认证)...')
  try {
    const campaigns = await makeRequest('/api/v4/console/lottery-campaigns')
    console.log('  状态码:', campaigns.status)
    console.log('  响应结构:', Object.keys(campaigns.data || {}))
  } catch (e) {
    console.log('  ❌ 请求失败:', e.message)
  }
  
  // 测试 4: 监控统计 API (无认证)
  console.log('\n📡 测试 4: 监控统计 API (无认证)...')
  try {
    const stats = await makeRequest('/api/v4/console/lottery-monitoring/stats?time_range=today')
    console.log('  状态码:', stats.status)
    console.log('  响应结构:', Object.keys(stats.data || {}))
  } catch (e) {
    console.log('  ❌ 请求失败:', e.message)
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('✅ API 测试完成')
  console.log('='.repeat(60))
}

// 运行测试
testAPIs().catch(console.error)







































