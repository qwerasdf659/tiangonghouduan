/**
 * 广告域路由聚合入口
 *
 * @description 广告活动、广告位、定价、报表、地域定向管理
 * @route /api/v4/console/ad-*  /api/v4/console/zone-management
 */
const express = require('express')
const router = express.Router()

router.use('/ad-campaigns', require('./ad-campaigns'))
router.use('/ad-slots', require('./ad-slots'))
router.use('/ad-pricing', require('./ad-pricing'))
router.use('/ad-reports', require('./ad-reports'))
router.use('/zone-management', require('./zone-management'))

module.exports = router
