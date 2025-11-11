/**
 * 基础抽奖保底策略
 * 整合基础抽奖功能和保底机制的统一策略
 *
 * @description V4.1版本：直接根据奖品概率分配，移除基础中奖率限制
 * - 每次抽奖必定从奖品池中选择一个奖品（根据win_probability分配）
 * - 保底机制：每累计10次抽奖，第10次必中九八折券
 * @version 4.1.0
 * @date 2025-10-07
 * @changes V4.1: 移除基础10%中奖率判断，直接使用奖品概率分配
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const LotteryStrategy = require('../core/LotteryStrategy')
const { LotteryDraw, UserPointsAccount } = require('../../../models')
const moment = require('moment-timezone')
// 🎯 V4新增：集成测试账号权限管理
const { hasTestPrivilege } = require('../../../utils/TestAccountManager')
// 🔥 V4.3新增：统一积分服务
const PointsService = require('../../PointsService')

/**
 * 基础抽奖保底策略类
 *
 * 整合基础抽奖功能和保底机制的统一策略
 *
 * 业务场景：
 * - 普通用户抽奖策略（根据奖品概率分配）
 * - 保底机制：累计10次抽奖必中九八折券
 * - 每日抽奖次数限制和积分消耗控制
 *
 * 核心功能：
 * - 根据奖品概率分配中奖结果
 * - 保底触发判断和自动发放保底奖品
 * - 扣除抽奖积分和创建抽奖记录
 * - 发放奖品到用户库存
 *
 * V4.1版本特性：
 * - 移除基础中奖率限制，直接根据奖品概率分配
 * - 每次抽奖必定从奖品池中选择一个奖品
 * - 保底机制：每累计10次抽奖，第10次必中九八折券
 */
class BasicGuaranteeStrategy extends LotteryStrategy {
  /**
   * 构造函数
   *
   * 业务场景：初始化策略配置，包括保底规则、积分消耗等
   *
   * @param {Object} [config={}] - 策略配置对象
   * @param {number} [config.maxDrawsPerDay=10] - 每日最大抽奖次数
   * @param {number} [config.pointsCostPerDraw=100] - 每次抽奖消耗积分
   * @param {Object} [config.guaranteeRule] - 保底规则配置
   * @param {number} [config.guaranteeRule.triggerCount=10] - 累计抽奖次数触发保底
   * @param {number} [config.guaranteeRule.guaranteePrizeId=9] - 保底奖品ID
   *
   * @example
   * const strategy = new BasicGuaranteeStrategy({
   *   maxDrawsPerDay: 10,
   *   pointsCostPerDraw: 100,
   *   guaranteeRule: { triggerCount: 10, guaranteePrizeId: 9 }
   * })
   */
  constructor (config = {}) {
    super('basic_guarantee', {
      enabled: true,
      defaultProbability: 1.0, // 🎯 V4.1: 移除基础中奖率限制，直接根据奖品概率分配（原10%已废弃）
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
    // 🔴 参数验证：检查context是否为null或undefined
    if (!context || typeof context !== 'object') {
      this.logError('验证失败：context参数无效', {
        context,
        contextType: typeof context
      })
      return false
    }

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
   * @param {Transaction} transaction - 外部事务对象（可选，用于连抽统一事务保护）
   * @returns {Promise<Object>} 抽奖结果
   */
  async execute (context, transaction = null) {
    const startTime = BeijingTimeHelper.timestamp()

    try {
      // 🔴 严格参数验证防止undefined错误
      if (!context || typeof context !== 'object') {
        const executionTime = BeijingTimeHelper.timestamp() - startTime
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
        const executionTime = BeijingTimeHelper.timestamp() - startTime
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
          timestamp: BeijingTimeHelper.now()
        }
      }

      if (!campaign_id || campaign_id === undefined || campaign_id === null) {
        const executionTime = BeijingTimeHelper.timestamp() - startTime
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
          timestamp: BeijingTimeHelper.now()
        }
      }

      const campaignId = campaign_id

      this.logInfo('开始执行基础抽奖保底策略', {
        user_id,
        campaignId,
        strategy: this.strategyName,
        config: this.config
      })

      // 🎯 Step 1: 检查保底机制（优先级最高）
      const guaranteeCheck = await this.checkGuaranteeRule(user_id, campaignId)
      if (guaranteeCheck.shouldTriggerGuarantee) {
        this.logInfo('🎯 触发保底机制', {
          user_id,
          campaignId,
          drawNumber: guaranteeCheck.nextDrawNumber,
          guaranteePrize: this.config.guaranteePrize.prizeName
        })

        const guaranteeResult = await this.executeGuaranteeAward(
          user_id,
          campaignId,
          guaranteeCheck.nextDrawNumber,
          transaction, // 🎯 2025-10-20修复：传入外部事务参数
          context // 🔥 2025-10-23修复：传入context用于识别连抽场景
        )

        const executionTime = BeijingTimeHelper.timestamp() - startTime
        return {
          success: true,
          is_winner: true, // ✅ 业务字段：保底必中
          prize: {
            ...guaranteeResult.prize,
            sort_order: guaranteeResult.prize.sort_order // 🎯 方案3：包含sort_order用于前端计算索引
          },
          probability: 1.0, // 保底概率100%
          pointsCost: this.config.pointsCostPerDraw,
          remainingPoints: guaranteeResult.remainingPoints,
          executionTime,
          executedStrategy: this.strategyName,
          guaranteeTriggered: true, // 标记为保底触发
          drawNumber: guaranteeCheck.nextDrawNumber,
          guaranteeReason: `累计抽奖${guaranteeCheck.nextDrawNumber}次，触发保底机制`,
          timestamp: BeijingTimeHelper.now()
        }
      }

      // 🎯 Step 2: 检查用户是否有自动化预设奖品队列（改造版）
      const presetPrize = await this.checkUserPresetQueue(user_id, campaignId, transaction)
      if (presetPrize) {
        this.logInfo('用户有自动化预设奖品队列，优先发放预设奖品', {
          user_id,
          campaignId,
          presetPrizeNumber: presetPrize.prize_number,
          queueOrder: presetPrize.queue_order,
          presetType: presetPrize.preset_type
        })

        // 发放预设奖品并标记为已完成
        const result = await this.executePresetPrizeAward(context, presetPrize, transaction)

        const executionTime = BeijingTimeHelper.timestamp() - startTime
        this.logInfo('基础抽奖保底策略（自动化预设奖品）执行完成', {
          user_id,
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
        const executionTime = BeijingTimeHelper.timestamp() - startTime
        this.logError('基础抽奖保底策略验证失败', {
          user_id,
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
          timestamp: BeijingTimeHelper.now()
        }
      }

      /*
       * 🔥 统一事务保护机制
       * 问题修复：2025-10-20 - 支持连抽统一事务保护，确保3/5/10连抽的原子性
       *
       * 逻辑：
       * - 如果有外部事务（连抽场景），使用外部事务，不提交/回滚（由外层统一管理）
       * - 如果无外部事务（单抽场景），开启独立事务，执行完立即提交/回滚（向后兼容）
       */
      const models = require('../../../models')
      const isExternalTransaction = !!transaction // 判断是否使用外部事务
      const internalTransaction = isExternalTransaction
        ? transaction // 使用外部事务（连抽场景）
        : await models.sequelize.transaction() // 开启独立事务（单抽场景）

      try {
        // 获取用户信息（包括积分余额）
        const userAccount = await UserPointsAccount.findOne({
          where: { user_id },
          transaction: internalTransaction
        })

        /*
         * 🎯 V4.1修改：移除基础中奖率判断，直接根据奖品概率分配
         * 原逻辑：Math.random() < probability（10%基础中奖率）
         * 新逻辑：直接从奖品池选择，每次必定选中一个奖品
         */
        this.logInfo('开始奖品抽取（无基础中奖率限制）', { user_id, campaignId })

        // ✅ 生成唯一的抽奖ID（用于幂等性控制）
        const draw_id = `draw_${BeijingTimeHelper.generateIdTimestamp()}_${user_id}_${Math.random().toString(36).substr(2, 6)}`

        // 直接从奖品池中选择奖品
        const prize = await this.selectPrize(await this.getAvailablePrizes(campaignId))

        if (prize) {
          /**
           * 🔥 核心修复：支持连抽统一扣除积分（2025-10-23）
           *
           * 问题根因：
           * - 原逻辑：每次抽奖都调用deductPoints扣除100积分
           * - 10连抽问题：虽然外层计算了900积分折扣，但这里每次还是扣100积分
           *
           * 修复方案：
           * - 检查context.skip_points_deduction标识
           * - 如果为true（连抽场景），跳过积分扣除（外层已统一扣除）
           * - 如果为false（单抽场景），正常扣除积分
           */
          if (!context.skip_points_deduction) {
            // 步骤1: 单抽场景 - 扣减积分（传入draw_id和transaction用于幂等性控制和事务管理）
            await this.deductPoints(
              user_id,
              this.config.pointsCostPerDraw,
              draw_id,
              internalTransaction
            )
          } else {
            // 连抽场景 - 跳过积分扣除（外层已统一扣除折扣后的总积分）
            this.logInfo('连抽场景：跳过单次积分扣除（外层已统一扣除）', {
              user_id,
              campaignId,
              draw_id,
              batch_draw_id: context.batch_draw_id
            })
          }

          // 🎯 步骤2: 扣减奖品库存（在事务中执行，防止超卖）
          await this.deductPrizeStock(prize, internalTransaction)

          // 🎯 步骤3: 发放奖品（在事务中执行，确保顺序）
          await this.distributePrize(user_id, prize, internalTransaction)

          // 🎯 步骤4: 记录抽奖历史（传入draw_id和transaction）
          await this.recordLotteryHistory(
            context,
            { is_winner: true, prize },
            1.0,
            draw_id,
            internalTransaction
          )

          // 🎯 提交事务 - 确保所有操作原子性执行（仅在独立事务时提交）
          if (!isExternalTransaction) {
            await internalTransaction.commit()
            this.logInfo('独立事务已提交（单抽场景）', { user_id, campaignId })
          } else {
            this.logInfo('外部事务暂不提交（连抽场景，等待统一提交）', { user_id, campaignId })
          }

          const executionTime = BeijingTimeHelper.timestamp() - startTime
          this.logInfo('基础抽奖保底策略执行完成 - 中奖（事务已提交）', {
            user_id,
            campaignId,
            prize: prize.prize_name,
            prize_type: prize.prize_type,
            executionTime,
            draw_id
          })

          return {
            success: true, // ✅ 技术字段：操作是否成功
            is_winner: true, // ✅ 业务字段：是否中奖（符合接口规范）
            prize: {
              id: prize.prize_id,
              name: prize.prize_name,
              type: prize.prize_type,
              value: prize.prize_value,
              sort_order: prize.sort_order // 🎯 前端用于计算索引
            },
            probability: 1.0, // 移除基础中奖率后，中奖概率100%
            pointsCost: this.config.pointsCostPerDraw,
            remainingPoints: userAccount.available_points - this.config.pointsCostPerDraw,
            executionTime,
            executedStrategy: this.strategyName,
            guaranteeTriggered: false, // 标记为非保底中奖
            timestamp: BeijingTimeHelper.now()
          }
        }

        /*
         * 🚨 异常情况：奖品池为空或选择失败（理论上不应发生）
         * ✅ 生成唯一的抽奖ID（用于幂等性控制）
         */
        const fallback_draw_id = `draw_${BeijingTimeHelper.generateIdTimestamp()}_${user_id}_${Math.random().toString(36).substr(2, 6)}`

        // 🔥 修复：连抽场景跳过积分扣除
        if (!context.skip_points_deduction) {
          await this.deductPoints(
            user_id,
            this.config.pointsCostPerDraw,
            fallback_draw_id,
            internalTransaction
          )
        }

        await this.recordLotteryHistory(
          context,
          { is_winner: false },
          0,
          fallback_draw_id,
          internalTransaction
        )

        // 提交fallback事务（仅在独立事务时提交）
        if (!isExternalTransaction) {
          await internalTransaction.commit()
          this.logInfo('独立事务已提交（fallback场景）', { user_id, campaignId })
        }

        const executionTime = BeijingTimeHelper.timestamp() - startTime
        this.logError('奖品选择失败 - 奖品池可能为空', {
          user_id,
          campaignId,
          executionTime,
          availablePrizesCount: (await this.getAvailablePrizes(campaignId)).length
        })

        return {
          success: true, // ✅ 技术字段：操作成功执行
          is_winner: false, // ✅ 业务字段：未中奖（异常情况）
          prize: null,
          probability: 0,
          pointsCost: this.config.pointsCostPerDraw,
          remainingPoints: userAccount.available_points - this.config.pointsCostPerDraw,
          executionTime,
          executedStrategy: this.strategyName,
          guaranteeTriggered: false,
          remainingDrawsToGuarantee:
            this.config.guaranteeRule.triggerCount -
            (guaranteeCheck.nextDrawNumber % this.config.guaranteeRule.triggerCount),
          timestamp: BeijingTimeHelper.now()
        }
      } catch (transactionError) {
        /*
         * 🚨 事务执行失败，回滚所有操作（仅在独立事务时回滚）
         * 如果是外部事务，抛出异常由外层统一回滚
         */
        if (!isExternalTransaction && internalTransaction && !internalTransaction.finished) {
          await internalTransaction.rollback()
          this.logError('独立事务已回滚（单抽场景）', {
            user_id,
            campaignId,
            error: transactionError.message
          })
        } else if (isExternalTransaction) {
          this.logError('外部事务异常（连抽场景，由外层统一回滚）', {
            user_id,
            campaignId,
            error: transactionError.message
          })
          throw transactionError // 抛出异常给外层统一处理
        }

        const executionTime = BeijingTimeHelper.timestamp() - startTime
        this.logError('基础抽奖保底策略执行失败（事务已回滚）', {
          user_id,
          campaignId,
          error: transactionError.message,
          executionTime
        })

        return {
          success: false,
          result: 'error',
          message: `抽奖执行失败: ${transactionError.message}`,
          executionTime,
          executedStrategy: this.strategyName,
          timestamp: BeijingTimeHelper.now()
        }
      }
    } catch (error) {
      const executionTime = BeijingTimeHelper.timestamp() - startTime
      this.logError('基础抽奖保底策略执行失败（外层异常）', {
        user_id: context.user_id,
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
        timestamp: BeijingTimeHelper.now()
      }
    }
  }

  /**
   * 检查保底规则
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 保底检查结果
   */
  async checkGuaranteeRule (user_id, campaignId) {
    try {
      // 获取用户累计抽奖次数
      const drawCount = await this.getUserDrawCount(user_id, campaignId)
      const nextDrawNumber = drawCount + 1 // 即将进行的抽奖次数

      this.logInfo('用户抽奖次数统计', {
        user_id,
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
        remainingDrawsToGuarantee: shouldTriggerGuarantee
          ? 0
          : this.config.guaranteeRule.triggerCount -
            (nextDrawNumber % this.config.guaranteeRule.triggerCount)
      }
    } catch (error) {
      this.logError('检查保底规则失败', {
        user_id,
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
   *
   * 业务场景：统计用户在指定活动中的累计抽奖次数，用于保底机制判断
   * 🔴 重要：统计所有抽奖记录，不论中奖与否
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaignId - 活动ID
   * @returns {Promise<number>} 用户累计抽奖次数，失败时返回0
   *
   * @example
   * const drawCount = await strategy.getUserDrawCount(10001, 1)
   * console.log('累计抽奖次数:', drawCount)
   */
  async getUserDrawCount (user_id, campaignId) {
    try {
      const models = require('../../../models')

      const totalDraws = await models.LotteryDraw.count({
        where: {
          user_id,
          campaign_id: campaignId
        }
      })

      this.logInfo('查询用户抽奖次数', {
        user_id,
        campaignId,
        totalDraws
      })

      return totalDraws
    } catch (error) {
      this.logError('获取用户抽奖次数失败', {
        user_id,
        campaignId,
        error: error.message
      })
      return 0
    }
  }

  /**
   * 执行保底奖品发放
   *
   * 业务场景：当用户累计抽奖次数触发保底机制时，自动发放保底奖品（九八折券）
   * 🔴 核心功能：发放九八折券并扣除积分
   *
   * 🎯 2025-10-20修复：支持外部事务参数，确保连抽场景下的事务一致性
   * 🔥 2025-10-23修复：支持连抽统一扣除积分，避免重复扣除
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {number} drawNumber - 抽奖次数
   * @param {Transaction} [transaction=null] - 外部事务对象（可选，连抽场景传入）
   * @param {Object} [context={}] - 执行上下文（可选，用于识别连抽场景）
   * @param {boolean} [context.skip_points_deduction] - 是否跳过积分检查（连抽场景为true）
   * @returns {Promise<Object>} 保底奖品发放结果
   * @returns {Object} return.prize - 奖品信息
   * @returns {number} return.prize.id - 奖品ID
   * @returns {string} return.prize.name - 奖品名称
   * @returns {string} return.prize.type - 奖品类型
   * @returns {string} return.prize.value - 奖品价值
   * @returns {number} return.prize.sort_order - 奖品排序（用于前端计算索引）
   * @returns {number} return.pointsCost - 消耗积分
   * @returns {number} return.remainingPoints - 剩余积分
   * @returns {number} return.lotteryRecordId - 抽奖记录ID
   * @returns {string} return.message - 中奖提示消息
   *
   * @throws {Error} 当用户积分不足时抛出错误
   * @throws {Error} 当保底奖品不存在时抛出错误
   *
   * @example
   * // 单抽场景
   * const result = await strategy.executeGuaranteeAward(10001, 1, 10)
   *
   * @example
   * // 连抽场景
   * const result = await strategy.executeGuaranteeAward(10001, 1, 10, transaction, {
   *   skip_points_deduction: true
   * })
   */
  async executeGuaranteeAward (user_id, campaignId, drawNumber, transaction = null, context = {}) {
    /*
     * 🔥 统一事务保护机制
     * - 如果有外部事务（连抽场景），使用外部事务，不提交/回滚
     * - 如果无外部事务（单独触发保底），开启独立事务，执行完立即提交/回滚
     */
    const models = require('../../../models')
    const isExternalTransaction = !!transaction
    const internalTransaction = isExternalTransaction
      ? transaction
      : await models.sequelize.transaction()

    try {
      // 1. 检查用户积分（保底抽奖也需要积分）
      const pointsCost = this.config.pointsCostPerDraw
      const userAccount = await models.UserPointsAccount.findOne({
        where: { user_id },
        transaction: internalTransaction
      })

      /**
       * 🔥 修复：连抽场景跳过积分检查（外层已统一检查并扣除）
       *
       * 原逻辑问题：
       * - 连抽场景：外层已扣除900积分，这里检查余额会不准确
       * - 单抽场景：需要检查用户是否有100积分
       */
      if (!context.skip_points_deduction) {
        // 单抽场景 - 检查积分是否足够
        if (!userAccount || userAccount.available_points < pointsCost) {
          if (!isExternalTransaction) {
            await internalTransaction.rollback()
          }
          throw new Error(
            `保底抽奖积分不足：需要${pointsCost}积分，当前${userAccount?.available_points || 0}积分`
          )
        }
      } else {
        // 连抽场景 - 跳过积分检查（外层已统一检查和扣除）
        this.logInfo('连抽保底场景：跳过积分检查（外层已统一检查）', {
          user_id,
          campaignId,
          drawNumber
        })
      }

      // 2. 生成唯一的抽奖ID（用于幂等性控制）
      const draw_id = `draw_${BeijingTimeHelper.generateIdTimestamp()}_${user_id}_${Math.random().toString(36).substr(2, 6)}`

      // 3. 获取九八折券奖品信息（使用悲观锁防止超卖）
      const guaranteePrize = await models.LotteryPrize.findOne({
        where: {
          prize_id: this.config.guaranteePrize.prizeId,
          campaign_id: campaignId
        },
        lock: internalTransaction.LOCK.UPDATE, // 🔥 修复：添加悲观锁防止库存超卖
        transaction: internalTransaction
      })

      if (!guaranteePrize) {
        if (!isExternalTransaction) {
          await internalTransaction.rollback()
        }
        throw new Error('保底奖品（九八折券）不存在')
      }

      /**
       * 🔥 核心修复：支持连抽统一扣除积分（2025-10-23）
       *
       * 问题：10连抽第10次触发保底时，如果这里再扣除100积分，总共会扣除1000积分
       * 修复：检查context.skip_points_deduction标识，连抽场景跳过积分扣除
       */
      if (!context.skip_points_deduction) {
        // 4. 单抽场景 - 扣除用户积分（使用统一积分服务 + 幂等性控制）
        await PointsService.consumePoints(user_id, pointsCost, {
          transaction: internalTransaction,
          business_id: draw_id, // ✅ 添加business_id用于幂等性控制
          business_type: 'lottery_consume',
          source_type: 'system',
          title: '保底抽奖消耗积分',
          description: `第${drawNumber}次抽奖触发保底机制，消耗${pointsCost}积分`
        })
      } else {
        // 连抽场景 - 跳过积分扣除（外层已统一扣除折扣后的总积分）
        this.logInfo('连抽保底场景：跳过积分扣除（外层已统一扣除）', {
          user_id,
          campaignId,
          drawNumber,
          batch_draw_id: context.batch_draw_id
        })
      }

      // 5. 创建抽奖记录
      const lotteryRecord = await models.LotteryDraw.create(
        {
          draw_id,
          user_id,
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
          created_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction: internalTransaction }
      )

      // 6. 扣减奖品库存（原子操作 + 库存验证）
      if (guaranteePrize.stock_quantity > 0) {
        // 🔥 修复：使用UPDATE WHERE确保stock_quantity >= 0，防止超卖
        const [affectedRows] = await models.sequelize.query(
          'UPDATE lottery_prizes SET stock_quantity = stock_quantity - 1 WHERE prize_id = ? AND stock_quantity >= 1',
          {
            replacements: [guaranteePrize.prize_id],
            transaction: internalTransaction,
            type: models.sequelize.QueryTypes.UPDATE
          }
        )

        if (affectedRows === 0) {
          // 库存不足，回滚事务
          if (!isExternalTransaction) {
            await internalTransaction.rollback()
          }
          throw new Error('保底奖品库存不足')
        }

        this.logInfo('保底奖品库存扣减成功', {
          prize_id: guaranteePrize.prize_id,
          prize_name: guaranteePrize.prize_name,
          remaining_stock: guaranteePrize.stock_quantity - 1
        })
      }

      // 🎯 提交事务 - 仅在独立事务时提交
      if (!isExternalTransaction) {
        await internalTransaction.commit()
        this.logInfo('保底奖品发放成功（独立事务已提交）', {
          user_id,
          campaignId,
          drawNumber,
          prizeName: guaranteePrize.prize_name
        })
      } else {
        this.logInfo('保底奖品发放成功（外部事务暂不提交，等待统一提交）', {
          user_id,
          campaignId,
          drawNumber,
          prizeName: guaranteePrize.prize_name
        })
      }

      return {
        prize: {
          id: guaranteePrize.prize_id,
          name: guaranteePrize.prize_name,
          type: guaranteePrize.prize_type,
          value: guaranteePrize.prize_value,
          sort_order: guaranteePrize.sort_order // 🎯 方案3：包含sort_order用于前端计算索引
        },
        pointsCost,
        remainingPoints: userAccount.available_points - pointsCost,
        lotteryRecordId: lotteryRecord.id,
        message: `🎉 保底中奖！获得${guaranteePrize.prize_name}（消耗${pointsCost}积分）`
      }
    } catch (error) {
      /*
       * 🚨 事务执行失败，回滚所有操作（仅在独立事务时回滚）
       * 如果是外部事务，抛出异常由外层统一回滚
       */
      if (!isExternalTransaction && internalTransaction && !internalTransaction.finished) {
        await internalTransaction.rollback()
        this.logError('保底奖品发放失败（独立事务已回滚）', {
          user_id,
          campaignId,
          error: error.message
        })
      } else if (isExternalTransaction) {
        this.logError('保底奖品发放失败（外部事务异常，由外层统一回滚）', {
          user_id,
          campaignId,
          error: error.message
        })
      }
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
          'sort_order', // 🎯 方案3：查询sort_order用于前端计算索引
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
        timestamp: BeijingTimeHelper.now()
      })

      return prizes
    } catch (error) {
      this.logError('获取奖品池失败', { campaignId, error: error.message })
      throw new Error(`获取奖品池失败: ${error.message}`)
    }
  }

  /**
   * 扣除用户积分 - 使用统一积分服务
   *
   * 业务场景：抽奖前扣除用户积分，使用统一积分服务确保积分操作的一致性和幂等性
   *
   * @param {number} user_id - 用户ID
   * @param {number} pointsCost - 扣除积分数
   * @param {string} draw_id - 抽奖ID（用于幂等性控制）
   * @param {Transaction} [transaction=null] - 事务对象（可选）
   * @returns {Promise<void>} 无返回值，扣除成功则正常返回，失败则抛出异常
   *
   * @throws {Error} 当用户积分不足时抛出错误
   *
   * @example
   * await strategy.deductPoints(10001, 100, 'draw_123', transaction)
   */
  async deductPoints (user_id, pointsCost, draw_id, transaction = null) {
    await PointsService.consumePoints(user_id, pointsCost, {
      transaction,
      business_id: draw_id, // ✅ 添加business_id用于幂等性控制（解决问题4）
      business_type: 'lottery_consume',
      source_type: 'system',
      title: '抽奖消耗积分',
      description: `基础抽奖消耗${pointsCost}积分`
    })

    this.logDebug('扣除用户积分（使用PointsService）', { user_id, pointsCost, draw_id })
  }

  /**
   * 扣减奖品库存
   *
   * 🔥 修复：2025-10-30 - 为所有奖品添加库存扣减逻辑,防止超卖
   *
   * 业务场景：在发放奖品前扣减库存，使用原子操作防止超卖
   *
   * @param {Object} prize - 奖品信息
   * @param {number} prize.prize_id - 奖品ID
   * @param {string} prize.prize_name - 奖品名称
   * @param {number|null} prize.stock_quantity - 当前库存数量（null表示无限库存）
   * @param {Transaction} transaction - 事务对象（必需）
   * @returns {Promise<void>} 无返回值，扣减成功则正常返回，失败则抛出异常
   *
   * @throws {Error} 当库存不足时抛出错误
   *
   * @example
   * await strategy.deductPrizeStock(prize, transaction)
   */
  async deductPrizeStock (prize, transaction) {
    // 如果库存为null，表示无限库存，无需扣减
    if (prize.stock_quantity === null) {
      this.logInfo('无限库存奖品，跳过库存扣减', {
        prize_id: prize.prize_id,
        prize_name: prize.prize_name
      })
      return
    }

    // 检查库存是否充足
    if (prize.stock_quantity <= 0) {
      throw new Error(`奖品库存不足：${prize.prize_name}`)
    }

    const models = require('../../../models')

    // 🔥 使用UPDATE WHERE确保stock_quantity >= 0，防止超卖（原子操作）
    const [affectedRows] = await models.sequelize.query(
      'UPDATE lottery_prizes SET stock_quantity = stock_quantity - 1 WHERE prize_id = ? AND stock_quantity >= 1',
      {
        replacements: [prize.prize_id],
        transaction,
        type: models.sequelize.QueryTypes.UPDATE
      }
    )

    if (affectedRows === 0) {
      // 库存不足（可能被其他并发请求抢走）
      throw new Error(`奖品库存不足或已售罄：${prize.prize_name}`)
    }

    this.logInfo('奖品库存扣减成功', {
      prize_id: prize.prize_id,
      prize_name: prize.prize_name,
      remaining_stock: prize.stock_quantity - 1
    })
  }

  /**
   * 发放奖品 - 使用统一积分服务
   *
   * 业务场景：根据奖品类型发放不同的奖励（积分、优惠券、实物等）
   *
   * @param {number} user_id - 用户ID
   * @param {Object} prize - 奖品信息
   * @param {number} prize.id - 奖品ID
   * @param {string} prize.prize_name - 奖品名称
   * @param {string} prize.prize_type - 奖品类型（points/coupon/physical等）
   * @param {string} prize.prize_value - 奖品价值
   * @param {Transaction} [transaction=null] - 事务对象（可选）
   * @returns {Promise<void>} 无返回值，发放成功则正常返回，失败则抛出异常
   *
   * @throws {Error} 当发放奖品失败时抛出错误
   *
   * @example
   * const prize = { id: 9, prize_name: '九八折券', prize_type: 'coupon', prize_value: '98%' }
   * await strategy.distributePrize(10001, prize, transaction)
   */
  async distributePrize (user_id, prize, transaction = null) {
    // 根据奖品类型进行不同的发放逻辑
    switch (prize.prize_type) {
    case 'points':
      // 积分奖励：使用统一积分服务（传入transaction确保事务一致性）
      await PointsService.addPoints(user_id, parseInt(prize.prize_value), {
        transaction, // 🎯 传入事务对象，确保积分操作在同一事务中
        business_type: 'lottery_reward',
        source_type: 'system',
        title: `抽奖奖励：${prize.prize_name}`,
        description: `获得${prize.prize_value}积分奖励`
      })

      this.logInfo('发放积分奖励（使用PointsService + 事务）', {
        user_id,
        prizeId: prize.id,
        prizeName: prize.prize_name,
        points: prize.prize_value,
        inTransaction: !!transaction
      })
      break

    case 'coupon':
      // 优惠券：记录到用户库存（这里简化处理）
      this.logInfo('发放优惠券奖品', {
        user_id,
        prizeId: prize.id,
        couponValue: prize.prize_value
      })
      break

    case 'physical':
      // 实物奖品：记录待发货状态（这里简化处理）
      this.logInfo('发放实物奖品', { user_id, prizeId: prize.id, prizeName: prize.prize_name })
      break

    default:
      this.logError('未知奖品类型', { prizeType: prize.prize_type })
    }
  }

  /**
   * 记录抽奖历史
   *
   * 业务场景：在抽奖完成后创建抽奖历史记录，记录奖品信息、积分消耗等
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} result - 抽奖结果
   * @param {Object} result.prize - 奖品信息
   * @param {boolean} result.is_winner - 是否中奖
   * @param {number} probability - 中奖概率
   * @param {string} [draw_id=null] - 抽奖ID（可选，如果不提供则自动生成）
   * @param {Transaction} [transaction=null] - 事务对象（可选）
   * @returns {Promise<void>} 无返回值，记录成功则正常返回，失败则抛出异常
   *
   * @throws {Error} 当记录失败时抛出错误
   *
   * @example
   * await strategy.recordLotteryHistory(
   *   { user_id: 10001, campaign_id: 1 },
   *   { prize: { id: 9, name: '九八折券' }, is_winner: true },
   *   0.1,
   *   'draw_123',
   *   transaction
   * )
   */
  async recordLotteryHistory (context, result, probability, draw_id = null, transaction = null) {
    // ✅ 统一业务标准：使用snake_case参数解构
    const { user_id, campaign_id } = context

    // ✅ 如果没有提供draw_id，则生成一个
    const finalDrawId =
      draw_id ||
      `draw_${BeijingTimeHelper.generateIdTimestamp()}_${user_id}_${Math.random().toString(36).substr(2, 6)}`

    await LotteryDraw.create(
      {
        draw_id: finalDrawId,
        user_id,
        lottery_id: campaign_id,
        campaign_id,
        draw_type: 'single',
        prize_id: result.prize?.prize_id || result.prize?.id || null,
        prize_name: result.prize?.prize_name || result.prize?.name || null, // ✅ 修复Bug：支持两种字段名格式
        prize_type: result.prize?.prize_type || result.prize?.type || null, // ✅ 修复Bug：支持两种字段名格式
        prize_value: result.prize?.prize_value || result.prize?.value || null, // ✅ 修复Bug：支持两种字段名格式
        cost_points: this.config.pointsCostPerDraw, // ✅ 修复：使用正确的字段名cost_points
        is_winner: result.is_winner,
        win_probability: probability,
        created_at: BeijingTimeHelper.createBeijingTime(),
        result_details: JSON.stringify(result)
      },
      transaction ? { transaction } : {}
    ) // 🎯 传入事务对象
  }

  /**
   * 检查用户是否有预设的抽奖结果队列
   *
   * 业务场景：测试账号可以预设抽奖结果队列，用于测试特定场景
   * 🎯 2025-10-20修复：支持外部事务参数，确保查询在事务中执行，避免脏读
   *
   * @param {number} user_id - 用户ID
   * @param {number} _campaignId - 活动ID（暂不使用，保留接口兼容性）
   * @param {Transaction} [transaction=null] - 外部事务对象（可选，连抽场景传入）
   * @returns {Promise<Object|null>} 下一个预设结果或null
   * @returns {number} [return.prize_id] - 预设奖品ID
   * @returns {string} [return.prize_name] - 预设奖品名称
   *
   * @example
   * const preset = await strategy.checkUserPresetQueue(10001, 1, transaction)
   * if (preset) {
   *   console.log('使用预设结果:', preset.prize_name)
   * }
   */
  async checkUserPresetQueue (user_id, _campaignId, transaction = null) {
    try {
      const models = require('../../../models')

      // 🎯 检查LotteryPreset模型（简化版抽奖预设功能）
      if (!models.LotteryPreset) {
        this.logDebug('LotteryPreset模型未找到，跳过预设队列检查')
        return null
      }

      const nextPreset = await models.LotteryPreset.getNextPreset(user_id, transaction)

      if (nextPreset) {
        this.logInfo('发现用户预设抽奖结果', {
          user_id,
          presetId: nextPreset.preset_id,
          prizeId: nextPreset.prize_id,
          queueOrder: nextPreset.queue_order,
          prizeName: nextPreset.prize?.name
        })
      }

      return nextPreset
    } catch (error) {
      this.logError('检查用户预设队列失败', {
        user_id,
        error: error.message
      })
      return null
    }
  }

  /**
   * 执行预设抽奖结果发放
   *
   * 🎯 2025-10-20修复：支持外部事务参数，确保连抽场景下的事务一致性
   * @param {Object} context - 抽奖上下文
   * @param {Object} preset - 预设抽奖结果记录
   * @param {Transaction} transaction - 外部事务对象（可选，连抽场景传入）
   * @returns {Object} 抽奖结果
   */
  async executePresetPrizeAward (context, preset, transaction = null) {
    try {
      // ✅ 统一业务标准：使用snake_case参数解构
      const { user_id, campaign_id } = context

      // 获取用户积分信息（在事务中查询）
      const userAccount = await UserPointsAccount.findOne({
        where: { user_id },
        transaction // 🎯 在事务中查询
      })

      // ✅ 生成唯一的抽奖ID（用于幂等性控制）
      const draw_id = `draw_${BeijingTimeHelper.generateIdTimestamp()}_${user_id}_${Math.random().toString(36).substr(2, 6)}`

      // 🔥 修复：连抽场景跳过积分扣除（预设奖品也遵循相同逻辑）
      if (!context.skip_points_deduction) {
        // 扣减积分（预设结果也需要消耗积分，保持抽奖流程一致性）
        await this.deductPoints(user_id, this.config.pointsCostPerDraw, draw_id, transaction)
      }

      // 🎯 发放预设奖品（在事务中执行）
      await this.distributePrize(user_id, preset.prize, transaction)

      // 🎯 标记预设为已使用（在事务中执行）
      await preset.markAsUsed(transaction)

      // ✅ 记录抽奖历史使用业务标准字段（在事务中执行）
      await this.recordLotteryHistory(
        context,
        {
          is_winner: true, // ✅ 预设结果必中
          prize: preset.prize,
          isPresetPrize: true, // 🎯 标记为预设结果
          presetId: preset.preset_id,
          queueOrder: preset.queue_order
        },
        1.0,
        draw_id,
        transaction // 🎯 传入事务对象
      ) // 🎯 预设结果中奖概率为100%

      this.logInfo('预设抽奖结果发放成功', {
        user_id,
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
          value: preset.prize.prize_value,
          sort_order: preset.prize.sort_order // 🎯 方案3：包含sort_order用于前端计算索引
        },
        // 🎯 显示为正常的随机概率，而不是1.0（用户无感知预设机制）
        probability: preset.prize.win_probability || 0.1,
        pointsCost: this.config.pointsCostPerDraw,
        remainingPoints: userAccount.available_points - this.config.pointsCostPerDraw,
        executedStrategy: this.strategyName,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      this.logError('预设抽奖结果发放失败', {
        user_id: context.user_id,
        campaignId: context.campaign_id,
        presetId: preset.preset_id,
        error: error.message
      })

      throw error
    }
  }
}

module.exports = BasicGuaranteeStrategy
