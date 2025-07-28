/**
 * 积分记录管理模型
 * 解决用户积分变动追踪问题
 * 创建时间：2025年01月28日
 */

const { DataTypes } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

module.exports = (sequelize) => {
  const PointsRecord = sequelize.define('PointsRecord', {
    record_id: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
      comment: '积分记录唯一标识'
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

    operation_type: {
      type: DataTypes.ENUM('earn', 'spend', 'refund', 'admin_adjust'),
      allowNull: false,
      comment: '操作类型'
    },

    points_change: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '积分变动数量（正数为增加，负数为减少）'
    },

    points_before: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '操作前积分余额'
    },

    points_after: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '操作后积分余额'
    },

    source_type: {
      type: DataTypes.ENUM('lottery', 'exchange', 'upload', 'admin', 'refund', 'bonus'),
      allowNull: false,
      comment: '积分来源类型'
    },

    source_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: '来源记录ID'
    },

    description: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '变动描述'
    },

    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '扩展信息'
    },

    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '管理员ID（管理员操作时）',
      references: {
        model: 'users',
        key: 'user_id'
      }
    },

    admin_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '管理员操作原因'
    },

    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: '操作IP地址'
    },

    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '积分过期时间（如适用）'
    }
  }, {
    tableName: 'points_records',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id', 'created_at']
      },
      {
        fields: ['operation_type', 'created_at']
      },
      {
        fields: ['source_type', 'source_id']
      },
      {
        fields: ['admin_id']
      },
      {
        fields: ['expires_at']
      }
    ],
    comment: '积分记录表'
  })

  // 定义关联关系
  PointsRecord.associate = function (models) {
    // 用户关联
    PointsRecord.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 管理员关联
    PointsRecord.belongsTo(models.User, {
      foreignKey: 'admin_id',
      as: 'admin'
    })
  }

  return PointsRecord
} 