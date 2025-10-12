/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构
 * 并发控制验证脚本：测试商品库存扣减的并发安全性
 *
 * 问题：商品兑换时多个并发请求可能导致超卖
 * 验证：通过模拟并发兑换来测试悲观锁+原子操作的有效性
 *
 * 执行方式：node scripts/verify-concurrency-control.js
 */

require('dotenv').config()
const { Product, User, UserPointsAccount, Sequelize } = require('../models')
const PointsService = require('../services/PointsService')
const { Op } = Sequelize

/**
 * 模拟并发兑换
 * @param {number} productId - 商品ID
 * @param {Array} userIds - 用户ID列表
 * @param {number} quantity - 每次兑换数量
 */
async function simulateConcurrentExchange (productId, userIds, quantity = 1) {
  console.log(`\n🔄 模拟${userIds.length}个用户同时兑换商品 ${productId}...`)

  const promises = userIds.map(userId =>
    PointsService.exchangeProduct(userId, productId, quantity)
      .then(result => ({
        success: true,
        userId,
        exchangeId: result.exchange_id,
        message: '兑换成功'
      }))
      .catch(error => ({
        success: false,
        userId,
        error: error.message
      }))
  )

  const results = await Promise.all(promises)

  const successCount = results.filter(r => r.success).length
  const failureCount = results.filter(r => !r.success).length

  console.log('\n📊 并发兑换结果:')
  console.log(`  成功: ${successCount}次`)
  console.log(`  失败: ${failureCount}次`)

  results.forEach((result) => {
    const status = result.success ? '✅' : '❌'
    const message = result.success
      ? `兑换ID: ${result.exchangeId}`
      : `失败原因: ${result.error}`
    console.log(`  ${status} 用户${result.userId}: ${message}`)
  })

  return { successCount, failureCount, results }
}

/**
 * 主验证流程
 */
async function verifyCompleteFlow () {
  console.log('🔍 ============ 商品库存并发控制验证 ============\n')

  try {
    // 1. 检查测试用户（手机号：13612227930）
    const testUser = await User.findOne({ where: { mobile: '13612227930' } })
    if (!testUser) {
      throw new Error('测试用户13612227930不存在')
    }
    const testUserId = testUser.user_id

    // 2. 查找测试商品（库存较少的商品，便于测试）
    const testProduct = await Product.findOne({
      where: {
        status: 'active',
        stock: { [Op.gt]: 0, [Op.lt]: 20 }
      },
      order: [['stock', 'ASC']]
    })

    if (!testProduct) {
      console.log('⚠️ 未找到合适的测试商品，跳过并发测试')
      return
    }

    console.log(`📦 测试商品: ${testProduct.name}`)
    console.log(`   商品ID: ${testProduct.product_id}`)
    console.log(`   当前库存: ${testProduct.stock}`)
    console.log(`   兑换积分: ${testProduct.exchange_points}`)

    // 3. 准备测试用户（确保有足够积分）
    const requiredPoints = testProduct.exchange_points * (testProduct.stock + 5) // 多给一些积分

    const account = await UserPointsAccount.findOne({ where: { user_id: testUserId } })
    if (!account) {
      throw new Error('用户积分账户不存在')
    }

    console.log('\n💰 用户积分状态:')
    console.log(`   当前积分: ${account.available_points}`)
    console.log(`   需要积分: ${requiredPoints}`)

    if (account.available_points < requiredPoints) {
      console.log('   ⚠️ 积分不足，正在充值...')
      await PointsService.addPoints(testUserId, requiredPoints - account.available_points, {
        business_type: 'admin_grant',
        source_type: 'system',
        title: '测试充值',
        description: '并发测试用积分充值'
      })
      console.log('   ✅ 充值成功')
    }

    // 4. 记录初始状态
    const initialStock = testProduct.stock
    console.log('\n📊 初始状态:')
    console.log(`   商品库存: ${initialStock}`)

    // 5. 测试场景1：并发数 = 库存数（应该全部成功）
    console.log(`\n🧪 场景1: ${initialStock}个并发请求兑换 ${initialStock}库存的商品`)
    console.log('   预期: 全部成功（库存耗尽）')

    // 创建多个用户进行测试
    const concurrentUsers = Array(initialStock).fill(testUserId)

    const scenario1 = await simulateConcurrentExchange(
      testProduct.product_id,
      concurrentUsers,
      1
    )

    // 验证库存
    await testProduct.reload()
    console.log(`\n📦 场景1后库存: ${testProduct.stock}`)
    console.log('   预期库存: 0')
    console.log(`   库存正确: ${testProduct.stock === 0 ? '✅' : '❌'}`)

    // 6. 测试场景2：并发数 > 库存数（应该部分失败）
    // 恢复一些库存
    await testProduct.update({ stock: 3 })
    console.log('\n🧪 场景2: 5个并发请求兑换 3库存的商品')
    console.log('   预期: 3个成功，2个失败（库存不足）')

    const scenario2 = await simulateConcurrentExchange(
      testProduct.product_id,
      Array(5).fill(testUserId), // 5个并发请求，同一用户
      1
    )

    // 验证库存
    await testProduct.reload()
    console.log(`\n📦 场景2后库存: ${testProduct.stock}`)
    console.log('   预期库存: 0')
    console.log(`   库存正确: ${testProduct.stock === 0 ? '✅' : '❌'}`)

    // 7. 统计验证结果
    console.log('\n🎉 ============ 验证总结 ============')
    console.log(`场景1: ${scenario1.successCount}成功/${scenario1.failureCount}失败`)
    console.log(`场景2: ${scenario2.successCount}成功/${scenario2.failureCount}失败`)

    // 关键验证点
    const allTestsPassed =
      testProduct.stock === 0 && // 最终库存为0
      scenario2.successCount === 3 && // 场景2成功3次
      scenario2.failureCount === 2 // 场景2失败2次

    if (allTestsPassed) {
      console.log('\n✅ 并发控制验证通过！悲观锁+原子操作有效防止了超卖')
    } else {
      console.log('\n❌ 并发控制验证失败，存在超卖风险')
    }

    // 8. 恢复测试商品库存
    await testProduct.update({ stock: initialStock })
    console.log(`\n🔄 已恢复测试商品库存至 ${initialStock}`)
  } catch (error) {
    console.error('\n❌ 验证过程失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 主程序入口
if (require.main === module) {
  verifyCompleteFlow()
    .then(() => {
      console.log('\n✅ 并发控制验证完成')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ 验证失败:', error)
      process.exit(1)
    })
}

module.exports = verifyCompleteFlow
