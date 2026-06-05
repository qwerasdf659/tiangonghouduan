/**
 * 风控/治理域路由聚合入口
 *
 * @description 风控告警、用户风控配置、告警静默、消费异常、对账
 * @route /api/v4/console/risk-*  /api/v4/console/alert-silence-rules  ...
 */
const express = require('express')
const router = express.Router()

router.use('/risk-alerts', require('./risk-alerts'))
router.use('/risk-profiles', require('./risk-profiles'))
router.use('/alert-silence-rules', require('./alert-silence'))
// 注：orphan-frozen（孤儿冻结清理）已随 C2C 下线删除（2026-06-05 阶段五，仅扫描 C2C market_listings 冻结）
router.use('/consumption-anomaly', require('./consumption-anomaly'))
router.use('/reconciliation', require('./reconciliation'))

module.exports = router
