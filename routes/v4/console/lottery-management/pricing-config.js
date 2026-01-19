'use strict'

/**
 * 抽奖活动定价配置管理路由
 *
 * @description 管理员管理活动定价配置（CRUD + 版本管理 + 回滚 + 定时生效）
 * @module routes/v4/console/lottery-management/pricing-config
 * @version 1.2.0
 * @date 2026-01-19
 *
 * 业务场景：
 * - 查询活动定价配置（当前版本 + 历史版本）
 * - 创建新版本定价配置
 * - 激活指定版本定价配置
 * - 归档/禁用定价配置
 * - 回滚到历史版本（Phase 3.3）
 * - 设置版本定时生效（Phase 3.3）
 *
 * 配置来源层级（Phase 3 方案 A2）：
 * - lottery_campaign_pricing_config 表为唯一真相源
 * - 活动 JSON 字段仅作创建活动时的默认模板
 *
 * API 端点：
 * - GET    /campaigns/:campaign_id/pricing          - 获取活动当前定价配置
 * - GET    /campaigns/:campaign_id/pricing/versions - 获取所有版本
 * - POST   /campaigns/:campaign_id/pricing          - 创建新版本
 * - PUT    /campaigns/:campaign_id/pricing/:version/activate - 激活指定版本
 * - PUT    /campaigns/:campaign_id/pricing/:version/archive  - 归档指定版本
 * - POST   /campaigns/:campaign_id/pricing/rollback - 回滚到指定版本（Phase 3.3）
 * - PUT    /campaigns/:campaign_id/pricing/:version/schedule - 设置定时生效（Phase 3.3）
 * - DELETE /campaigns/:campaign_id/pricing/:version/schedule - 取消定时生效（Phase 3.3）
 *
 * 权限要求：
 * - 需要管理员权限（通过 adminAuthMiddleware 中间件验证）
 *
 * 设计规范：
 * - 路由不直接访问 models，写操作收口到 Service
 * - 通过 ServiceManager 获取 Service
 * - 统一使用 res.apiSuccess / res.apiError
 */

const express = require('express')
const router = express.Router()
const { adminAuthMiddleware, asyncHandler } = require('../shared/middleware')

/**
 * 通过 ServiceManager 获取定价配置服务实例
 *
 * @description 从 req.app.locals.services 获取 LotteryCampaignPricingConfigService
 * @param {Object} req - Express 请求对象（包含 app.locals.services）
 * @returns {Object} LotteryCampaignPricingConfigService 静态类
 */
function getPricingConfigService(req) {
  return req.app.locals.services.getService('lottery_campaign_pricing_config')
}

/**
 * GET /campaigns/:campaign_id/pricing
 * 获取活动当前生效的定价配置
 *
 * 响应字段说明：
 * - config_id: 配置唯一ID
 * - campaign_id: 关联活动ID
 * - version: 版本号
 * - pricing_config: 定价配置 JSON（包含 draw_buttons 数组）
 * - status: 配置状态（draft/active/scheduled/archived）
 * - effective_at: 生效时间
 * - expired_at: 过期时间
 * - created_by: 创建人ID
 * - created_at: 创建时间
 */
router.get(
  '/campaigns/:campaign_id/pricing',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id } = req.params
    const PricingConfigService = getPricingConfigService(req)

    // 调用 Service 获取活跃配置
    const pricing_config = await PricingConfigService.getActivePricingConfig(campaign_id)

    if (!pricing_config) {
      return res.apiError(
        '该活动暂无定价配置，请先创建',
        'PRICING_CONFIG_NOT_FOUND',
        { campaign_id: parseInt(campaign_id, 10) },
        404
      )
    }

    return res.apiSuccess(pricing_config, '获取定价配置成功')
  })
)

/**
 * GET /campaigns/:campaign_id/pricing/versions
 * 获取活动所有版本的定价配置
 *
 * 响应说明：
 * - versions: 版本列表（按版本号降序）
 * - total: 版本总数
 */
router.get(
  '/campaigns/:campaign_id/pricing/versions',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id } = req.params
    const PricingConfigService = getPricingConfigService(req)

    // 调用 Service 获取所有版本
    const result = await PricingConfigService.getAllVersions(campaign_id)

    return res.apiSuccess(result, '获取版本列表成功')
  })
)

/**
 * POST /campaigns/:campaign_id/pricing
 * 创建新版本定价配置
 *
 * 请求体：
 * {
 *   "pricing_config": {
 *     "draw_buttons": [
 *       { "count": 1, "discount": 1.0, "label": "单抽", "enabled": true, "sort_order": 1 },
 *       { "count": 3, "discount": 1.0, "label": "3连抽", "enabled": true, "sort_order": 3 },
 *       { "count": 5, "discount": 1.0, "label": "5连抽", "enabled": true, "sort_order": 5 },
 *       { "count": 10, "discount": 0.9, "label": "10连抽(九折)", "enabled": true, "sort_order": 10 }
 *     ]
 *   },
 *   "activate_immediately": true  // 可选，是否立即激活
 * }
 *
 * 响应说明：
 * - 创建成功返回新版本信息
 * - 版本号自动递增
 */
router.post(
  '/campaigns/:campaign_id/pricing',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id } = req.params
    const { pricing_config, activate_immediately = false } = req.body
    const created_by = req.user?.user_id

    // 参数验证
    if (!pricing_config) {
      return res.apiError('缺少 pricing_config 参数', 'MISSING_PRICING_CONFIG', null, 400)
    }

    if (!created_by) {
      return res.apiError('无法获取操作者信息', 'MISSING_OPERATOR', null, 401)
    }

    const PricingConfigService = getPricingConfigService(req)

    // 调用 Service 创建新版本
    const result = await PricingConfigService.createNewVersion(
      campaign_id,
      pricing_config,
      created_by,
      { activate_immediately }
    )

    return res.apiSuccess(result, `创建新版本成功${activate_immediately ? '并已激活' : ''}`)
  })
)

/**
 * PUT /campaigns/:campaign_id/pricing/:version/activate
 * 激活指定版本的定价配置
 *
 * 业务逻辑：
 * - 将指定版本状态设为 active
 * - 将其他版本状态设为 archived
 * - 触发活动缓存失效
 */
router.put(
  '/campaigns/:campaign_id/pricing/:version/activate',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id, version } = req.params
    const updated_by = req.user?.user_id

    if (!updated_by) {
      return res.apiError('无法获取操作者信息', 'MISSING_OPERATOR', null, 401)
    }

    const PricingConfigService = getPricingConfigService(req)

    // 调用 Service 激活版本
    const result = await PricingConfigService.activateVersion(
      campaign_id,
      parseInt(version, 10),
      updated_by
    )

    return res.apiSuccess(result, `版本 ${version} 已激活`)
  })
)

/**
 * PUT /campaigns/:campaign_id/pricing/:version/archive
 * 归档指定版本的定价配置
 *
 * 业务逻辑：
 * - 将指定版本状态设为 archived
 * - 不影响其他版本
 */
router.put(
  '/campaigns/:campaign_id/pricing/:version/archive',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id, version } = req.params
    const updated_by = req.user?.user_id

    if (!updated_by) {
      return res.apiError('无法获取操作者信息', 'MISSING_OPERATOR', null, 401)
    }

    const PricingConfigService = getPricingConfigService(req)

    // 调用 Service 归档版本
    const result = await PricingConfigService.archiveVersion(
      campaign_id,
      parseInt(version, 10),
      updated_by
    )

    return res.apiSuccess(result, `版本 ${version} 已归档`)
  })
)

/**
 * POST /campaigns/:campaign_id/pricing/rollback
 * 回滚到指定版本的定价配置
 *
 * 请求体：
 * {
 *   "target_version": 2,         // 必填：要回滚到的目标版本号
 *   "rollback_reason": "xxx"     // 可选：回滚原因（用于审计追溯）
 * }
 *
 * 业务逻辑：
 * - 复制目标版本的配置创建新版本（版本号自动递增）
 * - 激活新版本
 * - 记录回滚元数据（便于审计追溯）
 *
 * 为什么是 POST 而非 PUT？
 * - 回滚操作会创建新资源（新版本），符合 POST 语义
 * - 保持版本号单调递增的不可变性
 */
router.post(
  '/campaigns/:campaign_id/pricing/rollback',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id } = req.params
    const { target_version, rollback_reason = '' } = req.body
    const updated_by = req.user?.user_id

    // 参数验证
    if (!target_version) {
      return res.apiError('缺少 target_version 参数', 'MISSING_TARGET_VERSION', null, 400)
    }

    if (!updated_by) {
      return res.apiError('无法获取操作者信息', 'MISSING_OPERATOR', null, 401)
    }

    const PricingConfigService = getPricingConfigService(req)

    // 调用 Service 执行回滚
    const result = await PricingConfigService.rollbackToVersion(
      campaign_id,
      parseInt(target_version, 10),
      updated_by,
      rollback_reason
    )

    return res.apiSuccess(result, `已回滚到版本 ${target_version}，新版本号: ${result.new_version}`)
  })
)

/**
 * PUT /campaigns/:campaign_id/pricing/:version/schedule
 * 设置版本定时生效
 *
 * 请求体：
 * {
 *   "effective_at": "2026-01-20T10:00:00+08:00"  // 必填：生效时间（北京时间）
 * }
 *
 * 业务逻辑：
 * - 将版本状态设为 scheduled
 * - 设置 effective_at 生效时间
 * - 定时任务会在到达生效时间后自动激活
 */
router.put(
  '/campaigns/:campaign_id/pricing/:version/schedule',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id, version } = req.params
    const { effective_at } = req.body
    const updated_by = req.user?.user_id

    // 参数验证
    if (!effective_at) {
      return res.apiError('缺少 effective_at 参数', 'MISSING_EFFECTIVE_TIME', null, 400)
    }

    if (!updated_by) {
      return res.apiError('无法获取操作者信息', 'MISSING_OPERATOR', null, 401)
    }

    const PricingConfigService = getPricingConfigService(req)

    // 调用 Service 设置定时生效
    const result = await PricingConfigService.scheduleActivation(
      campaign_id,
      parseInt(version, 10),
      effective_at,
      updated_by
    )

    return res.apiSuccess(result, `版本 ${version} 已设置定时生效`)
  })
)

/**
 * DELETE /campaigns/:campaign_id/pricing/:version/schedule
 * 取消定时生效
 *
 * 业务逻辑：
 * - 将 scheduled 状态的版本恢复为 draft 状态
 * - 清空 effective_at 时间
 */
router.delete(
  '/campaigns/:campaign_id/pricing/:version/schedule',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id, version } = req.params
    const updated_by = req.user?.user_id

    if (!updated_by) {
      return res.apiError('无法获取操作者信息', 'MISSING_OPERATOR', null, 401)
    }

    const PricingConfigService = getPricingConfigService(req)

    // 调用 Service 取消定时生效
    const result = await PricingConfigService.cancelScheduledActivation(
      campaign_id,
      parseInt(version, 10),
      updated_by
    )

    return res.apiSuccess(result, `版本 ${version} 已取消定时生效`)
  })
)

module.exports = router
