#!/usr/bin/env node
/**
 * 完整API测试脚本
 * 测试前端与后端API的联动
 */

const http = require('http')

// 配置
const BASE_URL = 'http://localhost:3000'
const ADMIN_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MzY0MjY4NjcsImV4cCI6MTczNzAzMTY2N30.aqJQWrdyFLm9zP8mjwEVwNHvB-lJbVFc4fMPJcAj2Cs'

// 测试请求函数
function testRequest(method, path, description) {
  return new Promise(resolve => {
    const url = new URL(path, BASE_URL)

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }

    const req = http.request(options, res => {
      let data = ''
      res.on('data', chunk => {
        data += chunk
      })
      res.on('end', () => {
        let parsed = null
        try {
          parsed = JSON.parse(data)
        } catch (e) {
          parsed = { raw: data.substring(0, 200) }
        }

        const status = res.statusCode
        const statusEmoji =
          status === 200 ? '✅' : status === 401 ? '🔒' : status === 404 ? '❌' : '⚠️'

        console.log(`\n${statusEmoji} [${status}] ${description}`)
        console.log(`   路径: ${method} ${path}`)

        if (status === 200 && parsed) {
          // 显示数据结构
          if (parsed.data) {
            if (parsed.data.users) {
              console.log(`   ✓ 用户数量: ${parsed.data.users.length}`)
              if (parsed.data.users.length > 0) {
                const u = parsed.data.users[0]
                console.log(`   ✓ 示例用户字段: ${Object.keys(u).slice(0, 8).join(', ')}...`)
              }
            }
            if (parsed.data.pagination) {
              console.log(`   ✓ 分页信息: total=${parsed.data.pagination.total}`)
            }
            if (Array.isArray(parsed.data)) {
              console.log(`   ✓ 数组数据: ${parsed.data.length} 条`)
            }
          }
          if (parsed.success !== undefined) {
            console.log(`   ✓ success: ${parsed.success}`)
          }
        } else if (status !== 200) {
          console.log(`   ⚠ 响应: ${JSON.stringify(parsed).substring(0, 150)}`)
        }

        resolve({ status, data: parsed, path })
      })
    })

    req.on('error', error => {
      console.log(`\n❌ [ERROR] ${description}`)
      console.log(`   路径: ${method} ${path}`)
      console.log(`   错误: ${error.message}`)
      resolve({ status: 0, error: error.message, path })
    })

    req.on('timeout', () => {
      req.destroy()
      console.log(`\n⏱️ [TIMEOUT] ${description}`)
      resolve({ status: 0, error: 'timeout', path })
    })

    req.end()
  })
}

async function runTests() {
  console.log('='.repeat(60))
  console.log('🧪 完整API测试 - 前后端联动验证')
  console.log('='.repeat(60))
  console.log(`📡 服务器: ${BASE_URL}`)
  console.log(`🔑 Token: ${ADMIN_TOKEN.substring(0, 30)}...`)

  const tests = [
    // 1. 健康检查
    ['GET', '/health', '健康检查'],

    // 2. 用户管理 (前端 users.js, user-management.js 使用)
    ['GET', '/api/v4/console/user-management/users', '用户列表'],
    ['GET', '/api/v4/console/user-management/users?page=1&page_size=10', '用户列表(分页)'],
    ['GET', '/api/v4/console/user-management/roles', '角色列表'],

    // 3. 用户层级 (前端 user-management.js hierarchyModule 使用)
    ['GET', '/api/v4/console/user-hierarchy', '用户层级列表'],

    // 4. 商户积分 (前端 user-management.js merchantPointsModule 使用)
    ['GET', '/api/v4/console/merchant-points', '商户积分审核列表'],

    // 5. 弹窗横幅 (前端 system-config.js 使用)
    ['GET', '/api/v4/console/popup-banners', '弹窗横幅列表'],

    // 6. 图片资源 (前端 system-config.js 使用)
    ['GET', '/api/v4/console/images', '图片资源列表'],

    // 7. 系统公告/通知 (前端 system-config.js 使用)
    ['GET', '/api/v4/console/system/announcements', '系统公告'],
    ['GET', '/api/v4/console/system/notifications', '系统通知']
  ]

  const results = []

  for (const [method, path, desc] of tests) {
    const result = await testRequest(method, path, desc)
    results.push(result)
    await new Promise(r => setTimeout(r, 100)) // 100ms间隔
  }

  // 汇总
  console.log('\n' + '='.repeat(60))
  console.log('📊 测试结果汇总')
  console.log('='.repeat(60))

  const success = results.filter(r => r.status === 200).length
  const auth = results.filter(r => r.status === 401).length
  const notFound = results.filter(r => r.status === 404).length
  const errors = results.filter(r => r.status === 0 || r.status >= 500).length

  console.log(`✅ 成功: ${success}/${results.length}`)
  console.log(`🔒 需要认证: ${auth}`)
  console.log(`❌ 未找到: ${notFound}`)
  console.log(`⚠️ 错误: ${errors}`)

  // 列出失败的接口
  const failed = results.filter(r => r.status !== 200)
  if (failed.length > 0) {
    console.log('\n🔴 失败的接口:')
    failed.forEach(r => {
      console.log(`   - [${r.status}] ${r.path}`)
    })
  }

  console.log('\n' + '='.repeat(60))
  console.log('测试完成')
  console.log('='.repeat(60))
}

runTests().catch(console.error)
