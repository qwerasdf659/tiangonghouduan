/**
 * 保底机制策略
 * 实现保底中奖机制的完整策略
 *
 * @description 提供保底抽奖机制：每累计10次抽奖，第10次必中九八折券
 * @version 4.0.0
 * @date 2025-09-13 北京时间
 */

const moment = require('moment-timezone')

class GuaranteeStrategy {
  constructor () {
    this.strategyName = 'guarantee'
    this.version = '4.0.0'
    this.description = '保底机制策略 - 每累计10次抽奖，第10次必中九八折券'

    // 保底策略配置
    this.config = {
      // 主体功能需求：累计抽奖保底机制
      guaranteeRule: {
        triggerCount: 10, // 累计抽奖10次触发保底
        guaranteePrizeId: 9, // 九八折券（9号奖品）
        counterResetAfterTrigger: true // 触发保底后重置计数器
      },

      // 保底奖品信息
      guaranteePrize: {
        prizeId: 9,
        prizeName: '九八折券',
        prizeType: 'coupon',
        prizeValue: 98.0,
        description: '保底抽奖专用券'
      }
    }

    this.logInfo('保底机制策略初始化完成 - 累计10次抽奖保底')
  }

  /**
   * 验证保底策略执行条件
   */
  async validate (context) {
    try {
      // ✅ 统一业务标准：使用snake_case参数解构
      const { user_id, campaign_id } = context

      if (!user_id || !campaign_id) {
        this.logError('保底机制策略验证失败：缺少必要参数', { user_id, campaign_id })
        return false
      }

      // 获取用户信息
      const models = require('../../../models')
      const user = await models.User.findByPk(user_id)
      if (!user) {
        this.logError('用户不存在', { user_id })
        return false
      }

      // 获取抽奖活动信息
      const campaign = await models.LotteryCampaign.findByPk(campaign_id)
      if (!campaign || campaign.status !== 'active') {
        this.logError('抽奖活动不存在或已结束', { campaign_id })
        return false
      }

      // 将验证结果添加到上下文
      Object.assign(context, {
        userInfo: user,
        campaignInfo: campaign
      })

      return true
    } catch (error) {
      this.logError('保底机制策略验证异常', { error: error.message })
      return false
    }
  }

  /**
   * 执行保底抽奖 - 主体功能核心逻辑
   */
  async execute (context) {
    const startTime = Date.now()

    try {
      // 🔴 严格参数验证防止undefined错误
      if (!context || typeof context !== 'object') {
        const executionTime = Date.now() - startTime
        this.logError('保底策略参数验证失败', {
          error: 'context参数缺失或无效',
          executionTime
        })
        return {
          success: false, // ✅ 技术字段：操作失败
          is_winner: false, // ✅ 业务字段：未中奖（符合接口规范）
          executedStrategy: 'guarantee',
          error: 'context参数缺失或无效',
          executionTime,
          timestamp: moment().tz('Asia/Shanghai').format()
        }
      }

      // ✅ 统一业务标准：使用snake_case参数解构
      const { user_id, campaign_id, campaignInfo } = context

      // 验证必需参数
      if (!user_id || user_id === undefined) {
        const executionTime = Date.now() - startTime
        this.logError('保底策略参数验证失败', {
          error: 'user_id参数缺失或无效',
          contextKeys: Object.keys(context),
          executionTime
        })
        return {
          success: false,
          result: 'invalid',
          error: 'user_id参数缺失或无效',
          executedStrategy: 'guarantee',
          executionTime,
          timestamp: moment().tz('Asia/Shanghai').format()
        }
      }

      if (!campaign_id || campaign_id === undefined) {
        const executionTime = Date.now() - startTime
        this.logError('保底策略参数验证失败', {
          error: 'campaign_id参数缺失或无效',
          contextKeys: Object.keys(context),
          executionTime
        })
        return {
          success: false,
          result: 'invalid',
          error: 'campaign_id参数缺失或无效',
          executedStrategy: 'guarantee',
          executionTime,
          timestamp: moment().tz('Asia/Shanghai').format()
        }
      }

      this.logInfo('开始执行保底抽奖检查', {
        user_id,
        campaign_id,
        campaignName: campaignInfo?.name || '未知活动'
      })

      // 获取用户累计抽奖次数
      const drawCount = await this.getUserDrawCount(user_id, campaign_id)
      const nextDrawNumber = drawCount + 1 // 即将进行的抽奖次数

      this.logInfo('用户抽奖次数统计', {
        user_id,
        historicalDraws: drawCount,
        nextDrawNumber,
        isGuaranteeTrigger: nextDrawNumber % this.config.guaranteeRule.triggerCount === 0
      })

      // 检查是否触发保底（每10次抽奖）
      const shouldTriggerGuarantee = nextDrawNumber % this.config.guaranteeRule.triggerCount === 0

      if (shouldTriggerGuarantee) {
        // 触发保底：强制中九八折券
        this.logInfo('🎯 触发保底机制', {
          user_id,
          drawNumber: nextDrawNumber,
          guaranteePrize: this.config.guaranteePrize.prizeName
        })

        const guaranteeResult = await this.executeGuaranteeAward(user_id, campaign_id)

        return {
          success: true,
          executedStrategy: 'guarantee',
          executionTime: Date.now() - startTime,
          timestamp: moment().tz('Asia/Shanghai').format(),
          result: {
            ...guaranteeResult,
            guaranteeTriggered: true,
            drawNumber: nextDrawNumber,
            guaranteeReason: `累计抽奖${nextDrawNumber}次，触发保底机制`
          }
        }
      } else {
        // 不触发保底，返回继续其他策略的信息
        const remainingDraws =
          this.config.guaranteeRule.triggerCount -
          (nextDrawNumber % this.config.guaranteeRule.triggerCount)

        this.logInfo('未触发保底，继续正常抽奖', {
          user_id,
          drawNumber: nextDrawNumber,
          remainingDrawsToGuarantee: remainingDraws
        })

        return {
          success: true,
          executedStrategy: 'guarantee',
          executionTime: Date.now() - startTime,
          timestamp: moment().tz('Asia/Shanghai').format(),
          result: {
            guaranteeTriggered: false,
            shouldContinue: true, // 指示应该继续使用其他策略
            drawNumber: nextDrawNumber,
            remainingDrawsToGuarantee: remainingDraws,
            message: `还需${remainingDraws}次抽奖达到保底`
          }
        }
      }
    } catch (error) {
      const executionTime = Date.now() - startTime

      this.logError('保底抽奖执行失败', {
        error: error.message,
        stack: error.stack,
        executionTime
      })

      return {
        success: false,
        executedStrategy: 'guarantee',
        error: error.message,
        executionTime,
        timestamp: moment().tz('Asia/Shanghai').format(),
        shouldContinue: true // 出错时也继续使用其他策略
      }
    }
  }

  /**
   * 获取用户累计抽奖次数
   * 🔴 重要：统计所有抽奖记录，不论中奖与否
   */
  async getUserDrawCount (userId, campaignId) {
    try {
      const models = require('../../../models')

      const totalDraws = await models.LotteryRecord.count({
        where: {
          user_id: userId,
          campaign_id: campaignId
        }
      })

      this.logInfo('查询用户抽奖次数', {
        userId,
        campaignId,
        totalDraws
      })

      return totalDraws
    } catch (error) {
      this.logError('获取用户抽奖次数失败', {
        userId,
        campaignId,
        error: error.message
      })
      return 0
    }
  }

  /**
   * 执行保底奖品发放
   * 🔴 核心功能：发放九八折券并扣除积分
   */
  async executeGuaranteeAward (userId, campaignId) {
    const transaction = await require('../../../models').sequelize.transaction()

    try {
      const models = require('../../../models')

      // 1. 检查用户积分（保底抽奖也需要积分）
      const pointsCost = 100
      const userAccount = await models.UserPointsAccount.findOne({
        where: { user_id: userId },
        transaction
      })

      if (!userAccount || userAccount.available_points < pointsCost) {
        await transaction.rollback()
        throw new Error(
          `保底抽奖积分不足：需要${pointsCost}积分，当前${userAccount?.available_points || 0}积分`
        )
      }

      // 2. 获取九八折券奖品信息
      const guaranteePrize = await models.LotteryPrize.findOne({
        where: {
          prize_id: this.config.guaranteePrize.prizeId,
          campaign_id: campaignId
        },
        transaction
      })

      if (!guaranteePrize) {
        await transaction.rollback()
        throw new Error('保底奖品（九八折券）不存在')
      }

      // 3. 扣除用户积分
      await models.UserPointsAccount.decrement('available_points', {
        by: pointsCost,
        where: { user_id: userId },
        transaction
      })

      // 4. 创建抽奖记录
      const lotteryRecord = await models.LotteryRecord.create(
        {
          draw_id: `draw_${Date.now()}_${userId}_${Math.random().toString(36).substr(2, 6)}`,
          user_id: userId,
          lottery_id: campaignId,
          campaign_id: campaignId,
          prize_id: guaranteePrize.prize_id,
          prize_name: guaranteePrize.prize_name,
          prize_type: guaranteePrize.prize_type,
          prize_value: guaranteePrize.prize_value,
          cost_points: pointsCost,
          result_type: 'guarantee_award', // 标记为保底中奖
          is_winner: true, // ✅ 修复：统一使用业务标准字段
          probability_used: 1.0, // 保底中奖概率100%
          random_value: 0, // 保底不使用随机数
          guarantee_triggered: true,
          guarantee_info: JSON.stringify({
            guaranteeType: 'cumulative_draws',
            guaranteePrizeId: this.config.guaranteePrize.prizeId,
            guaranteePrizeName: this.config.guaranteePrize.prizeName
          }),
          created_at: new Date()
        },
        { transaction }
      )

      // 5. 扣减奖品库存
      if (guaranteePrize.stock_quantity > 0) {
        await guaranteePrize.decrement('stock_quantity', { by: 1, transaction })
      }

      await transaction.commit()

      this.logInfo('保底奖品发放成功', {
        userId,
        campaignId,
        prizeName: guaranteePrize.prize_name,
        pointsCost,
        remainingPoints: userAccount.available_points - pointsCost,
        lotteryRecordId: lotteryRecord.id
      })

      return {
        won: true,
        prize: {
          id: guaranteePrize.prize_id,
          name: guaranteePrize.prize_name,
          type: guaranteePrize.prize_type,
          value: guaranteePrize.prize_value
        },
        pointsCost,
        remainingPoints: userAccount.available_points - pointsCost,
        lotteryRecordId: lotteryRecord.id,
        message: `🎉 保底中奖！获得${guaranteePrize.prize_name}（消耗${pointsCost}积分）`
      }
    } catch (error) {
      // 只有事务未完成时才进行回滚
      if (transaction && !transaction.finished) {
        await transaction.rollback()
      }
      this.logError('保底奖品发放失败', {
        userId,
        campaignId,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 记录信息日志
   */
  logInfo (message, data = {}) {
    console.log(
      `[${moment().tz('Asia/Shanghai').format()}] [GuaranteeStrategy] [INFO] ${message}`,
      data
    )
  }

  /**
   * 记录错误日志
   */
  logError (message, data = {}) {
    console.error(
      `[${moment().tz('Asia/Shanghai').format()}] [GuaranteeStrategy] [ERROR] ${message}`,
      data
    )
  }
}

module.exports = GuaranteeStrategy
