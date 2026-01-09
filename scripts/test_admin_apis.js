#!/usr/bin/env node
/**
 * 管理后台API测试脚本
 *
 * @description 测试系统设置、仪表板、用户管理等核心业务API
 * @date 2026-01-09
 *
 * 使用方法:
 *   node scripts/test-admin-apis.js
 *
 * 前提条件:
 *   - 后端服务正在运行 (默认 http://localhost:3000)
 *   - 数据库已初始化
 */

const http = require('http')
const https = require('https')

// 配置
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '' // 如果没有token，则尝试登录获取

/**
 * 发送HTTP请求
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const protocol = parsedUrl.protocol === 'https:' ? https : http

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }

    const req = protocol.request(reqOptions, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
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

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
    }

    req.end()
  })
}

/**
 * 格式化输出
 */
function log(type, message, data = null) {
  const icons = {
    info: '📋',
    success: '✅',
    error: '❌',
    warn: '⚠️',
    test: '🧪'
  }
  console.log(`${icons[type] || '•'} ${message}`)
  if (data) {
    console.log('   ', JSON.stringify(data, null, 2).split('\n').join('\n    '))
  }
}

/**
 * 测试健康检查
 */
async function testHealthCheck() {
  log('test', '测试健康检查 GET /health')
  try {
    const res = await request(`${BASE_URL}/health`)
    // 兼容两种响应格式: { status: 'healthy' } 或 { success: true, data: { status: 'healthy' } }
    const status = res.data.data?.status || res.data.status
    if (res.status === 200 && (status === 'healthy' || res.data.success)) {
      log('success', `健康检查通过`, { status, timestamp: res.data.timestamp })
      return true
    } else {
      log('error', `健康检查失败`, res.data)
      return false
    }
  } catch (error) {
    log('error', `健康检查请求失败: ${error.message}`)
    return false
  }
}

/**
 * 登录获取Token
 */
async function loginAdmin() {
  log('test', '尝试管理员登录...')

  // 尝试使用测试账号登录
  const testCredentials = [
    { mobile: '13800138000', password: 'admin123' },
    { mobile: '13900000001', password: 'test123456' },
    { mobile: '13800000000', password: 'password123' }
  ]

  for (const cred of testCredentials) {
    try {
      const res = await request(`${BASE_URL}/api/v4/console/auth/login`, {
        method: 'POST',
        body: cred
      })

      if (res.status === 200 && res.data.success && res.data.data?.token) {
        log('success', `登录成功: ${cred.mobile}`)
        return res.data.data.token
      }
    } catch (error) {
      // 继续尝试下一个
    }
  }

  log('warn', '无法自动登录，需要手动提供ADMIN_TOKEN环境变量')
  return null
}

/**
 * 测试系统设置API
 */
async function testSettingsAPI(token) {
  log('test', '测试系统设置API')
  const headers = { Authorization: `Bearer ${token}` }

  const categories = ['basic', 'points', 'notification', 'security']
  const results = {}

  for (const category of categories) {
    try {
      const res = await request(`${BASE_URL}/api/v4/console/settings/${category}`, { headers })

      if (res.status === 200 && res.data.success) {
        const count = res.data.data?.count || 0
        const settings = res.data.data?.settings || []
        results[category] = { success: true, count, settings: settings.map(s => s.setting_key) }
        log(
          'success',
          `${category}设置: ${count}项配置`,
          settings.slice(0, 3).map(s => `${s.setting_key}=${s.parsed_value}`)
        )
      } else {
        results[category] = { success: false, error: res.data.message }
        log('error', `${category}设置获取失败`, res.data)
      }
    } catch (error) {
      results[category] = { success: false, error: error.message }
      log('error', `${category}设置请求失败: ${error.message}`)
    }
  }

  return results
}

/**
 * 测试仪表板API
 */
async function testDashboardAPI(token) {
  log('test', '测试仪表板API GET /api/v4/console/system/dashboard')
  const headers = { Authorization: `Bearer ${token}` }

  try {
    const res = await request(`${BASE_URL}/api/v4/console/system/dashboard`, { headers })

    if (res.status === 200 && res.data.success) {
      const data = res.data.data
      log('success', '仪表板数据获取成功', {
        total_users: data.overview?.total_users,
        active_users: data.overview?.active_users,
        today_new_users: data.today?.new_users,
        today_draws: data.today?.lottery_draws,
        today_high_tier_wins: data.today?.high_tier_wins
      })
      return { success: true, data }
    } else {
      log('error', '仪表板数据获取失败', res.data)
      return { success: false, error: res.data.message }
    }
  } catch (error) {
    log('error', `仪表板请求失败: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * 测试用户管理API
 */
async function testUserManagementAPI(token) {
  log('test', '测试用户管理API GET /api/v4/console/user-management/users')
  const headers = { Authorization: `Bearer ${token}` }

  try {
    const res = await request(`${BASE_URL}/api/v4/console/user-management/users?page=1&limit=10`, {
      headers
    })

    if (res.status === 200 && res.data.success) {
      const users = res.data.data?.users || res.data.data?.list || []
      const total = res.data.data?.pagination?.total || res.data.data?.total || users.length
      log(
        'success',
        `用户列表获取成功: ${users.length}/${total}用户`,
        users.slice(0, 3).map(u => ({ id: u.user_id, nickname: u.nickname, status: u.status }))
      )
      return { success: true, count: users.length, total }
    } else {
      log('error', '用户列表获取失败', res.data)
      return { success: false, error: res.data.message }
    }
  } catch (error) {
    log('error', `用户管理请求失败: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * 测试角色管理API
 */
async function testRolesAPI(token) {
  log('test', '测试角色管理API GET /api/v4/console/user-management/roles')
  const headers = { Authorization: `Bearer ${token}` }

  try {
    const res = await request(`${BASE_URL}/api/v4/console/user-management/roles`, { headers })

    if (res.status === 200 && res.data.success) {
      const roles = res.data.data?.roles || res.data.data?.list || []
      log(
        'success',
        `角色列表获取成功: ${roles.length}个角色`,
        roles.map(r => ({ name: r.role_name, level: r.role_level }))
      )
      return { success: true, count: roles.length, roles }
    } else {
      log('error', '角色列表获取失败', res.data)
      return { success: false, error: res.data.message }
    }
  } catch (error) {
    log('error', `角色管理请求失败: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * 测试奖品池API
 */
async function testPrizePoolAPI(token) {
  log('test', '测试奖品池API GET /api/v4/console/prize-pool/BASIC_LOTTERY')
  const headers = { Authorization: `Bearer ${token}` }

  try {
    const res = await request(`${BASE_URL}/api/v4/console/prize-pool/BASIC_LOTTERY`, { headers })

    if (res.status === 200 && res.data.success) {
      const prizes = res.data.data?.prizes || []
      log(
        'success',
        `奖品列表获取成功: ${prizes.length}个奖品`,
        prizes
          .slice(0, 5)
          .map(p => ({ id: p.prize_id, name: p.prize_name, prob: p.win_probability }))
      )
      return { success: true, count: prizes.length }
    } else {
      log('error', '奖品列表获取失败', res.data)
      return { success: false, error: res.data.message }
    }
  } catch (error) {
    log('error', `奖品池请求失败: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * 测试缓存清除API
 */
async function testCacheClearAPI(token) {
  log('test', '测试缓存清除API POST /api/v4/console/cache/clear')
  const headers = { Authorization: `Bearer ${token}` }

  try {
    const res = await request(`${BASE_URL}/api/v4/console/cache/clear`, {
      method: 'POST',
      headers,
      body: { pattern: 'test_*', confirm: true }
    })

    if (res.status === 200 && res.data.success) {
      log('success', `缓存清除成功`, {
        pattern: res.data.data?.pattern,
        cleared: res.data.data?.cleared_count
      })
      return { success: true, cleared: res.data.data?.cleared_count }
    } else {
      log('error', '缓存清除失败', res.data)
      return { success: false, error: res.data.message }
    }
  } catch (error) {
    log('error', `缓存清除请求失败: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * 检查数据库初始数据
 */
async function checkDatabaseData() {
  log('info', '\n========== 数据库数据检查 ==========\n')

  try {
    // 动态加载模型
    const models = require('../models')
    const { SystemSettings, User, Role, Prize } = models

    // 检查系统设置
    const settingsCount = await SystemSettings.count()
    log(settingsCount > 0 ? 'success' : 'warn', `系统设置: ${settingsCount}条记录`)

    if (settingsCount === 0) {
      log('info', '系统设置表为空，需要初始化默认数据')
    } else {
      const sampleSettings = await SystemSettings.findAll({ limit: 5 })
      sampleSettings.forEach(s => {
        log('info', `  - ${s.category}/${s.setting_key} = ${s.setting_value}`)
      })
    }

    // 检查用户
    const userCount = await User.count()
    log(userCount > 0 ? 'success' : 'warn', `用户: ${userCount}条记录`)

    // 检查角色
    if (Role) {
      const roleCount = await Role.count()
      log(roleCount > 0 ? 'success' : 'warn', `角色: ${roleCount}条记录`)
    }

    // 检查奖品
    if (Prize) {
      const prizeCount = await Prize.count()
      log(prizeCount > 0 ? 'success' : 'warn', `奖品: ${prizeCount}条记录`)
    }

    return { settingsCount, userCount }
  } catch (error) {
    log('error', `数据库检查失败: ${error.message}`)
    return null
  }
}

/**
 * 初始化系统设置默认数据
 */
async function initializeDefaultSettings() {
  log('info', '\n========== 初始化默认系统设置 ==========\n')

  try {
    const models = require('../models')
    const { SystemSettings } = models

    // 默认设置数据
    const defaultSettings = [
      // 基础设置
      {
        category: 'basic',
        setting_key: 'system_name',
        setting_value: '餐厅抽奖系统',
        value_type: 'string',
        description: '系统名称'
      },
      {
        category: 'basic',
        setting_key: 'system_version',
        setting_value: 'v4.0.0',
        value_type: 'string',
        description: '系统版本'
      },
      {
        category: 'basic',
        setting_key: 'customer_phone',
        setting_value: '400-999-8888',
        value_type: 'string',
        description: '客服电话'
      },
      {
        category: 'basic',
        setting_key: 'customer_email',
        setting_value: 'support@example.com',
        value_type: 'string',
        description: '客服邮箱'
      },

      // 积分设置
      {
        category: 'points',
        setting_key: 'sign_in_points',
        setting_value: '10',
        value_type: 'number',
        description: '每日签到积分'
      },
      {
        category: 'points',
        setting_key: 'initial_points',
        setting_value: '100',
        value_type: 'number',
        description: '新用户初始积分'
      },
      {
        category: 'points',
        setting_key: 'points_expire_days',
        setting_value: '365',
        value_type: 'number',
        description: '积分有效期（天）'
      },
      {
        category: 'points',
        setting_key: 'budget_allocation_ratio',
        setting_value: '0.3',
        value_type: 'number',
        description: '预算分配系数'
      },

      // 通知设置
      {
        category: 'notification',
        setting_key: 'sms_enabled',
        setting_value: 'false',
        value_type: 'boolean',
        description: '短信通知开关'
      },
      {
        category: 'notification',
        setting_key: 'email_enabled',
        setting_value: 'false',
        value_type: 'boolean',
        description: '邮件通知开关'
      },
      {
        category: 'notification',
        setting_key: 'app_notification_enabled',
        setting_value: 'true',
        value_type: 'boolean',
        description: '应用内通知开关'
      },

      // 安全设置
      {
        category: 'security',
        setting_key: 'max_login_attempts',
        setting_value: '5',
        value_type: 'number',
        description: '最大登录尝试次数'
      },
      {
        category: 'security',
        setting_key: 'lockout_duration',
        setting_value: '30',
        value_type: 'number',
        description: '锁定时长（分钟）'
      },
      {
        category: 'security',
        setting_key: 'password_min_length',
        setting_value: '6',
        value_type: 'number',
        description: '密码最小长度'
      },
      {
        category: 'security',
        setting_key: 'api_rate_limit',
        setting_value: '100',
        value_type: 'number',
        description: 'API速率限制（次/分钟）'
      }
    ]

    let created = 0
    let skipped = 0

    for (const setting of defaultSettings) {
      const [record, wasCreated] = await SystemSettings.findOrCreate({
        where: { setting_key: setting.setting_key },
        defaults: {
          ...setting,
          is_visible: true,
          is_readonly: false
        }
      })

      if (wasCreated) {
        created++
        log(
          'success',
          `创建设置: ${setting.category}/${setting.setting_key} = ${setting.setting_value}`
        )
      } else {
        skipped++
      }
    }

    log('info', `\n初始化完成: 创建${created}条, 跳过${skipped}条（已存在）`)
    return { created, skipped }
  } catch (error) {
    log('error', `初始化设置失败: ${error.message}`)
    return null
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗')
  console.log('║           管理后台API测试脚本 v1.0                    ║')
  console.log('║           测试日期: ' + new Date().toLocaleString('zh-CN') + '            ║')
  console.log('╚═══════════════════════════════════════════════════════╝\n')

  // 1. 健康检查
  log('info', '========== 步骤1: 健康检查 ==========\n')
  const healthOk = await testHealthCheck()

  if (!healthOk) {
    log('error', '\n后端服务未运行，请先启动服务: npm run dev\n')
    process.exit(1)
  }

  // 2. 检查数据库数据
  log('info', '\n========== 步骤2: 数据库检查 ==========\n')
  const dbCheck = await checkDatabaseData()

  // 3. 如果系统设置为空，初始化默认数据
  if (dbCheck && dbCheck.settingsCount === 0) {
    log('info', '\n========== 步骤3: 初始化默认数据 ==========\n')
    await initializeDefaultSettings()
  }

  // 4. 获取Token
  log('info', '\n========== 步骤4: 获取管理员Token ==========\n')
  let token = ADMIN_TOKEN

  if (!token) {
    token = await loginAdmin()
  }

  if (!token) {
    log('warn', '\n无法获取管理员Token，跳过需要认证的API测试')
    log('info', '请设置ADMIN_TOKEN环境变量后重试:')
    log('info', '  ADMIN_TOKEN=your_token node scripts/test-admin-apis.js\n')

    // 仍然输出数据库检查结果
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║                    测试结果摘要                        ║')
    console.log('╚═══════════════════════════════════════════════════════╝')
    console.log('\n数据库状态:')
    if (dbCheck) {
      console.log(`  - 系统设置: ${dbCheck.settingsCount}条`)
      console.log(`  - 用户数量: ${dbCheck.userCount}条`)
    }
    console.log('\nAPI测试: 需要ADMIN_TOKEN\n')

    process.exit(0)
  }

  log('success', `Token获取成功: ${token.substring(0, 20)}...`)

  // 5. API测试
  log('info', '\n========== 步骤5: API功能测试 ==========\n')

  const results = {
    settings: await testSettingsAPI(token),
    dashboard: await testDashboardAPI(token),
    users: await testUserManagementAPI(token),
    roles: await testRolesAPI(token),
    prizes: await testPrizePoolAPI(token),
    cache: await testCacheClearAPI(token)
  }

  // 6. 测试结果摘要
  console.log('\n╔═══════════════════════════════════════════════════════╗')
  console.log('║                    测试结果摘要                        ║')
  console.log('╚═══════════════════════════════════════════════════════╝')

  console.log('\n📊 数据库状态:')
  if (dbCheck) {
    console.log(`  - 系统设置: ${dbCheck.settingsCount}条`)
    console.log(`  - 用户数量: ${dbCheck.userCount}条`)
  }

  console.log('\n📡 API测试结果:')

  const apiTests = [
    { name: '系统设置(basic)', result: results.settings.basic },
    { name: '系统设置(points)', result: results.settings.points },
    { name: '系统设置(notification)', result: results.settings.notification },
    { name: '系统设置(security)', result: results.settings.security },
    { name: '仪表板数据', result: results.dashboard },
    { name: '用户管理', result: results.users },
    { name: '角色管理', result: results.roles },
    { name: '奖品池', result: results.prizes },
    { name: '缓存清除', result: results.cache }
  ]

  let passed = 0
  let failed = 0

  apiTests.forEach(test => {
    const status = test.result?.success ? '✅' : '❌'
    console.log(`  ${status} ${test.name}`)
    if (test.result?.success) {
      passed++
    } else {
      failed++
    }
  })

  console.log(`\n📈 总计: ${passed}通过, ${failed}失败\n`)

  if (failed === 0) {
    log('success', '所有API测试通过！前后端数据联动正常。\n')
  } else {
    log('warn', '部分API测试失败，请检查后端实现和数据库。\n')
  }

  process.exit(failed > 0 ? 1 : 0)
}

// 运行
main().catch(error => {
  log('error', `测试脚本执行失败: ${error.message}`)
  console.error(error)
  process.exit(1)
})
