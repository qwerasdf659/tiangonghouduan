const { DataTypes, Model } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 抽奖奖品配置模型 - 分离式架构设计
 * 职责：管理抽奖奖品的配置、库存、概率、状态等
 * 设计模式：状态机模式 + 库存管理模式
 * 业务含义：定义可以抽到的奖品类型、价值、概率和库存
 */
class LotteryPrize extends Model {
  /**
   * 静态关联定义
   * 业务关系：奖品关联抽奖活动、抽奖记录、预设记录、图片资源
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 关联到抽奖活动
    LotteryPrize.belongsTo(models.LotteryCampaign, {
      foreignKey: 'lottery_campaign_id',
      as: 'campaign'
    })

    // 关联到抽奖记录
    LotteryPrize.hasMany(models.LotteryDraw, {
      foreignKey: 'lottery_prize_id',
      as: 'draws'
    })

    // 奖品赞助商家（NULL=平台自营）
    if (models.Merchant) {
      LotteryPrize.belongsTo(models.Merchant, {
        foreignKey: 'merchant_id',
        as: 'merchant'
      })
    }

    /*
     * 🔥 关联到抽奖记录（已合并到LotteryDraw）
     * LotteryRecord已合并到LotteryDraw，使用draws关联即可
     */

    // 🎯 关联到抽奖预设记录
    if (models.LotteryPreset) {
      LotteryPrize.hasMany(models.LotteryPreset, {
        foreignKey: 'lottery_prize_id',
        as: 'presets',
        comment: '抽奖预设记录'
      })
    }

    // 关联到图片资源
    if (models.ImageResources) {
      LotteryPrize.belongsTo(models.ImageResources, {
        foreignKey: 'image_resource_id',
        as: 'image'
      })
    }

    // 关联到稀有度字典（多活动抽奖系统 - 前端视觉稀有度等级）
    if (models.RarityDef) {
      LotteryPrize.belongsTo(models.RarityDef, {
        foreignKey: 'rarity_code',
        targetKey: 'rarity_code',
        as: 'rarityDef',
        comment: '稀有度定义（common/uncommon/rare/epic/legendary）'
      })
    }
  }

  /**
   * 获取奖品类型名称
   * @returns {string} 奖品类型的友好显示名称
   */
  getPrizeTypeName() {
    const types = {
      points: '积分奖励',
      coupon: '优惠券',
      physical: '实物奖品',
      virtual: '虚拟商品',
      service: '服务体验',
      product: '商品',
      special: '特殊奖品'
    }
    return types[this.prize_type] || '未知类型'
  }

  /**
   * 获取奖品状态名称
   * @returns {string} 奖品状态的友好显示名称
   */
  getStatusName() {
    const statuses = {
      active: '激活中',
      inactive: '已停用'
    }
    return statuses[this.status] || '未知状态'
  }

  /**
   * 检查奖品是否可用
   * 业务规则：必须同时满足状态激活、有库存、未达到每日中奖上限
   * @returns {boolean} 奖品是否可用
   */
  isAvailable() {
    if (this.status !== 'active') return false
    if (this.stock_quantity !== null && this.stock_quantity <= 0) return false
    if (this.max_daily_wins !== null && this.daily_win_count >= this.max_daily_wins) return false
    return true
  }

  /**
   * 检查奖品是否缺货
   * @returns {boolean} 奖品是否缺货
   */
  isOutOfStock() {
    return this.stock_quantity !== null && this.stock_quantity <= 0
  }

  /**
   * 获取中奖概率百分比
   * @returns {string} 中奖概率百分比字符串（保留2位小数）
   */
  getWinProbabilityPercent() {
    return (this.win_probability * 100).toFixed(2)
  }

  /**
   * 更新库存
   * 业务场景：中奖后扣减库存，退款时恢复库存
   * @param {number} change - 库存变化量（正数增加，负数减少）
   * @param {Object} transaction - Sequelize事务对象
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateStock(change, transaction = null) {
    if (this.stock_quantity === null) return true // 无限库存

    const newStock = this.stock_quantity + change
    if (newStock < 0) return false // 库存不足

    await this.update(
      {
        stock_quantity: newStock,
        // 库存耗尽时将状态标记为 inactive（枚举已修正：仅 active/inactive）
        status: newStock <= 0 ? 'inactive' : this.status
      },
      { transaction }
    )

    return true
  }

  /**
   * 增加中奖次数
   * 业务场景：每次中奖后更新总中奖次数和今日中奖次数
   * @param {Object} transaction - Sequelize事务对象
   * @returns {Promise<void>} 无返回值
   */
  async incrementWinCount(transaction = null) {
    await this.increment(['total_win_count', 'daily_win_count'], { transaction })
  }

  /**
   * 获取奖品摘要信息
   * 业务场景：API响应、管理后台展示
   * @returns {Object} 奖品摘要对象
   */
  toSummary() {
    return {
      lottery_prize_id: this.lottery_prize_id,
      prize_name: this.prize_name,
      prize_type: this.prize_type,
      prize_type_name: this.getPrizeTypeName(),
      prize_value: this.prize_value,
      win_probability: this.getWinProbabilityPercent(),
      is_available: this.isAvailable(),
      stock_quantity: this.stock_quantity,
      total_win_count: this.total_win_count,
      status: this.status,
      status_name: this.getStatusName()
    }
  }

  /**
   * 验证奖品数据（静态方法）
   * 业务场景：创建或更新奖品前进行数据验证
   * @param {Object} data - 奖品数据
   * @param {string} data.prize_name - 奖品名称
   * @param {string} data.prize_type - 奖品类型
   * @param {number} data.prize_value - 奖品价值
   * @param {number} data.win_probability - 中奖概率
   * @returns {Array<string>} 错误信息数组（为空表示验证通过）
   */
  static validatePrize(data) {
    const errors = []

    if (!data.prize_name || data.prize_name.trim().length === 0) {
      errors.push('奖品名称不能为空')
    }

    if (
      !data.prize_type ||
      !['points', 'coupon', 'physical', 'virtual', 'service', 'product', 'special'].includes(
        data.prize_type
      )
    ) {
      errors.push('奖品类型无效')
    }

    if (data.prize_value === null || data.prize_value === undefined || data.prize_value < 0) {
      errors.push('奖品价值必须大于等于0')
    }

    if (
      data.win_probability === null ||
      data.win_probability === undefined ||
      data.win_probability < 0 ||
      data.win_probability > 1
    ) {
      errors.push('中奖概率必须在0-1之间')
    }

    return errors
  }

  /**
   * 验证活动奖品池配置（BUDGET_POINTS 架构：空奖约束）
   *
   * 业务规则：
   * - 每个抽奖活动必须至少有一个 prize_value_points = 0 的空奖
   * - 确保预算耗尽时用户仍可参与抽奖（只能抽到空奖）
   * - 空奖的 status 必须为 'active'
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 验证结果 {valid: boolean, error?: string, emptyPrizes: Array}
   */
  static async validateEmptyPrizeConstraint(campaignId, options = {}) {
    const { transaction } = options

    if (!campaignId) {
      return {
        valid: false,
        error: '活动ID不能为空',
        emptyPrizes: []
      }
    }

    // 查询活动的所有空奖（prize_value_points = 0 或 NULL）
    const emptyPrizes = await this.findAll({
      where: {
        lottery_campaign_id: campaignId,
        status: 'active',
        [require('sequelize').Op.or]: [{ prize_value_points: 0 }, { prize_value_points: null }]
      },
      attributes: ['lottery_prize_id', 'prize_name', 'prize_value_points', 'win_probability'],
      transaction
    })

    if (emptyPrizes.length === 0) {
      return {
        valid: false,
        error: `活动 ${campaignId} 缺少空奖配置（prize_value_points = 0）：BUDGET_POINTS 架构要求至少有一个空奖，确保预算耗尽时用户仍可抽奖`,
        emptyPrizes: []
      }
    }

    // 检查空奖是否有概率配置
    const emptyPrizesWithProbability = emptyPrizes.filter(
      p => p.win_probability && parseFloat(p.win_probability) > 0
    )

    if (emptyPrizesWithProbability.length === 0) {
      return {
        valid: false,
        error: `活动 ${campaignId} 的空奖概率配置无效：至少需要一个空奖有大于0的中奖概率`,
        emptyPrizes: emptyPrizes.map(p => p.toJSON())
      }
    }

    return {
      valid: true,
      emptyPrizes: emptyPrizes.map(p => p.toJSON()),
      message: `活动 ${campaignId} 空奖配置有效：${emptyPrizes.length} 个空奖`
    }
  }

  /**
   * 获取活动的预算配置校验结果
   *
   * 业务场景：管理后台配置活动时校验
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 校验结果
   */
  static async validateCampaignBudgetConfig(campaignId, options = {}) {
    const { transaction } = options

    // 查询活动所有奖品
    const allPrizes = await this.findAll({
      where: {
        lottery_campaign_id: campaignId,
        status: 'active'
      },
      attributes: ['lottery_prize_id', 'prize_name', 'prize_value_points', 'win_probability'],
      transaction
    })

    if (allPrizes.length === 0) {
      return {
        valid: false,
        error: `活动 ${campaignId} 没有配置任何激活状态的奖品`,
        prizes: []
      }
    }

    // 按 prize_value_points 分组统计
    const prizesByValue = {
      empty: [], // prize_value_points = 0 或 null
      low: [], // 1-99
      mid: [], // 100-499
      high: [] // 500+
    }

    for (const prize of allPrizes) {
      const valuePoints = prize.prize_value_points || 0
      const prizeInfo = {
        lottery_prize_id: prize.lottery_prize_id,
        prize_name: prize.prize_name,
        prize_value_points: valuePoints,
        win_probability: parseFloat(prize.win_probability) || 0
      }

      if (valuePoints === 0) {
        prizesByValue.empty.push(prizeInfo)
      } else if (valuePoints < 100) {
        prizesByValue.low.push(prizeInfo)
      } else if (valuePoints < 500) {
        prizesByValue.mid.push(prizeInfo)
      } else {
        prizesByValue.high.push(prizeInfo)
      }
    }

    // 计算各档位概率总和
    const probabilitySum = {
      empty: prizesByValue.empty.reduce((sum, p) => sum + p.win_probability, 0),
      low: prizesByValue.low.reduce((sum, p) => sum + p.win_probability, 0),
      mid: prizesByValue.mid.reduce((sum, p) => sum + p.win_probability, 0),
      high: prizesByValue.high.reduce((sum, p) => sum + p.win_probability, 0)
    }

    const totalProbability = Object.values(probabilitySum).reduce((a, b) => a + b, 0)

    // 空奖约束检查
    const emptyPrizeValid = prizesByValue.empty.length > 0 && probabilitySum.empty > 0

    return {
      valid: emptyPrizeValid,
      error: emptyPrizeValid ? null : '缺少有效的空奖配置（prize_value_points = 0 且概率 > 0）',
      summary: {
        total_prizes: allPrizes.length,
        empty_prizes: prizesByValue.empty.length,
        total_probability: (totalProbability * 100).toFixed(2) + '%',
        probability_by_tier: {
          empty: (probabilitySum.empty * 100).toFixed(2) + '%',
          low: (probabilitySum.low * 100).toFixed(2) + '%',
          mid: (probabilitySum.mid * 100).toFixed(2) + '%',
          high: (probabilitySum.high * 100).toFixed(2) + '%'
        }
      },
      prizes_by_tier: prizesByValue
    }
  }

  /**
   * 校验活动奖品权重配置（纯严格校验，不自动补差）
   *
   * 业务规则（用户拍板决定）：
   * - 同档位（reward_tier）内所有激活奖品的 win_weight 之和必须严格等于 1,000,000
   * - 不等于 1,000,000 则拒绝保存/上线
   * - 不做任何自动补差或归一化处理
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @param {Object} [options.transaction] - 数据库事务
   * @returns {Promise<Object>} 校验结果
   */
  static async validatePrizeWeights(campaignId, options = {}) {
    const { transaction } = options
    const WEIGHT_SCALE = 1000000

    if (!campaignId) {
      return {
        valid: false,
        error: '活动ID不能为空',
        tier_results: {}
      }
    }

    // 查询活动所有激活奖品（按档位分组）
    const allPrizes = await this.findAll({
      where: {
        lottery_campaign_id: campaignId,
        status: 'active'
      },
      attributes: ['lottery_prize_id', 'prize_name', 'reward_tier', 'win_weight'],
      order: [
        ['reward_tier', 'ASC'],
        ['lottery_prize_id', 'ASC']
      ],
      transaction
    })

    if (allPrizes.length === 0) {
      return {
        valid: false,
        error: `活动 ${campaignId} 没有配置任何激活状态的奖品`,
        tier_results: {}
      }
    }

    // 按 reward_tier 分组
    const prizesByTier = {
      high: [],
      mid: [],
      low: []
    }

    for (const prize of allPrizes) {
      const tier = prize.reward_tier || 'low'
      if (prizesByTier[tier]) {
        prizesByTier[tier].push({
          lottery_prize_id: prize.lottery_prize_id,
          prize_name: prize.prize_name,
          win_weight: prize.win_weight || 0
        })
      }
    }

    // 严格校验每个档位的权重之和
    const tierResults = {}
    const errors = []

    for (const [tier, prizes] of Object.entries(prizesByTier)) {
      const totalWeight = prizes.reduce((sum, p) => sum + p.win_weight, 0)
      const isValid = totalWeight === WEIGHT_SCALE

      tierResults[tier] = {
        valid: isValid,
        prize_count: prizes.length,
        total_weight: totalWeight,
        expected_weight: WEIGHT_SCALE,
        difference: totalWeight - WEIGHT_SCALE,
        prizes: prizes.map(p => ({
          lottery_prize_id: p.lottery_prize_id,
          prize_name: p.prize_name,
          win_weight: p.win_weight,
          probability: ((p.win_weight / WEIGHT_SCALE) * 100).toFixed(4) + '%'
        }))
      }

      // 只有档位有奖品时才校验权重
      if (prizes.length > 0 && !isValid) {
        if (totalWeight < WEIGHT_SCALE) {
          errors.push(
            `档位 ${tier}（${prizes.length}个奖品）权重之和 ${totalWeight} 不足，缺口 ${WEIGHT_SCALE - totalWeight}`
          )
        } else {
          errors.push(
            `档位 ${tier}（${prizes.length}个奖品）权重之和 ${totalWeight} 超出，超额 ${totalWeight - WEIGHT_SCALE}`
          )
        }
      }
    }

    // 汇总结果
    const allTiersValid = errors.length === 0
    const hasAtLeastOneTierWithPrizes = Object.values(prizesByTier).some(
      prizes => prizes.length > 0
    )

    return {
      valid: allTiersValid && hasAtLeastOneTierWithPrizes,
      error: errors.length > 0 ? errors.join('；') : null,
      lottery_campaign_id: campaignId,
      weight_scale: WEIGHT_SCALE,
      tier_results: tierResults,
      message: allTiersValid
        ? `活动 ${campaignId} 所有档位权重配置正确（SCALE=${WEIGHT_SCALE}）`
        : `活动 ${campaignId} 权重配置校验失败：配置不正确，禁止上线`
    }
  }

  /**
   * 活动上线前完整校验（纯严格模式）
   *
   * 业务规则（用户拍板决定）：
   * - 配置不正确就禁止上线活动
   * - 包括：档位权重校验 + 奖品权重校验 + 空奖配置校验
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 完整校验结果
   */
  static async validateForLaunch(campaignId, options = {}) {
    const { transaction } = options

    // 1. 校验奖品权重配置
    const prizeWeightResult = await this.validatePrizeWeights(campaignId, { transaction })

    // 2. 校验空奖配置
    const emptyPrizeResult = await this.validateEmptyPrizeConstraint(campaignId, { transaction })

    // 3. 校验预算配置
    const budgetConfigResult = await this.validateCampaignBudgetConfig(campaignId, { transaction })

    // 汇总所有错误
    const errors = []
    if (!prizeWeightResult.valid && prizeWeightResult.error) {
      errors.push(`奖品权重：${prizeWeightResult.error}`)
    }
    if (!emptyPrizeResult.valid && emptyPrizeResult.error) {
      errors.push(`空奖配置：${emptyPrizeResult.error}`)
    }
    if (!budgetConfigResult.valid && budgetConfigResult.error) {
      errors.push(`预算配置：${budgetConfigResult.error}`)
    }

    const allValid = prizeWeightResult.valid && emptyPrizeResult.valid && budgetConfigResult.valid

    return {
      valid: allValid,
      can_launch: allValid,
      error: errors.length > 0 ? errors.join('；') : null,
      lottery_campaign_id: campaignId,
      validation_details: {
        prize_weights: prizeWeightResult,
        empty_prize: emptyPrizeResult,
        budget_config: budgetConfigResult
      },
      message: allValid
        ? `活动 ${campaignId} 配置校验通过，可以上线`
        : `活动 ${campaignId} 配置校验失败，禁止上线：${errors.join('；')}`
    }
  }
}

module.exports = sequelize => {
  LotteryPrize.init(
    {
      lottery_prize_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '奖品唯一标识'
      },
      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联的抽奖活动ID'
      },
      prize_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '奖品名称'
      },
      prize_type: {
        type: DataTypes.ENUM(
          'points',
          'coupon',
          'physical',
          'virtual',
          'service',
          'product',
          'special'
        ),
        allowNull: false,
        defaultValue: 'points',
        comment:
          '奖品类型: points=积分/coupon=优惠券/physical=实物/virtual=虚拟/service=服务/product=商品/special=特殊'
      },
      prize_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '奖品价值（积分数或金额）',
        /**
         * 获取奖品价值，将DECIMAL转换为浮点数
         * @returns {number} 奖品价值
         */
        get() {
          const value = this.getDataValue('prize_value')
          return value ? parseFloat(value) : 0
        }
      },
      angle: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '转盘角度位置'
      },
      color: {
        type: DataTypes.STRING(7),
        allowNull: false,
        defaultValue: '#FF6B6B',
        comment: '奖品颜色代码'
      },
      is_activity: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否为活动奖品'
      },
      cost_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        comment: '抽奖消耗积分'
      },
      prize_description: {
        type: DataTypes.TEXT,
        comment: '奖品描述信息'
      },
      image_resource_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment:
          '关联的奖品图片ID，外键指向 image_resources.image_resource_id（2026-02-01 主键命名规范化）',
        references: {
          model: 'image_resources',
          key: 'image_resource_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      win_probability: {
        type: DataTypes.DECIMAL(8, 6),
        allowNull: false,
        defaultValue: 0.1,
        comment: '中奖概率（0-1之间）',
        /**
         * 获取中奖概率，将DECIMAL转换为浮点数
         * @returns {number} 中奖概率（0-1之间）
         */
        get() {
          const value = this.getDataValue('win_probability')
          return value ? parseFloat(value) : 0
        }
      },
      stock_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '库存数量（0表示无限）'
      },
      max_daily_wins: {
        type: DataTypes.INTEGER,
        comment: '每日最大中奖次数'
      },
      /** 每人总中奖上限（跨日累计），NULL 表示不限制 */
      max_user_wins: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '每人总中奖上限（跨日累计），NULL表示不限制'
      },
      total_win_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总中奖次数'
      },
      daily_win_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '今日中奖次数'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        comment: '显示排序'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '奖品状态: active=激活中, inactive=已停用'
      },
      /**
       * 奖品价值积分（双账户模型核心字段）
       * 用于预算控制，决定抽中该奖品需要消耗多少预算积分
       */
      prize_value_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '奖品价值积分（统一价值单位）'
      },

      // ======================== 统一抽奖架构新字段 ========================

      /**
       * 奖品所属档位
       * @type {string}
       * @业务含义 用于tier_first选奖法，先选档位再选奖品
       * @枚举值 high-高档位, mid-中档位, low-低档位
       * @设计原理 固定三档位制，简化业务逻辑，避免动态档位带来的复杂性
       */
      reward_tier: {
        type: DataTypes.ENUM('high', 'mid', 'low'),
        allowNull: false,
        defaultValue: 'low',
        comment: '奖品所属档位：high=高档位, mid=中档位, low=低档位（tier_first选奖法使用）'
      },

      /**
       * 中奖权重（整数权重制）
       * @type {number}
       * @业务含义 同档位内的奖品权重，用于计算选中概率
       * @设计原理 使用整数权重避免浮点精度问题
       * @计算公式 选中概率 = 该奖品权重 / 同档位所有可用奖品权重之和
       * @注意 权重为0表示不参与抽奖
       */
      win_weight: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '中奖权重（整数，同档位内权重之和用于概率计算，0表示不参与抽奖）'
      },

      /**
       * 是否为保底奖品
       * @type {boolean}
       * @业务含义 标记此奖品是否为保底奖品
       * @规则 prize_value_points=0的奖品应标记为true
       * @用途 当所有档位都无可用奖品时，发放保底奖品
       */
      is_fallback: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否为保底奖品（prize_value_points=0的奖品应标记为true）'
      },

      /**
       * 是否VIP专属奖品
       * @type {boolean}
       * @业务含义 标记此奖品是否仅VIP用户可抽
       * @规则 VIP用户可以抽到此奖品，普通用户不参与此奖品的抽奖
       * @用途 用于分层策略，VIP用户享有独占奖品池
       */
      reserved_for_vip: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否VIP专属奖品（仅VIP用户可抽）'
      },

      // ======================== 稀有度字段（多活动抽奖系统） ========================

      /**
       * 稀有度代码（前端视觉稀有度等级）
       * @type {string}
       * @业务含义 控制前端奖品的视觉光效等级，与 reward_tier（后端概率档位）是完全独立的两个维度
       * @枚举值 common（普通-灰色）/uncommon（稀有-绿色）/rare（精良-蓝色）/epic（史诗-紫色）/legendary（传说-金色）
       * @外键关联 rarity_defs.rarity_code
       * @前端效果 前端直接使用 rarity_code 字段名显示对应颜色光效
       * @注意 rarity_code 是面向前端的视觉稀有度，reward_tier 是后端抽奖引擎的概率档位，两者独立配置
       */
      rarity_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'common',
        comment:
          '稀有度代码（外键关联 rarity_defs.rarity_code）: common/uncommon/rare/epic/legendary',
        references: {
          model: 'rarity_defs',
          key: 'rarity_code'
        }
      },

      /**
       * 材料资产代码（用于材料类型奖品）
       * 关联 material_asset_types 表的 asset_code 字段
       */
      material_asset_code: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: '材料资产代码（如CRYSTAL, GOLD等）'
      },
      /**
       * 材料发放数量
       * 仅当 material_asset_code 有值时有效
       */
      material_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '材料发放数量'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime()
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime()
      },

      /** 赞助商家ID（NULL=平台自营） */
      merchant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'merchants',
          key: 'merchant_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '赞助商家ID（NULL=平台自营，关联 merchants 表）'
      }
    },
    {
      sequelize,
      modelName: 'LotteryPrize',
      tableName: 'lottery_prizes',
      timestamps: true,
      paranoid: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      deletedAt: 'deleted_at',
      underscored: true,
      comment:
        '抽奖奖品配置表（paranoid 软删除：destroy() 设置 deleted_at，查询自动过滤已删除记录）',
      indexes: [
        {
          fields: ['lottery_campaign_id', 'status'],
          name: 'idx_lp_campaign_status',
          comment: '活动状态复合索引'
        },
        {
          fields: ['prize_type', 'status'],
          name: 'idx_lp_type_status',
          comment: '奖品类型状态复合索引'
        },
        {
          fields: ['win_probability'],
          name: 'idx_lp_probability',
          comment: '中奖概率索引'
        },
        {
          fields: ['sort_order'],
          name: 'idx_lp_sort',
          comment: '排序索引'
        },
        {
          fields: ['lottery_campaign_id', 'sort_order'],
          name: 'idx_unique_campaign_sort_order',
          unique: true,
          comment: '活动内排序唯一约束 - 防止转盘位置冲突'
        }
      ]
    }
  )

  /**
   * 🔒 数据验证钩子：防止sort_order重复
   * 业务场景：确保同一活动内的奖品排序不重复，避免前端转盘位置冲突
   * 触发时机：创建新奖品前自动执行
   */
  LotteryPrize.addHook('beforeCreate', async (prize, options) => {
    // 检查同一活动内是否已存在相同的sort_order
    const existing = await LotteryPrize.findOne({
      where: {
        lottery_campaign_id: prize.lottery_campaign_id,
        sort_order: prize.sort_order
      },
      transaction: options.transaction
    })

    if (existing) {
      throw new Error(
        `奖品排序${prize.sort_order}已存在于活动${prize.lottery_campaign_id}中，请使用不同的排序值`
      )
    }
  })

  /**
   * 🔒 数据验证钩子：防止更新时sort_order重复
   * 业务场景：确保更新奖品时不会产生排序冲突
   * 触发时机：更新奖品前自动执行
   */
  LotteryPrize.addHook('beforeUpdate', async (prize, options) => {
    // 只有在sort_order或lottery_campaign_id发生变化时才检查
    if (prize.changed('sort_order') || prize.changed('lottery_campaign_id')) {
      const existing = await LotteryPrize.findOne({
        where: {
          lottery_campaign_id: prize.lottery_campaign_id,
          sort_order: prize.sort_order,
          lottery_prize_id: { [require('sequelize').Op.ne]: prize.lottery_prize_id }
        },
        transaction: options.transaction
      })

      if (existing) {
        throw new Error(
          `奖品排序${prize.sort_order}已存在于活动${prize.lottery_campaign_id}中，请使用不同的排序值`
        )
      }
    }
  })

  return LotteryPrize
}
