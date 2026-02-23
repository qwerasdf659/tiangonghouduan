'use strict'

/**
 * 管理员物品管理路由（三表模型）
 *
 * @route /api/v4/console/item-instances
 * @description 管理员查看和管理所有用户的物品
 *
 * 📌 模块说明：
 * - 此模块属于 console 域，仅限 admin（role_level >= 100）访问
 * - 提供全平台物品列表、详情、冻结/解冻操作
 * - 所有写操作通过 ServiceManager 获取 ItemService 执行
 * - 三表模型：items（缓存）+ item_ledger（真相）+ item_holds（锁定）
 *
 * API列表：
 * - GET  /                   - 物品列表（支持分页、筛选）
 * - GET  /user/:user_id      - 指定用户的物品列表
 * - GET  /:id                - 物品详情（含账本记录）
 * - POST /:id/freeze         - 冻结物品（security 锁定）
 * - POST /:id/unfreeze       - 解冻物品（移除 security 锁定）
 * - POST /:id/transfer       - 管理员转移物品所有权
 *
 * @module routes/v4/console/item-instances
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger')
const TransactionManager = require('../../../utils/TransactionManager')
const { attachDisplayNames, DICT_TYPES } = require('../../../utils/displayNameHelper')

/**
 * GET /api/v4/console/item-instances
 *
 * @desc 获取全平台物品列表（管理员视角，查询 items 表）
 * @access Private（role_level >= 100）
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      page = 1,
      page_size = 20,
      owner_account_id,
      status,
      item_type,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query

    const parsedPage = Math.max(1, parseInt(page) || 1)
    const parsedPageSize = Math.min(100, Math.max(1, parseInt(page_size) || 20))

    const { Item, Account, User } = req.app.locals.models

    const where = {}
    if (owner_account_id) where.owner_account_id = parseInt(owner_account_id)
    if (status) where.status = status
    if (item_type) where.item_type = item_type

    const allowedSortFields = ['created_at', 'item_id', 'status', 'owner_account_id', 'item_value']
    const actualSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'created_at'
    const actualSortOrder = sort_order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    const { count, rows } = await Item.findAndCountAll({
      where,
      include: [
        {
          model: Account,
          as: 'ownerAccount',
          attributes: ['account_id', 'user_id', 'account_type'],
          required: false,
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['user_id', 'nickname', 'mobile'],
              required: false
            }
          ]
        }
      ],
      order: [[actualSortBy, actualSortOrder]],
      limit: parsedPageSize,
      offset: (parsedPage - 1) * parsedPageSize
    })

    const items = rows.map(row => {
      const json = row.toJSON()
      return {
        ...json,
        owner_nickname: json.ownerAccount?.user?.nickname || null,
        owner_mobile: json.ownerAccount?.user?.mobile || null
      }
    })

    await attachDisplayNames(items, [
      { field: 'status', dictType: DICT_TYPES.ITEM_STATUS },
      { field: 'item_type', dictType: DICT_TYPES.ITEM_TYPE }
    ])

    logger.info('[物品管理] 查询列表', {
      admin_id: req.user.user_id,
      total: count,
      page: parsedPage
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
      '获取物品列表成功'
    )
  } catch (error) {
    logger.error('[物品管理] 查询列表失败', {
      admin_id: req.user?.user_id,
      error: error.message
    })
    return handleServiceError(error, res, '获取物品列表失败')
  }
})

/**
 * GET /api/v4/console/item-instances/user/:user_id
 *
 * @desc 获取指定用户的物品列表
 * @access Private（role_level >= 100）
 */
router.get('/user/:user_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)
    if (!user_id || isNaN(user_id)) {
      return res.apiError('无效的用户ID', 'INVALID_PARAM', null, 400)
    }

    const { page = 1, page_size = 20, status, item_type } = req.query

    const ItemService = req.app.locals.services.getService('asset_item')
    const result = await ItemService.getUserItems(
      { user_id },
      {
        item_type: item_type || null,
        status: status || null,
        page: Math.max(1, parseInt(page) || 1),
        page_size: Math.min(100, Math.max(1, parseInt(page_size) || 20))
      }
    )

    logger.info('[物品管理] 查询用户物品', {
      admin_id: req.user.user_id,
      target_user_id: user_id,
      count: result.total
    })

    return res.apiSuccess(result, '获取用户物品列表成功')
  } catch (error) {
    logger.error('[物品管理] 查询用户物品失败', {
      admin_id: req.user?.user_id,
      target_user_id: req.params.user_id,
      error: error.message
    })
    return handleServiceError(error, res, '获取用户物品列表失败')
  }
})

/**
 * GET /api/v4/console/item-instances/:id
 *
 * @desc 获取物品详情（包含账本记录和锁定历史）
 * @access Private（role_level >= 100）
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const item_id = parseInt(req.params.id)
    if (!item_id || isNaN(item_id)) {
      return res.apiError('无效的物品ID', 'INVALID_PARAM', null, 400)
    }

    const { Item, ItemLedger, ItemHold, Account } = req.app.locals.models

    const item = await Item.findByPk(item_id, {
      include: [
        {
          model: Account,
          as: 'ownerAccount',
          attributes: ['account_id', 'user_id', 'account_type']
        }
      ]
    })

    if (!item) {
      return res.apiError('物品不存在', 'NOT_FOUND', null, 404)
    }

    /* 查询账本记录（item_ledger，三表模型真相层） */
    const ledgerEntries = await ItemLedger.findAll({
      where: { item_id },
      order: [['created_at', 'DESC']],
      limit: 50
    })

    /* 查询锁定历史 */
    const holds = await ItemHold.findAll({
      where: { item_id },
      order: [['created_at', 'DESC']],
      limit: 20
    })

    logger.info('[物品管理] 查询详情', {
      admin_id: req.user.user_id,
      item_id
    })

    return res.apiSuccess(
      {
        item: item.toJSON(),
        ledger_entries: ledgerEntries.map(e => e.toJSON()),
        holds: holds.map(h => h.toJSON())
      },
      '获取物品详情成功'
    )
  } catch (error) {
    logger.error('[物品管理] 查询详情失败', {
      admin_id: req.user?.user_id,
      item_id: req.params.id,
      error: error.message
    })
    return handleServiceError(error, res, '获取物品详情失败')
  }
})

/**
 * POST /api/v4/console/item-instances/:id/freeze
 *
 * @desc 冻结物品（添加 security 锁定到 item_holds）
 * @access Private（role_level >= 100）
 */
router.post('/:id/freeze', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const item_id = parseInt(req.params.id)
    if (!item_id || isNaN(item_id)) {
      return res.apiError('无效的物品ID', 'INVALID_PARAM', null, 400)
    }

    const { reason } = req.body
    if (!reason || !reason.trim()) {
      return res.apiError('冻结原因不能为空', 'REASON_REQUIRED', null, 400)
    }

    const ItemService = req.app.locals.services.getService('asset_item')
    const result = await TransactionManager.execute(async transaction => {
      return await ItemService.holdItem(
        {
          item_id,
          hold_type: 'security',
          holder_ref: `risk_case_admin_${req.user.user_id}_${Date.now()}`,
          reason: `管理员冻结: ${reason.trim()}（操作人ID: ${req.user.user_id}）`
        },
        { transaction }
      )
    })

    logger.info('[物品管理] 冻结物品', {
      admin_id: req.user.user_id,
      item_id,
      reason
    })

    return res.apiSuccess(result, '物品冻结成功')
  } catch (error) {
    logger.error('[物品管理] 冻结物品失败', {
      admin_id: req.user?.user_id,
      item_id: req.params.id,
      error: error.message
    })
    return handleServiceError(error, res, '冻结物品失败')
  }
})

/**
 * POST /api/v4/console/item-instances/:id/unfreeze
 *
 * @desc 解冻物品（释放 item_holds 中的 security 锁定）
 * @access Private（role_level >= 100）
 */
router.post('/:id/unfreeze', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const item_id = parseInt(req.params.id)
    if (!item_id || isNaN(item_id)) {
      return res.apiError('无效的物品ID', 'INVALID_PARAM', null, 400)
    }

    const { reason, hold_id } = req.body
    if (!reason || !reason.trim()) {
      return res.apiError('解冻原因不能为空', 'REASON_REQUIRED', null, 400)
    }
    if (!hold_id) {
      return res.apiError('锁定记录ID不能为空', 'HOLD_ID_REQUIRED', null, 400)
    }

    const ItemService = req.app.locals.services.getService('asset_item')
    const result = await TransactionManager.execute(async transaction => {
      return await ItemService.releaseHold(
        {
          item_id,
          hold_id: parseInt(hold_id),
          reason: `管理员解冻: ${reason.trim()}（操作人ID: ${req.user.user_id}）`
        },
        { transaction }
      )
    })

    logger.info('[物品管理] 解冻物品', {
      admin_id: req.user.user_id,
      item_id,
      hold_id,
      reason
    })

    return res.apiSuccess(result, '物品解冻成功')
  } catch (error) {
    logger.error('[物品管理] 解冻物品失败', {
      admin_id: req.user?.user_id,
      item_id: req.params.id,
      error: error.message
    })
    return handleServiceError(error, res, '解冻物品失败')
  }
})

/**
 * POST /api/v4/console/item-instances/:id/transfer
 *
 * @desc 管理员转移物品所有权（通过 item_ledger 双录）
 * @access Private（role_level >= 100）
 */
router.post('/:id/transfer', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const item_id = parseInt(req.params.id)
    if (!item_id || isNaN(item_id)) {
      return res.apiError('无效的物品ID', 'INVALID_PARAM', null, 400)
    }

    const { target_user_id, reason } = req.body
    if (!target_user_id) {
      return res.apiError('目标用户ID不能为空', 'TARGET_USER_REQUIRED', null, 400)
    }
    if (!reason || !reason.trim()) {
      return res.apiError('转移原因不能为空', 'REASON_REQUIRED', null, 400)
    }

    const ItemService = req.app.locals.services.getService('asset_item')
    const result = await TransactionManager.execute(async transaction => {
      return await ItemService.transferItem(
        {
          item_id,
          to_user_id: parseInt(target_user_id),
          reason: `管理员转移: ${reason.trim()}（操作人ID: ${req.user.user_id}）`,
          operator_id: req.user.user_id,
          business_type: 'admin_transfer'
        },
        { transaction }
      )
    })

    logger.info('[物品管理] 转移物品', {
      admin_id: req.user.user_id,
      item_id,
      target_user_id,
      reason
    })

    return res.apiSuccess(result, '物品转移成功')
  } catch (error) {
    logger.error('[物品管理] 转移物品失败', {
      admin_id: req.user?.user_id,
      item_id: req.params.id,
      error: error.message
    })
    return handleServiceError(error, res, '转移物品失败')
  }
})

module.exports = router
