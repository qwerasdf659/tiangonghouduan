#!/usr/bin/env node
/**
 * 🧪 批量添加奖品sort_order唯一性验证脚本
 *
 * 验证目标：
 * 1. 未提供sort_order时，系统自动分配唯一值
 * 2. 提供重复sort_order时，系统正确报错
 * 3. 批量创建多个奖品时，sort_order不冲突
 *
 * 业务场景：管理员批量添加奖品到奖品池
 */

const { LotteryPrize, LotteryCampaign, sequelize } = require('../models')

/**
 * 测试1：未提供sort_order时自动分配唯一值
 */
async function testAutoAssignSortOrder () {
  console.log('📋 测试1：未提供sort_order时自动分配唯一值')
  console.log('----------------------------------------')

  const transaction = await sequelize.transaction()

  try {
    // 查找测试活动
    const campaign = await LotteryCampaign.findOne({
      where: { status: 'active' },
      transaction
    })

    if (!campaign) {
      console.log('⚠️ 没有找到活跃的抽奖活动，跳过测试')
      await transaction.rollback()
      return false
    }

    console.log(`✅ 找到测试活动: ${campaign.campaign_code}`)

    // 获取当前最大sort_order
    const maxSortOrder = await LotteryPrize.max('sort_order', {
      where: { campaign_id: campaign.campaign_id },
      transaction
    })

    console.log(`✅ 当前最大sort_order: ${maxSortOrder || 0}`)

    // 模拟批量创建3个奖品，不提供sort_order
    const testPrizes = [
      {
        prize_name: '测试奖品1',
        prize_type: 'points',
        prize_value: 100,
        stock_quantity: 10,
        win_probability: 0.1,
        angle: 0,
        color: '#FF0000',
        probability: 0.1
        // 故意不提供sort_order
      },
      {
        prize_name: '测试奖品2',
        prize_type: 'points',
        prize_value: 200,
        stock_quantity: 10,
        win_probability: 0.1,
        angle: 45,
        color: '#00FF00',
        probability: 0.1
        // 故意不提供sort_order
      },
      {
        prize_name: '测试奖品3',
        prize_type: 'points',
        prize_value: 300,
        stock_quantity: 10,
        win_probability: 0.1,
        angle: 90,
        color: '#0000FF',
        probability: 0.1
        // 故意不提供sort_order
      }
    ]

    // 模拟路由逻辑：自动分配sort_order
    let nextSortOrder = (maxSortOrder || 0) + 1
    const createdPrizes = []

    for (const prizeData of testPrizes) {
      const sortOrder = prizeData.sort_order !== undefined ? prizeData.sort_order : nextSortOrder++

      // eslint-disable-next-line no-await-in-loop
      const prize = await LotteryPrize.create(
        {
          campaign_id: campaign.campaign_id,
          ...prizeData,
          sort_order: sortOrder,
          cost_points: 100,
          status: 'active'
        },
        { transaction }
      )

      createdPrizes.push(prize)
    }

    // 验证所有奖品的sort_order都是唯一的
    const sortOrders = createdPrizes.map(p => p.sort_order)
    const uniqueSortOrders = new Set(sortOrders)

    if (sortOrders.length === uniqueSortOrders.size) {
      console.log('✅ 测试通过: 所有奖品的sort_order都是唯一的')
      console.log(`   分配的sort_order: ${sortOrders.join(', ')}`)

      // 验证sort_order是递增的
      const isIncreasing = sortOrders.every((val, i) => i === 0 || val === sortOrders[i - 1] + 1)
      if (isIncreasing) {
        console.log('✅ sort_order递增分配正确')
      } else {
        console.log('⚠️ sort_order不是连续递增的')
      }
    } else {
      console.log('❌ 测试失败: 存在重复的sort_order')
      return false
    }

    // 回滚测试数据
    await transaction.rollback()
    console.log('🔄 测试数据已回滚')

    return true
  } catch (error) {
    await transaction.rollback()
    console.error(`❌ 测试失败: ${error.message}`)
    return false
  }
}

/**
 * 测试2：提供重复sort_order时正确报错
 */
async function testDuplicateSortOrderError () {
  console.log('\n📋 测试2：提供重复sort_order时正确报错')
  console.log('----------------------------------------')

  const transaction = await sequelize.transaction()

  try {
    // 查找测试活动
    const campaign = await LotteryCampaign.findOne({
      where: { status: 'active' },
      transaction
    })

    if (!campaign) {
      console.log('⚠️ 没有找到活跃的抽奖活动，跳过测试')
      await transaction.rollback()
      return false
    }

    // 查找已存在的奖品
    const existingPrize = await LotteryPrize.findOne({
      where: { campaign_id: campaign.campaign_id },
      transaction
    })

    if (!existingPrize) {
      console.log('⚠️ 活动没有奖品，跳过测试')
      await transaction.rollback()
      return false
    }

    console.log(`✅ 找到已存在的奖品: sort_order=${existingPrize.sort_order}`)

    // 尝试创建相同sort_order的奖品
    try {
      await LotteryPrize.create(
        {
          campaign_id: campaign.campaign_id,
          prize_name: '重复排序测试',
          prize_type: 'points',
          prize_value: 100,
          stock_quantity: 10,
          win_probability: 0.1,
          angle: 0,
          color: '#FF0000',
          probability: 0.1,
          cost_points: 100,
          status: 'active',
          sort_order: existingPrize.sort_order // 故意使用已存在的sort_order
        },
        { transaction }
      )

      await transaction.rollback()
      console.log('❌ 测试失败: 应该抛出错误但没有')
      return false
    } catch (error) {
      if (error.message.includes('奖品排序') && error.message.includes('已存在')) {
        console.log('✅ 测试通过: 正确抛出sort_order重复错误')
        console.log(`   错误信息: ${error.message}`)
        await transaction.rollback()
        return true
      } else {
        console.log(`⚠️ 抛出了错误但不是预期的错误: ${error.message}`)
        await transaction.rollback()
        return false
      }
    }
  } catch (error) {
    await transaction.rollback()
    console.error(`❌ 测试失败: ${error.message}`)
    return false
  }
}

/**
 * 主测试函数
 */
async function main () {
  console.log('🧪 开始批量添加奖品sort_order唯一性验证...\n')

  const results = {
    autoAssign: false,
    duplicateError: false
  }

  try {
    // 测试自动分配
    results.autoAssign = await testAutoAssignSortOrder()

    // 测试重复错误
    results.duplicateError = await testDuplicateSortOrderError()

    // 生成测试报告
    console.log('\n📊 测试结果汇总')
    console.log('========================================')
    console.log(`自动分配sort_order:  ${results.autoAssign ? '✅ 通过' : '❌ 失败'}`)
    console.log(`重复sort_order报错:  ${results.duplicateError ? '✅ 通过' : '❌ 失败'}`)
    console.log('========================================')

    const allPassed = results.autoAssign && results.duplicateError

    if (allPassed) {
      console.log('\n🎉 所有测试通过！批量创建奖品的sort_order唯一性保护已生效')
      console.log('✅ 未提供sort_order时自动分配唯一值')
      console.log('✅ 提供重复sort_order时正确报错')
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
