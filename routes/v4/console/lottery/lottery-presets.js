/**
 * 🎯 抽奖预设管理路由 - API覆盖率补齐
 * 创建时间：2026年01月21日 北京时间
 *
 * 业务职责：
 * - 提供lottery_presets表的完整CRUD API
 * - 支持为用户创建抽奖预设队列
 * - 支持预设统计和查询
 *
 * 访问控制：
 * - 所有接口需要管理员权限（requireRoleLevel(100)）
 *
 * API端点：
 * - GET    /                           - 获取预设列表（分页）
 * - GET    /stats                      - 获取预设统计数据
 * - GET    /user/:user_id              - 获取用户的预设列表
 * - GET    /:id                        - 获取预设详情
 * - POST   /                           - 为用户创建预设队列
 * - DELETE /user/:user_id              - 清理用户的所有预设
 * - DELETE /:id                        - 删除单个预设
 */

'use strict'

const express = require('express')
const router = express.Router()

const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger
const { asyncHandler } = require('../shared/middleware')
const { handleServiceError } = require('../../../../middleware/validation')

/**
 * 通过 ServiceManager 获取 LotteryPresetService
 *
 * @param {Object} req - Express请求对象
 * @returns {Object} LotteryPresetService类（使用静态方法）
 */
const getLotteryPresetService = req => {
  return req.app.locals.services.getService('lottery_preset')
}

/**
 * 中间件：认证 + 管理员权限
 */
router.use(authenticateToken, requireRoleLevel(100))

/**
 * GET / - 获取预设列表（分页）
 *
 * 查询参数：
 * - user_id: number - 用户ID（可选）
 * - status: string - 状态（可选：pending/used）
 * - approval_status: string - 审批状态（可选：pending_approval/approved/rejected）
 * - page: number - 页码（默认1）
 * - page_size: number - 每页数量（默认20）
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { user_id, status, approval_status, page = 1, page_size = 20 } = req.query

    const result = await getLotteryPresetService(req).listPresetsWithPagination({
      user_id: user_id ? parseInt(user_id, 10) : null,
      status,
      approval_status,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10)
    })

    logger.info('[GET /] 查询预设列表', {
      admin_id: req.user.user_id,
      params: req.query,
      total: result.total
    })

    return res.apiSuccess(result, '获取预设列表成功')
  })
)

/**
 * GET /stats - 获取预设统计数据
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const stats = await getLotteryPresetService(req).getPresetStats()

    logger.info('[GET /stats] 获取预设统计', {
      admin_id: req.user.user_id
    })

    return res.apiSuccess(stats, '获取预设统计成功')
  })
)

/**
 * GET /user/:user_id - 获取用户的预设列表
 *
 * 路径参数：
 * - user_id: number - 用户ID
 *
 * 查询参数：
 * - status: string - 状态筛选（可选：pending/used/all，默认all）
 */
router.get(
  '/user/:user_id',
  asyncHandler(async (req, res) => {
    const { user_id } = req.params
    const { status = 'all' } = req.query

    const result = await getLotteryPresetService(req).getUserPresets(
      req.user.user_id,
      parseInt(user_id, 10),
      status
    )

    logger.info('[GET /user/:user_id] 获取用户预设', {
      admin_id: req.user.user_id,
      target_user_id: user_id,
      status,
      presets_count: result.presets.length
    })

    return res.apiSuccess(result, '获取用户预设成功')
  })
)

/**
 * GET /:id - 获取预设详情
 *
 * 路径参数：
 * - id: string - 预设ID
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const LotteryPresetService = getLotteryPresetService(req)

    const preset = await LotteryPresetService.getPresetById(parseInt(id, 10))

    if (!preset) {
      return res.apiError('预设不存在', 'PRESET_NOT_FOUND', null, 404)
    }

    logger.info('[GET /:id] 获取预设详情', {
      admin_id: req.user.user_id,
      lottery_preset_id: id
    })

    return res.apiSuccess(preset, '获取预设详情成功')
  })
)

/**
 * POST / - 为用户创建预设队列
 *
 * 请求体：
 * - user_id: number - 目标用户ID（必填）
 * - presets: array - 预设数组（必填）
 *   - lottery_prize_id: number - 奖品ID
 *   - queue_order: number - 队列顺序
 * - lottery_campaign_id: number - 活动ID（可选）
 * - reason: string - 创建原因（可选）
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { user_id, presets, lottery_campaign_id, reason } = req.body

    // 验证必填字段
    if (!user_id) {
      return res.apiError('用户ID（user_id）不能为空', 'INVALID_PARAMS', null, 400)
    }
    if (!presets || !Array.isArray(presets) || presets.length === 0) {
      return res.apiError('预设数组（presets）不能为空', 'INVALID_PARAMS', null, 400)
    }

    try {
      // 添加额外字段
      const presetsWithMeta = presets.map(preset => ({
        ...preset,
        lottery_campaign_id,
        reason
      }))

      const result = await getLotteryPresetService(req).createPresets(
        req.user.user_id,
        parseInt(user_id, 10),
        presetsWithMeta
      )

      logger.info('[POST /] 创建预设队列', {
        admin_id: req.user.user_id,
        target_user_id: user_id,
        presets_count: result.length
      })

      return res.apiSuccess(
        {
          presets: result,
          total: result.length
        },
        '创建预设队列成功'
      )
    } catch (error) {
      logger.error('[POST /] 创建预设队列失败', {
        admin_id: req.user.user_id,
        error: error.message
      })
      return handleServiceError(res, error)
    }
  })
)

/**
 * DELETE /user/:user_id - 清理用户的所有预设
 *
 * 路径参数：
 * - user_id: number - 用户ID
 */
router.delete(
  '/user/:user_id',
  asyncHandler(async (req, res) => {
    const { user_id } = req.params

    try {
      const result = await TransactionManager.executeInTransaction(async transaction => {
        return await getLotteryPresetService(req).clearUserPresets(
          req.user.user_id,
          parseInt(user_id, 10),
          { transaction }
        )
      })

      logger.info('[DELETE /user/:user_id] 清理用户预设', {
        admin_id: req.user.user_id,
        target_user_id: user_id,
        deleted_count: result.deletedCount
      })

      return res.apiSuccess(
        {
          user_id: parseInt(user_id, 10),
          deleted_count: result.deletedCount
        },
        '清理用户预设成功'
      )
    } catch (error) {
      logger.error('[DELETE /user/:user_id] 清理用户预设失败', {
        admin_id: req.user.user_id,
        user_id,
        error: error.message
      })
      return handleServiceError(res, error)
    }
  })
)

/**
 * PUT /:id - 更新单个预设
 *
 * 路径参数：
 * - id: number - 预设ID
 *
 * 请求体（可选字段）：
 * - lottery_prize_id: number - 新奖品ID
 * - queue_order: number - 新队列顺序
 * - expires_at: string - 新过期时间（ISO格式）
 * - reason: string - 更新原因
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const updateData = req.body
    const LotteryPresetService = getLotteryPresetService(req)

    try {
      const result = await TransactionManager.executeInTransaction(async transaction => {
        return await LotteryPresetService.updatePreset(parseInt(id, 10), updateData, {
          transaction
        })
      })

      logger.info('[PUT /:id] 更新预设', {
        admin_id: req.user.user_id,
        lottery_preset_id: id,
        updated_fields: Object.keys(updateData)
      })

      return res.apiSuccess(result, '更新预设成功')
    } catch (error) {
      logger.error('[PUT /:id] 更新预设失败', {
        admin_id: req.user.user_id,
        lottery_preset_id: id,
        error: error.message
      })
      return handleServiceError(res, error)
    }
  })
)

/**
 * DELETE /:id - 删除单个预设
 *
 * 路径参数：
 * - id: string - 预设ID
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const LotteryPresetService = getLotteryPresetService(req)

    try {
      const result = await TransactionManager.executeInTransaction(async transaction => {
        return await LotteryPresetService.deletePreset(parseInt(id, 10), { transaction })
      })

      logger.info('[DELETE /:id] 删除预设', {
        admin_id: req.user.user_id,
        lottery_preset_id: id
      })

      return res.apiSuccess(result, '删除预设成功')
    } catch (error) {
      logger.error('[DELETE /:id] 删除预设失败', {
        admin_id: req.user.user_id,
        lottery_preset_id: id,
        error: error.message
      })
      return handleServiceError(res, error)
    }
  })
)

module.exports = router
