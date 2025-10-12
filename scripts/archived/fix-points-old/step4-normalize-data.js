/**
 * 第4步：规范化历史数据
 *
 * 功能：统一consume交易的points_amount存储格式
 * 问题：历史数据中consume交易的points_amount有正数也有负数，需要统一为正数
 *
 * 业务标准：
 * - earn交易：存储正数
 * - consume交易：存储正数（类型由transaction_type区分）
 * - 余额计算：total_earned - total_consumed
 *
 * 使用方法：
 *   cd /home/devbox/project
 *   node scripts/fix-points/step4-normalize-data.js
 */

const { sequelize, PointsTransaction: _PointsTransaction } = require('../../models')

/**
 * 规范化数据
 */
async function normalizeData () {
  console.log('🔧 开始规范化历史数据...\n')

  try {
    // 1. 查找存储为负数的consume交易
    const [negativeTransactions] = await sequelize.query(`
      SELECT transaction_id, user_id, points_amount, business_type, transaction_title
      FROM points_transactions
      WHERE transaction_type = 'consume'
      AND points_amount < 0
    `)

    console.log(`📊 找到 ${negativeTransactions.length} 条负数consume交易需要规范化\n`)

    if (negativeTransactions.length === 0) {
      console.log('✅ 所有数据已符合规范，无需处理')
      return { normalized: 0 }
    }

    // 2. 显示待处理的交易
    console.log('待处理交易：')
    negativeTransactions.forEach((t, index) => {
      if (index < 10) { // 只显示前10条
        console.log(`  ${index + 1}. 用户${t.user_id} | ${t.points_amount}分 | ${t.business_type || 'NULL'} | ${t.transaction_title}`)
      }
    })

    if (negativeTransactions.length > 10) {
      console.log(`  ... 还有${negativeTransactions.length - 10}条记录`)
    }

    // 3. 询问确认
    const readline = require('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    const confirmed = await new Promise(resolve => {
      rl.question('\n确认规范化这些数据？(y/n): ', answer => {
        rl.close()
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
      })
    })

    if (!confirmed) {
      console.log('❌ 用户取消操作')
      return { normalized: 0 }
    }

    console.log('\n开始规范化...\n')

    // 4. 批量更新（使用事务保证安全）
    const transaction = await sequelize.transaction()

    try {
      // 将负数转换为正数
      await sequelize.query(
        `
        UPDATE points_transactions
        SET points_amount = ABS(points_amount)
        WHERE transaction_type = 'consume'
        AND points_amount < 0
        `,
        { transaction }
      )

      await transaction.commit()

      console.log(`✅ 规范化完成！共处理 ${negativeTransactions.length} 条记录\n`)

      return { normalized: negativeTransactions.length }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error('❌ 规范化失败:', error.message)
    console.error(error.stack)
    throw error
  } finally {
    await sequelize.close()
  }
}

// 执行规范化
normalizeData()
  .then(result => {
    console.log('============================================================')
    console.log('📊 规范化结果汇总')
    console.log('============================================================')
    console.log(`处理记录数: ${result.normalized}`)
    console.log('')

    if (result.normalized > 0) {
      console.log('✅ 数据规范化完成！')
      console.log('\n下一步建议：')
      console.log('1. 执行验证: node scripts/fix-points/step3-verify.js')
      console.log('2. 测试积分功能确保正常')
    } else {
      console.log('✅ 数据已符合规范')
    }

    console.log('============================================================')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ 规范化失败:', error)
    process.exit(1)
  })
