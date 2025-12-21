/**
 * lottery域 - 抽奖系统业务域聚合
 *
 * 顶层路径：/api/v4/lottery
 * 内部目录：routes/v4/lottery/
 *
 * 职责：
 * - 用户执行抽奖
 * - 查询抽奖历史
 * - 抽奖预设管理（管理员功能，但挂载在lottery域下）
 *
 * 📌 遵循规范：
 * - 用户端禁止/:id参数（查询他人预设已迁移到/admin域）
 * - 管理员操作用户预设：/api/v4/admin/users/:id/lottery-presets
 *
 * 创建时间：2025年01月21日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 抽奖核心路由（执行抽奖、查询历史）
const lotteryRoutes = require('./lottery')

// 抽奖预设管理路由（创建预设、查询列表等，不含/user/:id）
const lotteryPresetRoutes = require('./lottery-preset')

// 挂载路由
router.use('/', lotteryRoutes)
router.use('/preset', lotteryPresetRoutes)

module.exports = router
