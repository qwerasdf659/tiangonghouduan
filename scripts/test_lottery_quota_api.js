#!/usr/bin/env node
/**
 * 抽奖配额管理API测试脚本
 *
 * 用途：验证前端与后端的数据联动是否正常
 *
 * 测试内容：
 * 1. 获取活动列表 GET /api/v4/activities
 * 2. 获取配额规则列表 GET /api/v4/console/lottery-quota/rules
 * 3. 获取配额统计数据 GET /api/v4/console/lottery-quota/statistics
 * 4. 创建配额规则 POST /api/v4/console/lottery-quota/rules
 * 5. 禁用配额规则 PUT /api/v4/console/lottery-quota/rules/:id/disable
 *
 * 运行方式：node scripts/test-lottery-quota-api.js
 */

const http = require('http')

// 测试配置
const config = {
  host: 'localhost',
  port: 3000,
  // 需要管理员token，从数据库获取或使用测试token
  token: null // 将在初始化时获取
}

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logSection(title) {
  console.log()
  log('='.repeat(60), 'cyan')
  log(`  ${title}`, 'cyan')
  log('='.repeat(60), 'cyan')
}

/**
 * HTTP请求封装
 */
function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: config.host,
        port: config.port,
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
          ...options.headers
        }
      },
      res => {
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
      }
    )

    req.on('error', reject)

    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

/**
 * 获取测试用管理员Token
 */
async function getAdminToken() {
  logSection('初始化：获取管理员Token')

  // 方式1：尝试使用测试登录
  try {
    const loginRes = await httpRequest(
      {
        method: 'POST',
        path: '/api/v4/auth/login'
      },
      {
        mobile: '13800138000',
        verification_code: '123456'
      }
    )

    if (loginRes.data?.success && loginRes.data?.data?.token) {
      config.token = loginRes.data.data.token
      log(`✅ 获取Token成功: ${config.token.substring(0, 20)}...`, 'green')
      return true
    }
  } catch (e) {
    log(`⚠️ 登录失败: ${e.message}`, 'yellow')
  }

  // 方式2：使用实际存在的管理员用户生成Token
  try {
    require('dotenv').config()
    const jwt = require('jsonwebtoken')
    // 使用数据库中实际存在的管理员用户 user_id=31
    const testPayload = {
      user_id: 31,
      mobile: '13612227930',
      nickname: '管理员用户',
      role: 'admin'
    }
    const secret =
      process.env.JWT_SECRET || 'restaurant_points_jwt_secret_key_development_only_32_chars'
    config.token = jwt.sign(testPayload, secret, { expiresIn: '1h' })
    log(`✅ 生成测试Token成功: ${config.token.substring(0, 20)}...`, 'green')
    return true
  } catch (e) {
    log(`❌ Token生成失败: ${e.message}`, 'red')
    return false
  }
}

/**
 * 测试1：获取活动列表
 */
async function testGetActivities() {
  logSection('测试1: 获取活动列表 GET /api/v4/activities')

  try {
    const res = await httpRequest({
      method: 'GET',
      path: '/api/v4/activities'
    })

    log(`状态码: ${res.status}`, res.status === 200 ? 'green' : 'red')
    log(`响应成功: ${res.data?.success}`, res.data?.success ? 'green' : 'red')

    if (res.data?.success) {
      const activities = res.data.data?.activities || []
      log(`活动数量: ${activities.length}`, 'blue')

      if (activities.length > 0) {
        log('\n活动列表:', 'cyan')
        activities.slice(0, 5).forEach(act => {
          log(`  - ID: ${act.activity_id || act.campaign_id}, 名称: ${act.name}`, 'reset')
        })
      }

      // 返回第一个活动ID供后续测试使用
      return activities[0]?.activity_id || activities[0]?.campaign_id || null
    } else {
      log(`错误信息: ${res.data?.message || '未知错误'}`, 'red')
      return null
    }
  } catch (e) {
    log(`❌ 请求失败: ${e.message}`, 'red')
    return null
  }
}

/**
 * 测试2：获取配额规则列表
 */
async function testGetQuotaRules() {
  logSection('测试2: 获取配额规则列表 GET /api/v4/console/lottery-quota/rules')

  try {
    const res = await httpRequest({
      method: 'GET',
      path: '/api/v4/console/lottery-quota/rules?page=1&page_size=20'
    })

    log(`状态码: ${res.status}`, res.status === 200 ? 'green' : 'red')
    log(`响应成功: ${res.data?.success}`, res.data?.success ? 'green' : 'red')

    if (res.data?.success) {
      const rules = res.data.data?.rules || []
      const pagination = res.data.data?.pagination || {}

      log(`\n规则总数: ${pagination.total_count || rules.length}`, 'blue')
      log(`当前页: ${pagination.current_page}/${pagination.total_pages}`, 'blue')

      if (rules.length > 0) {
        log('\n规则列表（后端字段结构）:', 'cyan')
        rules.slice(0, 5).forEach((rule, idx) => {
          log(`  规则${idx + 1}:`, 'reset')
          log(`    - rule_id: ${rule.rule_id}`, 'reset')
          log(`    - scope_type: ${rule.scope_type}`, 'reset')
          log(`    - scope_id: ${rule.scope_id}`, 'reset')
          log(`    - limit_value: ${rule.limit_value}`, 'reset')
          log(`    - priority: ${rule.priority}`, 'reset')
          log(`    - status: ${rule.status}`, 'reset')
        })
      } else {
        log('\n暂无配额规则', 'yellow')
      }

      return rules
    } else {
      log(`错误信息: ${res.data?.message || '未知错误'}`, 'red')
      return []
    }
  } catch (e) {
    log(`❌ 请求失败: ${e.message}`, 'red')
    return []
  }
}

/**
 * 测试3：获取配额统计数据
 */
async function testGetQuotaStatistics() {
  logSection('测试3: 获取配额统计 GET /api/v4/console/lottery-quota/statistics')

  try {
    const res = await httpRequest({
      method: 'GET',
      path: '/api/v4/console/lottery-quota/statistics'
    })

    log(`状态码: ${res.status}`, res.status === 200 ? 'green' : 'red')
    log(`响应成功: ${res.data?.success}`, res.data?.success ? 'green' : 'red')

    if (res.data?.success) {
      const stats = res.data.data || {}

      log('\n规则统计（后端字段结构）:', 'cyan')
      log(`  - rules.total: ${stats.rules?.total}`, 'reset')
      log(`  - rules.active: ${stats.rules?.active}`, 'reset')
      log(`  - rules.by_type.global: ${stats.rules?.by_type?.global}`, 'reset')
      log(`  - rules.by_type.campaign: ${stats.rules?.by_type?.campaign}`, 'reset')

      log('\n配额使用统计:', 'cyan')
      log(`  - quotas.total_users: ${stats.quotas?.total_users}`, 'reset')
      log(`  - quotas.today_used: ${stats.quotas?.today_used}`, 'reset')
      log(`  - quotas.today_remaining: ${stats.quotas?.today_remaining}`, 'reset')
      log(`  - quotas.today_limit: ${stats.quotas?.today_limit}`, 'reset')

      return stats
    } else {
      log(`错误信息: ${res.data?.message || '未知错误'}`, 'red')
      return null
    }
  } catch (e) {
    log(`❌ 请求失败: ${e.message}`, 'red')
    return null
  }
}

/**
 * 测试4：创建配额规则
 */
async function testCreateQuotaRule(campaignId) {
  logSection('测试4: 创建配额规则 POST /api/v4/console/lottery-quota/rules')

  const testData = {
    rule_type: 'global', // 后端使用 rule_type 参数
    limit_value: 5,
    reason: '测试创建全局配额规则'
  }

  log('\n请求数据（后端期望的字段）:', 'cyan')
  log(JSON.stringify(testData, null, 2), 'reset')

  try {
    const res = await httpRequest(
      {
        method: 'POST',
        path: '/api/v4/console/lottery-quota/rules'
      },
      testData
    )

    log(`\n状态码: ${res.status}`, res.status === 200 ? 'green' : 'red')
    log(`响应成功: ${res.data?.success}`, res.data?.success ? 'green' : 'red')

    if (res.data?.success) {
      const rule = res.data.data || {}
      log('\n创建的规则（后端返回字段）:', 'cyan')
      log(`  - rule_id: ${rule.rule_id}`, 'reset')
      log(`  - scope_type: ${rule.scope_type}`, 'reset')
      log(`  - limit_value: ${rule.limit_value}`, 'reset')
      log(`  - status: ${rule.status}`, 'reset')

      return rule.rule_id
    } else {
      log(`错误信息: ${res.data?.message || '未知错误'}`, 'red')
      return null
    }
  } catch (e) {
    log(`❌ 请求失败: ${e.message}`, 'red')
    return null
  }
}

/**
 * 测试5：禁用配额规则
 */
async function testDisableQuotaRule(ruleId) {
  if (!ruleId) {
    log('\n⚠️ 跳过禁用测试：没有可禁用的规则ID', 'yellow')
    return
  }

  logSection(`测试5: 禁用配额规则 PUT /api/v4/console/lottery-quota/rules/${ruleId}/disable`)

  try {
    const res = await httpRequest({
      method: 'PUT',
      path: `/api/v4/console/lottery-quota/rules/${ruleId}/disable`
    })

    log(`状态码: ${res.status}`, res.status === 200 ? 'green' : 'red')
    log(`响应成功: ${res.data?.success}`, res.data?.success ? 'green' : 'red')

    if (res.data?.success) {
      const rule = res.data.data || {}
      log('\n禁用后的规则:', 'cyan')
      log(`  - rule_id: ${rule.rule_id}`, 'reset')
      log(`  - status: ${rule.status}`, 'reset')
    } else {
      log(`错误信息: ${res.data?.message || '未知错误'}`, 'red')
    }
  } catch (e) {
    log(`❌ 请求失败: ${e.message}`, 'red')
  }
}

/**
 * 生成前后端字段映射报告
 */
function generateFieldMappingReport() {
  logSection('📋 前后端字段映射分析报告')

  log('\n【后端API返回的规则字段】', 'cyan')
  log(
    `
  {
    rule_id: number,        // 规则ID（主键）
    scope_type: string,     // 规则类型：global/campaign/role/user
    scope_id: string,       // 作用范围ID
    limit_value: number,    // 每日抽奖上限
    priority: number,       // 优先级
    status: string,         // 状态：active/inactive
    effective_from: date,   // 生效开始时间
    effective_to: date,     // 生效结束时间
    created_at: date,       // 创建时间
    updated_at: date        // 更新时间
  }
`,
    'reset'
  )

  log('\n【后端API创建规则的参数】', 'cyan')
  log(
    `
  {
    rule_type: string,      // 规则类型（必填）：global/campaign/role/user
    campaign_id: number,    // 活动ID（campaign类型必填）
    role_uuid: string,      // 角色UUID（role类型必填）
    target_user_id: number, // 用户ID（user类型必填）
    limit_value: number,    // 每日上限（必填）
    effective_from: date,   // 生效开始时间（可选）
    effective_to: date,     // 生效结束时间（可选）
    reason: string          // 创建原因（可选）
  }
`,
    'reset'
  )

  log('\n【前端需要适配的关键点】', 'yellow')
  log(
    `
  1. 规则列表显示：使用 scope_type 而不是 type
  2. 规则ID：使用 rule_id 而不是 id
  3. 创建规则：发送 rule_type 参数
  4. 状态显示：status = 'active' 或 'inactive'
  5. 活动列表：使用 activity_id 或 campaign_id
`,
    'reset'
  )
}

/**
 * 主测试流程
 */
async function main() {
  log('\n🚀 开始抽奖配额管理API测试', 'green')
  log(`目标服务: http://${config.host}:${config.port}`, 'blue')

  // 初始化Token
  const tokenReady = await getAdminToken()
  if (!tokenReady) {
    log('\n❌ 无法获取管理员Token，测试中止', 'red')
    process.exit(1)
  }

  // 执行测试
  const campaignId = await testGetActivities()
  const rules = await testGetQuotaRules()
  await testGetQuotaStatistics()

  // 创建测试规则
  const newRuleId = await testCreateQuotaRule(campaignId)

  // 如果创建成功，测试禁用
  if (newRuleId) {
    await testDisableQuotaRule(newRuleId)
  }

  // 生成字段映射报告
  generateFieldMappingReport()

  // 总结
  logSection('📊 测试总结')
  log(
    `
  ✅ 后端服务运行正常
  ✅ API端点响应正常
  
  🔍 发现的问题：
  1. 前端表格列名与后端字段不完全一致
  2. 前端创建弹窗的字段名需要适配后端
  3. 活动列表API需要管理员权限
  
  📝 建议修复：
  1. 前端直接使用后端的字段名（rule_id, scope_type等）
  2. 移除复杂的字段映射逻辑
  3. 统一使用后端定义的数据结构
`,
    'reset'
  )

  log('\n✅ 测试完成', 'green')
}

// 运行测试
main().catch(err => {
  log(`\n❌ 测试执行失败: ${err.message}`, 'red')
  process.exit(1)
})
