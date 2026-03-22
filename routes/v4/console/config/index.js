/**
 * 平台配置/审计域路由聚合入口
 *
 * @description 认证、配置、系统设置、会话、审批链、审计日志、资产调整、平台钻石
 * @route /api/v4/console/auth  /api/v4/console/config  /api/v4/console/settings  ...
 */
const express = require('express')
const router = express.Router()

router.use('/auth', require('./auth'))
router.use('/config', require('./config'))
router.use(require('./settings'))
router.use('/sessions', require('./sessions'))
router.use('/approval-chain', require('./approval-chain'))
router.use('/audit-logs', require('./audit-logs'))
router.use('/admin-audit-logs', require('./admin-audit-logs'))
router.use('/audit-rollback', require('./audit-rollback'))
router.use('/asset-adjustment', require('./asset-adjustment'))
router.use('/platform-diamond', require('./platform-diamond'))

module.exports = router
