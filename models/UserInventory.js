/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 用户库存模型
 * 管理用户获得的奖品、商品和优惠券
 * 创建时间：2025年01月28日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const UserInventory = sequelize.define(
    'UserInventory',
    {
      // 主键
      id: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: '库存物品唯一标识'
      },

      // 基础信息
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '物品名称'
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '物品描述'
      },

      // 物品分类
      type: {
        type: DataTypes.ENUM('voucher', 'product', 'service'),
        allowNull: false,
        comment: '物品类型：优惠券/实物商品/服务'
      },

      value: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '物品价值（积分等价值）'
      },

      // 状态管理
      status: {
        type: DataTypes.ENUM('available', 'pending', 'used', 'expired', 'transferred'),
        allowNull: false,
        defaultValue: 'available',
        comment: '物品状态'
      },

      // 来源信息
      source_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '获得来源：抽奖中奖/兑换获得/系统赠送等'
      },

      source_id: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: '来源记录ID'
      },

      // 时间信息
      acquired_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '获得时间'
      },

      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间（可选）'
      },

      used_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '使用时间'
      },

      // 核销信息
      verification_code: {
        type: DataTypes.STRING(32),
        allowNull: true,
        unique: true,
        comment: '核销码'
      },

      verification_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '核销码过期时间'
      },

      // 转让信息
      transfer_to_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '转让给的用户ID'
      },

      transfer_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '转让时间'
      },

      // 额外属性
      icon: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: '显示图标'
      }
    },
    {
      tableName: 'user_inventory',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          fields: ['user_id', 'status']
        },
        {
          fields: ['type']
        },
        {
          fields: ['expires_at']
        },
        {
          fields: ['verification_code'],
          unique: true,
          where: {
            verification_code: {
              [require('sequelize').Op.not]: null
            }
          }
        },
        {
          fields: ['source_type', 'source_id']
        }
      ],
      comment: '用户库存表'
    }
  )

  // 定义关联关系
  UserInventory.associate = function (models) {
    // 归属用户
    UserInventory.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 转让目标用户
    UserInventory.belongsTo(models.User, {
      foreignKey: 'transfer_to_user_id',
      as: 'transferTarget'
    })
  }

  // 实例方法
  UserInventory.prototype.isExpired = function () {
    if (!this.expires_at) return false
    return new Date() > this.expires_at
  }

  UserInventory.prototype.isUsable = function () {
    return this.status === 'available' && !this.isExpired()
  }

  UserInventory.prototype.getTimeRemaining = function () {
    if (!this.expires_at) return null
    const remaining = this.expires_at - new Date()
    return remaining > 0 ? remaining : 0
  }

  // 生成核销码
  UserInventory.prototype.generateVerificationCode = async function () {
    const crypto = require('crypto')
    let code
    let isUnique = false

    // 确保生成唯一的核销码
    // TODO: 性能优化 - 考虑重构避免循环中await
    while (!isUnique) {
      code = crypto.randomBytes(4).toString('hex').toUpperCase()
      const existing = await UserInventory.findOne({
        where: { verification_code: code }
      })
      isUnique = !existing
    }

    this.verification_code = code
    this.verification_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24小时后过期
    await this.save()

    return code
  }

  return UserInventory
}
