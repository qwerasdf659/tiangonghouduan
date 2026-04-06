'use strict'

const router = require('express').Router()

const redemptionRoutes = require('./redemption/index')
const consumptionRoutes = require('./consumption/index')
const staffRoutes = require('./staff/index')
const auditRoutes = require('./audit/index')
const riskRoutes = require('./risk/index')

router.use('/redemption', redemptionRoutes)
router.use('/consumption', consumptionRoutes)
// ⚠️ shop/assets 路由已合并到 /api/v4/assets/conversion（2026-04-05）
router.use('/staff', staffRoutes)
router.use('/audit', auditRoutes)
router.use('/risk', riskRoutes)
module.exports = router
