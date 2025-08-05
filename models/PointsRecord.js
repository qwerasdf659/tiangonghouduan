/**
 * 积分记录管理模型 - v2.0
 * 完全匹配实际数据库表结构
 * 更新时间：2025年8月4日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const PointsRecord = sequelize.define(
    'PointsRecord',
    {
      // 🔴 修复主键匹配问题 - 使用实际表的主键结构
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '积分记录唯一ID'
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

      // 🔴 修复字段名匹配实际表结构
      type: {
        type: DataTypes.ENUM('earn', 'spend'),
        allowNull: false,
        comment: '操作类型：earn-获得积分，spend-消费积分'
      },

      // 🔴 匹配实际表字段名
      points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '积分变动数量'
      },

      description: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '变动描述'
      },

      // 🔴 修复枚举值匹配实际表结构
      source: {
        type: DataTypes.ENUM('photo_upload', 'lottery', 'exchange', 'check_in', 'admin', 'register'),
        allowNull: false,
        comment: '积分来源：photo_upload-图片上传，lottery-抽奖，exchange-兑换，check_in-签到，admin-管理员操作，register-注册奖励'
      },

      balance_after: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '操作后积分余额'
      },

      related_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '关联业务ID'
      }
    },
    {
      tableName: 'points_records',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false, // 🔧 修复：禁用updated_at字段，因为表中不存在
      underscored: true,
      // 🔴 修复索引配置匹配实际表结构
      indexes: [
        {
          name: 'idx_user_id',
          fields: ['user_id']
        },
        {
          name: 'idx_type',
          fields: ['type']
        },
        {
          name: 'idx_source',
          fields: ['source']
        },
        {
          name: 'idx_created_at',
          fields: ['created_at']
        }
      ],
      comment: '积分记录表 - 完全匹配数据库结构'
    }
  )

  return PointsRecord
}
