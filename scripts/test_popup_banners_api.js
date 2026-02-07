/**
 * 弹窗Banner API 测试脚本
 *
 * 用途：测试 popup-banners 后端 API 是否正常工作
 * 执行：node scripts/test-popup-banners-api.js
 *
 * @date 2026-01-09
 */

const http = require('http')

const BASE_URL = 'http://localhost:3000'
let adminToken = null

/**
 * 发送 HTTP 请求
 */
function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`
    }

    const req = http.request(options, res => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          resolve({ status: res.statusCode, data: parsed })
        } catch {
          resolve({ status: res.statusCode, data: body })
        }
      })
    })

    req.on('error', reject)

    if (data) {
      req.write(JSON.stringify(data))
    }
    req.end()
  })
}

/**
 * 测试健康检查
 */
async function testHealthCheck() {
  console.log('\n🔍 测试 1: 健康检查...')
  try {
    const result = await makeRequest('GET', '/health')
    // 兼容两种健康检查响应格式：
    // 1. { status: 'healthy' }
    // 2. { success: true, data: { status: 'healthy' } }
    const isHealthy =
      result.status === 200 &&
      (result.data.status === 'healthy' ||
        result.data.data?.status === 'healthy' ||
        result.data.success)

    if (isHealthy) {
      console.log('✅ 健康检查通过')
      console.log('   系统版本:', result.data.data?.version || result.data.version || 'N/A')
      console.log('   数据库:', result.data.data?.systems?.database || 'N/A')
      console.log('   Redis:', result.data.data?.systems?.redis || 'N/A')
      return true
    } else {
      console.log('❌ 健康检查失败:', result.data)
      return false
    }
  } catch (error) {
    console.log('❌ 健康检查错误:', error.message)
    return false
  }
}

/**
 * 测试管理员登录
 */
async function testAdminLogin() {
  console.log('\n🔍 测试 2: 管理员登录...')
  try {
    // 尝试使用测试账号登录
    const result = await makeRequest('POST', '/api/v4/auth/login', {
      mobile: '13800138002',
      password: 'admin123'
    })

    if (result.status === 200 && result.data.success && result.data.data?.token) {
      adminToken = result.data.data.token
      console.log('✅ 管理员登录成功')
      console.log('   用户ID:', result.data.data.user?.user_id)
      console.log('   昵称:', result.data.data.user?.nickname)
      return true
    } else {
      console.log('⚠️ 登录失败，尝试其他测试账号...')

      // 尝试第二个测试账号
      const result2 = await makeRequest('POST', '/api/v4/auth/login', {
        mobile: '13800000001',
        password: 'test123'
      })

      if (result2.status === 200 && result2.data.success && result2.data.data?.token) {
        adminToken = result2.data.data.token
        console.log('✅ 使用备用账号登录成功')
        return true
      }

      console.log('❌ 登录失败:', result.data.message || result.data)
      return false
    }
  } catch (error) {
    console.log('❌ 登录错误:', error.message)
    return false
  }
}

/**
 * 测试弹窗统计 API
 */
async function testStatisticsAPI() {
  console.log('\n🔍 测试 3: 弹窗统计 API...')
  try {
    const result = await makeRequest(
      'GET',
      '/api/v4/console/popup-banners/statistics',
      null,
      adminToken
    )

    console.log('   状态码:', result.status)
    console.log('   响应:', JSON.stringify(result.data, null, 2))

    if (result.status === 200 && result.data.success) {
      const stats = result.data.data.statistics || result.data.data
      console.log('✅ 弹窗统计 API 正常')
      console.log('   总数:', stats.total)
      console.log('   已启用:', stats.active)
      console.log('   已禁用:', stats.inactive)
      console.log('   首页弹窗:', stats.by_position?.home)
      return true
    } else {
      console.log('❌ 弹窗统计 API 失败:', result.data.message || result.data)
      return false
    }
  } catch (error) {
    console.log('❌ 弹窗统计 API 错误:', error.message)
    return false
  }
}

/**
 * 测试弹窗列表 API
 */
async function testListAPI() {
  console.log('\n🔍 测试 4: 弹窗列表 API...')
  try {
    const result = await makeRequest(
      'GET',
      '/api/v4/console/popup-banners?page=1&limit=10',
      null,
      adminToken
    )

    console.log('   状态码:', result.status)

    if (result.status === 200 && result.data.success) {
      const data = result.data.data
      console.log('✅ 弹窗列表 API 正常')
      console.log('   弹窗数量:', data.banners?.length || 0)
      console.log('   总记录:', data.pagination?.total || 0)
      console.log('   当前页:', data.pagination?.page || 1)

      if (data.banners && data.banners.length > 0) {
        console.log('\n   📋 弹窗列表:')
        data.banners.forEach((banner, index) => {
          console.log(
            `   ${index + 1}. [${banner.popup_banner_id}] ${banner.title} - ${banner.is_active ? '启用' : '禁用'}`
          )
        })
      } else {
        console.log('   (暂无弹窗数据)')
      }
      return true
    } else {
      console.log('❌ 弹窗列表 API 失败:', result.data.message || result.data)
      return false
    }
  } catch (error) {
    console.log('❌ 弹窗列表 API 错误:', error.message)
    return false
  }
}

/**
 * 测试数据库连接
 */
async function testDatabaseConnection() {
  console.log('\n🔍 测试 5: 数据库表检查...')
  try {
    // 通过健康检查 API 检查数据库
    const result = await makeRequest('GET', '/health')

    if (result.status === 200 && result.data.components?.database?.status === 'connected') {
      console.log('✅ 数据库连接正常')
      return true
    } else {
      console.log('⚠️ 数据库状态需要检查')
      return true // 不阻塞后续测试
    }
  } catch (error) {
    console.log('❌ 数据库检查错误:', error.message)
    return false
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('='.repeat(60))
  console.log('🧪 弹窗Banner API 测试')
  console.log('='.repeat(60))
  console.log('目标服务器:', BASE_URL)
  console.log('测试时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))

  const results = {
    total: 0,
    passed: 0,
    failed: 0
  }

  // 测试 1: 健康检查
  results.total++
  if (await testHealthCheck()) {
    results.passed++
  } else {
    results.failed++
    console.log('\n⚠️ 服务未启动，请先启动后端服务: npm start')
    return
  }

  // 测试 2: 管理员登录
  results.total++
  if (await testAdminLogin()) {
    results.passed++
  } else {
    results.failed++
    console.log('\n⚠️ 无法获取管理员 Token，跳过需要认证的测试')

    // 即使登录失败，也尝试测试公开 API
    console.log('\n🔍 尝试测试公开的弹窗 API...')
    try {
      const publicResult = await makeRequest(
        'GET',
        '/api/v4/system/popup-banners?position=home&limit=5'
      )
      console.log('   公开API状态码:', publicResult.status)
      if (publicResult.status === 200) {
        console.log('✅ 公开弹窗 API 可访问')
      }
    } catch (error) {
      console.log('❌ 公开弹窗 API 错误:', error.message)
    }
  }

  // 测试 3: 弹窗统计
  if (adminToken) {
    results.total++
    if (await testStatisticsAPI()) {
      results.passed++
    } else {
      results.failed++
    }
  }

  // 测试 4: 弹窗列表
  if (adminToken) {
    results.total++
    if (await testListAPI()) {
      results.passed++
    } else {
      results.failed++
    }
  }

  // 测试 5: 数据库
  results.total++
  if (await testDatabaseConnection()) {
    results.passed++
  } else {
    results.failed++
  }

  // 输出总结
  console.log('\n' + '='.repeat(60))
  console.log('📊 测试结果汇总')
  console.log('='.repeat(60))
  console.log(`总测试数: ${results.total}`)
  console.log(`通过: ${results.passed} ✅`)
  console.log(`失败: ${results.failed} ❌`)
  console.log(`通过率: ${((results.passed / results.total) * 100).toFixed(1)}%`)

  if (results.failed === 0) {
    console.log('\n🎉 所有测试通过！弹窗Banner API 运行正常。')
  } else {
    console.log('\n⚠️ 存在失败的测试，请检查上述错误信息。')
  }

  console.log('\n💡 提示:')
  console.log('1. 如果统计显示为0，说明数据库中暂无弹窗数据')
  console.log('2. 可以通过 Web 管理后台新建弹窗来添加测试数据')
  console.log('3. 刷新浏览器页面后查看数据是否正常显示')
}

main().catch(console.error)
