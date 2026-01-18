#!/usr/bin/env node
/**
 * 创建测试兑换订单数据
 *
 * 使用方法：
 *   node seed-test-exchange-orders.js
 */

const path = require('path')

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '.env') })

/**
 * 生成订单号
 * @returns {string} 订单号
 */
function _generateOrderNo() {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')
  return `EX${timestamp}${random}`
}

/**
 * 主函数 - 创建测试兑换订单数据
 * @returns {Promise<void>} 无返回值
 */
async function main() {
  console.log('='.repeat(60))
  console.log('🌱 创建测试兑换订单数据')
  console.log('='.repeat(60))

  try {
    // 加载数据库配置和模型
    const { sequelize } = require('./models')

    console.log('\n📌 1. 测试数据库连接...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 查询可用的兑换商品
    console.log('\n📌 2. 查询可用的兑换商品...')
    const [items] = await sequelize.query(`
      SELECT item_id, name, description, cost_asset_code, cost_amount, stock
      FROM exchange_items
      WHERE status = 'active' AND stock > 0
      LIMIT 3
    `)

    if (items.length === 0) {
      console.log('⚠️  没有可用的兑换商品，无法创建订单')
      await sequelize.close()
      return
    }

    console.log(`✅ 找到 ${items.length} 个可用商品`)

    // 查询测试用户
    console.log('\n📌 3. 查询测试用户...')
    const [users] = await sequelize.query(`
      SELECT user_id, nickname
      FROM users
      LIMIT 5
    `)

    if (users.length === 0) {
      console.log('⚠️  没有用户数据，无法创建订单')
      await sequelize.close()
      return
    }

    console.log(`✅ 找到 ${users.length} 个用户`)

    // 创建测试订单
    console.log('\n📌 4. 创建测试订单...')

    const statuses = ['pending', 'completed', 'shipped', 'cancelled']
    const ordersToCreate = []

    for (let i = 0; i < 6; i++) {
      const item = items[i % items.length]
      const user = users[i % users.length]
      const status = statuses[i % statuses.length]
      const quantity = Math.floor(Math.random() * 3) + 1
      const payAmount = parseInt(item.cost_amount) * quantity

      // 确保 item_id 是整数
      const itemId = parseInt(item.item_id)

      const itemSnapshot = JSON.stringify({
        item_id: itemId,
        name: item.name,
        description: item.description,
        cost_asset_code: item.cost_asset_code,
        cost_amount: parseInt(item.cost_amount)
      })

      // 每个订单号添加序号确保唯一
      const timestamp = Date.now()
      const orderNo = `EX${timestamp}${i.toString().padStart(4, '0')}`
      const idempotencyKey = `test_idem_${timestamp}_${i}`
      const businessId = `test_biz_${timestamp}_${i}`

      ordersToCreate.push({
        order_no: orderNo,
        user_id: parseInt(user.user_id),
        item_id: itemId,
        item_snapshot: itemSnapshot,
        quantity,
        pay_asset_code: item.cost_asset_code,
        pay_amount: payAmount,
        total_cost: payAmount * 0.1, // 模拟成本
        status,
        admin_remark: status === 'cancelled' ? '测试取消订单' : null,
        exchange_time: new Date().toISOString(),
        shipped_at: status === 'shipped' ? new Date().toISOString() : null,
        idempotency_key: idempotencyKey,
        business_id: businessId,
        debit_transaction_id: 0 // 测试数据，使用0表示无实际扣款事务
      })
    }

    // 插入订单（测试数据脚本，顺序插入）
    for (const order of ordersToCreate) {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(
        `
        INSERT INTO exchange_records 
          (order_no, user_id, item_id, item_snapshot, quantity, pay_asset_code, pay_amount, total_cost, status, admin_remark, exchange_time, shipped_at, idempotency_key, business_id, debit_transaction_id, created_at, updated_at)
        VALUES 
          (:order_no, :user_id, :item_id, :item_snapshot, :quantity, :pay_asset_code, :pay_amount, :total_cost, :status, :admin_remark, :exchange_time, :shipped_at, :idempotency_key, :business_id, :debit_transaction_id, NOW(), NOW())
      `,
        {
          replacements: order
        }
      )
      console.log(`   ✅ 创建订单: ${order.order_no} (${order.status})`)
    }

    console.log(`\n✅ 成功创建 ${ordersToCreate.length} 个测试订单`)

    // 验证订单数量
    console.log('\n📌 5. 验证订单数据...')
    const [countResult] = await sequelize.query(`
      SELECT status, COUNT(*) as count
      FROM exchange_records
      GROUP BY status
    `)

    console.log('📊 订单统计:')
    countResult.forEach(stat => {
      console.log(`   - ${stat.status}: ${stat.count}`)
    })

    // 关闭连接
    await sequelize.close()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 测试数据创建完成')
    console.log('   现在可以刷新Web管理页面查看订单数据')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 创建失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
