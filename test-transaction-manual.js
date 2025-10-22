/**
 * 手动测试连抽事务保护
 * 直接调用UnifiedLotteryEngine验证事务保护机制
 */

require('dotenv').config()
const models = require('./models')
const lotteryEngine = require('./services/UnifiedLotteryEngine/UnifiedLotteryEngine')

async function testTransactionProtection () {
  try {
    console.log('\n========== 连抽事务保护手动测试 ==========\n')

    // 测试账号
    const testUserId = 31 // 13612227930
    const testCampaignId = 1 // BASIC_LOTTERY

    // 获取初始积分
    const userAccount = await models.UserPointsAccount.findOne({
      where: { user_id: testUserId }
    })

    if (!userAccount) {
      throw new Error('测试账号不存在')
    }

    const pointsBefore = userAccount.available_points
    console.log(`✅ 测试账号: user_id=${testUserId}`)
    console.log(`📊 初始积分: ${pointsBefore}`)

    // ===== 测试1: 3连抽 (验证统一事务) =====
    console.log('\n----- 测试1: 3连抽 (验证统一事务) -----')

    try {
      const result1 = await lotteryEngine.execute_draw(testUserId, testCampaignId, 3)

      console.log('✅ 3连抽成功:')
      console.log(`   - 抽奖次数: ${result1.draw_count}`)
      console.log(`   - 获奖次数: ${result1.prizes.length}`)
      console.log(`   - 总消耗积分: ${result1.total_points_cost}`)
      console.log(`   - 剩余积分: ${result1.remaining_balance}`)

      // 验证积分扣除
      const expectedCost = 300 // 3次 * 100积分/次
      if (result1.total_points_cost === expectedCost) {
        console.log(`   ✅ 积分扣除正确: ${expectedCost}`)
      } else {
        console.log(`   ⚠️ 积分扣除异常: 预期${expectedCost}, 实际${result1.total_points_cost}`)
      }

      // 验证数据库实际积分
      const account1 = await models.UserPointsAccount.findOne({
        where: { user_id: testUserId }
      })
      console.log(`   📊 数据库实际积分: ${account1.available_points}`)

      if (account1.available_points === pointsBefore - 300) {
        console.log('   ✅ 数据库积分一致')
      } else {
        console.log('   ❌ 数据库积分不一致!')
      }
    } catch (error) {
      console.error(`❌ 3连抽失败: ${error.message}`)
    }

    // ===== 测试2: 5连抽 (验证统一事务) =====
    console.log('\n----- 测试2: 5连抽 (验证统一事务) -----')

    const account2Before = await models.UserPointsAccount.findOne({
      where: { user_id: testUserId }
    })
    const points2Before = account2Before.available_points
    console.log(`📊 5连抽前积分: ${points2Before}`)

    if (points2Before < 500) {
      console.log('⚠️ 积分不足,跳过5连抽测试')
    } else {
      try {
        const result2 = await lotteryEngine.execute_draw(testUserId, testCampaignId, 5)

        console.log('✅ 5连抽成功:')
        console.log(`   - 抽奖次数: ${result2.draw_count}`)
        console.log(`   - 获奖次数: ${result2.prizes.length}`)
        console.log(`   - 总消耗积分: ${result2.total_points_cost}`)
        console.log(`   - 剩余积分: ${result2.remaining_balance}`)

        const expectedCost = 500
        if (result2.total_points_cost === expectedCost) {
          console.log(`   ✅ 积分扣除正确: ${expectedCost}`)
        } else {
          console.log(`   ⚠️ 积分扣除异常: 预期${expectedCost}, 实际${result2.total_points_cost}`)
        }
      } catch (error) {
        console.error(`❌ 5连抽失败: ${error.message}`)
      }
    }

    // ===== 测试3: 单次抽奖 (验证向后兼容性) =====
    console.log('\n----- 测试3: 单次抽奖 (验证向后兼容性) -----')

    try {
      const result3 = await lotteryEngine.execute_draw(testUserId, testCampaignId, 1)

      console.log('✅ 单次抽奖成功:')
      console.log(`   - 抽奖次数: ${result3.draw_count}`)
      console.log(`   - 获奖次数: ${result3.prizes.length}`)
      console.log(`   - 总消耗积分: ${result3.total_points_cost}`)

      if (result3.total_points_cost === 100) {
        console.log('   ✅ 单次抽奖积分扣除正确')
      }
    } catch (error) {
      console.error(`❌ 单次抽奖失败: ${error.message}`)
    }

    console.log('\n========== 测试完成 ==========\n')
  } catch (error) {
    console.error(`\n❌ 测试失败: ${error.message}`)
    console.error(error.stack)
  } finally {
    // 关闭数据库连接
    await models.sequelize.close()
  }
}

// 执行测试
testTransactionProtection()
