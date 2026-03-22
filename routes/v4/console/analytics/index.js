/**
 * 数据分析域路由聚合入口
 *
 * @description 数据分析、运营看板、多维统计、报表模板、业务记录、系统数据、预算、待处理
 * @route /api/v4/console/analytics  /api/v4/console/dashboard  /api/v4/console/statistics  ...
 */
const express = require('express')
const router = express.Router()

router.use('/analytics', require('./analytics'))
router.use('/dashboard', require('./dashboard'))
router.use('/statistics', require('./multi-dimension-stats'))
router.use('/report-templates', require('./report-templates'))
router.use('/business-records', require('./business-records'))
router.use('/system-data', require('./system-data'))
router.use('/campaign-budget', require('./campaign-budget'))
router.use('/pending', require('./pending'))

module.exports = router
