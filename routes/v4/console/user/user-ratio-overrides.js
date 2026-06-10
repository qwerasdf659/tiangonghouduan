/**
 * 用户比例覆盖管理路由
 *
 * @description 管理员为特定用户设置个性化消费比例（CRUD）
 * @version 1.0.0
 * @date 2026-03-02（星石配额优化方案）
 *
 * 业务场景：
 * - 活动奖励：某次推广活动中给参与用户临时 ×3.0
 * - 补偿：用户投诉后给予 ×2.0 补偿
 * - VIP关怀：大客户长期享受 ×1.5
 * - 测试：内部测试账号设为 ×10.0
 *
 * 架构原则：
 * - 路由层不直连 models（通过 TransactionManager 管理事务边界）
 * - 写操作通过 Service + options.transaction 统一处理
 * - 读操作通过模型查询（简单 CRUD 不需要独立 QueryService）
 */

const express = require('express')
const router = express.Router()
const TransactionManager = require('../../../../utils/TransactionManager')
const { adminAuthMiddleware, asyncHandler } = require('../shared/middleware')

const VALID_RATIO_KEYS = ['points_award_ratio', 'budget_allocation_ratio', 'star_stone_quota_ratio']

const RATIO_KEY_LABELS = {
  points_award_ratio: '消费积分比例',
  budget_allocation_ratio: '预算分配比例',
  star_stone_quota_ratio: '星石配额比例'
}

/**
 * GET /user-ratio-overrides - 列表查询（支持 user_id / ratio_key 过滤，分页）
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const UserRatioOverrideService = req.app.locals.services.getService('user_ratio_override')
    const result = await UserRatioOverrideService.list(req.query)

    return res.apiSuccess(
      { ...result, ratio_key_labels: RATIO_KEY_LABELS },
      '查询用户比例覆盖列表成功'
    )
  })
)

/**
 * GET /user-ratio-overrides/user/:user_id - 查询某用户的所有覆盖
 */
router.get(
  '/user/:user_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const UserRatioOverrideService = req.app.locals.services.getService('user_ratio_override')
    const overrides = await UserRatioOverrideService.listByUser(req.params.user_id)

    return res.apiSuccess(
      {
        items: overrides,
        user_id: parseInt(req.params.user_id),
        ratio_key_labels: RATIO_KEY_LABELS
      },
      '查询用户比例覆盖成功'
    )
  })
)

/**
 * GET /user-ratio-overrides/:id - 查询单条覆盖记录
 */
router.get(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const UserRatioOverrideService = req.app.locals.services.getService('user_ratio_override')
    const override = await UserRatioOverrideService.getById(req.params.id)

    if (!override) {
      return res.apiError('覆盖记录不存在', 'NOT_FOUND', null, 404)
    }

    return res.apiSuccess(override, '查询覆盖记录成功')
  })
)

/**
 * POST /user-ratio-overrides - 新增覆盖
 */
router.post(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { user_id, ratio_key, ratio_value } = req.body

    if (!user_id || !ratio_key || ratio_value === undefined || ratio_value === null) {
      return res.apiError(
        '缺少必填字段：user_id、ratio_key、ratio_value',
        'VALIDATION_ERROR',
        null,
        400
      )
    }
    if (!VALID_RATIO_KEYS.includes(ratio_key)) {
      return res.apiError(
        `无效的 ratio_key，允许值：${VALID_RATIO_KEYS.join(', ')}`,
        'INVALID_RATIO_KEY',
        null,
        400
      )
    }

    const UserRatioOverrideService = req.app.locals.services.getService('user_ratio_override')
    const result = await TransactionManager.execute(
      async transaction =>
        UserRatioOverrideService.create(req.body, req.user.user_id, { transaction }),
      { description: 'createUserRatioOverride' }
    )

    return res.apiSuccess(result, `创建用户比例覆盖成功（${RATIO_KEY_LABELS[ratio_key]}）`)
  })
)

/**
 * PUT /user-ratio-overrides/:id - 修改覆盖
 */
router.put(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const UserRatioOverrideService = req.app.locals.services.getService('user_ratio_override')
    const result = await TransactionManager.execute(
      async transaction =>
        UserRatioOverrideService.update(req.params.id, req.body, { transaction }),
      { description: 'updateUserRatioOverride' }
    )

    return res.apiSuccess(result, '修改用户比例覆盖成功')
  })
)

/**
 * DELETE /user-ratio-overrides/:id - 删除覆盖（硬删除）
 */
router.delete(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const UserRatioOverrideService = req.app.locals.services.getService('user_ratio_override')
    const result = await TransactionManager.execute(
      async transaction => UserRatioOverrideService.delete(req.params.id, { transaction }),
      { description: 'deleteUserRatioOverride' }
    )

    return res.apiSuccess(result, '删除用户比例覆盖成功（已恢复为全局默认值）')
  })
)

module.exports = router
