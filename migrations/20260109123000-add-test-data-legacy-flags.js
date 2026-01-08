'use strict'

/**
 * 添加测试数据和历史数据标记字段
 *
 * 业务背景（P2级 - 功能重复检查报告 2026-01-09）：
 * - asset_transactions 中有 378 条 exchange_debit 流水，但 exchange_records 是空表
 * - 说明这些是测试数据，需要标记隔离
 * - trade_records 仅剩 2 条历史数据，需要标记为遗留数据
 *
 * 决策依据（2026-01-09）：
 * 1. asset_transactions.is_test_data：
 *    - 标记测试数据，统计查询时排除
 *    - 将现有 exchange_debit 标记为测试数据
 *
 * 2. trade_records.is_legacy：
 *    - 标记历史遗留数据
 *    - trade_records 退为读模型，不再写入新数据
 *
 * 决策时间：2026-01-09
 * 风险等级：🟢 低风险（仅添加标记字段，不影响现有业务逻辑）
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：添加测试数据和历史数据标记字段（P2级）')

      // ==================== 1. asset_transactions 添加 is_test_data 字段 ====================
      console.log('\n📊 步骤1：为 asset_transactions 添加 is_test_data 字段...')

      // 1.1 检查表是否存在
      const [assetTables] = await queryInterface.sequelize.query(
        `SHOW TABLES LIKE 'asset_transactions'`,
        { transaction }
      )

      if (assetTables.length > 0) {
        // 1.2 检查字段是否已存在
        const [assetColumns] = await queryInterface.sequelize.query(
          `SHOW COLUMNS FROM asset_transactions WHERE Field = 'is_test_data'`,
          { transaction }
        )

        if (assetColumns.length === 0) {
          // 1.3 添加字段
          await queryInterface.addColumn(
            'asset_transactions',
            'is_test_data',
            {
              type: Sequelize.TINYINT(1),
              allowNull: false,
              defaultValue: 0,
              comment: '测试数据标记：0=生产数据，1=测试数据'
            },
            { transaction }
          )
          console.log('   ✅ is_test_data 字段已添加')

          // 1.4 标记现有 exchange_debit 为测试数据
          console.log('   📊 标记现有 exchange_debit 为测试数据...')
          const [updateResult] = await queryInterface.sequelize.query(
            `UPDATE asset_transactions 
             SET is_test_data = 1 
             WHERE business_type = 'exchange_debit' 
               AND created_at < '2026-01-09'`,
            { transaction }
          )
          console.log(`   ✅ 已标记 ${updateResult.affectedRows} 条测试数据`)
        } else {
          console.log('   ⏭️ is_test_data 字段已存在，跳过')
        }

        // 1.5 创建索引（优化查询性能）
        const [assetIndexes] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM asset_transactions WHERE Key_name = 'idx_asset_test_data'`,
          { transaction }
        )

        if (assetIndexes.length === 0) {
          await queryInterface.addIndex('asset_transactions', ['is_test_data', 'business_type'], {
            name: 'idx_asset_test_data',
            transaction
          })
          console.log('   ✅ 索引 idx_asset_test_data 已创建')
        }
      } else {
        console.log('   ⏭️ asset_transactions 表不存在，跳过')
      }

      // ==================== 2. trade_records 添加 is_legacy 字段 ====================
      console.log('\n📊 步骤2：为 trade_records 添加 is_legacy 字段...')

      // 2.1 检查表是否存在
      const [tradeTables] = await queryInterface.sequelize.query(
        `SHOW TABLES LIKE 'trade_records'`,
        { transaction }
      )

      if (tradeTables.length > 0) {
        // 2.2 检查字段是否已存在
        const [tradeColumns] = await queryInterface.sequelize.query(
          `SHOW COLUMNS FROM trade_records WHERE Field = 'is_legacy'`,
          { transaction }
        )

        if (tradeColumns.length === 0) {
          // 2.3 添加字段
          await queryInterface.addColumn(
            'trade_records',
            'is_legacy',
            {
              type: Sequelize.TINYINT(1),
              allowNull: false,
              defaultValue: 0,
              comment: '历史遗留数据标记：0=正常数据，1=历史遗留'
            },
            { transaction }
          )
          console.log('   ✅ is_legacy 字段已添加')

          // 2.4 标记所有现有数据为历史遗留
          console.log('   📊 标记现有数据为历史遗留...')
          const [updateResult] = await queryInterface.sequelize.query(
            `UPDATE trade_records SET is_legacy = 1`,
            { transaction }
          )
          console.log(`   ✅ 已标记 ${updateResult.affectedRows} 条历史数据`)
        } else {
          console.log('   ⏭️ is_legacy 字段已存在，跳过')
        }
      } else {
        console.log('   ⏭️ trade_records 表不存在，跳过')
      }

      // 3. 提交事务
      await transaction.commit()
      console.log('\n✅ 迁移完成：测试数据和历史数据标记字段已添加（P2级）')
      console.log('\n📝 效果：')
      console.log('   - asset_transactions: 测试数据已标记，统计时可排除')
      console.log('   - trade_records: 历史数据已标记，退为读模型')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('⚠️ 回滚操作：删除标记字段')

      // 1. 删除 asset_transactions.is_test_data
      await queryInterface.removeIndex('asset_transactions', 'idx_asset_test_data', {
        transaction
      })
      await queryInterface.removeColumn('asset_transactions', 'is_test_data', { transaction })
      console.log('   ✅ asset_transactions.is_test_data 已删除')

      // 2. 删除 trade_records.is_legacy
      await queryInterface.removeColumn('trade_records', 'is_legacy', { transaction })
      console.log('   ✅ trade_records.is_legacy 已删除')

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
