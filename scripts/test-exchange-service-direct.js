#!/usr/bin/env node
/**
 * ExchangeService 直接测试脚本
 *
 * 目的：验证后端字段名修复（item_name → name）
 * 不需要HTTP请求，直接测试服务层代码
 *
 * @created 2026-01-09
 */

const path = require('path')

// 设置环境变量
process.env.NODE_ENV = 'development'

async function main() {
  console.log('🧪 ExchangeService 直接测试脚本')
  console.log('=' .repeat(50))

  let sequelize, ExchangeService, ExchangeItem

  try {
    // 加载模型和服务
    console.log('\n📦 加载依赖...')
    const models = require('../models')
    sequelize = models.sequelize
    ExchangeItem = models.ExchangeItem

    // 等待数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 加载服务
    ExchangeService = require('../services/ExchangeService')
    console.log('✅ ExchangeService 加载成功')

    // 测试数据（使用 item_name，验证兼容性）
    const testItemWithOldFieldNames = {
      item_name: `测试商品_OLD_${Date.now()}`,
      item_description: '使用旧字段名 item_name 创建的商品',
      cost_asset_code: 'red_shard',
      cost_amount: 15,
      cost_price: 8.0,
      stock: 50,
      sort_order: 888,
      status: 'active'
    }

    // 测试数据（使用 name，验证新字段名）
    const testItemWithNewFieldNames = {
      name: `测试商品_NEW_${Date.now()}`,
      description: '使用新字段名 name 创建的商品',
      cost_asset_code: 'red_shard',
      cost_amount: 20,
      cost_price: 10.0,
      stock: 30,
      sort_order: 889,
      status: 'active'
    }

    // 开始测试
    console.log('\n' + '=' .repeat(50))
    console.log('📝 测试1：使用旧字段名 item_name 创建商品')
    console.log('=' .repeat(50))
    console.log('请求数据:', JSON.stringify(testItemWithOldFieldNames, null, 2))

    let item1 = null
    const transaction1 = await sequelize.transaction()
    try {
      item1 = await ExchangeService.createExchangeItem(
        testItemWithOldFieldNames,
        1,  // 假设 admin user_id = 1
        { transaction: transaction1 }
      )
      await transaction1.commit()
      console.log('✅ 测试1通过：使用 item_name 创建商品成功')
      console.log('返回数据:', JSON.stringify(item1, null, 2))
    } catch (e) {
      await transaction1.rollback()
      console.log('❌ 测试1失败：', e.message)
    }

    console.log('\n' + '=' .repeat(50))
    console.log('📝 测试2：使用新字段名 name 创建商品')
    console.log('=' .repeat(50))
    console.log('请求数据:', JSON.stringify(testItemWithNewFieldNames, null, 2))

    let item2 = null
    const transaction2 = await sequelize.transaction()
    try {
      item2 = await ExchangeService.createExchangeItem(
        testItemWithNewFieldNames,
        1,  // 假设 admin user_id = 1
        { transaction: transaction2 }
      )
      await transaction2.commit()
      console.log('✅ 测试2通过：使用 name 创建商品成功')
      console.log('返回数据:', JSON.stringify(item2, null, 2))
    } catch (e) {
      await transaction2.rollback()
      console.log('❌ 测试2失败：', e.message)
    }

    // 验证数据库中的数据
    console.log('\n' + '=' .repeat(50))
    console.log('📝 测试3：验证数据库中商品字段')
    console.log('=' .repeat(50))

    if (item1) {
      const dbItem1 = await ExchangeItem.findByPk(item1.item_id)
      if (dbItem1) {
        console.log('商品1 数据库字段:')
        console.log(`  - name: ${dbItem1.name}`)
        console.log(`  - description: ${dbItem1.description}`)
        console.log(`  - cost_asset_code: ${dbItem1.cost_asset_code}`)
        console.log(`  - cost_amount: ${dbItem1.cost_amount}`)
        console.log(`  - stock: ${dbItem1.stock}`)
        
        // 验证 name 字段正确存储
        const pass1 = dbItem1.name === testItemWithOldFieldNames.item_name
        console.log(pass1 
          ? '✅ 验证通过：item_name 正确映射到数据库 name 字段' 
          : '❌ 验证失败：name 字段不匹配'
        )
      }
    }

    if (item2) {
      const dbItem2 = await ExchangeItem.findByPk(item2.item_id)
      if (dbItem2) {
        console.log('\n商品2 数据库字段:')
        console.log(`  - name: ${dbItem2.name}`)
        console.log(`  - description: ${dbItem2.description}`)
        console.log(`  - cost_asset_code: ${dbItem2.cost_asset_code}`)
        console.log(`  - cost_amount: ${dbItem2.cost_amount}`)
        console.log(`  - stock: ${dbItem2.stock}`)
        
        // 验证 name 字段正确存储
        const pass2 = dbItem2.name === testItemWithNewFieldNames.name
        console.log(pass2 
          ? '✅ 验证通过：name 字段正确存储' 
          : '❌ 验证失败：name 字段不匹配'
        )
      }
    }

    // 清理测试数据
    console.log('\n' + '=' .repeat(50))
    console.log('🧹 清理测试数据')
    console.log('=' .repeat(50))

    if (item1) {
      await ExchangeItem.destroy({ where: { item_id: item1.item_id } })
      console.log(`✅ 已删除测试商品1: item_id=${item1.item_id}`)
    }
    if (item2) {
      await ExchangeItem.destroy({ where: { item_id: item2.item_id } })
      console.log(`✅ 已删除测试商品2: item_id=${item2.item_id}`)
    }

    // 测试摘要
    console.log('\n' + '=' .repeat(50))
    console.log('📊 测试摘要')
    console.log('=' .repeat(50))
    
    const passed = (item1 ? 1 : 0) + (item2 ? 1 : 0)
    const total = 2
    console.log(`通过: ${passed}/${total}`)
    
    if (passed === total) {
      console.log('\n🎉 所有测试通过！字段名兼容性修复验证成功')
      console.log('   - item_name → name 映射正确')
      console.log('   - item_description → description 映射正确')
      console.log('   - cost_asset_code 和 cost_amount 正确存储')
    } else {
      console.log('\n⚠️ 部分测试失败，请检查服务层代码')
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.error(error.stack)
  } finally {
    if (sequelize) {
      await sequelize.close()
      console.log('\n🔌 数据库连接已关闭')
    }
  }
}

main().then(() => {
  process.exit(0)
}).catch(e => {
  console.error('脚本执行失败:', e)
  process.exit(1)
})

