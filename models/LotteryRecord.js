/**
 * 抽奖记录管理模型
 * 解决抽奖业务记录追踪问题
 * 创建时间：2025年01月28日
 */

const { DataTypes } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

module.exports = sequelize => {
  const LotteryRecord = sequelize.define(
    'LotteryRecord',
    {
      lottery_id: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true,
        comment: '抽奖记录唯一标识'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      prize_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '中奖奖品ID',
        references: {
          model: 'prizes',
          key: 'prize_id'
        }
      },

      draw_type: {
        type: DataTypes.ENUM('single', 'triple', 'quintuple', 'decade'),
        allowNull: false,
        comment: '抽奖类型'
      },

      cost_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '消耗积分'
      },

      is_winner: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否中奖'
      },

      prize_type: {
        type: DataTypes.ENUM('points', 'physical', 'virtual', 'coupon', 'none'),
        allowNull: true,
        comment: '奖品类型'
      },

      prize_value: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        comment: '奖品价值'
      },

      draw_sequence: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '抽奖顺序（批量抽奖时）'
      },

      batch_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: '批量抽奖批次ID'
      },

      guarantee_triggered: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否触发保底机制'
      },

      remaining_guarantee: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '剩余保底次数'
      },

      draw_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '抽奖配置快照'
      },

      result_metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '抽奖结果元数据'
      },

      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: '用户IP地址'
      },

      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '用户代理'
      }
    },
    {
      tableName: 'lottery_records',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['user_id', 'created_at']
        },
        {
          fields: ['prize_id']
        },
        {
          fields: ['draw_type', 'created_at']
        },
        {
          fields: ['is_winner', 'created_at']
        },
        {
          fields: ['batch_id']
        },
        {
          fields: ['guarantee_triggered']
        }
      ],
      comment: '抽奖记录表'
    }
  )

  // 定义关联关系
  LotteryRecord.associate = function (models) {
    // 用户关联
    LotteryRecord.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 奖品关联
    LotteryRecord.belongsTo(models.Prize, {
      foreignKey: 'prize_id',
      as: 'prize'
    })
  }

  return LotteryRecord
}
