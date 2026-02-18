/**
 * 广告标签聚合服务层（AdTagAggregationService）
 *
 * 业务场景：
 * - DMP用户标签聚合：从业务表计算用户行为标签
 * - 定时任务：每日凌晨3点执行，更新所有活跃用户的标签
 * - 支持10个标签维度：抽奖活跃度、钻石余额、交易行为等
 *
 * 服务对象：
 * - 定时任务：jobs/ad-cron-jobs.js（03:00执行）
 *
 * 创建时间：2026-02-18
 */

const logger = require('../utils/logger').logger
const {
  UserAdTag,
  User,
  LotteryDraw,
  AccountAssetBalance,
  MarketListing,
  TradeOrder
} = require('../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 广告标签聚合服务类
 */
class AdTagAggregationService {
  /**
   * 聚合所有用户标签（主定时任务）
   *
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 聚合结果统计
   */
  static async aggregateAllUserTags(options = {}) {
    const startTime = Date.now()
    const { transaction } = options

    try {
      logger.info('[AdTagAggregationService] 开始聚合所有用户标签')

      // 1. 获取所有活跃用户（最近30天有活动）
      const thirtyDaysAgo = BeijingTimeHelper.createDatabaseTime()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const activeUsers = await User.findAll({
        where: {
          status: 'active',
          [Op.or]: [
            { last_login: { [Op.gte]: thirtyDaysAgo } },
            { created_at: { [Op.gte]: thirtyDaysAgo } }
          ]
        },
        attributes: ['user_id'],
        transaction
      })

      logger.info('[AdTagAggregationService] 找到活跃用户', {
        count: activeUsers.length
      })

      // 2. 逐个用户计算标签
      let successCount = 0
      let errorCount = 0

      for (const user of activeUsers) {
        try {
          await AdTagAggregationService._calculateAndUpsertUserTags(user.user_id, { transaction })
          successCount++
        } catch (error) {
          errorCount++
          logger.error('[AdTagAggregationService] 用户标签计算失败', {
            user_id: user.user_id,
            error: error.message
          })
        }
      }

      const duration = Date.now() - startTime
      logger.info('[AdTagAggregationService] 标签聚合完成', {
        totalUsers: activeUsers.length,
        successCount,
        errorCount,
        duration_ms: duration
      })

      return {
        success: true,
        totalUsers: activeUsers.length,
        successCount,
        errorCount,
        duration_ms: duration
      }
    } catch (error) {
      logger.error('[AdTagAggregationService] 标签聚合失败', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取用户的所有标签
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Map<string, string>>} 标签Map
   */
  static async getUserTags(userId, options = {}) {
    const { transaction } = options

    try {
      const tags = await UserAdTag.findAll({
        where: { user_id: userId },
        attributes: ['tag_key', 'tag_value'],
        transaction
      })

      const tagMap = new Map()
      tags.forEach(tag => {
        tagMap.set(tag.tag_key, tag.tag_value)
      })

      return tagMap
    } catch (error) {
      logger.error('[AdTagAggregationService] 获取用户标签失败', {
        userId,
        error: error.message
      })
      return new Map()
    }
  }

  /**
   * 计算并更新用户标签（内部方法）
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<void>} UPSERT 用户标签到 user_ad_tags 表
   */
  static async _calculateAndUpsertUserTags(userId, options = {}) {
    const { transaction } = options
    const tags = await AdTagAggregationService._calculateUserTags(userId, options)

    // UPSERT所有标签
    for (const [tagKey, tagValue] of tags.entries()) {
      await UserAdTag.upsert(
        {
          user_id: userId,
          tag_key: tagKey,
          tag_value: tagValue,
          calculated_at: BeijingTimeHelper.createDatabaseTime()
        },
        {
          fields: ['tag_value', 'calculated_at'],
          transaction
        }
      )
    }
  }

  /**
   * 计算用户的所有标签（内部方法）
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Map<string, string>>} 标签Map
   */
  static async _calculateUserTags(userId, options = {}) {
    const { transaction } = options
    const tags = new Map()
    const now = BeijingTimeHelper.createDatabaseTime()

    try {
      // 1. lottery_active_7d: 最近7天抽奖次数 > 10
      const sevenDaysAgo = new Date(now)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const lotteryCount7d = await LotteryDraw.count({
        where: {
          user_id: userId,
          draw_time: { [Op.gte]: sevenDaysAgo }
        },
        transaction
      })
      tags.set('lottery_active_7d', lotteryCount7d > 10 ? 'true' : 'false')

      // 2. lottery_active_30d: 最近30天抽奖次数 > 50
      const thirtyDaysAgo = new Date(now)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const lotteryCount30d = await LotteryDraw.count({
        where: {
          user_id: userId,
          draw_time: { [Op.gte]: thirtyDaysAgo }
        },
        transaction
      })
      tags.set('lottery_active_30d', lotteryCount30d > 50 ? 'true' : 'false')

      // 3. lottery_total_count: 总抽奖次数
      const totalLotteryCount = await LotteryDraw.count({
        where: { user_id: userId },
        transaction
      })
      tags.set('lottery_total_count', String(totalLotteryCount))

      // 4. diamond_balance: 当前钻石余额
      const diamondBalance = await AccountAssetBalance.findOne({
        where: {
          user_id: userId,
          asset_code: 'DIAMOND'
        },
        attributes: ['balance'],
        transaction
      })
      const diamondBalanceValue = diamondBalance ? parseFloat(diamondBalance.balance) : 0
      tags.set('diamond_balance', String(diamondBalanceValue))

      // 5. diamond_rich: 钻石余额 > 1000
      tags.set('diamond_rich', diamondBalanceValue > 1000 ? 'true' : 'false')

      // 6. has_red_shard: 红色碎片余额 > 0
      const redShardBalance = await AccountAssetBalance.findOne({
        where: {
          user_id: userId,
          asset_code: 'RED_SHARD'
        },
        attributes: ['balance'],
        transaction
      })
      const redShardValue = redShardBalance ? parseFloat(redShardBalance.balance) : 0
      tags.set('has_red_shard', redShardValue > 0 ? 'true' : 'false')

      // 7. market_trader: 有交易市场记录
      const marketListingCount = await MarketListing.count({
        where: { seller_user_id: userId },
        transaction
      })
      const tradeOrderCount = await TradeOrder.count({
        where: {
          [Op.or]: [{ buyer_user_id: userId }, { seller_user_id: userId }]
        },
        transaction
      })
      tags.set('market_trader', marketListingCount > 0 || tradeOrderCount > 0 ? 'true' : 'false')

      // 8. new_user: 注册时间 < 7天
      const user = await User.findByPk(userId, {
        attributes: ['created_at'],
        transaction
      })
      if (user) {
        const registerDays = Math.floor((now - new Date(user.created_at)) / (1000 * 60 * 60 * 24))
        tags.set('new_user', registerDays < 7 ? 'true' : 'false')
        tags.set('register_days', String(registerDays))
      } else {
        tags.set('new_user', 'false')
        tags.set('register_days', '0')
      }

      // 9. active_7d: 最近7天有任何活动
      const hasActivity7d =
        lotteryCount7d > 0 ||
        (await MarketListing.count({
          where: {
            seller_user_id: userId,
            created_at: { [Op.gte]: sevenDaysAgo }
          },
          transaction
        })) > 0 ||
        (await TradeOrder.count({
          where: {
            [Op.or]: [{ buyer_user_id: userId }, { seller_user_id: userId }],
            created_at: { [Op.gte]: sevenDaysAgo }
          },
          transaction
        })) > 0
      tags.set('active_7d', hasActivity7d ? 'true' : 'false')

      return tags
    } catch (error) {
      logger.error('[AdTagAggregationService] 计算用户标签失败', {
        userId,
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }
}

module.exports = AdTagAggregationService
