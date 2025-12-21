/**
 * 餐厅积分抽奖系统 V4.0 - 抽奖系统业务域聚合
 *
 * 顶层路径：/api/v4/lottery
 * 内部目录：routes/v4/lottery/
 *
 * 职责：
 * - 奖品和配置查询（prizes.js）
 * - 抽奖执行（draw.js）
 * - 抽奖历史和活动查询（history.js）
 * - 用户积分和统计（user-points.js）
 * - 抽奖预设管理（lottery-preset.js）
 *
 * 📌 遵循规范：
 * - Controller拆分规范：每个子模块 150-250行
 * - 用户端禁止/:id参数（查询他人预设已迁移到/admin域）
 * - 管理员操作用户预设：/api/v4/admin/users/:id/lottery-presets
 *
 * 创建时间：2025年01月21日
 * 更新时间：2025年12月22日（拆分lottery.js为子模块）
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 🔄 抽奖核心功能路由（已拆分为子模块）
const prizesRoutes = require('./prizes') // 奖品和配置
const drawRoutes = require('./draw') // 抽奖执行
const historyRoutes = require('./history') // 抽奖历史和活动
const userPointsRoutes = require('./user-points') // 用户积分和统计

// 抽奖预设管理路由（创建预设、查询列表等，不含/user/:id）
const lotteryPresetRoutes = require('./lottery-preset')

// 挂载奖品和配置路由
router.use('/', prizesRoutes)

// 挂载抽奖执行路由
router.use('/', drawRoutes)

// 挂载抽奖历史和活动路由
router.use('/', historyRoutes)

// 挂载用户积分和统计路由
router.use('/', userPointsRoutes)

// 挂载抽奖预设管理路由
router.use('/preset', lotteryPresetRoutes)

module.exports = router
