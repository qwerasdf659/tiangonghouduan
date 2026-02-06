/**
 * 迁移文件：为lottery_draws表添加lottery_session_id字段
 *
 * 治理决策（2026-01-05）：
 * - 事务边界治理要求：一个 lottery_session_id 对应一条扣款流水（批量抽奖一次性扣 N×cost）
 * - 多条 lottery_draws 允许指向同一个 asset_transaction_id
 * - 不支持单抽撤销（简化业务逻辑）
 *
 * 变更内容：
 * 1. 添加 lottery_session_id 字段（VARCHAR(100)，暂时允许NULL兼容历史数据）
 * 2. 创建索引以提升查询性能
 *
 * 业务场景：
 * - 批量抽奖时生成唯一的 lottery_session_id
 * - 通过 lottery_session_id 查询该批次所有抽奖记录
 * - 对账时通过 lottery_session_id 关联扣款流水
 *
 * @since 2026-01-05
 * @see docs/事务边界治理现状核查报告.md
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：为lottery_draws表添加lottery_session_id字段')

    // 步骤1：检查字段是否已存在
    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND COLUMN_NAME = 'lottery_session_id'
    `)

    if (columns.length > 0) {
      console.log('✅ lottery_session_id字段已存在，跳过迁移')
      return
    }

    // 步骤2：添加lottery_session_id字段
    console.log('正在添加lottery_session_id字段...')
    await queryInterface.addColumn('lottery_draws', 'lottery_session_id', {
      type: Sequelize.STRING(100),
      allowNull: true, // 暂时允许NULL，兼容历史数据
      comment: '抽奖会话ID，批量抽奖的唯一标识，关联资产流水',
      after: 'idempotency_key'
    })
    console.log('✅ 成功添加lottery_session_id字段')

    // 步骤3：为lottery_session_id字段创建索引
    console.log('正在为lottery_session_id字段创建索引...')

    const [indexes] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND INDEX_NAME = 'idx_lottery_draws_session_id'
    `)

    if (indexes.length === 0) {
      await queryInterface.addIndex('lottery_draws', ['lottery_session_id'], {
        name: 'idx_lottery_draws_session_id',
        unique: false, // 不使用唯一索引，一个session可对应多条draw
        comment: '抽奖会话索引，用于批量查询和对账'
      })
      console.log('✅ 成功创建lottery_session_id索引')
    } else {
      console.log('✅ lottery_session_id索引已存在，跳过创建')
    }

    // 步骤4：验证修改
    const [verifyColumns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND COLUMN_NAME = 'lottery_session_id'
    `)

    if (verifyColumns.length > 0) {
      const column = verifyColumns[0]
      console.log('修改后的字段信息:', {
        name: column.COLUMN_NAME,
        type: column.COLUMN_TYPE,
        nullable: column.IS_NULLABLE,
        comment: column.COLUMN_COMMENT
      })
      console.log('✅ 验证通过：lottery_session_id字段已成功添加')
    } else {
      throw new Error('验证失败：lottery_session_id字段未正确添加')
    }

    console.log('✅ 迁移完成')
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚：移除lottery_draws表的lottery_session_id字段')

    // 步骤1：检查是否有使用lottery_session_id的记录
    const [records] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM lottery_draws
      WHERE lottery_session_id IS NOT NULL
    `)

    const count = records[0].count

    if (count > 0) {
      console.warn(
        `⚠️ 警告：存在${count}条包含lottery_session_id的抽奖记录。` +
          '回滚后这些记录的lottery_session_id信息将丢失。'
      )
    }

    // 步骤2：移除索引
    console.log('正在移除lottery_session_id索引...')

    const [indexes] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND INDEX_NAME = 'idx_lottery_draws_session_id'
    `)

    if (indexes.length > 0) {
      await queryInterface.removeIndex('lottery_draws', 'idx_lottery_draws_session_id')
      console.log('✅ 成功移除lottery_session_id索引')
    } else {
      console.log('✅ lottery_session_id索引不存在，跳过移除')
    }

    // 步骤3：移除lottery_session_id字段
    console.log('正在移除lottery_session_id字段...')

    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND COLUMN_NAME = 'lottery_session_id'
    `)

    if (columns.length > 0) {
      await queryInterface.removeColumn('lottery_draws', 'lottery_session_id')
      console.log('✅ 成功移除lottery_session_id字段')
    } else {
      console.log('✅ lottery_session_id字段不存在，跳过移除')
    }

    // 步骤4：验证回滚
    const [verifyColumns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND COLUMN_NAME = 'lottery_session_id'
    `)

    if (verifyColumns.length === 0) {
      console.log('✅ 验证通过：lottery_session_id字段已成功移除')
    } else {
      throw new Error('验证失败：lottery_session_id字段未正确移除')
    }

    console.log('✅ 回滚完成')
  }
}
