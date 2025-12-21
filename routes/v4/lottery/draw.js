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
 * 创建时间：2025年12月22日
 * 拆分自：lottery.js（符合Controller拆分规范 150-250行）
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { authenticateToken } = require('../../../middleware/auth')
const dataAccessControl = require('../../../middleware/dataAccessControl')
const { handleServiceError } = require('../../../middleware/validation')
const DataSanitizer = require('../../../services/DataSanitizer')
const { requestDeduplication, lotteryRateLimiter } = require('./middleware')

/**
 * @route POST /api/v4/lottery/draw
 * @desc 执行抽奖 - 支持单次和连续抽奖
 * @access Private
 *
 * @body {string} campaign_code - 活动代码（必需）
 * @body {number} draw_count - 抽奖次数（1-10，默认1）
 *
 * @returns {Object} 抽奖结果
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
    try {
      const { campaign_code, draw_count = 1 } = req.body
      const user_id = req.user.user_id

      if (!campaign_code) {
        return res.apiError('缺少必需参数: campaign_code', 'MISSING_PARAMETER', {}, 400)
      }

      // ✅ 通过Service获取并验证活动（不再直连models）
      const lottery_engine = req.app.locals.services.getService('unifiedLotteryEngine')
      const campaign = await lottery_engine.getCampaignByCode(campaign_code, {
        checkStatus: true // 只获取active状态的活动
      })
      const drawResult = await lottery_engine.execute_draw(
        user_id,
        campaign.campaign_id,
        draw_count
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

      // 记录抽奖日志（脱敏）
      const logData = DataSanitizer.sanitizeLogs({
        user_id,
        campaign_code: campaign.campaign_code,
        draw_count,
        result: 'success'
      })
      logger.info('[LotteryDraw]', logData)

      return res.apiSuccess(sanitizedResult, '抽奖成功', 'DRAW_SUCCESS')
    } catch (error) {
      logger.error('抽奖失败:', error)
      return handleServiceError(error, res, '抽奖失败')
    }
  }
)

module.exports = router
