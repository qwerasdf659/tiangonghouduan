/**
 * 消费记录管理模块 - 聚合入口（商家域）
 *
 * @route /api/v4/shop/consumption
 * @description 消费记录相关业务的统一入口，按功能拆分为多个子模块
 *
 * 📌 域边界说明：
 * - 此模块属于 shop 域，仅限 merchant_staff/merchant_manager 访问
 * - 商家员工只能提交消费记录和查询自己/本店的记录
 * - 审核功能位于 /api/v4/console/consumption（仅限 admin）
 *
 * 子模块划分（按业务职责）：
 * - submit.js  - 商家提交消费记录（POST /submit）
 * - query.js   - 用户查询自己的消费记录（GET /me, GET /detail/:id）
 * - qrcode.js  - 二维码相关（GET /qrcode, GET /user-info）
 * - merchant-query.js - 商家员工查询消费记录（GET /merchant/list, GET /merchant/detail/:id）
 *
 * 架构规范：
 * - 符合技术架构标准TR-005：路由文件150-250行正常，>300行必须拆分
 * - 统一使用 res.apiSuccess / res.apiError 响应
 * - 通过 ServiceManager 获取 ConsumptionService
 *
 */

const express = require('express')
const router = express.Router()

// 导入子模块
const submitRoutes = require('./submit')
const queryRoutes = require('./query')
const qrcodeRoutes = require('./qrcode')
const merchantQueryRoutes = require('./merchant-query')

// 挂载子路由
router.use('/', submitRoutes) // 商家提交消费记录
router.use('/', queryRoutes) // 用户查询自己的消费记录
router.use('/', qrcodeRoutes) // 二维码相关
router.use('/merchant', merchantQueryRoutes) // 商家员工查询消费记录（店员/店长）

module.exports = router
