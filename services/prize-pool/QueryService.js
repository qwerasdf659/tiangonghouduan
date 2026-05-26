'use strict'

const {
  LotteryCampaignPrize,
  PrizeDefinition,
  LotteryCampaign,
  MaterialAssetType,
  MediaFile,
  MediaAttachment
} = require('../../models')
const BusinessError = require('../../utils/BusinessError')
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
    return getImageUrl(media.object_key, media.content_hash)
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
          attributes: ['media_id', 'object_key', 'content_hash']
        }
      ]
    })

    attachments.forEach(att => {
      const code = idToCode.get(String(att.attachable_id))
      if (code && att.media?.object_key) {
        iconMap.set(code, getImageUrl(att.media.object_key, att.media.content_hash))
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
        throw new BusinessError(`活动不存在: ${campaign_code}`, 'PRIZE_POOL_NOT_FOUND', 404)
      }

      // 2. 获取活动奖品列表（JOIN prize_definitions）
      const campaignPrizes = await LotteryCampaignPrize.findAll({
        where: { lottery_campaign_id: campaign.lottery_campaign_id },
        include: [
          {
            model: PrizeDefinition,
            as: 'prizeDefinition',
            include: [
              {
                model: MediaFile,
                as: 'primaryMedia',
                required: false,
                attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys']
              }
            ]
          }
        ],
        order: [['created_at', 'DESC']]
      })

      // 3. 计算统计信息
      const totalPrizes = campaignPrizes.length
      const totalQuantity = campaignPrizes.reduce((sum, cp) => sum + (cp.stock_quantity || 0), 0)
      const usedQuantity = campaignPrizes.reduce((sum, cp) => sum + (cp.total_win_count || 0), 0)
      const remainingQuantity = totalQuantity - usedQuantity

      // 4. 批量查询材料资产图标
      const assetCodes = [
        ...new Set(
          campaignPrizes
            .filter(cp => cp.prizeDefinition && cp.prizeDefinition.material_asset_code)
            .map(cp => cp.prizeDefinition.material_asset_code)
        )
      ]
      const assetIconMap = await batchResolveAssetIconUrls(assetCodes)

      // 5. 格式化奖品数据（扁平化，兼容前端期望格式）
      const formattedPrizes = campaignPrizes.map(cp => {
        const def = cp.prizeDefinition || {}
        const selfUrl = resolvePrizeImageUrl({ primary_media: def.primaryMedia })
        const fallbackUrl = def.material_asset_code
          ? assetIconMap.get(def.material_asset_code) || null
          : null

        return {
          lottery_prize_id: cp.lottery_campaign_prize_id,
          lottery_campaign_prize_id: cp.lottery_campaign_prize_id,
          prize_definition_id: cp.prize_definition_id,
          lottery_campaign_id: cp.lottery_campaign_id,
          prize_name: def.display_name || '',
          prize_type: def.prize_type || 'material',
          prize_code: def.prize_code || '',
          material_asset_code: def.material_asset_code || null,
          material_amount: def.material_amount ? Number(def.material_amount) : null,
          stock_quantity: cp.stock_quantity,
          remaining_quantity: Math.max(0, (cp.stock_quantity || 0) - (cp.total_win_count || 0)),
          primary_media_id: def.primary_media_id,
          public_url: selfUrl || fallbackUrl,
          status: cp.status,
          sort_order: cp.sort_order,
          rarity_code: def.rarity_code || 'common',
          win_weight: cp.win_weight || 0,
          reward_tier: cp.reward_tier || 'low',
          is_fallback: cp.is_fallback || false,
          total_win_count: cp.total_win_count,
          daily_win_count: cp.daily_win_count,
          max_daily_wins: cp.max_daily_wins,
          max_user_wins: cp.max_user_wins,
          created_at: cp.created_at,
          updated_at: cp.updated_at
        }
      })

      // 6. 转换DECIMAL字段为数字类型
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
          remaining_quantity: Math.max(0, remainingQuantity),
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

      // 构建查询条件
      const where = {}
      if (lottery_campaign_id) where.lottery_campaign_id = parseInt(lottery_campaign_id)
      if (status) where.status = status

      const defWhere = {}
      if (merchant_id) defWhere.merchant_id = parseInt(merchant_id)

      const campaignPrizes = await LotteryCampaignPrize.findAll({
        where,
        include: [
          {
            model: LotteryCampaign,
            as: 'campaign',
            attributes: ['lottery_campaign_id', 'campaign_code', 'campaign_name', 'status']
          },
          {
            model: PrizeDefinition,
            as: 'prizeDefinition',
            where: Object.keys(defWhere).length > 0 ? defWhere : undefined,
            include: [
              {
                model: MediaFile,
                as: 'primaryMedia',
                required: false,
                attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys']
              }
            ]
          }
        ],
        order: [['created_at', 'DESC']]
      })

      // 统计信息
      const statistics = {
        total: campaignPrizes.length,
        active: campaignPrizes.filter(cp => cp.status === 'active').length,
        inactive: campaignPrizes.filter(cp => cp.status === 'inactive').length,
        stock_depleted: campaignPrizes.filter(cp => {
          return (cp.stock_quantity || 0) - (cp.total_win_count || 0) <= 0
        }).length,
        total_stock: campaignPrizes.reduce((sum, cp) => sum + (cp.stock_quantity || 0), 0),
        remaining_stock: campaignPrizes.reduce((sum, cp) => {
          return sum + Math.max(0, (cp.stock_quantity || 0) - (cp.total_win_count || 0))
        }, 0)
      }

      // 批量查询材料资产图标
      const assetCodes = [
        ...new Set(
          campaignPrizes
            .filter(cp => cp.prizeDefinition && cp.prizeDefinition.material_asset_code)
            .map(cp => cp.prizeDefinition.material_asset_code)
        )
      ]
      const assetIconMap = await batchResolveAssetIconUrls(assetCodes)

      // 格式化
      const formattedPrizes = campaignPrizes.map(cp => {
        const def = cp.prizeDefinition || {}
        const selfUrl = resolvePrizeImageUrl({ primary_media: def.primaryMedia })
        const fallbackUrl = def.material_asset_code
          ? assetIconMap.get(def.material_asset_code) || null
          : null

        return {
          lottery_prize_id: cp.lottery_campaign_prize_id,
          lottery_campaign_prize_id: cp.lottery_campaign_prize_id,
          lottery_campaign_id: cp.lottery_campaign_id,
          campaign_name: cp.campaign?.campaign_name || '未关联活动',
          campaign_code: cp.campaign?.campaign_code,
          prize_name: def.display_name || '',
          prize_type: def.prize_type || 'material',
          prize_code: def.prize_code || '',
          material_asset_code: def.material_asset_code || null,
          material_amount: def.material_amount ? Number(def.material_amount) : null,
          stock_quantity: cp.stock_quantity,
          remaining_quantity: Math.max(0, (cp.stock_quantity || 0) - (cp.total_win_count || 0)),
          total_win_count: cp.total_win_count || 0,
          daily_win_count: cp.daily_win_count || 0,
          max_daily_wins: cp.max_daily_wins,
          primary_media_id: def.primary_media_id,
          public_url: selfUrl || fallbackUrl,
          status: cp.status,
          sort_order: cp.sort_order,
          rarity_code: def.rarity_code || 'common',
          win_weight: cp.win_weight || 0,
          reward_tier: cp.reward_tier || 'low',
          is_fallback: cp.is_fallback || false,
          created_at: cp.created_at,
          updated_at: cp.updated_at
        }
      })

      const convertedPrizes = DecimalConverter.convertPrizeData(formattedPrizes)

      logger.info('获取奖品列表成功', { count: campaignPrizes.length })

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
        throw new BusinessError(`活动不存在: ${campaign_code}`, 'PRIZE_POOL_NOT_FOUND', 404)
      }

      const campaignPrizes = await LotteryCampaignPrize.findAll({
        where: { lottery_campaign_id: campaign.lottery_campaign_id },
        include: [
          {
            model: PrizeDefinition,
            as: 'prizeDefinition',
            include: [
              {
                model: MediaFile,
                as: 'primaryMedia',
                required: false,
                attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys']
              }
            ]
          }
        ],
        order: [
          ['reward_tier', 'ASC'],
          ['sort_order', 'ASC']
        ]
      })

      // 批量查询材料资产图标
      const assetCodes = [
        ...new Set(
          campaignPrizes
            .filter(cp => cp.prizeDefinition && cp.prizeDefinition.material_asset_code)
            .map(cp => cp.prizeDefinition.material_asset_code)
        )
      ]
      const assetIconMap = await batchResolveAssetIconUrls(assetCodes)

      const tierLabels = { high: '高档', mid: '中档', low: '低档' }
      const tierOrder = ['high', 'mid', 'low']
      const warnings = []

      // 按 reward_tier 分组
      const grouped = {}
      for (const cp of campaignPrizes) {
        const tier = cp.reward_tier || 'low'
        if (!grouped[tier]) grouped[tier] = []
        grouped[tier].push(cp)
      }

      // 构建分组结果
      const prizeGroups = tierOrder
        .filter(tier => grouped[tier] && grouped[tier].length > 0)
        .map(tier => {
          const tierPrizes = grouped[tier]
          const totalWeight = tierPrizes.reduce((sum, cp) => sum + (cp.win_weight || 0), 0)

          const formattedPrizes = tierPrizes.map(cp => {
            const def = cp.prizeDefinition || {}
            const tierPercentage =
              totalWeight > 0
                ? parseFloat((((cp.win_weight || 0) / totalWeight) * 100).toFixed(2))
                : 0

            if (cp.stock_quantity === 0 && (cp.win_weight || 0) > 0) {
              warnings.push({
                lottery_prize_id: cp.lottery_campaign_prize_id,
                type: 'zero_stock_positive_weight',
                message: `${def.display_name}：库存为 0 但权重 ${cp.win_weight} > 0`
              })
            }

            const selfUrl = resolvePrizeImageUrl({ primary_media: def.primaryMedia })
            const fallbackUrl = def.material_asset_code
              ? assetIconMap.get(def.material_asset_code) || null
              : null

            return {
              lottery_prize_id: cp.lottery_campaign_prize_id,
              lottery_campaign_prize_id: cp.lottery_campaign_prize_id,
              lottery_campaign_id: cp.lottery_campaign_id,
              prize_name: def.display_name || '',
              prize_type: def.prize_type || 'material',
              prize_code: def.prize_code || '',
              win_weight: cp.win_weight || 0,
              tier_percentage: tierPercentage,
              stock_quantity: cp.stock_quantity,
              remaining_quantity: Math.max(0, (cp.stock_quantity || 0) - (cp.total_win_count || 0)),
              total_win_count: cp.total_win_count || 0,
              is_fallback: cp.is_fallback || false,
              sort_order: cp.sort_order,
              status: cp.status,
              rarity_code: def.rarity_code || 'common',
              primary_media_id: def.primary_media_id,
              public_url: selfUrl || fallbackUrl,
              daily_win_count: cp.daily_win_count || 0,
              max_daily_wins: cp.max_daily_wins,
              reward_tier: cp.reward_tier,
              created_at: cp.created_at,
              updated_at: cp.updated_at
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
        total_prizes: campaignPrizes.length
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
