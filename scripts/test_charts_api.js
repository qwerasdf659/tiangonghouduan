#!/usr/bin/env node
/**
 * 图表API测试脚本
 *
 * 用于测试后端 /api/v4/system/statistics/charts API 的返回数据格式
 * 并验证数据完整性
 *
 * 使用方法: node scripts/test-charts-api.js
 */

const http = require('http')

// 配置
const CONFIG = {
  host: 'localhost',
  port: 3000,
  // 需要一个有效的管理员token
  token: process.env.ADMIN_TOKEN || ''
}

/**
 * 发送HTTP请求
 */
function request(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.host,
      port: CONFIG.port,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    }

    const req = http.request(options, res => {
      let data = ''
      res.on('data', chunk => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ status: res.statusCode, data: json })
        } catch (e) {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })

    req.on('error', e => {
      reject(e)
    })

    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error('请求超时'))
    })

    req.end()
  })
}

/**
 * 先登录获取token
 */
async function login() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      mobile: '13800138002', // 测试管理员账号
      code: '123456' // 测试验证码
    })

    const options = {
      hostname: CONFIG.host,
      port: CONFIG.port,
      path: '/api/v4/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }

    const req = http.request(options, res => {
      let data = ''
      res.on('data', chunk => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.success && json.data && json.data.token) {
            resolve(json.data.token)
          } else {
            reject(new Error('登录失败: ' + JSON.stringify(json)))
          }
        } catch (e) {
          reject(new Error('解析登录响应失败: ' + data))
        }
      })
    })

    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

/**
 * 分析数据结构
 */
function analyzeDataStructure(data, name, depth = 0) {
  const indent = '  '.repeat(depth)

  if (Array.isArray(data)) {
    console.log(`${indent}${name}: Array[${data.length}]`)
    if (data.length > 0) {
      console.log(`${indent}  示例元素:`)
      analyzeDataStructure(data[0], 'item', depth + 2)
    }
  } else if (data && typeof data === 'object') {
    console.log(`${indent}${name}: Object`)
    Object.keys(data).forEach(key => {
      const value = data[key]
      if (Array.isArray(value)) {
        console.log(`${indent}  ${key}: Array[${value.length}]`)
        if (value.length > 0 && typeof value[0] === 'object') {
          console.log(`${indent}    示例: ${JSON.stringify(value[0]).substring(0, 100)}...`)
        }
      } else if (value && typeof value === 'object') {
        console.log(`${indent}  ${key}: ${JSON.stringify(value).substring(0, 80)}...`)
      } else {
        console.log(`${indent}  ${key}: ${typeof value} = ${value}`)
      }
    })
  } else {
    console.log(`${indent}${name}: ${typeof data} = ${data}`)
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('========================================')
  console.log('🔍 图表API测试脚本')
  console.log('========================================\n')

  try {
    // 1. 检查服务是否运行
    console.log('📡 检查服务状态...')
    try {
      const healthRes = await request('/health', '')
      console.log(`✅ 服务健康状态: ${healthRes.data.status || healthRes.status}`)
    } catch (e) {
      console.log('❌ 服务未启动或无法连接')
      console.log('   请先启动后端服务: npm start')
      process.exit(1)
    }

    // 2. 获取管理员token
    console.log('\n📋 登录获取管理员token...')
    let token = CONFIG.token

    if (!token) {
      try {
        token = await login()
        console.log('✅ 登录成功，获取到token')
      } catch (e) {
        console.log('⚠️  自动登录失败:', e.message)
        console.log('   请手动设置 ADMIN_TOKEN 环境变量')
        // 继续尝试无token请求
      }
    }

    // 3. 测试图表API
    console.log('\n📊 测试图表API...')
    const chartsRes = await request('/api/v4/system/statistics/charts?days=30', token)

    console.log(`\n📈 API响应状态: ${chartsRes.status}`)
    console.log(`📝 响应 success: ${chartsRes.data.success}`)
    console.log(`📝 响应 message: ${chartsRes.data.message}`)
    console.log(`📝 响应 code: ${chartsRes.data.code}`)

    if (chartsRes.data.success && chartsRes.data.data) {
      console.log('\n========================================')
      console.log('📊 后端返回的数据结构分析')
      console.log('========================================\n')

      const data = chartsRes.data.data

      // 分析每个字段的结构
      console.log('1️⃣  user_growth (用户增长):')
      analyzeDataStructure(data.user_growth, 'user_growth', 1)

      console.log('\n2️⃣  user_types (用户类型分布):')
      analyzeDataStructure(data.user_types, 'user_types', 1)

      console.log('\n3️⃣  lottery_trend (抽奖趋势):')
      analyzeDataStructure(data.lottery_trend, 'lottery_trend', 1)

      console.log('\n4️⃣  consumption_trend (消费趋势):')
      analyzeDataStructure(data.consumption_trend, 'consumption_trend', 1)

      console.log('\n5️⃣  points_flow (积分流水):')
      analyzeDataStructure(data.points_flow, 'points_flow', 1)

      console.log('\n6️⃣  top_prizes (热门奖品):')
      analyzeDataStructure(data.top_prizes, 'top_prizes', 1)

      console.log('\n7️⃣  active_hours (活跃时段):')
      analyzeDataStructure(data.active_hours, 'active_hours', 1)

      console.log('\n8️⃣  metadata (元数据):')
      analyzeDataStructure(data.metadata, 'metadata', 1)

      // 输出前端需要的数据转换建议
      console.log('\n========================================')
      console.log('🔧 前端数据转换建议')
      console.log('========================================\n')

      console.log('前端 charts.js 需要将后端数据转换为 Chart.js 格式：')
      console.log('')
      console.log('user_growth:')
      console.log('  后端: [{date, count, cumulative}, ...]')
      console.log('  前端需要: {labels: [date...], new_users: [count...], active_users: [...]}')
      console.log('')
      console.log('user_types:')
      console.log('  后端: {regular: {count, percentage}, admin: {...}, merchant: {...}, total}')
      console.log('  前端需要: {normal: count, vip: 0, admin: count}')
      console.log('')
      console.log('lottery_trend:')
      console.log('  后端: [{date, count, high_tier_count, high_tier_rate}, ...]')
      console.log('  前端需要: {labels: [...], draws: [...], wins: [...], win_rate: [...]}')
    } else {
      console.log('\n❌ API返回错误:')
      console.log(JSON.stringify(chartsRes.data, null, 2))
    }
  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    process.exit(1)
  }

  console.log('\n========================================')
  console.log('✅ 测试完成')
  console.log('========================================')
}

main()
