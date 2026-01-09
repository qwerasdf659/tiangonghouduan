#!/usr/bin/env node
/**
 * 反馈管理API测试脚本
 *
 * 用途：验证反馈管理前后端联动是否正常
 *
 * 测试项目：
 * 1. 获取反馈列表
 * 2. 获取反馈详情
 * 3. 回复反馈
 * 4. 更新反馈状态
 *
 * 使用方法：
 *   node scripts/test-feedback-api.js
 *
 * 创建时间：2026-01-09
 */

const http = require('http')

// 配置
const BASE_URL = 'http://localhost:3000'
const API_PREFIX = '/api/v4/console/system/feedbacks'

// 管理员Token（需要替换为有效的token）
let ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// HTTP请求封装
function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)

    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: ADMIN_TOKEN ? `Bearer ${ADMIN_TOKEN}` : ''
      }
    }

    const req = http.request(options, res => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          resolve({ status: res.statusCode, data: json })
        } catch (e) {
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

// 登录获取管理员Token
async function login() {
  log('\n📝 步骤0: 登录获取管理员Token', 'cyan')

  try {
    const result = await request('POST', '/api/v4/console/auth/login', {
      mobile: '13800138000', // 测试管理员手机号
      password: 'Admin123!' // 测试管理员密码
    })

    if (result.data.success && result.data.data?.token) {
      ADMIN_TOKEN = result.data.data.token
      log('✅ 登录成功，获取到Token', 'green')
      return true
    } else {
      log(`❌ 登录失败: ${result.data.message || '未知错误'}`, 'red')
      log('⚠️  请确保有管理员账户，或设置环境变量 ADMIN_TOKEN', 'yellow')
      return false
    }
  } catch (error) {
    log(`❌ 登录请求失败: ${error.message}`, 'red')
    return false
  }
}

// 测试1: 获取反馈列表
async function testGetFeedbackList() {
  log('\n📋 测试1: 获取反馈列表', 'cyan')

  try {
    const result = await request('GET', `${API_PREFIX}?limit=10&offset=0`)

    if (result.data.success) {
      const feedbacks = result.data.data.feedbacks || []
      const total = result.data.data.total || 0

      log(`✅ 获取成功: 共${total}条反馈，本页${feedbacks.length}条`, 'green')

      if (feedbacks.length > 0) {
        log('📊 反馈列表示例:', 'cyan')
        feedbacks.slice(0, 3).forEach((f, i) => {
          log(
            `   ${i + 1}. ID:${f.feedback_id} | 用户:${f.user?.nickname || f.user_id} | 分类:${f.category} | 状态:${f.status}`
          )
        })

        // 返回第一个反馈的ID用于后续测试
        return feedbacks[0].feedback_id
      }
      return null
    } else {
      log(`❌ 获取失败: ${result.data.message}`, 'red')
      return null
    }
  } catch (error) {
    log(`❌ 请求失败: ${error.message}`, 'red')
    return null
  }
}

// 测试2: 获取反馈详情
async function testGetFeedbackDetail(feedbackId) {
  log(`\n🔍 测试2: 获取反馈详情 (ID: ${feedbackId})`, 'cyan')

  if (!feedbackId) {
    log('⚠️  跳过: 没有可用的反馈ID', 'yellow')
    return null
  }

  try {
    const result = await request('GET', `${API_PREFIX}/${feedbackId}`)

    if (result.data.success) {
      const feedback = result.data.data.feedback
      log('✅ 获取详情成功:', 'green')
      log(`   - ID: ${feedback.feedback_id}`)
      log(`   - 用户ID: ${feedback.user_id}`)
      log(`   - 用户昵称: ${feedback.user?.nickname || '未知'}`)
      log(`   - 分类: ${feedback.category}`)
      log(`   - 状态: ${feedback.status}`)
      log(`   - 内容: ${(feedback.content || '').substring(0, 50)}...`)
      log(`   - 回复: ${feedback.reply_content || '暂无回复'}`)
      log(`   - 创建时间: ${feedback.created_at}`)

      return feedback
    } else {
      log(`❌ 获取失败: ${result.data.message}`, 'red')
      return null
    }
  } catch (error) {
    log(`❌ 请求失败: ${error.message}`, 'red')
    return null
  }
}

// 测试3: 筛选反馈（按分类）
async function testFilterByCategory() {
  log('\n🔎 测试3: 按分类筛选反馈', 'cyan')

  const categories = ['bug', 'suggestion', 'complaint', 'technical', 'feature', 'other']

  for (const category of categories) {
    try {
      const result = await request('GET', `${API_PREFIX}?category=${category}&limit=5`)

      if (result.data.success) {
        const count = result.data.data.feedbacks?.length || 0
        const total = result.data.data.total || 0
        log(`   ${category}: ${total}条 (本页${count}条)`, count > 0 ? 'green' : 'yellow')
      }
    } catch (error) {
      log(`   ${category}: 请求失败`, 'red')
    }
  }
}

// 测试4: 筛选反馈（按状态）
async function testFilterByStatus() {
  log('\n🔎 测试4: 按状态筛选反馈', 'cyan')

  const statuses = ['pending', 'processing', 'replied', 'closed']

  for (const status of statuses) {
    try {
      const result = await request('GET', `${API_PREFIX}?status=${status}&limit=5`)

      if (result.data.success) {
        const count = result.data.data.feedbacks?.length || 0
        const total = result.data.data.total || 0
        log(`   ${status}: ${total}条 (本页${count}条)`, count > 0 ? 'green' : 'yellow')
      }
    } catch (error) {
      log(`   ${status}: 请求失败`, 'red')
    }
  }
}

// 测试5: 回复反馈（可选，需要确认）
async function testReplyFeedback(feedbackId) {
  log(`\n💬 测试5: 回复反馈 (ID: ${feedbackId})`, 'cyan')

  if (!feedbackId) {
    log('⚠️  跳过: 没有可用的反馈ID', 'yellow')
    return
  }

  // 默认跳过写入测试
  if (!process.env.ENABLE_WRITE_TEST) {
    log('⚠️  跳过写入测试，设置 ENABLE_WRITE_TEST=1 启用', 'yellow')
    return
  }

  try {
    const result = await request('POST', `${API_PREFIX}/${feedbackId}/reply`, {
      reply_content: `[测试回复] 感谢您的反馈，我们已收到并正在处理。测试时间: ${new Date().toLocaleString('zh-CN')}`
    })

    if (result.data.success) {
      log('✅ 回复成功', 'green')
      log(`   新状态: ${result.data.data.feedback.status}`)
    } else {
      log(`❌ 回复失败: ${result.data.message}`, 'red')
    }
  } catch (error) {
    log(`❌ 请求失败: ${error.message}`, 'red')
  }
}

// 测试6: 更新反馈状态（可选，需要确认）
async function testUpdateStatus(feedbackId) {
  log(`\n🔄 测试6: 更新反馈状态 (ID: ${feedbackId})`, 'cyan')

  if (!feedbackId) {
    log('⚠️  跳过: 没有可用的反馈ID', 'yellow')
    return
  }

  // 默认跳过写入测试
  if (!process.env.ENABLE_WRITE_TEST) {
    log('⚠️  跳过写入测试，设置 ENABLE_WRITE_TEST=1 启用', 'yellow')
    return
  }

  try {
    const result = await request('PUT', `${API_PREFIX}/${feedbackId}/status`, {
      status: 'processing',
      internal_notes: '测试更新状态'
    })

    if (result.data.success) {
      log('✅ 状态更新成功', 'green')
      log(`   新状态: ${result.data.data.feedback.status}`)
    } else {
      log(`❌ 更新失败: ${result.data.message}`, 'red')
    }
  } catch (error) {
    log(`❌ 请求失败: ${error.message}`, 'red')
  }
}

// 验证数据库连接
async function checkDatabaseData() {
  log('\n🔍 检查数据库反馈数据', 'cyan')

  try {
    // 通过API获取统计数据
    const result = await request('GET', `${API_PREFIX}?limit=100`)

    if (result.data.success) {
      const feedbacks = result.data.data.feedbacks || []
      const total = result.data.data.total || 0

      // 统计各状态数量
      const stats = {
        pending: feedbacks.filter(f => f.status === 'pending').length,
        processing: feedbacks.filter(f => f.status === 'processing').length,
        replied: feedbacks.filter(f => f.status === 'replied').length,
        closed: feedbacks.filter(f => f.status === 'closed').length
      }

      // 统计各分类数量
      const categoryStats = {}
      feedbacks.forEach(f => {
        categoryStats[f.category] = (categoryStats[f.category] || 0) + 1
      })

      log(`📊 数据库统计 (总计: ${total}条):`, 'green')
      log(`   状态分布:`)
      log(`     - 待处理(pending): ${stats.pending}`)
      log(`     - 处理中(processing): ${stats.processing}`)
      log(`     - 已回复(replied): ${stats.replied}`)
      log(`     - 已关闭(closed): ${stats.closed}`)
      log(`   分类分布:`)
      Object.entries(categoryStats).forEach(([cat, count]) => {
        log(`     - ${cat}: ${count}`)
      })
    } else {
      log(`❌ 获取数据失败: ${result.data.message}`, 'red')
    }
  } catch (error) {
    log(`❌ 请求失败: ${error.message}`, 'red')
  }
}

// 主函数
async function main() {
  log('='.repeat(60), 'cyan')
  log('🧪 反馈管理API测试脚本', 'cyan')
  log('='.repeat(60), 'cyan')

  // 检查服务是否运行
  log('\n🔌 检查服务状态...', 'cyan')
  try {
    const healthResult = await request('GET', '/health')
    if (healthResult.status === 200) {
      log('✅ 服务运行正常', 'green')
    } else {
      log(`⚠️  服务返回状态码: ${healthResult.status}`, 'yellow')
    }
  } catch (error) {
    log(`❌ 服务未运行或无法连接: ${error.message}`, 'red')
    log('💡 请先启动服务: npm start 或 pm2 start ecosystem.config.js', 'yellow')
    process.exit(1)
  }

  // 登录获取Token
  if (!ADMIN_TOKEN) {
    const loginSuccess = await login()
    if (!loginSuccess) {
      log('\n⚠️  未登录，将尝试继续测试（可能会失败）', 'yellow')
    }
  }

  // 执行测试
  const feedbackId = await testGetFeedbackList()
  await testGetFeedbackDetail(feedbackId)
  await testFilterByCategory()
  await testFilterByStatus()
  await testReplyFeedback(feedbackId)
  await testUpdateStatus(feedbackId)
  await checkDatabaseData()

  log('\n' + '='.repeat(60), 'cyan')
  log('✅ 测试完成', 'green')
  log('='.repeat(60), 'cyan')

  log('\n💡 提示:', 'yellow')
  log('   - 如需测试回复/更新功能，设置环境变量: ENABLE_WRITE_TEST=1')
  log('   - 如有管理员Token，可设置: ADMIN_TOKEN=xxx')
  log('   - Web页面访问: http://localhost:3000/admin/feedbacks.html')
}

main().catch(error => {
  log(`\n❌ 测试异常: ${error.message}`, 'red')
  process.exit(1)
})
