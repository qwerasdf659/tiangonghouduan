/**
 * 消费记录管理模块 - 查询与删除
 *
 * @route /api/v4/shop/consumption
 * @description 用户查询自己的消费记录、查看详情、软删除/恢复
 *
 * API列表：
 * - GET /me - 用户查询自己的消费记录
 * - GET /detail/:id - 查询消费记录详情
 * - DELETE /:id - 软删除消费记录
 * - POST /:id/restore - 管理员恢复已删除记录
 *
 * API路径参数设计规范 V2.2：
 * - 消费记录是事务实体，使用数字ID（:id）作为标识符
 *
 * 从consumption.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
// 时间格式化已移至 ConsumptionService 层处理，此处不再直接引用 BeijingTimeHelper

/**
 * @route GET /api/v4/shop/consumption/me
 * @desc 用户查询自己的消费记录（符合"用户端禁止/:id参数"规范）
 * @access Private (仅用户本人)
 *
 * @query {string} status - 状态筛选（pending/approved/rejected/expired，可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 *
 * 📌 规范说明：
 * - 用户查询自己的记录使用/me端点，通过token识别用户身份
 * - 管理员查询指定用户记录请使用：/api/v4/console/users/:user_id/consumption
 */
router.get(
  '/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const QueryService = req.app.locals.services.getService('consumption_query')

    const userId = req.user.user_id
    const { status, page = 1, page_size = 20 } = req.query

    const finalPageSize = Math.min(Math.max(parseInt(page_size) || 20, 1), 50)
    const finalPage = Math.max(parseInt(page) || 1, 1)

    logger.info('用户查询自己的消费记录', {
      user_id: userId,
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    const result = await QueryService.getUserConsumptionRecords(userId, {
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    return res.apiSuccess(result, '查询成功')
  })
)

/**
 * @route GET /api/v4/shop/consumption/detail/:id
 * @desc 查询消费记录详情
 * @access Private (相关用户或管理员)
 *
 * API路径参数设计规范 V2.2：
 * - 消费记录是事务实体，使用数字ID（:id）作为标识符
 *
 * @param {number} id - 消费记录ID
 *
 * ⭐ P0优化：权限验证前置
 * - 先轻量查询验证权限（仅查询user_id、merchant_id、is_deleted字段）
 * - 权限通过后再查询完整数据（包含5个关联查询）
 *
 * ⭐ P1优化：错误消息脱敏
 * - 业务错误返回友好提示（如"消费记录不存在"）
 * - 系统错误返回通用消息（不暴露技术栈信息）
 */
router.get(
  '/detail/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const QueryService = req.app.locals.services.getService('consumption_query')

    const recordId = parseInt(req.params.id, 10)

    logger.info('查询消费记录详情', { record_id: recordId })

    const record = await QueryService.getConsumptionDetailWithAuth(
      recordId,
      req.user.user_id,
      req.user.role_level >= 100,
      {
        include_review_records: true,
        include_points_transaction: true
      }
    )

    logger.info('查询消费记录详情成功', {
      record_id: recordId,
      user_id: req.user.user_id,
      access_reason:
        req.user.role_level >= 100
          ? 'admin_privilege'
          : req.user.user_id === record.user_id
            ? 'user_owner'
            : 'merchant_owner'
    })

    return res.apiSuccess(record, '查询成功')
  })
)

/**
 * @route DELETE /api/v4/shop/consumption/:id
 * @desc 软删除消费记录（用户端隐藏记录，管理员可恢复）
 * @access Private (用户自己的记录)
 *
 * API路径参数设计规范 V2.2：
 * - 消费记录是事务实体，使用数字ID（:id）作为标识符
 *
 * @param {number} id - 消费记录ID（路径参数）
 *
 * 业务规则：
 * - 只能删除自己的消费记录（通过JWT token验证user_id）
 * - 🔒 普通用户只能删除pending状态的记录，管理员可删除任何状态
 * - 软删除：记录仍然保留在数据库中，只是标记为已删除（is_deleted=1）
 * - 前端查询时自动过滤已删除记录（WHERE is_deleted=0）
 * - 用户删除后无法自己恢复，只有管理员可以在后台恢复
 */
router.delete(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const CoreService = req.app.locals.services.getService('consumption_core')

    const userId = req.user.user_id
    const recordId = parseInt(req.params.id, 10)

    if (isNaN(recordId) || recordId <= 0) {
      return res.apiError('无效的记录ID，必须是正整数', 'BAD_REQUEST', null, 400)
    }
    const has_admin_access = req.user.role_level >= 100
    const role_level = req.user.role_level || 0

    const result = await CoreService.softDeleteRecord(recordId, userId, {
      has_admin_access,
      role_level
    })

    return res.apiSuccess(result, '消费记录已删除')
  })
)

/**
 * @route POST /api/v4/shop/consumption/:id/restore
 * @desc 管理员恢复已删除的消费记录（管理员专用）
 * @access Private (仅管理员)
 *
 * API路径参数设计规范 V2.2：
 * - 消费记录是事务实体，使用数字ID（:id）作为标识符
 *
 * @param {number} id - 消费记录ID（路径参数）
 *
 * 业务规则：
 * - 仅管理员可以恢复已删除的记录
 * - 恢复后用户端将重新显示该记录
 * - 恢复操作会清空deleted_at时间戳
 */
router.post(
  '/:id/restore',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const CoreService = req.app.locals.services.getService('consumption_core')

    const recordId = parseInt(req.params.id, 10)
    const adminId = req.user.user_id

    if (isNaN(recordId) || recordId <= 0) {
      return res.apiError('无效的记录ID', 'BAD_REQUEST', null, 400)
    }

    const result = await CoreService.restoreRecord(recordId, adminId)

    return res.apiSuccess(
      {
        record_id: result.consumption_record_id,
        is_deleted: result.is_deleted,
        user_id: result.user_id,
        note: '消费记录已恢复，用户端将重新显示该记录'
      },
      '消费记录已恢复'
    )
  })
)

module.exports = router
