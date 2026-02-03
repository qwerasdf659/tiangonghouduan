#!/usr/bin/env node
/**
 * 临时诊断脚本：测试管理后台数据流和权限
 * 
 * 用途：诊断为什么"系统设置"菜单没有显示以及数据联动问题
 * 运行：node scripts/temp_test_admin_data.js
 * 
 * ⚠️ 临时文件：测试完成后请删除
 */

const http = require('http')

// 配置
const BASE_URL = 'http://localhost:3000'
const TEST_USER_ID = 31  // 用户ID 31
const TEST_PHONE = '13612227930'

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

function log(color, ...args) {
  console.log(colors[color], ...args, colors.reset)
}

// HTTP请求封装
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })
    req.on('error', reject)
    if (postData) req.write(JSON.stringify(postData))
    req.end()
  })
}

async function testHealthCheck() {
  log('blue', '\n========== 1. 健康检查 ==========')
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/health',
      method: 'GET'
    })
    log('green', `✅ 服务状态: ${result.status}`)
    log('green', `   响应: ${JSON.stringify(result.data, null, 2)}`)
    return true
  } catch (error) {
    log('red', `❌ 健康检查失败: ${error.message}`)
    return false
  }
}

async function testLogin() {
  log('blue', '\n========== 2. 用户登录测试 ==========')
  log('blue', `   测试账号: ${TEST_PHONE}`)
  log('blue', `   验证码: 123456 (开发环境万能码)`)
  try {
    // 正确的登录端点: POST /api/v4/auth/login
    // 参数: mobile, verification_code (开发环境使用 123456)
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v4/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { mobile: TEST_PHONE, verification_code: '123456' })
    
    if (result.status === 200 && result.data.success) {
      const user = result.data.data?.user || result.data.data
      const token = result.data.data?.access_token || result.data.data?.token
      log('green', `✅ 登录成功`)
      log('green', `   用户ID: ${user?.user_id}`)
      log('green', `   手机号: ${user?.mobile}`)
      log('green', `   昵称: ${user?.nickname || '(未设置)'}`)
      log('yellow', `   ⭐ role_level: ${user?.role_level}`)
      log('green', `   角色列表: ${JSON.stringify(user?.roles || [])}`)
      log('green', `   Token: ${token?.substring(0, 30)}...`)
      
      // 检查 role_level
      if (user?.role_level >= 100) {
        log('green', `   ✅ role_level >= 100，应该能看到"系统设置"菜单`)
      } else {
        log('red', `   ❌ role_level < 100 (${user?.role_level})，无法看到"系统设置"菜单`)
        log('yellow', `   💡 需要更新用户的 role_level 为 100 或以上`)
      }
      
      return token
    } else {
      log('red', `❌ 登录失败: ${result.data.message || JSON.stringify(result.data)}`)
      log('yellow', `   响应状态: ${result.status}`)
      return null
    }
  } catch (error) {
    log('red', `❌ 登录请求失败: ${error.message}`)
    return null
  }
}

async function testStatisticsAPI(token) {
  log('blue', '\n========== 3. 统计报表API测试 ==========')
  if (!token) {
    log('red', '❌ 无Token，跳过测试')
    return
  }
  
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v4/system/statistics/charts?days=7',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (result.status === 200 && result.data.success) {
      const data = result.data.data
      log('green', `✅ 统计API正常`)
      log('green', `   用户增长数据: ${data.user_growth?.length || 0} 天`)
      log('green', `   用户类型: 总计 ${data.user_types?.total || 0} 人`)
      log('green', `     - 普通用户: ${data.user_types?.regular?.count || 0}`)
      log('green', `     - 管理员: ${data.user_types?.admin?.count || 0}`)
      log('green', `     - 商户: ${data.user_types?.merchant?.count || 0}`)
      log('green', `   抽奖趋势: ${data.lottery_trend?.length || 0} 天`)
      log('green', `   消费趋势: ${data.consumption_trend?.length || 0} 天`)
    } else if (result.status === 403) {
      log('red', `❌ 统计API权限不足: ${result.data.message}`)
      log('yellow', `   💡 用户需要 role_level >= 100 才能访问此API`)
    } else {
      log('red', `❌ 统计API失败: ${result.data.message || JSON.stringify(result.data)}`)
    }
  } catch (error) {
    log('red', `❌ 统计API请求失败: ${error.message}`)
  }
}

async function testNavBadgesAPI(token) {
  log('blue', '\n========== 4. 侧边栏徽标API测试 ==========')
  if (!token) {
    log('red', '❌ 无Token，跳过测试')
    return
  }
  
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v4/console/nav/badges',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (result.status === 200 && result.data.success) {
      const data = result.data.data
      log('green', `✅ 徽标API正常`)
      log('green', `   总待处理: ${data.total || 0}`)
      log('green', `   消费审核: ${data.badges?.consumption || 0}`)
      log('green', `   客服会话: ${data.badges?.customer_service || 0}`)
      log('green', `   风控告警: ${data.badges?.risk_alert || 0}`)
      log('green', `   抽奖告警: ${data.badges?.lottery_alert || 0}`)
    } else {
      log('yellow', `⚠️ 徽标API响应: ${result.status} - ${result.data.message || ''}`)
    }
  } catch (error) {
    log('yellow', `⚠️ 徽标API请求失败: ${error.message}`)
  }
}

async function checkUserRoleLevel(token) {
  log('blue', '\n========== 5. 检查用户详细信息 ==========')
  if (!token) {
    log('red', '❌ 无Token，跳过测试')
    return
  }
  
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/v4/console/users/${TEST_USER_ID}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (result.status === 200 && result.data.success) {
      const user = result.data.data
      log('green', `✅ 用户信息获取成功`)
      log('green', `   user_id: ${user.user_id}`)
      log('green', `   phone: ${user.phone}`)
      log('green', `   role: ${user.role}`)
      log('yellow', `   ⭐ role_level: ${user.role_level}`)
      log('green', `   is_admin: ${user.is_admin}`)
      
      if (user.role_level < 100) {
        log('red', '\n   🔴 发现问题: role_level < 100')
        log('yellow', '   💡 解决方案: 执行以下SQL更新用户权限')
        log('yellow', `   UPDATE users SET role_level = 100 WHERE user_id = ${TEST_USER_ID};`)
      }
    } else {
      log('yellow', `⚠️ 用户信息API响应: ${result.status} - ${result.data.message || ''}`)
    }
  } catch (error) {
    log('yellow', `⚠️ 用户信息请求失败: ${error.message}`)
  }
}

async function testSystemSettingsAPI(token) {
  log('blue', '\n========== 6. 系统设置API测试 ==========')
  if (!token) {
    log('red', '❌ 无Token，跳过测试')
    return
  }
  
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v4/console/settings',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (result.status === 200 && result.data.success) {
      log('green', `✅ 系统设置API正常`)
      log('green', `   响应数据: ${JSON.stringify(result.data.data || {}).substring(0, 100)}...`)
    } else if (result.status === 403) {
      log('red', `❌ 系统设置API权限不足: ${result.data.message}`)
      log('yellow', `   💡 用户需要 role_level >= 100 才能访问此API`)
    } else {
      log('yellow', `⚠️ 系统设置API响应: ${result.status} - ${result.data.message || ''}`)
    }
  } catch (error) {
    log('yellow', `⚠️ 系统设置API请求失败: ${error.message}`)
  }
}

// 主函数
async function main() {
  log('blue', '🔍 管理后台数据诊断脚本')
  log('blue', '=' .repeat(50))
  
  // 1. 健康检查
  const healthy = await testHealthCheck()
  if (!healthy) {
    log('red', '\n❌ 服务未启动，请先启动后端服务')
    process.exit(1)
  }
  
  // 2. 登录测试
  const token = await testLogin()
  
  // 3. 统计API测试
  await testStatisticsAPI(token)
  
  // 4. 徽标API测试
  await testNavBadgesAPI(token)
  
  // 5. 用户信息检查
  await checkUserRoleLevel(token)
  
  // 6. 系统设置API测试
  await testSystemSettingsAPI(token)
  
  // 总结
  log('blue', '\n========== 诊断总结 ==========')
  log('yellow', '如果"系统设置"菜单没有显示，请检查:')
  log('yellow', '1. 用户的 role_level 是否 >= 100')
  log('yellow', '2. 前端 localStorage 中的 admin_user 或 admin_user_info 是否包含正确的 role_level')
  log('yellow', '3. 浏览器控制台是否有权限过滤相关的日志')
  log('yellow', '\n💡 如需更新用户权限，请执行:')
  log('yellow', `   UPDATE users SET role_level = 100 WHERE user_id = ${TEST_USER_ID};`)
  
  log('blue', '\n⚠️ 此脚本为临时诊断文件，测试完成后请删除')
}

main().catch(console.error)

