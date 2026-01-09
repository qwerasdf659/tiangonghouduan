#!/usr/bin/env node
/**
 * 兑换市场API测试脚本
 *
 * 测试目标：验证前后端字段名对齐后的API功能
 *
 * 测试内容：
 * 1. 获取材料资产类型列表
 * 2. 创建兑换商品
 * 3. 获取商品列表
 * 4. 获取商品详情
 * 5. 更新商品
 * 6. 删除商品
 *
 * 使用方法：
 * node scripts/test-exchange-market-api.js
 *
 * @created 2026-01-09
 */

const http = require('http')

// 配置
const BASE_URL = 'http://localhost:3000'
let AUTH_TOKEN = null
let TEST_ITEM_ID = null

// 颜色输出
const colors = {
  green: text => `\x1b[32m${text}\x1b[0m`,
  red: text => `\x1b[31m${text}\x1b[0m`,
  yellow: text => `\x1b[33m${text}\x1b[0m`,
  blue: text => `\x1b[34m${text}\x1b[0m`,
  cyan: text => `\x1b[36m${text}\x1b[0m`
}

/**
 * HTTP请求封装
 */
function httpRequest(method, path, data = null) {
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

    if (AUTH_TOKEN) {
      options.headers['Authorization'] = `Bearer ${AUTH_TOKEN}`
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
 * 测试结果记录
 */
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
}

function logTest(name, passed, details = '') {
  const status = passed ? colors.green('✅ PASS') : colors.red('❌ FAIL')
  console.log(`${status} ${name}`)
  if (details) {
    console.log(`   ${colors.cyan(details)}`)
  }
  testResults.tests.push({ name, passed, details })
  if (passed) {
    testResults.passed++
  } else {
    testResults.failed++
  }
}

/**
 * 步骤1：登录获取token
 */
async function step1_login() {
  console.log('\n' + colors.blue('========== 步骤1：登录获取Token =========='))

  // 尝试使用测试账号登录
  const testAccounts = [
    { mobile: '13800138001', verification_code: '123456' },
    { mobile: '13800000001', verification_code: '888888' },
    { mobile: 'admin', verification_code: 'admin123' }
  ]

  for (const account of testAccounts) {
    try {
      const response = await httpRequest('POST', '/api/v4/auth/login', account)

      if (response.data.success && response.data.data?.token) {
        AUTH_TOKEN = response.data.data.token
        logTest('登录成功', true, `使用账号: ${account.mobile}`)
        return true
      }
    } catch (e) {
      // 继续尝试下一个账号
    }
  }

  logTest('登录失败', false, '所有测试账号均无法登录，请手动设置AUTH_TOKEN')
  console.log(colors.yellow('提示：请在脚本中手动设置AUTH_TOKEN变量'))
  return false
}

/**
 * 步骤2：获取材料资产类型列表
 */
async function step2_getAssetTypes() {
  console.log('\n' + colors.blue('========== 步骤2：获取材料资产类型列表 =========='))

  try {
    const response = await httpRequest(
      'GET',
      '/api/v4/console/material/asset-types?is_enabled=true'
    )

    if (response.data.success) {
      const assetTypes = response.data.data?.asset_types || []
      logTest('获取材料资产类型列表', true, `共${assetTypes.length}种资产类型`)

      if (assetTypes.length > 0) {
        console.log('   可用资产类型:')
        assetTypes.slice(0, 5).forEach(asset => {
          console.log(`   - ${asset.asset_code}: ${asset.display_name}`)
        })
      }
      return assetTypes
    } else {
      logTest('获取材料资产类型列表', false, response.data.message)
      return []
    }
  } catch (e) {
    logTest('获取材料资产类型列表', false, e.message)
    return []
  }
}

/**
 * 步骤3：创建兑换商品
 */
async function step3_createItem(assetCode = 'red_shard') {
  console.log('\n' + colors.blue('========== 步骤3：创建兑换商品 =========='))

  const testItem = {
    item_name: `测试商品_${Date.now()}`,
    item_description: '这是一个API测试创建的商品',
    cost_asset_code: assetCode,
    cost_amount: 10,
    cost_price: 5.0,
    stock: 100,
    sort_order: 999,
    status: 'active'
  }

  console.log('   请求数据:', JSON.stringify(testItem, null, 2))

  try {
    const response = await httpRequest(
      'POST',
      '/api/v4/console/marketplace/exchange_market/items',
      testItem
    )

    console.log('   响应状态:', response.status)
    console.log('   响应数据:', JSON.stringify(response.data, null, 2))

    if (response.data.success) {
      TEST_ITEM_ID = response.data.data?.item?.item_id || response.data.data?.item?.id
      logTest('创建兑换商品', true, `商品ID: ${TEST_ITEM_ID}`)
      return true
    } else {
      logTest('创建兑换商品', false, response.data.message)
      return false
    }
  } catch (e) {
    logTest('创建兑换商品', false, e.message)
    return false
  }
}

/**
 * 步骤4：获取商品列表
 */
async function step4_getItemList() {
  console.log('\n' + colors.blue('========== 步骤4：获取商品列表 =========='))

  try {
    const response = await httpRequest('GET', '/api/v4/shop/exchange/items?page=1&page_size=10')

    if (response.data.success) {
      const items = response.data.data?.items || []
      const pagination = response.data.data?.pagination || {}

      logTest('获取商品列表', true, `共${pagination.total || items.length}个商品`)

      if (items.length > 0) {
        console.log('   商品列表字段检查:')
        const firstItem = items[0]
        console.log(`   - id字段: ${firstItem.id !== undefined ? '✅' : '❌'}`)
        console.log(`   - name字段: ${firstItem.name !== undefined ? '✅' : '❌'}`)
        console.log(
          `   - cost_asset_code字段: ${firstItem.cost_asset_code !== undefined ? '✅' : '❌'}`
        )
        console.log(`   - cost_amount字段: ${firstItem.cost_amount !== undefined ? '✅' : '❌'}`)
        console.log(`   - stock字段: ${firstItem.stock !== undefined ? '✅' : '❌'}`)
        console.log(`   - status字段: ${firstItem.status !== undefined ? '✅' : '❌'}`)
      }
      return true
    } else {
      logTest('获取商品列表', false, response.data.message)
      return false
    }
  } catch (e) {
    logTest('获取商品列表', false, e.message)
    return false
  }
}

/**
 * 步骤5：获取商品详情
 */
async function step5_getItemDetail() {
  console.log('\n' + colors.blue('========== 步骤5：获取商品详情 =========='))

  if (!TEST_ITEM_ID) {
    logTest('获取商品详情', false, '没有可测试的商品ID')
    return false
  }

  try {
    const response = await httpRequest('GET', `/api/v4/shop/exchange/items/${TEST_ITEM_ID}`)

    console.log('   响应数据:', JSON.stringify(response.data, null, 2))

    if (response.data.success) {
      const item = response.data.data?.item
      logTest(
        '获取商品详情',
        true,
        `商品名称: ${item?.name}, 支付资产: ${item?.cost_asset_code}, 数量: ${item?.cost_amount}`
      )
      return true
    } else {
      logTest('获取商品详情', false, response.data.message)
      return false
    }
  } catch (e) {
    logTest('获取商品详情', false, e.message)
    return false
  }
}

/**
 * 步骤6：更新商品
 */
async function step6_updateItem() {
  console.log('\n' + colors.blue('========== 步骤6：更新商品 =========='))

  if (!TEST_ITEM_ID) {
    logTest('更新商品', false, '没有可测试的商品ID')
    return false
  }

  const updateData = {
    item_name: `更新后的商品_${Date.now()}`,
    item_description: '商品描述已更新',
    cost_amount: 20,
    stock: 50
  }

  console.log('   更新数据:', JSON.stringify(updateData, null, 2))

  try {
    const response = await httpRequest(
      'PUT',
      `/api/v4/console/marketplace/exchange_market/items/${TEST_ITEM_ID}`,
      updateData
    )

    console.log('   响应状态:', response.status)
    console.log('   响应数据:', JSON.stringify(response.data, null, 2))

    if (response.data.success) {
      logTest('更新商品', true, '商品更新成功')
      return true
    } else {
      logTest('更新商品', false, response.data.message)
      return false
    }
  } catch (e) {
    logTest('更新商品', false, e.message)
    return false
  }
}

/**
 * 步骤7：删除商品
 */
async function step7_deleteItem() {
  console.log('\n' + colors.blue('========== 步骤7：删除商品 =========='))

  if (!TEST_ITEM_ID) {
    logTest('删除商品', false, '没有可测试的商品ID')
    return false
  }

  try {
    const response = await httpRequest(
      'DELETE',
      `/api/v4/console/marketplace/exchange_market/items/${TEST_ITEM_ID}`
    )

    console.log('   响应状态:', response.status)
    console.log('   响应数据:', JSON.stringify(response.data, null, 2))

    if (response.data.success) {
      logTest('删除商品', true, '商品删除成功')
      return true
    } else {
      logTest('删除商品', false, response.data.message)
      return false
    }
  } catch (e) {
    logTest('删除商品', false, e.message)
    return false
  }
}

/**
 * 打印测试摘要
 */
function printSummary() {
  console.log('\n' + colors.blue('========================================'))
  console.log(colors.blue('           测试结果摘要'))
  console.log(colors.blue('========================================'))
  console.log(`总测试数: ${testResults.passed + testResults.failed}`)
  console.log(colors.green(`通过: ${testResults.passed}`))
  console.log(colors.red(`失败: ${testResults.failed}`))
  console.log('')

  if (testResults.failed > 0) {
    console.log(colors.red('失败的测试:'))
    testResults.tests
      .filter(t => !t.passed)
      .forEach(t => {
        console.log(`  - ${t.name}: ${t.details}`)
      })
  }

  console.log(colors.blue('========================================'))
}

/**
 * 主函数
 */
async function main() {
  console.log(colors.cyan('🧪 兑换市场API测试脚本'))
  console.log(colors.cyan(`目标服务器: ${BASE_URL}`))
  console.log(colors.cyan(`时间: ${new Date().toLocaleString('zh-CN')}`))

  // 检查服务器是否可访问
  try {
    const healthResponse = await httpRequest('GET', '/health')
    console.log(colors.green(`✅ 服务器健康检查: ${healthResponse.data?.status || 'OK'}`))
  } catch (e) {
    console.log(colors.red(`❌ 服务器不可访问: ${e.message}`))
    console.log(colors.yellow('请确保后端服务正在运行'))
    return
  }

  // 执行测试步骤
  const loginSuccess = await step1_login()
  if (!loginSuccess) {
    console.log(colors.yellow('\n⚠️ 跳过需要认证的测试'))
    printSummary()
    return
  }

  const assetTypes = await step2_getAssetTypes()
  const assetCode = assetTypes.length > 0 ? assetTypes[0].asset_code : 'red_shard'

  await step3_createItem(assetCode)
  await step4_getItemList()
  await step5_getItemDetail()
  await step6_updateItem()
  await step7_deleteItem()

  printSummary()
}

// 运行测试
main().catch(e => {
  console.error(colors.red('测试脚本执行失败:'), e)
  process.exit(1)
})
