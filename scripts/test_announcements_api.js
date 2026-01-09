#!/usr/bin/env node
/**
 * 公告管理API测试脚本
 *
 * 用于验证后端API返回的数据结构，确保前端能正确解析
 *
 * 使用方法：node scripts/test-announcements-api.js
 */

const http = require('http')

// 配置
const BASE_URL = 'http://localhost:3000'
const TEST_TOKEN = process.env.TEST_ADMIN_TOKEN || ''

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

/**
 * 发送HTTP请求
 */
function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
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
          const json = JSON.parse(body)
          resolve({ status: res.statusCode, data: json })
        } catch (e) {
          resolve({ status: res.statusCode, data: body })
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    if (data) {
      req.write(JSON.stringify(data))
    }
    req.end()
  })
}

/**
 * 测试服务器健康状态
 */
async function testHealth() {
  log('\n📡 测试1：服务器健康检查', 'cyan')
  try {
    const result = await request('GET', '/health')
    if (result.status === 200) {
      log('✅ 服务器运行正常', 'green')
      log(`   状态: ${JSON.stringify(result.data.status || result.data)}`, 'blue')
      return true
    } else {
      log(`❌ 服务器异常: ${result.status}`, 'red')
      return false
    }
  } catch (error) {
    log(`❌ 无法连接服务器: ${error.message}`, 'red')
    return false
  }
}

/**
 * 测试公告列表API（无认证）
 */
async function testAnnouncementsListNoAuth() {
  log('\n📋 测试2：公告列表API（无认证）', 'cyan')
  try {
    const result = await request('GET', '/api/v4/console/system/announcements')
    log(`   HTTP状态码: ${result.status}`, 'blue')

    if (result.status === 401) {
      log('✅ 正确返回401未认证', 'green')
      return true
    } else {
      log(`⚠️ 预期401，实际: ${result.status}`, 'yellow')
      return false
    }
  } catch (error) {
    log(`❌ 请求失败: ${error.message}`, 'red')
    return false
  }
}

/**
 * 测试公开公告API（用户端，不需要认证）
 */
async function testPublicAnnouncements() {
  log('\n📢 测试3：公开公告API（用户端）', 'cyan')
  try {
    const result = await request('GET', '/api/v4/system/announcements')
    log(`   HTTP状态码: ${result.status}`, 'blue')

    if (result.status === 200 && result.data.success) {
      log('✅ 获取公开公告成功', 'green')

      // 分析返回的数据结构
      log('\n   📊 返回数据结构分析:', 'yellow')
      const data = result.data.data || result.data

      if (data.announcements && Array.isArray(data.announcements)) {
        log(`   公告数量: ${data.announcements.length}`, 'blue')

        if (data.announcements.length > 0) {
          const sample = data.announcements[0]
          log('\n   📌 第一条公告字段:', 'yellow')
          Object.keys(sample).forEach(key => {
            const value = sample[key]
            const type = typeof value
            const display = type === 'object' ? JSON.stringify(value) : value
            log(`      ${key}: (${type}) ${display}`, 'blue')
          })

          // 检查关键字段
          log('\n   🔍 前端需要的字段检查:', 'yellow')
          checkField('status', sample.status, '状态')
          checkField('type', sample.type, '类型')
          checkField('start_time', sample.start_time, '开始时间')
          checkField('end_time', sample.end_time, '结束时间')
          checkField('sort_order', sample.sort_order, '排序')
          checkField('is_active', sample.is_active, '是否激活')
          checkField('created_at', sample.created_at, '创建时间')
          checkField('expires_at', sample.expires_at, '过期时间')
        }
      } else {
        log('   ⚠️ 返回结构非预期格式', 'yellow')
        log(`   实际结构: ${JSON.stringify(Object.keys(data))}`, 'blue')
      }

      return true
    } else {
      log(`❌ 获取失败: ${result.data.message || '未知错误'}`, 'red')
      return false
    }
  } catch (error) {
    log(`❌ 请求失败: ${error.message}`, 'red')
    return false
  }
}

/**
 * 检查字段是否存在
 */
function checkField(fieldName, value, label) {
  if (value !== undefined && value !== null) {
    log(`      ✅ ${label} (${fieldName}): ${value}`, 'green')
  } else {
    log(`      ❌ ${label} (${fieldName}): 不存在`, 'red')
  }
}

/**
 * 测试管理端公告API（需要Token）
 */
async function testConsoleAnnouncementsWithToken(token) {
  log('\n🔐 测试4：管理端公告API（带Token）', 'cyan')

  if (!token) {
    log('   ⚠️ 未提供Token，跳过此测试', 'yellow')
    log('   提示: 设置环境变量 TEST_ADMIN_TOKEN=your_token 后重试', 'yellow')
    return false
  }

  try {
    const result = await request('GET', '/api/v4/console/system/announcements', null, token)
    log(`   HTTP状态码: ${result.status}`, 'blue')

    if (result.status === 200 && result.data.success) {
      log('✅ 获取管理端公告成功', 'green')

      const data = result.data.data || result.data
      log(`   公告总数: ${data.total || 'N/A'}`, 'blue')

      if (data.announcements && data.announcements.length > 0) {
        const sample = data.announcements[0]
        log('\n   📌 管理端数据字段:', 'yellow')
        Object.keys(sample).forEach(key => {
          const value = sample[key]
          const type = typeof value
          const display =
            type === 'object'
              ? JSON.stringify(value).substring(0, 50)
              : String(value).substring(0, 50)
          log(`      ${key}: (${type}) ${display}`, 'blue')
        })
      }

      return true
    } else if (result.status === 401) {
      log('❌ Token无效或已过期', 'red')
      return false
    } else {
      log(`❌ 获取失败: ${result.data.message || '未知错误'}`, 'red')
      return false
    }
  } catch (error) {
    log(`❌ 请求失败: ${error.message}`, 'red')
    return false
  }
}

/**
 * 生成修复建议
 */
function generateFixSuggestions() {
  log('\n📝 前端修复建议:', 'cyan')
  log('='.repeat(60), 'blue')

  log('\n1️⃣ 状态字段映射问题:', 'yellow')
  log('   后端: is_active (布尔值)', 'blue')
  log('   前端期望: status (字符串: active/inactive/draft)', 'blue')
  log('   修复: 前端根据 is_active 转换为 status', 'green')
  log(
    `
   function getStatusFromData(item) {
     if (item.status) return item.status
     return item.is_active ? 'active' : 'inactive'
   }`,
    'blue'
  )

  log('\n2️⃣ 日期格式问题:', 'yellow')
  log('   后端: created_at 返回中文格式 "2025年01月09日 12:00:00"', 'blue')
  log('   前端: new Date() 无法解析中文日期', 'blue')
  log('   修复: 添加中文日期解析或直接显示', 'green')
  log(
    `
   function formatDate(dateString) {
     if (!dateString) return '-'
     // 如果已经是中文格式，直接返回
     if (dateString.includes('年')) return dateString
     // 否则尝试标准解析
     try {
       return new Date(dateString).toLocaleString('zh-CN')
     } catch {
       return dateString
     }
   }`,
    'blue'
  )

  log('\n3️⃣ 类型映射问题:', 'yellow')
  log('   后端类型: system, activity, maintenance, notice', 'blue')
  log('   前端期望: notice, activity, update, warning', 'blue')
  log('   修复: 更新类型映射表', 'green')

  log('\n4️⃣ 字段名映射:', 'yellow')
  log('   expires_at → end_time', 'blue')
  log('   created_at → start_time (用于发布时间)', 'blue')
  log('   无 sort_order 字段，显示默认值 0', 'blue')

  log('\n' + '='.repeat(60), 'blue')
}

/**
 * 主函数
 */
async function main() {
  log('🚀 公告管理API测试脚本', 'cyan')
  log('='.repeat(60), 'blue')
  log(`测试目标: ${BASE_URL}`, 'blue')
  log(`测试时间: ${new Date().toLocaleString('zh-CN')}`, 'blue')

  const results = {
    health: false,
    noAuth: false,
    publicApi: false,
    consoleApi: false
  }

  // 执行测试
  results.health = await testHealth()

  if (!results.health) {
    log('\n❌ 服务器不可用，终止测试', 'red')
    log('   请确保后端服务已启动: npm run dev', 'yellow')
    process.exit(1)
  }

  results.noAuth = await testAnnouncementsListNoAuth()
  results.publicApi = await testPublicAnnouncements()
  results.consoleApi = await testConsoleAnnouncementsWithToken(TEST_TOKEN)

  // 生成修复建议
  generateFixSuggestions()

  // 测试总结
  log('\n📊 测试结果汇总:', 'cyan')
  log('='.repeat(60), 'blue')
  log(`   健康检查: ${results.health ? '✅ 通过' : '❌ 失败'}`, results.health ? 'green' : 'red')
  log(`   无认证测试: ${results.noAuth ? '✅ 通过' : '❌ 失败'}`, results.noAuth ? 'green' : 'red')
  log(
    `   公开API: ${results.publicApi ? '✅ 通过' : '❌ 失败'}`,
    results.publicApi ? 'green' : 'red'
  )
  log(
    `   管理API: ${results.consoleApi ? '✅ 通过' : '⚠️ 跳过/失败'}`,
    results.consoleApi ? 'green' : 'yellow'
  )

  const passed = Object.values(results).filter(Boolean).length
  const total = Object.keys(results).length
  log(`\n   总计: ${passed}/${total} 通过`, passed === total ? 'green' : 'yellow')

  log('\n✅ 测试完成', 'green')
}

// 运行
main().catch(error => {
  log(`\n💥 测试脚本错误: ${error.message}`, 'red')
  process.exit(1)
})
