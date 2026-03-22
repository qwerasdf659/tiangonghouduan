/**
 * 运营配置域路由聚合入口
 *
 * @description 数据管理、字典、品类、物品模板/管理/全链路、属性、功能开关、批量操作、媒体、存储、材料、导航、提醒
 * @route /api/v4/console/data-management  /api/v4/console/dictionaries  /api/v4/console/categories  ...
 */
const express = require('express')
const router = express.Router()

router.use('/data-management', require('./data-management'))
router.use('/dictionaries', require('./dictionaries'))
router.use('/categories', require('./categories'))
router.use('/attributes', require('./attributes'))
router.use('/item-templates', require('./item-templates'))
router.use('/items', require('./items'))
router.use('/item-lifecycle', require('./item-lifecycle'))
router.use('/feature-flags', require('./feature-flags'))
router.use('/batch-operations', require('./batch-operations'))
router.use('/media', require('./media'))
router.use('/storage', require('./storage'))
router.use('/material', require('./material'))
router.use('/nav', require('./nav'))
router.use('/reminder-rules', require('./reminder-rules'))
router.use('/reminder-history', require('./reminder-history'))

module.exports = router
