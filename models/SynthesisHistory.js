/**
 * 餐厅积分抽奖系统 v3.0 - 合成历史模型
 * 记录用户的高级合成历史和结果统计
 * 创建时间：2025年08月22日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const SynthesisHistory = sequelize.define(
    'SynthesisHistory',
    {
      // 主键
      history_id: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: '合成历史唯一标识'
      },

      // 关联信息
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      recipe_id: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '合成配方ID',
        references: {
          model: 'synthesis_recipes',
          key: 'recipe_id'
        }
      },

      // 合成详情
      materials_used: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '使用的材料详情 [{item_type, item_id, quantity, consumed_from_inventory}]'
      },

      // 合成结果
      result_status: {
        type: DataTypes.ENUM('success', 'failure', 'critical_success', 'partial_success'),
        allowNull: false,
        comment: '合成结果状态'
      },

      success_rate_used: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        comment: '实际使用的成功率'
      },

      // 产出物品
      output_items: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '产出物品详情 [{item_type, item_id, quantity, rarity, added_to_inventory}]'
      },

      // 特殊效果
      special_effects_triggered: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '触发的特殊效果 [{effect_type, effect_value, description}]',
        defaultValue: []
      },

      // 成本统计
      cost_details: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '成本详情 {points_spent, vip_discount_applied, total_cost}',
        defaultValue: {
          points_spent: 0,
          vip_discount_applied: 0,
          total_cost: 0
        }
      },

      // 经验和等级
      experience_gained: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '获得的合成经验值'
      },

      user_synthesis_level_before: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '合成前用户合成等级'
      },

      user_synthesis_level_after: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '合成后用户合成等级'
      },

      // 随机种子和验证
      random_seed: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '随机种子用于结果验证'
      },

      // 设备和环境信息
      device_info: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '设备信息 {ip_address, user_agent, device_type}',
        defaultValue: {}
      },

      // 执行时间统计
      execution_duration_ms: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '合成执行耗时(毫秒)'
      },

      // 失败原因 (如果失败)
      failure_reason: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '失败原因说明'
      },

      // 奖励和加成
      bonus_applied: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '应用的加成效果 {vip_bonus, event_bonus, level_bonus}',
        defaultValue: {}
      },

      // 事件相关
      event_id: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: '关联的活动ID (如果是活动期间合成)'
      },

      // 验证和安全
      verification_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '合成结果验证哈希'
      },

      // 元数据
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展元数据'
      }
    },
    {
      tableName: 'synthesis_history',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['user_id', 'created_at']
        },
        {
          fields: ['recipe_id', 'result_status']
        },
        {
          fields: ['result_status', 'created_at']
        },
        {
          fields: ['user_id', 'recipe_id', 'created_at']
        },
        {
          fields: ['event_id'],
          where: {
            event_id: {
              [require('sequelize').Op.not]: null
            }
          }
        },
        {
          fields: ['verification_hash'],
          unique: true
        }
      ],
      comment: '合成历史表'
    }
  )

  // 定义关联关系
  SynthesisHistory.associate = function (models) {
    // 归属用户
    SynthesisHistory.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 关联配方
    SynthesisHistory.belongsTo(models.SynthesisRecipe, {
      foreignKey: 'recipe_id',
      as: 'recipe'
    })
  }

  // 实例方法
  SynthesisHistory.prototype.isSuccessful = function () {
    return ['success', 'critical_success', 'partial_success'].includes(this.result_status)
  }

  SynthesisHistory.prototype.isCriticalSuccess = function () {
    return this.result_status === 'critical_success'
  }

  SynthesisHistory.prototype.calculateEfficiency = function () {
    if (!this.isSuccessful()) return 0

    const inputValue = this.cost_details.total_cost || 0
    const outputValue = (this.output_items || []).reduce((sum, item) => {
      return sum + (item.value || 0) * (item.quantity || 1)
    }, 0)

    return inputValue > 0 ? (outputValue / inputValue) : 0
  }

  SynthesisHistory.prototype.getTotalOutputItems = function () {
    if (!this.output_items || !Array.isArray(this.output_items)) return 0
    return this.output_items.reduce((sum, item) => sum + (item.quantity || 0), 0)
  }

  // 生成验证哈希
  SynthesisHistory.prototype.generateVerificationHash = function () {
    const crypto = require('crypto')
    const hashData = {
      user_id: this.user_id,
      recipe_id: this.recipe_id,
      random_seed: this.random_seed,
      result_status: this.result_status,
      materials_used: this.materials_used,
      output_items: this.output_items,
      created_at: this.created_at
    }

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(hashData))
      .digest('hex')
  }

  // 静态方法 - 获取用户合成统计
  SynthesisHistory.getUserSynthesisStats = async function (userId, timeRange = 30) {
    const { Op } = require('sequelize')
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - timeRange)

    const stats = await SynthesisHistory.findAll({
      where: {
        user_id: userId,
        created_at: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        'result_status',
        [sequelize.fn('COUNT', sequelize.col('history_id')), 'count'],
        [sequelize.fn('AVG', sequelize.col('success_rate_used')), 'avg_success_rate'],
        [sequelize.fn('SUM', sequelize.col('experience_gained')), 'total_experience']
      ],
      group: ['result_status'],
      raw: true
    })

    return {
      timeRange,
      startDate,
      stats,
      totalAttempts: stats.reduce((sum, stat) => sum + parseInt(stat.count), 0),
      successfulAttempts: stats
        .filter(stat => ['success', 'critical_success', 'partial_success'].includes(stat.result_status))
        .reduce((sum, stat) => sum + parseInt(stat.count), 0)
    }
  }

  // 静态方法 - 获取配方使用统计
  SynthesisHistory.getRecipeUsageStats = async function (recipeId, timeRange = 30) {
    const { Op } = require('sequelize')
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - timeRange)

    const result = await SynthesisHistory.findOne({
      where: {
        recipe_id: recipeId,
        created_at: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('history_id')), 'total_uses'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN result_status IN (\'success\', \'critical_success\', \'partial_success\') THEN 1 END')), 'successful_uses'],
        [sequelize.fn('AVG', sequelize.col('success_rate_used')), 'avg_success_rate'],
        [sequelize.fn('AVG', sequelize.col('execution_duration_ms')), 'avg_duration']
      ],
      raw: true
    })

    const totalUses = parseInt(result.total_uses) || 0
    const successfulUses = parseInt(result.successful_uses) || 0

    return {
      recipeId,
      timeRange,
      totalUses,
      successfulUses,
      actualSuccessRate: totalUses > 0 ? (successfulUses / totalUses * 100).toFixed(2) : 0,
      avgConfiguredSuccessRate: parseFloat(result.avg_success_rate) || 0,
      avgDuration: parseInt(result.avg_duration) || 0
    }
  }

  return SynthesisHistory
}
