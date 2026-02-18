/**
 * 广告创意服务层（AdCreativeService）
 *
 * 业务场景：
 * - 管理广告计划下的具体创意内容（图片、标题、链接等）
 * - 支持创意的审核流程（待审核→已审核/已拒绝）
 * - 记录创意的审核信息和审核人
 *
 * 服务对象：
 * - /api/v4/ad/creatives（小程序端 - 用户管理自己的创意）
 * - /api/v4/console/ad-creatives（管理端 - 创意审核）
 *
 * 创建时间：2026-02-18
 */

const logger = require('../utils/logger').logger
const { AdCreative, AdCampaign } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')

/**
 * 广告创意服务类
 */
class AdCreativeService {
  /**
   * 获取计划下的所有创意
   *
   * @param {number} campaignId - 广告计划ID
   * @param {Object} options - 查询选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Array>} 创意列表
   */
  static async getCreativesByCampaign(campaignId, options = {}) {
    try {
      const creatives = await AdCreative.findAll({
        where: { ad_campaign_id: campaignId },
        order: [['created_at', 'ASC']],
        transaction: options.transaction
      })

      // 附加显示名称
      await attachDisplayNames(creatives, [
        { field: 'review_status', dictType: DICT_TYPES.AD_REVIEW_STATUS }
      ])

      logger.info('获取计划创意列表', { campaignId, count: creatives.length })

      return creatives
    } catch (error) {
      logger.error('获取计划创意列表失败', { campaignId, error: error.message })
      throw error
    }
  }

  /**
   * 创建广告创意
   *
   * @param {Object} data - 创意数据
   * @param {number} data.ad_campaign_id - 广告计划ID
   * @param {string} data.title - 创意标题
   * @param {string} data.image_url - 图片URL
   * @param {number} data.image_width - 图片宽度（像素）
   * @param {number} data.image_height - 图片高度（像素）
   * @param {string} data.link_url - 跳转链接URL（可选）
   * @param {string} data.link_type - 链接类型（none/external/internal/app_page，默认none）
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 创建的创意对象
   */
  static async createCreative(data, options = {}) {
    try {
      // 验证计划是否存在
      const campaign = await AdCampaign.findByPk(data.ad_campaign_id, {
        transaction: options.transaction
      })

      if (!campaign) {
        throw new Error(`广告计划不存在: ${data.ad_campaign_id}`)
      }

      // 创建创意（默认待审核状态）
      const creative = await AdCreative.create(
        {
          ad_campaign_id: data.ad_campaign_id,
          title: data.title,
          image_url: data.image_url,
          image_width: data.image_width || null,
          image_height: data.image_height || null,
          link_url: data.link_url || null,
          link_type: data.link_type || 'none',
          review_status: 'pending'
        },
        { transaction: options.transaction }
      )

      logger.info('创建广告创意成功', {
        creative_id: creative.ad_creative_id,
        campaign_id: data.ad_campaign_id
      })

      return creative
    } catch (error) {
      logger.error('创建广告创意失败', { error: error.message, data })
      throw error
    }
  }

  /**
   * 审核广告创意（管理员操作）
   *
   * @param {number} creativeId - 创意ID
   * @param {number} adminId - 管理员ID
   * @param {string} action - 审核操作（approve/reject）
   * @param {string} note - 审核备注
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 更新后的创意对象
   */
  static async reviewCreative(creativeId, adminId, action, note, options = {}) {
    try {
      const creative = await AdCreative.findByPk(creativeId, {
        transaction: options.transaction
      })

      if (!creative) {
        throw new Error(`广告创意不存在: ${creativeId}`)
      }

      if (creative.review_status !== 'pending') {
        throw new Error(`只能审核待审核状态的创意，当前状态: ${creative.review_status}`)
      }

      if (action === 'approve') {
        // 审核通过
        await creative.update(
          {
            review_status: 'approved',
            reviewed_by: adminId,
            reviewed_at: BeijingTimeHelper.createBeijingTime(),
            review_note: note || null
          },
          { transaction: options.transaction }
        )
      } else if (action === 'reject') {
        // 审核拒绝
        await creative.update(
          {
            review_status: 'rejected',
            reviewed_by: adminId,
            reviewed_at: BeijingTimeHelper.createBeijingTime(),
            review_note: note || null
          },
          { transaction: options.transaction }
        )
      } else {
        throw new Error(`无效的审核操作: ${action}`)
      }

      logger.info('审核广告创意成功', {
        creative_id: creativeId,
        adminId,
        action,
        new_status: creative.review_status
      })

      return creative
    } catch (error) {
      logger.error('审核广告创意失败', { creativeId, adminId, action, error: error.message })
      throw error
    }
  }
}

module.exports = AdCreativeService
