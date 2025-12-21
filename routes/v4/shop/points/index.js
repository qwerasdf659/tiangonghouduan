/**
 * 积分管理模块 - 聚合入口
 *
 * @route /api/v4/shop/points
 * @description 积分相关业务的统一入口，按功能拆分为多个子模块
 *
 * 子模块划分（按业务职责）：
 * - balance.js     - 积分余额查询（GET /balance, GET /balance/:user_id, GET /overview, GET /frozen）
 * - transactions.js - 交易记录管理（GET /transactions, DELETE, POST restore, GET restore-audit, GET /trend）
 * - statistics.js  - 统计分析（GET /admin/statistics, GET /user/statistics/:user_id）
 * - admin.js       - 管理员专用操作（POST /admin/adjust）
 *
 * 架构规范：
 * - 符合技术架构标准TR-005：路由文件150-250行正常，>300行必须拆分
 * - 统一使用 res.apiSuccess / res.apiError 响应
 * - 通过 ServiceManager 获取 PointsService
 *
 * 创建时间：2025年12月22日
 * 拆分原因：原points.js文件1024行，超标3.4倍
 */

const express = require('express')
const router = express.Router()

// 导入子模块
const balanceRoutes = require('./balance')
const transactionsRoutes = require('./transactions')
const statisticsRoutes = require('./statistics')
const adminRoutes = require('./admin')

// 挂载子路由
router.use('/', balanceRoutes) // 余额相关（不带前缀，直接挂载到 /points 下）
router.use('/', transactionsRoutes) // 交易记录相关
router.use('/', statisticsRoutes) // 统计相关
router.use('/admin', adminRoutes) // 管理员专用（挂载到 /points/admin）

module.exports = router
