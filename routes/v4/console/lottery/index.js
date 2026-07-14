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
router.use('/prize-definitions', require('./prize-definitions'))
// 水晶奖品倍率规则（/multiplier-rules + /ad-tags，D-13 扁平命名，文件内自带完整前缀）
router.use('/', require('./multiplier-rules'))
// 活动预算归集规则（限时翻倍活动消费预算重定向 + event_points 发放，§12.10）
router.use('/event-budget-collection-rules', require('./event-budget-collection-rules'))
// 消费加成活动规则（多活动独立倍率，全平台+商家专属并存，方案C 2026-07-15）
router.use('/consumption-bonus-rules', require('./consumption-bonus-rules'))

// ── 抽奖监控与分析 ──
router.use('/lottery-realtime', require('./lottery-realtime'))
router.use('/lottery-statistics', require('./lottery-statistics'))
router.use('/lottery-report', require('./lottery-report'))
router.use('/lottery-user-analysis', require('./lottery-user-analysis'))
router.use('/lottery-campaign-analysis', require('./lottery-campaign-analysis'))
router.use('/lottery-strategy-stats', require('./lottery-strategy-stats'))
router.use('/lottery-health', require('./lottery-health'))

/*
 * ── 抽奖强控（原 lottery-management/）──
 * 2026-06-04 合规改造：per-user 暗箱干预（force_win/force_lose/probability_adjust/user_queue）整体下线
 * 保留：draw-records（抽奖流水只读）、pricing-config（定价配置）；新增：level-probability（按成长等级公示分级概率）
 */
const lotteryMgmtRouter = express.Router()
lotteryMgmtRouter.use('/', require('./draw-records'))
lotteryMgmtRouter.use('/', require('./pricing-config'))
lotteryMgmtRouter.use('/', require('./level-probability'))
router.use('/lottery-management', lotteryMgmtRouter)

module.exports = router
