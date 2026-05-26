'use strict'

const {
  PrizeDefinition,
  MaterialAssetType,
  ItemTemplate,
  RarityDef,
  MediaFile,
  LotteryCampaignPrize
} = require('../../models')
const { Op } = require('../../models')

/**
 * 奖品目录查询服务
 * 职责：奖品定义的分页查询、搜索、下拉选项
 * 读操作收口，支持缓存
 */
class PrizeDefinitionQueryService {
  /**
   * 分页查询奖品目录
   *
   * @param {Object} filters - 筛选条件
   * @param {string} [filters.prize_type] - 奖品类型筛选
   * @param {string} [filters.rarity_code] - 稀有度筛选
   * @param {string} [filters.reward_tier] - 档位筛选
   * @param {string} [filters.keyword] - 关键词搜索（匹配 prize_code / display_name）
   * @param {boolean} [filters.is_enabled] - 启用状态筛选
   * @param {number} [filters.merchant_id] - 商户筛选
   * @param {number} [filters.page=1] - 页码
   * @param {number} [filters.page_size=20] - 每页数量
   * @returns {Promise<Object>} { items, total, page, page_size }
   */
  static async list(filters = {}) {
    const {
      prize_type,
      rarity_code,
      reward_tier,
      keyword,
      is_enabled,
      merchant_id,
      page = 1,
      page_size = 20
    } = filters

    const where = {}

    if (prize_type) where.prize_type = prize_type
    if (rarity_code) where.rarity_code = rarity_code
    if (reward_tier) where.reward_tier = reward_tier
    if (is_enabled !== undefined) where.is_enabled = is_enabled ? 1 : 0
    if (merchant_id) where.merchant_id = merchant_id

    if (keyword) {
      where[Op.or] = [
        { prize_code: { [Op.like]: `%${keyword}%` } },
        { display_name: { [Op.like]: `%${keyword}%` } }
      ]
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await PrizeDefinition.findAndCountAll({
      where,
      include: [
        {
          model: MaterialAssetType,
          as: 'materialAssetType',
          attributes: ['asset_code', 'display_name', 'budget_value_points', 'visible_value_points']
        },
        {
          model: ItemTemplate,
          as: 'itemTemplate',
          attributes: ['item_template_id', 'template_code', 'display_name']
        },
        {
          model: RarityDef,
          as: 'rarityDef',
          attributes: ['rarity_code', 'display_name', 'sort_order']
        },
        {
          model: MediaFile,
          as: 'primaryMedia',
          attributes: ['media_id', 'object_key', 'thumbnail_keys', 'mime_type']
        }
      ],
      order: [['prize_definition_id', 'DESC']],
      limit: page_size,
      offset,
      distinct: true
    })

    return {
      items: rows,
      total: count,
      page,
      page_size
    }
  }

  /**
   * 获取奖品目录下拉选项（活动配置时选择奖品用）
   * 只返回启用的奖品，精简字段
   *
   * @param {Object} [filters] - 可选筛选
   * @param {string} [filters.prize_type] - 按类型筛选
   * @param {number} [filters.merchant_id] - 按商户筛选
   * @returns {Promise<Array>} 选项列表
   */
  static async getOptions(filters = {}) {
    const where = { is_enabled: 1 }

    if (filters.prize_type) where.prize_type = filters.prize_type
    if (filters.merchant_id) where.merchant_id = filters.merchant_id

    const options = await PrizeDefinition.findAll({
      where,
      attributes: [
        'prize_definition_id',
        'prize_code',
        'display_name',
        'prize_type',
        'rarity_code',
        'reward_tier',
        'material_asset_code',
        'material_amount'
      ],
      include: [{ model: RarityDef, as: 'rarityDef', attributes: ['display_name', 'sort_order'] }],
      order: [
        ['reward_tier', 'DESC'],
        ['prize_definition_id', 'ASC']
      ]
    })

    return options
  }

  /**
   * 获取单个奖品定义详情（含活动引用统计）
   *
   * @param {number} prizeDefinitionId - 奖品定义ID
   * @returns {Promise<Object>} 奖品定义详情
   */
  static async getDetail(prizeDefinitionId) {
    const prizeDefinition = await PrizeDefinition.findByPk(prizeDefinitionId, {
      include: [
        { model: MaterialAssetType, as: 'materialAssetType' },
        { model: ItemTemplate, as: 'itemTemplate' },
        { model: RarityDef, as: 'rarityDef' },
        { model: MediaFile, as: 'primaryMedia' }
      ]
    })

    if (!prizeDefinition) {
      return null
    }

    // 统计被多少活动引用
    const campaignCount = await LotteryCampaignPrize.count({
      where: { prize_definition_id: prizeDefinitionId }
    })

    // 统计总中奖次数（跨活动）
    const totalWins = await LotteryCampaignPrize.sum('total_win_count', {
      where: { prize_definition_id: prizeDefinitionId }
    })

    const result = prizeDefinition.toJSON()
    result.campaign_count = campaignCount
    result.total_wins_across_campaigns = totalWins || 0

    return result
  }

  /**
   * 按活动查询已关联的奖品（含奖品定义详情）
   *
   * @param {number} lotteryCampaignId - 活动ID
   * @param {Object} [filters] - 筛选条件
   * @param {string} [filters.status] - 状态筛选
   * @param {string} [filters.reward_tier] - 档位筛选
   * @returns {Promise<Array>} 活动奖品列表
   */
  static async getByCampaign(lotteryCampaignId, filters = {}) {
    const where = { lottery_campaign_id: lotteryCampaignId }

    if (filters.status) where.status = filters.status
    if (filters.reward_tier) where.reward_tier = filters.reward_tier

    const campaignPrizes = await LotteryCampaignPrize.findAll({
      where,
      include: [
        {
          model: PrizeDefinition,
          as: 'prizeDefinition',
          include: [
            {
              model: MaterialAssetType,
              as: 'materialAssetType',
              attributes: [
                'asset_code',
                'display_name',
                'budget_value_points',
                'visible_value_points'
              ]
            },
            { model: RarityDef, as: 'rarityDef', attributes: ['rarity_code', 'display_name'] },
            {
              model: MediaFile,
              as: 'primaryMedia',
              attributes: ['media_id', 'object_key', 'thumbnail_keys', 'mime_type']
            }
          ]
        }
      ],
      order: [
        ['reward_tier', 'DESC'],
        ['sort_order', 'ASC'],
        ['lottery_campaign_prize_id', 'ASC']
      ]
    })

    return campaignPrizes
  }

  /**
   * 按活动查询奖品并按档位分组
   *
   * @param {number} lotteryCampaignId - 活动ID
   * @returns {Promise<Object>} { high: [...], mid: [...], low: [...], statistics }
   */
  static async getByCampaignGrouped(lotteryCampaignId) {
    const prizes = await PrizeDefinitionQueryService.getByCampaign(lotteryCampaignId, {
      status: 'active'
    })

    const grouped = { high: [], mid: [], low: [] }
    let totalWeight = 0

    for (const prize of prizes) {
      const tier = prize.reward_tier || 'low'
      if (grouped[tier]) {
        grouped[tier].push(prize)
      }
      totalWeight += prize.win_weight || 0
    }

    // 计算各档位概率占比
    const statistics = {
      total_count: prizes.length,
      total_weight: totalWeight,
      tiers: {}
    }

    for (const tier of ['high', 'mid', 'low']) {
      const tierPrizes = grouped[tier]
      const tierWeight = tierPrizes.reduce((sum, p) => sum + (p.win_weight || 0), 0)
      statistics.tiers[tier] = {
        count: tierPrizes.length,
        weight: tierWeight,
        percentage: totalWeight > 0 ? ((tierWeight / totalWeight) * 100).toFixed(2) : '0.00'
      }
    }

    return { ...grouped, statistics }
  }
}

module.exports = PrizeDefinitionQueryService
