'use strict'

/**
 * 给 lottery_tier_matrix_config 和 lottery_strategy_config 表添加 lottery_campaign_id 列
 *
 * 背景：这两张表原为全局配置表（无活动隔离），为支持多活动场景的策略模拟，
 * 需要加上 lottery_campaign_id 列实现按活动隔离。
 *
 * 步骤：
 * 1. 添加 lottery_campaign_id 列（允许 NULL，兼容回填过程）
 * 2. 回填现有数据为 lottery_campaign_id = 1（当前唯一活动）
 * 3. 改为 NOT NULL
 * 4. 添加索引
 *
 * @see docs/策略效果模拟分析页面-设计方案.md Section 十六
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ==================== lottery_tier_matrix_config ====================
    const matrixCols = await queryInterface.describeTable('lottery_tier_matrix_config')
    if (!matrixCols.lottery_campaign_id) {
      // 步骤1：添加列（允许 NULL）
      await queryInterface.addColumn('lottery_tier_matrix_config', 'lottery_campaign_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '关联的抽奖活动ID（支持多活动策略隔离）',
        after: 'lottery_tier_matrix_config_id'
      })

      // 步骤2：回填现有数据 → campaign_id = 1
      await queryInterface.sequelize.query(
        'UPDATE lottery_tier_matrix_config SET lottery_campaign_id = 1 WHERE lottery_campaign_id IS NULL'
      )

      // 步骤3：改为 NOT NULL
      await queryInterface.changeColumn('lottery_tier_matrix_config', 'lottery_campaign_id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '关联的抽奖活动ID（支持多活动策略隔离）'
      })

      // 步骤4：添加外键约束
      await queryInterface.addConstraint('lottery_tier_matrix_config', {
        fields: ['lottery_campaign_id'],
        type: 'foreign key',
        name: 'fk_matrix_config_campaign',
        references: {
          table: 'lottery_campaigns',
          field: 'lottery_campaign_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      })

      // 步骤5：添加索引
      await queryInterface.addIndex('lottery_tier_matrix_config', ['lottery_campaign_id'], {
        name: 'idx_matrix_config_campaign'
      })

      // 步骤6：更新唯一索引（加上 campaign_id）
      await queryInterface.removeIndex('lottery_tier_matrix_config', 'uk_tier_matrix_budget_pressure').catch(() => {
        console.log('  ⚠️  唯一索引 uk_tier_matrix_budget_pressure 不存在，跳过删除')
      })
      await queryInterface.addIndex(
        'lottery_tier_matrix_config',
        ['lottery_campaign_id', 'budget_tier', 'pressure_tier'],
        {
          unique: true,
          name: 'uk_matrix_campaign_budget_pressure'
        }
      )

      console.log('  ✅ lottery_tier_matrix_config 已添加 lottery_campaign_id 列')
    } else {
      console.log('  ⏭️  lottery_tier_matrix_config 已有 lottery_campaign_id 列，跳过')
    }

    // ==================== lottery_strategy_config ====================
    const strategyCols = await queryInterface.describeTable('lottery_strategy_config')
    if (!strategyCols.lottery_campaign_id) {
      await queryInterface.addColumn('lottery_strategy_config', 'lottery_campaign_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '关联的抽奖活动ID（支持多活动策略隔离）',
        after: 'lottery_strategy_config_id'
      })

      await queryInterface.sequelize.query(
        'UPDATE lottery_strategy_config SET lottery_campaign_id = 1 WHERE lottery_campaign_id IS NULL'
      )

      await queryInterface.changeColumn('lottery_strategy_config', 'lottery_campaign_id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '关联的抽奖活动ID（支持多活动策略隔离）'
      })

      await queryInterface.addConstraint('lottery_strategy_config', {
        fields: ['lottery_campaign_id'],
        type: 'foreign key',
        name: 'fk_strategy_config_campaign',
        references: {
          table: 'lottery_campaigns',
          field: 'lottery_campaign_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      })

      await queryInterface.addIndex('lottery_strategy_config', ['lottery_campaign_id'], {
        name: 'idx_strategy_config_campaign'
      })

      // 更新唯一索引（加上 campaign_id）
      await queryInterface
        .removeIndex('lottery_strategy_config', 'uk_strategy_config_group_key_priority')
        .catch(() => {
          console.log('  ⚠️  唯一索引 uk_strategy_config_group_key_priority 不存在，跳过删除')
        })
      await queryInterface.addIndex(
        'lottery_strategy_config',
        ['lottery_campaign_id', 'config_group', 'config_key', 'priority'],
        {
          unique: true,
          name: 'uk_strategy_campaign_group_key_priority'
        }
      )

      console.log('  ✅ lottery_strategy_config 已添加 lottery_campaign_id 列')
    } else {
      console.log('  ⏭️  lottery_strategy_config 已有 lottery_campaign_id 列，跳过')
    }
  },

  async down(queryInterface) {
    // lottery_tier_matrix_config 回滚
    await queryInterface
      .removeIndex('lottery_tier_matrix_config', 'uk_matrix_campaign_budget_pressure')
      .catch(() => {})
    await queryInterface.removeIndex('lottery_tier_matrix_config', 'idx_matrix_config_campaign').catch(() => {})
    await queryInterface.removeConstraint('lottery_tier_matrix_config', 'fk_matrix_config_campaign').catch(() => {})
    await queryInterface.removeColumn('lottery_tier_matrix_config', 'lottery_campaign_id').catch(() => {})
    await queryInterface
      .addIndex('lottery_tier_matrix_config', ['budget_tier', 'pressure_tier'], {
        unique: true,
        name: 'uk_tier_matrix_budget_pressure'
      })
      .catch(() => {})

    // lottery_strategy_config 回滚
    await queryInterface
      .removeIndex('lottery_strategy_config', 'uk_strategy_campaign_group_key_priority')
      .catch(() => {})
    await queryInterface.removeIndex('lottery_strategy_config', 'idx_strategy_config_campaign').catch(() => {})
    await queryInterface.removeConstraint('lottery_strategy_config', 'fk_strategy_config_campaign').catch(() => {})
    await queryInterface.removeColumn('lottery_strategy_config', 'lottery_campaign_id').catch(() => {})
    await queryInterface
      .addIndex('lottery_strategy_config', ['config_group', 'config_key', 'priority'], {
        unique: true,
        name: 'uk_strategy_config_group_key_priority'
      })
      .catch(() => {})

    console.log('  ✅ 已回滚 lottery_campaign_id 列')
  }
}
