/**
 * 概率计算日志模型
 * @description 记录概率计算的详细过程，用于分析和优化
 * @version 4.0.0
 * @date 2025-09-10 16:49:01 北京时间
 */

const { DataTypes } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

module.exports = sequelize => {
  const ProbabilityLog = sequelize.define(
    'ProbabilityLog',
    {
      // 日志唯一ID
      log_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
        comment: '概率日志唯一标识符'
      },

      // 关联决策记录
      decision_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'unified_decision_records',
          key: 'decision_id'
        },
        comment: '关联的决策记录ID'
      },

      // 用户信息
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '用户ID'
      },

      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '活动ID'
      },

      // 概率计算步骤
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

      // 概率值
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

      // 调整因子
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

      // 详细信息
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

      // 约束和边界
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

      // 性能指标
      calculation_time_ms: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: '计算耗时（毫秒）'
      },

      // 验证和质量
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

      // 时间戳
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      }
    },
    {
      tableName: 'unified_probability_logs',
      timestamps: false,
      indexes: [
        {
          name: 'idx_decision_step',
          fields: ['decision_id', 'step_order']
        },
        {
          name: 'idx_user_factor_type',
          fields: ['user_id', 'factor_type', 'created_at']
        },
        {
          name: 'idx_campaign_calc_time',
          fields: ['campaign_id', 'created_at']
        },
        {
          name: 'idx_factor_performance',
          fields: ['factor_type', 'calculation_time_ms']
        },
        {
          name: 'idx_probability_range',
          fields: ['output_probability', 'created_at']
        }
      ],
      comment: '统一决策引擎概率计算日志表'
    }
  )

  // 关联关系
  ProbabilityLog.associate = function (models) {
    ProbabilityLog.belongsTo(models.DecisionRecord, {
      foreignKey: 'decision_id',
      as: 'decision'
    })

    ProbabilityLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })
  }

  return ProbabilityLog
}
