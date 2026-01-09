#!/usr/bin/env node
/**
 * 兑换市场管理后台API测试脚本
 *
 * 测试接口：
 * 1. GET /api/v4/console/marketplace/exchange_market/items - 商品列表
 * 2. GET /api/v4/console/marketplace/exchange_market/statistics - 统计数据
 * 3. POST /api/v4/console/marketplace/exchange_market/items - 创建商品
 * 4. GET /api/v4/console/marketplace/exchange_market/items/:item_id - 商品详情
 * 5. PUT /api/v4/console/marketplace/exchange_market/items/:item_id - 更新商品
 * 6. DELETE /api/v4/console/marketplace/exchange_market/items/:item_id - 删除商品
 *
 * 使用方法：
 * node scripts/test_exchange_market_admin_api.js
 *
 * @created 2026-01-09
 */

const http = require('http')

// 配置
const BASE_URL = 'http://localhost:3000'
const API_PREFIX = '/api/v4/console/marketplace'

// 测试用管理员token（需要从登录接口获取）
let ADMIN_TOKEN = ''

// 测试数据
let createdItemId = null

/**
 * 发送HTTP请求
 */
function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path)

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_TOKEN}`
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

/**
 * 管理员登录获取token
 */
async function adminLogin() {
  console.log('\n🔐 管理员登录...')

  try {
    const result = await request('POST', '/api/v4/auth/login', {
      mobile: '13800000001', // 测试管理员账号
      password: 'admin123'
    })

    if (result.data.success && result.data.data?.token) {
      ADMIN_TOKEN = result.data.data.token
      console.log('✅ 登录成功')
      return true
    } else {
      console.log('❌ 登录失败:', result.data.message || '未知错误')
      console.log('   请确保测试管理员账号存在且密码正确')
      return false
    }
  } catch (error) {
    console.log('❌ 登录请求失败:', error.message)
    return false
  }
}

/**
 * 测试1: 获取商品列表
 */
async function testGetItems() {
  console.log('\n📋 测试1: 获取商品列表')
  console.log('   GET /api/v4/console/marketplace/exchange_market/items')

  try {
    const result = await request('GET', `${API_PREFIX}/exchange_market/items?page=1&page_size=10`)

    if (result.data.success) {
      const items = result.data.data?.items || []
      const pagination = result.data.data?.pagination || {}

      console.log(`✅ 成功获取商品列表`)
      console.log(`   总数: ${pagination.total || 0}`)
      console.log(`   当前页: ${pagination.page || 1}`)
      console.log(`   返回数量: ${items.length}`)

      if (items.length > 0) {
        console.log('   示例商品:')
        const sample = items[0]
        console.log(`     - ID: ${sample.item_id}`)
        console.log(`     - 名称: ${sample.name}`)
        console.log(`     - 资产: ${sample.cost_asset_code}`)
        console.log(`     - 数量: ${sample.cost_amount}`)
        console.log(`     - 库存: ${sample.stock}`)
        console.log(`     - 状态: ${sample.status}`)
      }

      return true
    } else {
      console.log('❌ 获取失败:', result.data.message)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error.message)
    return false
  }
}

/**
 * 测试2: 获取统计数据
 */
async function testGetStatistics() {
  console.log('\n📊 测试2: 获取统计数据')
  console.log('   GET /api/v4/console/marketplace/exchange_market/statistics')

  try {
    const result = await request('GET', `${API_PREFIX}/exchange_market/statistics`)

    if (result.data.success) {
      const stats = result.data.data || {}

      console.log('✅ 成功获取统计数据')
      console.log(`   商品总数: ${stats.total_items || 0}`)
      console.log(`   上架商品: ${stats.active_items || 0}`)
      console.log(`   库存预警: ${stats.low_stock_items || 0}`)
      console.log(`   总兑换数: ${stats.total_exchanges || 0}`)

      return true
    } else {
      console.log('❌ 获取失败:', result.data.message)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error.message)
    return false
  }
}

/**
 * 测试3: 创建商品
 */
async function testCreateItem() {
  console.log('\n➕ 测试3: 创建商品')
  console.log('   POST /api/v4/console/marketplace/exchange_market/items')

  const testItem = {
    item_name: `测试商品_${Date.now()}`,
    item_description: '这是一个测试商品',
    cost_asset_code: 'red_shard',
    cost_amount: 10,
    cost_price: 5.0,
    stock: 100,
    sort_order: 100,
    status: 'active'
  }

  try {
    const result = await request('POST', `${API_PREFIX}/exchange_market/items`, testItem)

    if (result.data.success) {
      const item = result.data.data?.item || {}
      createdItemId = item.item_id

      console.log('✅ 成功创建商品')
      console.log(`   商品ID: ${createdItemId}`)
      console.log(`   名称: ${item.name}`)
      console.log(`   资产: ${item.cost_asset_code}`)
      console.log(`   数量: ${item.cost_amount}`)

      return true
    } else {
      console.log('❌ 创建失败:', result.data.message)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error.message)
    return false
  }
}

/**
 * 测试4: 获取商品详情
 */
async function testGetItemDetail() {
  if (!createdItemId) {
    console.log('\n⏭️ 跳过测试4: 没有可用的商品ID')
    return false
  }

  console.log('\n🔍 测试4: 获取商品详情')
  console.log(`   GET /api/v4/console/marketplace/exchange_market/items/${createdItemId}`)

  try {
    const result = await request('GET', `${API_PREFIX}/exchange_market/items/${createdItemId}`)

    if (result.data.success) {
      const item = result.data.data?.item || {}

      console.log('✅ 成功获取商品详情')
      console.log(`   商品ID: ${item.item_id}`)
      console.log(`   名称: ${item.name}`)
      console.log(`   描述: ${item.description || '无'}`)
      console.log(`   资产: ${item.cost_asset_code}`)
      console.log(`   数量: ${item.cost_amount}`)
      console.log(`   成本价: ${item.cost_price}`)
      console.log(`   库存: ${item.stock}`)
      console.log(`   状态: ${item.status}`)

      return true
    } else {
      console.log('❌ 获取失败:', result.data.message)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error.message)
    return false
  }
}

/**
 * 测试5: 更新商品
 */
async function testUpdateItem() {
  if (!createdItemId) {
    console.log('\n⏭️ 跳过测试5: 没有可用的商品ID')
    return false
  }

  console.log('\n✏️ 测试5: 更新商品')
  console.log(`   PUT /api/v4/console/marketplace/exchange_market/items/${createdItemId}`)

  const updateData = {
    item_name: `更新后的商品_${Date.now()}`,
    item_description: '这是更新后的描述',
    cost_amount: 20,
    stock: 50,
    status: 'inactive'
  }

  try {
    const result = await request(
      'PUT',
      `${API_PREFIX}/exchange_market/items/${createdItemId}`,
      updateData
    )

    if (result.data.success) {
      const item = result.data.data?.item || result.data.data || {}

      console.log('✅ 成功更新商品')
      console.log(`   新名称: ${item.item_name || item.name}`)
      console.log(`   新数量: ${item.cost_amount}`)
      console.log(`   新库存: ${item.stock}`)
      console.log(`   新状态: ${item.status}`)

      return true
    } else {
      console.log('❌ 更新失败:', result.data.message)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error.message)
    return false
  }
}

/**
 * 测试6: 删除商品
 */
async function testDeleteItem() {
  if (!createdItemId) {
    console.log('\n⏭️ 跳过测试6: 没有可用的商品ID')
    return false
  }

  console.log('\n🗑️ 测试6: 删除商品')
  console.log(`   DELETE /api/v4/console/marketplace/exchange_market/items/${createdItemId}`)

  try {
    const result = await request('DELETE', `${API_PREFIX}/exchange_market/items/${createdItemId}`)

    if (result.data.success) {
      console.log('✅ 成功删除商品')
      console.log(`   操作: ${result.data.data?.action || 'deleted'}`)
      console.log(`   消息: ${result.data.message}`)

      return true
    } else {
      console.log('❌ 删除失败:', result.data.message)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error.message)
    return false
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60))
  console.log('🧪 兑换市场管理后台API测试')
  console.log('='.repeat(60))

  // 登录获取token
  const loginSuccess = await adminLogin()
  if (!loginSuccess) {
    console.log('\n⚠️ 无法登录，使用无token模式测试（可能会失败）')
  }

  // 运行测试
  const results = {
    getItems: await testGetItems(),
    getStatistics: await testGetStatistics(),
    createItem: await testCreateItem(),
    getItemDetail: await testGetItemDetail(),
    updateItem: await testUpdateItem(),
    deleteItem: await testDeleteItem()
  }

  // 汇总结果
  console.log('\n' + '='.repeat(60))
  console.log('📊 测试结果汇总')
  console.log('='.repeat(60))

  const passed = Object.values(results).filter(r => r).length
  const total = Object.keys(results).length

  Object.entries(results).forEach(([name, result]) => {
    console.log(`   ${result ? '✅' : '❌'} ${name}`)
  })

  console.log(`\n   通过: ${passed}/${total}`)
  console.log('='.repeat(60))

  process.exit(passed === total ? 0 : 1)
}

main().catch(console.error)
