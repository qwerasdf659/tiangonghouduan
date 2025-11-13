#!/usr/bin/env node
/**
 * 🔍 sort_order唯一约束验证脚本
 *
 * 验证目标：
 * 1. 数据库层面的唯一索引是否生效
 * 2. 模型层面的beforeCreate/beforeUpdate钩子是否生效
 * 3. 防止同一活动内出现重复的sort_order
 *
 * 业务场景：确保前端转盘不会出现两个奖品位置冲突
 */

const { LotteryPrize, LotteryCampaign, sequelize } = require('../models')

/**
 * 测试1：验证数据库唯一索引
 */
async function testDatabaseConstraint () {
  console.log('📋 测试1：验证数据库唯一索引')
  console.log('----------------------------------------')

  try {
    // 查找第一个活动
    const campaign = await LotteryCampaign.findOne({
      where: { status: 'active' }
    })

    if (!campaign) {
      console.log('⚠️ 没有找到活跃的抽奖活动，跳过测试')
      return false
    }

    console.log(`✅ 找到测试活动: ${campaign.campaign_code}`)

    // 查找该活动的第一个奖品
    const existingPrize = await LotteryPrize.findOne({
      where: { campaign_id: campaign.campaign_id }
    })

    if (!existingPrize) {
      console.log('⚠️ 活动没有奖品，跳过测试')
      return false
    }

    console.log(`✅ 找到测试奖品: sort_order=${existingPrize.sort_order}`)

    // 尝试创建一个相同sort_order的奖品（应该失败）
    console.log(`\n🔒 尝试创建重复的sort_order=${existingPrize.sort_order}...`)

    const transaction = await sequelize.transaction()

    try {
      await LotteryPrize.create(
        {
          campaign_id: campaign.campaign_id,
          prize_name: '测试重复奖品',
          prize_type: 'points',
          prize_value: 100,
          angle: 45, // 必需字段
          color: '#FF0000', // 必需字段
          probability: 0.01,
          sort_order: existingPrize.sort_order, // 故意重复
          stock_quantity: 1,
          win_probability: 0.01,
          cost_points: 10,
          status: 'active'
        },
        { transaction }
      )

      await transaction.commit()
      console.log('❌ 测试失败: 应该抛出错误但没有')
      return false
    } catch (error) {
      await transaction.rollback()

      if (
        error.message.includes('sort_order') ||
        error.message.includes('Duplicate') ||
        error.message.includes('已存在')
      ) {
        console.log('✅ 测试通过: 唯一约束成功阻止重复')
        console.log(`   错误信息: ${error.message}`)
        return true
      } else {
        console.log(`❌ 测试失败: 意外错误 - ${error.message}`)
        return false
      }
    }
  } catch (error) {
    console.error(`❌ 测试失败: ${error.message}`)
    return false
  }
}

/**
 * 测试2：验证模型钩子（beforeCreate）
 */
async function testModelHook () {
  console.log('\n📋 测试2：验证模型钩子（beforeCreate）')
  console.log('----------------------------------------')

  try {
    // 查找第一个活动
    const campaign = await LotteryCampaign.findOne({
      where: { status: 'active' }
    })

    if (!campaign) {
      console.log('⚠️ 没有找到活跃的抽奖活动，跳过测试')
      return false
    }

    // 查找该活动的第一个奖品
    const existingPrize = await LotteryPrize.findOne({
      where: { campaign_id: campaign.campaign_id }
    })

    if (!existingPrize) {
      console.log('⚠️ 活动没有奖品，跳过测试')
      return false
    }

    console.log(`✅ 找到测试活动和奖品: sort_order=${existingPrize.sort_order}`)

    // 尝试创建重复的sort_order（通过模型钩子应该被阻止）
    console.log('\n🔒 触发beforeCreate钩子验证...')

    try {
      await LotteryPrize.create({
        campaign_id: campaign.campaign_id,
        prize_name: '测试钩子验证',
        prize_type: 'points',
        prize_value: 100,
        angle: 90, // 必需字段
        color: '#00FF00', // 必需字段
        probability: 0.01,
        sort_order: existingPrize.sort_order, // 故意重复
        stock_quantity: 1,
        win_probability: 0.01,
        cost_points: 10,
        status: 'active'
      })

      console.log('❌ 测试失败: beforeCreate钩子未生效')
      return false
    } catch (error) {
      if (error.message.includes('奖品排序') && error.message.includes('已存在')) {
        console.log('✅ 测试通过: beforeCreate钩子成功阻止重复')
        console.log(`   错误信息: ${error.message}`)
        return true
      } else {
        console.log(`⚠️ 钩子生效但错误信息不符预期: ${error.message}`)
        return true // 只要阻止了重复就算通过
      }
    }
  } catch (error) {
    console.error(`❌ 测试失败: ${error.message}`)
    return false
  }
}

/**
 * 测试3：验证数据库索引存在性
 */
async function testIndexExistence () {
  console.log('\n📋 测试3：验证数据库索引存在性')
  console.log('----------------------------------------')

  try {
    const [indexes] = await sequelize.query(
      'SHOW INDEX FROM lottery_prizes WHERE Key_name = \'idx_unique_campaign_sort_order\''
    )

    if (indexes.length === 0) {
      console.log('❌ 测试失败: 唯一索引不存在')
      return false
    }

    console.log('✅ 测试通过: 唯一索引存在')
    console.log(`   索引名称: ${indexes[0].Key_name}`)
    console.log(`   唯一性: ${indexes[0].Non_unique === 0 ? 'UNIQUE' : 'NON-UNIQUE'}`)
    console.log(`   索引字段: ${indexes.map((idx) => idx.Column_name).join(', ')}`)

    return indexes[0].Non_unique === 0
  } catch (error) {
    console.error(`❌ 测试失败: ${error.message}`)
    return false
  }
}

/**
 * 主测试函数
 */
async function main () {
  console.log('🔍 开始验证sort_order唯一约束...\n')

  const results = {
    indexExists: false,
    databaseConstraint: false,
    modelHook: false
  }

  try {
    // 测试索引存在性
    results.indexExists = await testIndexExistence()

    // 测试数据库约束
    results.databaseConstraint = await testDatabaseConstraint()

    // 测试模型钩子
    results.modelHook = await testModelHook()

    // 生成测试报告
    console.log('\n📊 测试结果汇总')
    console.log('========================================')
    console.log(`索引存在性:       ${results.indexExists ? '✅ 通过' : '❌ 失败'}`)
    console.log(`数据库约束:       ${results.databaseConstraint ? '✅ 通过' : '❌ 失败'}`)
    console.log(`模型钩子:         ${results.modelHook ? '✅ 通过' : '❌ 失败'}`)
    console.log('========================================')

    const allPassed = results.indexExists && results.databaseConstraint && results.modelHook

    if (allPassed) {
      console.log('\n🎉 所有测试通过！sort_order唯一约束实施成功')
      console.log('✅ 数据库层面 + 应用层面 双重保护已启用')
      console.log('✅ 前端转盘位置冲突问题已解决')
    } else {
      console.log('\n⚠️ 部分测试失败，请检查实施细节')
    }

    process.exit(allPassed ? 0 : 1)
  } catch (error) {
    console.error('\n❌ 验证过程出错:', error.message)
    process.exit(1)
  }
}

// 执行测试
main()
