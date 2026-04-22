'use strict'

const {
  LotteryPrize,
  LotteryCampaign,
  MaterialAssetType,
  MediaFile,
  MediaAttachment
} = require('../../models')
const DecimalConverter = require('../../utils/formatters/DecimalConverter')
const { getImageUrl } = require('../../utils/ImageUrlHelper')

const logger = require('../../utils/logger').logger

/**
 * 从 Sequelize primary_media 关联生成公网图片 URL
 *
 * @param {Object} prize - Sequelize 奖品实例（需 include primary_media）
 * @returns {string|null} 公网图片 URL
 */
function resolvePrizeImageUrl(prize) {
  const media = prize.primary_media
  if (!media) return null

  if (typeof media.getPublicUrl === 'function') {
    return media.getPublicUrl()
  }
  if (media.object_key) {
    return getImageUrl(media.object_key)
  }
  return null
}

/**
 * 批量查询材料资产类型图标 URL（通过 media_attachments 关联）
 *
 * @param {string[]} assetCodes - 材料资产编码列表
 * @returns {Promise<Map<string, string>>} asset_code → 图标 URL 映射
 */
async function batchResolveAssetIconUrls(assetCodes) {
  const iconMap = new Map()
  if (!assetCodes.length || !MediaAttachment) return iconMap

  try {
    const assetTypes = await MaterialAssetType.findAll({
      where: { asset_code: assetCodes },
      attributes: ['material_asset_type_id', 'asset_code']
    })
    if (!assetTypes.length) return iconMap

    const idToCode = new Map()
    assetTypes.forEach(at => idToCode.set(String(at.material_asset_type_id), at.asset_code))

    const attachments = await MediaAttachment.findAll({
      where: {
        attachable_type: 'material_asset_type',
        attachable_id: Array.from(idToCode.keys()),
        role: 'icon'
      },
      include: [
        {
          model: MediaFile,
          as: 'media',
          required: true,
          attributes: ['media_id', 'object_key']
        }
      ]
    })

    attachments.forEach(att => {
      const code = idToCode.get(String(att.attachable_id))
      if (code && att.media?.object_key) {
        iconMap.set(code, getImageUrl(att.media.object_key))
      }
    })
  } catch (err) {
    logger.warn('批量查询材料图标失败（非致命）', { error: err.message })
  }
  return iconMap
}

/**
 * 奖品查询/分组服务
 * 职责：奖品列表查询、按活动查询、分组统计
 */
class PrizeQueryService {
  /**
   * 获取指定活动的奖品池
   *
   * @param {string} campaign_code - 活动代码
   * @returns {Promise<Object>} 奖品池信息
   */
  static async getPrizesByCampaign(campaign_code) {
    try {
      logger.info('获取活动奖品池', { campaign_code })

      // 1. 通过campaign_code查找活动信息
      const campaign = await LotteryCampaign.findOne({
        where: { campaign_code }
      })

      if (!campaign) {
        throw new Error(`活动不存在: ${campaign_code}`)
      }

      // 2. 获取奖品列表（含主图媒体文件）
      const prizes = await LotteryPrize.findAll({
        where: { lottery_campaign_id: campaign.lottery_campaign_id },
        include: [
          {
            model: MediaFile,
            as: 'primary_media',
            required: false,
            attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys']
          }
        ],
        order: [['created_at', 'DESC']],
        attributes: [
          'lottery_prize_id',
          'lottery_campaign_id',
          'prize_name',
          'prize_type',
          'prize_value',
          'prize_value_points',
          'budget_cost',
          'material_asset_code',
          'material_amount',
          'stock_quantity',
          'win_probability',
          'prize_description',
          'primary_media_id',
          'angle',
          'color',
          'cost_points',
          'status',
          'sort_order',
          'rarity_code',
          'win_weight',
          'reward_tier',
          'is_fallback',
          'total_win_count',
          'daily_win_count',
          'max_daily_wins',
          'created_at',
          'updated_at'
        ]
      })

      // 3. 计算统计信息
      const totalPrizes = prizes.length
      const totalQuantity = prizes.reduce((sum, prize) => sum + (prize.stock_quantity || 0), 0)
      const remainingQuantity = prizes.reduce((sum, prize) => {
        const remaining = (prize.stock_quantity || 0) - (prize.total_win_count || 0)
        return sum + Math.max(0, remaining)
      }, 0)
      const usedQuantity = prizes.reduce((sum, prize) => sum + (prize.total_win_count || 0), 0)

      // 4. 批量查询材料资产图标
      const assetCodes = [
        ...new Set(prizes.filter(p => p.material_asset_code).map(p => p.material_asset_code))
      ]
      const assetIconMap = await batchResolveAssetIconUrls(assetCodes)

      // 5. 格式化奖品数据
      const formattedPrizes = prizes.map(prize => {
        const selfUrl = resolvePrizeImageUrl(prize)
        const fallbackUrl = prize.material_asset_code
          ? assetIconMap.get(prize.material_asset_code) || null
          : null

        return {
          lottery_prize_id: prize.lottery_prize_id,
          lottery_campaign_id: prize.lottery_campaign_id,
          prize_name: prize.prize_name,
          prize_type: prize.prize_type,
          prize_value: prize.prize_value,
          prize_value_points: prize.prize_value_points,
          budget_cost: prize.budget_cost || 0,
          material_asset_code: prize.material_asset_code || null,
          material_amount: prize.material_amount || null,
          stock_quantity: prize.stock_quantity,
          remaining_quantity: Math.max(
            0,
            (prize.stock_quantity || 0) - (prize.total_win_count || 0)
          ),
          win_probability: prize.win_probability,
          prize_description: prize.prize_description,
          primary_media_id: prize.primary_media_id,
          public_url: selfUrl || fallbackUrl,
          angle: prize.angle,
          color: prize.color,
          cost_points: prize.cost_points,
          status: prize.status,
          sort_order: prize.sort_order,
          rarity_code: prize.rarity_code || 'common',
          win_weight: prize.win_weight || 0,
          reward_tier: prize.reward_tier || 'low',
          is_fallback: prize.is_fallback || false,
          total_win_count: prize.total_win_count,
          daily_win_count: prize.daily_win_count,
          max_daily_wins: prize.max_daily_wins,
          created_at: prize.created_at,
          updated_at: prize.updated_at
        }
      })

      // 5. 转换DECIMAL字段为数字类型
      const convertedPrizes = DecimalConverter.convertPrizeData(formattedPrizes)

      logger.info('获取活动奖品池成功', {
        campaign_code,
        prize_count: totalPrizes
      })

      return {
        campaign: {
          campaign_code: campaign.campaign_code,
          campaign_name: campaign.campaign_name,
          status: campaign.status
        },
        statistics: {
          total_prizes: totalPrizes,
          total_quantity: totalQuantity,
          remaining_quantity: remainingQuantity,
          used_quantity: usedQuantity,
          usage_rate: totalQuantity > 0 ? ((usedQuantity / totalQuantity) * 100).toFixed(2) : 0
        },
        prizes: convertedPrizes
      }
    } catch (error) {
      logger.error('获取活动奖品池失败', {
        error: error.message,
        campaign_code
      })
      throw error
    }
  }

  /**
   * 获取所有奖品列表（支持过滤）
   *
   * @param {Object} filters - 过滤条件
   * @param {number} filters.lottery_campaign_id - 活动ID（可选）
   * @param {string} filters.status - 状态（可选）
   * @returns {Promise<Object>} 奖品列表和统计信息
   */
  static async getAllPrizes(filters = {}) {
    try {
      const { lottery_campaign_id, status, merchant_id } = filters

      logger.info('获取奖品列表', { filters })

      // 1. 构建查询条件
      const where = {}
      if (lottery_campaign_id) where.lottery_campaign_id = parseInt(lottery_campaign_id)
      if (status) where.status = status
      if (merchant_id) where.merchant_id = parseInt(merchant_id)

      // 2. 查询奖品列表（含主图媒体文件）
      const prizes = await LotteryPrize.findAll({
        where,
        include: [
          {
            model: LotteryCampaign,
            as: 'campaign',
            attributes: ['lottery_campaign_id', 'campaign_code', 'campaign_name', 'status']
          },
          {
            model: MediaFile,
            as: 'primary_media',
            required: false,
            attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys']
          }
        ],
        order: [['created_at', 'DESC']],
        attributes: [
          'lottery_prize_id',
          'lottery_campaign_id',
          'prize_name',
          'prize_type',
          'prize_value',
          'prize_value_points',
          'budget_cost',
          'material_asset_code',
          'material_amount',
          'stock_quantity',
          'total_win_count',
          'daily_win_count',
          'max_daily_wins',
          'win_probability',
          'prize_description',
          'primary_media_id',
          'angle',
          'color',
          'cost_points',
          'status',
          'sort_order',
          'rarity_code',
          'win_weight',
          'reward_tier',
          'is_fallback',
          'created_at',
          'updated_at'
        ]
      })

      // 3. 计算统计信息
      const statistics = {
        total: prizes.length,
        active: prizes.filter(p => p.status === 'active').length,
        inactive: prizes.filter(p => p.status === 'inactive').length,
        stock_depleted: prizes.filter(p => {
          const remaining = (p.stock_quantity || 0) - (p.total_win_count || 0)
          return remaining <= 0
        }).length,
        total_stock: prizes.reduce((sum, p) => sum + (p.stock_quantity || 0), 0),
        remaining_stock: prizes.reduce((sum, p) => {
          const remaining = (p.stock_quantity || 0) - (p.total_win_count || 0)
          return sum + Math.max(0, remaining)
        }, 0)
      }

      // 4. 批量查询材料资产图标
      const assetCodes = [
        ...new Set(prizes.filter(p => p.material_asset_code).map(p => p.material_asset_code))
      ]
      const assetIconMap = await batchResolveAssetIconUrls(assetCodes)

      // 5. 格式化奖品数据
      const formattedPrizes = prizes.map(prize => {
        const selfUrl = resolvePrizeImageUrl(prize)
        const fallbackUrl = prize.material_asset_code
          ? assetIconMap.get(prize.material_asset_code) || null
          : null

        return {
          lottery_prize_id: prize.lottery_prize_id,
          lottery_campaign_id: prize.lottery_campaign_id,
          campaign_name: prize.campaign?.campaign_name || '未关联活动',
          campaign_code: prize.campaign?.campaign_code,
          prize_name: prize.prize_name,
          prize_type: prize.prize_type,
          prize_value: prize.prize_value,
          prize_value_points: prize.prize_value_points,
          budget_cost: prize.budget_cost || 0,
          material_asset_code: prize.material_asset_code || null,
          material_amount: prize.material_amount || null,
          stock_quantity: prize.stock_quantity,
          remaining_quantity: Math.max(
            0,
            (prize.stock_quantity || 0) - (prize.total_win_count || 0)
          ),
          total_win_count: prize.total_win_count || 0,
          daily_win_count: prize.daily_win_count || 0,
          max_daily_wins: prize.max_daily_wins,
          win_probability: prize.win_probability,
          prize_description: prize.prize_description,
          primary_media_id: prize.primary_media_id,
          public_url: selfUrl || fallbackUrl,
          angle: prize.angle,
          color: prize.color,
          cost_points: prize.cost_points,
          status: prize.status,
          sort_order: prize.sort_order,
          rarity_code: prize.rarity_code || 'common',
          win_weight: prize.win_weight || 0,
          reward_tier: prize.reward_tier || 'low',
          is_fallback: prize.is_fallback || false,
          created_at: prize.created_at,
          updated_at: prize.updated_at
        }
      })

      // 5. 转换DECIMAL字段为数字类型
      const convertedPrizes = DecimalConverter.convertPrizeData(formattedPrizes)

      logger.info('获取奖品列表成功', { count: prizes.length })

      return {
        prizes: convertedPrizes,
        statistics
      }
    } catch (error) {
      logger.error('获取奖品列表失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取指定活动的奖品列表，按档位分组返回
   * 包含档内占比计算和库存风险检测
   *
   * @param {string} campaign_code - 活动业务码
   * @returns {Promise<Object>} 分组后的奖品数据 + 风险警告
   */
  static async getPrizesByCampaignGrouped(campaign_code) {
    try {
      logger.info('获取活动奖品分组数据', { campaign_code })

      const campaign = await LotteryCampaign.findOne({
        where: { campaign_code }
      })
      if (!campaign) {
        throw new Error(`活动不存在: ${campaign_code}`)
      }

      const prizes = await LotteryPrize.findAll({
        where: { lottery_campaign_id: campaign.lottery_campaign_id },
        include: [
          {
            model: MediaFile,
            as: 'primary_media',
            required: false,
            attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys']
          }
        ],
        order: [
          ['reward_tier', 'ASC'],
          ['sort_order', 'ASC']
        ],
        attributes: [
          'lottery_prize_id',
          'lottery_campaign_id',
          'prize_name',
          'prize_type',
          'prize_value',
          'prize_value_points',
          'stock_quantity',
          'win_probability',
          'win_weight',
          'reward_tier',
          'is_fallback',
          'prize_description',
          'primary_media_id',
          'angle',
          'color',
          'cost_points',
          'status',
          'sort_order',
          'rarity_code',
          'total_win_count',
          'daily_win_count',
          'max_daily_wins',
          'created_at',
          'updated_at'
        ]
      })

      /** 批量查询材料资产图标 */
      const assetCodes = [
        ...new Set(prizes.filter(p => p.material_asset_code).map(p => p.material_asset_code))
      ]
      const assetIconMap = await batchResolveAssetIconUrls(assetCodes)

      /** 档位中文标签映射 */
      const tierLabels = { high: '高档', mid: '中档', low: '低档' }
      const tierOrder = ['high', 'mid', 'low']
      const warnings = []

      /** 按 reward_tier 分组 */
      const grouped = {}
      for (const prize of prizes) {
        const tier = prize.reward_tier || 'low'
        if (!grouped[tier]) grouped[tier] = []
        grouped[tier].push(prize)
      }

      /** 构建分组结果，计算档内占比 */
      const prizeGroups = tierOrder
        .filter(tier => grouped[tier] && grouped[tier].length > 0)
        .map(tier => {
          const tierPrizes = grouped[tier]
          const totalWeight = tierPrizes.reduce((sum, p) => sum + (p.win_weight || 0), 0)

          const formattedPrizes = tierPrizes.map(p => {
            const tierPercentage =
              totalWeight > 0
                ? parseFloat((((p.win_weight || 0) / totalWeight) * 100).toFixed(2))
                : 0

            if (p.stock_quantity === 0 && (p.win_weight || 0) > 0) {
              warnings.push({
                lottery_prize_id: p.lottery_prize_id,
                type: 'zero_stock_positive_weight',
                message: `${p.prize_name}：库存为 0 但权重 ${p.win_weight} > 0`
              })
            }

            return {
              lottery_prize_id: p.lottery_prize_id,
              lottery_campaign_id: p.lottery_campaign_id,
              prize_name: p.prize_name,
              prize_type: p.prize_type,
              prize_value: p.prize_value,
              prize_value_points: p.prize_value_points,
              win_weight: p.win_weight || 0,
              tier_percentage: tierPercentage,
              stock_quantity: p.stock_quantity,
              remaining_quantity: Math.max(0, (p.stock_quantity || 0) - (p.total_win_count || 0)),
              total_win_count: p.total_win_count || 0,
              is_fallback: p.is_fallback || false,
              sort_order: p.sort_order,
              status: p.status,
              rarity_code: p.rarity_code || 'common',
              win_probability: p.win_probability,
              prize_description: p.prize_description,
              primary_media_id: p.primary_media_id,
              public_url:
                resolvePrizeImageUrl(p) ||
                (p.material_asset_code ? assetIconMap.get(p.material_asset_code) : null) ||
                null,
              angle: p.angle,
              color: p.color,
              cost_points: p.cost_points,
              daily_win_count: p.daily_win_count || 0,
              max_daily_wins: p.max_daily_wins,
              reward_tier: p.reward_tier,
              created_at: p.created_at,
              updated_at: p.updated_at
            }
          })

          return {
            tier,
            tier_label: tierLabels[tier] || tier,
            prize_count: tierPrizes.length,
            total_weight: totalWeight,
            prizes: DecimalConverter.convertPrizeData(formattedPrizes)
          }
        })

      logger.info('获取活动奖品分组数据成功', {
        campaign_code,
        group_count: prizeGroups.length,
        total_prizes: prizes.length
      })

      return {
        campaign: {
          lottery_campaign_id: campaign.lottery_campaign_id,
          campaign_name: campaign.campaign_name,
          campaign_code: campaign.campaign_code,
          pick_method: campaign.pick_method,
          status: campaign.status
        },
        prize_groups: prizeGroups,
        warnings
      }
    } catch (error) {
      logger.error('获取活动奖品分组数据失败', { error: error.message, campaign_code })
      throw error
    }
  }
}

module.exports = PrizeQueryService
