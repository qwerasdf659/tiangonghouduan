/**
 * 创建固定汇率兑换表 exchange_rates + SYSTEM_EXCHANGE 系统账户 + 初始汇率数据
 *
 * 业务场景：
 * - 固定汇率兑换：用户按平台设定的固定汇率，在不同资产之间兑换
 * - 与材料转换（material_conversion_rules）语义分离：材料转换是"合成"，汇率兑换是"货币兑换"
 * - 运营可在管理后台实时调整汇率，无需代码变更
 *
 * 初始汇率基于 material_asset_types.budget_value_points 内部锚定法（保守首发策略）
 *
 * @module migrations/20260223180000-create-exchange-rates
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 创建 exchange_rates 表 + SYSTEM_EXCHANGE 系统账户 + 初始汇率...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ============================================================
      // 第一步：创建 exchange_rates 表
      // ============================================================

      // 检查表是否已存在
      const [tables] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'exchange_rates'",
        { transaction }
      )

      if (tables.length === 0) {
        await queryInterface.createTable('exchange_rates', {
          exchange_rate_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '汇率规则ID（主键）'
          },
          from_asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '源资产代码（兑换输入）：如 red_shard'
          },
          to_asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '目标资产代码（兑换输出）：如 DIAMOND'
          },
          rate_numerator: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '汇率分子：to_amount = FLOOR(from_amount × rate_numerator ÷ rate_denominator)'
          },
          rate_denominator: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '汇率分母：使用整数分子/分母避免浮点精度问题'
          },
          min_from_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 1,
            comment: '最小兑换数量（保护性下限）'
          },
          max_from_amount: {
            type: Sequelize.BIGINT,
            allowNull: true,
            defaultValue: null,
            comment: '最大兑换数量（NULL表示无上限）'
          },
          daily_user_limit: {
            type: Sequelize.BIGINT,
            allowNull: true,
            defaultValue: null,
            comment: '每用户每日兑换限额（源资产数量，NULL表示无限制）'
          },
          daily_global_limit: {
            type: Sequelize.BIGINT,
            allowNull: true,
            defaultValue: null,
            comment: '全局每日兑换限额（源资产数量，NULL表示无限制）'
          },
          fee_rate: {
            type: Sequelize.DECIMAL(5, 4),
            allowNull: false,
            defaultValue: 0.0000,
            comment: '手续费费率：如 0.0500 = 5%，基于产出计算'
          },
          status: {
            type: Sequelize.ENUM('active', 'paused', 'disabled'),
            allowNull: false,
            defaultValue: 'active',
            comment: '状态：active-生效中 / paused-暂停（运营手动暂停） / disabled-已禁用'
          },
          priority: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '优先级：同一币对多条规则时，取 priority 最高且生效的规则'
          },
          effective_from: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: null,
            comment: '生效起始时间（NULL表示立即生效）'
          },
          effective_until: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: null,
            comment: '生效截止时间（NULL表示永不过期）'
          },
          description: {
            type: Sequelize.STRING(200),
            allowNull: true,
            defaultValue: null,
            comment: '规则描述（运营备注）'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null,
            comment: '创建人 user_id（用于审计）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间'
          }
        }, {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '固定汇率兑换规则表 — 平台设定的资产间兑换汇率配置'
        })

        console.log('  ✅ exchange_rates 表创建成功')
      } else {
        console.log('  ⏭️  exchange_rates 表已存在，跳过创建')
      }

      // ============================================================
      // 第二步：创建索引（先检查是否存在）
      // ============================================================

      const [existingIndexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM exchange_rates WHERE Key_name = 'uk_exchange_rate_pair'",
        { transaction }
      )

      if (existingIndexes.length === 0) {
        await queryInterface.addIndex('exchange_rates',
          ['from_asset_code', 'to_asset_code', 'priority', 'status'],
          { name: 'uk_exchange_rate_pair', unique: true, transaction }
        )
        console.log('  ✅ uk_exchange_rate_pair 唯一索引创建成功')
      }

      const [idxFrom] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM exchange_rates WHERE Key_name = 'idx_from_asset_status'",
        { transaction }
      )

      if (idxFrom.length === 0) {
        await queryInterface.addIndex('exchange_rates',
          ['from_asset_code', 'status'],
          { name: 'idx_from_asset_status', transaction }
        )
        console.log('  ✅ idx_from_asset_status 索引创建成功')
      }

      // ============================================================
      // 第三步：新增 SYSTEM_EXCHANGE 系统账户
      // ============================================================

      const [existingAccount] = await queryInterface.sequelize.query(
        "SELECT account_id FROM accounts WHERE system_code = 'SYSTEM_EXCHANGE'",
        { transaction }
      )

      if (existingAccount.length === 0) {
        await queryInterface.sequelize.query(
          `INSERT INTO accounts (account_type, system_code, status, created_at, updated_at)
           VALUES ('system', 'SYSTEM_EXCHANGE', 'active', NOW(), NOW())`,
          { transaction }
        )
        console.log('  ✅ SYSTEM_EXCHANGE 系统账户创建成功')
      } else {
        console.log('  ⏭️  SYSTEM_EXCHANGE 系统账户已存在，跳过')
      }

      // ============================================================
      // 第四步：插入 7 条初始汇率（保守首发策略）
      // ============================================================

      const initialRates = [
        { from: 'red_shard', to: 'DIAMOND', num: 1, den: 10, desc: '10红水晶碎片=1钻石（budget比1:10精确匹配）' },
        { from: 'orange_shard', to: 'DIAMOND', num: 1, den: 10, desc: '10橙水晶碎片=1钻石（budget比1:10精确匹配）' },
        { from: 'yellow_shard', to: 'DIAMOND', num: 1, den: 5, desc: '5黄水晶碎片=1钻石（budget比1:5精确匹配）' },
        { from: 'green_shard', to: 'DIAMOND', num: 1, den: 3, desc: '3绿水晶碎片=1钻石（budget比1:2.5→保守取3）' },
        { from: 'blue_shard', to: 'DIAMOND', num: 1, den: 2, desc: '2蓝水晶碎片=1钻石（budget比1:1.25→保守取2）' },
        { from: 'purple_shard', to: 'DIAMOND', num: 1, den: 1, desc: '1紫水晶碎片=1钻石（budget比160:100→保守压到1:1）' },
        { from: 'red_crystal', to: 'DIAMOND', num: 2, den: 1, desc: '1红水晶=2钻石（budget比50:100=1:2保守匹配）' }
      ]

      for (const rate of initialRates) {
        const [existing] = await queryInterface.sequelize.query(
          `SELECT exchange_rate_id FROM exchange_rates
           WHERE from_asset_code = '${rate.from}' AND to_asset_code = '${rate.to}' AND status = 'active'`,
          { transaction }
        )

        if (existing.length === 0) {
          await queryInterface.sequelize.query(
            `INSERT INTO exchange_rates
             (from_asset_code, to_asset_code, rate_numerator, rate_denominator,
              min_from_amount, fee_rate, status, priority, description, created_at, updated_at)
             VALUES
             (:from, :to, :num, :den, :den, 0.0000, 'active', 0, :desc, NOW(), NOW())`,
            {
              replacements: { from: rate.from, to: rate.to, num: rate.num, den: rate.den, desc: rate.desc },
              transaction
            }
          )
          console.log(`  ✅ 汇率规则 ${rate.from} → ${rate.to} (${rate.num}:${rate.den}) 写入成功`)
        } else {
          console.log(`  ⏭️  汇率规则 ${rate.from} → ${rate.to} 已存在，跳过`)
        }
      }

      await transaction.commit()
      console.log('✅ 迁移完成：exchange_rates 表 + SYSTEM_EXCHANGE 账户 + 7条初始汇率')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚：', error.message)
      throw error
    }
  },

  down: async (queryInterface) => {
    console.log('🔄 回滚：删除 exchange_rates 表 + SYSTEM_EXCHANGE 账户...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除 exchange_rates 表
      await queryInterface.dropTable('exchange_rates', { transaction })
      console.log('  ✅ exchange_rates 表已删除')

      // 删除 SYSTEM_EXCHANGE 系统账户
      await queryInterface.sequelize.query(
        "DELETE FROM accounts WHERE system_code = 'SYSTEM_EXCHANGE'",
        { transaction }
      )
      console.log('  ✅ SYSTEM_EXCHANGE 系统账户已删除')

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
