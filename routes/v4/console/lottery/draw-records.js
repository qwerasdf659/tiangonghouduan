/**
 * 抽奖管理 — 抽奖流水列表（只读）
 *
 * @route GET /api/v4/console/lottery-management/draw-records
 * @description 分页查询 lottery_draws，供运营后台「抽奖记录」Tab 使用（含 order_no / lottery_draw_id）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { adminOpsAuthMiddleware, asyncHandler } = require('../shared/middleware')
const logger = require('../../../../utils/logger').logger

router.get(
  '/draw-records',
  adminOpsAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { page = 1, page_size = 20, user_id, lottery_campaign_id, keyword } = req.query

    const AdminLotteryQueryService = req.app.locals.services.getService('admin_lottery_query')

    const result = await AdminLotteryQueryService.getDrawRecordsList({
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10),
      user_id: user_id ? parseInt(user_id, 10) : undefined,
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id, 10) : undefined,
      keyword: keyword || undefined
    })

    logger.info('[GET /draw-records] 抽奖流水列表', {
      admin_id: req.user?.user_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '查询抽奖记录成功')
  })
)

module.exports = router
