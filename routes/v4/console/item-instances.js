'use strict'

/**
 * 管理员物品实例管理路由
 *
 * @route /api/v4/console/item-instances
 * @description 管理员查看和管理所有用户的物品实例
 *
 * 📌 模块说明：
 * - 此模块属于 console 域，仅限 admin（role_level >= 100）访问
 * - 提供全平台物品实例列表、详情、冻结/解冻操作
 * - 所有写操作通过 ServiceManager 获取 ItemService 执行
 *
 * API列表：
 * - GET  /                          - 物品实例列表（支持分页、筛选）
 * - GET  /user/:user_id             - 指定用户的物品实例列表
 * - GET  /:item_instance_id         - 物品实例详情
 * - POST /:item_instance_id/freeze  - 冻结物品（security 锁定）
 * - POST /:item_instance_id/unfreeze - 解冻物品（移除 security 锁定）
 * - POST /:item_instance_id/transfer - 管理员转移物品所有权
 *
 * 创建时间：2026-02-15（修复前端 404 问题）
 * @module routes/v4/console/item-instances
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger')
const { attachDisplayNames, DICT_TYPES } = require('../../../utils/displayNameHelper')

/**
 * GET /api/v4/console/item-instances
 *
 * @desc 获取全平台物品实例列表（管理员视角）
 * @access Private（role_level >= 100）
 *
 * @query {number} [page=1]        - 页码
 * @query {number} [page_size=20]  - 每页数量（最大100）
 * @query {number} [owner_user_id] - 按持有者用户ID筛选
 * @query {string} [status]        - 按状态筛选（available/locked/transferred/used/expired）
 * @query {string} [item_type]     - 按物品类型筛选（voucher/product/service/equipment/card）
 * @query {string} [sort_by]       - 排序字段（created_at/item_instance_id/status）
 * @query {string} [sort_order]    - 排序方向（ASC/DESC，默认DESC）
 *
 * @returns {Object} { list, pagination }
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      page = 1,
      page_size = 20,
      owner_user_id,
      status,
      item_type,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query

    const parsedPage = Math.max(1, parseInt(page) || 1)
    const parsedPageSize = Math.min(100, Math.max(1, parseInt(page_size) || 20))

    const { ItemInstance, User, ItemTemplate } = req.app.locals.models

    /* ── 构建查询条件 ── */
    const where = {}

    if (owner_user_id) {
      where.owner_user_id = parseInt(owner_user_id)
    }

    if (status) {
      where.status = status
    }

    if (item_type) {
      where.item_type = item_type
    }

    /* ── 排序规则 ── */
    const allowedSortFields = ['created_at', 'item_instance_id', 'status', 'owner_user_id']
    const actualSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'created_at'
    const actualSortOrder = sort_order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    /* ── 执行查询 ── */
    const { count, rows } = await ItemInstance.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['user_id', 'nickname', 'mobile'],
          required: false
        },
        {
          model: ItemTemplate,
          as: 'itemTemplate',
          attributes: ['item_template_id', 'name', 'item_type', 'rarity_code'],
          required: false
        }
      ],
      order: [[actualSortBy, actualSortOrder]],
      limit: parsedPageSize,
      offset: (parsedPage - 1) * parsedPageSize
    })

    /* ── 格式化结果 ── */
    const items = rows.map(row => {
      const json = row.toJSON()
      const meta = json.meta || {}
      return {
        ...json,
        /* 前端显示用字段 - 从 meta 或模板中提取 */
        item_name: meta.name || json.itemTemplate?.name || '-',
        template_name: json.itemTemplate?.name || null,
        rarity_code: json.itemTemplate?.rarity_code || null,
        /* 来源信息 */
        source: meta.source_type || null,
        source_display: meta.source_type ? _getSourceDisplay(meta.source_type) : null
      }
    })

    /* ── 附加中文显示名称 ── */
    await attachDisplayNames(items, [
      { field: 'status', dictType: DICT_TYPES.ITEM_STATUS },
      { field: 'item_type', dictType: DICT_TYPES.ITEM_TYPE }
    ])

    logger.info('[物品实例管理] 查询列表', {
      admin_id: req.user.user_id,
      total: count,
      page: parsedPage,
      page_size: parsedPageSize,
      filters: { owner_user_id, status, item_type }
    })

    return res.apiSuccess(
      {
        list: items,
        count,
        pagination: {
          total: count,
          page: parsedPage,
          page_size: parsedPageSize,
          total_pages: Math.ceil(count / parsedPageSize)
        }
      },
      '获取物品实例列表成功'
    )
  } catch (error) {
    logger.error('[物品实例管理] 查询列表失败', {
      admin_id: req.user?.user_id,
      error: error.message
    })
    return handleServiceError(error, res, '获取物品实例列表失败')
  }
})

/**
 * GET /api/v4/console/item-instances/user/:user_id
 *
 * @desc 获取指定用户的物品实例列表
 * @access Private（role_level >= 100）
 *
 * @param {number} user_id - 用户ID
 * @query {number} [page=1]      - 页码
 * @query {number} [page_size=20] - 每页数量
 * @query {string} [status]       - 状态筛选
 * @query {string} [item_type]    - 类型筛选
 *
 * @returns {Object} { items, total, page, page_size, total_pages }
 */
router.get('/user/:user_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)
    if (!user_id || isNaN(user_id)) {
      return res.apiError('无效的用户ID', 'INVALID_PARAM', null, 400)
    }

    const { page = 1, page_size = 20, status, item_type } = req.query

    /* 复用 ItemService 的方法 */
    const ItemService = req.app.locals.services.getService('asset_item')
    const result = await ItemService.getUserItemInstances(
      { user_id },
      {
        item_type: item_type || null,
        status: status || null,
        page: Math.max(1, parseInt(page) || 1),
        page_size: Math.min(100, Math.max(1, parseInt(page_size) || 20))
      }
    )

    logger.info('[物品实例管理] 查询用户物品', {
      admin_id: req.user.user_id,
      target_user_id: user_id,
      count: result.total
    })

    return res.apiSuccess(result, '获取用户物品列表成功')
  } catch (error) {
    logger.error('[物品实例管理] 查询用户物品失败', {
      admin_id: req.user?.user_id,
      target_user_id: req.params.user_id,
      error: error.message
    })
    return handleServiceError(error, res, '获取用户物品列表失败')
  }
})

/**
 * GET /api/v4/console/item-instances/:item_instance_id
 *
 * @desc 获取物品实例详情（包含事件历史）
 * @access Private（role_level >= 100）
 *
 * @param {number} item_instance_id - 物品实例ID
 * @returns {Object} { item, events }
 */
router.get('/:item_instance_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const item_instance_id = parseInt(req.params.item_instance_id)
    if (!item_instance_id || isNaN(item_instance_id)) {
      return res.apiError('无效的物品实例ID', 'INVALID_PARAM', null, 400)
    }

    const { ItemInstance, ItemTemplate, User, ItemInstanceEvent } = req.app.locals.models

    /* 查询物品实例（管理员可查看任何用户的物品） */
    const item = await ItemInstance.findByPk(item_instance_id, {
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['user_id', 'nickname', 'phone']
        },
        {
          model: ItemTemplate,
          as: 'itemTemplate',
          attributes: ['item_template_id', 'name', 'item_type', 'rarity_code', 'description']
        }
      ]
    })

    if (!item) {
      return res.apiError('物品实例不存在', 'NOT_FOUND', null, 404)
    }

    /* 查询物品事件历史 */
    let events = []
    if (ItemInstanceEvent) {
      events = await ItemInstanceEvent.findAll({
        where: { item_instance_id },
        order: [['created_at', 'DESC']],
        limit: 50
      })
    }

    const itemJson = item.toJSON()
    const meta = itemJson.meta || {}

    logger.info('[物品实例管理] 查询详情', {
      admin_id: req.user.user_id,
      item_instance_id
    })

    return res.apiSuccess(
      {
        item: {
          ...itemJson,
          item_name: meta.name || itemJson.itemTemplate?.name || '-',
          template_name: itemJson.itemTemplate?.name || null,
          rarity_code: itemJson.itemTemplate?.rarity_code || null
        },
        events: events.map(e => (e.toJSON ? e.toJSON() : e))
      },
      '获取物品详情成功'
    )
  } catch (error) {
    logger.error('[物品实例管理] 查询详情失败', {
      admin_id: req.user?.user_id,
      item_instance_id: req.params.item_instance_id,
      error: error.message
    })
    return handleServiceError(error, res, '获取物品详情失败')
  }
})

/**
 * POST /api/v4/console/item-instances/:item_instance_id/freeze
 *
 * @desc 冻结物品（添加 security 锁定）
 * @access Private（role_level >= 100）
 *
 * @param {number} item_instance_id - 物品实例ID
 * @body {string} reason            - 冻结原因（必填）
 * @body {string} [lock_id]         - 锁定关联单号（如 risk_case_xxx，可选，自动生成）
 *
 * @returns {Object} 冻结结果
 */
router.post(
  '/:item_instance_id/freeze',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const item_instance_id = parseInt(req.params.item_instance_id)
      if (!item_instance_id || isNaN(item_instance_id)) {
        return res.apiError('无效的物品实例ID', 'INVALID_PARAM', null, 400)
      }

      const { reason, lock_id } = req.body
      if (!reason || !reason.trim()) {
        return res.apiError('冻结原因不能为空', 'REASON_REQUIRED', null, 400)
      }

      const TransactionManager = require('../../../utils/TransactionManager')
      const ItemService = req.app.locals.services.getService('asset_item')

      const result = await TransactionManager.execute(async transaction => {
        return await ItemService.lockItem(
          {
            item_instance_id,
            lock_type: 'security',
            lock_id: lock_id || `risk_case_admin_${req.user.user_id}_${Date.now()}`,
            reason: `管理员冻结: ${reason.trim()}（操作人ID: ${req.user.user_id}）`,
            operator_id: req.user.user_id
          },
          { transaction }
        )
      })

      logger.info('[物品实例管理] 冻结物品', {
        admin_id: req.user.user_id,
        item_instance_id,
        reason
      })

      return res.apiSuccess(result, '物品冻结成功')
    } catch (error) {
      logger.error('[物品实例管理] 冻结物品失败', {
        admin_id: req.user?.user_id,
        item_instance_id: req.params.item_instance_id,
        error: error.message
      })
      return handleServiceError(error, res, '冻结物品失败')
    }
  }
)

/**
 * POST /api/v4/console/item-instances/:item_instance_id/unfreeze
 *
 * @desc 解冻物品（移除 security 锁定）
 * @access Private（role_level >= 100）
 *
 * @param {number} item_instance_id - 物品实例ID
 * @body {string} reason            - 解冻原因（必填）
 * @body {string} lock_id           - 要移除的锁定单号（必填）
 *
 * @returns {Object} 解冻结果
 */
router.post(
  '/:item_instance_id/unfreeze',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const item_instance_id = parseInt(req.params.item_instance_id)
      if (!item_instance_id || isNaN(item_instance_id)) {
        return res.apiError('无效的物品实例ID', 'INVALID_PARAM', null, 400)
      }

      const { reason, lock_id } = req.body
      if (!reason || !reason.trim()) {
        return res.apiError('解冻原因不能为空', 'REASON_REQUIRED', null, 400)
      }
      if (!lock_id) {
        return res.apiError('锁定单号不能为空', 'LOCK_ID_REQUIRED', null, 400)
      }

      const TransactionManager = require('../../../utils/TransactionManager')
      const ItemService = req.app.locals.services.getService('asset_item')

      const result = await TransactionManager.execute(async transaction => {
        return await ItemService.unlockItem(
          {
            item_instance_id,
            lock_type: 'security',
            lock_id,
            reason: `管理员解冻: ${reason.trim()}（操作人ID: ${req.user.user_id}）`,
            operator_id: req.user.user_id
          },
          { transaction }
        )
      })

      logger.info('[物品实例管理] 解冻物品', {
        admin_id: req.user.user_id,
        item_instance_id,
        lock_id,
        reason
      })

      return res.apiSuccess(result, '物品解冻成功')
    } catch (error) {
      logger.error('[物品实例管理] 解冻物品失败', {
        admin_id: req.user?.user_id,
        item_instance_id: req.params.item_instance_id,
        error: error.message
      })
      return handleServiceError(error, res, '解冻物品失败')
    }
  }
)

/**
 * POST /api/v4/console/item-instances/:item_instance_id/transfer
 *
 * @desc 管理员转移物品所有权
 * @access Private（role_level >= 100）
 *
 * @param {number} item_instance_id - 物品实例ID
 * @body {number} target_user_id    - 目标用户ID（必填）
 * @body {string} reason            - 转移原因（必填）
 *
 * @returns {Object} 转移结果
 */
router.post(
  '/:item_instance_id/transfer',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const item_instance_id = parseInt(req.params.item_instance_id)
      if (!item_instance_id || isNaN(item_instance_id)) {
        return res.apiError('无效的物品实例ID', 'INVALID_PARAM', null, 400)
      }

      const { target_user_id, reason } = req.body
      if (!target_user_id) {
        return res.apiError('目标用户ID不能为空', 'TARGET_USER_REQUIRED', null, 400)
      }
      if (!reason || !reason.trim()) {
        return res.apiError('转移原因不能为空', 'REASON_REQUIRED', null, 400)
      }

      const TransactionManager = require('../../../utils/TransactionManager')
      const ItemService = req.app.locals.services.getService('asset_item')

      const result = await TransactionManager.execute(async transaction => {
        return await ItemService.transferItem(
          {
            item_instance_id,
            from_user_id: null /* 管理员转移无需指定来源 */,
            to_user_id: parseInt(target_user_id),
            reason: `管理员转移: ${reason.trim()}（操作人ID: ${req.user.user_id}）`,
            operator_id: req.user.user_id
          },
          { transaction }
        )
      })

      logger.info('[物品实例管理] 转移物品', {
        admin_id: req.user.user_id,
        item_instance_id,
        target_user_id,
        reason
      })

      return res.apiSuccess(result, '物品转移成功')
    } catch (error) {
      logger.error('[物品实例管理] 转移物品失败', {
        admin_id: req.user?.user_id,
        item_instance_id: req.params.item_instance_id,
        error: error.message
      })
      return handleServiceError(error, res, '转移物品失败')
    }
  }
)

/**
 * 来源类型中文显示映射（私有辅助函数）
 *
 * @param {string} sourceType - 来源类型编码
 * @returns {string} 来源类型中文显示
 */
function _getSourceDisplay(sourceType) {
  const map = {
    lottery: '抽奖',
    gift: '赠送',
    admin: '管理员发放',
    purchase: '购买',
    exchange: '兑换',
    transfer: '转移',
    system: '系统发放'
  }
  return map[sourceType] || sourceType || '-'
}

module.exports = router
