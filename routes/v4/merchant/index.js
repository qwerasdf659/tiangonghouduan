/**
 * merchant域 - 商家业务域聚合
 *
 * 顶层路径：/api/v4/merchant
 * 内部目录：routes/v4/merchant/
 *
 * 职责：
 * - 商家扫码审核（奖励发放审核流程）
 * - 商家审核记录查询
 * - 审核统计和待处理列表
 *
 * 业务规则（2026-01-08 重构决策）：
 * - 提交审核：创建待审批记录，不冻结积分
 * - 审核通过：直接发放积分奖励 + 预算积分
 * - 审核拒绝：仅更新状态，不影响用户资产
 *
 * 创建时间：2025-12-29
 * 最后更新：2026-01-08（资产语义重构：冻结→奖励发放）
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
