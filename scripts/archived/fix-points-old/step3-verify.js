/**
 * 第3步：验证修复结果
 *
 * 功能：再次检查所有账户，确认数据一致性
 *
 * 使用方法：
 *   cd /home/devbox/project
 *   node scripts/fix-points/step3-verify.js
 */

const { sequelize } = require('../../config/database')
const { UserPointsAccount } = require('../../models')

/**
 * 验证修复结果
 */
async function verify () {
  console.log('✅ 开始验证修复结果...\n')

  try {
    const accounts = await UserPointsAccount.findAll({
      where: { is_active: true },
      order: [['user_id', 'ASC']]
    })

    let allGood = true
    let checkedCount = 0
    let inconsistentCount = 0

    for (const account of accounts) {
      checkedCount++

      // 统计交易记录
      const [earnResult] = await sequelize.query(`
        SELECT COALESCE(SUM(points_amount), 0) as total 
        FROM points_transactions 
        WHERE user_id = ${account.user_id} 
        AND transaction_type = 'earn'
        AND status = 'completed'
      `)

      const [consumeResult] = await sequelize.query(`
        SELECT COALESCE(SUM(points_amount), 0) as total 
        FROM points_transactions 
        WHERE user_id = ${account.user_id} 
        AND transaction_type = 'consume'
        AND status = 'completed'
      `)

      const actualEarned = parseFloat(earnResult[0].total) || 0
      const actualConsumed = parseFloat(consumeResult[0].total) || 0
      const actualBalance = actualEarned - actualConsumed

      const accountBalance = parseFloat(account.available_points)
      const diff = Math.abs(accountBalance - actualBalance)

      if (diff > 0.01) {
        console.log(`❌ 用户${account.user_id}: 仍然不一致（差异${diff.toFixed(2)}分）`)
        allGood = false
        inconsistentCount++
      } else {
        console.log(`✅ 用户${account.user_id}: 数据一致（余额${accountBalance}分）`)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('📊 验证结果汇总')
    console.log('='.repeat(60))
    console.log(`检查账户数: ${checkedCount}`)
    console.log(`一致账户: ${checkedCount - inconsistentCount}`)
    console.log(`不一致账户: ${inconsistentCount}`)

    console.log('\n' + '='.repeat(60))
    if (allGood) {
      console.log('🎉 所有账户数据一致！修复成功！')
      console.log('='.repeat(60))
      console.log('\n✅ 下一步建议：')
      console.log('1. 测试积分获得功能')
      console.log('2. 测试积分消费功能')
      console.log('3. 恢复服务访问')
    } else {
      console.log('⚠️  仍有账户存在问题，请检查')
      console.log('='.repeat(60))
      console.log('\n🔄 建议操作：')
      console.log('1. 检查诊断结果: cat scripts/fix-points/diagnosis-result.json')
      console.log('2. 重新执行修复: node scripts/fix-points/step2-fix-data.js')
      console.log('3. 如果问题持续，请联系技术负责人')
    }
  } catch (error) {
    console.error('❌ 验证出错:', error.message)
    console.error(error.stack)
    throw error
  } finally {
    await sequelize.close()
  }
}

// 执行验证
verify()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
