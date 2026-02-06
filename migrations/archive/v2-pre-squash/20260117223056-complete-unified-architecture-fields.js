'use strict'

/**
 * 迁移文件：统一抽奖平台架构 - 补充缺失字段
 *
 * 基于《抽奖平台统一架构设计方案》V1.6文档补充现有表的缺失字段
 *
 * 本迁移修改以下表：
 * 1. lottery_campaigns - 添加预设欠账、配额、预留池相关字段
 * 2. lottery_draws - 添加管线类型、档位降级、欠账关联字段
 * 3. lottery_presets - 添加reason字段（审计追责）
 * 4. lottery_prizes - 添加reserved_for_vip字段
 *
 * 设计原则：
 * - 预设欠账控制：preset_debt_enabled、preset_budget_policy
 * - 配额管理：default_quota、quota_init_mode
 * - 预留池机制：public_pool_remaining、reserved_pool_remaining
 * - 决策审计：pipeline_type、decision_id、欠账关联
 *
 * 创建时间：2026-01-18
 * 作者：统一抽奖架构重构
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始执行统一架构字段补充迁移...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    // 辅助函数：安全添加列
    async function safeAddColumn(tableName, columnName, columnDef) {
      try {
        const columns = await queryInterface.describeTable(tableName)
        if (!columns[columnName]) {
          await queryInterface.addColumn(tableName, columnName, columnDef, { transaction })
          console.log(`  ✅ ${tableName}.${columnName} 添加成功`)
        } else {
          console.log(`  ⏭️ ${tableName}.${columnName} 已存在，跳过`)
        }
      } catch (err) {
        console.log(`  ⚠️ ${tableName}.${columnName} 添加失败: ${err.message}`)
      }
    }

    // 辅助函数：安全添加索引
    async function safeAddIndex(tableName, columns, options) {
      try {
        const [indexes] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = '${options.name}'`,
          { transaction }
        )
        if (indexes.length === 0) {
          await queryInterface.addIndex(tableName, columns, { ...options, transaction })
          console.log(`  ✅ 索引 ${options.name} 创建成功`)
        } else {
          console.log(`  ⏭️ 索引 ${options.name} 已存在，跳过`)
        }
      } catch (err) {
        console.log(`  ⚠️ 索引 ${options.name} 创建失败: ${err.message}`)
      }
    }

    try {
      // ============================================================
      // 第1部分：修改 lottery_campaigns 表
      // 添加预设欠账、配额、预留池相关字段
      // ============================================================
      console.log('\n📋 修改 lottery_campaigns 表（预设欠账/配额/预留池）...')

      // 预设欠账控制字段
      await safeAddColumn('lottery_campaigns', 'fallback_prize_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '兜底奖品ID（pick_method=fallback时使用，允许null表示自动选择prize_value_points=0的奖品）'
      })

      await safeAddColumn('lottery_campaigns', 'preset_debt_enabled', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '预设是否允许欠账（核心开关）：TRUE-允许欠账发放，FALSE-资源不足直接失败'
      })

      await safeAddColumn('lottery_campaigns', 'preset_budget_policy', {
        type: Sequelize.ENUM('follow_campaign', 'pool_first', 'user_first'),
        allowNull: false,
        defaultValue: 'follow_campaign',
        comment: '预设预算扣减策略：follow_campaign-遵循budget_mode(默认), pool_first-先pool后user, user_first-先user后pool'
      })

      // 配额管理字段
      await safeAddColumn('lottery_campaigns', 'default_quota', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '默认用户配额（pool+quota模式按需初始化时使用）'
      })

      await safeAddColumn('lottery_campaigns', 'quota_init_mode', {
        type: Sequelize.ENUM('on_demand', 'pre_allocated'),
        allowNull: false,
        defaultValue: 'on_demand',
        comment: '配额初始化模式：on_demand-按需初始化(默认), pre_allocated-预分配'
      })

      // 预留池机制字段
      await safeAddColumn('lottery_campaigns', 'public_pool_remaining', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        comment: '公共池剩余预算（普通用户可用，预留池模式时使用）'
      })

      await safeAddColumn('lottery_campaigns', 'reserved_pool_remaining', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        comment: '预留池剩余预算（白名单专用，预留池模式时使用）'
      })

      // 活动级欠账上限
      await safeAddColumn('lottery_campaigns', 'max_budget_debt', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '该活动预算欠账上限（0=不限制，强烈不推荐）'
      })

      await safeAddColumn('lottery_campaigns', 'max_inventory_debt_qty', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '该活动库存欠账总数量上限（0=不限制，强烈不推荐）'
      })

      // 添加索引
      await safeAddIndex('lottery_campaigns', ['preset_debt_enabled'], {
        name: 'idx_campaigns_preset_debt'
      })
      await safeAddIndex('lottery_campaigns', ['preset_budget_policy'], {
        name: 'idx_campaigns_budget_policy'
      })

      console.log('  ✅ lottery_campaigns 表修改完成')

      // ============================================================
      // 第2部分：修改 lottery_draws 表
      // 添加管线类型、档位降级、欠账关联字段
      // ============================================================
      console.log('\n📋 修改 lottery_draws 表（管线类型/档位降级/欠账关联）...')

      // 管线类型
      await safeAddColumn('lottery_draws', 'pipeline_type', {
        type: Sequelize.ENUM('normal', 'preset', 'override'),
        allowNull: false,
        defaultValue: 'normal',
        comment: '管线类型：normal-正常抽奖, preset-预设发放, override-管理干预'
      })

      await safeAddColumn('lottery_draws', 'pick_method', {
        type: Sequelize.STRING(32),
        allowNull: true,
        comment: '选奖方法：normalize/fallback/tier_first'
      })

      // 档位与降级相关
      await safeAddColumn('lottery_draws', 'original_tier', {
        type: Sequelize.ENUM('high', 'mid', 'low'),
        allowNull: true,
        comment: '原始命中档位（tier_first模式下抽中的档位）'
      })

      await safeAddColumn('lottery_draws', 'final_tier', {
        type: Sequelize.ENUM('high', 'mid', 'low', 'fallback'),
        allowNull: true,
        comment: '最终发放档位（降级后的档位，可能是fallback）'
      })

      await safeAddColumn('lottery_draws', 'downgrade_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '降级次数（0=未降级，便于快速统计）'
      })

      await safeAddColumn('lottery_draws', 'fallback_triggered', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否触发fallback兜底'
      })

      // 预设相关
      await safeAddColumn('lottery_draws', 'is_preset', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否为预设发放'
      })

      await safeAddColumn('lottery_draws', 'preset_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '关联预设ID（lottery_presets.preset_id）'
      })

      // 欠账关联
      await safeAddColumn('lottery_draws', 'inventory_debt_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '关联库存欠账ID（preset_inventory_debt.debt_id）'
      })

      await safeAddColumn('lottery_draws', 'budget_debt_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '关联预算欠账ID（preset_budget_debt.debt_id）'
      })

      await safeAddColumn('lottery_draws', 'has_debt', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否产生了欠账（便于快速筛选）'
      })

      // 决策快照关联
      await safeAddColumn('lottery_draws', 'decision_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment: '关联决策快照ID（lottery_draw_decisions.decision_id）'
      })

      // 添加索引
      await safeAddIndex('lottery_draws', ['pipeline_type'], {
        name: 'idx_draws_pipeline_type'
      })
      await safeAddIndex('lottery_draws', ['is_preset'], {
        name: 'idx_draws_is_preset'
      })
      await safeAddIndex('lottery_draws', ['has_debt'], {
        name: 'idx_draws_has_debt'
      })
      await safeAddIndex('lottery_draws', ['preset_id'], {
        name: 'idx_draws_preset_id'
      })
      await safeAddIndex('lottery_draws', ['decision_id'], {
        name: 'idx_draws_decision_id'
      })
      await safeAddIndex('lottery_draws', ['downgrade_count', 'fallback_triggered'], {
        name: 'idx_draws_downgrade'
      })
      await safeAddIndex('lottery_draws', ['original_tier', 'final_tier'], {
        name: 'idx_draws_tier'
      })

      console.log('  ✅ lottery_draws 表修改完成')

      // ============================================================
      // 第3部分：修改 lottery_presets 表
      // 添加reason字段（审计追责）
      // ============================================================
      console.log('\n📋 修改 lottery_presets 表（审计追责）...')

      await safeAddColumn('lottery_presets', 'reason', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '创建预设的原因/备注（审计追责用）'
      })

      console.log('  ✅ lottery_presets 表修改完成')

      // ============================================================
      // 第4部分：修改 lottery_prizes 表
      // 添加reserved_for_vip字段
      // ============================================================
      console.log('\n📋 修改 lottery_prizes 表（VIP预留）...')

      await safeAddColumn('lottery_prizes', 'reserved_for_vip', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否仅限白名单/VIP用户可抽'
      })

      await safeAddIndex('lottery_prizes', ['campaign_id', 'reserved_for_vip'], {
        name: 'idx_prizes_campaign_vip'
      })

      console.log('  ✅ lottery_prizes 表修改完成')

      // ============================================================
      // 提交事务
      // ============================================================
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 统一架构字段补充迁移执行成功！')
      console.log('='.repeat(60))
      console.log('\n📊 修改摘要:')
      console.log('  - lottery_campaigns: 预设欠账控制(3)、配额管理(2)、预留池(2)、欠账上限(2)')
      console.log('  - lottery_draws: 管线类型(2)、档位降级(4)、预设关联(2)、欠账关联(3)、决策快照(1)')
      console.log('  - lottery_presets: 审计追责(1)')
      console.log('  - lottery_prizes: VIP预留(1)')
      console.log('')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败:', error.message)
      console.error(error.stack)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 开始回滚统一架构字段补充迁移...')

    const transaction = await queryInterface.sequelize.transaction()

    // 辅助函数：安全删除列
    async function safeRemoveColumn(tableName, columnName) {
      try {
        const columns = await queryInterface.describeTable(tableName)
        if (columns[columnName]) {
          await queryInterface.removeColumn(tableName, columnName, { transaction })
          console.log(`  ✅ ${tableName}.${columnName} 已删除`)
        }
      } catch (err) {
        console.log(`  ⚠️ ${tableName}.${columnName} 删除失败: ${err.message}`)
      }
    }

    // 辅助函数：安全删除索引
    async function safeRemoveIndex(tableName, indexName) {
      try {
        const [indexes] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = '${indexName}'`,
          { transaction }
        )
        if (indexes.length > 0) {
          await queryInterface.removeIndex(tableName, indexName, { transaction })
          console.log(`  ✅ 索引 ${indexName} 已删除`)
        }
      } catch (err) {
        console.log(`  ⚠️ 索引 ${indexName} 删除失败: ${err.message}`)
      }
    }

    try {
      // 回滚 lottery_prizes 表
      console.log('\n📋 回滚 lottery_prizes 表...')
      await safeRemoveIndex('lottery_prizes', 'idx_prizes_campaign_vip')
      await safeRemoveColumn('lottery_prizes', 'reserved_for_vip')

      // 回滚 lottery_presets 表
      console.log('\n📋 回滚 lottery_presets 表...')
      await safeRemoveColumn('lottery_presets', 'reason')

      // 回滚 lottery_draws 表
      console.log('\n📋 回滚 lottery_draws 表...')
      await safeRemoveIndex('lottery_draws', 'idx_draws_tier')
      await safeRemoveIndex('lottery_draws', 'idx_draws_downgrade')
      await safeRemoveIndex('lottery_draws', 'idx_draws_decision_id')
      await safeRemoveIndex('lottery_draws', 'idx_draws_preset_id')
      await safeRemoveIndex('lottery_draws', 'idx_draws_has_debt')
      await safeRemoveIndex('lottery_draws', 'idx_draws_is_preset')
      await safeRemoveIndex('lottery_draws', 'idx_draws_pipeline_type')
      await safeRemoveColumn('lottery_draws', 'decision_id')
      await safeRemoveColumn('lottery_draws', 'has_debt')
      await safeRemoveColumn('lottery_draws', 'budget_debt_id')
      await safeRemoveColumn('lottery_draws', 'inventory_debt_id')
      await safeRemoveColumn('lottery_draws', 'preset_id')
      await safeRemoveColumn('lottery_draws', 'is_preset')
      await safeRemoveColumn('lottery_draws', 'fallback_triggered')
      await safeRemoveColumn('lottery_draws', 'downgrade_count')
      await safeRemoveColumn('lottery_draws', 'final_tier')
      await safeRemoveColumn('lottery_draws', 'original_tier')
      await safeRemoveColumn('lottery_draws', 'pick_method')
      await safeRemoveColumn('lottery_draws', 'pipeline_type')

      // 回滚 lottery_campaigns 表
      console.log('\n📋 回滚 lottery_campaigns 表...')
      await safeRemoveIndex('lottery_campaigns', 'idx_campaigns_budget_policy')
      await safeRemoveIndex('lottery_campaigns', 'idx_campaigns_preset_debt')
      await safeRemoveColumn('lottery_campaigns', 'max_inventory_debt_qty')
      await safeRemoveColumn('lottery_campaigns', 'max_budget_debt')
      await safeRemoveColumn('lottery_campaigns', 'reserved_pool_remaining')
      await safeRemoveColumn('lottery_campaigns', 'public_pool_remaining')
      await safeRemoveColumn('lottery_campaigns', 'quota_init_mode')
      await safeRemoveColumn('lottery_campaigns', 'default_quota')
      await safeRemoveColumn('lottery_campaigns', 'preset_budget_policy')
      await safeRemoveColumn('lottery_campaigns', 'preset_debt_enabled')
      await safeRemoveColumn('lottery_campaigns', 'fallback_prize_id')

      await transaction.commit()
      console.log('\n✅ 统一架构字段补充迁移回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
