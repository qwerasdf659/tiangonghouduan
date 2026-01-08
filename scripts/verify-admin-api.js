#!/usr/bin/env node
/**
 * 🔍 后台管理API完整性验证脚本
 *
 * @description 验证所有后台管理相关API是否正常工作
 * @author Claude Assistant
 * @date 2026-01-09
 *
 * 使用方式:
 *   node scripts/verify-admin-api.js
 *
 * 验证内容:
 * 1. 用户登录认证
 * 2. 用户管理API（列表、详情、角色、状态）
 * 3. 系统仪表板API
 * 4. 其他管理模块API
 */

'use strict'

require('dotenv').config()

const http = require('http')
const https = require('https')

// 配置
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const TEST_MOBILE = '13612227930'
const TEST_CODE = '123456'

/**
 * HTTP请求封装
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @returns {Promise<Object>} 响应数据
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(url, API_BASE_URL)
    const isHttps = fullUrl.protocol === 'https:'
    const client = isHttps ? https : http

    const reqOptions = {
      hostname: fullUrl.hostname,
      port: fullUrl.port || (isHttps ? 443 : 80),
      path: fullUrl.pathname + fullUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }

    const req = client.request(reqOptions, res => {
      let data = ''
      res.on('data', chunk => {
        data += chunk
      })
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: JSON.parse(data)
          })
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          })
        }
      })
    })

    req.on('error', reject)

    if (options.body) {
      req.write(JSON.stringify(options.body))
    }

    req.end()
  })
}

/**
 * 登录获取Token
 * @returns {Promise<string>} JWT Token
 */
async function login() {
  console.log('\n🔐 === 登录认证 ===')
  console.log(`📱 手机号: ${TEST_MOBILE}`)
  console.log(`🔑 验证码: ${TEST_CODE}`)

  const response = await request('/api/v4/auth/quick-login', {
    method: 'POST',
    body: { mobile: TEST_MOBILE, code: TEST_CODE }
  })

  if (!response.data.success) {
    throw new Error(`登录失败: ${response.data.message || '未知错误'}`)
  }

  const token = response.data.data.access_token
  console.log('✅ 登录成功')
  console.log(`👤 用户ID: ${response.data.data.user.user_id}`)
  console.log(`📛 昵称: ${response.data.data.user.nickname}`)
  console.log(`🎭 角色: ${response.data.data.user.roles.map(r => r.role_name).join(', ')}`)

  return token
}

/**
 * 验证API端点
 * @param {string} name - API名称
 * @param {string} path - API路径
 * @param {string} token - JWT Token
 * @param {Object} options - 请求选项
 * @returns {Promise<Object>} 验证结果
 */
async function verifyApi(name, path, token, options = {}) {
  const startTime = Date.now()

  try {
    const response = await request(path, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      },
      body: options.body
    })

    const duration = Date.now() - startTime

    const result = {
      name,
      path,
      method: options.method || 'GET',
      status: response.status,
      success: response.data.success,
      message: response.data.message,
      duration: `${duration}ms`,
      dataPreview: null
    }

    // 提取数据预览
    if (response.data.success && response.data.data) {
      const data = response.data.data
      if (Array.isArray(data)) {
        result.dataPreview = `数组, ${data.length}条记录`
      } else if (data.users) {
        result.dataPreview = `用户列表, ${data.users.length}条, 共${data.pagination?.total || '?'}条`
      } else if (data.overview) {
        result.dataPreview = `仪表板数据, 用户总数: ${data.overview.total_users}`
      } else if (typeof data === 'object') {
        result.dataPreview = `对象, ${Object.keys(data).length}个字段`
      }
    }

    // 输出结果
    if (result.success) {
      console.log(`✅ ${name} - ${result.duration}`)
      if (result.dataPreview) {
        console.log(`   📊 ${result.dataPreview}`)
      }
    } else {
      console.log(`❌ ${name} - ${response.data.code}: ${response.data.message}`)
    }

    return result
  } catch (error) {
    console.log(`❌ ${name} - 请求失败: ${error.message}`)
    return {
      name,
      path,
      success: false,
      error: error.message
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║     🔍 后台管理API完整性验证脚本                           ║')
  console.log('║     验证所有管理后台相关API是否正常工作                    ║')
  console.log('╚════════════════════════════════════════════════════════════╝')

  try {
    // 1. 登录获取Token
    const token = await login()

    // 2. 验证各个API模块
    console.log('\n📋 === 用户管理模块 ===')
    const userResults = []

    userResults.push(
      await verifyApi('获取用户列表', '/api/v4/console/user-management/users', token)
    )

    userResults.push(
      await verifyApi(
        '获取用户列表(带分页)',
        '/api/v4/console/user-management/users?page=1&limit=10',
        token
      )
    )

    userResults.push(
      await verifyApi('获取角色列表', '/api/v4/console/user-management/roles', token)
    )

    userResults.push(
      await verifyApi('获取单个用户详情', '/api/v4/console/user-management/users/31', token)
    )

    console.log('\n📋 === 系统监控模块 ===')
    const systemResults = []

    systemResults.push(await verifyApi('系统仪表板', '/api/v4/console/system/dashboard', token))

    systemResults.push(await verifyApi('健康检查', '/health', token))

    console.log('\n📋 === 权限管理模块 ===')
    const permissionResults = []

    permissionResults.push(await verifyApi('获取当前用户权限', '/api/v4/permissions/me', token))

    permissionResults.push(await verifyApi('获取管理员列表', '/api/v4/permissions/admins', token))

    console.log('\n📋 === 奖品池模块 ===')
    const prizeResults = []

    // 先获取一个活动ID
    prizeResults.push(await verifyApi('获取可用活动列表', '/api/v4/activities/available', token))

    console.log('\n📋 === 抽奖管理模块 ===')
    const lotteryResults = []

    lotteryResults.push(await verifyApi('获取抽奖策略', '/api/v4/lottery/strategies', token))

    console.log('\n📋 === 分析统计模块 ===')
    const analyticsResults = []

    analyticsResults.push(
      await verifyApi('分析统计', '/api/v4/console/analytics/decisions/analytics', token)
    )

    // 3. 汇总结果
    const allResults = [
      ...userResults,
      ...systemResults,
      ...permissionResults,
      ...prizeResults,
      ...lotteryResults,
      ...analyticsResults
    ]

    const successCount = allResults.filter(r => r.success).length
    const failCount = allResults.filter(r => !r.success).length

    console.log('\n╔════════════════════════════════════════════════════════════╗')
    console.log('║                      📊 验证结果汇总                        ║')
    console.log('╚════════════════════════════════════════════════════════════╝')
    console.log(`✅ 成功: ${successCount}个API`)
    console.log(`❌ 失败: ${failCount}个API`)
    console.log(`📈 成功率: ${((successCount / allResults.length) * 100).toFixed(1)}%`)

    if (failCount > 0) {
      console.log('\n⚠️ 失败的API:')
      allResults
        .filter(r => !r.success)
        .forEach(r => console.log(`   - ${r.name}: ${r.message || r.error}`))
    }

    // 4. 前端对接指南
    console.log('\n╔════════════════════════════════════════════════════════════╗')
    console.log('║                 📝 前端对接关键信息                         ║')
    console.log('╚════════════════════════════════════════════════════════════╝')
    console.log('\n🔗 API基础路径: /api/v4')
    console.log('\n📱 用户管理API路径:')
    console.log('   GET  /api/v4/console/user-management/users      - 用户列表')
    console.log('   GET  /api/v4/console/user-management/users/:id  - 用户详情')
    console.log('   PUT  /api/v4/console/user-management/users/:id/role   - 更新角色')
    console.log('   PUT  /api/v4/console/user-management/users/:id/status - 更新状态')
    console.log('   GET  /api/v4/console/user-management/roles      - 角色列表')
    console.log('\n📊 系统监控API路径:')
    console.log('   GET  /api/v4/console/system/dashboard  - 仪表板数据')
    console.log('   GET  /health                           - 健康检查')
    console.log('\n🔐 认证方式: Bearer Token (Authorization: Bearer <token>)')
    console.log('   登录接口: POST /api/v4/auth/quick-login')
    console.log('   请求体: { "mobile": "手机号", "code": "验证码" }')

    console.log('\n✅ API验证完成!')
  } catch (error) {
    console.error('\n❌ 验证过程出错:', error.message)
    process.exit(1)
  }
}

// 执行主函数
main()
