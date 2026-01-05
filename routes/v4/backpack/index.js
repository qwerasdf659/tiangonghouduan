/**
 * 背包查询路由
 *
 * 顶层路径：/api/v4/backpack
 *
 * 职责：
 * - 查询用户背包（双轨架构：assets[] + items[]）
 *
 * 架构原则：
 * - 路由层不直连 models（通过 ServiceManager 获取 BackpackService）
 * - 路由层不开启事务（事务管理在 Service 层）
 *
 * 创建时间：2025-12-29
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')

/**
 * 错误处理包装器
 *
 * @param {Function} fn - 异步处理函数
 * @returns {Function} 包装后的中间件函数
 */
function asyncHandler (fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * GET /api/v4/backpack
 *
 * @description 查询用户背包（资产 + 物品）
 * @access Private
 *
 * 返回数据结构：
 * {
 *   assets: [      // 可叠加资产
 *     {
 *       asset_code: 'MATERIAL_001',
 *       display_name: '蓝色碎片',
 *       balance: 100,
 *       frozen_balance: 10,
 *       available_balance: 90
 *     }
 *   ],
 *   items: [       // 不可叠加物品
 *     {
 *       item_instance_id: 123,
 *       item_type: '优惠券',
 *       status: 'available',
 *       has_redemption_code: true,
 *       acquired_at: '2025-12-17T10:00:00+08:00'
 *     }
 *   ]
 * }
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user_id = req.user.user_id

    // 通过 ServiceManager 获取 BackpackService
    const BackpackService = req.app.locals.services.getService('backpack')

    const backpack = await BackpackService.getUserBackpack(user_id)

    return res.apiSuccess(backpack)
  })
)

/**
 * GET /api/v4/backpack/stats
 *
 * @description 查询用户背包统计信息
 * @access Private
 */
router.get(
  '/stats',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user_id = req.user.user_id

    // 通过 ServiceManager 获取 BackpackService
    const BackpackService = req.app.locals.services.getService('backpack')

    const stats = await BackpackService.getBackpackStats(user_id)

    return res.apiSuccess(stats)
  })
)

module.exports = router
