/**
 * 抽奖域路由聚合入口
 *
 * @description 抽奖活动、配置、监控、预设、奖品池、强控干预等全部抽奖业务路由
 * @route /api/v4/console/lottery-*  /api/v4/console/prize-pool  /api/v4/console/lottery-management/*
 */
const express = require('express')
const router = express.Router()

// ── 抽奖核心 ──
router.use('/lottery', require('./lottery'))
router.use('/lottery-campaigns', require('./lottery-campaigns'))
router.use('/lottery-configs', require('./lottery-configs'))
router.use('/lottery-presets', require('./lottery-presets'))
router.use('/lottery-quota', require('./lottery-quota'))
router.use('/lottery-tier-rules', require('./lottery-tier-rules'))
router.use('/lottery-simulation', require('./lottery-simulation'))
router.use('/prize-pool', require('./prize_pool'))

// ── 抽奖监控与分析 ──
router.use('/lottery-realtime', require('./lottery-realtime'))
router.use('/lottery-statistics', require('./lottery-statistics'))
router.use('/lottery-report', require('./lottery-report'))
router.use('/lottery-user-analysis', require('./lottery-user-analysis'))
router.use('/lottery-campaign-analysis', require('./lottery-campaign-analysis'))
router.use('/lottery-strategy-stats', require('./lottery-strategy-stats'))
router.use('/lottery-health', require('./lottery-health'))

// ── 抽奖强控（原 lottery-management/）──
const lotteryMgmtRouter = express.Router()
lotteryMgmtRouter.use('/', require('./force-control'))
lotteryMgmtRouter.use('/', require('./adjustment'))
lotteryMgmtRouter.use('/', require('./user-status'))
lotteryMgmtRouter.use('/', require('./interventions'))
lotteryMgmtRouter.use('/', require('./draw-records'))
lotteryMgmtRouter.use('/', require('./pricing-config'))
router.use('/lottery-management', lotteryMgmtRouter)

module.exports = router
