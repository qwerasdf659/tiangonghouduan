/**
 * 消费记录管理模块 - 聚合入口
 *
 * @route /api/v4/shop/consumption
 * @description 消费记录相关业务的统一入口，按功能拆分为多个子模块
 *
 * 子模块划分（按业务职责）：
 * - submit.js  - 商家提交消费记录（POST /submit）
 * - query.js   - 查询消费记录（GET /me, GET /detail/:record_id, DELETE, POST restore）
 * - review.js  - 管理员审核（GET /pending, GET /admin/records, POST /approve, POST /reject）
 * - qrcode.js  - 二维码相关（GET /qrcode/:user_id, GET /user-info）
 *
 * 架构规范：
 * - 符合技术架构标准TR-005：路由文件150-250行正常，>300行必须拆分
 * - 统一使用 res.apiSuccess / res.apiError 响应
 * - 通过 ServiceManager 获取 ConsumptionService
 *
 * 创建时间：2025年12月22日
 * 拆分原因：原consumption.js文件851行，超标2.8倍
 */

const express = require('express')
const router = express.Router()

// 导入子模块
const submitRoutes = require('./submit')
const queryRoutes = require('./query')
const reviewRoutes = require('./review')
const qrcodeRoutes = require('./qrcode')

// 挂载子路由
router.use('/', submitRoutes) // 商家提交消费记录
router.use('/', queryRoutes) // 查询消费记录
router.use('/', reviewRoutes) // 管理员审核
router.use('/', qrcodeRoutes) // 二维码相关

module.exports = router
