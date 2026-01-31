/**
 * 功能开关管理路由（Console 后台）
 *
 * 路由前缀：/api/v4/console/feature-flags
 *
 * 功能：
 * 1. 功能开关 CRUD 操作
 * 2. 用户白名单/黑名单管理
 * 3. 功能可用性查询
 *
 * 权限要求：
 * - 所有操作需要管理员权限（admin 或 super_admin）
 *
 * @module routes/console/feature-flags
 * @author Feature Flag 灰度发布模块
 * @since 2026-01-21
 * @see docs/Feature-Flag灰度发布功能实施方案.md
 */

'use strict'

const express = require('express')
const router = express.Router()
const { logger } = require('../../../utils/logger')

// ==================== 服务获取器 ====================

/**
 * 获取功能开关服务（通过 ServiceManager 统一入口）
 * @param {Object} req - Express 请求对象
 * @returns {Object} FeatureFlagService 实例
 */
function getFeatureFlagService(req) {
  return req.app.locals.services.getService('feature_flag')
}

// ==================== 辅助函数 ====================

/**
 * 构建操作人信息
 * @param {Object} req - Express 请求对象
 * @returns {Object} 操作人信息对象
 */
function getOperator(req) {
  return {
    user_id: req.user?.user_id || req.user?.id,
    username: req.user?.username || req.user?.nickname || `user_${req.user?.user_id || 0}`,
    ip: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '0.0.0.0'
  }
}

/**
 * 验证 flag_key 格式
 * 规则：小写字母、数字、下划线，3-100 字符
 * @param {string} flagKey - 功能键名
 * @returns {boolean} 是否为有效的 flag_key 格式
 */
function isValidFlagKey(flagKey) {
  if (!flagKey || typeof flagKey !== 'string') return false
  return /^[a-z][a-z0-9_]{2,99}$/.test(flagKey)
}

// ==================== 路由定义 ====================

/**
 * GET /api/v4/console/feature-flags
 * 获取所有功能开关列表
 *
 * Query Params:
 * - is_enabled: 筛选启用状态 (true/false)
 * - rollout_strategy: 筛选发布策略
 */
router.get('/', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const filters = {}

    if (req.query.is_enabled !== undefined) {
      filters.is_enabled = req.query.is_enabled === 'true'
    }

    if (req.query.rollout_strategy) {
      filters.rollout_strategy = req.query.rollout_strategy
    }

    const flags = await FeatureFlagService.getAllFlags(filters)

    return res.apiSuccess(flags, '获取功能开关列表成功')
  } catch (error) {
    logger.error('[FeatureFlagRoute] 获取列表失败', { error: error.message })
    return res.apiError(error.message, 'GET_FLAGS_FAILED')
  }
})

/**
 * GET /api/v4/console/feature-flags/:flagKey
 * 获取单个功能开关详情
 */
router.get('/:flagKey', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const { flagKey } = req.params

    const flag = await FeatureFlagService.getFlagByKey(flagKey, { skipCache: true })

    if (!flag) {
      return res.apiError(`功能开关 ${flagKey} 不存在`, 'FLAG_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(flag, '获取功能开关成功')
  } catch (error) {
    logger.error('[FeatureFlagRoute] 获取详情失败', {
      flagKey: req.params.flagKey,
      error: error.message
    })
    return res.apiError(error.message, 'GET_FLAG_FAILED')
  }
})

/**
 * POST /api/v4/console/feature-flags
 * 创建功能开关
 *
 * Body:
 * - flag_key: 功能键名（必需）
 * - flag_name: 功能名称（必需）
 * - description: 功能描述
 * - is_enabled: 是否启用（默认 false）
 * - rollout_strategy: 发布策略（默认 all）
 * - rollout_percentage: 开放百分比
 * - whitelist_user_ids: 白名单用户ID列表
 * - blacklist_user_ids: 黑名单用户ID列表
 * - target_segments: 目标用户分群
 * - effective_start: 生效开始时间
 * - effective_end: 生效结束时间
 * - related_config_group: 关联配置分组
 * - fallback_behavior: 降级行为
 */
router.post('/', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const {
      flag_key,
      flag_name,
      description,
      is_enabled = false,
      rollout_strategy = 'all',
      rollout_percentage = 100,
      whitelist_user_ids = [],
      blacklist_user_ids = [],
      target_segments = [],
      effective_start,
      effective_end,
      related_config_group,
      fallback_behavior = 'disabled'
    } = req.body

    // 参数验证
    if (!flag_key) {
      return res.apiError('flag_key 不能为空', 'INVALID_PARAMS', null, 400)
    }

    if (!isValidFlagKey(flag_key)) {
      return res.apiError(
        'flag_key 格式无效（小写字母开头，3-100字符，仅允许小写字母、数字、下划线）',
        'INVALID_FLAG_KEY',
        null,
        400
      )
    }

    if (!flag_name) {
      return res.apiError('flag_name 不能为空', 'INVALID_PARAMS', null, 400)
    }

    const operator = getOperator(req)

    const flag = await FeatureFlagService.createFlag(
      {
        flag_key,
        flag_name,
        description,
        is_enabled,
        rollout_strategy,
        rollout_percentage,
        whitelist_user_ids,
        blacklist_user_ids,
        target_segments,
        effective_start,
        effective_end,
        related_config_group,
        fallback_behavior
      },
      operator
    )

    return res.apiSuccess(flag, '创建功能开关成功', 'FLAG_CREATED', 201)
  } catch (error) {
    logger.error('[FeatureFlagRoute] 创建失败', {
      body: req.body,
      error: error.message
    })
    return res.apiError(error.message, 'CREATE_FLAG_FAILED')
  }
})

/**
 * PUT /api/v4/console/feature-flags/:flagKey
 * 更新功能开关
 */
router.put('/:flagKey', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const { flagKey } = req.params
    const updateData = req.body

    // 不允许更新 flag_key
    delete updateData.flag_key
    delete updateData.flag_id
    delete updateData.created_by
    delete updateData.created_at

    const operator = getOperator(req)

    const flag = await FeatureFlagService.updateFlag(flagKey, updateData, operator)

    return res.apiSuccess(flag, '更新功能开关成功')
  } catch (error) {
    logger.error('[FeatureFlagRoute] 更新失败', {
      flagKey: req.params.flagKey,
      body: req.body,
      error: error.message
    })
    return res.apiError(error.message, 'UPDATE_FLAG_FAILED')
  }
})

/**
 * PATCH /api/v4/console/feature-flags/:flagKey/toggle
 * 切换功能开关状态
 *
 * Body:
 * - enabled: 目标状态（必需）
 */
router.patch('/:flagKey/toggle', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const { flagKey } = req.params
    const { enabled } = req.body

    if (typeof enabled !== 'boolean') {
      return res.apiError('enabled 必须是布尔值', 'INVALID_PARAMS', null, 400)
    }

    const operator = getOperator(req)

    const flag = await FeatureFlagService.toggleFlag(flagKey, enabled, operator)

    return res.apiSuccess(flag, `功能开关已${enabled ? '启用' : '禁用'}`)
  } catch (error) {
    logger.error('[FeatureFlagRoute] 切换状态失败', {
      flagKey: req.params.flagKey,
      body: req.body,
      error: error.message
    })
    return res.apiError(error.message, 'TOGGLE_FLAG_FAILED')
  }
})

/**
 * DELETE /api/v4/console/feature-flags/:flagKey
 * 删除功能开关
 */
router.delete('/:flagKey', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const { flagKey } = req.params
    const operator = getOperator(req)

    await FeatureFlagService.deleteFlag(flagKey, operator)

    return res.apiSuccess(null, '功能开关已删除')
  } catch (error) {
    logger.error('[FeatureFlagRoute] 删除失败', {
      flagKey: req.params.flagKey,
      error: error.message
    })
    return res.apiError(error.message, 'DELETE_FLAG_FAILED')
  }
})

// ==================== 白名单/黑名单管理 ====================

/**
 * POST /api/v4/console/feature-flags/:flagKey/whitelist
 * 添加用户到白名单
 *
 * Body:
 * - user_ids: 用户ID列表（必需）
 */
router.post('/:flagKey/whitelist', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const { flagKey } = req.params
    const { user_ids } = req.body

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.apiError('user_ids 必须是非空数组', 'INVALID_PARAMS', null, 400)
    }

    const operator = getOperator(req)

    const flag = await FeatureFlagService.addToWhitelist(flagKey, user_ids, operator)

    return res.apiSuccess(flag, `已添加 ${user_ids.length} 个用户到白名单`)
  } catch (error) {
    logger.error('[FeatureFlagRoute] 添加白名单失败', {
      flagKey: req.params.flagKey,
      body: req.body,
      error: error.message
    })
    return res.apiError(error.message, 'ADD_WHITELIST_FAILED')
  }
})

/**
 * DELETE /api/v4/console/feature-flags/:flagKey/whitelist
 * 从白名单移除用户
 *
 * Body:
 * - user_ids: 用户ID列表（必需）
 */
router.delete('/:flagKey/whitelist', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const { flagKey } = req.params
    const { user_ids } = req.body

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.apiError('user_ids 必须是非空数组', 'INVALID_PARAMS', null, 400)
    }

    const operator = getOperator(req)

    const flag = await FeatureFlagService.removeFromWhitelist(flagKey, user_ids, operator)

    return res.apiSuccess(flag, `已从白名单移除 ${user_ids.length} 个用户`)
  } catch (error) {
    logger.error('[FeatureFlagRoute] 移除白名单失败', {
      flagKey: req.params.flagKey,
      body: req.body,
      error: error.message
    })
    return res.apiError(error.message, 'REMOVE_WHITELIST_FAILED')
  }
})

/**
 * POST /api/v4/console/feature-flags/:flagKey/blacklist
 * 添加用户到黑名单
 *
 * Body:
 * - user_ids: 用户ID列表（必需）
 */
router.post('/:flagKey/blacklist', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const { flagKey } = req.params
    const { user_ids } = req.body

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.apiError('user_ids 必须是非空数组', 'INVALID_PARAMS', null, 400)
    }

    const operator = getOperator(req)

    const flag = await FeatureFlagService.addToBlacklist(flagKey, user_ids, operator)

    return res.apiSuccess(flag, `已添加 ${user_ids.length} 个用户到黑名单`)
  } catch (error) {
    logger.error('[FeatureFlagRoute] 添加黑名单失败', {
      flagKey: req.params.flagKey,
      body: req.body,
      error: error.message
    })
    return res.apiError(error.message, 'ADD_BLACKLIST_FAILED')
  }
})

/**
 * DELETE /api/v4/console/feature-flags/:flagKey/blacklist
 * 从黑名单移除用户
 *
 * Body:
 * - user_ids: 用户ID列表（必需）
 */
router.delete('/:flagKey/blacklist', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const { flagKey } = req.params
    const { user_ids } = req.body

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.apiError('user_ids 必须是非空数组', 'INVALID_PARAMS', null, 400)
    }

    const operator = getOperator(req)

    const flag = await FeatureFlagService.removeFromBlacklist(flagKey, user_ids, operator)

    return res.apiSuccess(flag, `已从黑名单移除 ${user_ids.length} 个用户`)
  } catch (error) {
    logger.error('[FeatureFlagRoute] 移除黑名单失败', {
      flagKey: req.params.flagKey,
      body: req.body,
      error: error.message
    })
    return res.apiError(error.message, 'REMOVE_BLACKLIST_FAILED')
  }
})

// ==================== 功能可用性查询 ====================

/**
 * GET /api/v4/console/feature-flags/:flagKey/check/:userId
 * 检查指定用户的功能可用性
 */
router.get('/:flagKey/check/:userId', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const { flagKey, userId } = req.params

    const result = await FeatureFlagService.isEnabled(flagKey, parseInt(userId), {
      skipCache: req.query.skip_cache === 'true'
    })

    return res.apiSuccess(result, '功能可用性检查完成')
  } catch (error) {
    logger.error('[FeatureFlagRoute] 检查可用性失败', {
      flagKey: req.params.flagKey,
      userId: req.params.userId,
      error: error.message
    })
    return res.apiError(error.message, 'CHECK_ENABLED_FAILED')
  }
})

/**
 * POST /api/v4/console/feature-flags/batch-check
 * 批量检查功能可用性
 *
 * Body:
 * - flag_keys: 功能键名列表（必需）
 * - user_id: 用户ID（必需）
 */
router.post('/batch-check', async (req, res) => {
  try {
    const FeatureFlagService = getFeatureFlagService(req)
    const { flag_keys, user_id } = req.body

    if (!Array.isArray(flag_keys) || flag_keys.length === 0) {
      return res.apiError('flag_keys 必须是非空数组', 'INVALID_PARAMS', null, 400)
    }

    if (!user_id) {
      return res.apiError('user_id 不能为空', 'INVALID_PARAMS', null, 400)
    }

    const result = await FeatureFlagService.isEnabledBatch(flag_keys, parseInt(user_id))

    return res.apiSuccess(result, '批量检查完成')
  } catch (error) {
    logger.error('[FeatureFlagRoute] 批量检查失败', {
      body: req.body,
      error: error.message
    })
    return res.apiError(error.message, 'BATCH_CHECK_FAILED')
  }
})

module.exports = router
