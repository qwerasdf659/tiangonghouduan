/**
 * 餐厅积分抽奖系统 v3.0 - 合成配方模型
 * 定义高级合成系统的配方规则和合成逻辑
 * 创建时间：2025年08月22日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const SynthesisRecipe = sequelize.define(
    'SynthesisRecipe',
    {
      // 主键
      recipe_id: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: '合成配方唯一标识'
      },

      // 基础信息
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '配方名称'
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '配方描述'
      },

      // 配方分类
      category: {
        type: DataTypes.ENUM('basic', 'advanced', 'legendary', 'mythical', 'event'),
        allowNull: false,
        defaultValue: 'basic',
        comment: '配方分类'
      },

      // 合成等级要求
      required_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '需要的合成等级'
      },

      // 材料配置 (JSON)
      materials: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '合成材料配置 [{item_type, item_id, quantity, rarity}]',
        validate: {
          isValidMaterials (value) {
            if (!Array.isArray(value) || value.length === 0) {
              throw new Error('材料配置必须是非空数组')
            }

            for (const material of value) {
              if (!material.item_type || !material.quantity || material.quantity <= 0) {
                throw new Error('每个材料必须包含有效的item_type和quantity')
              }
            }
          }
        }
      },

      // 产出物品配置 (JSON)
      output_items: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '产出物品配置 [{item_type, item_id, quantity, probability, rarity}]',
        validate: {
          isValidOutput (value) {
            if (!Array.isArray(value) || value.length === 0) {
              throw new Error('产出配置必须是非空数组')
            }

            let totalProbability = 0
            for (const output of value) {
              if (!output.item_type || !output.quantity || output.quantity <= 0) {
                throw new Error('每个产出必须包含有效的item_type和quantity')
              }
              if (output.probability) {
                totalProbability += output.probability
              }
            }

            if (totalProbability > 100) {
              throw new Error('总概率不能超过100%')
            }
          }
        }
      },

      // 成功率配置
      base_success_rate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 80.00,
        comment: '基础成功率 (0-100)',
        validate: {
          min: 0,
          max: 100
        }
      },

      // 成本配置
      synthesis_cost: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '合成成本配置 {points: 100, vip_discount: 0.9}',
        defaultValue: {
          points: 0,
          vip_discount: 1.0
        }
      },

      // 冷却时间 (秒)
      cooldown_seconds: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '合成冷却时间 (秒)'
      },

      // 状态管理
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'event_only', 'deprecated'),
        allowNull: false,
        defaultValue: 'active',
        comment: '配方状态'
      },

      // 解锁条件
      unlock_conditions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '解锁条件 {achievements: [], items_collected: [], vip_level: 1}',
        defaultValue: {}
      },

      // 限制条件
      limitations: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '使用限制 {daily_limit: 5, total_limit: null, user_level_min: 1}',
        defaultValue: {
          daily_limit: null,
          total_limit: null,
          user_level_min: 1
        }
      },

      // 特殊效果
      special_effects: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '特殊效果配置 {critical_chance: 5, bonus_items: [], experience_bonus: 1.0}',
        defaultValue: {
          critical_chance: 0,
          bonus_items: [],
          experience_bonus: 1.0
        }
      },

      // 排序和显示
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        comment: '显示排序'
      },

      icon: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: '配方图标'
      },

      // 统计信息
      total_synthesis_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总合成次数统计'
      },

      total_success_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总成功次数统计'
      },

      // 元数据
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展元数据'
      }
    },
    {
      tableName: 'synthesis_recipes',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['category', 'status']
        },
        {
          fields: ['required_level']
        },
        {
          fields: ['status', 'sort_order']
        },
        {
          fields: ['base_success_rate']
        }
      ],
      comment: '合成配方表'
    }
  )

  // 实例方法
  SynthesisRecipe.prototype.calculateSuccessRate = function (userLevel, userBonuses = {}) {
    let successRate = parseFloat(this.base_success_rate)

    // 用户等级加成
    if (userLevel > this.required_level) {
      successRate += (userLevel - this.required_level) * 0.5
    }

    // 用户特殊加成
    if (userBonuses.synthesis_bonus) {
      successRate += userBonuses.synthesis_bonus
    }

    // VIP等级加成
    if (userBonuses.vip_level) {
      successRate += userBonuses.vip_level * 1.0
    }

    // 确保在合理范围内
    return Math.min(Math.max(successRate, 5), 95)
  }

  SynthesisRecipe.prototype.isUnlocked = function (userProfile) {
    if (!this.unlock_conditions || Object.keys(this.unlock_conditions).length === 0) {
      return true
    }

    const conditions = this.unlock_conditions

    // 检查VIP等级
    if (conditions.vip_level && userProfile.vip_level < conditions.vip_level) {
      return false
    }

    // 检查用户等级
    if (conditions.user_level && userProfile.level < conditions.user_level) {
      return false
    }

    // 检查成就 (简化实现)
    if (conditions.achievements && conditions.achievements.length > 0) {
      // 实际实现中需要检查用户成就系统
      // 这里先返回true，待成就系统完善后实现
    }

    return true
  }

  SynthesisRecipe.prototype.canSynthesize = function (userProfile, synthesisHistory) {
    // 检查状态
    if (this.status !== 'active') {
      return { can: false, reason: '配方当前不可用' }
    }

    // 检查用户等级
    if (userProfile.synthesis_level < this.required_level) {
      return { can: false, reason: `需要合成等级${this.required_level}` }
    }

    // 检查解锁条件
    if (!this.isUnlocked(userProfile)) {
      return { can: false, reason: '配方尚未解锁' }
    }

    // 检查每日限制
    if (this.limitations.daily_limit) {
      const today = new Date().toDateString()
      const todayCount = synthesisHistory.filter(h =>
        h.recipe_id === this.recipe_id &&
        new Date(h.created_at).toDateString() === today
      ).length

      if (todayCount >= this.limitations.daily_limit) {
        return { can: false, reason: `每日限制${this.limitations.daily_limit}次已达上限` }
      }
    }

    // 检查冷却时间
    if (this.cooldown_seconds > 0) {
      const lastSynthesis = synthesisHistory
        .filter(h => h.recipe_id === this.recipe_id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

      if (lastSynthesis) {
        const cooldownEnds = new Date(lastSynthesis.created_at).getTime() + (this.cooldown_seconds * 1000)
        if (Date.now() < cooldownEnds) {
          const remainingSeconds = Math.ceil((cooldownEnds - Date.now()) / 1000)
          return { can: false, reason: `冷却中，还需${remainingSeconds}秒` }
        }
      }
    }

    return { can: true }
  }

  return SynthesisRecipe
}
