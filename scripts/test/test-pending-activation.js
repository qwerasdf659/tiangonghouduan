/**
 * 测试pending积分交易激活机制
 *
 * 测试场景：
 * 1. 商家提交消费记录 → 创建pending积分交易
 * 2. 管理员审核通过 → 激活pending交易(pending → completed)
 * 3. 验证数据一致性：一个消费记录对应一条积分交易
 */

const { sequelize } = require('../../models')
const ConsumptionService = require('../../services/ConsumptionService')
const PointsService = require('../../services/PointsService')
const { PointsTransaction, UserPointsAccount } = require('../../models')
const QRCodeValidator = require('../../utils/QRCodeValidator')

/**
 * 测试pending积分交易激活机制的主函数
 * @returns {Promise<void>} 测试执行完成（无返回值）
 */
async function testPendingActivation () {
  let consumptionRecordId = null

  try {
    console.log('\n========================================')
    console.log('测试：Pending积分交易激活机制')
    console.log('========================================\n')

    // 测试账号：13612227930（既是用户也是管理员）
    const testUserId = 31 // 用户ID: 13612227930
    const merchantId = 31 // 商户ID（使用同一个用户）
    const reviewerId = 31 // 审核员ID（同一个账号）

    // Step 1: 获取用户初始积分余额
    console.log('📊 Step 1: 获取用户初始积分余额')
    const initialAccount = await PointsService.getUserPointsAccount(testUserId)
    const initialBalance = parseFloat(initialAccount.available_points)
    console.log(`   用户ID: ${testUserId}`)
    console.log(`   初始可用积分: ${initialBalance}分`)

    // Step 2: 商家提交消费记录（创建pending积分交易）
    console.log('\n📝 Step 2: 商家提交消费记录')

    // 生成用户的二维码（QRCodeValidator是单例实例，不是类）
    const testQRCode = QRCodeValidator.generateQRCode(testUserId)
    console.log(`   生成测试二维码: ${testQRCode}`)

    const consumptionData = {
      merchant_id: merchantId,
      consumption_amount: 88.88, // 消费88.88元
      qr_code: testQRCode, // 使用正确格式的二维码
      merchant_notes: '测试pending积分激活机制'
    }

    const consumptionRecord = await ConsumptionService.merchantSubmitConsumption(consumptionData)
    consumptionRecordId = consumptionRecord.record_id

    console.log('   ✅ 消费记录创建成功')
    console.log(`   消费记录ID: ${consumptionRecordId}`)
    console.log(`   消费金额: ${consumptionRecord.consumption_amount}元`)
    console.log(`   预计奖励积分: ${consumptionRecord.points_to_award}分`)
    console.log(`   记录状态: ${consumptionRecord.status}`)

    // Step 3: 查询pending积分交易
    console.log('\n🔍 Step 3: 查询pending积分交易')
    const pendingTx = await PointsTransaction.findOne({
      where: {
        reference_type: 'consumption',
        reference_id: consumptionRecordId,
        status: 'pending'
      }
    })

    if (!pendingTx) {
      throw new Error('❌ 未找到pending积分交易！')
    }

    console.log('   ✅ Pending积分交易存在')
    console.log(`   交易ID: ${pendingTx.transaction_id}`)
    console.log(`   积分数量: ${pendingTx.points_amount}分`)
    console.log(`   交易状态: ${pendingTx.status}`)
    console.log(`   余额before: ${pendingTx.points_balance_before}`)
    console.log(`   余额after: ${pendingTx.points_balance_after}`)
    console.log('   ⚠️  注意：before = after，说明积分冻结中，未到账')

    // Step 4: 验证用户积分余额未变化
    console.log('\n💰 Step 4: 验证用户积分余额未变化')
    const accountAfterPending = await UserPointsAccount.findOne({
      where: { user_id: testUserId }
    })
    const balanceAfterPending = parseFloat(accountAfterPending.available_points)

    console.log(`   初始余额: ${initialBalance}分`)
    console.log(`   当前余额: ${balanceAfterPending}分`)

    if (balanceAfterPending === initialBalance) {
      console.log('   ✅ 余额未变化，符合预期（pending状态积分不到账）')
    } else {
      console.log('   ❌ 余额异常变化！应该保持不变')
    }

    // Step 5: 查询积分交易记录数量（应该只有1条pending记录）
    console.log('\n📊 Step 5: 查询关联的积分交易记录')
    const allTransactions = await PointsTransaction.findAll({
      where: {
        reference_type: 'consumption',
        reference_id: consumptionRecordId
      }
    })

    console.log(`   关联交易记录数量: ${allTransactions.length}`)
    allTransactions.forEach(tx => {
      console.log(`   - 交易ID: ${tx.transaction_id}, 状态: ${tx.status}, 积分: ${tx.points_amount}分`)
    })

    if (allTransactions.length === 1 && allTransactions[0].status === 'pending') {
      console.log('   ✅ 只有1条pending记录，符合预期')
    } else {
      console.log('   ⚠️  警告：交易记录数量异常！应该只有1条pending记录')
    }

    // Step 6: 管理员审核通过（激活pending交易）
    console.log('\n✅ Step 6: 管理员审核通过')
    const approveResult = await ConsumptionService.approveConsumption(consumptionRecordId, {
      reviewer_id: reviewerId,
      admin_notes: '测试审核通过-验证pending激活机制'
    })

    console.log('   ✅ 审核通过成功')
    console.log(`   奖励积分: ${approveResult.points_awarded}分`)
    console.log(`   新余额: ${approveResult.new_balance}分`)

    // Step 7: 验证pending交易已激活为completed
    console.log('\n🔄 Step 7: 验证pending交易状态变化')
    const activatedTx = await PointsTransaction.findOne({
      where: {
        transaction_id: pendingTx.transaction_id
      }
    })

    console.log(`   原状态: ${pendingTx.status}`)
    console.log(`   新状态: ${activatedTx.status}`)
    console.log(`   余额before: ${activatedTx.points_balance_before}`)
    console.log(`   余额after: ${activatedTx.points_balance_after}`)

    if (activatedTx.status === 'completed') {
      console.log('   ✅ 状态已变更为completed，符合预期')
    } else {
      console.log('   ❌ 状态未变更！应该是completed')
    }

    if (parseFloat(activatedTx.points_balance_after) > parseFloat(activatedTx.points_balance_before)) {
      console.log('   ✅ 余额after > before，说明积分已到账')
    } else {
      console.log('   ❌ 余额未增加！')
    }

    // Step 8: 验证用户积分余额已增加
    console.log('\n💰 Step 8: 验证用户积分余额已增加')
    const finalAccount = await UserPointsAccount.findOne({
      where: { user_id: testUserId }
    })
    const finalBalance = parseFloat(finalAccount.available_points)
    const expectedBalance = initialBalance + consumptionRecord.points_to_award

    console.log(`   初始余额: ${initialBalance}分`)
    console.log(`   预期余额: ${expectedBalance}分`)
    console.log(`   实际余额: ${finalBalance}分`)

    if (finalBalance === expectedBalance) {
      console.log('   ✅ 余额正确增加，符合预期')
    } else {
      console.log(`   ❌ 余额异常！预期${expectedBalance}，实际${finalBalance}`)
    }

    // Step 9: 最终验证-确认只有1条积分交易记录
    console.log('\n🎯 Step 9: 最终验证-确认数据一致性')
    const finalTransactions = await PointsTransaction.findAll({
      where: {
        reference_type: 'consumption',
        reference_id: consumptionRecordId
      }
    })

    console.log(`   关联交易记录数量: ${finalTransactions.length}`)
    finalTransactions.forEach(tx => {
      console.log(`   - 交易ID: ${tx.transaction_id}, 状态: ${tx.status}, 积分: ${tx.points_amount}分`)
    })

    if (finalTransactions.length === 1 && finalTransactions[0].status === 'completed') {
      console.log('   ✅✅✅ 完美！只有1条completed记录，数据一致性良好')
      console.log('   ✅✅✅ Pending积分激活机制工作正常！')
    } else if (finalTransactions.length > 1) {
      console.log(`   ❌ 数据冗余！有${finalTransactions.length}条记录，说明问题未解决`)
      console.log('   ❌ 应该只有1条记录：pending → completed状态流转')
    }

    console.log('\n========================================')
    console.log('✅ 测试完成！')
    console.log('========================================\n')

    // 清理测试数据（可选）
    console.log('是否需要清理测试数据？（手动执行清理脚本）')
    console.log(`删除消费记录: DELETE FROM consumption_records WHERE record_id = ${consumptionRecordId};`)
    console.log(`删除积分交易: DELETE FROM points_transactions WHERE reference_id = ${consumptionRecordId} AND reference_type = 'consumption';`)
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.error(error.stack)

    // 如果测试失败，尝试清理部分创建的数据
    if (consumptionRecordId) {
      console.log(`\n⚠️ 测试失败，消费记录ID: ${consumptionRecordId}`)
      console.log('可能需要手动清理测试数据')
    }
  } finally {
    await sequelize.close()
    console.log('\n数据库连接已关闭')
  }
}

// 运行测试
testPendingActivation()
