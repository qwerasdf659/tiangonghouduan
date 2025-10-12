/**
 * 第1步：诊断积分数据一致性问题
 *
 * 功能：检查所有用户的积分账户，找出不一致的账户
 * 输出：生成问题清单
 *
 * 使用方法：
 *   cd /home/devbox/project
 *   node scripts/fix-points/step1-diagnose.js
 */

const path = require('path')
const fs = require('fs')

// 加载数据库配置和模型
const { sequelize } = require('../../config/database')
const { UserPointsAccount, PointsTransaction: _PointsTransaction } = require('../../models')

async function diagnose () {
  console.log('🔍 开始诊断积分数据一致性...\n')

  try {
    // 1. 获取所有活跃的积分账户
    const accounts = await UserPointsAccount.findAll({
      where: { is_active: true },
      order: [['user_id', 'ASC']]
    })

    console.log(`📊 找到 ${accounts.length} 个活跃积分账户\n`)

    const problems = [] // 存储有问题的账户

    // 2. 逐个检查每个账户
    for (const account of accounts) {
      console.log(`检查用户 ${account.user_id}...`)

      // 2.1 从交易记录统计实际的积分
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

      // 2.2 计算实际余额
      const actualEarned = parseFloat(earnResult[0].total) || 0
      const actualConsumed = parseFloat(consumeResult[0].total) || 0
      const actualBalance = actualEarned - actualConsumed

      // 2.3 读取账户显示的余额
      const accountBalance = parseFloat(account.available_points)
      const accountEarned = parseFloat(account.total_earned)
      const accountConsumed = parseFloat(account.total_consumed)

      // 2.4 计算差异
      const balanceDiff = Math.abs(accountBalance - actualBalance)
      const earnedDiff = Math.abs(accountEarned - actualEarned)
      const consumedDiff = Math.abs(accountConsumed - actualConsumed)

      console.log(`  账户余额: ${accountBalance}分 | 实际余额: ${actualBalance}分`)

      // 2.5 判断是否有问题（差异超过0.01分就算有问题）
      if (balanceDiff > 0.01 || earnedDiff > 0.01 || consumedDiff > 0.01) {
        console.log(`  ❌ 发现问题！差异: ${balanceDiff.toFixed(2)}分\n`)

        problems.push({
          user_id: account.user_id,
          account_balance: accountBalance,
          account_earned: accountEarned,
          account_consumed: accountConsumed,
          actual_balance: actualBalance,
          actual_earned: actualEarned,
          actual_consumed: actualConsumed,
          balance_diff: balanceDiff,
          earned_diff: earnedDiff,
          consumed_diff: consumedDiff
        })
      } else {
        console.log('  ✅ 数据一致\n')
      }
    }

    // 3. 生成诊断报告
    console.log('\n' + '='.repeat(60))
    console.log('📊 诊断结果汇总')
    console.log('='.repeat(60))
    console.log(`总账户数: ${accounts.length}`)
    console.log(`正常账户: ${accounts.length - problems.length}`)
    console.log(`问题账户: ${problems.length}`)

    if (problems.length > 0) {
      console.log('\n⚠️  发现以下账户存在问题：\n')

      problems.forEach(problem => {
        console.log(`用户ID: ${problem.user_id}`)
        console.log(`  账户显示: 余额${problem.account_balance}分 = 获得${problem.account_earned}分 - 消费${problem.account_consumed}分`)
        console.log(`  实际情况: 余额${problem.actual_balance}分 = 获得${problem.actual_earned}分 - 消费${problem.actual_consumed}分`)
        console.log(`  差异金额: ${problem.balance_diff.toFixed(2)}分`)
        console.log('')
      })

      // 保存问题清单到文件
      const resultPath = path.join(__dirname, 'diagnosis-result.json')
      fs.writeFileSync(
        resultPath,
        JSON.stringify(problems, null, 2)
      )
      console.log(`💾 问题清单已保存到: ${resultPath}\n`)
    } else {
      console.log('\n✅ 所有账户数据一致，无需修复！\n')
    }

    return problems
  } catch (error) {
    console.error('❌ 诊断过程出错:', error.message)
    console.error(error.stack)
    throw error
  } finally {
    await sequelize.close()
  }
}

// 执行诊断
diagnose()
  .then(problems => {
    if (problems.length > 0) {
      console.log('✅ 诊断完成！下一步执行: node scripts/fix-points/step2-fix-data.js')
    } else {
      console.log('✅ 诊断完成！无需修复。')
    }
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ 诊断失败:', error)
    process.exit(1)
  })
