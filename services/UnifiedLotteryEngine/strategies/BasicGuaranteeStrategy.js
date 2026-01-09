const _logger = require('../../../utils/logger').logger
const LotteryDrawFormatter = require('../../../utils/formatters/LotteryDrawFormatter')

/**
 * 基础抽奖保底策略
 * 整合基础抽奖功能和保底机制的统一策略
 *
 * @description V4.1版本：直接根据奖品概率分配，移除基础中奖率限制
 * - 每次抽奖必定从奖品池中选择一个奖品（根据win_probability分配）
 * - 保底机制：每累计10次抽奖，第10次必中九八折券
 *
 * V4.0语义更新（2026-01-01）：
 * - 删除 is_winner 字段（"中/没中"二分法已废弃）
 * - 新增 reward_tier 字段（奖励档位：low/mid/high）
 * - 每次抽奖100%从奖品池选择一个奖品，只讨论"抽到了什么"
 *
 * @version 4.1.1
 * @date 2026-01-01
 * @changes V4.1.1: 语义清理 - 删除is_winner，使用reward_tier
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const LotteryStrategy = require('../core/LotteryStrategy')
const { LotteryDraw, Account, AccountAssetBalance } = require('../../../models') // 🔧 V4.3修复：使用新的资产系统模型
/**
 * 🎯 V4.5 配额控制：测试账号权限管理已迁移到 LotteryQuotaService（2025-12-23）
 *
 * 原导入（已废弃）：
 * const { hasTestPrivilege } = require('../../../utils/TestAccountManager')
 *
 * 新逻辑：
 * - 测试账号绕过抽奖次数限制的功能已迁移到 LotteryQuotaService
 * - 通过配额规则（user级别）实现测试账号的特殊配额
 * - 策略层不再直接检查测试账号权限
 */
// 🔥 V4.3新增：统一资产服务（替代PointsService）
const AssetService = require('../../AssetService')

/**
 * 🔧 V4.3辅助函数：获取用户积分余额（兼容新资产系统）
 *
 * @param {number} user_id - 用户ID
 * @param {Object} options - 选项 {transaction, lock}
 * @returns {Promise<Object>} 积分余额对象 {available_points}
 */
async function getUserPointsBalance(user_id, options = {}) {
  const { transaction, lock } = options

  // 查询用户账户
  const account = await Account.findOne({
    where: { user_id, account_type: 'user' },
    transaction
  })

  if (!account) {
    return null
  }

  // 查询 POINTS 资产余额
  const pointsBalance = await AccountAssetBalance.findOne({
    where: { account_id: account.account_id, asset_code: 'POINTS' },
    transaction,
    lock: lock ? transaction.LOCK.UPDATE : undefined
  })

  if (!pointsBalance) {
    return {
      available_points: 0,
      account_id: account.account_id
    }
  }

  return {
    available_points: Number(pointsBalance.available_amount),
    account_id: account.account_id,
    balance_id: pointsBalance.balance_id
  }
}

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
  constructor(config = {}) {
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
  async validateStrategy(context) {
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
      const userAccount = await getUserPointsBalance(user_id) // 🔧 V4.3修复：使用新资产系统
      if (!userAccount || userAccount.available_points < this.config.pointsCostPerDraw) {
        this.logError('用户积分不足', {
          user_id,
          currentPoints: userAccount?.available_points || 0,
          requiredPoints: this.config.pointsCostPerDraw
        })
        return false
      }

      /**
       * 🎯 V4.5 配额控制：每日抽奖次数限制已迁移到 LotteryQuotaService（2025-12-23）
       *
       * 原逻辑（已废弃）：
       * - 使用 LotteryDraw.count() 统计今日抽奖次数
       * - 与 config.maxDrawsPerDay 硬编码值比较
       *
       * 新逻辑（引擎层统一处理）：
       * - 由 UnifiedLotteryEngine.execute_draw() 调用 LotteryQuotaService.tryDeductQuota()
       * - 原子扣减配额，避免并发窗口期问题
       * - 支持四维度规则（全局/活动/角色/用户）
       *
       * 策略层不再检查每日次数，避免双重限制
       */

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
  async execute(context, transaction = null) {
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
          // V4.0语义清理：使用 reward_tier 替代 is_winner
          reward_tier: 'high', // 保底必得高档奖励
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
          // V4.0语义更新：使用 reward_tier 替代 is_winner
          reward_tier: result.reward_tier,
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
        /*
         * 获取用户信息（包括积分余额）
         * 🔧 V4.3修复：使用新资产系统获取用户积分
         */
        const userAccount = await getUserPointsBalance(user_id, {
          transaction: internalTransaction,
          lock: true // 使用行级锁防止并发问题
        })

        /*
         * 🎯 V4.1修改：移除基础中奖率判断，直接根据奖品概率分配
         * 原逻辑：Math.random() < probability（10%基础中奖率）
         * 新逻辑：直接从奖品池选择，每次必定选中一个奖品
         */
        this.logInfo('开始奖品抽取（无基础中奖率限制）', { user_id, campaignId })

        // ✅ 生成唯一的抽奖ID（用于幂等性控制）
        const draw_id = `draw_${BeijingTimeHelper.generateIdTimestamp()}_${user_id}_${Math.random().toString(36).substr(2, 6)}`

        /*
         * 直接从奖品池中选择奖品（传入user_id以支持个性化概率和预算过滤）
         * 🔒 双账户模型关键修复：预算过滤必须与当前事务一致，避免读到“未加锁的旧预算”
         */
        const prize = await this.selectPrize(
          await this.getAvailablePrizes(campaignId, user_id, { transaction: internalTransaction }),
          user_id
        )

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
            /*
             * 步骤1: 单抽场景 - 扣减积分（方案B：传入幂等上下文）
             * 🔥 事务边界治理：获取返回的 asset_transaction_id 用于对账
             */
            const deductResult = await this.deductPoints(
              user_id,
              this.config.pointsCostPerDraw,
              {
                idempotency_key: context.idempotency_key
                  ? `${context.idempotency_key}:consume`
                  : `consume_${draw_id}`,
                lottery_session_id: context.lottery_session_id
              },
              internalTransaction
            )
            /* eslint-disable-next-line require-atomic-updates -- context 是同步引用传递，无竞态风险 */
            context.asset_transaction_id = deductResult?.asset_transaction_id || null
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

          /*
           * 🎯 步骤3: 发放奖品（在事务中执行，确保顺序）
           * 🔴 方案B修复：传递完整幂等上下文（idempotency_key + lottery_session_id）
           * 不再依赖 distributePrize 内部生成随机key
           */
          await this.distributePrize(user_id, prize, internalTransaction, {
            draw_id,
            idempotency_key: context.idempotency_key,
            lottery_session_id: context.lottery_session_id
          })

          /*
           * 🎯 步骤3.5: 扣减预算积分（BUDGET_POINTS 架构）
           * 业务规则：
           * - budget_mode='user': 从用户 BUDGET_POINTS 扣减
           * - budget_mode='pool': 从活动池 pool_budget_remaining 扣减
           * - budget_mode='none': 不扣减（测试用）
           */
          const prizeValuePoints = prize.prize_value_points || 0

          if (prizeValuePoints > 0) {
            await this.deductBudgetPoints(
              campaignId,
              user_id,
              prizeValuePoints,
              {
                idempotency_key: context.idempotency_key
                  ? `${context.idempotency_key}:budget`
                  : `budget_${draw_id}`,
                prize_id: prize.prize_id,
                prize_name: prize.prize_name
              },
              internalTransaction
            )
          }

          this.logInfo('奖品价值记录', {
            user_id,
            prize_id: prize.prize_id,
            prize_value_points: prizeValuePoints
          })

          /*
           * 🎯 步骤4: 记录抽奖历史（传入draw_id、transaction）
           * V4.0语义清理：使用 reward_tier 替代 is_winner
           */
          const prizeRewardTier = LotteryDrawFormatter.inferRewardTier(prizeValuePoints)
          await this.recordLotteryHistory(
            context,
            {
              reward_tier: prizeRewardTier,
              prize,
              prize_value_points: prizeValuePoints
            },
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
            // V4.0语义清理：使用 reward_tier 替代 is_winner
            reward_tier: prizeRewardTier,
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
          /* 🔥 事务边界治理：获取返回的 asset_transaction_id 用于对账 */
          const deductResult = await this.deductPoints(
            user_id,
            this.config.pointsCostPerDraw,
            {
              idempotency_key: context.idempotency_key
                ? `${context.idempotency_key}:consume`
                : `consume_${fallback_draw_id}`,
              lottery_session_id: context.lottery_session_id
            },
            internalTransaction
          )
          /* eslint-disable-next-line require-atomic-updates -- context 是同步引用传递，无竞态风险 */
          context.asset_transaction_id = deductResult?.asset_transaction_id || null
        }

        await this.recordLotteryHistory(
          context,
          { reward_tier: 'low' }, // V4.0：fallback 场景返回低档
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
          // V4.0语义清理：使用 reward_tier
          reward_tier: 'low', // fallback 场景返回低档
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
  async checkGuaranteeRule(user_id, campaignId) {
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
   * logger.info('累计抽奖次数:', drawCount)
   */
  async getUserDrawCount(user_id, campaignId) {
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
  async executeGuaranteeAward(user_id, campaignId, drawNumber, transaction = null, context = {}) {
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
      // 🔧 V4.3修复：使用新资产系统获取用户积分
      const userAccount = await getUserPointsBalance(user_id, {
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

      /*
       * 【决策6】使用 idempotency_key 进行幂等控制（业界标准形态）
       * - 强制要求调用方提供 idempotency_key 或 lottery_session_id
       * - 禁止使用 Date.now() 自动生成，确保幂等键可追溯
       */
      const idempotencyKey = context.idempotency_key || context.lottery_session_id
      if (!idempotencyKey) {
        throw new Error(
          '缺少必需的 idempotency_key 或 lottery_session_id，无法执行抽奖（决策6：幂等键必须由业务派生）'
        )
      }

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
        // 方案B：使用 context 中传入的幂等键和抽奖会话ID
        const consumeIdempotencyKey = context.idempotency_key
          ? `${context.idempotency_key}:guarantee_consume`
          : `guarantee_consume_${draw_id}`
        const lotterySessionId = context.lottery_session_id || null

        // 🔧 V4.3修复：使用AssetService替代PointsService
        // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction: internalTransaction
        await AssetService.changeBalance(
          {
            user_id,
            asset_code: 'POINTS',
            delta_amount: -pointsCost, // 扣减为负数
            idempotency_key: consumeIdempotencyKey, // 方案B：使用派生幂等键
            lottery_session_id: lotterySessionId, // 方案B：关联抽奖会话
            business_type: 'lottery_consume',
            meta: {
              source_type: 'system',
              title: '保底抽奖消耗积分',
              description: `第${drawNumber}次抽奖触发保底机制，消耗${pointsCost}积分`
            }
          },
          { transaction: internalTransaction }
        )
      } else {
        // 连抽场景 - 跳过积分扣除（外层已统一扣除折扣后的总积分）
        this.logInfo('连抽保底场景：跳过积分扣除（外层已统一扣除）', {
          user_id,
          campaignId,
          drawNumber,
          lottery_session_id: context.lottery_session_id
        })
      }

      /*
       * 5. 创建抽奖记录
       * V4.0语义清理：使用 reward_tier 替代 is_winner
       */
      // 生成业务唯一键（格式：lottery_draw_{user_id}_{session_id}_{draw_index}）
      const business_id = `lottery_draw_${user_id}_${context.lottery_session_id || 'no_session'}_${drawNumber}`

      const lotteryRecord = await models.LotteryDraw.create(
        {
          draw_id,
          business_id, // ✅ 业务唯一键（事务边界治理 - 2026-01-05）
          idempotency_key: idempotencyKey, // 业界标准形态：使用 idempotency_key 进行幂等控制
          user_id,
          lottery_id: campaignId,
          campaign_id: campaignId,
          prize_id: guaranteePrize.prize_id,
          prize_name: guaranteePrize.prize_name,
          prize_type: guaranteePrize.prize_type,
          prize_value: guaranteePrize.prize_value,
          cost_points: pointsCost,
          result_type: 'guarantee_award', // 标记为保底中奖
          reward_tier: 'high', // V4.0：保底必得高档奖励
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
  async canExecute(context) {
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
        // 🔧 V4.3修复：使用新资产系统查询积分
        const userAccount = await getUserPointsBalance(user_id)
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

      /**
       * 🎯 V4.5 配额控制：每日抽奖次数限制已迁移到 LotteryQuotaService（2025-12-23）
       *
       * 原逻辑（已废弃）：
       * - 使用 LotteryDraw.count() 统计今日抽奖次数
       * - 与 config.maxDrawsPerDay 硬编码值比较
       * - 支持测试账号绕过限制
       *
       * 新逻辑（引擎层统一处理）：
       * - 由 UnifiedLotteryEngine.execute_draw() 调用 LotteryQuotaService.tryDeductQuota()
       * - 原子扣减配额，避免并发窗口期问题
       * - 支持四维度规则（全局/活动/角色/用户）
       * - 支持客服临时加次数（bonus_draw_count）
       *
       * 策略层不再检查每日次数，避免双重限制
       */

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
  calculateProbability(context) {
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
   * 从奖品池中选择奖品（优化版 + 用户个性化概率支持）
   * 支持50个奖品的加权随机选择算法
   *
   * @param {Array} prizes - 可用奖品列表
   * @param {number} user_id - 用户ID（用于查询个性化概率设置）
   * @returns {Promise<Object>} 选中的奖品
   */
  async selectPrize(prizes, user_id = null) {
    if (!prizes || prizes.length === 0) {
      this.logError('奖品列表为空，无法选择奖品')
      return null
    }

    // 🎯 固定概率抽奖算法 - 严格按照业务设定的中奖概率执行
    try {
      // 过滤可用奖品（有库存且激活，且概率大于0）
      let availablePrizes = prizes.filter(prize => {
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

      // 🆕 检查用户是否有特定奖品概率调整设置
      if (user_id) {
        availablePrizes = await this.applyUserProbabilityAdjustment(availablePrizes, user_id)
      }

      // 计算总概率（理论上应该等于1.0，即100%）
      const totalProbability = availablePrizes.reduce((sum, prize) => {
        return sum + parseFloat(prize.adjusted_probability || prize.win_probability)
      }, 0)

      this.logInfo('抽奖概率信息', {
        totalProbability,
        availablePrizes: availablePrizes.length,
        hasUserAdjustment: user_id && availablePrizes.some(p => p.adjusted_probability)
      })

      // 生成0-1之间的随机数
      const randomValue = Math.random()
      let currentProbability = 0

      // 根据固定概率选择奖品
      for (const prize of availablePrizes) {
        const prizeProbability = parseFloat(prize.adjusted_probability || prize.win_probability)
        currentProbability += prizeProbability
        if (randomValue <= currentProbability) {
          this.logInfo('奖品选择成功', {
            prizeId: prize.prize_id,
            prizeName: prize.prize_name,
            originalProbability: (prize.win_probability * 100).toFixed(2) + '%',
            adjustedProbability: prize.adjusted_probability
              ? (prize.adjusted_probability * 100).toFixed(2) + '%'
              : null,
            randomValue: randomValue.toFixed(4),
            hitRange: `${((currentProbability - prizeProbability) * 100).toFixed(2)}%-${(currentProbability * 100).toFixed(2)}%`
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
   * 🆕 应用用户个性化概率调整
   *
   * @description 根据用户的probability_adjust设置，调整奖品概率
   * @param {Array} prizes - 原始奖品列表
   * @param {number} user_id - 用户ID
   * @returns {Promise<Array>} 调整后的奖品列表
   *
   * @example
   * // 用户A：一等奖设置为50%，其他奖品自动缩减
   * const adjustedPrizes = await this.applyUserProbabilityAdjustment(prizes, userA_id)
   */
  async applyUserProbabilityAdjustment(prizes, user_id) {
    try {
      const { LotteryManagementSetting } = require('../../../models')

      // 查询用户的概率调整设置
      const adjustment = await LotteryManagementSetting.findOne({
        where: {
          user_id,
          setting_type: 'probability_adjust',
          status: 'active'
        }
      })

      if (!adjustment || !adjustment.setting_data) {
        return prizes // 无调整设置，返回原始概率
      }

      const settingData = adjustment.setting_data

      // ===== 类型1：特定奖品概率调整 =====
      if (settingData.adjustment_type === 'specific_prize' && settingData.prize_id) {
        return this.adjustSpecificPrizeProbability(prizes, settingData)
      }

      // ===== 类型2：全局倍数调整（原有功能） =====
      if (settingData.adjustment_type === 'global_multiplier' && settingData.multiplier) {
        return prizes.map(prize => ({
          ...prize,
          adjusted_probability: Math.min(1.0, prize.win_probability * settingData.multiplier)
        }))
      }

      return prizes
    } catch (error) {
      this.logError('应用用户概率调整失败', { user_id, error: error.message })
      return prizes // 出错时返回原始概率
    }
  }

  /**
   * 🆕 调整特定奖品概率并自动缩放其他奖品
   *
   * @description
   * 1. 将指定奖品的概率设置为自定义值
   * 2. 其他奖品按比例缩放，确保总概率=100%
   *
   * @param {Array} prizes - 原始奖品列表
   * @param {Object} settingData - 调整设置
   * @param {number} settingData.prize_id - 要调整的奖品ID
   * @param {number} settingData.custom_probability - 自定义概率（0-1）
   * @returns {Array} 调整后的奖品列表
   *
   * @example
   * 原始配置：一等奖20%、二等奖30%、三等奖50%
   * 调整设置：一等奖设置为50%
   * 调整结果：一等奖50%、二等奖18.75%、三等奖31.25%
   */
  adjustSpecificPrizeProbability(prizes, settingData) {
    const { prize_id, custom_probability } = settingData

    // 找到要调整的奖品
    const targetPrize = prizes.find(p => p.prize_id === prize_id)
    if (!targetPrize) {
      this.logWarn('指定的奖品不存在于奖品池', { prize_id })
      return prizes
    }

    const originalProbability = parseFloat(targetPrize.win_probability)
    const newProbability = parseFloat(custom_probability)

    // 计算其他奖品的原始概率总和
    const otherPrizesTotalProbability = prizes
      .filter(p => p.prize_id !== prize_id)
      .reduce((sum, p) => sum + parseFloat(p.win_probability), 0)

    // 计算缩放比例（确保总概率=100%）
    const remainingProbability = 1.0 - newProbability
    const scaleFactor =
      otherPrizesTotalProbability > 0 ? remainingProbability / otherPrizesTotalProbability : 0

    // 应用概率调整
    const adjustedPrizes = prizes.map(prize => {
      // 🔴 处理Sequelize模型实例：使用dataValues获取原始数据
      let prizeData
      if (prize.dataValues) {
        // Sequelize模型实例
        prizeData = { ...prize.dataValues }
      } else if (prize.toJSON && typeof prize.toJSON === 'function') {
        // 有toJSON方法的对象
        prizeData = prize.toJSON()
      } else {
        // 普通对象
        prizeData = { ...prize }
      }

      if (prizeData.prize_id === prize_id) {
        // 目标奖品：使用自定义概率
        return {
          ...prizeData,
          adjusted_probability: newProbability,
          adjustment_info: {
            original: originalProbability,
            adjusted: newProbability,
            reason: '管理员特定奖品概率调整'
          }
        }
      } else {
        // 其他奖品：按比例缩放
        const originalProb = parseFloat(prizeData.win_probability) || 0
        const adjustedProb = originalProb * scaleFactor
        return {
          ...prizeData,
          adjusted_probability: adjustedProb,
          adjustment_info: {
            original: originalProb,
            adjusted: adjustedProb,
            scale_factor: scaleFactor,
            reason: '自动缩放以保持总概率100%'
          }
        }
      }
    })

    this.logInfo('特定奖品概率调整完成', {
      target_prize_id: prize_id,
      target_prize_name: targetPrize.prize_name,
      original_probability: (originalProbability * 100).toFixed(2) + '%',
      new_probability: (newProbability * 100).toFixed(2) + '%',
      scale_factor: scaleFactor.toFixed(4),
      total_probability_after: adjustedPrizes
        .reduce((sum, p) => sum + p.adjusted_probability, 0)
        .toFixed(4)
    })

    return adjustedPrizes
  }

  /**
   * 获取可用奖品池（BUDGET_POINTS 预算架构：根据活动预算模式过滤）
   *
   * 业务场景：
   * - 抽奖前拉取活动奖品池（100% 从奖品池中选择一个奖品）
   * - 根据活动的 budget_mode 决定预算来源：
   *   - user: 从用户 BUDGET_POINTS 余额过滤（按 campaign_id 隔离）
   *   - pool: 从活动池 pool_budget_remaining 过滤
   *   - none: 不做预算过滤（测试用）
   *
   * @param {number} campaignId - 活动ID
   * @param {number|null} userId - 用户ID（用于预算过滤；不传则不做预算过滤）
   * @param {Object} options - 选项
   * @param {Object|null} options.transaction - 事务对象（可选）
   * @returns {Promise<Array>} 可用奖品列表（已按业务规则过滤）
   */
  async getAvailablePrizes(campaignId, userId = null, options = {}) {
    const { LotteryPrize, LotteryCampaign } = require('../../../models')
    const { transaction = null } = options

    try {
      // 🎯 优化查询 - 支持50+奖品的高效查询
      const prizes = await LotteryPrize.findAll({
        where: {
          campaign_id: campaignId,
          status: 'active'
        },
        attributes: [
          'prize_id',
          'prize_name',
          'prize_type',
          'prize_value',
          'prize_value_points', // 🔥 BUDGET_POINTS 架构：奖品价值积分
          'win_probability',
          'stock_quantity',
          'max_daily_wins',
          'daily_win_count',
          'sort_order',
          'status'
        ],
        order: [
          ['win_probability', 'DESC'],
          ['created_at', 'ASC']
        ],
        transaction
      })

      if (prizes.length === 0) {
        this.logWarn('活动没有可用奖品', { campaignId })
        return []
      }

      /*
       * ========== BUDGET_POINTS 预算架构：预算过滤逻辑 ==========
       * 业务规则：
       * - budget_mode='user': 根据用户 BUDGET_POINTS 余额筛选奖品池
       * - budget_mode='pool': 根据活动池 pool_budget_remaining 筛选奖品池
       * - budget_mode='none': 不做预算过滤（测试用）
       * - 只能抽中 prize_value_points <= remaining_budget 的奖品
       * - 预算用完后只能中0成本空奖（prize_value_points = 0）
       */
      let filteredPrizes = prizes

      // 获取活动配置
      const campaign = await LotteryCampaign.findByPk(campaignId, {
        attributes: ['campaign_id', 'budget_mode', 'pool_budget_remaining', 'allowed_campaign_ids'],
        transaction
      })

      if (!campaign) {
        this.logError('活动不存在', { campaignId })
        throw new Error(`活动不存在：campaign_id=${campaignId}`)
      }

      const budgetMode = campaign.budget_mode || 'user'

      this.logInfo('BUDGET_POINTS 架构：开始预算过滤', {
        campaignId,
        userId,
        budgetMode,
        totalPrizes: prizes.length
      })

      // 根据 budget_mode 决定预算过滤逻辑
      if (budgetMode === 'none') {
        // 🎯 无预算限制模式（测试用）：不做预算过滤
        this.logInfo('budget_mode=none：跳过预算过滤', { campaignId, userId })
      } else if (budgetMode === 'pool') {
        // 🎯 活动池预算模式：从 pool_budget_remaining 过滤
        const poolBudgetRemaining = Number(campaign.pool_budget_remaining) || 0

        filteredPrizes = prizes.filter(prize => {
          const prizeValuePoints = prize.prize_value_points || 0
          return prizeValuePoints <= poolBudgetRemaining
        })

        this.logInfo('budget_mode=pool：使用活动池预算过滤', {
          campaignId,
          poolBudgetRemaining,
          totalPrizes: prizes.length,
          filteredPrizes: filteredPrizes.length,
          budgetExhausted: poolBudgetRemaining === 0
        })

        // 如果预算用完了，至少保证有空奖可抽
        if (filteredPrizes.length === 0) {
          filteredPrizes = prizes.filter(p => (p.prize_value_points || 0) === 0)
          this.logWarn('活动池预算耗尽，仅保留0成本空奖', {
            campaignId,
            emptyPrizesCount: filteredPrizes.length
          })
        }
      } else if (budgetMode === 'user' && userId) {
        // 🎯 用户预算模式：从用户 BUDGET_POINTS 余额过滤
        let remainingBudget = 0

        // 获取用户的 BUDGET_POINTS 余额（考虑 allowed_campaign_ids 限制）
        const allowedCampaignIds = campaign.allowed_campaign_ids

        if (allowedCampaignIds === null) {
          // 无限制：查询用户所有 BUDGET_POINTS 总和
          remainingBudget = await this.getUserTotalBudgetPoints(userId, { transaction })
        } else if (Array.isArray(allowedCampaignIds) && allowedCampaignIds.length > 0) {
          // 有限制：只查询指定 campaign_id 的 BUDGET_POINTS 总和
          remainingBudget = await this.getUserBudgetPointsByCampaigns(userId, allowedCampaignIds, {
            transaction
          })
        } else {
          // 空数组：无可用预算来源
          remainingBudget = 0
        }

        // 根据预算筛选奖品池
        filteredPrizes = prizes.filter(prize => {
          const prizeValuePoints = prize.prize_value_points || 0
          return prizeValuePoints <= remainingBudget
        })

        this.logInfo('budget_mode=user：使用用户 BUDGET_POINTS 过滤', {
          userId,
          campaignId,
          remainingBudget,
          allowedCampaignIds,
          totalPrizes: prizes.length,
          filteredPrizes: filteredPrizes.length,
          budgetExhausted: remainingBudget === 0
        })

        // 如果预算用完了，至少保证有空奖可抽
        if (filteredPrizes.length === 0) {
          filteredPrizes = prizes.filter(p => (p.prize_value_points || 0) === 0)
          this.logWarn('用户预算耗尽，仅保留0成本空奖', {
            userId,
            campaignId,
            emptyPrizesCount: filteredPrizes.length
          })
        }
      }

      // 记录奖品池统计
      const totalPrizes = filteredPrizes.length
      const activePrizes = filteredPrizes.filter(p => p.stock_quantity > 0).length
      const totalStock = filteredPrizes.reduce((sum, p) => sum + (p.stock_quantity || 0), 0)

      this.logInfo('奖品池查询完成', {
        campaignId,
        userId,
        budgetMode,
        totalPrizes,
        activePrizes,
        totalStock,
        timestamp: BeijingTimeHelper.now()
      })

      return filteredPrizes
    } catch (error) {
      this.logError('获取奖品池失败', { campaignId, userId, error: error.message })
      throw new Error(`获取奖品池失败: ${error.message}`)
    }
  }

  /**
   * 获取用户所有 BUDGET_POINTS 总和（无 campaign_id 限制）
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项
   * @param {Object|null} options.transaction - 事务对象
   * @returns {Promise<number>} BUDGET_POINTS 总和
   */
  async getUserTotalBudgetPoints(userId, options = {}) {
    const { transaction } = options
    const { Account, AccountAssetBalance } = require('../../../models')

    try {
      // 查询用户账户
      const account = await Account.findOne({
        where: { user_id: userId, account_type: 'user' },
        transaction
      })

      if (!account) {
        return 0
      }

      // 汇总所有 BUDGET_POINTS 余额
      const result = await AccountAssetBalance.sum('available_amount', {
        where: {
          account_id: account.account_id,
          asset_code: 'BUDGET_POINTS'
        },
        transaction
      })

      return Number(result) || 0
    } catch (error) {
      this.logError('获取用户 BUDGET_POINTS 总和失败', { userId, error: error.message })
      return 0
    }
  }

  /**
   * 获取用户指定 campaign_id 的 BUDGET_POINTS 总和
   *
   * @param {number} userId - 用户ID
   * @param {Array<string|number>} campaignIds - 允许的 campaign_id 列表
   * @param {Object} options - 选项
   * @param {Object|null} options.transaction - 事务对象
   * @returns {Promise<number>} BUDGET_POINTS 总和
   */
  async getUserBudgetPointsByCampaigns(userId, campaignIds, options = {}) {
    const { transaction } = options
    const { Account, AccountAssetBalance } = require('../../../models')
    const { Op } = require('sequelize')

    try {
      // 查询用户账户
      const account = await Account.findOne({
        where: { user_id: userId, account_type: 'user' },
        transaction
      })

      if (!account) {
        return 0
      }

      // 将 campaignIds 转为字符串数组（campaign_id 在表中为字符串类型）
      const campaignIdStrings = campaignIds.map(id => String(id))

      // 汇总指定 campaign_id 的 BUDGET_POINTS 余额
      const result = await AccountAssetBalance.sum('available_amount', {
        where: {
          account_id: account.account_id,
          asset_code: 'BUDGET_POINTS',
          campaign_id: { [Op.in]: campaignIdStrings }
        },
        transaction
      })

      return Number(result) || 0
    } catch (error) {
      this.logError('获取用户指定活动 BUDGET_POINTS 失败', {
        userId,
        campaignIds,
        error: error.message
      })
      return 0
    }
  }

  /**
   * 扣减预算积分（BUDGET_POINTS 架构）
   *
   * 业务规则：
   * - budget_mode='user': 从用户 BUDGET_POINTS 扣减（按 allowed_campaign_ids 优先级）
   * - budget_mode='pool': 从活动池 pool_budget_remaining 扣减
   * - budget_mode='none': 不扣减（测试用）
   *
   * @param {number} campaignId - 活动ID
   * @param {number} userId - 用户ID
   * @param {number} amount - 扣减金额
   * @param {Object} options - 选项
   * @param {string} options.idempotency_key - 幂等键
   * @param {number} options.prize_id - 奖品ID
   * @param {string} options.prize_name - 奖品名称
   * @param {Object} transaction - 事务对象
   * @returns {Promise<void>} 无返回值，成功则正常返回，失败则抛出异常
   */
  async deductBudgetPoints(campaignId, userId, amount, options = {}, transaction = null) {
    const { LotteryCampaign } = require('../../../models')
    const { idempotency_key, prize_id, prize_name } = options

    if (!amount || amount <= 0) {
      return // 无需扣减
    }

    try {
      // 获取活动配置
      const campaign = await LotteryCampaign.findByPk(campaignId, {
        attributes: ['campaign_id', 'budget_mode', 'pool_budget_remaining', 'allowed_campaign_ids'],
        transaction
      })

      if (!campaign) {
        this.logError('扣减预算时活动不存在', { campaignId })
        return
      }

      const budgetMode = campaign.budget_mode || 'user'

      if (budgetMode === 'none') {
        // 无预算限制模式：不扣减
        this.logInfo('budget_mode=none：跳过预算扣减', {
          campaignId,
          userId,
          amount
        })
        return
      }

      if (budgetMode === 'pool') {
        // 活动池预算模式：扣减 pool_budget_remaining
        const newRemaining = Math.max(0, Number(campaign.pool_budget_remaining) - amount)
        await campaign.update({ pool_budget_remaining: newRemaining }, { transaction })

        this.logInfo('budget_mode=pool：活动池预算扣减成功', {
          campaignId,
          amount,
          before: campaign.pool_budget_remaining,
          after: newRemaining,
          prize_id,
          prize_name
        })
        return
      }

      if (budgetMode === 'user') {
        // 用户预算模式：从用户 BUDGET_POINTS 扣减
        const allowedCampaignIds = campaign.allowed_campaign_ids

        // 确定扣减的 campaign_id（优先使用 CONSUMPTION_DEFAULT 或 allowed_campaign_ids 中的第一个）
        let deductCampaignId = 'CONSUMPTION_DEFAULT'
        if (Array.isArray(allowedCampaignIds) && allowedCampaignIds.length > 0) {
          deductCampaignId = String(allowedCampaignIds[0])
        }

        /*
         * 【决策6】使用 AssetService 扣减用户 BUDGET_POINTS
         * - 幂等键必须由调用方传入，不允许回退生成
         */
        if (!idempotency_key) {
          throw new Error(
            '缺少必需的 idempotency_key，无法执行预算扣减（决策6：幂等键必须由业务派生）'
          )
        }
        // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
        await AssetService.changeBalance(
          {
            user_id: userId,
            asset_code: 'BUDGET_POINTS',
            delta_amount: -amount, // 扣减为负数
            campaign_id: deductCampaignId, // 🔥 BUDGET_POINTS 必须指定 campaign_id
            business_type: 'lottery_budget_deduct',
            idempotency_key, // 决策6：使用调用方传入的业务派生幂等键
            meta: {
              campaign_id: campaignId,
              prize_id,
              prize_name,
              deduct_from_campaign: deductCampaignId,
              description: `抽奖中奖扣减预算积分：${prize_name}（${amount}分）`
            }
          },
          { transaction }
        )

        this.logInfo('budget_mode=user：用户预算扣减成功', {
          userId,
          campaignId,
          amount,
          deductCampaignId,
          prize_id,
          prize_name,
          idempotency_key
        })
      }
    } catch (error) {
      this.logError('扣减预算积分失败', {
        campaignId,
        userId,
        amount,
        error: error.message
      })
      throw error // 重新抛出异常，让事务回滚
    }
  }

  /**
   * 扣除用户积分 - 使用统一积分服务（方案B - 业界标准幂等架构）
   *
   * 业务场景：抽奖前扣除用户积分，使用统一积分服务确保积分操作的一致性和幂等性
   *
   * @param {number} user_id - 用户ID
   * @param {number} pointsCost - 扣除积分数
   * @param {Object} options - 幂等性控制参数
   * @param {string} options.idempotency_key - 幂等键（必填）
   * @param {string} options.lottery_session_id - 抽奖会话ID（可选）
   * @param {Transaction} [transaction=null] - 事务对象（可选）
   * @returns {Promise<Object>} 返回扣款结果，包含 asset_transaction_id
   * @returns {number} return.asset_transaction_id - 资产流水ID（用于关联到抽奖记录）
   * @returns {boolean} return.is_duplicate - 是否为幂等重复请求
   *
   * @throws {Error} 当用户积分不足时抛出错误
   *
   * @example
   * const result = await strategy.deductPoints(10001, 100, { idempotency_key: 'xxx:consume', lottery_session_id: 'xxx' }, transaction)
   * console.log(result.asset_transaction_id) // 用于写入 lottery_draws.asset_transaction_id
   */
  async deductPoints(user_id, pointsCost, options = {}, transaction = null) {
    const { idempotency_key, lottery_session_id } = options

    if (!idempotency_key) {
      throw new Error('deductPoints 需要 idempotency_key 参数（方案B幂等架构）')
    }

    // 🔧 V4.3修复：使用AssetService替代PointsService，并获取返回值
    // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
    const result = await AssetService.changeBalance(
      {
        user_id,
        asset_code: 'POINTS',
        delta_amount: -pointsCost, // 扣减为负数
        idempotency_key, // 方案B：使用幂等键
        lottery_session_id: lottery_session_id || null, // 方案B：关联抽奖会话
        business_type: 'lottery_consume',
        meta: {
          source_type: 'system',
          title: '抽奖消耗积分',
          description: `基础抽奖消耗${pointsCost}积分`
        }
      },
      { transaction }
    )

    // 获取资产流水ID（用于关联到抽奖记录）
    const assetTransactionId = result?.transaction_record?.transaction_id || null

    this.logDebug('扣除用户积分（使用AssetService）', {
      user_id,
      pointsCost,
      idempotency_key,
      lottery_session_id,
      asset_transaction_id: assetTransactionId
    })

    // 返回扣款结果，包含 asset_transaction_id
    return {
      asset_transaction_id: assetTransactionId,
      is_duplicate: result?.is_duplicate || false
    }
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
  async deductPrizeStock(prize, transaction) {
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
   * @param {Object} [options={}] - 可选项
   * @param {string} [options.idempotency_key] - 幂等键（方案B）
   * @param {string} [options.lottery_session_id] - 抽奖会话ID（方案B）
   * @param {string} [options.draw_id] - 抽奖ID
   * @returns {Promise<void>} 无返回值，发放成功则正常返回，失败则抛出异常
   *
   * @throws {Error} 当发放奖品失败时抛出错误
   *
   * @example
   * const prize = { id: 9, prize_name: '九八折券', prize_type: 'coupon', prize_value: '98%' }
   * await strategy.distributePrize(10001, prize, transaction, { idempotency_key: 'xxx', lottery_session_id: 'xxx' })
   */
  async distributePrize(user_id, prize, transaction = null, options = {}) {
    // 方案B：强制要求传入幂等键（不再允许随机生成）
    const idempotencyKey = options.idempotency_key
    if (!idempotencyKey) {
      throw new Error('distributePrize 必须传入 idempotency_key（方案B幂等架构）')
    }
    const lotterySessionId = options.lottery_session_id || null

    // 根据奖品类型进行不同的发放逻辑
    switch (prize.prize_type) {
    case 'points':
      // 🔧 V4.3修复：使用AssetService替代PointsService（方案B幂等）
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
      await AssetService.changeBalance(
        {
          user_id,
          asset_code: 'POINTS',
          delta_amount: parseInt(prize.prize_value), // 增加积分为正数
          idempotency_key: `${idempotencyKey}:points`, // 方案B：派生幂等键
          lottery_session_id: lotterySessionId, // 方案B：关联抽奖会话
          business_type: 'lottery_reward',
          meta: {
            source_type: 'system',
            title: `抽奖奖励：${prize.prize_name}`,
            description: `获得${prize.prize_value}积分奖励`
          }
        },
        { transaction } // 🎯 传入事务对象，确保积分操作在同一事务中
      )

      this.logInfo('发放积分奖励（使用AssetService + 事务）', {
        user_id,
        prizeId: prize.prize_id,
        prizeName: prize.prize_name,
        points: prize.prize_value,
        idempotencyKey,
        lotterySessionId,
        inTransaction: !!transaction
      })
      break

    case 'coupon':
    case 'physical': {
      /**
       * 🔥 统一资产域架构：优惠券/实物奖品通过 AssetService.mintItem() 发放
       *
       * 业务场景：
       * - 抽奖中奖后，将优惠券/实物奖品写入 item_instances 表
       * - 自动记录物品铸造事件到 item_instance_events 表
       * - 支持幂等性控制（通过 source_type + source_id）
       */
      await AssetService.mintItem(
        {
          user_id,
          item_type: prize.prize_type === 'coupon' ? 'voucher' : 'product',
          source_type: 'lottery',
          source_id: `${idempotencyKey}:item`,
          meta: {
            name: prize.prize_name,
            description: prize.prize_description || `抽奖获得：${prize.prize_name}`,
            value: Math.round(parseFloat(prize.prize_value) || 0),
            prize_id: prize.prize_id,
            prize_type: prize.prize_type,
            acquisition_method: 'lottery',
            acquisition_cost: this.config.pointsCostPerDraw,
            can_transfer: true,
            can_use: true
          }
        },
        { transaction }
      )

      this.logInfo('发放物品到背包（通过 AssetService.mintItem）', {
        user_id,
        prizeId: prize.prize_id,
        prizeName: prize.prize_name,
        prizeType: prize.prize_type,
        idempotencyKey,
        inTransaction: !!transaction
      })
      break
    }

    case 'virtual': {
      /**
       * 🔥 背包双轨架构：虚拟资产发放到 AssetService（可叠加资产轨）
       *
       * 业务场景：
       * - 抽奖中奖后，虚拟资产（材料/碎片）通过 AssetService 发放
       * - 自动累加到用户资产余额
       * - 支持幂等性控制
       */
      /*
       * 虚拟奖品通过材料系统发放（见下方 material_asset_code 逻辑）
       * 如果没有配置 material_asset_code，则记录警告
       */
      if (!prize.material_asset_code) {
        this.logWarn('虚拟奖品未配置 material_asset_code，跳过发放', {
          prize_id: prize.prize_id,
          prize_name: prize.prize_name
        })
      }
      break
    }

    default:
      this.logError('未知奖品类型', { prizeType: prize.prize_type })
    }

    /**
     * 🆕 材料发放：统一账本发放材料（如果奖品配置了材料）
     *
     * 业务场景：
     * - 抽奖时可以发放材料（碎红水晶、完整红水晶等）
     * - 与积分、虚拟奖品发放并行，不影响现有功能
     * - 支持幂等性控制（使用 idempotency_key），防止重复发放
     *
     * 数据来源：
     * - material_asset_code: 材料资产代码（如red_shard、red_crystal）
     * - material_amount: 材料数量
     *
     * 业务规则：
     * - 只有当material_asset_code和material_amount都存在时才发放材料
     * - 传入transaction确保事务一致性
     * - 使用派生幂等键，通过 business_type 区分分录
     */
    if (prize.material_asset_code && prize.material_amount) {
      // 🔴 V4 Unified：材料余额真相归账本（account_asset_balances/asset_transactions）
      const AssetService = require('../../AssetService')

      // 方案B：使用派生幂等键
      const materialIdempotencyKey = `${idempotencyKey}:material`

      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
      await AssetService.changeBalance(
        {
          idempotency_key: materialIdempotencyKey, // 方案B：派生幂等键
          lottery_session_id: lotterySessionId, // 方案B：关联抽奖会话
          business_type: 'lottery_reward_material_credit',
          user_id,
          asset_code: prize.material_asset_code,
          delta_amount: prize.material_amount,
          meta: {
            prize_id: prize.prize_id,
            prize_name: prize.prize_name,
            prize_type: prize.prize_type,
            material_asset_code: prize.material_asset_code,
            material_amount: prize.material_amount
          }
        },
        { transaction }
      )

      this.logInfo('发放材料奖励（V4.5.0材料系统）', {
        user_id,
        prize_id: prize.prize_id,
        prize_name: prize.prize_name,
        material_asset_code: prize.material_asset_code,
        material_amount: prize.material_amount,
        idempotencyKey: materialIdempotencyKey,
        lotterySessionId,
        inTransaction: !!transaction
      })
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
   * @param {string} result.reward_tier - 奖励档位（V4.0语义：low/mid/high）
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
   *   { prize: { id: 9, name: '九八折券' }, reward_tier: 'high' },
   *   0.1,
   *   'draw_123',
   *   transaction
   * )
   */
  /**
   * 记录抽奖历史（带幂等控制）
   *
   * 业务场景：创建抽奖记录，防止重复提交
   *
   * 幂等控制：
   * - 通过 idempotency_key 防止重复提交（业界标准形态）
   * - 同一 lottery_session_id/idempotency_key 只能创建一条记录
   * - 重复提交返回已有记录
   *
   * 业界标准形态：统一使用 idempotency_key 进行幂等控制
   *
   * @param {Object} context - 抽奖上下文
   * @param {Object} result - 抽奖结果
   * @param {number} probability - 中奖概率
   * @param {string|null} draw_id - 抽奖记录ID（可选）
   * @param {Transaction|null} transaction - 数据库事务对象（可选）
   * @returns {Promise<Object>} 抽奖记录对象
   *
   * @example
   * await strategy.recordLotteryHistory(
   *   context,
   *   { reward_tier: 'high', prize: {...} },
   *   1.0,
   *   'draw_123',
   *   transaction
   * )
   */
  async recordLotteryHistory(context, result, probability, draw_id = null, transaction = null) {
    // ✅ 统一业务标准：使用snake_case参数解构
    const { user_id, campaign_id } = context

    // ✅ 如果没有提供draw_id，则生成一个
    const finalDrawId =
      draw_id ||
      `draw_${BeijingTimeHelper.generateIdTimestamp()}_${user_id}_${Math.random().toString(36).substr(2, 6)}`

    /*
     * 【决策6】业界标准形态：使用 idempotency_key 进行幂等控制
     * - 强制要求调用方提供 idempotency_key 或 lottery_session_id
     * - 禁止使用 Date.now() 自动生成，确保幂等键可追溯
     */
    const idempotencyKey = context.idempotency_key || context.lottery_session_id
    if (!idempotencyKey) {
      throw new Error(
        '缺少必需的 idempotency_key 或 lottery_session_id，无法记录抽奖历史（决策6：幂等键必须由业务派生）'
      )
    }

    // 幂等检查：防止重复提交创建多条抽奖记录
    const existingDraw = await LotteryDraw.findOne({
      where: { idempotency_key: idempotencyKey },
      transaction: transaction || undefined
    })

    if (existingDraw) {
      this.logInfo('抽奖记录已存在（幂等）', {
        idempotency_key: idempotencyKey,
        draw_id: existingDraw.draw_id,
        user_id,
        campaign_id,
        lottery_session_id: context.lottery_session_id
      })
      // 返回已有记录（幂等）
      return existingDraw
    }

    /*
     * 创建新的抽奖记录
     * V4.0语义清理：使用 reward_tier 替代 is_winner
     * 事务边界治理（2026-01-05）：写入 lottery_session_id 和 asset_transaction_id 用于对账
     */
    const rewardTier =
      result.reward_tier || LotteryDrawFormatter.inferRewardTier(result.prize_value_points)

    // 生成业务唯一键（格式：lottery_draw_{user_id}_{session_id}_{draw_id}）
    const business_id = `lottery_draw_${user_id}_${context.lottery_session_id || 'no_session'}_${finalDrawId}`

    const lotteryDraw = await LotteryDraw.create(
      {
        draw_id: finalDrawId,
        business_id, // ✅ 业务唯一键（事务边界治理 - 2026-01-05）
        idempotency_key: idempotencyKey, // 业界标准形态：使用 idempotency_key 进行幂等控制
        // 🔥 事务边界治理：写入对账关联字段
        lottery_session_id: context.lottery_session_id || null, // 抽奖会话ID
        asset_transaction_id: context.asset_transaction_id || null, // 关联的资产流水ID
        user_id,
        lottery_id: campaign_id,
        campaign_id,
        draw_type: 'single',
        prize_id: result.prize?.prize_id || result.prize?.id || null,
        prize_name: result.prize?.prize_name || result.prize?.name || null, // ✅ 修复Bug：支持两种字段名格式
        prize_type: result.prize?.prize_type || result.prize?.type || null, // ✅ 修复Bug：支持两种字段名格式
        prize_value: result.prize?.prize_value || result.prize?.value || null, // ✅ 修复Bug：支持两种字段名格式
        cost_points: this.config.pointsCostPerDraw, // ✅ 修复：使用正确的字段名cost_points
        reward_tier: rewardTier, // V4.0：奖励档位
        win_probability: probability,
        // 🔥 双账户模型：预算审计字段
        prize_value_points: result.prize_value_points || 0,
        budget_points_before: result.budget_points_before || null,
        budget_points_after: result.budget_points_after || null,
        created_at: BeijingTimeHelper.createBeijingTime(),
        result_details: JSON.stringify(result)
      },
      transaction ? { transaction } : {}
    ) // 🎯 传入事务对象

    this.logInfo('抽奖记录创建成功', {
      idempotency_key: idempotencyKey,
      draw_id: finalDrawId,
      user_id,
      campaign_id,
      reward_tier: rewardTier, // V4.0：使用 reward_tier
      lottery_session_id: context.lottery_session_id,
      asset_transaction_id: context.asset_transaction_id
    })

    return lotteryDraw
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
   *   logger.info('使用预设结果:', preset.prize_name)
   * }
   */
  async checkUserPresetQueue(user_id, _campaignId, transaction = null) {
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
  async executePresetPrizeAward(context, preset, transaction = null) {
    try {
      // ✅ 统一业务标准：使用snake_case参数解构
      const { user_id, campaign_id } = context

      // 🔧 V4.3修复：使用新资产系统获取用户积分信息
      const userAccount = await getUserPointsBalance(user_id, {
        transaction // 🎯 在事务中查询
      })

      // ✅ 生成唯一的抽奖ID（用于幂等性控制）
      const draw_id = `draw_${BeijingTimeHelper.generateIdTimestamp()}_${user_id}_${Math.random().toString(36).substr(2, 6)}`

      // 🔥 修复：连抽场景跳过积分扣除（预设奖品也遵循相同逻辑）
      if (!context.skip_points_deduction) {
        /*
         * 扣减积分（方案B：传入幂等上下文）
         * 🔥 事务边界治理：获取返回的 asset_transaction_id 用于对账
         */
        const deductResult = await this.deductPoints(
          user_id,
          this.config.pointsCostPerDraw,
          {
            idempotency_key: context.idempotency_key
              ? `${context.idempotency_key}:consume`
              : `consume_${draw_id}`,
            lottery_session_id: context.lottery_session_id
          },
          transaction
        )
        /* eslint-disable-next-line require-atomic-updates -- context 是同步引用传递，无竞态风险 */
        context.asset_transaction_id = deductResult?.asset_transaction_id || null
      }

      /*
       * 🎯 发放预设奖品（在事务中执行）
       * 🔴 方案B修复：传递完整幂等上下文（idempotency_key + lottery_session_id）
       */
      await this.distributePrize(user_id, preset.prize, transaction, {
        draw_id,
        idempotency_key: context.idempotency_key,
        lottery_session_id: context.lottery_session_id
      })

      // 🎯 标记预设为已使用（在事务中执行）
      await preset.markAsUsed(transaction)

      /*
       * ✅ 记录抽奖历史使用业务标准字段（在事务中执行）
       * V4.0语义清理：使用 reward_tier 替代 is_winner
       */
      const presetRewardTier = LotteryDrawFormatter.inferRewardTier(
        preset.prize?.prize_value_points || preset.prize?.prize_value || 0
      )
      await this.recordLotteryHistory(
        context,
        {
          reward_tier: presetRewardTier, // V4.0：使用 reward_tier
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
        // V4.0语义清理：使用 reward_tier 替代 is_winner
        reward_tier: presetRewardTier,
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
