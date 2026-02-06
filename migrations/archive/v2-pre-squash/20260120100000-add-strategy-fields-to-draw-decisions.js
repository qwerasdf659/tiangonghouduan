'use strict'

/**
 * 迁移文件：为 lottery_draw_decisions 表添加策略引擎审计字段
 *
 * 基于《抽奖模块POINTS与BUDGET_POINTS平衡方案》文档中的审计字段增强设计
 *
 * 新增字段说明：
 * 1. effective_budget - 有效预算（统一计算口径）
 * 2. budget_tier - 预算分层（B0/B1/B2/B3）
 * 3. pressure_tier - 活动压力分层（P0/P1/P2）
 * 4. cap_value - 预算上限值（该 BxPx 组合允许的最大奖品价值）
 * 5. pity_decision - Pity 系统决策信息（JSON）
 * 6. luck_debt_decision - 运气债务决策信息（JSON）
 * 7. experience_smoothing - 体验平滑机制应用记录（JSON）
 *
 * 业务场景：
 * - 审计抽奖决策全过程
 * - 追踪策略引擎各组件的影响
 * - 支持问题排查和策略调优
 *
 * 创建时间：2026-01-20
 * 作者：抽奖模块策略重构
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始添加策略引擎审计字段到 lottery_draw_decisions 表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    /**
     * 辅助函数：安全添加列（先检查是否存在）
     */
    async function safeAddColumn(tableName, columnName, columnDef) {
      try {
        const [columns] = await queryInterface.sequelize.query(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}' 
           AND COLUMN_NAME = '${columnName}'`,
          { transaction }
        )
        if (columns.length === 0) {
          await queryInterface.addColumn(tableName, columnName, columnDef, { transaction })
          console.log(`    ✅ 列 ${columnName} 添加成功`)
          return true
        } else {
          console.log(`    ⏭️ 列 ${columnName} 已存在，跳过`)
          return false
        }
      } catch (err) {
        console.log(`    ⚠️ 列 ${columnName} 添加失败: ${err.message}`)
        return false
      }
    }

    /**
     * 辅助函数：安全添加索引
     */
    async function safeAddIndex(tableName, columns, options) {
      try {
        const [indexes] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = '${options.name}'`,
          { transaction }
        )
        if (indexes.length === 0) {
          await queryInterface.addIndex(tableName, columns, { ...options, transaction })
          console.log(`    ✅ 索引 ${options.name} 创建成功`)
        } else {
          console.log(`    ⏭️ 索引 ${options.name} 已存在，跳过`)
        }
      } catch (err) {
        console.log(`    ⚠️ 索引 ${options.name} 创建失败: ${err.message}`)
      }
    }

    try {
      console.log('\n📋 [1/4] 添加预算分层字段...')

      // effective_budget - 有效预算
      await safeAddColumn('lottery_draw_decisions', 'effective_budget', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '有效预算（统一计算口径，来自 StrategyEngine.computeBudgetContext）'
      })

      // budget_tier - 预算分层
      await safeAddColumn('lottery_draw_decisions', 'budget_tier', {
        type: Sequelize.STRING(10),
        allowNull: true,
        defaultValue: null,
        comment: '预算分层（B0/B1/B2/B3，来自 BudgetTierCalculator）'
      })

      // pressure_tier - 活动压力分层
      await safeAddColumn('lottery_draw_decisions', 'pressure_tier', {
        type: Sequelize.STRING(10),
        allowNull: true,
        defaultValue: null,
        comment: '活动压力分层（P0/P1/P2，来自 PressureTierCalculator）'
      })

      // cap_value - 预算上限值
      await safeAddColumn('lottery_draw_decisions', 'cap_value', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '预算上限值（该 BxPx 组合允许的最大奖品积分价值）'
      })

      console.log('\n📋 [2/4] 添加体验平滑字段...')

      // pity_decision - Pity 系统决策
      await safeAddColumn('lottery_draw_decisions', 'pity_decision', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
        comment: 'Pity 系统决策信息（包含 empty_streak, boost_multiplier, triggered）'
      })

      // luck_debt_decision - 运气债务决策
      await safeAddColumn('lottery_draw_decisions', 'luck_debt_decision', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '运气债务决策信息（包含 debt_level, multiplier, historical_empty_rate）'
      })

      // experience_smoothing - 体验平滑记录
      await safeAddColumn('lottery_draw_decisions', 'experience_smoothing', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '体验平滑机制应用记录（包含 Pity/AntiEmpty/AntiHigh 应用结果）'
      })

      console.log('\n📋 [3/4] 添加权重调整字段...')

      // weight_adjustment - BxPx 矩阵权重调整
      await safeAddColumn('lottery_draw_decisions', 'weight_adjustment', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
        comment: 'BxPx 矩阵权重调整信息（包含 base_weights, adjusted_weights, multiplier）'
      })

      // available_tiers - 可用档位列表
      await safeAddColumn('lottery_draw_decisions', 'available_tiers', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '可用档位列表（基于预算和库存过滤后的档位）'
      })

      console.log('\n📋 [4/4] 添加索引...')

      // 预算分层索引（用于分析查询）
      await safeAddIndex('lottery_draw_decisions', ['budget_tier'], {
        name: 'idx_draw_decisions_budget_tier'
      })

      // 压力分层索引
      await safeAddIndex('lottery_draw_decisions', ['pressure_tier'], {
        name: 'idx_draw_decisions_pressure_tier'
      })

      // 组合索引（用于 BxPx 矩阵分析）
      await safeAddIndex('lottery_draw_decisions', ['budget_tier', 'pressure_tier'], {
        name: 'idx_draw_decisions_bxpx_matrix'
      })

      // 提交事务
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ lottery_draw_decisions 策略审计字段添加完成！')
      console.log('='.repeat(60))
      console.log('\n📊 新增字段：')
      console.log('  - effective_budget: 有效预算')
      console.log('  - budget_tier: 预算分层 (B0/B1/B2/B3)')
      console.log('  - pressure_tier: 压力分层 (P0/P1/P2)')
      console.log('  - cap_value: 预算上限值')
      console.log('  - pity_decision: Pity 系统决策 (JSON)')
      console.log('  - luck_debt_decision: 运气债务决策 (JSON)')
      console.log('  - experience_smoothing: 体验平滑记录 (JSON)')
      console.log('  - weight_adjustment: 权重调整信息 (JSON)')
      console.log('  - available_tiers: 可用档位列表 (JSON)')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    console.log('🔄 开始回滚：删除策略引擎审计字段...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除索引
      console.log('\n🗑️ 删除索引...')
      const indexesToRemove = [
        'idx_draw_decisions_budget_tier',
        'idx_draw_decisions_pressure_tier',
        'idx_draw_decisions_bxpx_matrix'
      ]

      for (const indexName of indexesToRemove) {
        try {
          await queryInterface.removeIndex('lottery_draw_decisions', indexName, { transaction })
          console.log(`    ✅ 索引 ${indexName} 删除成功`)
        } catch (err) {
          console.log(`    ⏭️ 索引 ${indexName} 不存在或删除失败: ${err.message}`)
        }
      }

      // 删除列
      console.log('\n🗑️ 删除列...')
      const columnsToRemove = [
        'effective_budget',
        'budget_tier',
        'pressure_tier',
        'cap_value',
        'pity_decision',
        'luck_debt_decision',
        'experience_smoothing',
        'weight_adjustment',
        'available_tiers'
      ]

      for (const columnName of columnsToRemove) {
        try {
          await queryInterface.removeColumn('lottery_draw_decisions', columnName, { transaction })
          console.log(`    ✅ 列 ${columnName} 删除成功`)
        } catch (err) {
          console.log(`    ⏭️ 列 ${columnName} 不存在或删除失败: ${err.message}`)
        }
      }

      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 回滚完成！')
      console.log('='.repeat(60))
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 回滚失败:', error.message)
      throw error
    }
  }
}

