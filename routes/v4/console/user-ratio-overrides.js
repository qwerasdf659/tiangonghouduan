/**
 * 用户比例覆盖管理路由
 *
 * @description 管理员为特定用户设置个性化消费比例（CRUD）
 * @version 1.0.0
 * @date 2026-03-02（钻石配额优化方案）
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
const TransactionManager = require('../../../utils/TransactionManager')
const { sharedComponents, adminAuthMiddleware, asyncHandler } = require('./shared/middleware')

const VALID_RATIO_KEYS = ['points_award_ratio', 'budget_allocation_ratio', 'diamond_quota_ratio']

const RATIO_KEY_LABELS = {
  points_award_ratio: '消费积分比例',
  budget_allocation_ratio: '预算分配比例',
  diamond_quota_ratio: '钻石配额比例'
}

/**
 * GET /user-ratio-overrides - 列表查询（支持 user_id / ratio_key 过滤，分页）
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { UserRatioOverride, User } = require('../../../models')

      const { user_id, ratio_key, page = 1, page_size = 20 } = req.query
      const where = {}

      if (user_id) where.user_id = user_id
      if (ratio_key && VALID_RATIO_KEYS.includes(ratio_key)) where.ratio_key = ratio_key

      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(page_size)
      const limit = Math.min(100, Math.max(1, parseInt(page_size)))

      const { count, rows } = await UserRatioOverride.findAndCountAll({
        where,
        include: [
          { model: User, as: 'target_user', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: User, as: 'creator', attributes: ['user_id', 'nickname'] }
        ],
        order: [['created_at', 'DESC']],
        offset,
        limit
      })

      return res.apiSuccess(
        {
          items: rows,
          total: count,
          page: parseInt(page),
          page_size: limit,
          ratio_key_labels: RATIO_KEY_LABELS
        },
        '查询用户比例覆盖列表成功'
      )
    } catch (error) {
      sharedComponents.logger.error('查询用户比例覆盖列表失败', { error: error.message })
      return res.apiInternalError('查询失败', error.message, 'USER_RATIO_OVERRIDE_LIST_ERROR')
    }
  })
)

/**
 * GET /user-ratio-overrides/user/:user_id - 查询某用户的所有覆盖
 */
router.get(
  '/user/:user_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { UserRatioOverride } = require('../../../models')
      const overrides = await UserRatioOverride.findAll({
        where: { user_id: req.params.user_id },
        order: [['ratio_key', 'ASC']]
      })

      return res.apiSuccess(
        {
          items: overrides,
          user_id: parseInt(req.params.user_id),
          ratio_key_labels: RATIO_KEY_LABELS
        },
        '查询用户比例覆盖成功'
      )
    } catch (error) {
      sharedComponents.logger.error('查询用户比例覆盖失败', { error: error.message })
      return res.apiInternalError('查询失败', error.message, 'USER_RATIO_OVERRIDE_QUERY_ERROR')
    }
  })
)

/**
 * GET /user-ratio-overrides/:id - 查询单条覆盖记录
 */
router.get(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { UserRatioOverride, User } = require('../../../models')
      const override = await UserRatioOverride.findByPk(req.params.id, {
        include: [
          { model: User, as: 'target_user', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: User, as: 'creator', attributes: ['user_id', 'nickname'] }
        ]
      })

      if (!override) {
        return res.apiError('覆盖记录不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(override, '查询覆盖记录成功')
    } catch (error) {
      sharedComponents.logger.error('查询覆盖记录失败', { error: error.message })
      return res.apiInternalError('查询失败', error.message, 'USER_RATIO_OVERRIDE_DETAIL_ERROR')
    }
  })
)

/**
 * POST /user-ratio-overrides - 新增覆盖
 */
router.post(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { user_id, ratio_key, ratio_value, reason, effective_start, effective_end } = req.body

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

      const parsedValue = parseFloat(ratio_value)
      if (isNaN(parsedValue) || parsedValue < 0.1 || parsedValue > 5.0) {
        return res.apiError('ratio_value 必须在 0.1 ~ 5.0 之间', 'INVALID_RATIO_VALUE', null, 400)
      }

      const result = await TransactionManager.execute(
        async transaction => {
          const { UserRatioOverride, User } = require('../../../models')

          const user = await User.findByPk(user_id, { transaction })
          if (!user) {
            throw new Error(`用户不存在：user_id=${user_id}`)
          }

          const override = await UserRatioOverride.create(
            {
              user_id,
              ratio_key,
              ratio_value: parsedValue,
              reason: reason || null,
              effective_start: effective_start || null,
              effective_end: effective_end || null,
              created_by: req.user.user_id
            },
            { transaction }
          )

          return override
        },
        { description: 'createUserRatioOverride' }
      )

      return res.apiSuccess(result, `创建用户比例覆盖成功（${RATIO_KEY_LABELS[ratio_key]}）`)
    } catch (error) {
      sharedComponents.logger.error('创建用户比例覆盖失败', { error: error.message })

      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.apiError(
          '该用户已有相同类型的比例覆盖，请使用修改功能',
          'DUPLICATE_OVERRIDE',
          null,
          409
        )
      }

      if (error.message.includes('用户不存在')) {
        return res.apiError(error.message, 'USER_NOT_FOUND', null, 404)
      }

      return res.apiInternalError('创建失败', error.message, 'USER_RATIO_OVERRIDE_CREATE_ERROR')
    }
  })
)

/**
 * PUT /user-ratio-overrides/:id - 修改覆盖
 */
router.put(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { ratio_value, reason, effective_start, effective_end } = req.body

      const result = await TransactionManager.execute(
        async transaction => {
          const { UserRatioOverride } = require('../../../models')

          const override = await UserRatioOverride.findByPk(req.params.id, { transaction })
          if (!override) {
            throw new Error('覆盖记录不存在')
          }

          const updateData = {}
          if (ratio_value !== undefined && ratio_value !== null) {
            const parsedValue = parseFloat(ratio_value)
            if (isNaN(parsedValue) || parsedValue < 0.1 || parsedValue > 5.0) {
              throw new Error('ratio_value 必须在 0.1 ~ 5.0 之间')
            }
            updateData.ratio_value = parsedValue
          }
          if (reason !== undefined) updateData.reason = reason
          if (effective_start !== undefined) updateData.effective_start = effective_start || null
          if (effective_end !== undefined) updateData.effective_end = effective_end || null

          await override.update(updateData, { transaction })
          return override
        },
        { description: 'updateUserRatioOverride' }
      )

      return res.apiSuccess(result, '修改用户比例覆盖成功')
    } catch (error) {
      sharedComponents.logger.error('修改用户比例覆盖失败', { error: error.message })

      if (error.message === '覆盖记录不存在') {
        return res.apiError(error.message, 'NOT_FOUND', null, 404)
      }
      if (error.message.includes('ratio_value')) {
        return res.apiError(error.message, 'INVALID_RATIO_VALUE', null, 400)
      }

      return res.apiInternalError('修改失败', error.message, 'USER_RATIO_OVERRIDE_UPDATE_ERROR')
    }
  })
)

/**
 * DELETE /user-ratio-overrides/:id - 删除覆盖（硬删除）
 */
router.delete(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const result = await TransactionManager.execute(
        async transaction => {
          const { UserRatioOverride } = require('../../../models')

          const override = await UserRatioOverride.findByPk(req.params.id, { transaction })
          if (!override) {
            throw new Error('覆盖记录不存在')
          }

          const info = {
            user_ratio_override_id: override.user_ratio_override_id,
            user_id: override.user_id,
            ratio_key: override.ratio_key,
            ratio_value: override.ratio_value
          }

          await override.destroy({ transaction })
          return info
        },
        { description: 'deleteUserRatioOverride' }
      )

      return res.apiSuccess(result, '删除用户比例覆盖成功（已恢复为全局默认值）')
    } catch (error) {
      sharedComponents.logger.error('删除用户比例覆盖失败', { error: error.message })

      if (error.message === '覆盖记录不存在') {
        return res.apiError(error.message, 'NOT_FOUND', null, 404)
      }

      return res.apiInternalError('删除失败', error.message, 'USER_RATIO_OVERRIDE_DELETE_ERROR')
    }
  })
)

module.exports = router
