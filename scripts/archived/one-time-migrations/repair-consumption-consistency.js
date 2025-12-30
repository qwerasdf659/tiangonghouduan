/**
 * 消费记录数据一致性修复脚本
 * Data Consistency Repair Script for Consumption Records
 *
 * 业务场景（Business Scenario）：
 * - 修复历史遗留的数据不一致问题（在事务保护实施之前创建的记录）
 * - 为孤儿消费记录补充积分交易记录和审核记录
 * - 确保数据完整性，使审核功能正常工作
 *
 * 修复内容（Repair Items）：
 * 1. 孤儿消费记录 - 补充pending积分交易记录
 * 2. 缺失审核记录 - 补充pending审核记录
 *
 * ⚠️ 警告（Warning）：
 * - 此脚本会修改数据库数据，执行前请务必备份数据库
 * - 建议在测试环境先验证，确认无误后再在生产环境执行
 * - 脚本使用事务保护，如果失败会自动回滚
 *
 * 使用方法（Usage）：
 * node scripts/database/repair-consumption-consistency.js
 */

'use strict'

require('dotenv').config()
const { Sequelize, DataTypes, Transaction } = require('sequelize')
const BeijingTimeHelper = require('../../utils/timeHelper')

// 🔴 复用主 sequelize 实例（单一配置源）
const { sequelize } = require('../../../config/database')

/**
 * 修复孤儿消费记录 - 补充pending积分交易记录
 *
 * @param {Object} transaction - Sequelize事务对象
 * @returns {number} 修复的记录数
 */
async function repairOrphanConsumption(transaction) {
  console.log('\n🔧 修复孤儿消费记录（补充积分交易）...')

  // 查找所有孤儿消费记录
  const [orphanRecords] = await sequelize.query(
    `
    SELECT 
      cr.record_id,
      cr.user_id,
      cr.consumption_amount,
      cr.points_to_award,
      cr.status,
      cr.created_at
    FROM consumption_records cr
    LEFT JOIN points_transactions pt 
      ON pt.reference_type = 'consumption' 
      AND pt.reference_id = cr.record_id
    WHERE cr.status = 'pending'
      AND pt.transaction_id IS NULL
  `,
    { transaction }
  )

  if (orphanRecords.length === 0) {
    console.log('✅ 无需修复的孤儿消费记录')
    return 0
  }

  console.log(`📋 发现 ${orphanRecords.length} 条孤儿消费记录`)

  let repairedCount = 0

  for (const record of orphanRecords) {
    try {
      // 获取用户当前积分余额（从user_points_accounts表）
      const [userAccounts] = await sequelize.query(
        `
        SELECT account_id, available_points
        FROM user_points_accounts
        WHERE user_id = ? AND is_active = 1
        LIMIT 1
      `,
        {
          replacements: [record.user_id],
          transaction
        }
      )

      if (userAccounts.length === 0) {
        console.warn(`⚠️ 用户 ${record.user_id} 没有积分账户，跳过`)
        continue
      }

      const account = userAccounts[0]
      const currentBalance = parseFloat(account.available_points)

      // 创建pending积分交易记录
      await sequelize.query(
        `
        INSERT INTO points_transactions (
          user_id,
          account_id,
          transaction_type,
          points_amount,
          points_balance_before,
          points_balance_after,
          status,
          reference_type,
          reference_id,
          business_type,
          transaction_title,
          transaction_description,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        {
          replacements: [
            record.user_id,
            account.account_id,
            'earn', // 收入类型（Earn Type）
            record.points_to_award, // 积分数量（Points Amount）
            currentBalance, // 余额前（Balance Before - 不变）
            currentBalance, // 余额后（Balance After - pending状态不改变余额）
            'pending', // 状态（Status - Pending）
            'consumption', // 关联类型（Reference Type）
            record.record_id, // 关联记录ID（Reference ID）
            'consumption_reward', // 业务类型（Business Type）
            '消费奖励（待审核）', // 交易标题（Transaction Title）
            `消费${record.consumption_amount}元，预计奖励${record.points_to_award}分，审核通过后到账`, // 交易描述
            record.created_at, // 创建时间（与消费记录一致）
            BeijingTimeHelper.createDatabaseTime() // 更新时间（当前时间）
          ],
          transaction
        }
      )

      console.log(
        `✅ 修复 record_id=${record.record_id}, user_id=${record.user_id}, points=${record.points_to_award}`
      )
      repairedCount++
    } catch (error) {
      console.error(`❌ 修复 record_id=${record.record_id} 失败:`, error.message)
    }
  }

  return repairedCount
}

/**
 * 修复缺失审核记录 - 补充pending审核记录
 *
 * @param {Object} transaction - Sequelize事务对象
 * @returns {number} 修复的记录数
 */
async function repairMissingReview(transaction) {
  console.log('\n🔧 修复缺失审核记录...')

  // 查找所有缺失审核记录的消费记录
  const [missingRecords] = await sequelize.query(
    `
    SELECT 
      cr.record_id,
      cr.user_id,
      cr.status,
      cr.created_at
    FROM consumption_records cr
    LEFT JOIN content_review_records crr
      ON crr.auditable_type = 'consumption'
      AND crr.auditable_id = cr.record_id
    WHERE cr.status = 'pending'
      AND crr.audit_id IS NULL
  `,
    { transaction }
  )

  if (missingRecords.length === 0) {
    console.log('✅ 无需修复的缺失审核记录')
    return 0
  }

  console.log(`📋 发现 ${missingRecords.length} 条缺失审核记录`)

  let repairedCount = 0

  for (const record of missingRecords) {
    try {
      // 创建审核记录
      await sequelize.query(
        `
        INSERT INTO content_review_records (
          auditable_type,
          auditable_id,
          audit_status,
          auditor_id,
          audit_reason,
          submitted_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        {
          replacements: [
            'consumption', // 可审核类型（Auditable Type）
            record.record_id, // 可审核记录ID（Auditable ID）
            'pending', // 审核状态（Audit Status - Pending）
            null, // 审核员ID（Auditor ID - None）
            null, // 审核原因（Audit Reason - None）
            record.created_at, // 提交时间（与消费记录创建时间一致）
            record.created_at, // 创建时间（与消费记录创建时间一致）
            BeijingTimeHelper.createDatabaseTime() // 更新时间（当前时间）
          ],
          transaction
        }
      )

      console.log(`✅ 修复 record_id=${record.record_id}, user_id=${record.user_id}`)
      repairedCount++
    } catch (error) {
      console.error(`❌ 修复 record_id=${record.record_id} 失败:`, error.message)
    }
  }

  return repairedCount
}

/**
 * 修复已审核通过但无积分交易的记录 - 补充completed积分交易记录
 *
 * @param {Object} transaction - Sequelize事务对象
 * @returns {number} 修复的记录数
 */
async function repairApprovedWithoutTransaction(transaction) {
  console.log('\n🔧 修复已审核但无积分交易的记录（approved状态）...')

  // 查找所有已审核通过但无积分交易的消费记录
  const [approvedRecords] = await sequelize.query(
    `
    SELECT 
      cr.record_id,
      cr.user_id,
      cr.consumption_amount,
      cr.points_to_award,
      cr.status,
      cr.created_at,
      cr.reviewed_at,
      cr.reviewed_by
    FROM consumption_records cr
    LEFT JOIN points_transactions pt 
      ON pt.reference_type = 'consumption' 
      AND pt.reference_id = cr.record_id
    WHERE cr.status = 'approved'
      AND pt.transaction_id IS NULL
  `,
    { transaction }
  )

  if (approvedRecords.length === 0) {
    console.log('✅ 无需修复的已审核记录')
    return 0
  }

  console.log(`📋 发现 ${approvedRecords.length} 条已审核但无积分交易的记录`)

  let repairedCount = 0

  for (const record of approvedRecords) {
    try {
      // 获取用户当前积分余额
      const [userAccounts] = await sequelize.query(
        `
        SELECT account_id, available_points, total_earned
        FROM user_points_accounts
        WHERE user_id = ? AND is_active = 1
        LIMIT 1
      `,
        {
          replacements: [record.user_id],
          transaction
        }
      )

      if (userAccounts.length === 0) {
        console.warn(`⚠️ 用户 ${record.user_id} 没有积分账户，跳过`)
        continue
      }

      const account = userAccounts[0]
      const currentBalance = parseFloat(account.available_points)
      const pointsToAward = record.points_to_award

      // 计算修复前的余额（当前余额 - 应该奖励的积分）
      const balanceBefore = currentBalance - pointsToAward
      const balanceAfter = currentBalance

      // 创建completed状态的积分交易记录（补发积分）
      await sequelize.query(
        `
        INSERT INTO points_transactions (
          user_id,
          account_id,
          transaction_type,
          points_amount,
          points_balance_before,
          points_balance_after,
          status,
          reference_type,
          reference_id,
          business_type,
          transaction_title,
          transaction_description,
          operator_id,
          transaction_time,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        {
          replacements: [
            record.user_id,
            account.account_id,
            'earn', // 收入类型
            pointsToAward, // 积分数量
            balanceBefore, // 余额前（重构计算）
            balanceAfter, // 余额后（当前余额）
            'completed', // ✅ 状态：completed（已完成，因为记录已审核通过）
            'consumption', // 关联类型
            record.record_id, // 关联记录ID
            'consumption_reward', // 业务类型
            '消费奖励（数据修复）', // 交易标题
            `消费${record.consumption_amount}元，奖励${pointsToAward}分（历史数据修复，已审核通过）`, // 交易描述
            record.reviewed_by || null, // 操作员（审核员）
            record.reviewed_at || record.created_at, // 交易时间（使用审核时间）
            record.created_at, // 创建时间（与消费记录一致）
            BeijingTimeHelper.createDatabaseTime() // 更新时间（当前时间）
          ],
          transaction
        }
      )

      console.log(
        `✅ 修复 record_id=${record.record_id}, user_id=${record.user_id}, points=${pointsToAward} (approved)`
      )
      repairedCount++
    } catch (error) {
      console.error(`❌ 修复 record_id=${record.record_id} 失败:`, error.message)
    }
  }

  return repairedCount
}

/**
 * 主修复流程
 */
async function main() {
  console.log('🚀 开始修复消费记录数据一致性...')
  console.log('⏰ 开始时间:', BeijingTimeHelper.formatForAPI(new Date()))

  // 创建事务（Transaction）
  const transaction = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  })

  try {
    // 修复孤儿消费记录（pending状态）
    const orphanRepaired = await repairOrphanConsumption(transaction)

    // 修复缺失审核记录
    const reviewRepaired = await repairMissingReview(transaction)

    // 修复已审核但无积分交易的记录（approved状态）
    const approvedRepaired = await repairApprovedWithoutTransaction(transaction)

    // 提交事务（Commit Transaction）
    await transaction.commit()

    console.log('\n📊 修复统计：')
    console.log(`   孤儿消费记录修复(pending): ${orphanRepaired}条`)
    console.log(`   缺失审核记录修复: ${reviewRepaired}条`)
    console.log(`   已审核无积分记录修复(approved): ${approvedRepaired}条`)
    console.log(`   总计修复: ${orphanRepaired + reviewRepaired + approvedRepaired}条`)

    console.log('\n✅ 数据一致性修复完成！')
    console.log('⏰ 完成时间:', BeijingTimeHelper.formatForAPI(new Date()))
    console.log('\n💡 建议：再次运行验证脚本检查数据一致性')
    console.log('   node scripts/verify-transaction-protection.js')

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    // 回滚事务（Rollback Transaction）
    await transaction.rollback()
    console.error('\n❌ 修复失败，事务已回滚:', error.message)
    console.error('错误堆栈:', error.stack)

    await sequelize.close()
    process.exit(1)
  }
}

// 执行主流程
main()
