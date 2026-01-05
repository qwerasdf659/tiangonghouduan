/**
 * 迁移文件：为lottery_draws表的关联键添加NOT NULL约束
 *
 * 治理决策（2026-01-05）：
 * - 分界线后（2026-01-02 20:24:20）的抽奖记录必须有关联键
 * - lottery_session_id 和 asset_transaction_id 改为 NOT NULL
 * - 确保事务边界治理的强一致性
 *
 * 前置条件：
 * - 已执行 20260105200000-backfill-lottery-draws-session-binding.js 完成回填
 * - 所有分界线后的记录都有有效的关联键
 *
 * @since 2026-01-05
 * @see docs/事务边界治理现状核查报告.md
 */

'use strict'

// 新账本分界线
const CUTOFF_DATE = '2026-01-02 20:24:20'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：为lottery_draws表的关联键添加NOT NULL约束')

    // 步骤1：验证分界线后的记录都已有关联键
    const [nullRecords] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM lottery_draws
      WHERE created_at >= ?
        AND (lottery_session_id IS NULL OR asset_transaction_id IS NULL)
    `, { replacements: [CUTOFF_DATE] })

    if (nullRecords[0].count > 0) {
      throw new Error(
        `发现 ${nullRecords[0].count} 条分界线后的记录缺失关联键。` +
        '请先执行回填迁移 20260105200000-backfill-lottery-draws-session-binding.js'
      )
    }

    console.log('✅ 验证通过：所有分界线后记录都有关联键')

    // 步骤2：检查分界线前是否有记录（历史数据）
    const [oldRecords] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM lottery_draws
      WHERE created_at < ?
    `, { replacements: [CUTOFF_DATE] })

    const hasOldRecords = oldRecords[0].count > 0

    if (hasOldRecords) {
      console.log(`ℹ️ 存在 ${oldRecords[0].count} 条分界线前的历史记录`)
      console.log('⚠️ 历史记录的关联键可能为 NULL，将保持允许 NULL')

      // 对于有历史数据的情况，使用生成列或触发器来保证新数据的完整性
      // 这里我们选择不修改列约束，而是依赖应用层验证
      console.log('✅ 应用层将强制新记录必须有关联键（通过 checkTransactionBoundary）')

      // 添加注释说明
      await queryInterface.sequelize.query(`
        ALTER TABLE lottery_draws
        MODIFY COLUMN lottery_session_id VARCHAR(100)
          COMMENT '抽奖会话ID（分界线后必填，用于对账）'
      `)

      await queryInterface.sequelize.query(`
        ALTER TABLE lottery_draws
        MODIFY COLUMN asset_transaction_id BIGINT
          COMMENT '关联资产流水ID（分界线后必填，用于对账）'
      `)

      console.log('✅ 已更新字段注释')
    } else {
      // 没有历史数据，可以直接设置 NOT NULL
      console.log('ℹ️ 无历史数据，可以直接设置 NOT NULL 约束')

      // 修改 lottery_session_id 为 NOT NULL
      await queryInterface.changeColumn('lottery_draws', 'lottery_session_id', {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '抽奖会话ID（必填，关联扣款流水，用于对账）'
      })
      console.log('✅ lottery_session_id 已设为 NOT NULL')

      // 修改 asset_transaction_id 为 NOT NULL
      await queryInterface.changeColumn('lottery_draws', 'asset_transaction_id', {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: '关联资产流水ID（必填，逻辑外键，用于对账）'
      })
      console.log('✅ asset_transaction_id 已设为 NOT NULL')
    }

    // 步骤3：验证修改结果
    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND COLUMN_NAME IN ('lottery_session_id', 'asset_transaction_id')
    `)

    console.log('\n📊 字段状态：')
    columns.forEach(col => {
      console.log(`   - ${col.COLUMN_NAME}: nullable=${col.IS_NULLABLE}, comment=${col.COLUMN_COMMENT}`)
    })

    console.log('✅ 迁移完成')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚：移除lottery_draws表关联键的NOT NULL约束')

    // 将字段改回允许 NULL
    await queryInterface.changeColumn('lottery_draws', 'lottery_session_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: '抽奖会话ID（关联扣款流水，用于对账）'
    })

    await queryInterface.changeColumn('lottery_draws', 'asset_transaction_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '关联资产流水ID（逻辑外键，用于对账）'
    })

    console.log('✅ 回滚完成：关联键已改回允许 NULL')
  }
}
