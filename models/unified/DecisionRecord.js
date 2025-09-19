/**
 * V4统一抽奖引擎 - 决策记录模型
 * 记录每次抽奖决策的详细信息，包括上下文、概率、结果等
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const DecisionRecord = sequelize.define(
    'DecisionRecord',
    {
      decision_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        comment: '决策唯一标识符'
      },

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
        references: {
          model: 'lottery_campaigns',
          key: 'campaign_id'
        },
        comment: '抽奖活动ID'
      },

      strategy_type: {
        type: DataTypes.ENUM('basic', 'guarantee', 'management'),
        allowNull: false,
        comment: '抽奖策略类型'
      },

      user_context: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '用户上下文数据（JSON格式）'
      },

      probability_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '概率计算数据（JSON格式）'
      },

      // ✅ 修复：使用is_winner业务标准字段
      is_winner: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否中奖（业务标准字段）'
      },

      // 中奖奖品信息（JSON存储）
      prize_awarded: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '中奖奖品详细信息'
      },

      // 性能监控
      execution_time_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '决策执行时间（毫秒）'
      },

      random_seed: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '随机数种子（用于重现决策过程）'
      },

      decision_metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '决策元数据（算法版本、参数等）'
      }
    },
    {
      tableName: 'unified_decision_records',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: 'V4统一抽奖引擎决策记录表',
      indexes: [
        {
          fields: ['user_id', 'created_at'],
          name: 'idx_unified_decision_user_time'
        },
        {
          fields: ['campaign_id', 'strategy_type'],
          name: 'idx_unified_decision_campaign_strategy'
        },
        {
          fields: ['is_winner', 'created_at'], // ✅ 修复：使用is_winner字段索引
          name: 'idx_unified_decision_winner_time'
        },
        {
          fields: ['strategy_type', 'execution_time_ms'],
          name: 'idx_unified_decision_performance'
        }
      ]
    }
  )

  DecisionRecord.associate = function (models) {
    DecisionRecord.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    DecisionRecord.belongsTo(models.LotteryCampaign, {
      foreignKey: 'campaign_id',
      as: 'campaign'
    })
  }

  return DecisionRecord
}
