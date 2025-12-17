/**
 * 餐厅积分抽奖系统 V4.2 - 背包双轨接口路由
 *
 * 业务场景：统一背包查询接口，返回可叠加资产和不可叠加物品
 *
 * 接口设计：
 * - GET /api/v4/backpack/user/:user_id - 获取用户背包（双轨数据）
 * - GET /api/v4/backpack/stats/:user_id - 获取背包统计信息
 *
 * 权限控制：
 * - 用户只能查看自己的背包
 * - 管理员可以查看任意用户的背包
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('BackpackAPI')

/**
 * 获取用户背包（双轨统一查询）
 * GET /api/v4/backpack/user/:user_id
 *
 * 业务场景：
 * - 用户查看自己的背包（资产 + 物品）
 * - 管理员查看指定用户的背包
 *
 * 返回数据结构：
 * {
 *   success: true,
 *   message: '获取背包成功',
 *   data: {
 *     assets: [      // 可叠加资产
 *       {
 *         asset_code: 'MATERIAL_001',
 *         display_name: '蓝色碎片',
 *         balance: 100,
 *         frozen_balance: 10,
 *         available_balance: 90,
 *         category: 'material',
 *         rarity: 'rare'
 *       }
 *     ],
 *     items: [       // 不可叠加物品
 *       {
 *         item_instance_id: 123,
 *         item_type: 'voucher',
 *         item_name: '优惠券',
 *         status: 'available',
 *         has_redemption_code: true,
 *         acquired_at: '2025-12-17T10:00:00+08:00'
 *       }
 *     ]
 *   }
 * }
 */
router.get(
  '/user/:user_id',
  authenticateToken,
  validatePositiveInteger('user_id', 'params'),
  async (req, res) => {
    try {
      const targetUserId = req.validated.user_id
      const viewerUserId = req.user.user_id

      logger.info('开始处理背包查询请求', {
        target_user_id: targetUserId,
        viewer_user_id: viewerUserId
      })

      // 权限检查：用户只能查看自己的背包（管理员除外）
      if (targetUserId !== viewerUserId) {
        // 检查查看者是否为管理员（统一使用getUserRoles，基于role_level判定）
        const { getUserRoles } = require('../../../middleware/auth')
        const userRoles = await getUserRoles(viewerUserId)

        // 管理员判定：role_level >= 100
        if (!userRoles.isAdmin) {
          logger.warn('非管理员尝试查看他人背包', {
            viewer_user_id: viewerUserId,
            target_user_id: targetUserId,
            role_level: userRoles.role_level
          })
          return res.apiError('无权查看其他用户的背包', 403)
        }

        logger.info('管理员查看用户背包', {
          admin_user_id: viewerUserId,
          target_user_id: targetUserId,
          role_level: userRoles.role_level
        })
      }

      // 调用 BackpackService 获取背包数据
      const BackpackService = req.app.locals.services.getService('backpack')
      const backpack = await BackpackService.getUserBackpack(targetUserId, {
        viewer_user_id: viewerUserId
      })

      logger.info('获取背包成功', {
        user_id: targetUserId,
        assets_count: backpack.assets.length,
        items_count: backpack.items.length
      })

      return res.apiSuccess(backpack, '获取背包成功')
    } catch (error) {
      logger.error('获取背包失败', {
        error: error.message,
        user_id: req.validated.user_id,
        viewer_user_id: req.user?.user_id
      })

      return handleServiceError(error, res, '获取背包失败')
    }
  }
)

/**
 * 获取背包统计信息
 * GET /api/v4/backpack/stats/:user_id
 *
 * 业务场景：
 * - 快速获取背包概览（不返回详细数据）
 * - 用于首页展示或快速统计
 *
 * 返回数据结构：
 * {
 *   success: true,
 *   message: '获取背包统计成功',
 *   data: {
 *     total_assets: 5,          // 资产种类数量
 *     total_items: 10,          // 物品数量
 *     total_asset_value: 1000   // 资产总价值
 *   }
 * }
 */
router.get(
  '/stats/:user_id',
  authenticateToken,
  validatePositiveInteger('user_id', 'params'),
  async (req, res) => {
    try {
      const targetUserId = req.validated.user_id
      const viewerUserId = req.user.user_id

      logger.info('开始处理背包统计请求', {
        target_user_id: targetUserId,
        viewer_user_id: viewerUserId
      })

      // 权限检查：用户只能查看自己的统计（管理员除外）
      if (targetUserId !== viewerUserId) {
        // 检查查看者是否为管理员（统一使用getUserRoles，基于role_level判定）
        const { getUserRoles } = require('../../../middleware/auth')
        const userRoles = await getUserRoles(viewerUserId)

        // 管理员判定：role_level >= 100
        if (!userRoles.isAdmin) {
          logger.warn('非管理员尝试查看他人背包统计', {
            viewer_user_id: viewerUserId,
            target_user_id: targetUserId,
            role_level: userRoles.role_level
          })
          return res.apiError('无权查看其他用户的背包统计', 403)
        }

        logger.info('管理员查看用户背包统计', {
          admin_user_id: viewerUserId,
          target_user_id: targetUserId,
          role_level: userRoles.role_level
        })
      }

      // 调用 BackpackService 获取统计信息
      const BackpackService = req.app.locals.services.getService('backpack')
      const stats = await BackpackService.getBackpackStats(targetUserId)

      logger.info('获取背包统计成功', {
        user_id: targetUserId,
        stats
      })

      return res.apiSuccess(stats, '获取背包统计成功')
    } catch (error) {
      logger.error('获取背包统计失败', {
        error: error.message,
        user_id: req.validated.user_id,
        viewer_user_id: req.user?.user_id
      })

      return handleServiceError(error, res, '获取背包统计失败')
    }
  }
)

module.exports = router
