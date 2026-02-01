/**
 * 🎯 抽奖档位规则服务 - API覆盖率补齐
 * 创建时间：2026年01月21日 北京时间
 *
 * 业务职责：
 * - 管理抽奖档位规则（lottery_tier_rules表）的CRUD操作
 * - 支持按活动、分层、档位查询规则
 * - 验证三档位权重配置（high/mid/low权重之和=1,000,000）
 *
 * 设计原则：
 * - 整数权重制：三个档位权重之和必须等于1,000,000
 * - 固定三档位：high/mid/low，不支持动态档位
 * - 分层独立：每个segment_key有独立的三档位配置
 */

'use strict'

const logger = require('../utils/logger').logger

/**
 * 抽奖档位规则服务类
 * 提供lottery_tier_rules表的完整CRUD操作
 */
class LotteryTierRuleService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.LotteryTierRule = models.LotteryTierRule
    this.LotteryCampaign = models.LotteryCampaign
    this.User = models.User
    // 权重比例因子（三档位权重之和必须等于此值）
    this.WEIGHT_SCALE = 1000000
  }

  /**
   * 获取档位规则列表（分页）
   *
   * @param {Object} params - 查询参数
   * @param {number} [params.lottery_campaign_id] - 活动ID（可选）
   * @param {string} [params.segment_key] - 用户分层标识（可选）
   * @param {string} [params.tier_name] - 档位名称（可选：high/mid/low）
   * @param {string} [params.status] - 规则状态（可选：active/inactive）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {Object} [options={}] - Sequelize查询选项
   * @returns {Promise<Object>} { list, total, page, page_size }
   */
  async list(params = {}, options = {}) {
    const { lottery_campaign_id, segment_key, tier_name, status, page = 1, page_size = 20 } = params

    // 构建查询条件
    const where = {}
    if (lottery_campaign_id) where.lottery_campaign_id = lottery_campaign_id
    if (segment_key) where.segment_key = segment_key
    if (tier_name) where.tier_name = tier_name
    if (status) where.status = status

    const { count, rows } = await this.LotteryTierRule.findAndCountAll({
      where,
      include: [
        {
          model: this.LotteryCampaign,
          as: 'campaign',
          attributes: ['lottery_campaign_id', 'campaign_name', 'status']
        },
        {
          model: this.User,
          as: 'creator',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.User,
          as: 'updater',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [
        ['lottery_campaign_id', 'ASC'],
        ['segment_key', 'ASC'],
        ['tier_name', 'ASC']
      ],
      limit: page_size,
      offset: (page - 1) * page_size,
      ...options
    })

    logger.info('[LotteryTierRuleService] 查询档位规则列表', {
      params,
      total: count
    })

    return {
      list: rows.map(rule => this._formatRule(rule)),
      total: count,
      page,
      page_size
    }
  }

  /**
   * 根据ID获取档位规则详情
   *
   * @param {number} tier_rule_id - 档位规则ID
   * @param {Object} [options={}] - Sequelize查询选项
   * @returns {Promise<Object|null>} 档位规则详情或null
   */
  async getById(tier_rule_id, options = {}) {
    const rule = await this.LotteryTierRule.findByPk(tier_rule_id, {
      include: [
        {
          model: this.LotteryCampaign,
          as: 'campaign',
          attributes: ['lottery_campaign_id', 'campaign_name', 'status']
        },
        {
          model: this.User,
          as: 'creator',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.User,
          as: 'updater',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      ...options
    })

    if (!rule) {
      logger.warn('[LotteryTierRuleService] 档位规则不存在', { tier_rule_id })
      return null
    }

    return this._formatRule(rule)
  }

  /**
   * 获取指定活动和分层的所有档位规则
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {string} [segment_key='default'] - 用户分层标识
   * @param {Object} [options={}] - Sequelize查询选项
   * @returns {Promise<Object>} 档位规则配置
   */
  async getByCampaignAndSegment(lottery_campaign_id, segment_key = 'default', options = {}) {
    const rules = await this.LotteryTierRule.findAll({
      where: {
        lottery_campaign_id,
        segment_key,
        status: 'active'
      },
      order: [['tier_name', 'ASC']],
      ...options
    })

    // 计算总权重
    const totalWeight = rules.reduce((sum, rule) => sum + rule.tier_weight, 0)

    return {
      lottery_campaign_id,
      segment_key,
      rules: rules.map(rule => ({
        tier_rule_id: rule.tier_rule_id,
        tier_name: rule.tier_name,
        tier_weight: rule.tier_weight,
        probability: ((rule.tier_weight / this.WEIGHT_SCALE) * 100).toFixed(4) + '%'
      })),
      total_weight: totalWeight,
      is_valid: totalWeight === this.WEIGHT_SCALE,
      expected_weight: this.WEIGHT_SCALE
    }
  }

  /**
   * 创建档位规则
   *
   * @param {Object} data - 规则数据
   * @param {number} data.lottery_campaign_id - 活动ID（必填）
   * @param {string} [data.segment_key='default'] - 用户分层标识
   * @param {string} data.tier_name - 档位名称（必填：high/mid/low）
   * @param {number} data.tier_weight - 档位权重（必填）
   * @param {string} [data.status='active'] - 规则状态
   * @param {number} [data.created_by] - 创建人ID
   * @param {Object} [options={}] - Sequelize查询选项
   * @returns {Promise<Object>} 创建的规则
   */
  async create(data, options = {}) {
    const {
      lottery_campaign_id,
      segment_key = 'default',
      tier_name,
      tier_weight,
      status = 'active',
      created_by
    } = data

    // 验证必填字段
    if (!lottery_campaign_id) {
      throw new Error('活动ID（lottery_campaign_id）不能为空')
    }
    if (!tier_name || !['high', 'mid', 'low'].includes(tier_name)) {
      throw new Error('档位名称（tier_name）必须是 high/mid/low 之一')
    }
    if (tier_weight === undefined || tier_weight < 0 || tier_weight > this.WEIGHT_SCALE) {
      throw new Error(`档位权重（tier_weight）必须在 0 到 ${this.WEIGHT_SCALE} 之间`)
    }

    // 验证活动是否存在
    const campaign = await this.LotteryCampaign.findByPk(lottery_campaign_id, options)
    if (!campaign) {
      throw new Error(`活动不存在：lottery_campaign_id=${lottery_campaign_id}`)
    }

    // 检查是否已存在相同的规则
    const existing = await this.LotteryTierRule.findOne({
      where: { lottery_campaign_id, segment_key, tier_name },
      ...options
    })
    if (existing) {
      throw new Error(
        `规则已存在：活动=${lottery_campaign_id}, 分层=${segment_key}, 档位=${tier_name}`
      )
    }

    const rule = await this.LotteryTierRule.create(
      {
        lottery_campaign_id,
        segment_key,
        tier_name,
        tier_weight,
        status,
        created_by,
        updated_by: created_by
      },
      options
    )

    logger.info('[LotteryTierRuleService] 创建档位规则', {
      tier_rule_id: rule.tier_rule_id,
      lottery_campaign_id,
      segment_key,
      tier_name,
      tier_weight
    })

    return this._formatRule(rule)
  }

  /**
   * 批量创建三档位规则
   *
   * @param {Object} data - 批量创建数据
   * @param {number} data.lottery_campaign_id - 活动ID（必填）
   * @param {string} [data.segment_key='default'] - 用户分层标识
   * @param {Object} data.weights - 各档位权重 { high: number, mid: number, low: number }
   * @param {number} [data.created_by] - 创建人ID
   * @param {Object} [options={}] - Sequelize查询选项
   * @returns {Promise<Array>} 创建的规则列表
   */
  async createTierRules(data, options = {}) {
    const { lottery_campaign_id, segment_key = 'default', weights, created_by } = data

    // 验证权重之和
    const totalWeight = (weights.high || 0) + (weights.mid || 0) + (weights.low || 0)
    if (totalWeight !== this.WEIGHT_SCALE) {
      throw new Error(`权重之和(${totalWeight})必须等于${this.WEIGHT_SCALE}`)
    }

    // 验证活动是否存在
    const campaign = await this.LotteryCampaign.findByPk(lottery_campaign_id, options)
    if (!campaign) {
      throw new Error(`活动不存在：lottery_campaign_id=${lottery_campaign_id}`)
    }

    // 检查是否已存在规则
    const existingCount = await this.LotteryTierRule.count({
      where: { lottery_campaign_id, segment_key },
      ...options
    })
    if (existingCount > 0) {
      throw new Error(
        `该活动和分层已存在规则：lottery_campaign_id=${lottery_campaign_id}, segment_key=${segment_key}`
      )
    }

    // 批量创建三档位规则
    const rules = await Promise.all([
      this.LotteryTierRule.create(
        {
          lottery_campaign_id,
          segment_key,
          tier_name: 'high',
          tier_weight: weights.high,
          status: 'active',
          created_by,
          updated_by: created_by
        },
        options
      ),
      this.LotteryTierRule.create(
        {
          lottery_campaign_id,
          segment_key,
          tier_name: 'mid',
          tier_weight: weights.mid,
          status: 'active',
          created_by,
          updated_by: created_by
        },
        options
      ),
      this.LotteryTierRule.create(
        {
          lottery_campaign_id,
          segment_key,
          tier_name: 'low',
          tier_weight: weights.low,
          status: 'active',
          created_by,
          updated_by: created_by
        },
        options
      )
    ])

    logger.info('[LotteryTierRuleService] 批量创建档位规则', {
      lottery_campaign_id,
      segment_key,
      weights,
      created_count: rules.length
    })

    return rules.map(rule => this._formatRule(rule))
  }

  /**
   * 更新档位规则
   *
   * @param {number} tier_rule_id - 档位规则ID
   * @param {Object} data - 更新数据
   * @param {number} [data.tier_weight] - 档位权重
   * @param {string} [data.status] - 规则状态
   * @param {number} [data.updated_by] - 更新人ID
   * @param {Object} [options={}] - Sequelize查询选项
   * @returns {Promise<Object>} 更新后的规则
   */
  async update(tier_rule_id, data, options = {}) {
    const rule = await this.LotteryTierRule.findByPk(tier_rule_id, options)
    if (!rule) {
      throw new Error(`档位规则不存在：tier_rule_id=${tier_rule_id}`)
    }

    // 验证权重范围
    if (data.tier_weight !== undefined) {
      if (data.tier_weight < 0 || data.tier_weight > this.WEIGHT_SCALE) {
        throw new Error(`档位权重（tier_weight）必须在 0 到 ${this.WEIGHT_SCALE} 之间`)
      }
    }

    // 构建更新数据
    const updateData = {}
    if (data.tier_weight !== undefined) updateData.tier_weight = data.tier_weight
    if (data.status !== undefined) updateData.status = data.status
    if (data.updated_by !== undefined) updateData.updated_by = data.updated_by

    await rule.update(updateData, options)

    logger.info('[LotteryTierRuleService] 更新档位规则', {
      tier_rule_id,
      updateData
    })

    // 重新查询返回完整信息
    return this.getById(tier_rule_id, options)
  }

  /**
   * 删除档位规则
   *
   * @param {number} tier_rule_id - 档位规则ID
   * @param {Object} [options={}] - Sequelize查询选项
   * @returns {Promise<boolean>} 是否删除成功
   */
  async delete(tier_rule_id, options = {}) {
    const rule = await this.LotteryTierRule.findByPk(tier_rule_id, options)
    if (!rule) {
      throw new Error(`档位规则不存在：tier_rule_id=${tier_rule_id}`)
    }

    await rule.destroy(options)

    logger.info('[LotteryTierRuleService] 删除档位规则', {
      tier_rule_id,
      lottery_campaign_id: rule.lottery_campaign_id,
      segment_key: rule.segment_key,
      tier_name: rule.tier_name
    })

    return true
  }

  /**
   * 验证三档位权重配置完整性
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {string} [segment_key='default'] - 用户分层标识
   * @param {Object} [options={}] - Sequelize查询选项
   * @returns {Promise<Object>} 验证结果
   */
  async validateTierWeights(lottery_campaign_id, segment_key = 'default', options = {}) {
    return this.LotteryTierRule.validateTierWeights(lottery_campaign_id, segment_key, options)
  }

  /**
   * 获取所有活动的分层配置概览
   *
   * @param {Object} [options={}] - Sequelize查询选项
   * @returns {Promise<Array>} 配置概览列表
   */
  async getConfigOverview(options = {}) {
    const rules = await this.LotteryTierRule.findAll({
      attributes: ['lottery_campaign_id', 'segment_key'],
      include: [
        {
          model: this.LotteryCampaign,
          as: 'campaign',
          attributes: ['lottery_campaign_id', 'campaign_name', 'status']
        }
      ],
      group: ['lottery_campaign_id', 'segment_key', 'campaign.lottery_campaign_id'],
      ...options
    })

    // 按活动ID分组
    const campaignMap = new Map()
    for (const rule of rules) {
      const key = rule.lottery_campaign_id
      if (!campaignMap.has(key)) {
        campaignMap.set(key, {
          lottery_campaign_id: rule.lottery_campaign_id,
          campaign_name: rule.campaign?.campaign_name,
          campaign_status: rule.campaign?.status,
          segments: []
        })
      }
      campaignMap.get(key).segments.push(rule.segment_key)
    }

    return Array.from(campaignMap.values())
  }

  /**
   * 格式化规则输出
   *
   * @param {Object} rule - 档位规则模型实例
   * @returns {Object} 格式化后的规则对象
   * @private
   */
  _formatRule(rule) {
    if (!rule) return null

    const formatted = {
      tier_rule_id: rule.tier_rule_id,
      lottery_campaign_id: rule.lottery_campaign_id,
      segment_key: rule.segment_key,
      tier_name: rule.tier_name,
      tier_weight: rule.tier_weight,
      probability: ((rule.tier_weight / this.WEIGHT_SCALE) * 100).toFixed(4) + '%',
      status: rule.status,
      created_by: rule.created_by,
      updated_by: rule.updated_by,
      created_at: rule.created_at,
      updated_at: rule.updated_at
    }

    // 添加关联信息
    if (rule.campaign) {
      formatted.campaign = {
        lottery_campaign_id: rule.campaign.lottery_campaign_id,
        campaign_name: rule.campaign.campaign_name,
        status: rule.campaign.status
      }
    }

    if (rule.creator) {
      formatted.creator = {
        user_id: rule.creator.user_id,
        nickname: rule.creator.nickname,
        mobile: rule.creator.mobile
      }
    }

    if (rule.updater) {
      formatted.updater = {
        user_id: rule.updater.user_id,
        nickname: rule.updater.nickname,
        mobile: rule.updater.mobile
      }
    }

    return formatted
  }
}

module.exports = LotteryTierRuleService
