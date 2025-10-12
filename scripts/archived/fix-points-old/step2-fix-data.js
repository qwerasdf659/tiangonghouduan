/**
 * 第2步：修复积分数据
 *
 * 功能：根据诊断结果，以交易记录为准修正账户余额
 * 原则：交易记录不会错，账户余额可能错
 *
 * 使用方法：
 *   cd /home/devbox/project
 *   node scripts/fix-points/step2-fix-data.js
 */

const path = require('path')
const fs = require('fs')
const readline = require('readline')

// 加载数据库配置和模型
const { sequelize } = require('../../config/database')
const { UserPointsAccount, PointsTransaction: _PointsTransaction } = require('../../models')

// 创建控制台输入接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

/**
 * 询问用户确认
 * @param {string} question - 问题
 * @returns {Promise<boolean>} - 是否确认
 */
function askConfirmation (question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}

/**
 * 修复积分数据
 */
async function fixData () {
  console.log('🔧 开始修复积分数据...\n')

  try {
    // 1. 读取诊断结果
    const diagnosisPath = path.join(__dirname, 'diagnosis-result.json')

    if (!fs.existsSync(diagnosisPath)) {
      console.error('❌ 找不到诊断结果文件！')
      console.error('   请先执行: node scripts/fix-points/step1-diagnose.js')
      process.exit(1)
    }

    const problems = JSON.parse(fs.readFileSync(diagnosisPath, 'utf8'))

    if (problems.length === 0) {
      console.log('✅ 没有需要修复的问题')
      process.exit(0)
    }

    console.log(`📋 发现 ${problems.length} 个需要修复的账户\n`)

    // 2. 显示修复计划
    console.log('修复计划：')
    problems.forEach(problem => {
      console.log(`\n用户ID: ${problem.user_id}`)
      console.log(`  修复前: 余额 ${problem.account_balance}分`)
      console.log(`  修复后: 余额 ${problem.actual_balance}分`)
      console.log(`  差异: ${(problem.actual_balance - problem.account_balance).toFixed(2)}分`)
    })

    // 3. 询问确认
    console.log('\n' + '='.repeat(60))
    const confirmed = await askConfirmation('确认执行修复？(y/n): ')

    if (!confirmed) {
      console.log('❌ 用户取消操作')
      process.exit(0)
    }

    console.log('\n开始修复...\n')

    let successCount = 0
    let failCount = 0

    // 4. 逐个修复（使用事务保证安全）
    for (const problem of problems) {
      console.log(`修复用户 ${problem.user_id}...`)

      const transaction = await sequelize.transaction()

      try {
        // 4.1 查找账户（加锁，防止并发修改）
        const account = await UserPointsAccount.findOne({
          where: { user_id: problem.user_id, is_active: true },
          lock: transaction.LOCK.UPDATE,
          transaction
        })

        if (!account) {
          console.log('  ❌ 账户不存在，跳过')
          await transaction.rollback()
          failCount++
          continue
        }

        // 4.2 更新账户数据（以实际交易记录为准）
        // 注意：只更新账户字段，不创建修复交易记录
        // 原因：修复的目的是让账户和现有交易记录一致，创建新交易会干扰统计
        await account.update({
          available_points: problem.actual_balance,
          total_earned: problem.actual_earned,
          total_consumed: problem.actual_consumed
        }, { transaction })

        console.log('  修复详情:')
        console.log(`    available_points: ${problem.account_balance} → ${problem.actual_balance}`)
        console.log(`    total_earned: ${problem.account_earned} → ${problem.actual_earned}`)
        console.log(`    total_consumed: ${problem.account_consumed} → ${problem.actual_consumed}`)

        // 4.4 提交事务
        await transaction.commit()

        console.log('  ✅ 修复成功')
        successCount++
      } catch (error) {
        await transaction.rollback()
        console.log(`  ❌ 修复失败: ${error.message}`)
        failCount++
      }
    }

    // 5. 输出修复结果
    console.log('\n' + '='.repeat(60))
    console.log('📊 修复结果汇总')
    console.log('='.repeat(60))
    console.log(`总计: ${problems.length}`)
    console.log(`成功: ${successCount}`)
    console.log(`失败: ${failCount}`)

    if (successCount > 0) {
      console.log('\n✅ 修复完成！下一步执行: node scripts/fix-points/step3-verify.js')
    }
  } catch (error) {
    console.error('❌ 修复过程出错:', error.message)
    console.error(error.stack)
    throw error
  } finally {
    rl.close()
    await sequelize.close()
  }
}

// 执行修复
fixData()
  .then(() => {
    console.log('\n✅ 修复流程完成')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ 修复失败:', error)
    process.exit(1)
  })
