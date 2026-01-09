#!/usr/bin/env node
/**
 * 直接查询数据库测试兑换订单数据
 * 
 * 使用方法：
 *   node test-db-orders.js
 */

const path = require('path')

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '.env') })

async function main() {
  console.log('='.repeat(60))
  console.log('🧪 数据库直接查询 - 兑换订单数据测试')
  console.log('='.repeat(60))
  
  try {
    // 加载数据库配置和模型
    const { sequelize } = require('./models')
    
    console.log('\n📌 1. 测试数据库连接...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')
    
    // 查询兑换订单表
    console.log('\n📌 2. 查询兑换订单表 (exchange_records)...')
    
    const [orders] = await sequelize.query(`
      SELECT 
        record_id,
        order_no,
        user_id,
        item_id,
        item_snapshot,
        quantity,
        pay_asset_code,
        pay_amount,
        total_cost,
        status,
        admin_remark,
        exchange_time,
        shipped_at,
        created_at,
        updated_at
      FROM exchange_records
      ORDER BY created_at DESC
      LIMIT 10
    `)
    
    console.log(`✅ 找到 ${orders.length} 条订单记录`)
    
    if (orders.length > 0) {
      console.log('\n📋 订单数据（前3条）:')
      orders.slice(0, 3).forEach((order, index) => {
        console.log(`\n--- 订单 ${index + 1} ---`)
        console.log('  record_id:', order.record_id)
        console.log('  order_no:', order.order_no)
        console.log('  user_id:', order.user_id)
        console.log('  item_id:', order.item_id)
        console.log('  item_snapshot:', typeof order.item_snapshot === 'string' 
          ? order.item_snapshot.substring(0, 100) + '...' 
          : JSON.stringify(order.item_snapshot)?.substring(0, 100))
        console.log('  quantity:', order.quantity)
        console.log('  pay_asset_code:', order.pay_asset_code)
        console.log('  pay_amount:', order.pay_amount)
        console.log('  total_cost:', order.total_cost)
        console.log('  status:', order.status)
        console.log('  admin_remark:', order.admin_remark)
        console.log('  exchange_time:', order.exchange_time)
        console.log('  created_at:', order.created_at)
      })
    } else {
      console.log('\n⚠️  数据库中没有兑换订单记录')
    }
    
    // 查询各状态订单数量
    console.log('\n📌 3. 统计各状态订单数量...')
    const [stats] = await sequelize.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM exchange_records
      GROUP BY status
    `)
    
    if (stats.length > 0) {
      console.log('📊 订单状态统计:')
      stats.forEach(stat => {
        console.log(`   - ${stat.status || 'null'}: ${stat.count}`)
      })
    } else {
      console.log('⚠️  没有订单统计数据')
    }
    
    // 查询兑换商品表
    console.log('\n📌 4. 查询兑换商品表 (exchange_items)...')
    const [items] = await sequelize.query(`
      SELECT 
        item_id,
        name,
        description,
        cost_asset_code,
        cost_amount,
        stock,
        status,
        created_at
      FROM exchange_items
      ORDER BY created_at DESC
      LIMIT 5
    `)
    
    console.log(`✅ 找到 ${items.length} 条商品记录`)
    
    if (items.length > 0) {
      console.log('\n📋 兑换商品（前3条）:')
      items.slice(0, 3).forEach((item, index) => {
        console.log(`\n--- 商品 ${index + 1} ---`)
        console.log('  item_id:', item.item_id)
        console.log('  name:', item.name)
        console.log('  description:', item.description?.substring(0, 50))
        console.log('  cost_asset_code:', item.cost_asset_code)
        console.log('  cost_amount:', item.cost_amount)
        console.log('  stock:', item.stock)
        console.log('  status:', item.status)
      })
    }
    
    // 关闭连接
    await sequelize.close()
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ 数据库测试完成')
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()

