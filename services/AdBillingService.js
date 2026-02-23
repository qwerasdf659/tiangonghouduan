/**
 * 广告计费服务层（AdBillingService）
 *
 * 业务场景：
 * - 管理广告计划的资金变动（冻结、扣款、退款、日扣等）
 * - 记录广告计划的计费历史
 * - 处理固定包天和竞价两种计费模式的资金操作
 *
 * 服务对象：
 * - /api/v4/ad/billing（小程序端 - 用户查看计费记录）
 * - /api/v4/console/ad-billing（管理端 - 计费管理和统计）
 *
 * 创建时间：2026-02-18
 *
 * 注意：
 * - 钻石冻结/扣款/退款操作已集成 BalanceService（统一资产服务）
 * - 每个操作同时创建 AdBillingRecord 记录和实际执行资产变动
 */

const logger = require('../utils/logger').logger
const { AdBillingRecord, AdCampaign } = require('../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')
const { v4: uuidv4 } = require('uuid')
const BalanceService = require('./asset/BalanceService')

/**
 * 广告计费服务类
 */
class AdBillingService {
  /**
   * 冻结钻石（固定包天模式提交审核时）
   *
   * @param {number} campaignId - 广告计划ID
   * @param {number} amount - 冻结金额（钻石）
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 创建的计费记录对象
   */
  static async freezeDiamonds(campaignId, amount, options = {}) {
    try {
      const campaign = await AdCampaign.findByPk(campaignId, {
        transaction: options.transaction
      })

      if (!campaign) {
        throw new Error(`广告计划不存在: ${campaignId}`)
      }

      if (campaign.billing_mode !== 'fixed_daily') {
        throw new Error(`只有固定包天模式需要冻结钻石，当前模式: ${campaign.billing_mode}`)
      }

      // 生成business_id
      const business_id = `freeze_${campaignId}_${Date.now()}_${uuidv4().substring(0, 8)}`

      // 获取今天的日期（YYYY-MM-DD格式）
      const today = BeijingTimeHelper.createBeijingTime()
      const billingDate = today.toISOString().split('T')[0]

      // 创建冻结记录
      const billingRecord = await AdBillingRecord.create(
        {
          business_id,
          ad_campaign_id: campaignId,
          advertiser_user_id: campaign.advertiser_user_id,
          billing_date: billingDate,
          amount_diamond: amount,
          billing_type: 'freeze',
          remark: `固定包天计划冻结钻石: ${amount}钻石`
        },
        { transaction: options.transaction }
      )

      // 调用 BalanceService 执行实际的钻石冻结（available → frozen）
      await BalanceService.freeze(
        {
          user_id: campaign.advertiser_user_id,
          asset_code: 'DIAMOND',
          amount,
          business_type: 'ad_campaign_freeze',
          idempotency_key: `ad_freeze_${business_id}`,
          meta: {
            ad_campaign_id: campaignId,
            billing_record_id: billingRecord.ad_billing_record_id
          }
        },
        { transaction: options.transaction }
      )

      logger.info('冻结钻石成功', {
        campaign_id: campaignId,
        amount,
        billing_record_id: billingRecord.ad_billing_record_id
      })

      return billingRecord
    } catch (error) {
      logger.error('冻结钻石失败', { campaignId, amount, error: error.message })
      throw error
    }
  }

  /**
   * 扣款（将冻结转为扣款，固定包天模式审核通过时）
   *
   * @param {number} campaignId - 广告计划ID
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 创建的扣款记录对象
   */
  static async deductFrozenDiamonds(campaignId, options = {}) {
    try {
      const campaign = await AdCampaign.findByPk(campaignId, {
        transaction: options.transaction
      })

      if (!campaign) {
        throw new Error(`广告计划不存在: ${campaignId}`)
      }

      if (campaign.billing_mode !== 'fixed_daily' || !campaign.fixed_total_diamond) {
        throw new Error(`固定包天模式必须提供fixed_total_diamond`)
      }

      // 查找冻结记录
      const freezeRecord = await AdBillingRecord.findOne({
        where: {
          ad_campaign_id: campaignId,
          billing_type: 'freeze'
        },
        order: [['created_at', 'DESC']],
        transaction: options.transaction
      })

      if (!freezeRecord) {
        throw new Error(`未找到冻结记录: ${campaignId}`)
      }

      const amount = campaign.fixed_total_diamond

      // 生成business_id
      const business_id = `deduct_${campaignId}_${Date.now()}_${uuidv4().substring(0, 8)}`

      // 获取今天的日期（YYYY-MM-DD格式）
      const today = BeijingTimeHelper.createBeijingTime()
      const billingDate = today.toISOString().split('T')[0]

      // 创建扣款记录
      const billingRecord = await AdBillingRecord.create(
        {
          business_id,
          ad_campaign_id: campaignId,
          advertiser_user_id: campaign.advertiser_user_id,
          billing_date: billingDate,
          amount_diamond: amount,
          billing_type: 'deduct',
          remark: `固定包天计划扣款: ${amount}钻石（从冻结转为扣款）`
        },
        { transaction: options.transaction }
      )

      // 调用 BalanceService 从冻结金额中结算（frozen → 扣除）
      await BalanceService.settleFromFrozen(
        {
          user_id: campaign.advertiser_user_id,
          asset_code: 'DIAMOND',
          amount,
          business_type: 'ad_campaign_deduct',
          idempotency_key: `ad_deduct_${business_id}`,
          meta: {
            ad_campaign_id: campaignId,
            billing_record_id: billingRecord.ad_billing_record_id
          }
        },
        { transaction: options.transaction }
      )

      logger.info('扣款成功', {
        campaign_id: campaignId,
        amount,
        billing_record_id: billingRecord.ad_billing_record_id
      })

      return billingRecord
    } catch (error) {
      logger.error('扣款失败', { campaignId, error: error.message })
      throw error
    }
  }

  /**
   * 退款（审核拒绝或取消时）
   *
   * @param {number} campaignId - 广告计划ID
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 创建的退款记录对象
   */
  static async refundDiamonds(campaignId, options = {}) {
    try {
      const campaign = await AdCampaign.findByPk(campaignId, {
        transaction: options.transaction
      })

      if (!campaign) {
        throw new Error(`广告计划不存在: ${campaignId}`)
      }

      // 计算实际冻结净额：总冻结 - 已扣款 - 已退款
      const freezeSum =
        (await AdBillingRecord.sum('amount_diamond', {
          where: { ad_campaign_id: campaignId, billing_type: 'freeze' },
          transaction: options.transaction
        })) || 0

      const deductSum =
        (await AdBillingRecord.sum('amount_diamond', {
          where: { ad_campaign_id: campaignId, billing_type: 'deduct' },
          transaction: options.transaction
        })) || 0

      const refundSum =
        (await AdBillingRecord.sum('amount_diamond', {
          where: { ad_campaign_id: campaignId, billing_type: 'refund' },
          transaction: options.transaction
        })) || 0

      // 可退款金额 = 总冻结 - 已结算扣款 - 已退款
      const amount = freezeSum - deductSum - refundSum

      if (amount <= 0) {
        logger.warn('无可退款金额', {
          campaign_id: campaignId,
          freeze_sum: freezeSum,
          deduct_sum: deductSum,
          refund_sum: refundSum
        })
        return null
      }

      // 生成business_id
      const business_id = `refund_${campaignId}_${Date.now()}_${uuidv4().substring(0, 8)}`

      // 获取今天的日期（YYYY-MM-DD格式）
      const today = BeijingTimeHelper.createBeijingTime()
      const billingDate = today.toISOString().split('T')[0]

      // 创建退款记录
      const billingRecord = await AdBillingRecord.create(
        {
          business_id,
          ad_campaign_id: campaignId,
          advertiser_user_id: campaign.advertiser_user_id,
          billing_date: billingDate,
          amount_diamond: amount,
          billing_type: 'refund',
          remark: `广告计划退款: ${amount}钻石（审核拒绝或取消）`
        },
        { transaction: options.transaction }
      )

      // 调用 BalanceService 解冻（frozen → available）
      await BalanceService.unfreeze(
        {
          user_id: campaign.advertiser_user_id,
          asset_code: 'DIAMOND',
          amount,
          business_type: 'ad_campaign_refund',
          idempotency_key: `ad_refund_${business_id}`,
          meta: {
            ad_campaign_id: campaignId,
            billing_record_id: billingRecord.ad_billing_record_id
          }
        },
        { transaction: options.transaction }
      )

      logger.info('退款成功', {
        campaign_id: campaignId,
        amount,
        billing_record_id: billingRecord.ad_billing_record_id
      })

      return billingRecord
    } catch (error) {
      logger.error('退款失败', { campaignId, error: error.message })
      throw error
    }
  }

  /**
   * 处理每日竞价扣款（定时任务）
   *
   * @param {Object} _options - 预留选项（每个计划使用独立事务）
   * @returns {Promise<Object>} 处理结果统计
   */
  static async processDailyBidding(_options = {}) {
    const { sequelize } = require('../models')

    try {
      const todayDate = BeijingTimeHelper.createBeijingTime()
      const today = todayDate.toISOString().split('T')[0]

      // 查询不需要事务，只读操作
      const activeBiddingCampaigns = await AdCampaign.findAll({
        where: {
          status: 'active',
          billing_mode: 'bidding',
          daily_bid_diamond: { [Op.gt]: 0 }
        }
      })

      const results = {
        processed: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        total_deducted: 0
      }

      // 每个计划使用独立事务，一个失败不影响其他计划
      for (const campaign of activeBiddingCampaigns) {
        const campaignTransaction = await sequelize.transaction()

        try {
          // 检查今日是否已扣款（幂等性保护）
          const existingDeduct = await AdBillingRecord.findOne({
            where: {
              ad_campaign_id: campaign.ad_campaign_id,
              billing_date: today,
              billing_type: 'daily_deduct'
            },
            transaction: campaignTransaction
          })

          if (existingDeduct) {
            await campaignTransaction.commit()
            results.skipped++
            continue
          }

          // 重新读取最新状态（悲观锁，防止并发）
          const freshCampaign = await AdCampaign.findByPk(campaign.ad_campaign_id, {
            lock: campaignTransaction.LOCK.UPDATE,
            transaction: campaignTransaction
          })

          if (!freshCampaign || freshCampaign.status !== 'active') {
            await campaignTransaction.commit()
            results.skipped++
            continue
          }

          const newSpent = freshCampaign.budget_spent_diamond + freshCampaign.daily_bid_diamond

          if (newSpent > freshCampaign.budget_total_diamond) {
            await freshCampaign.update(
              { status: 'completed' },
              { transaction: campaignTransaction }
            )
            await campaignTransaction.commit()
            results.completed++
            logger.info('竞价计划预算耗尽，标记为已完成', {
              campaign_id: freshCampaign.ad_campaign_id,
              budget_spent: freshCampaign.budget_spent_diamond,
              budget_total: freshCampaign.budget_total_diamond
            })
            continue
          }

          const business_id = `daily_deduct_${freshCampaign.ad_campaign_id}_${today}_${uuidv4().substring(0, 8)}`

          await AdBillingRecord.create(
            {
              business_id,
              ad_campaign_id: freshCampaign.ad_campaign_id,
              advertiser_user_id: freshCampaign.advertiser_user_id,
              billing_date: today,
              amount_diamond: freshCampaign.daily_bid_diamond,
              billing_type: 'daily_deduct',
              remark: `竞价计划每日扣款: ${freshCampaign.daily_bid_diamond}钻石`
            },
            { transaction: campaignTransaction }
          )

          await freshCampaign.update(
            { budget_spent_diamond: newSpent },
            { transaction: campaignTransaction }
          )

          if (newSpent >= freshCampaign.budget_total_diamond) {
            await freshCampaign.update(
              { status: 'completed' },
              { transaction: campaignTransaction }
            )
            results.completed++
          }

          const platformFeeAccount = await BalanceService.getOrCreateAccount(
            { system_code: 'SYSTEM_PLATFORM_FEE' },
            { transaction: campaignTransaction }
          )
          await BalanceService.changeBalance(
            {
              user_id: freshCampaign.advertiser_user_id,
              asset_code: 'DIAMOND',
              delta_amount: -freshCampaign.daily_bid_diamond,
              business_type: 'ad_campaign_daily_deduct',
              idempotency_key: `ad_daily_${business_id}`,
              counterpart_account_id: platformFeeAccount.account_id,
              meta: { ad_campaign_id: freshCampaign.ad_campaign_id, billing_date: today }
            },
            { transaction: campaignTransaction }
          )

          await campaignTransaction.commit()
          results.processed++
          results.total_deducted += freshCampaign.daily_bid_diamond

          logger.info('竞价计划每日扣款成功', {
            campaign_id: freshCampaign.ad_campaign_id,
            amount: freshCampaign.daily_bid_diamond,
            new_spent: newSpent
          })
        } catch (error) {
          if (!campaignTransaction.finished) {
            await campaignTransaction.rollback()
          }
          results.failed++
          logger.error('处理竞价计划扣款失败（独立事务已回滚）', {
            campaign_id: campaign.ad_campaign_id,
            error: error.message
          })
        }
      }

      logger.info('每日竞价扣款处理完成', results)
      return results
    } catch (error) {
      logger.error('处理每日竞价扣款失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取计划的计费记录列表
   *
   * @param {number} campaignId - 广告计划ID
   * @param {Object} options - 查询选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Array>} 计费记录列表
   */
  static async getCampaignBillingRecords(campaignId, options = {}) {
    try {
      const records = await AdBillingRecord.findAll({
        where: { ad_campaign_id: campaignId },
        order: [['created_at', 'DESC']],
        transaction: options.transaction
      })

      logger.info('获取计划计费记录列表', { campaignId, count: records.length })

      return records
    } catch (error) {
      logger.error('获取计划计费记录列表失败', { campaignId, error: error.message })
      throw error
    }
  }

  /**
   * 获取计费统计信息
   *
   * @param {Object} options - 查询选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 统计信息
   */
  static async getStatistics(options = {}) {
    try {
      // 统计各类型的总金额
      const freezeTotal =
        (await AdBillingRecord.sum('amount_diamond', {
          where: { billing_type: 'freeze' },
          transaction: options.transaction
        })) || 0

      const deductTotal =
        (await AdBillingRecord.sum('amount_diamond', {
          where: { billing_type: 'deduct' },
          transaction: options.transaction
        })) || 0

      const refundTotal =
        (await AdBillingRecord.sum('amount_diamond', {
          where: { billing_type: 'refund' },
          transaction: options.transaction
        })) || 0

      const dailyDeductTotal =
        (await AdBillingRecord.sum('amount_diamond', {
          where: { billing_type: 'daily_deduct' },
          transaction: options.transaction
        })) || 0

      // 统计记录数量
      const freezeCount = await AdBillingRecord.count({
        where: { billing_type: 'freeze' },
        transaction: options.transaction
      })

      const deductCount = await AdBillingRecord.count({
        where: { billing_type: 'deduct' },
        transaction: options.transaction
      })

      const refundCount = await AdBillingRecord.count({
        where: { billing_type: 'refund' },
        transaction: options.transaction
      })

      const dailyDeductCount = await AdBillingRecord.count({
        where: { billing_type: 'daily_deduct' },
        transaction: options.transaction
      })

      return {
        total_frozen: freezeTotal,
        total_deducted: deductTotal + dailyDeductTotal,
        total_refunded: refundTotal,
        total_daily_deducted: dailyDeductTotal,
        record_counts: {
          freeze: freezeCount,
          deduct: deductCount,
          refund: refundCount,
          daily_deduct: dailyDeductCount
        }
      }
    } catch (error) {
      logger.error('获取计费统计信息失败', { error: error.message })
      throw error
    }
  }
}

module.exports = AdBillingService
