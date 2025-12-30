/**
 * merchant域 - 商家业务域聚合
 *
 * 顶层路径：/api/v4/merchant
 * 内部目录：routes/v4/merchant/
 *
 * 职责：
 * - 商家扫码审核（冻结积分审核流程）
 * - 商家审核记录查询
 * - 客服处理冻结积分
 *
 * 业务规则（拍板决策）：
 * - 只要没审核通过就不可以增加到可用积分中
 * - 冻结会无限期存在，接受用户资产长期不可用
 * - 审核拒绝/超时：积分不退回，需客服手工处理
 *
 * 创建时间：2025-12-29
 * 使用模型：Claude Opus 4.5
 */

'use strict'

const express = require('express')
const router = express.Router()

// 商家审核路由
const reviewsRoutes = require('./reviews')

// 挂载路由
router.use('/reviews', reviewsRoutes)

module.exports = router
