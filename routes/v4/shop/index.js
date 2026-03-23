'use strict'

const router = require('express').Router()

const redemptionRoutes = require('./redemption/index')
const consumptionRoutes = require('./consumption/index')
const assetsRoutes = require('./assets/index')
const staffRoutes = require('./staff/index')
const auditRoutes = require('./audit/index')
const riskRoutes = require('./risk/index')

router.use('/redemption', redemptionRoutes)
router.use('/consumption', consumptionRoutes)
router.use('/assets', assetsRoutes)
router.use('/staff', staffRoutes)
router.use('/audit', auditRoutes)
router.use('/risk', riskRoutes)
module.exports = router
