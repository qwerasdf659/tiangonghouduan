'use strict'

/**
 * 迁移文件：为 lottery_tier_matrix_config 表添加档位权重字段
 *
 * 背景（P0问题修复 - 2026-01-30）：
 * - TierMatrixCalculator 需要 high/mid/low/fallback 4个档位权重字段
 * - 当前数据库表只有 cap_multiplier 和 empty_weight_multiplier
 * - 需要扩展表结构以支持从数据库加载矩阵配置
 *
 * 新增字段：
 * - high_multiplier: high档位权重乘数
 * - mid_multiplier: mid档位权重乘数
 * - low_multiplier: low档位权重乘数
 * - fallback_multiplier: fallback档位权重乘数
 *
 * @version 1.0.0
 * @date 2026-01-30
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  /**
   * 执行迁移：添加4个档位权重字段并初始化默认数据
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 添加 high_multiplier 字段
      await queryInterface.addColumn(
        'lottery_tier_matrix_config',
        'high_multiplier',
        {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 0.0,
          comment: 'high档位权重乘数'
        },
        { transaction }
      )

      // 2. 添加 mid_multiplier 字段
      await queryInterface.addColumn(
        'lottery_tier_matrix_config',
        'mid_multiplier',
        {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 0.0,
          comment: 'mid档位权重乘数'
        },
        { transaction }
      )

      // 3. 添加 low_multiplier 字段
      await queryInterface.addColumn(
        'lottery_tier_matrix_config',
        'low_multiplier',
        {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 0.0,
          comment: 'low档位权重乘数'
        },
        { transaction }
      )

      // 4. 添加 fallback_multiplier 字段
      await queryInterface.addColumn(
        'lottery_tier_matrix_config',
        'fallback_multiplier',
        {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 1.0,
          comment: 'fallback档位权重乘数'
        },
        { transaction }
      )

      // 5. 初始化默认数据（与 TierMatrixCalculator 硬编码值一致）
      // 矩阵设计原则：
      // - B0（预算不足）：任何压力下都只能抽 fallback
      // - B1（低预算）：可抽 low + fallback
      // - B2（中预算）：可抽 mid + low + fallback
      // - B3（高预算）：可抽所有档位
      // - 压力越大（P2），high 乘数越低
      // - 预算越高（B3），high 乘数上限越高

      // B0: 预算不足，仅能抽 fallback
      await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config 
         SET high_multiplier = 0, mid_multiplier = 0, low_multiplier = 0, fallback_multiplier = 1.0 
         WHERE budget_tier = 'B0'`,
        { transaction }
      )

      // B1P0: 低预算+宽松
      await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config 
         SET high_multiplier = 0, mid_multiplier = 0, low_multiplier = 1.2, fallback_multiplier = 0.9 
         WHERE budget_tier = 'B1' AND pressure_tier = 'P0'`,
        { transaction }
      )
      // B1P1: 低预算+正常
      await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config 
         SET high_multiplier = 0, mid_multiplier = 0, low_multiplier = 1.0, fallback_multiplier = 1.0 
         WHERE budget_tier = 'B1' AND pressure_tier = 'P1'`,
        { transaction }
      )
      // B1P2: 低预算+紧张
      await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config 
         SET high_multiplier = 0, mid_multiplier = 0, low_multiplier = 0.8, fallback_multiplier = 1.2 
         WHERE budget_tier = 'B1' AND pressure_tier = 'P2'`,
        { transaction }
      )

      // B2P0: 中预算+宽松
      await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config 
         SET high_multiplier = 0, mid_multiplier = 1.3, low_multiplier = 1.1, fallback_multiplier = 0.8 
         WHERE budget_tier = 'B2' AND pressure_tier = 'P0'`,
        { transaction }
      )
      // B2P1: 中预算+正常
      await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config 
         SET high_multiplier = 0, mid_multiplier = 1.0, low_multiplier = 1.0, fallback_multiplier = 1.0 
         WHERE budget_tier = 'B2' AND pressure_tier = 'P1'`,
        { transaction }
      )
      // B2P2: 中预算+紧张
      await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config 
         SET high_multiplier = 0, mid_multiplier = 0.7, low_multiplier = 1.1, fallback_multiplier = 1.3 
         WHERE budget_tier = 'B2' AND pressure_tier = 'P2'`,
        { transaction }
      )

      // B3P0: 高预算+宽松
      await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config 
         SET high_multiplier = 1.5, mid_multiplier = 1.2, low_multiplier = 0.9, fallback_multiplier = 0.7 
         WHERE budget_tier = 'B3' AND pressure_tier = 'P0'`,
        { transaction }
      )
      // B3P1: 高预算+正常
      await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config 
         SET high_multiplier = 1.0, mid_multiplier = 1.0, low_multiplier = 1.0, fallback_multiplier = 1.0 
         WHERE budget_tier = 'B3' AND pressure_tier = 'P1'`,
        { transaction }
      )
      // B3P2: 高预算+紧张
      await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config 
         SET high_multiplier = 0.6, mid_multiplier = 0.8, low_multiplier = 1.2, fallback_multiplier = 1.5 
         WHERE budget_tier = 'B3' AND pressure_tier = 'P2'`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 迁移完成：添加档位权重字段并初始化默认数据')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除4个档位权重字段
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除新增的4个字段
      await queryInterface.removeColumn('lottery_tier_matrix_config', 'high_multiplier', {
        transaction
      })
      await queryInterface.removeColumn('lottery_tier_matrix_config', 'mid_multiplier', {
        transaction
      })
      await queryInterface.removeColumn('lottery_tier_matrix_config', 'low_multiplier', {
        transaction
      })
      await queryInterface.removeColumn('lottery_tier_matrix_config', 'fallback_multiplier', {
        transaction
      })

      await transaction.commit()
      console.log('✅ 回滚完成：删除档位权重字段')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
