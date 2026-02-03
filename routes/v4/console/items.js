/**
 * 物品监控模块（Items Monitoring）
 *
 * @route /api/v4/console/items
 * @description 物品相关监控接口，提供锁定率、库存状态等监控数据
 *
 * 📌 模块说明：
 * - 此模块属于 console 域，仅限 admin（role_level >= 100）访问
 * - 提供物品锁定率监控、库存健康状态等数据
 *
 * API列表：
 * - GET /lock-rate - 物品锁定率监控
 *
 * 创建时间：2026年02月03日
 * 关联文档：后端需求文档_运营后台优化.md（§5.4）
 *
 * @module routes/v4/console/items
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger

/**
 * @route GET /api/v4/console/items/lock-rate
 * @desc 获取物品锁定率监控数据
 * @access Private (管理员，role_level >= 100)
 *
 * @query {number} [hours=24] - 统计小时数（默认24小时）
 * @query {string} [item_type] - 筛选物品类型（可选）
 *
 * @returns {Object} 锁定率监控数据
 * @returns {Object} data.summary - 汇总数据（总锁定数、锁定率、平均锁定时长）
 * @returns {Array} data.by_type - 按物品类型分组的锁定率
 * @returns {Array} data.time_series - 时间序列趋势
 * @returns {Array} data.alerts - 告警信息（锁定率过高时触发）
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/items/lock-rate?hours=24
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "summary": {
 *       "total_items": 5000,
 *       "locked_items": 250,
 *       "lock_rate": 0.05,
 *       "avg_lock_duration_minutes": 30,
 *       "max_lock_duration_minutes": 180
 *     },
 *     "by_type": [
 *       { "item_type": "prize", "item_type_name": "奖品", "total": 2000, "locked": 100, "lock_rate": 0.05 },
 *       { "item_type": "coupon", "item_type_name": "优惠券", "total": 3000, "locked": 150, "lock_rate": 0.05 }
 *     ],
 *     "time_series": [
 *       { "hour": "2026-02-03 14:00", "locked_count": 45, "lock_rate": 0.048 }
 *     ],
 *     "alerts": [
 *       { "level": "warning", "message": "优惠券锁定率偏高", "lock_rate": 0.15 }
 *     ],
 *     "updated_at": "2026-02-03T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 *
 * 关联需求：§5.4.1 锁定率监控接口
 */
router.get('/lock-rate', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { hours = 24, item_type } = req.query

    logger.info('[物品监控] 获取锁定率数据', {
      admin_id: req.user.user_id,
      hours: parseInt(hours),
      item_type
    })

    // 🔄 通过 ServiceManager 获取 ItemLockRateService
    const ItemLockRateService = req.app.locals.services.getService('item_lock_rate')
    const result = await ItemLockRateService.getLockRateStats({
      hours: parseInt(hours) || 24,
      item_type: item_type || null
    })

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    logger.error('[物品监控] 获取锁定率失败', { error: error.message })
    return handleServiceError(error, res, '获取锁定率失败')
  }
})

module.exports = router
