#!/usr/bin/env node
/**
 * 兑换市场订单API测试脚本
 * 
 * 测试后端API是否正常工作，验证数据库连接和业务逻辑
 * 
 * 使用方法：
 *   node test-exchange-orders-api.js
 */

const http = require('http')

// 配置
const BASE_URL = 'http://localhost:3000'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '' // 需要设置管理员token

/**
 * 发起HTTP请求
 */
function makeRequest(method, path, data = null, token = null) {
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
    
    const req = http.request(options, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
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

/**
 * 管理员登录获取token
 */
async function adminLogin() {
  console.log('\n📌 1. 尝试管理员登录获取Token...')
  
  // 尝试使用测试账号登录
  const loginData = {
    mobile: '13800138000',  // 测试管理员账号
    password: 'admin123'
  }
  
  try {
    const result = await makeRequest('POST', '/api/v4/auth/login', loginData)
    
    if (result.status === 200 && result.data.success) {
      console.log('✅ 管理员登录成功')
      console.log('   用户信息:', result.data.data.user?.nickname || result.data.data.user?.user_id)
      return result.data.data.token
    } else {
      console.log('⚠️  登录失败:', result.data.message || '未知错误')
      console.log('   将使用环境变量 ADMIN_TOKEN')
      return ADMIN_TOKEN
    }
  } catch (error) {
    console.log('⚠️  登录请求失败:', error.message)
    console.log('   将使用环境变量 ADMIN_TOKEN')
    return ADMIN_TOKEN
  }
}

/**
 * 测试获取订单列表
 */
async function testGetOrders(token) {
  console.log('\n📌 2. 测试获取兑换订单列表 API...')
  console.log('   GET /api/v4/console/marketplace/exchange_market/orders')
  
  try {
    const result = await makeRequest('GET', '/api/v4/console/marketplace/exchange_market/orders?page=1&page_size=10', null, token)
    
    console.log('   HTTP状态码:', result.status)
    console.log('   API响应:', JSON.stringify(result.data, null, 2).substring(0, 500))
    
    if (result.status === 200 && result.data.success) {
      console.log('✅ 获取订单列表成功')
      
      const orders = result.data.data?.orders || []
      console.log(`   订单数量: ${orders.length}`)
      
      if (orders.length > 0) {
        console.log('\n📋 订单列表示例（第一条）:')
        const firstOrder = orders[0]
        console.log('   - order_no:', firstOrder.order_no)
        console.log('   - user_id:', firstOrder.user_id)
        console.log('   - item_snapshot:', firstOrder.item_snapshot?.name || '无')
        console.log('   - quantity:', firstOrder.quantity)
        console.log('   - pay_asset_code:', firstOrder.pay_asset_code)
        console.log('   - pay_amount:', firstOrder.pay_amount)
        console.log('   - status:', firstOrder.status)
        console.log('   - exchange_time:', firstOrder.exchange_time)
        console.log('   - created_at:', firstOrder.created_at)
      }
      
      const pagination = result.data.data?.pagination
      if (pagination) {
        console.log('\n📊 分页信息:')
        console.log('   - total:', pagination.total)
        console.log('   - page:', pagination.page)
        console.log('   - page_size:', pagination.page_size)
        console.log('   - total_pages:', pagination.total_pages)
      }
      
      return orders
    } else {
      console.log('❌ 获取订单列表失败')
      console.log('   错误信息:', result.data.message)
      return []
    }
  } catch (error) {
    console.log('❌ 请求失败:', error.message)
    return []
  }
}

/**
 * 测试获取订单详情
 */
async function testGetOrderDetail(token, orderNo) {
  console.log('\n📌 3. 测试获取订单详情 API...')
  console.log(`   GET /api/v4/console/marketplace/exchange_market/orders/${orderNo}`)
  
  try {
    const result = await makeRequest('GET', `/api/v4/console/marketplace/exchange_market/orders/${orderNo}`, null, token)
    
    console.log('   HTTP状态码:', result.status)
    
    if (result.status === 200 && result.data.success) {
      console.log('✅ 获取订单详情成功')
      
      const order = result.data.data?.order
      if (order) {
        console.log('\n📋 订单详情:')
        console.log('   - record_id:', order.record_id)
        console.log('   - order_no:', order.order_no)
        console.log('   - user_id:', order.user_id)
        console.log('   - item_id:', order.item_id)
        console.log('   - item_snapshot:', JSON.stringify(order.item_snapshot))
        console.log('   - quantity:', order.quantity)
        console.log('   - pay_asset_code:', order.pay_asset_code)
        console.log('   - pay_amount:', order.pay_amount)
        console.log('   - total_cost:', order.total_cost)
        console.log('   - status:', order.status)
        console.log('   - admin_remark:', order.admin_remark)
        console.log('   - exchange_time:', order.exchange_time)
        console.log('   - shipped_at:', order.shipped_at)
        console.log('   - created_at:', order.created_at)
      }
      
      return order
    } else {
      console.log('❌ 获取订单详情失败')
      console.log('   错误信息:', result.data.message)
      return null
    }
  } catch (error) {
    console.log('❌ 请求失败:', error.message)
    return null
  }
}

/**
 * 测试健康检查
 */
async function testHealthCheck() {
  console.log('\n📌 0. 测试服务健康检查...')
  console.log('   GET /health')
  
  try {
    const result = await makeRequest('GET', '/health')
    
    console.log('   HTTP状态码:', result.status)
    
    if (result.status === 200) {
      console.log('✅ 服务健康检查通过')
      console.log('   响应:', JSON.stringify(result.data, null, 2).substring(0, 300))
      return true
    } else {
      console.log('❌ 服务健康检查失败')
      return false
    }
  } catch (error) {
    console.log('❌ 服务未启动或连接失败:', error.message)
    return false
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('='.repeat(60))
  console.log('🧪 兑换市场订单API测试')
  console.log('='.repeat(60))
  
  // 0. 健康检查
  const isHealthy = await testHealthCheck()
  if (!isHealthy) {
    console.log('\n⚠️  服务未启动，请先启动服务后再运行测试')
    console.log('   启动命令: npm start 或 pm2 start ecosystem.config.js')
    process.exit(1)
  }
  
  // 1. 获取管理员token
  const token = await adminLogin()
  if (!token) {
    console.log('\n⚠️  没有有效的管理员Token，无法继续测试')
    console.log('   请设置环境变量: export ADMIN_TOKEN=your_token')
    process.exit(1)
  }
  
  // 2. 测试获取订单列表
  const orders = await testGetOrders(token)
  
  // 3. 如果有订单，测试获取详情
  if (orders.length > 0) {
    await testGetOrderDetail(token, orders[0].order_no)
  } else {
    console.log('\n⚠️  没有订单数据，跳过详情测试')
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('✅ 测试完成')
  console.log('='.repeat(60))
}

// 运行测试
main().catch(console.error)

