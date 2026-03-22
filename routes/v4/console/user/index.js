/**
 * 用户域路由聚合入口
 *
 * @description 用户管理、分层分析、行为轨迹、高级空间、比例覆盖、分群策略
 * @route /api/v4/console/user-*  /api/v4/console/users  /api/v4/console/segment-rules
 */
const express = require('express')
const router = express.Router()

router.use('/user-management', require('./user_management'))
router.use('/users', require('./user-segments'))
router.use('/user-hierarchy', require('./user-hierarchy'))
router.use('/user-premium', require('./user-premium'))
router.use('/user-data-query', require('./user-data-query'))
router.use('/user-behavior-tracks', require('./user-behavior-tracks'))
router.use('/user-ratio-overrides', require('./user-ratio-overrides'))
router.use('/segment-rules', require('./segment-rules'))

module.exports = router
