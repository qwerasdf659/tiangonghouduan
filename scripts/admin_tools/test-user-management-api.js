#!/usr/bin/env node
/**
 * 用户管理API测试脚本
 * 测试后端API是否正常工作
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// 颜色输出
const colors = {
  green: text => `\x1b[32m${text}\x1b[0m`,
  red: text => `\x1b[31m${text}\x1b[0m`,
  yellow: text => `\x1b[33m${text}\x1b[0m`,
  cyan: text => `\x1b[36m${text}\x1b[0m`
}

// 从命令行参数或环境变量获取token
const TOKEN = process.argv[2] || process.env.ADMIN_TOKEN

async function testAPI(name, url, options = {}) {
  const fullUrl = `${BASE_URL}${url}`
  console.log(`\n${colors.cyan('测试:')} ${name}`)
  console.log(`${colors.cyan('URL:')} ${options.method || 'GET'} ${fullUrl}`)

  try {
    const headers = {
      'Content-Type': 'application/json'
    }

    if (TOKEN) {
      headers['Authorization'] = `Bearer ${TOKEN}`
    }

    const response = await fetch(fullUrl, {
      ...options,
      headers: { ...headers, ...options.headers }
    })

    const data = await response.json()

    if (response.ok && data.success) {
      console.log(`${colors.green('✅ 成功')} - HTTP ${response.status}`)
      console.log(`消息: ${data.message}`)
      if (data.data) {
        // 打印部分数据
        if (data.data.users) {
          console.log(`用户数量: ${data.data.users.length}`)
          if (data.data.users.length > 0) {
            console.log(
              `第一个用户: ID=${data.data.users[0].user_id}, 昵称=${data.data.users[0].nickname}`
            )
          }
        } else if (data.data.roles) {
          console.log(`角色数量: ${data.data.roles.length}`)
        } else if (data.data.pagination) {
          console.log(
            `分页: total=${data.data.pagination.total}, page=${data.data.pagination.page}`
          )
        }
      }
      return { success: true, data }
    } else {
      console.log(`${colors.red('❌ 失败')} - HTTP ${response.status}`)
      console.log(`错误: ${data.message || JSON.stringify(data)}`)
      return { success: false, error: data }
    }
  } catch (error) {
    console.log(`${colors.red('❌ 异常')} - ${error.message}`)
    return { success: false, error: error.message }
  }
}

async function runTests() {
  console.log(colors.yellow('\n========================================'))
  console.log(colors.yellow('  用户管理API测试脚本'))
  console.log(colors.yellow('========================================'))
  console.log(`BASE_URL: ${BASE_URL}`)
  console.log(`TOKEN: ${TOKEN ? '已设置' : '未设置（可能需要登录）'}`)

  const results = []

  // 1. 测试健康检查
  results.push(await testAPI('健康检查', '/health'))

  // 2. 测试获取用户列表（正确的路径）
  results.push(
    await testAPI(
      '获取用户列表 (正确路径)',
      '/api/v4/console/user-management/users?page=1&limit=10'
    )
  )

  // 3. 测试获取角色列表
  results.push(await testAPI('获取角色列表', '/api/v4/console/user-management/roles'))

  // 4. 测试系统仪表板
  results.push(await testAPI('系统仪表板', '/api/v4/console/system/dashboard'))

  // 5. 测试用户层级列表
  results.push(await testAPI('用户层级列表', '/api/v4/console/user-hierarchy?page=1&page_size=10'))

  // 6. 测试商家积分审核列表
  results.push(
    await testAPI('商家积分审核列表', '/api/v4/console/merchant-points?page=1&page_size=10')
  )

  // 统计结果
  const successCount = results.filter(r => r.success).length
  const failCount = results.length - successCount

  console.log(colors.yellow('\n========================================'))
  console.log(colors.yellow('  测试结果汇总'))
  console.log(colors.yellow('========================================'))
  console.log(`总测试: ${results.length}`)
  console.log(`${colors.green('成功:')} ${successCount}`)
  console.log(`${colors.red('失败:')} ${failCount}`)

  if (failCount > 0) {
    console.log(colors.yellow('\n⚠️  部分测试失败，请检查：'))
    console.log('1. 后端服务是否运行中')
    console.log('2. 是否需要管理员Token（传入参数或设置ADMIN_TOKEN环境变量）')
    console.log('3. API路径是否正确')
  }

  // 测试错误路径（验证旧路径确实不存在）
  console.log(colors.yellow('\n========================================'))
  console.log(colors.yellow('  验证旧路径（应该返回404）'))
  console.log(colors.yellow('========================================'))

  const oldPathResult = await testAPI(
    '旧路径测试（应返回404）',
    '/api/v4/admin/users?page=1&page_size=10'
  )

  if (!oldPathResult.success) {
    console.log(
      colors.green(
        '\n✅ 确认：旧路径 /api/v4/admin/users 不存在，需要使用 /api/v4/console/user-management/users'
      )
    )
  }
}

runTests().catch(console.error)
