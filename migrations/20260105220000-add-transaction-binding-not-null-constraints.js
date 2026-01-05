/**
 * 迁移文件：添加事务绑定字段的强约束（事务边界治理 P1-3）
 *
 * 治理决策（2026-01-05）：
 * - 采用"应用层强一致 + DB 约束兜底"模式
 * - consumption_records: approved 状态必须有 reward_transaction_id
 * - exchange_records: debit_transaction_id 改为 NOT NULL
 *
 * 前置条件：
 * - 已执行 20260105000000-add-logical-foreign-keys-transaction-binding.js
 * - 所有现有记录都有有效的关联键（已验证）
 *
 * @since 2026-01-05
 * @see docs/事务边界治理现状核查报告.md
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：添加事务绑定字段的强约束')

    // ==================== 1. exchange_records.debit_transaction_id NOT NULL ====================
    console.log('\n[1/2] 处理 exchange_records.debit_transaction_id NOT NULL...')

    // 检查是否有 NULL 值记录
    const [exchangeNullCount] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM exchange_records
      WHERE debit_transaction_id IS NULL
    `)

    if (exchangeNullCount[0].count > 0) {
      console.log(`⚠️ 发现 ${exchangeNullCount[0].count} 条记录缺失 debit_transaction_id`)
      console.log('⚠️ 跳过 NOT NULL 约束，请先回填数据')
    } else {
      // 修改为 NOT NULL
      await queryInterface.changeColumn('exchange_records', 'debit_transaction_id', {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: '关联扣减流水ID（必填，逻辑外键，用于对账）'
      })
      console.log('✅ exchange_records.debit_transaction_id 已设为 NOT NULL')
    }

    // ==================== 2. consumption_records CHECK 约束 ====================
    console.log('\n[2/2] 处理 consumption_records CHECK 约束...')

    // 检查 MySQL 版本是否支持 CHECK 约束（MySQL 8.0.16+）
    const [versionResult] = await queryInterface.sequelize.query(`SELECT VERSION() as version`)
    const mysqlVersion = versionResult[0].version
    console.log(`MySQL 版本: ${mysqlVersion}`)

    // MySQL 8.0.16+ 支持 CHECK 约束
    const versionParts = mysqlVersion.split('.')
    const majorVersion = parseInt(versionParts[0])
    const minorVersion = parseInt(versionParts[1])
    const patchVersion = parseInt(versionParts[2])

    if (majorVersion > 8 || (majorVersion === 8 && minorVersion >= 0 && patchVersion >= 16)) {
      // 检查约束是否已存在
      const [existingConstraint] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'consumption_records'
          AND CONSTRAINT_NAME = 'chk_approved_has_reward'
      `)

      if (existingConstraint.length > 0) {
        console.log('⏭️ CHECK 约束 chk_approved_has_reward 已存在，跳过')
      } else {
        // 验证现有数据符合约束
        const [invalidRecords] = await queryInterface.sequelize.query(`
          SELECT COUNT(*) as count
          FROM consumption_records
          WHERE status = 'approved' AND reward_transaction_id IS NULL
        `)

        if (invalidRecords[0].count > 0) {
          console.log(`⚠️ 发现 ${invalidRecords[0].count} 条 approved 记录缺失 reward_transaction_id`)
          console.log('⚠️ 跳过 CHECK 约束，请先回填数据')
        } else {
          // 添加 CHECK 约束
          await queryInterface.sequelize.query(`
            ALTER TABLE consumption_records
            ADD CONSTRAINT chk_approved_has_reward
            CHECK (status != 'approved' OR reward_transaction_id IS NOT NULL)
          `)
          console.log('✅ 添加 CHECK 约束 chk_approved_has_reward 成功')
        }
      }
    } else {
      console.log('⚠️ MySQL 版本不支持 CHECK 约束，将依赖应用层验证')
      // 添加注释说明
      await queryInterface.sequelize.query(`
        ALTER TABLE consumption_records
        MODIFY COLUMN reward_transaction_id BIGINT
          COMMENT '关联奖励积分流水ID（approved 状态必填，应用层验证）'
      `)
      console.log('✅ 已更新字段注释说明约束要求')
    }

    // ==================== 验证结果 ====================
    console.log('\n📊 验证迁移结果...')

    // 验证 exchange_records
    const [exchangeCol] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'exchange_records'
        AND COLUMN_NAME = 'debit_transaction_id'
    `)
    console.log(`exchange_records.debit_transaction_id: nullable=${exchangeCol[0]?.IS_NULLABLE}`)

    // 验证 consumption_records CHECK 约束
    const [checkConstraint] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND CONSTRAINT_TYPE = 'CHECK'
    `)
    console.log(`consumption_records CHECK 约束数量: ${checkConstraint.length}`)

    console.log('\n✅ 迁移完成')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚：移除事务绑定字段的强约束')

    // 移除 exchange_records NOT NULL
    await queryInterface.changeColumn('exchange_records', 'debit_transaction_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '关联扣减流水ID（逻辑外键，用于对账）'
    })
    console.log('✅ exchange_records.debit_transaction_id 已改回允许 NULL')

    // 移除 CHECK 约束
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE consumption_records
        DROP CONSTRAINT chk_approved_has_reward
      `)
      console.log('✅ 已移除 CHECK 约束 chk_approved_has_reward')
    } catch (error) {
      console.log('⏭️ CHECK 约束不存在或移除失败:', error.message)
    }

    console.log('✅ 回滚完成')
  }
}
