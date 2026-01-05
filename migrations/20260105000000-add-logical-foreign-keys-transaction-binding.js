/**
 * 迁移文件：添加逻辑外键关联字段（事务边界治理 P1-2）
 *
 * 治理决策（2026-01-05）：
 * - 采用"逻辑外键"模式：全量回填 + NOT NULL + 索引（不加 FK 约束）
 * - 原因：支持未来分库分表、跨库对账
 * - 一致性保障：应用层事务 + 定时对账脚本
 *
 * 变更内容：
 * 1. lottery_draws 添加 asset_transaction_id（关联抽奖积分扣减流水）
 * 2. consumption_records 添加 reward_transaction_id（关联消费奖励积分发放流水）
 * 3. exchange_records 添加 debit_transaction_id（关联兑换扣减流水）
 *
 * 业务场景：
 * - 对账时通过 transaction_id 查找对应的 asset_transactions 记录
 * - 发现数据不一致时报警 + 人工修复
 *
 * @since 2026-01-05
 * @see docs/事务边界治理现状核查报告.md
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：添加逻辑外键关联字段（事务边界治理 P1-2）')

    // ==================== 1. lottery_draws.asset_transaction_id ====================
    console.log('\n[1/3] 处理 lottery_draws.asset_transaction_id...')

    // 检查字段是否存在
    const [lotteryTxIdExists] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND COLUMN_NAME = 'asset_transaction_id'
    `)

    if (lotteryTxIdExists.length === 0) {
      await queryInterface.addColumn('lottery_draws', 'asset_transaction_id', {
        type: Sequelize.BIGINT,
        allowNull: true, // 暂时允许 NULL（历史数据未回填）
        comment: '关联资产流水ID（逻辑外键，用于对账）',
        after: 'idempotency_key'
      })
      console.log('✅ 添加 lottery_draws.asset_transaction_id 字段成功')

      // 添加索引
      await queryInterface.addIndex('lottery_draws', ['asset_transaction_id'], {
        name: 'idx_lottery_draws_asset_tx_id'
      })
      console.log('✅ 创建 idx_lottery_draws_asset_tx_id 索引成功')
    } else {
      console.log('⏭️ lottery_draws.asset_transaction_id 已存在，跳过')
    }

    // ==================== 2. consumption_records.reward_transaction_id ====================
    console.log('\n[2/3] 处理 consumption_records.reward_transaction_id...')

    const [consumptionTxIdExists] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND COLUMN_NAME = 'reward_transaction_id'
    `)

    if (consumptionTxIdExists.length === 0) {
      await queryInterface.addColumn('consumption_records', 'reward_transaction_id', {
        type: Sequelize.BIGINT,
        allowNull: true, // 消费未必有奖励（审核拒绝等情况）
        comment: '关联奖励积分流水ID（逻辑外键，用于对账，审核通过后填充）',
        after: 'idempotency_key'
      })
      console.log('✅ 添加 consumption_records.reward_transaction_id 字段成功')

      // 添加索引
      await queryInterface.addIndex('consumption_records', ['reward_transaction_id'], {
        name: 'idx_consumption_records_reward_tx_id'
      })
      console.log('✅ 创建 idx_consumption_records_reward_tx_id 索引成功')
    } else {
      console.log('⏭️ consumption_records.reward_transaction_id 已存在，跳过')
    }

    // ==================== 3. exchange_records.debit_transaction_id ====================
    console.log('\n[3/3] 处理 exchange_records.debit_transaction_id...')

    const [exchangeTxIdExists] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'exchange_records'
        AND COLUMN_NAME = 'debit_transaction_id'
    `)

    if (exchangeTxIdExists.length === 0) {
      await queryInterface.addColumn('exchange_records', 'debit_transaction_id', {
        type: Sequelize.BIGINT,
        allowNull: true, // 暂时允许 NULL（历史数据未回填）
        comment: '关联扣减流水ID（逻辑外键，用于对账）',
        after: 'idempotency_key'
      })
      console.log('✅ 添加 exchange_records.debit_transaction_id 字段成功')

      // 添加索引
      await queryInterface.addIndex('exchange_records', ['debit_transaction_id'], {
        name: 'idx_exchange_records_debit_tx_id'
      })
      console.log('✅ 创建 idx_exchange_records_debit_tx_id 索引成功')
    } else {
      console.log('⏭️ exchange_records.debit_transaction_id 已存在，跳过')
    }

    // ==================== 验证结果 ====================
    console.log('\n📊 验证迁移结果...')

    const [verifyLottery] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND COLUMN_NAME = 'asset_transaction_id'
    `)

    const [verifyConsumption] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND COLUMN_NAME = 'reward_transaction_id'
    `)

    const [verifyExchange] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'exchange_records'
        AND COLUMN_NAME = 'debit_transaction_id'
    `)

    console.log('验证结果:')
    console.log(`  lottery_draws.asset_transaction_id: ${verifyLottery.length > 0 ? '✅' : '❌'}`)
    console.log(`  consumption_records.reward_transaction_id: ${verifyConsumption.length > 0 ? '✅' : '❌'}`)
    console.log(`  exchange_records.debit_transaction_id: ${verifyExchange.length > 0 ? '✅' : '❌'}`)

    if (verifyLottery.length === 0 || verifyConsumption.length === 0 || verifyExchange.length === 0) {
      throw new Error('迁移验证失败：部分字段未正确创建')
    }

    console.log('\n✅ 迁移完成：逻辑外键关联字段已添加')
    console.log('📌 下一步：运行对账脚本检查数据一致性')
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚：移除逻辑外键关联字段')

    // 移除 lottery_draws.asset_transaction_id
    const [lotteryIdxExists] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND INDEX_NAME = 'idx_lottery_draws_asset_tx_id'
    `)
    if (lotteryIdxExists.length > 0) {
      await queryInterface.removeIndex('lottery_draws', 'idx_lottery_draws_asset_tx_id')
    }

    const [lotteryColExists] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lottery_draws'
        AND COLUMN_NAME = 'asset_transaction_id'
    `)
    if (lotteryColExists.length > 0) {
      await queryInterface.removeColumn('lottery_draws', 'asset_transaction_id')
    }

    // 移除 consumption_records.reward_transaction_id
    const [consumptionIdxExists] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND INDEX_NAME = 'idx_consumption_records_reward_tx_id'
    `)
    if (consumptionIdxExists.length > 0) {
      await queryInterface.removeIndex('consumption_records', 'idx_consumption_records_reward_tx_id')
    }

    const [consumptionColExists] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND COLUMN_NAME = 'reward_transaction_id'
    `)
    if (consumptionColExists.length > 0) {
      await queryInterface.removeColumn('consumption_records', 'reward_transaction_id')
    }

    // 移除 exchange_records.debit_transaction_id
    const [exchangeIdxExists] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'exchange_records'
        AND INDEX_NAME = 'idx_exchange_records_debit_tx_id'
    `)
    if (exchangeIdxExists.length > 0) {
      await queryInterface.removeIndex('exchange_records', 'idx_exchange_records_debit_tx_id')
    }

    const [exchangeColExists] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'exchange_records'
        AND COLUMN_NAME = 'debit_transaction_id'
    `)
    if (exchangeColExists.length > 0) {
      await queryInterface.removeColumn('exchange_records', 'debit_transaction_id')
    }

    console.log('✅ 回滚完成')
  }
}
