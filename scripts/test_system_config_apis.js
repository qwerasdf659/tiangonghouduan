#!/usr/bin/env node
/**
 * 系统配置中心API测试脚本
 * 测试公告管理、系统通知、弹窗Banner、图片资源等后端API
 *
 * 用法: node scripts/test_system_config_apis.js
 */

const http = require('http')
const https = require('https')

// 配置
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const TOKEN = process.env.ADMIN_TOKEN || ''

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

// 发送HTTP请求
function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const isHttps = url.protocol === 'https:'
    const client = isHttps ? https : http

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
        ...options.headers
      }
    }

    const req = client.request(reqOptions, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          })
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
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

// 测试API
async function testAPI(name, path, expected = {}) {
  try {
    const res = await request(path)
    const passed = res.status === (expected.status || 200)

    if (passed) {
      log('green', `✅ ${name}`)
      log('blue', `   路径: ${path}`)
      log('blue', `   状态码: ${res.status}`)

      if (res.body && typeof res.body === 'object') {
        log('blue', `   success: ${res.body.success}`)
        if (res.body.data) {
          const dataKeys = Object.keys(res.body.data)
          log('blue', `   data字段: ${dataKeys.join(', ')}`)

          // 显示数组长度
          dataKeys.forEach(key => {
            if (Array.isArray(res.body.data[key])) {
              log('blue', `   ${key}数量: ${res.body.data[key].length}`)
            }
          })
        }
      }
    } else {
      log('red', `❌ ${name}`)
      log('yellow', `   路径: ${path}`)
      log('yellow', `   期望状态码: ${expected.status || 200}`)
      log('yellow', `   实际状态码: ${res.status}`)
      if (res.body) {
        log('yellow', `   响应: ${JSON.stringify(res.body).substring(0, 200)}`)
      }
    }

    return { name, path, passed, response: res }
  } catch (error) {
    log('red', `❌ ${name}`)
    log('yellow', `   路径: ${path}`)
    log('yellow', `   错误: ${error.message}`)
    return { name, path, passed: false, error: error.message }
  }
}

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('🔍 系统配置中心API测试')
  console.log('='.repeat(60))
  console.log(`基础URL: ${BASE_URL}`)
  console.log(`Token: ${TOKEN ? '已设置' : '未设置'}`)
  console.log('='.repeat(60) + '\n')

  const results = []

  // 1. 健康检查
  console.log('\n📡 1. 健康检查')
  console.log('-'.repeat(40))
  results.push(await testAPI('健康检查', '/health'))

  // 2. 公告管理API测试
  console.log('\n📢 2. 公告管理API')
  console.log('-'.repeat(40))

  // 测试错误路径（前端当前使用的）
  results.push(
    await testAPI(
      '错误路径 /api/v4/admin/announcements',
      '/api/v4/admin/announcements?page=1&page_size=10',
      { status: 404 }
    )
  )

  // 测试正确路径
  results.push(
    await testAPI(
      '正确路径 /api/v4/console/system/announcements',
      '/api/v4/console/system/announcements?limit=10&offset=0'
    )
  )

  // 公共API路径
  results.push(
    await testAPI(
      '公共API /api/v4/system/announcements',
      '/api/v4/system/announcements?limit=10&offset=0'
    )
  )

  // 3. 弹窗Banner API测试
  console.log('\n🖼️ 3. 弹窗Banner API')
  console.log('-'.repeat(40))

  results.push(
    await testAPI('错误路径 /api/v4/admin/popup-banners', '/api/v4/admin/popup-banners', {
      status: 404
    })
  )

  results.push(
    await testAPI(
      '正确路径 /api/v4/console/popup-banners',
      '/api/v4/console/popup-banners?limit=10&offset=0'
    )
  )

  // 4. 图片API测试
  console.log('\n📷 4. 图片API')
  console.log('-'.repeat(40))

  results.push(
    await testAPI('错误路径 /api/v4/admin/images', '/api/v4/admin/images', { status: 404 })
  )

  results.push(
    await testAPI('正确路径 /api/v4/console/images', '/api/v4/console/images?limit=10&offset=0')
  )

  // 5. Console根路径信息
  console.log('\n📋 5. Console模块信息')
  console.log('-'.repeat(40))
  results.push(await testAPI('Console根路径', '/api/v4/console/'))

  // 汇总
  console.log('\n' + '='.repeat(60))
  console.log('📊 测试汇总')
  console.log('='.repeat(60))

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  log('green', `✅ 通过: ${passed}`)
  log('red', `❌ 失败: ${failed}`)
  console.log(`📈 通过率: ${((passed / results.length) * 100).toFixed(1)}%`)

  // 输出API路径映射建议
  console.log('\n' + '='.repeat(60))
  console.log('💡 前端API路径修正建议')
  console.log('='.repeat(60))
  console.log(`
前端当前路径 → 后端正确路径：
----------------------------------------------
/api/v4/admin/announcements     → /api/v4/console/system/announcements
/api/v4/admin/popup-banners     → /api/v4/console/popup-banners
/api/v4/admin/images            → /api/v4/console/images
/api/v4/admin/notifications     → /api/v4/console/system/notifications (如有)
`)

  console.log('\n' + '='.repeat(60))
  console.log('🔧 后端响应字段说明（直接使用，不做映射）')
  console.log('='.repeat(60))
  console.log(`
公告API响应结构：
{
  success: true,
  data: {
    announcements: [...],  // 公告数组（不是 items）
    total: 100,            // 总数
    limit: 10,             // 每页数量
    offset: 0              // 偏移量
  }
}
`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('测试脚本执行失败:', err)
  process.exit(1)
})
