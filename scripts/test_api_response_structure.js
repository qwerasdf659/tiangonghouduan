/**
 * 测试API响应结构 - 模拟前端请求
 * 验证后端API返回的完整数据结构是否符合前端期望
 */

const http = require('http')

// 测试配置
const TEST_CONFIG = {
  host: 'localhost',
  port: 3000,
  endpoints: [
    { path: '/api/v4/console/user-management/users', name: '用户列表' },
  ]
}

// 模拟管理员JWT Token（用于测试）
const ADMIN_TOKEN = process.env.TEST_ADMIN_TOKEN || ''

async function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      path: endpoint.path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ADMIN_TOKEN ? `Bearer ${ADMIN_TOKEN}` : ''
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
    req.setTimeout(5000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
    req.end()
  })
}

async function testApiResponses() {
  console.log('🔍 测试API响应结构（模拟前端请求）\n')
  console.log('=' .repeat(60))

  for (const endpoint of TEST_CONFIG.endpoints) {
    console.log(`\n📡 测试: ${endpoint.name}`)
    console.log(`   路径: ${endpoint.path}`)
    
    try {
      const result = await makeRequest(endpoint)
      console.log(`   HTTP状态码: ${result.status}`)
      
      if (result.status === 200 && result.data.success) {
        console.log('\n   ✅ 请求成功')
        console.log('\n   📊 响应数据结构分析:')
        
        const response = result.data
        console.log(`      response.success = ${response.success}`)
        console.log(`      response.code = ${response.code}`)
        console.log(`      response.message = ${response.message}`)
        
        if (response.data) {
          console.log('\n   📋 response.data 字段:')
          Object.keys(response.data).forEach(key => {
            const val = response.data[key]
            if (Array.isArray(val)) {
              console.log(`      - ${key}: Array[${val.length}]`)
            } else if (typeof val === 'object' && val !== null) {
              console.log(`      - ${key}: Object ${JSON.stringify(val)}`)
            } else {
              console.log(`      - ${key}: ${val}`)
            }
          })
          
          // 特别检查统计数据
          if (response.data.statistics) {
            console.log('\n   📈 statistics 详细分析:')
            console.log(`      statistics 类型: ${typeof response.data.statistics}`)
            console.log(`      statistics 内容: ${JSON.stringify(response.data.statistics, null, 6)}`)
            
            // 验证前端期望的字段
            const expectedFields = ['total_users', 'today_new', 'active_users', 'vip_users']
            console.log('\n   🔎 前端期望字段检查:')
            expectedFields.forEach(field => {
              const value = response.data.statistics[field]
              const status = value !== undefined ? '✅' : '❌'
              console.log(`      ${status} statistics.${field} = ${value}`)
            })
            
            // 模拟前端 getNestedValue 函数
            console.log('\n   🎯 模拟前端 getNestedValue 测试:')
            const testPaths = [
              'statistics.total_users',
              'statistics.today_new',
              'statistics.active_users',
              'statistics.vip_users'
            ]
            testPaths.forEach(path => {
              const value = getNestedValue(response.data, path)
              console.log(`      getNestedValue(response.data, '${path}') = ${value}`)
            })
          } else {
            console.log('\n   ❌ response.data.statistics 不存在!')
          }
        }
      } else if (result.status === 401) {
        console.log('\n   ⚠️ 需要认证 - 请设置 TEST_ADMIN_TOKEN 环境变量')
        console.log('   提示: 可以从浏览器开发者工具中复制管理员的JWT Token')
      } else {
        console.log(`\n   ❌ 请求失败: ${result.data.message || '未知错误'}`)
      }
    } catch (error) {
      console.log(`\n   ❌ 请求错误: ${error.message}`)
    }
  }
  
  console.log('\n' + '=' .repeat(60))
  console.log('\n✅ API响应结构测试完成')
}

// 模拟前端的 getNestedValue 函数
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

// 运行测试
testApiResponses().catch(console.error)




















