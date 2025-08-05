/**
 * 抽奖记录管理模型 - v2.0
 * 完全匹配实际数据库表结构
 * 更新时间：2025年8月4日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const LotteryRecord = sequelize.define(
    'LotteryRecord',
    {
      // 🔴 修复主键匹配问题 - 使用实际表的主键结构
      draw_id: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        allowNull: false,
        comment: '抽奖记录主键ID'
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
          model: 'lottery_prizes',
          key: 'prize_id'
        }
      },

      // 🔴 添加实际表中存在的字段
      prize_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '奖品名称'
      },

      // 🔴 修复枚举值匹配实际表结构
      prize_type: {
        type: DataTypes.ENUM('points', 'product', 'coupon', 'special'),
        allowNull: true,
        comment: '奖品类型'
      },

      // 🔴 修复字段类型为INT匹配实际表
      prize_value: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '奖品价值'
      },

      // 🔴 修复枚举值包含实际表的所有选项
      draw_type: {
        type: DataTypes.ENUM('single', 'triple', 'quintuple', 'five', 'decade', 'ten'),
        allowNull: true,
        comment: '抽奖类型'
      },

      draw_sequence: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '抽奖顺序（批量抽奖时）'
      },

      is_pity: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否保底抽奖'
      },

      cost_points: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '消耗积分'
      },

      stop_angle: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: '转盘停止角度'
      },

      // 🔴 修复批次ID类型为VARCHAR(50)匹配实际表
      batch_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '批量抽奖批次ID'
      },

      // 🔴 添加实际表中的新字段
      draw_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '抽奖次数'
      },

      prize_description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '奖品描述'
      },

      prize_image: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '奖品图片'
      },

      is_winner: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: '是否中奖'
      },

      guarantee_triggered: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: '是否触发保底机制'
      },

      remaining_guarantee: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
      },

      // 🔴 添加实际表中的lottery_id字段（非主键）
      lottery_id: {
        type: DataTypes.CHAR(36),
        allowNull: false,
        comment: '抽奖记录UUID标识符'
      }
    },
    {
      tableName: 'lottery_records',
      timestamps: true,
      underscored: true,
      // 🔴 修复索引配置匹配实际表结构
      indexes: [
        {
          name: 'idx_user_id',
          fields: ['user_id']
        },
        {
          name: 'idx_prize_id',
          fields: ['prize_id']
        },
        {
          name: 'idx_prize_type',
          fields: ['prize_type']
        },
        {
          name: 'idx_draw_type',
          fields: ['draw_type']
        },
        {
          name: 'idx_is_pity',
          fields: ['is_pity']
        },
        {
          name: 'idx_batch_id',
          fields: ['batch_id']
        },
        {
          name: 'idx_created_at',
          fields: ['created_at']
        }
      ],
      comment: '抽奖记录表 - 完全匹配数据库结构'
    }
  )

  return LotteryRecord
}
