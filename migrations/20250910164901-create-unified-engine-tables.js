/**
 * 统一决策引擎V4.0数据库迁移
 * 创建统一决策引擎所需的数据表
 *
 * @description 创建DecisionRecord、ProbabilityLog、SystemMetrics三个核心表
 * @version 4.0.0
 * @date 2025-09-10 16:49:01 北京时间
 */

'use strict'

const { DataTypes } = require('sequelize')

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始创建统一决策引擎数据表...')

    // 创建统一决策记录表
    await queryInterface.createTable(
      'unified_decision_records',
      {
        decision_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
          comment: '决策唯一标识符'
        },

        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
          comment: '用户ID'
        },

        campaign_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'lottery_campaigns',
            key: 'campaign_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
          comment: '活动ID'
        },

        decision_context: {
          type: DataTypes.JSON,
          allowNull: true,
          comment: '决策上下文数据：用户历史、池状态、活动配置等'
        },

        probability_factors: {
          type: DataTypes.JSON,
          allowNull: true,
          comment: '影响概率的各种因素：时间、等级、稀缺性等'
        },

        base_probability: {
          type: DataTypes.DECIMAL(5, 4),
          allowNull: true,
          comment: '基础概率值'
        },

        final_probability: {
          type: DataTypes.DECIMAL(5, 4),
          allowNull: false,
          comment: '最终使用的概率值'
        },

        guarantee_triggered: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          comment: '是否触发保底机制'
        },

        guarantee_type: {
          type: DataTypes.ENUM('none', 'probability_boost', 'force_win'),
          defaultValue: 'none',
          comment: '保底触发类型'
        },

        consecutive_losses: {
          type: DataTypes.INTEGER,
          defaultValue: 0,
          comment: '连续未中奖次数'
        },

        pool_selected: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: '选择的奖品池标识'
        },

        pool_selection_reason: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: '奖品池选择原因'
        },

        decision_result: {
          type: DataTypes.ENUM('win', 'lose'),
          allowNull: false,
          comment: '决策结果：中奖或未中奖'
        },

        prize_awarded: {
          type: DataTypes.JSON,
          allowNull: true,
          comment: '中奖奖品详细信息'
        },

        execution_time_ms: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: '决策执行时间（毫秒）'
        },

        engine_version: {
          type: DataTypes.STRING(20),
          defaultValue: '4.0.0',
          comment: '决策引擎版本'
        },

        request_source: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: '请求来源：api_v4, app, web等'
        },

        created_at: {
          type: DataTypes.DATE,
          defaultValue: Sequelize.fn('NOW'),
          comment: '创建时间'
        }
      },
      {
        comment: '统一决策引擎决策记录表',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
      }
    )

    // 创建决策记录表的索引
    await queryInterface.addIndex('unified_decision_records', {
      fields: ['user_id', 'created_at'],
      name: 'idx_user_decision_time'
    })

    await queryInterface.addIndex('unified_decision_records', {
      fields: ['campaign_id', 'decision_result'],
      name: 'idx_campaign_result'
    })

    await queryInterface.addIndex('unified_decision_records', {
      fields: ['guarantee_triggered', 'created_at'],
      name: 'idx_guarantee_triggered'
    })

    await queryInterface.addIndex('unified_decision_records', {
      fields: ['decision_result', 'created_at'],
      name: 'idx_decision_result'
    })

    await queryInterface.addIndex('unified_decision_records', {
      fields: ['execution_time_ms', 'created_at'],
      name: 'idx_execution_performance'
    })

    console.log('✅ 统一决策记录表创建完成')

    // ⚠️ 概率计算日志表创建已禁用 - 过度设计功能，已删除模型 - 2025年01月21日
    /*
    // 创建概率计算日志表
    await queryInterface.createTable(
      'unified_probability_logs',
      {
        log_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
          comment: '概率日志唯一标识符'
        },

        decision_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'unified_decision_records',
            key: 'decision_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
          comment: '关联的决策记录ID'
        },

        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
          comment: '用户ID'
        },

        campaign_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: '活动ID'
        },

        calculation_step: {
          type: DataTypes.STRING(50),
          allowNull: false,
          comment: '计算步骤：base_calc, dynamic_adjust, guarantee_boost等'
        },

        step_order: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: '步骤顺序'
        },

        input_probability: {
          type: DataTypes.DECIMAL(8, 6),
          allowNull: true,
          comment: '输入概率值'
        },

        output_probability: {
          type: DataTypes.DECIMAL(8, 6),
          allowNull: false,
          comment: '输出概率值'
        },

        adjustment_factor: {
          type: DataTypes.DECIMAL(6, 4),
          defaultValue: 1.0,
          comment: '调整因子'
        },

        factor_type: {
          type: DataTypes.ENUM(
            'base_probability',
            'time_slot',
            'user_level',
            'pool_scarcity',
            'guarantee_boost',
            'force_win',
            'boundary_limit'
          ),
          allowNull: false,
          comment: '因子类型'
        },

        factor_details: {
          type: DataTypes.JSON,
          allowNull: true,
          comment: '因子详细信息：触发条件、计算过程等'
        },

        calculation_reason: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: '计算原因说明'
        },

        min_probability: {
          type: DataTypes.DECIMAL(5, 4),
          allowNull: true,
          comment: '最小概率限制'
        },

        max_probability: {
          type: DataTypes.DECIMAL(5, 4),
          allowNull: true,
          comment: '最大概率限制'
        },

        is_boundary_applied: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          comment: '是否应用了边界限制'
        },

        calculation_time_ms: {
          type: DataTypes.FLOAT,
          allowNull: true,
          comment: '计算耗时（毫秒）'
        },

        is_valid: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
          comment: '计算结果是否有效'
        },

        validation_error: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: '验证错误信息'
        },

        created_at: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
          comment: '创建时间'
        }
      },
      {
        comment: '统一决策引擎概率计算日志表'
      }
    )

    // 添加概率日志表索引
    await queryInterface.addIndex('unified_probability_logs', {
      fields: ['decision_id', 'step_order'],
      name: 'idx_decision_step'
    })
    await queryInterface.addIndex('unified_probability_logs', {
      fields: ['user_id', 'factor_type', 'created_at'],
      name: 'idx_user_factor_type'
    })
    await queryInterface.addIndex('unified_probability_logs', {
      fields: ['campaign_id', 'created_at'],
      name: 'idx_campaign_calc_time'
    })
    await queryInterface.addIndex('unified_probability_logs', {
      fields: ['factor_type', 'calculation_time_ms'],
      name: 'idx_factor_performance'
    })
    await queryInterface.addIndex('unified_probability_logs', {
      fields: ['output_probability', 'created_at'],
      name: 'idx_probability_range'
    })

    console.log('✅ 概率计算日志表创建完成')
    */
    console.log('ℹ️ 概率计算日志表创建已跳过（模型已删除）')

    // ⚠️ 系统指标监控表创建已禁用 - 过度设计功能，已删除模型 - 2025年01月21日
    /*
    // 创建系统指标监控表
    await queryInterface.createTable(
      'unified_system_metrics',
      {
        metric_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
          comment: '指标记录唯一标识符'
        },

        metric_type: {
          type: DataTypes.ENUM(
            'performance',
            'business',
            'error_rate',
            'throughput',
            'cache_hit_rate',
            'database_performance',
            'engine_health',
            'user_experience'
          ),
          allowNull: false,
          comment: '指标类型'
        },

        metric_name: {
          type: DataTypes.STRING(100),
          allowNull: false,
          comment: '指标名称'
        },

        metric_category: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: '指标分类'
        },

        metric_value: {
          type: DataTypes.DECIMAL(15, 6),
          allowNull: false,
          comment: '指标数值'
        },

        metric_unit: {
          type: DataTypes.STRING(20),
          allowNull: true,
          comment: '指标单位：ms, percentage, count, MB等'
        },

        threshold_warning: {
          type: DataTypes.DECIMAL(15, 6),
          allowNull: true,
          comment: '警告阈值'
        },

        threshold_critical: {
          type: DataTypes.DECIMAL(15, 6),
          allowNull: true,
          comment: '严重阈值'
        },

        alert_triggered: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          comment: '是否触发告警'
        },

        alert_level: {
          type: DataTypes.ENUM('normal', 'warning', 'critical'),
          defaultValue: 'normal',
          comment: '告警级别'
        },

        measurement_time: {
          type: DataTypes.DATE,
          allowNull: false,
          comment: '测量时间'
        },

        time_window: {
          type: DataTypes.STRING(20),
          allowNull: true,
          comment: '时间窗口：1min, 5min, 1hour等'
        },

        campaign_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: '关联活动ID（如适用）'
        },

        user_segment: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: '用户分群：new_user, vip, normal等'
        },

        metric_details: {
          type: DataTypes.JSON,
          allowNull: true,
          comment: '指标详细数据：分项统计、趋势数据等'
        },

        aggregation_method: {
          type: DataTypes.ENUM('avg', 'sum', 'count', 'min', 'max', 'p95', 'p99'),
          defaultValue: 'avg',
          comment: '聚合方法'
        },

        sample_size: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: '样本大小'
        },

        engine_version: {
          type: DataTypes.STRING(20),
          defaultValue: '4.0.0',
          comment: '引擎版本'
        },

        system_environment: {
          type: DataTypes.STRING(20),
          allowNull: true,
          comment: '系统环境：production, staging, development'
        },

        baseline_value: {
          type: DataTypes.DECIMAL(15, 6),
          allowNull: true,
          comment: '基准值'
        },

        improvement_percentage: {
          type: DataTypes.DECIMAL(8, 4),
          allowNull: true,
          comment: '相比基准的改进百分比'
        },

        is_valid: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
          comment: '数据是否有效'
        },

        validation_errors: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: '数据验证错误'
        },

        created_at: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
          comment: '记录创建时间'
        }
      },
      {
        comment: '统一决策引擎系统指标监控表'
      }
    )

    // 添加系统指标表索引
    await queryInterface.addIndex('unified_system_metrics', {
      fields: ['metric_type', 'measurement_time'],
      name: 'idx_metric_type_time'
    })
    await queryInterface.addIndex('unified_system_metrics', {
      fields: ['metric_name', 'measurement_time'],
      name: 'idx_metric_name_time'
    })
    await queryInterface.addIndex('unified_system_metrics', {
      fields: ['alert_level', 'measurement_time'],
      name: 'idx_alert_level_time'
    })
    await queryInterface.addIndex('unified_system_metrics', {
      fields: ['campaign_id', 'metric_type', 'measurement_time'],
      name: 'idx_campaign_metrics'
    })
    await queryInterface.addIndex('unified_system_metrics', {
      fields: ['metric_name', 'metric_value', 'measurement_time'],
      name: 'idx_performance_trend'
    })
    await queryInterface.addIndex('unified_system_metrics', {
      fields: ['engine_version', 'alert_triggered', 'measurement_time'],
      name: 'idx_system_health'
    })

    console.log('✅ 系统指标监控表创建完成')
    */
    console.log('ℹ️ 系统指标监控表创建已跳过（模型已删除）')
    console.log('🎯 统一决策引擎V4.0数据表创建成功！')
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🗑️ 开始删除统一决策引擎数据表...')

    // ⚠️ 删除系统指标监控表已禁用 - 模型已删除
    // await queryInterface.dropTable('unified_system_metrics')
    // console.log('✅ 删除系统指标监控表')
    console.log('ℹ️ 系统指标监控表删除已跳过（模型已删除）')

    // ⚠️ 删除概率计算日志表已禁用 - 模型已删除
    // await queryInterface.dropTable('unified_probability_logs')
    // console.log('✅ 删除概率计算日志表')
    console.log('ℹ️ 概率计算日志表删除已跳过（模型已删除）')

    // 删除统一决策记录表
    await queryInterface.dropTable('unified_decision_records')
    console.log('✅ 删除统一决策记录表')

    console.log('🗑️ 统一决策引擎数据表删除完成')
  }
}
