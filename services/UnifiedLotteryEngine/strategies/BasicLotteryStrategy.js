/**
 * 基础抽奖策略
 * 提供最基本的抽奖功能，支持标准概率抽奖
 *
 * @description 实现餐厅积分抽奖系统的基础抽奖功能
 * @version 4.0.0
 * @date 2025-09-11
 */

const LotteryStrategy = require('../core/LotteryStrategy')
const { LotteryRecord, UserPointsAccount } = require('../../../models')
const moment = require('moment-timezone')
// 🎯 V4新增：集成测试账号权限管理
const { hasTestPrivilege } = require('../../../utils/TestAccountManager')

class BasicLotteryStrategy extends LotteryStrategy {
  constructor (config = {}) {
    super('basic', {
      enabled: true,
      defaultProbability: 0.1, // 默认中奖概率10%
      maxDrawsPerDay: 10, // 每日最大抽奖次数
      pointsCostPerDraw: 100, // 每次抽奖消耗积分
      ...config
    })

    this.logInfo('基础抽奖策略初始化完成', { config: this.config })
  }

  /**
   * 验证是否可以执行基础抽奖
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
      const todayDrawCount = await LotteryRecord.count({
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
      this.logError('基础抽奖验证失败', { error: error.message, user_id, campaign_id })
      return false
    }
  }

  /**
   * 执行基础抽奖策略
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
        this.logError('基础抽奖策略参数验证失败', {
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
        this.logError('基础抽奖策略参数验证失败', {
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
        this.logError('基础抽奖策略参数验证失败', {
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

      // 🔴 修复：移除重复的参数解构和验证
      // 使用已经验证过的user_id和campaign_id，避免重复验证
      const userId = user_id
      const campaignId = campaign_id

      this.logInfo('开始执行基础抽奖策略', {
        userId,
        campaignId,
        strategy: this.strategyName,
        config: this.config
      })

      // 🎯 Step 1: 检查用户是否有特定奖品队列（新增功能）
      const specificPrize = await this.checkUserSpecificQueue(userId, campaignId)
      if (specificPrize) {
        this.logInfo('用户有特定奖品队列，优先发放预设奖品', {
          userId,
          campaignId,
          specificPrizeNumber: specificPrize.prize_number,
          queueOrder: specificPrize.queue_order
        })

        // 发放特定奖品并标记为已完成
        const result = await this.executeSpecificPrizeAward(context, specificPrize)

        const executionTime = Date.now() - startTime
        this.logInfo('基础抽奖策略（特定奖品）执行完成', {
          userId,
          campaignId,
          result: result.result,
          prize: result.prize,
          executionTime
        })

        return result
      }

      // 🎯 Step 2: 验证是否可以执行抽奖
      const canExecute = await this.canExecute(context)
      if (!canExecute.valid) {
        const executionTime = Date.now() - startTime
        this.logError('基础抽奖验证失败', {
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
          this.logInfo('基础抽奖策略执行完成 - 中奖', {
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
            timestamp: new Date().toISOString()
          }
        }
      }

      // ✅ 修复：未中奖逻辑使用is_winner业务标准字段
      await this.deductPoints(userId, this.config.pointsCostPerDraw)
      await this.recordLotteryHistory(context, { is_winner: false }, probability)

      const executionTime = Date.now() - startTime
      this.logInfo('基础抽奖策略执行完成 - 未中奖', {
        userId,
        campaignId,
        probability,
        executionTime
      })

      return {
        success: true, // ✅ 技术字段：操作成功执行
        is_winner: false, // ✅ 业务字段：未中奖（符合接口规范）
        probability,
        pointsCost: this.config.pointsCostPerDraw,
        remainingPoints: userAccount.available_points - this.config.pointsCostPerDraw,
        executionTime,
        executedStrategy: this.strategyName,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      const executionTime = Date.now() - startTime
      this.logError('基础抽奖策略执行失败', {
        userId: context.userId,
        campaignId: context.campaignId,
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
      const todayDrawCount = await LotteryRecord.count({
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
   * 处理中奖逻辑（优化版）
   * 包含完整的库存扣减和记录创建
   */
  async processPrizeWin (context, selectedPrize) {
    // ✅ 统一业务标准：使用snake_case参数解构
    const { user_id, campaign_id } = context
    const { LotteryRecord, PrizeDistribution } = require('../../../models')

    try {
      this.logInfo('开始处理中奖逻辑', {
        user_id,
        prizeId: selectedPrize.prize_id,
        prizeName: selectedPrize.prize_name
      })

      // 🎯 原子操作：库存扣减
      if (selectedPrize.stock_quantity !== null && selectedPrize.stock_quantity > 0) {
        await selectedPrize.update({
          stock_quantity: selectedPrize.stock_quantity - 1,
          daily_win_count: (selectedPrize.daily_win_count || 0) + 1,
          status: selectedPrize.stock_quantity <= 1 ? 'out_of_stock' : selectedPrize.status
        })

        this.logInfo('库存扣减成功', {
          prizeId: selectedPrize.prize_id,
          remainingStock: selectedPrize.stock_quantity - 1
        })
      }

      // 创建中奖记录
      const winRecord = await LotteryRecord.create({
        draw_id: `draw_${Date.now()}_${user_id}_${Math.random().toString(36).substr(2, 6)}`,
        user_id,
        lottery_id: campaign_id,
        prize_id: selectedPrize.prize_id,
        is_winner: true, // ✅ 修复：使用业务标准字段
        prize_name: selectedPrize.prize_name,
        prize_value: selectedPrize.prize_value,
        draw_time: new Date(),
        strategy_used: this.strategyName
      })

      // 创建奖品分发记录
      const distribution = await PrizeDistribution.create({
        user_id,
        campaign_id,
        prize_id: selectedPrize.prize_id,
        status: 'awarded',
        distributed_at: new Date(),
        distribution_method: 'lottery_win'
      })

      return {
        is_winner: true, // ✅ 修复：统一使用业务标准字段
        prize: {
          id: selectedPrize.prize_id,
          name: selectedPrize.prize_name,
          type: selectedPrize.prize_type,
          value: parseFloat(selectedPrize.prize_value),
          description: selectedPrize.description || ''
        },
        recordId: winRecord.id,
        distributionId: distribution.id,
        message: `恭喜您获得 ${selectedPrize.prize_name}！`
      }
    } catch (error) {
      this.logError('处理中奖逻辑失败', {
        user_id,
        prizeId: selectedPrize.prize_id,
        error: error.message
      })
      throw new Error(`处理中奖失败: ${error.message}`)
    }
  }

  /**
   * 处理未中奖结果
   *
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 未中奖结果
   */
  async processNoWin (_context) {
    return {
      is_winner: false, // ✅ 业务标准字段
      prize: null,
      message: '很遗憾，这次没有中奖，再试试看吧！',
      drawTime: this.getBeijingTimestamp()
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

    await LotteryRecord.create({
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
   * 检查用户是否有特定奖品队列
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @returns {Object|null} 下一个特定奖品或null
   */
  async checkUserSpecificQueue (userId, campaignId) {
    try {
      const models = require('../../../models')

      // 检查是否有UserSpecificPrizeQueue模型
      if (!models.UserSpecificPrizeQueue) {
        this.logDebug('UserSpecificPrizeQueue模型未找到，跳过特定队列检查')
        return null
      }

      const nextSpecificPrize = await models.UserSpecificPrizeQueue.getNextPrizeForUser(
        userId,
        campaignId
      )

      if (nextSpecificPrize) {
        this.logInfo('发现用户特定奖品队列', {
          userId,
          campaignId,
          queueId: nextSpecificPrize.queue_id,
          prizeNumber: nextSpecificPrize.prize_number,
          queueOrder: nextSpecificPrize.queue_order
        })
      }

      return nextSpecificPrize
    } catch (error) {
      this.logError('检查用户特定队列失败', {
        userId,
        campaignId,
        error: error.message
      })
      return null
    }
  }

  /**
   * 执行特定奖品发放
   * @param {Object} context - 抽奖上下文
   * @param {Object} specificPrize - 特定奖品队列记录
   * @returns {Object} 抽奖结果
   */
  async executeSpecificPrizeAward (context, specificPrize) {
    try {
      // ✅ 统一业务标准：使用snake_case参数解构
      const { user_id, campaign_id } = context
      const models = require('../../../models')

      // 获取用户积分信息
      const userAccount = await UserPointsAccount.findOne({ where: { user_id } })

      // 扣减积分（特定奖品也需要消耗积分）
      await this.deductPoints(user_id, this.config.pointsCostPerDraw)

      // 发放特定奖品
      await this.distributePrize(user_id, specificPrize.prize)

      // 标记队列中的奖品为已发放
      await models.UserSpecificPrizeQueue.markAsAwarded(specificPrize.queue_id)

      // ✅ 修复：记录抽奖历史使用业务标准字段
      await this.recordLotteryHistory(
        context,
        {
          is_winner: true, // ✅ 修复：使用业务标准字段
          prize: specificPrize.prize,
          isSpecificPrize: true,
          queueId: specificPrize.queue_id,
          prizeNumber: specificPrize.prize_number
        },
        1.0
      ) // 特定奖品中奖概率为100%

      this.logInfo('特定奖品发放成功', {
        userId: user_id,
        campaignId: campaign_id,
        queueId: specificPrize.queue_id,
        prizeNumber: specificPrize.prize_number,
        prizeName: specificPrize.prize.prize_name
      })

      // ✅ 修复：返回业务标准数据，确保前端使用统一标准
      return {
        is_winner: true, // ✅ 修复：使用业务标准字段
        prize: {
          id: specificPrize.prize.prize_id,
          name: specificPrize.prize.prize_name,
          type: specificPrize.prize.prize_type,
          value: specificPrize.prize.prize_value,
          number: specificPrize.prize_number
        },
        // 显示为正常的随机概率，而不是1.0（避免暴露必中机制）
        probability: specificPrize.prize.win_probability || 0.1,
        pointsCost: this.config.pointsCostPerDraw,
        remainingPoints: userAccount.available_points - this.config.pointsCostPerDraw,
        // ❌ 移除以下字段确保用户无感知：
        // isSpecificPrize: true, // 会暴露管理员干预
        // queueOrder: specificPrize.queue_order, // 会暴露队列信息
        strategy: this.strategyName,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      this.logError('特定奖品发放失败', {
        userId: context.userId,
        campaignId: context.campaignId,
        queueId: specificPrize.queue_id,
        error: error.message
      })

      throw error
    }
  }
}

module.exports = BasicLotteryStrategy
