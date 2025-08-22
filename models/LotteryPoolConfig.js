/**
 * 🔥 抽奖池配置模型 v3.0
 * 创建时间：2025年08月22日 11:38 UTC
 * 功能：多池系统配置管理 - 池类型、准入条件、奖励倍数
 * 特点：动态准入条件 + 灵活奖励机制 + 访问控制
 */

'use strict'

module.exports = (sequelize, DataTypes) => {
  const LotteryPoolConfig = sequelize.define('LotteryPoolConfig', {
    // 基础信息
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '池配置ID'
    },
    pool_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: '池唯一标识符'
    },
    pool_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '池名称'
    },
    pool_type: {
      type: DataTypes.ENUM('standard', 'premium', 'vip', 'special', 'limited'),
      allowNull: false,
      comment: '池类型'
    },

    // 准入配置
    access_requirements: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '准入要求配置'
    },

    // 经济配置
    cost_multiplier: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 1.0,
      comment: '消耗倍数'
    },
    reward_multiplier: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 1.0,
      comment: '奖励倍数'
    },
    priority_weight: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      comment: '优先级权重'
    },

    // 限制配置
    daily_limit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '每日抽取限制'
    },
    total_limit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '总抽取限制'
    },

    // 状态配置
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '是否激活'
    },
    config: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '池详细配置'
    },

    // 时间戳
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '创建时间'
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '更新时间'
    }
  }, {
    tableName: 'lottery_pool_configs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    comment: '抽奖池配置表',

    // 实例方法
    instanceMethods: {
      // 检查用户是否可以访问池子
      canUserAccess (user) {
        if (!this.is_active) return false

        // 检查准入要求
        if (this.access_requirements) {
          const requirements = this.access_requirements

          // VIP等级要求
          if (requirements.vip_level && user.vip_level < requirements.vip_level) {
            return false
          }

          // 积分要求
          if (requirements.min_points && user.total_points < requirements.min_points) {
            return false
          }

          // 其他自定义要求
          // 可以在这里添加更多检查逻辑
        }

        return true
      },

      // 计算用户的抽取成本
      calculateCost (baseCost) {
        return Math.floor(baseCost * this.cost_multiplier)
      },

      // 计算用户的奖励倍数
      calculateReward (baseReward) {
        return Math.floor(baseReward * this.reward_multiplier)
      },

      // 获取配置值
      getConfigValue (key, defaultValue = null) {
        return this.config && this.config[key] ? this.config[key] : defaultValue
      }
    }
  })

  // 关联关系
  LotteryPoolConfig.associate = function (models) {
    // 关联到用户池访问记录
    LotteryPoolConfig.hasMany(models.UserPoolAccess, {
      foreignKey: 'pool_id',
      sourceKey: 'pool_id',
      as: 'accessRecords'
    })
  }

  return LotteryPoolConfig
}
