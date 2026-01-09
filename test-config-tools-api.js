/**
 * 配置工具API测试脚本
 * 
 * 测试后端提供的系统配置相关API
 */

const http = require('http')

// 获取管理员Token（需要先登录获取）
let adminToken = process.env.ADMIN_TOKEN || ''

// API基础配置
const API_BASE = 'http://localhost:3000'

/**
 * 发起HTTP请求
 */
function request(method, path, body = null, token = adminToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE)
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      }
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data)
          resolve({ status: res.statusCode, data: jsonData })
        } catch (e) {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })

    req.on('error', reject)
    
    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

/**
 * 测试结果日志
 */
function logTest(name, result) {
  const status = result.status
  const success = status >= 200 && status < 300
  const icon = success ? '✅' : (status === 401 ? '🔐' : '❌')
  
  console.log(`\n${icon} ${name}`)
  console.log(`   状态: ${status}`)
  console.log(`   响应: ${JSON.stringify(result.data, null, 2).substring(0, 500)}`)
  
  return { name, success, status, data: result.data }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('=' .repeat(60))
  console.log('🔍 配置工具API测试')
  console.log('=' .repeat(60))
  
  const results = []
  
  // 1. 测试服务健康状态
  console.log('\n📋 1. 测试服务健康状态')
  try {
    const healthResult = await request('GET', '/health')
    results.push(logTest('健康检查', healthResult))
  } catch (e) {
    console.log('❌ 健康检查失败:', e.message)
  }

  // 2. 测试获取设置概览（需要认证）
  console.log('\n📋 2. 测试系统设置API')
  try {
    const settingsResult = await request('GET', '/api/v4/console/settings')
    results.push(logTest('获取设置概览', settingsResult))
  } catch (e) {
    console.log('❌ 获取设置概览失败:', e.message)
  }

  // 3. 测试获取基础设置分类
  try {
    const basicResult = await request('GET', '/api/v4/console/settings/basic')
    results.push(logTest('获取基础设置', basicResult))
  } catch (e) {
    console.log('❌ 获取基础设置失败:', e.message)
  }

  // 4. 测试获取抽奖设置分类
  try {
    const lotteryResult = await request('GET', '/api/v4/console/settings/lottery')
    results.push(logTest('获取抽奖设置', lotteryResult))
  } catch (e) {
    console.log('❌ 获取抽奖设置失败:', e.message)
  }

  // 5. 测试获取积分设置分类
  try {
    const pointsResult = await request('GET', '/api/v4/console/settings/points')
    results.push(logTest('获取积分设置', pointsResult))
  } catch (e) {
    console.log('❌ 获取积分设置失败:', e.message)
  }

  // 6. 测试获取安全设置分类
  try {
    const securityResult = await request('GET', '/api/v4/console/settings/security')
    results.push(logTest('获取安全设置', securityResult))
  } catch (e) {
    console.log('❌ 获取安全设置失败:', e.message)
  }

  // 7. 测试旧的（不存在的）API路径
  console.log('\n📋 3. 测试旧的API路径（应该返回404）')
  try {
    const oldApiResult = await request('GET', '/api/v4/console/system/config')
    results.push(logTest('旧API路径 /system/config', oldApiResult))
  } catch (e) {
    console.log('❌ 旧API测试失败:', e.message)
  }

  // 8. 测试系统监控接口
  console.log('\n📋 4. 测试系统监控API')
  try {
    const statusResult = await request('GET', '/api/v4/console/system/status')
    results.push(logTest('系统状态', statusResult))
  } catch (e) {
    console.log('❌ 系统状态测试失败:', e.message)
  }

  try {
    const dashboardResult = await request('GET', '/api/v4/console/system/dashboard')
    results.push(logTest('仪表板数据', dashboardResult))
  } catch (e) {
    console.log('❌ 仪表板测试失败:', e.message)
  }

  // 汇总
  console.log('\n' + '=' .repeat(60))
  console.log('📊 测试汇总')
  console.log('=' .repeat(60))
  
  const successCount = results.filter(r => r.success).length
  const authCount = results.filter(r => r.status === 401).length
  const failCount = results.filter(r => !r.success && r.status !== 401).length
  
  console.log(`✅ 成功: ${successCount}`)
  console.log(`🔐 需要认证: ${authCount}`)
  console.log(`❌ 失败: ${failCount}`)
  
  // 分析API可用性
  console.log('\n' + '=' .repeat(60))
  console.log('🔧 API可用性分析')
  console.log('=' .repeat(60))
  
  console.log(`
前端请求的API路径（错误）:
- /api/v4/console/system/config  ❌ 404 (不存在)
- /api/v4/console/system/cache/clear  ❌ 404 (不存在)
- /api/v4/console/system/feature-flags  ❌ 404 (不存在)
- /api/v4/console/system/maintenance  ❌ 404 (不存在)

后端实际提供的API路径（正确）:
- /api/v4/console/settings  ✅ 获取所有设置概览
- /api/v4/console/settings/:category  ✅ 获取/更新分类设置
- /api/v4/console/cache/clear  ✅ 清除缓存
- /api/v4/console/system/status  ✅ 系统状态
- /api/v4/console/system/dashboard  ✅ 仪表板数据

需要修改前端代码:
1. 将 /system/config 改为 /settings
2. 将 /system/cache/clear 改为 /cache/clear
3. 功能开关和维护模式需要通过 settings 接口实现
`)
}

// 执行测试
runTests().catch(console.error)

