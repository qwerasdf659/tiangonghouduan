/**
 * 餐厅积分抽奖系统 V4.0 - 抽奖执行API路由
 *
 * 功能：
 * - 执行单次/连续抽奖
 *
 * 路由前缀：/api/v4/lottery
 *
 * 业务规则：
 * - 100%中奖：每次抽奖必定从奖品池选择一个奖品（只是价值不同）
 * - 连抽限制：连续抽奖最多10次，单次事务保证原子性
 * - 积分扣除：抽奖前检查余额，抽奖后立即扣除，使用事务保护
 *
 * 幂等性保证（方案B - 业界标准）：
 * - 入口幂等：通过 IdempotencyService 实现"重试返回首次结果"
 * - 流水幂等：通过派生 idempotency_key 保证每条流水唯一
 *
 * 创建时间：2025年12月22日
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { authenticateToken } = require('../../../middleware/auth')
const dataAccessControl = require('../../../middleware/dataAccessControl')
const { handleServiceError } = require('../../../middleware/validation')
const DataSanitizer = require('../../../services/DataSanitizer')
const { requestDeduplication, lotteryRateLimiter } = require('./middleware')
// 方案B：业界标准幂等架构
const IdempotencyService = require('../../../services/IdempotencyService')
const { generateRequestIdempotencyKey } = require('../../../utils/IdempotencyHelper')

/**
 * @route POST /api/v4/lottery/draw
 * @desc 执行抽奖 - 支持单次和连续抽奖
 * @access Private
 *
 * @header {string} Idempotency-Key - 幂等键（可选，客户端生成或服务端生成）
 * @body {string} campaign_code - 活动代码（必需）
 * @body {number} draw_count - 抽奖次数（1-10，默认1）
 *
 * @returns {Object} 抽奖结果
 *
 * 幂等性保证（方案B）：
 * - 相同幂等键的重复请求返回首次结果
 * - 参数冲突时返回 409 错误
 * - 处理中的请求返回 409 错误
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
    // 获取或生成幂等键（客户端可通过请求头传入）
    const idempotency_key =
      req.headers['idempotency-key'] || req.body.idempotency_key || generateRequestIdempotencyKey()

    try {
      const { campaign_code, draw_count = 1 } = req.body
      const user_id = req.user.user_id

      if (!campaign_code) {
        return res.apiError('缺少必需参数: campaign_code', 'MISSING_PARAMETER', {}, 400)
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

      // 如果已完成，直接返回首次结果（幂等性要求）
      if (!idempotencyResult.should_process) {
        logger.info('🔄 入口幂等拦截：重复请求，返回首次结果', {
          idempotency_key,
          user_id,
          campaign_code
        })
        return res.apiSuccess(
          idempotencyResult.response,
          '抽奖成功（重试返回首次结果）',
          'DRAW_SUCCESS'
        )
      }

      /*
       * 【执行抽奖】通过 UnifiedLotteryEngine 处理
       */

      // ✅ 通过Service获取并验证活动（不再直连models）
      const lottery_engine = req.app.locals.services.getService('unifiedLotteryEngine')
      const campaign = await lottery_engine.getCampaignByCode(campaign_code, {
        checkStatus: true // 只获取active状态的活动
      })

      // 传递幂等键到抽奖引擎（用于派生流水幂等键）
      const drawResult = await lottery_engine.execute_draw(
        user_id,
        campaign.campaign_id,
        draw_count,
        {
          idempotency_key, // 请求级幂等键，用于派生事务级幂等键
          request_source: 'api_v4_lottery_draw' // 请求来源标识
        }
      )

      // 🔍 调试日志：查看策略返回的原始数据
      logger.info(
        '[DEBUG] drawResult.prizes:',
        JSON.stringify(
          drawResult.prizes.map(p => ({
            is_winner: p.is_winner,
            has_prize: !!p.prize,
            prize_keys: p.prize ? Object.keys(p.prize) : [],
            sort_order: p.prize?.sort_order
          })),
          null,
          2
        )
      )

      // 对抽奖结果进行脱敏处理
      const sanitizedResult = {
        success: drawResult.success,
        campaign_code: campaign.campaign_code, // 返回campaign_code
        lottery_session_id: drawResult.execution_id, // 返回抽奖会话ID（用于关联查询）
        prizes: drawResult.prizes.map(prize => {
          // ✅ 未中奖时返回特殊标记，不包含prize详情
          if (!prize.is_winner || !prize.prize) {
            return {
              is_winner: false,
              name: '未中奖',
              type: 'empty',
              sort_order: null,
              icon: '💨',
              rarity: 'common',
              display_points: 0
            }
          }

          // ✅ 中奖时返回完整奖品信息
          return {
            is_winner: true,
            id: prize.prize.id,
            name: prize.prize.name,
            type: prize.prize.type,
            sort_order: prize.prize.sort_order, // 🎯 前端用于计算索引（index = sort_order - 1）
            icon: DataSanitizer.getPrizeIcon(prize.prize.type),
            rarity: DataSanitizer.calculateRarity(prize.prize.type),
            display_points:
              typeof prize.prize.value === 'number'
                ? prize.prize.value
                : parseFloat(prize.prize.value) || 0,
            display_value: DataSanitizer.getDisplayValue(
              typeof prize.prize.value === 'number'
                ? prize.prize.value
                : parseFloat(prize.prize.value) || 0
            )
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

      return res.apiSuccess(sanitizedResult, '抽奖成功', 'DRAW_SUCCESS')
    } catch (error) {
      // 标记幂等请求为失败状态（允许重试）
      await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(markError => {
        logger.error('标记幂等请求失败状态时出错:', markError)
      })

      // 处理幂等键冲突错误（409状态码）
      if (error.statusCode === 409) {
        logger.warn('幂等性错误:', {
          idempotency_key,
          error_code: error.errorCode,
          message: error.message
        })
        return res.apiError(error.message, error.errorCode || 'IDEMPOTENCY_ERROR', {}, 409)
      }

      logger.error('抽奖失败:', error)
      return handleServiceError(error, res, '抽奖失败')
    }
  }
)

module.exports = router
