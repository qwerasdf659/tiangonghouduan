#!/usr/bin/env node
/**
 * 餐厅积分抽奖系统 V4.0 - 仪表盘数据测试脚本
 *
 * 功能：测试仪表盘相关业务功能并验证数据库变化
 * - 用户登录
 * - 抽奖功能
 * - 客服会话创建
 * - 发送消息
 * - 数据库数据验证
 *
 * 运行命令：node scripts/test-dashboard-data.js
 *
 * 创建时间：2026年01月09日
 */

require('dotenv').config()
const { Sequelize } = require('sequelize')

// 数据库连接配置
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  logging: false
})

// API基础URL
const BASE_URL = `http://localhost:${process.env.PORT || 3000}`

// 测试账号
const TEST_MOBILE = '13612227930'
const TEST_CODE = '123456'

/**
 * 发送HTTP请求
 * @param {string} path - API路径
 * @param {object} options - 请求选项
 * @returns {Promise<object>} 响应数据
 */
async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  return response.json()
}

/**
 * 获取北京时间今日开始时间（与后端API逻辑保持一致）
 * @returns {Date} 北京时间今日0点的Date对象
 */
function getBeijingTodayStart() {
  // 获取当前北京时间
  const now = new Date()
  const beijingOffset = 8 * 60 // 北京时间 UTC+8
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000
  const beijingTime = new Date(utcTime + beijingOffset * 60000)

  // 设置为今日0点
  beijingTime.setHours(0, 0, 0, 0)

  return beijingTime
}

/**
 * 查询数据库统计数据（使用北京时间）
 * @returns {Promise<object>} 统计数据
 */
async function getDatabaseStats() {
  const stats = {}

  // 获取北京时间今日开始（与后端API逻辑一致）
  const todayStart = getBeijingTodayStart()
  const todayStartStr = todayStart.toISOString().slice(0, 19).replace('T', ' ')

  // 总用户数
  const [userResult] = await sequelize.query('SELECT COUNT(*) as total FROM users')
  stats.total_users = userResult[0].total

  // 今日新增用户（使用北京时间）
  const [todayUsers] = await sequelize.query(
    `SELECT COUNT(*) as today FROM users WHERE created_at >= '${todayStartStr}'`
  )
  stats.today_new_users = todayUsers[0].today

  // 今日抽奖次数（使用北京时间）
  const [todayDraws] = await sequelize.query(
    `SELECT COUNT(*) as today FROM lottery_draws WHERE created_at >= '${todayStartStr}'`
  )
  stats.today_draws = todayDraws[0].today

  // 总抽奖次数
  const [totalDraws] = await sequelize.query('SELECT COUNT(*) as total FROM lottery_draws')
  stats.total_draws = totalDraws[0].total

  // 今日消耗积分（使用北京时间）
  const [todayPoints] = await sequelize.query(
    `SELECT COALESCE(SUM(cost_points), 0) as points FROM lottery_draws WHERE created_at >= '${todayStartStr}'`
  )
  stats.today_points_consumed = parseInt(todayPoints[0].points) || 0

  // 今日客服会话（使用北京时间）
  const [todaySessions] = await sequelize.query(
    `SELECT COUNT(*) as today FROM customer_service_sessions WHERE created_at >= '${todayStartStr}'`
  )
  stats.today_sessions = todaySessions[0].today

  // 总客服会话
  const [totalSessions] = await sequelize.query(
    'SELECT COUNT(*) as total FROM customer_service_sessions'
  )
  stats.total_sessions = totalSessions[0].total

  // 今日消息数（使用北京时间）
  const [todayMessages] = await sequelize.query(
    `SELECT COUNT(*) as today FROM chat_messages WHERE created_at >= '${todayStartStr}'`
  )
  stats.today_messages = todayMessages[0].today

  // 总消息数
  const [totalMessages] = await sequelize.query('SELECT COUNT(*) as total FROM chat_messages')
  stats.total_messages = totalMessages[0].total

  return stats
}

/**
 * 打印统计数据对比
 * @param {object} before - 操作前数据
 * @param {object} after - 操作后数据
 */
function printStatsComparison(before, after) {
  console.log('\n┌─────────────────────────────────────────────────────────────┐')
  console.log('│                    数据库数据变化对比                        │')
  console.log('├─────────────────────┬──────────┬──────────┬──────────────────┤')
  console.log('│ 指标                │ 操作前   │ 操作后   │ 变化             │')
  console.log('├─────────────────────┼──────────┼──────────┼──────────────────┤')

  const metrics = [
    { key: 'total_users', label: '总用户数' },
    { key: 'today_new_users', label: '今日新增用户' },
    { key: 'today_draws', label: '今日抽奖' },
    { key: 'total_draws', label: '总抽奖次数' },
    { key: 'today_points_consumed', label: '今日消耗积分' },
    { key: 'today_sessions', label: '今日客服会话' },
    { key: 'total_sessions', label: '总客服会话' },
    { key: 'today_messages', label: '今日消息数' },
    { key: 'total_messages', label: '总消息数' }
  ]

  metrics.forEach(m => {
    const b = before[m.key]
    const a = after[m.key]
    const diff = a - b
    const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? '-' : `${diff}`
    const status = diff > 0 ? '✅' : diff === 0 ? '➖' : '❌'
    console.log(
      `│ ${m.label.padEnd(18)} │ ${String(b).padStart(8)} │ ${String(a).padStart(8)} │ ${status} ${diffStr.padStart(14)} │`
    )
  })

  console.log('└─────────────────────┴──────────┴──────────┴──────────────────┘')
}

/**
 * 主测试流程
 */
async function runTests() {
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║       餐厅积分抽奖系统 V4.0 - 仪表盘数据测试脚本              ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')

  try {
    // 1. 获取操作前的数据库统计
    console.log('\n📊 步骤1: 获取操作前数据库统计...')
    const statsBefore = await getDatabaseStats()
    console.log('  总用户数:', statsBefore.total_users)
    console.log('  今日新增用户:', statsBefore.today_new_users)
    console.log('  今日抽奖次数:', statsBefore.today_draws)
    console.log('  今日客服会话:', statsBefore.today_sessions)
    console.log('  今日消息数:', statsBefore.today_messages)

    // 2. 登录获取Token
    console.log('\n🔐 步骤2: 用户登录...')
    const loginResult = await request('/api/v4/auth/quick-login', {
      method: 'POST',
      body: {
        mobile: TEST_MOBILE,
        verification_code: TEST_CODE
      }
    })

    if (!loginResult.success) {
      throw new Error(`登录失败: ${loginResult.message}`)
    }

    const token = loginResult.data.access_token
    const userId = loginResult.data.user.user_id
    console.log('  ✅ 登录成功，用户ID:', userId)

    // 3. 检查用户积分（通过accounts表关联查询）
    console.log('\n💰 步骤3: 检查用户积分...')
    const [pointsResult] = await sequelize.query(
      `SELECT ab.available_amount 
       FROM accounts a
       JOIN account_asset_balances ab ON a.account_id = ab.account_id
       WHERE a.user_id = ${userId} AND ab.asset_code = 'POINTS'`
    )
    const userPoints = pointsResult.length > 0 ? parseInt(pointsResult[0].available_amount) : 0
    console.log('  当前积分余额:', userPoints)

    // 4. 尝试抽奖（如果积分足够）
    console.log('\n🎰 步骤4: 尝试抽奖...')
    if (userPoints >= 100) {
      // 生成唯一的幂等键（防止重复抽奖）
      const idempotencyKey = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const drawResult = await request('/api/v4/lottery/draw', {
        method: 'POST',
        token,
        headers: {
          'Idempotency-Key': idempotencyKey
        },
        body: {
          campaign_code: 'BASIC_LOTTERY',
          draw_type: 'single'
        }
      })

      if (drawResult.success) {
        console.log('  ✅ 抽奖成功!')
        console.log('  奖品:', drawResult.data.prize?.prize_name || '未中奖')
        console.log('  消耗积分:', drawResult.data.cost_points || 0)
      } else {
        console.log('  ⚠️ 抽奖失败:', drawResult.message)
      }
    } else {
      console.log('  ⚠️ 积分不足，跳过抽奖测试（需要100积分，当前:', userPoints, ')')
    }

    // 5. 创建客服会话
    console.log('\n💬 步骤5: 创建客服会话...')
    const sessionResult = await request('/api/v4/system/chat/sessions', {
      method: 'POST',
      token,
      body: {
        source: 'test_script'
      }
    })

    let sessionId = null
    if (sessionResult.success) {
      sessionId = sessionResult.data.session_id
      console.log('  ✅ 会话创建/获取成功，会话ID:', sessionId)
      console.log('  状态:', sessionResult.data.status)
    } else {
      console.log('  ⚠️ 创建会话失败:', sessionResult.message)
    }

    // 6. 发送测试消息
    console.log('\n📤 步骤6: 发送测试消息...')
    if (sessionId) {
      const messageResult = await request(`/api/v4/system/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        token,
        body: {
          content: `测试消息 - ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
          message_type: 'text'
        }
      })

      if (messageResult.success) {
        console.log('  ✅ 消息发送成功，消息ID:', messageResult.data.message_id)
      } else {
        console.log('  ⚠️ 发送消息失败:', messageResult.message)
      }
    } else {
      console.log('  ⚠️ 没有会话ID，跳过发送消息')
    }

    // 7. 等待数据写入
    console.log('\n⏳ 等待数据写入...')
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 8. 获取操作后的数据库统计
    console.log('\n📊 步骤7: 获取操作后数据库统计...')
    const statsAfter = await getDatabaseStats()

    // 9. 打印对比结果
    printStatsComparison(statsBefore, statsAfter)

    // 10. 验证API返回的数据
    console.log('\n🔍 步骤8: 验证后端API返回数据...')
    const dashboardResult = await request('/api/v4/console/system/dashboard', {
      token
    })

    if (dashboardResult.success) {
      const apiData = dashboardResult.data
      console.log('\n  API返回的仪表盘数据:')
      console.log('  ├─ 总用户数:', apiData.overview.total_users)
      console.log('  ├─ 今日新增用户:', apiData.today.new_users)
      console.log('  ├─ 今日抽奖:', apiData.today.lottery_draws)
      console.log('  ├─ 今日消耗积分:', apiData.today.points_consumed)
      console.log('  ├─ 今日客服会话:', apiData.customer_service.today_sessions)
      console.log('  └─ 今日消息数:', apiData.customer_service.today_messages)

      // 验证一致性
      console.log('\n  📋 API与数据库一致性检查:')
      const checks = [
        {
          name: '总用户数',
          api: apiData.overview.total_users,
          db: statsAfter.total_users
        },
        {
          name: '今日新增用户',
          api: apiData.today.new_users,
          db: statsAfter.today_new_users
        },
        {
          name: '今日抽奖',
          api: apiData.today.lottery_draws,
          db: statsAfter.today_draws
        },
        {
          name: '今日消耗积分',
          api: apiData.today.points_consumed,
          db: statsAfter.today_points_consumed
        },
        {
          name: '今日客服会话',
          api: apiData.customer_service.today_sessions,
          db: statsAfter.today_sessions
        },
        {
          name: '今日消息数',
          api: apiData.customer_service.today_messages,
          db: statsAfter.today_messages
        }
      ]

      let allMatch = true
      checks.forEach(check => {
        const match = check.api === check.db
        if (!match) allMatch = false
        console.log(
          `  ${match ? '✅' : '❌'} ${check.name}: API=${check.api}, DB=${check.db} ${match ? '' : '(不一致!)'}`
        )
      })

      if (allMatch) {
        console.log('\n  🎉 所有数据一致性检查通过!')
      } else {
        console.log('\n  ⚠️ 存在数据不一致，需要检查后端API逻辑')
      }
    } else {
      console.log('  ⚠️ 获取仪表盘数据失败:', dashboardResult.message)
    }

    console.log('\n✅ 测试完成!')
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
  }
}

// 运行测试
runTests()
