// 通过线上服务验证完整链路：登录 -> 获取奖品 -> 检查 image 字段
require('dotenv').config()
const http = require('http')

/**
 * 发送 HTTP 请求
 * @param {Object} options - http.request 选项
 * @param {Object} body - 请求体
 * @returns {Promise<Object>} 响应结果
 */
function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = ''
      res.on('data', chunk => {
        data += chunk
      })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch (e) {
          resolve({ status: res.statusCode, data: data.substring(0, 500) })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

;(async () => {
  // 1. 先用 quick-login 获取 token
  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v4/auth/quick-login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { phone: '13800138000' }
  )

  let token
  if (loginRes.data.success === false) {
    console.log('Login failed:', JSON.stringify(loginRes.data))
    // 尝试普通登录
    const loginRes2 = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/v4/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { phone: '13800138000', password: '123456' }
    )

    if (loginRes2.data.success === false) {
      console.log('Login2 failed:', JSON.stringify(loginRes2.data))
      process.exit(1)
    }
    token = loginRes2.data.data.access_token || loginRes2.data.data.token
  } else {
    token = loginRes.data.data.access_token || loginRes.data.data.token
  }

  console.log('Token obtained:', token ? 'YES' : 'NO')

  // 2. 获取奖品列表
  const prizesRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v4/lottery/campaigns/CAMP20250901001/prizes',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token }
  })

  if (prizesRes.data.success === false) {
    console.log('Prizes API failed:', JSON.stringify(prizesRes.data))
    process.exit(1)
  }

  const prizes = prizesRes.data.data || []
  console.log('\n=== LIVE API RESPONSE (what frontend actually receives) ===')
  prizes.forEach((p, i) => {
    console.log(
      JSON.stringify({
        idx: i,
        name: p.prize_name,
        image: p.image || 'MISSING',
        material_asset_code: p.material_asset_code || null
      })
    )
  })
  console.log('\nTotal:', prizes.length)

  process.exit(0)
})().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
