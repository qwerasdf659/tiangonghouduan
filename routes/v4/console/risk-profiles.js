/**
 * @file 用户风控配置管理路由（Risk Profiles Routes）
 * @description 管理用户风控配置表的RESTful API
 *
 * API端点：
 * - GET    /api/v4/console/risk-profiles               获取配置列表
 * - GET    /api/v4/console/risk-profiles/levels        获取等级默认配置
 * - GET    /api/v4/console/risk-profiles/frozen        获取冻结用户列表
 * - GET    /api/v4/console/risk-profiles/:id           获取配置详情
 * - GET    /api/v4/console/risk-profiles/user/:user_id 获取用户有效配置
 * - GET    /api/v4/console/risk-profiles/user/:user_id/frozen  检查用户冻结状态
 * - POST   /api/v4/console/risk-profiles/levels        创建等级默认配置
 * - POST   /api/v4/console/risk-profiles/user/:user_id 创建/更新用户配置
 * - PUT    /api/v4/console/risk-profiles/:id           更新配置
 * - DELETE /api/v4/console/risk-profiles/:id           删除配置
 * - POST   /api/v4/console/risk-profiles/user/:user_id/freeze   冻结用户
 * - POST   /api/v4/console/risk-profiles/user/:user_id/unfreeze 解冻用户
 *
 * 权限：仅管理员（requireAdmin）
 * 路径设计：事务实体使用 :id（自增主键），用户相关使用 :user_id
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * 获取 UserRiskProfileService 实例
 *
 * @param {Object} req - Express 请求对象
 * @returns {UserRiskProfileService} 服务实例
 */
function getRiskProfileService(req) {
  return req.app.locals.services.getService('user_risk_profile')
}

/**
 * GET / - 获取风控配置列表
 *
 * 查询参数：
 * - config_type: 配置类型（user/level）
 * - user_level: 用户等级筛选
 * - is_frozen: 是否冻结（true/false）
 * - user_id: 用户ID筛选
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const { config_type, user_level, is_frozen, user_id, page, page_size } = req.query

    const result = await service.getRiskProfiles({
      config_type,
      user_level,
      is_frozen: is_frozen === 'true' ? true : is_frozen === 'false' ? false : undefined,
      user_id: user_id ? parseInt(user_id) : undefined,
      page: parseInt(page) || 1,
      page_size: parseInt(page_size) || 20
    })

    return res.apiSuccess(result, '获取风控配置列表成功')
  } catch (error) {
    logger.error('获取风控配置列表失败:', error)
    return res.apiError(
      `获取风控配置列表失败: ${error.message}`,
      error.code || 'RISK_PROFILE_LIST_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * GET /levels - 获取等级默认配置列表
 */
router.get('/levels', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const configs = await service.getLevelConfigs()

    return res.apiSuccess(
      {
        list: configs,
        user_levels: {
          normal: '普通用户',
          vip: 'VIP用户',
          merchant: '商户'
        }
      },
      '获取等级默认配置成功'
    )
  } catch (error) {
    logger.error('获取等级默认配置失败:', error)
    return res.apiError(`获取等级默认配置失败: ${error.message}`, 'LEVEL_CONFIGS_FAILED', null, 500)
  }
})

/**
 * GET /frozen - 获取冻结用户列表
 */
router.get('/frozen', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const { page, page_size } = req.query

    const result = await service.getFrozenUsers({
      page: parseInt(page) || 1,
      page_size: parseInt(page_size) || 20
    })

    return res.apiSuccess(result, '获取冻结用户列表成功')
  } catch (error) {
    logger.error('获取冻结用户列表失败:', error)
    return res.apiError(`获取冻结用户列表失败: ${error.message}`, 'FROZEN_USERS_FAILED', null, 500)
  }
})

/**
 * GET /user/:user_id - 获取用户有效风控配置
 */
router.get('/user/:user_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const { user_id } = req.params
    const { user_level } = req.query

    const result = await service.getEffectiveConfig(parseInt(user_id), user_level || 'normal')

    return res.apiSuccess(result, '获取用户有效风控配置成功')
  } catch (error) {
    logger.error(`获取用户[${req.params.user_id}]有效配置失败:`, error)
    return res.apiError(
      `获取用户有效配置失败: ${error.message}`,
      error.code || 'EFFECTIVE_CONFIG_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * GET /user/:user_id/frozen - 检查用户冻结状态
 */
router.get('/user/:user_id/frozen', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const { user_id } = req.params

    const result = await service.checkFrozenStatus(parseInt(user_id))

    return res.apiSuccess(result, '检查用户冻结状态成功')
  } catch (error) {
    logger.error(`检查用户[${req.params.user_id}]冻结状态失败:`, error)
    return res.apiError(
      `检查用户冻结状态失败: ${error.message}`,
      'FROZEN_STATUS_CHECK_FAILED',
      null,
      500
    )
  }
})

/**
 * GET /:id - 获取配置详情
 */
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const { id } = req.params
    const result = await service.getRiskProfileById(parseInt(id))

    return res.apiSuccess(result, '获取风控配置详情成功')
  } catch (error) {
    logger.error(`获取风控配置详情[${req.params.id}]失败:`, error)
    return res.apiError(
      `获取风控配置详情失败: ${error.message}`,
      error.code || 'RISK_PROFILE_DETAIL_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * POST /levels - 创建等级默认配置
 *
 * 请求体：
 * - user_level: 用户等级（normal/vip/merchant，必填）
 * - thresholds: 风控阈值配置
 * - remarks: 备注
 */
router.post('/levels', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const admin_id = req.user.user_id

    const result = await TransactionManager.execute(async transaction => {
      return await service.createLevelConfig(req.body, admin_id, { transaction })
    })

    return res.apiSuccess(result, '创建等级默认配置成功')
  } catch (error) {
    logger.error('创建等级默认配置失败:', error)
    return res.apiError(
      `创建等级默认配置失败: ${error.message}`,
      error.code || 'LEVEL_CONFIG_CREATE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * POST /user/:user_id - 创建/更新用户个人配置
 *
 * 请求体：
 * - thresholds: 风控阈值配置
 * - remarks: 备注
 */
router.post('/user/:user_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const { user_id } = req.params
    const admin_id = req.user.user_id

    const result = await TransactionManager.execute(async transaction => {
      return await service.upsertUserConfig(parseInt(user_id), req.body, admin_id, { transaction })
    })

    return res.apiSuccess(result, '创建/更新用户风控配置成功')
  } catch (error) {
    logger.error(`创建/更新用户[${req.params.user_id}]配置失败:`, error)
    return res.apiError(
      `创建/更新用户配置失败: ${error.message}`,
      error.code || 'USER_CONFIG_UPSERT_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * PUT /:id - 更新风控配置
 *
 * 请求体：
 * - thresholds: 风控阈值配置
 * - remarks: 备注
 */
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const { id } = req.params
    const admin_id = req.user.user_id

    const result = await TransactionManager.execute(async transaction => {
      return await service.updateRiskProfile(parseInt(id), req.body, admin_id, { transaction })
    })

    return res.apiSuccess(result, '更新风控配置成功')
  } catch (error) {
    logger.error(`更新风控配置[${req.params.id}]失败:`, error)
    return res.apiError(
      `更新风控配置失败: ${error.message}`,
      error.code || 'RISK_PROFILE_UPDATE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * DELETE /:id - 删除风控配置
 */
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const { id } = req.params
    const admin_id = req.user.user_id

    await TransactionManager.execute(async transaction => {
      await service.deleteRiskProfile(parseInt(id), admin_id, { transaction })
    })

    return res.apiSuccess(null, '删除风控配置成功')
  } catch (error) {
    logger.error(`删除风控配置[${req.params.id}]失败:`, error)
    return res.apiError(
      `删除风控配置失败: ${error.message}`,
      error.code || 'RISK_PROFILE_DELETE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * POST /user/:user_id/freeze - 冻结用户账户
 *
 * 请求体：
 * - reason: 冻结原因（必填）
 */
router.post('/user/:user_id/freeze', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const { user_id } = req.params
    const { reason } = req.body
    const admin_id = req.user.user_id

    if (!reason || typeof reason !== 'string') {
      return res.apiError('冻结原因不能为空', 'REASON_REQUIRED', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await service.freezeUser(parseInt(user_id), reason, admin_id, { transaction })
    })

    return res.apiSuccess(result, '冻结用户账户成功')
  } catch (error) {
    logger.error(`冻结用户[${req.params.user_id}]账户失败:`, error)
    return res.apiError(
      `冻结用户账户失败: ${error.message}`,
      error.code || 'FREEZE_USER_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * POST /user/:user_id/unfreeze - 解冻用户账户
 */
router.post('/user/:user_id/unfreeze', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getRiskProfileService(req)
    const { user_id } = req.params
    const admin_id = req.user.user_id

    const result = await TransactionManager.execute(async transaction => {
      return await service.unfreezeUser(parseInt(user_id), admin_id, { transaction })
    })

    return res.apiSuccess(result, '解冻用户账户成功')
  } catch (error) {
    logger.error(`解冻用户[${req.params.user_id}]账户失败:`, error)
    return res.apiError(
      `解冻用户账户失败: ${error.message}`,
      error.code || 'UNFREEZE_USER_FAILED',
      null,
      error.status || 500
    )
  }
})

module.exports = router
