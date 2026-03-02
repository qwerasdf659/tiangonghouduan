/**
 * 餐厅积分抽奖系统 V4.0 - 抽奖执行API路由
 *
 * 功能：
 * - 执行单次/连续抽奖
 *
 * 路由前缀：/api/v4/lottery
 *
 * 业务规则（V4.0语义更新 2026-01-01）：
 * - 100%获奖：每次抽奖必定从奖品池选择一个奖品（只是价值不同）
 * - 连抽限制：连续抽奖最多10次，单次事务保证原子性
 * - 积分扣除：抽奖前检查余额，抽奖后立即扣除，使用事务保护
 * - 奖励档位：使用 reward_tier (low/mid/high) 替代原 is_winner
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 使用 TransactionManager.execute() 统一管理事务
 * - 传递 transaction 到 execute_draw()
 * - 事务内包含：积分扣除、奖品发放、保底计数、抽奖记录创建
 *
 * 幂等性保证（业界标准形态 - 破坏性重构 2026-01-02）：
 * - 入口幂等：统一只接受 Header Idempotency-Key，不接受 body，不服务端生成
 * - 缺失幂等键：直接返回 400 BAD_REQUEST
 * - 流水幂等：通过派生 idempotency_key 保证每条流水唯一
 *
 * 创建时间：2025年12月22日
 * 更新时间：2026年01月05日 - 事务边界治理改造
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { authenticateToken } = require('../../../middleware/auth')
const dataAccessControl = require('../../../middleware/dataAccessControl')
const { handleServiceError } = require('../../../middleware/validation')
/*
 * P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）
 * const DataSanitizer = require('../../../services/DataSanitizer')
 * const IdempotencyService = require('../../../services/IdempotencyService')
 */
const LotteryDrawFormatter = require('../../../utils/formatters/LotteryDrawFormatter')
const { requestDeduplication, lotteryRateLimiter } = require('./middleware')
// 事务边界治理（2026-01-05 决策）- 统一事务管理器
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * @route POST /api/v4/lottery/draw
 * @desc 执行抽奖 - 支持单次和连续抽奖
 * @access Private
 *
 * @header {string} Idempotency-Key - 幂等键（必填，客户端生成，不接受body参数，不服务端兜底生成）
 * @body {string} campaign_code - 活动代码（必需）
 * @body {number} draw_count - 抽奖次数（1-10，默认1）
 *
 * @returns {Object} 抽奖结果
 *
 * 幂等性保证（业界标准形态 - 破坏性重构）：
 * - 所有写接口统一只收 Idempotency-Key（Header），缺失即 400
 * - 禁止 body 中的幂等键参数，禁止服务端兜底生成
 * - 相同幂等键的重复请求返回首次结果（is_duplicate: true）
 * - 同 key 不同参数返回 409 IDEMPOTENCY_KEY_CONFLICT
 * - 处理中的请求返回 409 REQUEST_PROCESSING
 *
 * 并发控制：
 * - 请求去重：5秒内相同请求返回"处理中"
 * - 限流保护：20次/分钟/用户
 */
router.post(
  '/draw',
  authenticateToken,
  requestDeduplication,
  lotteryRateLimiter,
  dataAccessControl,
  async (req, res) => {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const IdempotencyService = req.app.locals.services.getService('idempotency')
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')

    // 【业界标准形态】强制从 Header 获取幂等键，不接受 body，不服务端生成
    const idempotency_key = req.headers['idempotency-key']

    // 缺失幂等键直接返回 400
    if (!idempotency_key) {
      return res.apiError(
        '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key。' +
          '重试时必须复用同一幂等键以防止重复抽奖。',
        'MISSING_IDEMPOTENCY_KEY',
        {
          required_header: 'Idempotency-Key',
          example: 'Idempotency-Key: lottery_draw_<timestamp>_<random>'
        },
        400
      )
    }

    try {
      const { campaign_code, draw_count: raw_draw_count = 1 } = req.body
      const user_id = req.user.user_id

      if (!campaign_code) {
        return res.apiError('缺少必需参数: campaign_code', 'MISSING_PARAMETER', {}, 400)
      }

      /*
       * 🔴 P0 修复：draw_count 参数边界值验证
       * 规则：
       * - 必须为正整数（1-10）
       * - 非数字类型返回 400 INVALID_DRAW_COUNT
       * - 超出范围返回 400 DRAW_COUNT_OUT_OF_RANGE
       */
      const draw_count = parseInt(raw_draw_count, 10)

      // 类型验证：必须是有效数字
      if (isNaN(draw_count)) {
        return res.apiError(
          '抽奖次数必须是有效的数字',
          'INVALID_DRAW_COUNT',
          {
            received: raw_draw_count,
            expected: '正整数 1-10'
          },
          400
        )
      }

      // 边界值验证：必须在 1-10 范围内
      if (draw_count < 1 || draw_count > 10) {
        return res.apiError(
          '抽奖次数超出有效范围',
          'DRAW_COUNT_OUT_OF_RANGE',
          {
            received: draw_count,
            min: 1,
            max: 10
          },
          400
        )
      }

      /*
       * 【入口幂等检查】防止同一次请求被重复提交
       */
      const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
        api_path: '/api/v4/lottery/draw',
        http_method: 'POST',
        request_params: { campaign_code, draw_count },
        user_id
      })

      // 如果已完成，直接返回首次结果（幂等性要求）+ is_duplicate 标记
      if (!idempotencyResult.should_process) {
        logger.info('🔄 入口幂等拦截：重复请求，返回首次结果', {
          idempotency_key,
          user_id,
          campaign_code
        })
        // 业界标准形态：回放返回首次结果 + is_duplicate: true
        const duplicateResponse = {
          ...idempotencyResult.response,
          is_duplicate: true
        }
        return res.apiSuccess(duplicateResponse, '抽奖成功（幂等回放）', 'DRAW_SUCCESS')
      }

      /*
       * 【执行抽奖】通过 UnifiedLotteryEngine 处理
       * 🔒 事务边界治理（2026-01-05 决策）
       *    - 使用 TransactionManager.execute() 统一管理事务
       *    - 传递 transaction 到 execute_draw()
       *    - 事务内包含：积分扣除、奖品发放、保底计数、抽奖记录创建
       */

      // ✅ 通过 LotteryQueryService 获取并验证活动（读写分离架构）
      const LotteryQueryService = req.app.locals.services.getService('lottery_query')
      const campaign = await LotteryQueryService.getCampaignByCode(campaign_code, {
        checkStatus: true // 只获取active状态的活动
      })

      // 使用 TransactionManager 统一管理事务边界
      const lottery_engine = req.app.locals.services.getService('unified_lottery_engine')
      const drawResult = await TransactionManager.execute(
        async transaction => {
          // 传递幂等键和事务到抽奖引擎
          return await lottery_engine.execute_draw(
            user_id,
            campaign.lottery_campaign_id,
            draw_count,
            {
              idempotency_key, // 请求级幂等键，用于派生事务级幂等键
              request_source: 'api_v4_lottery_draw', // 请求来源标识
              transaction // 🔒 关键：传递事务对象
            }
          )
        },
        {
          timeout: 30000,
          description: `抽奖执行 user_id=${user_id} lottery_campaign_id=${campaign.lottery_campaign_id} draw_count=${draw_count}`
        }
      )

      // 🔍 调试日志：查看策略返回的原始数据
      logger.info(
        '[DEBUG] drawResult.prizes:',
        JSON.stringify(
          drawResult.prizes.map(p => ({
            reward_tier: p.reward_tier, // V4.0：使用 reward_tier
            has_prize: !!p.prize,
            prize_keys: p.prize ? Object.keys(p.prize) : [],
            sort_order: p.prize?.sort_order
          })),
          null,
          2
        )
      )

      // 对抽奖结果进行脱敏处理（V4.0语义更新）
      const sanitizedResult = {
        success: drawResult.success,
        campaign_code: campaign.campaign_code,
        lottery_session_id: drawResult.execution_id,
        prizes: drawResult.prizes.map(prize => {
          const rewardTier =
            prize.reward_tier || LotteryDrawFormatter.inferRewardTier(prize.prize?.value || 0)
          /**
           * execute_draw 返回的 prize 对象使用短字段名：id, name, type, value
           * 路由层转换为 API 契约字段名：lottery_prize_id, prize_name, prize_type, prize_value
           */
          const rawValue = prize.prize?.value
          const prizeValue = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue) || 0
          return {
            reward_tier: rewardTier,
            reward_tier_text: LotteryDrawFormatter.getRewardTierText(rewardTier),
            lottery_prize_id: prize.prize?.id || null,
            prize_name: prize.prize?.name || '未知奖品',
            prize_type: prize.prize?.type || null,
            prize_value: prizeValue,
            sort_order: prize.prize?.sort_order,
            /** 稀有度代码（FK→rarity_defs，前端直接使用此字段名显示对应颜色光效） */
            rarity_code: prize.prize?.rarity_code || 'common'
          }
        }),
        total_points_cost: drawResult.total_points_cost, // 实际消耗积分（折后价）
        original_cost: drawResult.original_cost, // 原价积分（用于显示优惠）
        discount: drawResult.discount, // 折扣率（0.9=九折，1.0=无折扣）
        saved_points: drawResult.saved_points, // 节省的积分数量（前端显示"节省XX积分"）
        remaining_balance: drawResult.remaining_balance, // 剩余积分余额
        draw_count: drawResult.draw_count, // 抽奖次数
        draw_type: drawResult.draw_type // 抽奖类型显示（如"10连抽(九折)"）
      }

      /*
       * 【标记请求完成】保存结果快照到入口幂等表
       */
      await IdempotencyService.markAsCompleted(
        idempotency_key,
        drawResult.execution_id, // 业务事件ID = lottery_session_id
        sanitizedResult
      )

      // 记录抽奖日志（脱敏）
      const logData = DataSanitizer.sanitizeLogs({
        user_id,
        campaign_code: campaign.campaign_code,
        draw_count,
        idempotency_key,
        lottery_session_id: drawResult.execution_id,
        result: 'success'
      })
      logger.info('[LotteryDraw] 抽奖成功', logData)

      /*
       * 🔔 WebSocket实时通知：推送抽奖结果给用户（2026-01-28 新增）
       * 业务场景：用户抽奖成功后，实时推送中奖消息到客户端
       * 实现说明：
       * - 在线用户：通过WebSocket实时推送
       * - 离线用户：消息保存到数据库，上线后可查看
       * - 通知失败不影响抽奖结果返回（非关键路径）
       */
      try {
        const NotificationService = req.app.locals.services.getService('notification')

        // 并行发送所有奖品的通知（支持单抽和连抽）
        const notificationPromises = sanitizedResult.prizes.map(prize =>
          NotificationService.notifyLotteryWin(user_id, {
            lottery_draw_id: sanitizedResult.lottery_session_id,
            prize_name: prize.prize_name,
            prize_type: prize.prize_type,
            prize_value: prize.prize_value,
            reward_tier: prize.reward_tier,
            campaign_code: sanitizedResult.campaign_code
          })
        )

        await Promise.all(notificationPromises)

        logger.info('[LotteryDraw] WebSocket通知已推送', {
          user_id,
          prizes_count: sanitizedResult.prizes.length,
          lottery_session_id: sanitizedResult.lottery_session_id
        })
      } catch (notifyError) {
        // 通知失败不影响业务流程
        logger.warn('[LotteryDraw] WebSocket通知发送失败（非关键）', {
          user_id,
          error: notifyError.message
        })
      }

      // Phase 6: 广告归因追踪（非关键路径，错误不影响业务）
      try {
        const AdAttributionService = req.app.locals.services.getService('ad_attribution')
        await AdAttributionService.checkConversion(
          user_id,
          'lottery_draw',
          String(drawResult.execution_id)
        )
      } catch (attrError) {
        logger.warn('[LotteryDraw] 广告归因追踪失败（非关键）', { error: attrError.message })
      }

      return res.apiSuccess(sanitizedResult, '抽奖成功', 'DRAW_SUCCESS')
    } catch (error) {
      // 标记幂等请求为失败状态（允许重试）
      await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(markError => {
        logger.error('标记幂等请求失败状态时出错:', markError)
      })

      // 数据库死锁错误处理（高并发场景）
      const isDeadlock =
        error.message?.includes('Deadlock') ||
        error.message?.includes('deadlock') ||
        error.parent?.code === 'ER_LOCK_DEADLOCK'
      if (isDeadlock) {
        logger.warn('数据库死锁（并发竞争），建议重试', {
          idempotency_key,
          user_id: req.user?.user_id
        })
        return res.apiError('服务繁忙，请稍后重试', 'CONCURRENT_CONFLICT', { retry_after: 1 }, 409)
      }

      // 处理幂等键冲突错误（409状态码）
      if (error.statusCode === 409) {
        logger.warn('幂等性错误:', {
          idempotency_key,
          error_code: error.errorCode,
          message: error.message
        })
        return res.apiError(error.message, error.errorCode || 'IDEMPOTENCY_ERROR', {}, 409)
      }

      // 已知业务错误：活动不存在、活动状态异常（直接返回明确的业务错误码）
      if (error.code === 'CAMPAIGN_NOT_FOUND' || error.code === 'CAMPAIGN_NOT_ACTIVE') {
        return res.apiError(error.message, error.code, error.data || null, error.statusCode || 404)
      }

      // 已知业务错误：配额不足（403）
      if (error.errorCode === 'DAILY_DRAW_LIMIT_EXCEEDED') {
        return res.apiError(error.message, error.errorCode, error.data || null, 403)
      }

      logger.error('抽奖失败:', error)
      return handleServiceError(error, res, '抽奖失败')
    }
  }
)

module.exports = router
