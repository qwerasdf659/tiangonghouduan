/**
 * 测试 marketplace-stats API
 *
 * 用于验证 /api/v4/console/marketplace/listing-stats 接口
 *
 * 使用方法:
 *   node test-marketplace-stats.js
 */

const http = require('http')

// 配置
const BASE_URL = 'http://localhost:3000'

/**
 * 发送HTTP请求
 */
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }

    const req = http.request(options, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          })
        } catch {
          resolve({
            status: res.statusCode,
            data: data
          })
        }
      })
    })

    req.on('error', reject)

    if (body) {
      req.write(JSON.stringify(body))
    }

    req.end()
  })
}

/**
 * 管理员登录获取token
 *
 * 管理员登录接口: POST /api/v4/console/auth/login
 * 需要 mobile + verification_code
 *
 * 也可以使用普通登录接口: POST /api/v4/auth/login
 * 需要 mobile + verification_code
 */
async function adminLogin() {
  console.log('\n📋 步骤1: 管理员登录获取token...')

  // 使用管理员控制台登录接口
  // 验证码登录 - 使用测试验证码 "123456" 或 "000000"
  const testMobiles = ['13800138001', '18888888888', '13000000001']
  const testCodes = ['123456', '000000', '1234']

  for (const mobile of testMobiles) {
    for (const code of testCodes) {
      try {
        const loginResult = await request('POST', '/api/v4/console/auth/login', {
          mobile: mobile,
          verification_code: code
        })

        if (loginResult.data.success && loginResult.data.data?.token) {
          console.log(`✅ 管理员登录成功 (手机: ${mobile})`)
          return loginResult.data.data.token
        }
      } catch (e) {
        // 继续尝试
      }
    }
  }

  // 尝试普通登录
  for (const mobile of testMobiles) {
    for (const code of testCodes) {
      try {
        const loginResult = await request('POST', '/api/v4/auth/login', {
          mobile: mobile,
          verification_code: code
        })

        if (loginResult.data.success && loginResult.data.data?.token) {
          console.log(`✅ 登录成功 (手机: ${mobile})`)
          return loginResult.data.data.token
        }
      } catch (e) {
        // 继续尝试
      }
    }
  }

  console.log('❌ 登录失败 - 无法获取有效token')
  console.log('💡 请手动提供有效的admin_token')
  return null
}

/**
 * 测试用户上架统计接口
 */
async function testListingStats(token) {
  console.log('\n📋 步骤2: 测试 /api/v4/console/marketplace/listing-stats 接口...')

  const result = await request(
    'GET',
    '/api/v4/console/marketplace/listing-stats?page=1&limit=20&filter=all',
    null,
    { Authorization: `Bearer ${token}` }
  )

  console.log('\n🔍 API响应状态:', result.status)
  console.log('📄 API响应数据:')
  console.log(JSON.stringify(result.data, null, 2))

  if (result.data.success) {
    console.log('\n✅ API调用成功!')
    console.log('\n📊 数据分析:')
    console.log('   - summary字段:', Object.keys(result.data.data?.summary || {}))
    console.log('   - stats数量:', result.data.data?.stats?.length || 0)
    console.log('   - pagination字段:', Object.keys(result.data.data?.pagination || {}))

    if (result.data.data?.stats?.length > 0) {
      console.log('\n📝 第一条stats数据字段:', Object.keys(result.data.data.stats[0]))
      console.log('   - 示例数据:', result.data.data.stats[0])
    }
  } else {
    console.log('\n❌ API调用失败:', result.data.message)
  }

  return result
}

/**
 * 检查数据库是否有挂牌数据
 */
async function checkDatabaseData(token) {
  console.log('\n📋 步骤3: 检查数据库MarketListing表数据...')

  // 尝试查询C2C交易订单来间接确认是否有挂牌
  const result = await request(
    'GET',
    '/api/v4/console/marketplace/trade_orders?page=1&page_size=10',
    null,
    { Authorization: `Bearer ${token}` }
  )

  console.log('🔍 C2C交易订单查询结果:')
  console.log('   - 状态:', result.status)
  console.log('   - 成功:', result.data.success)
  console.log('   - 订单数量:', result.data.data?.orders?.length || 0)

  return result
}

/**
 * 主测试流程
 */
async function main() {
  console.log('='.repeat(60))
  console.log('🧪 marketplace-stats API 测试')
  console.log('='.repeat(60))

  try {
    // 1. 管理员登录
    const token = await adminLogin()
    if (!token) {
      console.log('\n⚠️ 无法获取管理员token，测试终止')
      console.log('💡 请确保后端服务正在运行，且有有效的管理员账号')
      return
    }

    // 2. 测试listing-stats接口
    const statsResult = await testListingStats(token)

    // 3. 检查数据库数据
    await checkDatabaseData(token)

    // 4. 总结
    console.log('\n' + '='.repeat(60))
    console.log('📊 测试总结')
    console.log('='.repeat(60))

    if (statsResult.data.success) {
      const summary = statsResult.data.data?.summary || {}
      const stats = statsResult.data.data?.stats || []

      console.log('\n📌 用户上架统计数据:')
      console.log(`   - 有上架商品的用户数: ${summary.total_users_with_listings || 0}`)
      console.log(`   - 接近上限用户数: ${summary.users_near_limit || 0}`)
      console.log(`   - 达到上限用户数: ${summary.users_at_limit || 0}`)
      console.log(`   - 当前页用户数: ${stats.length}`)

      if (summary.total_users_with_listings === 0) {
        console.log('\n💡 数据为空的可能原因:')
        console.log('   1. MarketListing表中没有status="on_sale"的记录')
        console.log('   2. 需要用户先创建挂牌才会有统计数据')
        console.log('   3. 这是正常情况 - 如果没有用户上架商品')
      }
    }

    console.log('\n✅ 测试完成')
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.error(error.stack)
  }
}

main()
