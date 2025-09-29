/**
 * 基础抽奖保底策略
 * 整合基础抽奖功能和保底机制的统一策略
 *
 * @description 提供标准概率抽奖 + 保底机制（每累计10次抽奖，第10次必中九八折券）
 * @version 4.0.0
 * @date 2025-01-21
 */

const LotteryStrategy = require('../core/LotteryStrategy')
const { LotteryDraw, UserPointsAccount } = require('../../../models')
const moment = require('moment-timezone')
// 🎯 V4新增：集成测试账号权限管理
const { hasTestPrivilege } = require('../../../utils/TestAccountManager')

class BasicGuaranteeStrategy extends LotteryStrategy {
  constructor (config = {}) {
    super('basic_guarantee', {
      enabled: true,
      defaultProbability: 0.1, // 默认中奖概率10%
      maxDrawsPerDay: 10, // 每日最大抽奖次数
      pointsCostPerDraw: 100, // 每次抽奖消耗积分

      // 保底策略配置
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
      },

      ...config
    })

    this.logInfo('基础抽奖保底策略初始化完成', {
      config: this.config,
      guaranteeRule: this.config.guaranteeRule
    })
  }

  /**
   * 验证是否可以执行抽奖
   *
   * @param {Object} context - 执行上下文
   * @returns {Promise<boolean>} 验证结果
   */
  async validateStrategy (context) {
    // ✅ 统一业务标准：使用snake_case参数解构
    const { user_id, campaign_id } = context

    try {
      // 验证用户积分是否足够
      const userAccount = await UserPointsAccount.findOne({ where: { user_id } })
      if (!userAccount || userAccount.available_points < this.config.pointsCostPerDraw) {
        this.logError('用户积分不足', {
          user_id,
          currentPoints: userAccount?.available_points || 0,
          requiredPoints: this.config.pointsCostPerDraw
        })
        return false
      }

      // 验证今日抽奖次数是否超限
      const today = moment().tz('Asia/Shanghai').startOf('day').toDate()
      const todayDrawCount = await LotteryDraw.count({
        where: {
          user_id,
          campaign_id,
          draw_type: 'single',
          created_at: {
            [require('sequelize').Op.gte]: today
          }
        }
      })

      // 🎯 V4新增：测试账号无限次抽奖权限检查
      if (todayDrawCount >= this.config.maxDrawsPerDay) {
        // 检查是否为测试账号且有绕过每日限制的权限
        if (hasTestPrivilege(user_id, 'bypass_daily_limit')) {
          this.logInfo('测试账号绕过每日抽奖次数限制', {
            user_id,
            campaign_id,
            todayDrawCount,
            maxDrawsPerDay: this.config.maxDrawsPerDay,
            privilege: 'bypass_daily_limit'
          })
          return true // 允许继续抽奖
        }

        this.logError('今日抽奖次数已达上限', {
          user_id,
          campaign_id,
          todayDrawCount,
          maxDrawsPerDay: this.config.maxDrawsPerDay
        })
        return false
      }

      return true
    } catch (error) {
      this.logError('基础抽奖保底策略验证失败', { error: error.message, user_id, campaign_id })
      return false
    }
  }

  /**
   * 执行基础抽奖保底策略
   *
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 抽奖结果
   */
  async execute (context) {
    const startTime = Date.now()

    try {
      // 🔴 严格参数验证防止undefined错误
      if (!context || typeof context !== 'object') {
        const executionTime = Date.now() - startTime
        this.logError('基础抽奖保底策略参数验证失败', {
          error: 'context参数缺失或无效',
          contextKeys: Object.keys(context || {}),
          executionTime
        })
        return {
          success: false,
          result: 'invalid',
          error: 'context参数缺失或无效',
          executionTime
        }
      }

      // ✅ 统一业务标准：使用snake_case参数解构
      const { user_id, campaign_id } = context

      // ✅ 必需参数验证
      if (!user_id || user_id === undefined || user_id === null) {
        const executionTime = Date.now() - startTime
        this.logError('基础抽奖保底策略参数验证失败', {
          error: 'user_id参数缺失或无效',
          providedUserId: user_id,
          contextKeys: Object.keys(context),
          executionTime
        })
        return {
          success: false,
          result: 'error',
          message: 'user_id参数缺失或无效',
          executionTime,
          executedStrategy: this.strategyName,
          timestamp: new Date().toISOString()
        }
      }

      if (!campaign_id || campaign_id === undefined || campaign_id === null) {
        const executionTime = Date.now() - startTime
        this.logError('基础抽奖保底策略参数验证失败', {
          error: 'campaign_id参数缺失或无效',
          providedCampaignId: campaign_id,
          user_id,
          executionTime
        })
        return {
          success: false,
          result: 'error',
          message: 'campaign_id参数缺失或无效',
          executionTime,
          executedStrategy: this.strategyName,
          timestamp: new Date().toISOString()
        }
      }

      const userId = user_id
      const campaignId = campaign_id

      this.logInfo('开始执行基础抽奖保底策略', {
        userId,
        campaignId,
        strategy: this.strategyName,
        config: this.config
      })

      // 🎯 Step 1: 检查保底机制（优先级最高）
      const guaranteeCheck = await this.checkGuaranteeRule(userId, campaignId)
      if (guaranteeCheck.shouldTriggerGuarantee) {
        this.logInfo('🎯 触发保底机制', {
          userId,
          campaignId,
          drawNumber: guaranteeCheck.nextDrawNumber,
          guaranteePrize: this.config.guaranteePrize.prizeName
        })

        const guaranteeResult = await this.executeGuaranteeAward(userId, campaignId, guaranteeCheck.nextDrawNumber)

        const executionTime = Date.now() - startTime
        return {
          success: true,
          is_winner: true, // ✅ 业务字段：保底必中
          prize: guaranteeResult.prize,
          probability: 1.0, // 保底概率100%
          pointsCost: this.config.pointsCostPerDraw,
          remainingPoints: guaranteeResult.remainingPoints,
          executionTime,
          executedStrategy: this.strategyName,
          guaranteeTriggered: true, // 标记为保底触发
          drawNumber: guaranteeCheck.nextDrawNumber,
          guaranteeReason: `累计抽奖${guaranteeCheck.nextDrawNumber}次，触发保底机制`,
          timestamp: new Date().toISOString()
        }
      }

      // 🎯 Step 2: 检查用户是否有自动化预设奖品队列（改造版）
      const presetPrize = await this.checkUserPresetQueue(userId, campaignId)
      if (presetPrize) {
        this.logInfo('用户有自动化预设奖品队列，优先发放预设奖品', {
          userId,
          campaignId,
          presetPrizeNumber: presetPrize.prize_number,
          queueOrder: presetPrize.queue_order,
          presetType: presetPrize.preset_type
        })

        // 发放预设奖品并标记为已完成
        const result = await this.executePresetPrizeAward(context, presetPrize)

        const executionTime = Date.now() - startTime
        this.logInfo('基础抽奖保底策略（自动化预设奖品）执行完成', {
          userId,
          campaignId,
          result: result.is_winner,
          prize: result.prize,
          executionTime
        })

        return result
      }

      // 🎯 Step 3: 验证是否可以执行抽奖
      const canExecute = await this.canExecute(context)
      if (!canExecute.valid) {
        const executionTime = Date.now() - startTime
        this.logError('基础抽奖保底策略验证失败', {
          userId,
          campaignId,
          reason: canExecute.reason,
          executionTime
        })

        return {
          success: false,
          result: 'invalid',
          message: canExecute.reason || '不满足抽奖条件',
          details: canExecute.details,
          executionTime,
          strategy: this.strategyName,
          timestamp: new Date().toISOString()
        }
      }

      // 获取用户信息（包括积分余额）
      const userAccount = await UserPointsAccount.findOne({ where: { user_id: userId } })

      // 确定中奖概率
      const probability = this.calculateProbability(context)
      this.logInfo('计算抽奖概率', { userId, campaignId, probability })

      // ✅ 业务标准：执行抽奖判断
      const is_winner_result = Math.random() < probability

      if (is_winner_result) {
        // 中奖逻辑
        const prize = await this.selectPrize(await this.getAvailablePrizes(campaignId))
        if (prize) {
          // 扣减积分
          await this.deductPoints(userId, this.config.pointsCostPerDraw)

          // 发放奖品
          await this.distributePrize(userId, prize)

          // ✅ 修复：记录抽奖历史使用业务标准字段
          await this.recordLotteryHistory(context, { is_winner: true, prize }, probability)

          const executionTime = Date.now() - startTime
          this.logInfo('基础抽奖保底策略执行完成 - 中奖', {
            userId,
            campaignId,
            prize: prize.prize_name,
            executionTime
          })

          return {
            success: true, // ✅ 技术字段：操作是否成功
            is_winner: true, // ✅ 业务字段：是否中奖（符合接口规范）
            prize: {
              id: prize.prize_id,
              name: prize.prize_name,
              type: prize.prize_type,
              value: prize.prize_value
            },
            probability,
            pointsCost: this.config.pointsCostPerDraw,
            remainingPoints: userAccount.available_points - this.config.pointsCostPerDraw,
            executionTime,
            executedStrategy: this.strategyName, // ✅ 统一字段名
            guaranteeTriggered: false, // 标记为非保底中奖
            timestamp: new Date().toISOString()
          }
        }
      }

      // ✅ 修复：未中奖逻辑使用is_winner业务标准字段
      await this.deductPoints(userId, this.config.pointsCostPerDraw)
      await this.recordLotteryHistory(context, { is_winner: false }, probability)

      const executionTime = Date.now() - startTime
      this.logInfo('基础抽奖保底策略执行完成 - 未中奖', {
        userId,
        campaignId,
        probability,
        executionTime,
        remainingDrawsToGuarantee: this.config.guaranteeRule.triggerCount - ((guaranteeCheck.nextDrawNumber) % this.config.guaranteeRule.triggerCount)
      })

      return {
        success: true, // ✅ 技术字段：操作成功执行
        is_winner: false, // ✅ 业务字段：未中奖（符合接口规范）
        probability,
        pointsCost: this.config.pointsCostPerDraw,
        remainingPoints: userAccount.available_points - this.config.pointsCostPerDraw,
        executionTime,
        executedStrategy: this.strategyName,
        guaranteeTriggered: false,
        remainingDrawsToGuarantee: this.config.guaranteeRule.triggerCount - ((guaranteeCheck.nextDrawNumber) % this.config.guaranteeRule.triggerCount),
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      const executionTime = Date.now() - startTime
      this.logError('基础抽奖保底策略执行失败', {
        userId: context.user_id,
        campaignId: context.campaign_id,
        error: error.message,
        executionTime
      })

      return {
        success: false,
        result: 'error',
        message: '抽奖执行失败',
        error: error.message,
        executionTime,
        executedStrategy: this.strategyName,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 检查保底规则
   *
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 保底检查结果
   */
  async checkGuaranteeRule (userId, campaignId) {
    try {
      // 获取用户累计抽奖次数
      const drawCount = await this.getUserDrawCount(userId, campaignId)
      const nextDrawNumber = drawCount + 1 // 即将进行的抽奖次数

      this.logInfo('用户抽奖次数统计', {
        userId,
        historicalDraws: drawCount,
        nextDrawNumber,
        isGuaranteeTrigger: nextDrawNumber % this.config.guaranteeRule.triggerCount === 0
      })

      // 检查是否触发保底（每10次抽奖）
      const shouldTriggerGuarantee = nextDrawNumber % this.config.guaranteeRule.triggerCount === 0

      return {
        drawCount,
        nextDrawNumber,
        shouldTriggerGuarantee,
        remainingDrawsToGuarantee: shouldTriggerGuarantee ? 0 : this.config.guaranteeRule.triggerCount - (nextDrawNumber % this.config.guaranteeRule.triggerCount)
      }
    } catch (error) {
      this.logError('检查保底规则失败', {
        userId,
        campaignId,
        error: error.message
      })
      return {
        drawCount: 0,
        nextDrawNumber: 1,
        shouldTriggerGuarantee: false,
        remainingDrawsToGuarantee: this.config.guaranteeRule.triggerCount - 1
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

      const totalDraws = await models.LotteryDraw.count({
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
  async executeGuaranteeAward (userId, campaignId, drawNumber) {
    const transaction = await require('../../../models').sequelize.transaction()

    try {
      const models = require('../../../models')

      // 1. 检查用户积分（保底抽奖也需要积分）
      const pointsCost = this.config.pointsCostPerDraw
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
      const lotteryRecord = await models.LotteryDraw.create(
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
            guaranteePrizeName: this.config.guaranteePrize.prizeName,
            drawNumber
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
        drawNumber,
        prizeName: guaranteePrize.prize_name,
        pointsCost,
        remainingPoints: userAccount.available_points - pointsCost,
        lotteryRecordId: lotteryRecord.id
      })

      return {
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
   * 检查是否可以执行抽奖 - 添加缺失的方法
   *
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} {valid: boolean, reason: string}
   */
  async canExecute (context) {
    try {
      // ✅ 统一业务标准：使用snake_case参数解构
      const { user_id, campaign_id, user_status } = context

      // 基础参数验证
      if (!user_id || !campaign_id) {
        return {
          valid: false,
          reason: '缺少必需参数user_id或campaign_id'
        }
      }

      // 🔴 修复：详细的积分检查，优先使用context中的user_status
      let available_points = user_status?.available_points
      if (available_points === undefined) {
        // 回退到数据库查询
        const userAccount = await UserPointsAccount.findOne({ where: { user_id } })
        available_points = userAccount?.available_points || 0
      }

      if (available_points < this.config.pointsCostPerDraw) {
        return {
          valid: false,
          reason: '积分不足',
          details: {
            available_points,
            required_points: this.config.pointsCostPerDraw,
            deficit: this.config.pointsCostPerDraw - available_points
          }
        }
      }

      // 调用其他验证逻辑（排除积分检查，避免重复）
      const today = moment().tz('Asia/Shanghai').startOf('day').toDate()
      const todayDrawCount = await LotteryDraw.count({
        where: {
          user_id,
          campaign_id,
          draw_type: 'single',
          created_at: {
            [require('sequelize').Op.gte]: today
          }
        }
      })

      // 🔧 测试账号绕过抽奖次数限制
      const { hasTestPrivilege } = require('../../../utils/TestAccountManager')
      const canBypassLimit = await hasTestPrivilege(user_id, 'bypass_daily_limit')

      if (!canBypassLimit && todayDrawCount >= this.config.maxDrawsPerDay) {
        return {
          valid: false,
          reason: '今日抽奖次数已达上限',
          details: {
            today_count: todayDrawCount,
            max_draws: this.config.maxDrawsPerDay
          }
        }
      }

      return {
        valid: true,
        reason: '验证通过'
      }
    } catch (error) {
      return {
        valid: false,
        reason: `验证过程出错: ${error.message}`
      }
    }
  }

  /**
   * 计算抽奖概率
   * 根据用户等级、活动配置等因素计算最终中奖概率
   *
   * @param {Object} context - 执行上下文
   * @returns {number} 计算后的中奖概率
   */
  calculateProbability (context) {
    try {
      // ✅ 统一业务标准：使用snake_case参数解构
      const { user_id, campaign_id } = context
      const baseProbability = this.config.defaultProbability || 0.1

      this.logInfo('开始计算基础抽奖概率', {
        user_id,
        campaign_id,
        baseProbability,
        strategy: this.strategyName
      })

      // 🎯 基础概率（纯基础策略，无VIP加成）
      let finalProbability = baseProbability

      // 活动特殊概率配置
      if (context.campaignConfig && context.campaignConfig.special_probability) {
        finalProbability = context.campaignConfig.special_probability

        this.logInfo('应用活动特殊概率', {
          user_id,
          campaign_id,
          specialProbability: context.campaignConfig.special_probability,
          finalProbability
        })
      }

      // 🔴 概率边界控制
      finalProbability = Math.max(0.001, Math.min(1.0, finalProbability)) // 限制在0.1%-100%之间

      this.logInfo('基础抽奖概率计算完成', {
        user_id,
        campaign_id,
        baseProbability,
        finalProbability,
        adjustmentFactor: finalProbability / baseProbability
      })

      return finalProbability
    } catch (error) {
      this.logError('概率计算失败，使用默认概率', {
        user_id: context?.user_id,
        campaign_id: context?.campaign_id,
        error: error.message,
        defaultProbability: this.config.defaultProbability
      })

      // 出错时返回默认概率
      return this.config.defaultProbability || 0.1
    }
  }

  /**
   * 从奖品池中选择奖品（优化版）
   * 支持50个奖品的加权随机选择算法
   *
   * @param {Array} prizes - 可用奖品列表
   * @returns {Object} 选中的奖品
   */
  selectPrize (prizes) {
    if (!prizes || prizes.length === 0) {
      this.logError('奖品列表为空，无法选择奖品')
      return null
    }

    // 🎯 固定概率抽奖算法 - 严格按照业务设定的中奖概率执行
    try {
      // 过滤可用奖品（有库存且激活，且概率大于0）
      const availablePrizes = prizes.filter(prize => {
        return (
          prize.status === 'active' &&
          (prize.stock_quantity === null || prize.stock_quantity > 0) &&
          (!prize.max_daily_wins || prize.daily_win_count < prize.max_daily_wins) &&
          prize.win_probability > 0 // 只有设置了中奖概率的奖品才参与抽奖
        )
      })

      if (availablePrizes.length === 0) {
        this.logWarn('所有奖品都不可用（缺货、达到限制或概率为0）')
        return null
      }

      // 计算总概率（理论上应该等于1.0，即100%）
      const totalProbability = availablePrizes.reduce((sum, prize) => {
        return sum + parseFloat(prize.win_probability)
      }, 0)

      this.logInfo('抽奖概率信息', {
        totalProbability,
        availablePrizes: availablePrizes.length
      })

      // 生成0-1之间的随机数
      const randomValue = Math.random()
      let currentProbability = 0

      // 根据固定概率选择奖品
      for (const prize of availablePrizes) {
        currentProbability += parseFloat(prize.win_probability)
        if (randomValue <= currentProbability) {
          this.logInfo('奖品选择成功', {
            prizeId: prize.prize_id,
            prizeName: prize.prize_name,
            setProbability: (prize.win_probability * 100).toFixed(2) + '%',
            randomValue: randomValue.toFixed(4),
            hitRange: `${((currentProbability - prize.win_probability) * 100).toFixed(2)}%-${(currentProbability * 100).toFixed(2)}%`
          })
          return prize
        }
      }

      // 备用选择（如果总概率不足1.0时可能到达这里）
      const fallbackPrize = availablePrizes[availablePrizes.length - 1]
      this.logWarn('使用备用奖品选择', {
        prizeId: fallbackPrize.prize_id,
        reason: '随机值超出总概率范围',
        totalProbability
      })
      return fallbackPrize
    } catch (error) {
      this.logError('奖品选择算法异常', { error: error.message })
      // 异常情况下随机选择
      return prizes[Math.floor(Math.random() * prizes.length)]
    }
  }

  /**
   * 获取活动的可用奖品池
   * 优化查询性能，支持大量奖品
   *
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Array>} 奖品列表
   */
  async getAvailablePrizes (campaignId) {
    const { LotteryPrize } = require('../../../models')

    try {
      // 🎯 优化查询 - 支持50+奖品的高效查询
      const prizes = await LotteryPrize.findAll({
        where: {
          campaign_id: campaignId,
          status: 'active'
        },
        attributes: [
          'prize_id',
          'prize_name', // ✅ 修复：使用正确的数据库字段名
          'prize_type',
          'prize_value',
          'win_probability',
          'stock_quantity',
          'max_daily_wins',
          'daily_win_count',
          'status'
        ],
        order: [
          ['win_probability', 'DESC'], // 按中奖概率排序，提高选择效率
          ['created_at', 'ASC'] // 相同概率按创建时间排序
        ]
      })

      if (prizes.length === 0) {
        this.logWarn('活动没有可用奖品', { campaignId })
        return []
      }

      // 记录奖品池统计
      const totalPrizes = prizes.length
      const activePrizes = prizes.filter(p => p.stock_quantity > 0).length
      const totalStock = prizes.reduce((sum, p) => sum + (p.stock_quantity || 0), 0)

      this.logInfo('奖品池查询完成', {
        campaignId,
        totalPrizes,
        activePrizes,
        totalStock,
        timestamp: new Date().toISOString()
      })

      return prizes
    } catch (error) {
      this.logError('获取奖品池失败', { campaignId, error: error.message })
      throw new Error(`获取奖品池失败: ${error.message}`)
    }
  }

  /**
   * 扣除用户积分
   *
   * @param {number} userId - 用户ID
   * @param {number} pointsCost - 扣除积分数
   */
  async deductPoints (userId, pointsCost) {
    await UserPointsAccount.decrement('available_points', {
      by: pointsCost,
      where: { user_id: userId }
    })

    this.logDebug('扣除用户积分', { userId, pointsCost })
  }

  /**
   * 发放奖品
   *
   * @param {number} userId - 用户ID
   * @param {Object} prize - 奖品信息
   */
  async distributePrize (userId, prize) {
    // 根据奖品类型进行不同的发放逻辑
    switch (prize.prize_type) {
    case 'points':
      // 积分奖励：直接增加用户积分
      await UserPointsAccount.increment('available_points', {
        by: parseInt(prize.prize_value),
        where: { user_id: userId }
      })
      break

    case 'coupon':
      // 优惠券：记录到用户库存（这里简化处理）
      this.logInfo('发放优惠券奖品', {
        userId,
        prizeId: prize.id,
        couponValue: prize.prize_value
      })
      break

    case 'physical':
      // 实物奖品：记录待发货状态（这里简化处理）
      this.logInfo('发放实物奖品', { userId, prizeId: prize.id, prizeName: prize.prize_name })
      break

    default:
      this.logError('未知奖品类型', { prizeType: prize.prize_type })
    }
  }

  /**
   * 记录抽奖历史
   *
   * @param {Object} context - 执行上下文
   * @param {Object} result - 抽奖结果
   * @param {number} probability - 中奖概率
   */
  async recordLotteryHistory (context, result, probability) {
    // ✅ 统一业务标准：使用snake_case参数解构
    const { user_id, campaign_id } = context

    await LotteryDraw.create({
      draw_id: `draw_${Date.now()}_${user_id}_${Math.random().toString(36).substr(2, 6)}`,
      user_id,
      lottery_id: campaign_id,
      campaign_id,
      draw_type: 'single',
      prize_id: result.prize?.id || null,
      points_cost: this.config.pointsCostPerDraw,
      is_winner: result.is_winner,
      win_probability: probability,
      created_at: new Date(),
      result_details: JSON.stringify(result)
    })
  }

  /**
   * 检查用户是否有预设的抽奖结果队列
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID（暂不使用，保留接口兼容性）
   * @returns {Object|null} 下一个预设结果或null
   */
  async checkUserPresetQueue (userId, _campaignId) {
    try {
      const models = require('../../../models')

      // 🎯 检查LotteryPreset模型（简化版抽奖预设功能）
      if (!models.LotteryPreset) {
        this.logDebug('LotteryPreset模型未找到，跳过预设队列检查')
        return null
      }

      const nextPreset = await models.LotteryPreset.getNextPreset(userId)

      if (nextPreset) {
        this.logInfo('发现用户预设抽奖结果', {
          userId,
          presetId: nextPreset.preset_id,
          prizeId: nextPreset.prize_id,
          queueOrder: nextPreset.queue_order,
          prizeName: nextPreset.prize?.name
        })
      }

      return nextPreset
    } catch (error) {
      this.logError('检查用户预设队列失败', {
        userId,
        error: error.message
      })
      return null
    }
  }

  /**
   * 执行预设抽奖结果发放
   * @param {Object} context - 抽奖上下文
   * @param {Object} preset - 预设抽奖结果记录
   * @returns {Object} 抽奖结果
   */
  async executePresetPrizeAward (context, preset) {
    try {
      // ✅ 统一业务标准：使用snake_case参数解构
      const { user_id, campaign_id } = context

      // 获取用户积分信息
      const userAccount = await UserPointsAccount.findOne({ where: { user_id } })

      // 扣减积分（预设结果也需要消耗积分，保持抽奖流程一致性）
      await this.deductPoints(user_id, this.config.pointsCostPerDraw)

      // 🎯 发放预设奖品
      await this.distributePrize(user_id, preset.prize)

      // 🎯 标记预设为已使用
      await preset.markAsUsed()

      // ✅ 记录抽奖历史使用业务标准字段
      await this.recordLotteryHistory(
        context,
        {
          is_winner: true, // ✅ 预设结果必中
          prize: preset.prize,
          isPresetPrize: true, // 🎯 标记为预设结果
          presetId: preset.preset_id,
          queueOrder: preset.queue_order
        },
        1.0
      ) // 🎯 预设结果中奖概率为100%

      this.logInfo('预设抽奖结果发放成功', {
        userId: user_id,
        campaignId: campaign_id,
        presetId: preset.preset_id,
        prizeId: preset.prize_id,
        queueOrder: preset.queue_order,
        prizeName: preset.prize.name
      })

      // ✅ 修复：返回业务标准数据，确保前端使用统一标准
      return {
        success: true,
        is_winner: true, // ✅ 修复：使用业务标准字段
        prize: {
          id: preset.prize.prize_id,
          name: preset.prize.name,
          type: preset.prize.prize_type,
          value: preset.prize.prize_value
        },
        // 🎯 显示为正常的随机概率，而不是1.0（用户无感知预设机制）
        probability: preset.prize.win_probability || 0.1,
        pointsCost: this.config.pointsCostPerDraw,
        remainingPoints: userAccount.available_points - this.config.pointsCostPerDraw,
        executedStrategy: this.strategyName,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      this.logError('预设抽奖结果发放失败', {
        userId: context.user_id,
        campaignId: context.campaign_id,
        presetId: preset.preset_id,
        error: error.message
      })

      throw error
    }
  }
}

module.exports = BasicGuaranteeStrategy
