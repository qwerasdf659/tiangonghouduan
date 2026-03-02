'use strict'

/**
 * 创建 lottery_simulation_records 表
 *
 * 策略效果模拟分析功能的核心存储表，保存：
 * - 模拟参数快照（proposed_config + scenario）
 * - 模拟结果（档位分布、成本指标、体验指标）
 * - 对比分析和风险评估
 * - 偏差追踪（模拟预测 vs 实际数据）
 *
 * @see docs/策略效果模拟分析页面-设计方案.md Section 八
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.describeTable('lottery_simulation_records').catch(() => null)
    if (tableExists) {
      console.log('  ⏭️  lottery_simulation_records 表已存在，跳过创建')
      return
    }

    await queryInterface.createTable(
      'lottery_simulation_records',
      {
        /** 主键（自增） */
        lottery_simulation_record_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '模拟记录ID'
        },

        /** 关联活动ID → lottery_campaigns */
        lottery_campaign_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '关联的抽奖活动ID',
          references: {
            model: 'lottery_campaigns',
            key: 'lottery_campaign_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },

        /** 模拟名称（运营者自定义，可选） */
        simulation_name: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: '模拟名称（运营者自定义）'
        },

        /** 模拟迭代次数（1000/5000/10000/50000） */
        simulation_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '模拟迭代次数'
        },

        /** 模拟使用的提议参数快照 */
        proposed_config: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '提议参数快照（tier_rules + matrix_config + strategy_config）'
        },

        /** 场景配置（预算/压力/分群分布） */
        scenario: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '场景配置（budget_distribution + pressure_distribution + segment_distribution）'
        },

        /** 模拟结果（档位分布、成本指标、体验指标） */
        simulation_result: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '模拟结果（tier_distribution + cost_metrics + experience_metrics）'
        },

        /** 与当前配置的对比 delta */
        comparison: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '对比分析（tier_delta + cost_delta）'
        },

        /** 风险评估结果 */
        risk_assessment: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '风险评估（high_tier_risk + empty_rate_risk + budget_depletion_risk + prize_cost_rate_risk）'
        },

        /** 操作者用户ID → users */
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '创建者用户ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },

        /** 模拟记录状态 */
        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'draft',
          comment: '状态：draft=草稿 | applied=已应用到线上 | archived=已归档'
        },

        /** 配置应用到线上的时间 */
        applied_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '配置应用到线上的时间'
        },

        /** 执行应用操作的用户ID → users */
        applied_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '执行应用操作的用户ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },

        /** 偏差追踪：实际数据统计结果 */
        actual_result: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '偏差追踪：实际数据统计结果（手动触发填充）'
        },

        /** 偏差追踪：各维度偏差百分比 */
        drift_metrics: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '偏差追踪：各维度偏差百分比'
        },

        /** 偏差计算时间 */
        drift_calculated_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '偏差计算时间'
        },

        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW'),
          comment: '创建时间'
        },

        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW'),
          comment: '更新时间'
        }
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '策略效果模拟记录表 — 保存模拟参数、结果、对比、风险评估和偏差追踪'
      }
    )

    await queryInterface.addIndex('lottery_simulation_records', ['lottery_campaign_id'], {
      name: 'idx_simulation_records_campaign'
    })

    await queryInterface.addIndex('lottery_simulation_records', ['created_by'], {
      name: 'idx_simulation_records_creator'
    })

    await queryInterface.addIndex('lottery_simulation_records', ['status'], {
      name: 'idx_simulation_records_status'
    })

    await queryInterface.addIndex('lottery_simulation_records', ['created_at'], {
      name: 'idx_simulation_records_created'
    })

    console.log('  ✅ lottery_simulation_records 表创建完成')
  },

  async down(queryInterface) {
    await queryInterface.dropTable('lottery_simulation_records')
    console.log('  ✅ lottery_simulation_records 表已删除')
  }
}
