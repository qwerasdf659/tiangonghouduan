/**
 * 商户域路由聚合入口
 *
 * @description 商家管理、门店、员工、行政区划、积分审核、欠账、消费审核
 * @route /api/v4/console/merchants  /api/v4/console/stores  /api/v4/console/staff  /api/v4/console/regions  ...
 */
const express = require('express')
const router = express.Router()

router.use('/merchants', require('./merchants'))
router.use('/stores', require('./stores'))
router.use('/staff', require('./staff'))
router.use('/regions', require('./regions'))
router.use('/merchant-points', require('./merchant-points'))
router.use('/debt-management', require('./debt-management'))
router.use('/consumption', require('./consumption'))

module.exports = router
