'use strict'

/**
 * 数据库迁移：交易市场多币种配置
 *
 * 迁移目的：
 * 1. 扩展 material_asset_types.form 枚举，添加 'currency' 类型
 * 2. 添加 DIAMOND 到 material_asset_types 表（作为可交易货币）
 * 3. 添加多币种相关的 system_settings 配置项（P0 + P1 共 13 项）
 *
 * 关联文档：
 * - docs/交易市场多币种扩展功能-待办清单-2026-01-14.md
 * - docs/材料转换系统降维护成本方案-2026-01-13.md
 *
 * 核心决策（来源：2026-01-14 拍板）：
 * - 跨币支付：❌ 不允许（同一订单只用一种结算币）
 * - 同物多币挂牌：❌ 不允许（防止价格混乱）
 * - DIAMOND 手续费：分档逻辑（按 itemValue 分档 + ceil + 最低费）
 * - red_shard 手续费：单一费率 5%，最低 1
 * - red_shard 价格区间：[1, 1,000,000]
 *
 * @version 1.0.0
 * @date 2026-01-14
 */

module.exports = {
  /**
   * 执行迁移：添加多币种配置
   *
   * @param {object} queryInterface - Sequelize QueryInterface 实例
   * @param {object} Sequelize - Sequelize 构造函数（用于数据类型）
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 [迁移开始] 交易市场多币种配置...')

      // ============================================
      // 步骤1：扩展 material_asset_types.form 枚举
      // ============================================
      console.log('📌 步骤1: 扩展 form 枚举，添加 currency 类型...')

      await queryInterface.sequelize.query(
        `ALTER TABLE material_asset_types 
         MODIFY COLUMN form ENUM('shard', 'crystal', 'currency') NOT NULL 
         COMMENT '形态（Form）：shard-碎片，crystal-水晶，currency-货币'`,
        { transaction }
      )
      console.log('✅ form 枚举已扩展')

      // ============================================
      // 步骤2：添加 DIAMOND 到 material_asset_types
      // ============================================
      console.log('📌 步骤2: 添加 DIAMOND 到材料类型表...')

      // 检查 DIAMOND 是否已存在
      const [existingDiamond] = await queryInterface.sequelize.query(
        `SELECT asset_code FROM material_asset_types WHERE asset_code = 'DIAMOND'`,
        { transaction }
      )

      if (existingDiamond.length === 0) {
        await queryInterface.bulkInsert(
          'material_asset_types',
          [
            {
              asset_code: 'DIAMOND',
              display_name: '钻石',
              group_code: 'CURRENCY',
              form: 'currency',
              tier: 10, // 货币层级最高
              sort_order: 1,
              visible_value_points: 100, // 1 DIAMOND = 100 可见价值点
              budget_value_points: 100,
              is_enabled: 1,
              is_tradable: 1, // 可在C2C市场交易
              created_at: new Date(),
              updated_at: new Date()
            }
          ],
          { transaction }
        )
        console.log('✅ DIAMOND 已添加到材料类型表')
      } else {
        // 如果已存在，确保 is_tradable = 1
        await queryInterface.sequelize.query(
          `UPDATE material_asset_types SET is_tradable = 1, form = 'currency', updated_at = NOW() 
           WHERE asset_code = 'DIAMOND'`,
          { transaction }
        )
        console.log('✅ DIAMOND 已存在，已更新 is_tradable = 1')
      }

      // ============================================
      // 步骤3：添加 P0 多币种配置（7项）
      // ============================================
      console.log('📌 步骤3: 添加 P0 多币种配置项...')

      const p0Configs = [
        // 白名单币种配置
        {
          category: 'marketplace',
          setting_key: 'allowed_settlement_assets',
          setting_value: '["DIAMOND","red_shard"]',
          value_type: 'json',
          description: '交易市场允许的结算币种白名单（JSON数组格式）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        // DIAMOND 手续费率（分档逻辑由代码控制，此处为基础费率）
        {
          category: 'marketplace',
          setting_key: 'fee_rate_DIAMOND',
          setting_value: '0.05',
          value_type: 'number',
          description: 'DIAMOND结算基础手续费率（5%，实际按价值分档计算）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        // red_shard 手续费率（单一费率）
        {
          category: 'marketplace',
          setting_key: 'fee_rate_red_shard',
          setting_value: '0.05',
          value_type: 'number',
          description: 'red_shard结算手续费率（5%，单一费率模式）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        // DIAMOND 最低手续费
        {
          category: 'marketplace',
          setting_key: 'fee_min_DIAMOND',
          setting_value: '1',
          value_type: 'number',
          description: 'DIAMOND最低手续费（不低于1 DIAMOND）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        // red_shard 最低手续费
        {
          category: 'marketplace',
          setting_key: 'fee_min_red_shard',
          setting_value: '1',
          value_type: 'number',
          description: 'red_shard最低手续费（不低于1 red_shard）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        // red_shard 最低挂牌价（硬兜底）
        {
          category: 'marketplace',
          setting_key: 'min_price_red_shard',
          setting_value: '1',
          value_type: 'number',
          description: 'red_shard最低挂牌价（硬兜底下限，低于此价格拒绝挂牌）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        // red_shard 最高挂牌价（硬兜底）
        {
          category: 'marketplace',
          setting_key: 'max_price_red_shard',
          setting_value: '1000000',
          value_type: 'number',
          description: 'red_shard最高挂牌价（硬兜底上限，超出此价格拒绝挂牌）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]

      // 使用 ON DUPLICATE KEY UPDATE 避免重复插入
      for (const config of p0Configs) {
        const [existing] = await queryInterface.sequelize.query(
          `SELECT setting_id FROM system_settings WHERE setting_key = ?`,
          {
            replacements: [config.setting_key],
            transaction
          }
        )

        if (existing.length === 0) {
          await queryInterface.bulkInsert('system_settings', [config], {
            transaction
          })
          console.log(`  ✅ 已添加: ${config.setting_key}`)
        } else {
          console.log(`  ⏭️ 已存在: ${config.setting_key}`)
        }
      }

      // ============================================
      // 步骤4：添加 P1 风控配置（6项）
      // ============================================
      console.log('📌 步骤4: 添加 P1 风控配置项...')

      const p1Configs = [
        // DIAMOND 日挂单上限
        {
          category: 'marketplace',
          setting_key: 'daily_max_listings_DIAMOND',
          setting_value: '20',
          value_type: 'number',
          description: 'DIAMOND日挂单次数上限（每用户每日最多20次）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        // red_shard 日挂单上限
        {
          category: 'marketplace',
          setting_key: 'daily_max_listings_red_shard',
          setting_value: '20',
          value_type: 'number',
          description: 'red_shard日挂单次数上限（每用户每日最多20次）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        // DIAMOND 日成交上限
        {
          category: 'marketplace',
          setting_key: 'daily_max_trades_DIAMOND',
          setting_value: '10',
          value_type: 'number',
          description: 'DIAMOND日成交次数上限（每用户每日最多10次）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        // red_shard 日成交上限
        {
          category: 'marketplace',
          setting_key: 'daily_max_trades_red_shard',
          setting_value: '10',
          value_type: 'number',
          description: 'red_shard日成交次数上限（每用户每日最多10次）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        // DIAMOND 日成交额上限
        {
          category: 'marketplace',
          setting_key: 'daily_max_amount_DIAMOND',
          setting_value: '100000',
          value_type: 'number',
          description: 'DIAMOND日成交额上限（每用户每日最多100,000 DIAMOND）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        // red_shard 日成交额上限
        {
          category: 'marketplace',
          setting_key: 'daily_max_amount_red_shard',
          setting_value: '50000',
          value_type: 'number',
          description: 'red_shard日成交额上限（每用户每日最多50,000 red_shard）',
          is_visible: 1,
          is_readonly: 0,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]

      for (const config of p1Configs) {
        const [existing] = await queryInterface.sequelize.query(
          `SELECT setting_id FROM system_settings WHERE setting_key = ?`,
          {
            replacements: [config.setting_key],
            transaction
          }
        )

        if (existing.length === 0) {
          await queryInterface.bulkInsert('system_settings', [config], {
            transaction
          })
          console.log(`  ✅ 已添加: ${config.setting_key}`)
        } else {
          console.log(`  ⏭️ 已存在: ${config.setting_key}`)
        }
      }

      // 提交事务
      await transaction.commit()

      console.log('🎉 [迁移完成] 交易市场多币种配置已添加')
      console.log('📊 汇总:')
      console.log('  - form 枚举已扩展（添加 currency）')
      console.log('  - DIAMOND 已添加到材料类型表')
      console.log('  - P0 配置项: 7 项')
      console.log('  - P1 风控配置项: 6 项')
      console.log('  - 总计: 13 个新配置项')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ [迁移失败]', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：移除多币种配置
   *
   * @param {object} queryInterface - Sequelize QueryInterface 实例
   * @param {object} Sequelize - Sequelize 构造函数
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔙 [回滚开始] 移除交易市场多币种配置...')

      // 删除 P1 风控配置
      const p1Keys = [
        'daily_max_listings_DIAMOND',
        'daily_max_listings_red_shard',
        'daily_max_trades_DIAMOND',
        'daily_max_trades_red_shard',
        'daily_max_amount_DIAMOND',
        'daily_max_amount_red_shard'
      ]

      await queryInterface.sequelize.query(`DELETE FROM system_settings WHERE setting_key IN (?)`, {
        replacements: [p1Keys],
        transaction
      })
      console.log('✅ P1 风控配置已删除')

      // 删除 P0 配置
      const p0Keys = [
        'allowed_settlement_assets',
        'fee_rate_DIAMOND',
        'fee_rate_red_shard',
        'fee_min_DIAMOND',
        'fee_min_red_shard',
        'min_price_red_shard',
        'max_price_red_shard'
      ]

      await queryInterface.sequelize.query(`DELETE FROM system_settings WHERE setting_key IN (?)`, {
        replacements: [p0Keys],
        transaction
      })
      console.log('✅ P0 配置已删除')

      // 删除 DIAMOND 记录
      await queryInterface.sequelize.query(
        `DELETE FROM material_asset_types WHERE asset_code = 'DIAMOND'`,
        { transaction }
      )
      console.log('✅ DIAMOND 已从材料类型表删除')

      // 恢复 form 枚举（移除 currency）
      await queryInterface.sequelize.query(
        `ALTER TABLE material_asset_types 
         MODIFY COLUMN form ENUM('shard', 'crystal') NOT NULL 
         COMMENT '形态（Form）：shard-碎片，crystal-水晶'`,
        { transaction }
      )
      console.log('✅ form 枚举已恢复')

      await transaction.commit()
      console.log('🎉 [回滚完成]')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [回滚失败]', error.message)
      throw error
    }
  }
}
