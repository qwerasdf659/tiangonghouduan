/**
 * 风控/治理域路由聚合入口
 *
 * @description 风控告警、用户风控配置、告警静默、孤儿冻结、消费异常、对账
 * @route /api/v4/console/risk-*  /api/v4/console/alert-silence-rules  /api/v4/console/orphan-frozen  ...
 */
const express = require('express')
const router = express.Router()

router.use('/risk-alerts', require('./risk-alerts'))
router.use('/risk-profiles', require('./risk-profiles'))
router.use('/alert-silence-rules', require('./alert-silence'))
router.use('/orphan-frozen', require('./orphan-frozen'))
router.use('/consumption-anomaly', require('./consumption-anomaly'))
router.use('/reconciliation', require('./reconciliation'))

module.exports = router
