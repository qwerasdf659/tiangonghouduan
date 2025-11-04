/**
 * 餐厅积分抽奖系统 V4.0 - 用户库存管理API
 * 处理用户库存的增删改查，包含icon字段支持
 *
 * 功能说明：
 * - 获取用户库存列表（支持icon字段显示）
 * - 查看库存物品详情
 * - 使用库存物品
 * - 转让库存物品
 * - 管理员库存管理
 *
 * 创建时间：2025年01月21日
 * 使用 Claude Sonnet 4 模型
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const express = require('express')
const router = express.Router()
const models = require('../../../models')
const ApiResponse = require('../../../utils/ApiResponse')
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')
const { Op } = require('sequelize')

const logger = new Logger('InventoryAPI')

/**
 * 获取用户库存列表
 * GET /api/v4/inventory/user/:user_id
 */
router.get('/user/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const { status, type, page = 1, limit = 20 } = req.query
    // 🎯 分页安全保护：最大50条记录（普通用户库存列表）
    const finalLimit = Math.min(parseInt(limit), 50)

    // 构建查询条件
    const whereConditions = { user_id }

    if (status) {
      whereConditions.status = status
    }

    if (type) {
      whereConditions.type = type
    }

    // 分页参数
    const offset = (page - 1) * finalLimit

    // 查询用户库存
    const { count, rows: inventory } = await models.UserInventory.findAndCountAll({
      where: whereConditions,
      attributes: [
        'inventory_id', // 主键字段（修复：原为'id'，应使用正确的主键名称）
        'name',
        'description',
        'icon', // 🎯 包含新添加的icon字段
        'type',
        'value',
        'status',
        'source_type',
        'source_id',
        'acquired_at',
        'expires_at',
        'used_at',
        'verification_code',
        'verification_expires_at',
        'transfer_to_user_id',
        'transfer_at',
        'created_at',
        'updated_at'
      ],
      order: [['acquired_at', 'DESC']],
      limit: finalLimit,
      offset
    })

    // 处理数据，确保icon字段正确显示
    const processedInventory = inventory.map(item => {
      const itemData = item.toJSON()

      // 如果没有设置icon，根据type设置默认icon
      if (!itemData.icon) {
        switch (itemData.type) {
        case 'voucher':
          itemData.icon = '🎫'
          break
        case 'product':
          itemData.icon = '🎁'
          break
        case 'service':
          itemData.icon = '🔧'
          break
        default:
          itemData.icon = '📦'
        }
      }

      // 添加状态描述
      itemData.status_description = getStatusDescription(itemData.status)

      // 添加过期状态
      if (itemData.expires_at) {
        itemData.is_expired = BeijingTimeHelper.createBeijingTime() > new Date(itemData.expires_at)
      }

      return itemData
    })

    logger.info('获取用户库存成功', {
      user_id,
      total: count,
      returned: inventory.length,
      filters: { status, type }
    })

    return ApiResponse.success(
      res,
      {
        inventory: processedInventory,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: finalLimit,
          total_pages: Math.ceil(count / finalLimit)
        }
      },
      '获取库存列表成功'
    )
  } catch (error) {
    logger.error('获取用户库存失败', { error: error.message, user_id: req.params.user_id })
    return ApiResponse.error(res, '获取库存列表失败', 500)
  }
})

/**
 * 获取库存物品详情
 * GET /api/v4/inventory/item/:item_id
 */
router.get('/item/:item_id', authenticateToken, async (req, res) => {
  try {
    const { item_id } = req.params

    const item = await models.UserInventory.findOne({
      where: { inventory_id: item_id },
      include: [
        {
          model: models.User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ]
    })

    if (!item) {
      return ApiResponse.error(res, '库存物品不存在', 404)
    }

    const itemData = item.toJSON()

    // 确保icon字段存在
    if (!itemData.icon) {
      switch (itemData.type) {
      case 'voucher':
        itemData.icon = '🎫'
        break
      case 'product':
        itemData.icon = '🎁'
        break
      case 'service':
        itemData.icon = '🔧'
        break
      default:
        itemData.icon = '📦'
      }
    }

    logger.info('获取库存物品详情成功', { item_id, user_id: item.user_id })

    return ApiResponse.success(res, { item: itemData }, '获取物品详情成功')
  } catch (error) {
    logger.error('获取库存物品详情失败', { error: error.message, item_id: req.params.item_id })
    return ApiResponse.error(res, '获取物品详情失败', 500)
  }
})

/**
 * 使用库存物品
 * POST /api/v4/inventory/use/:item_id
 */
router.post('/use/:item_id', authenticateToken, async (req, res) => {
  try {
    const { item_id } = req.params
    const { verification_code } = req.body

    const item = await models.UserInventory.findOne({
      where: { inventory_id: item_id }
    })

    if (!item) {
      return ApiResponse.error(res, '库存物品不存在', 404)
    }

    // 检查物品状态
    if (item.status !== 'available') {
      return ApiResponse.error(res, '物品不可使用', 400)
    }

    // 检查是否过期
    if (item.expires_at && BeijingTimeHelper.createDatabaseTime() > new Date(item.expires_at)) {
      await item.update({ status: 'expired' })
      return ApiResponse.error(res, '物品已过期', 400)
    }

    // 如果需要验证码，检查验证码
    if (item.verification_code && item.verification_code !== verification_code) {
      return ApiResponse.error(res, '验证码错误', 400)
    }

    // 使用物品
    await item.update({
      status: 'used',
      used_at: BeijingTimeHelper.createBeijingTime()
    })

    logger.info('库存物品使用成功', {
      item_id,
      user_id: item.user_id,
      item_name: item.name
    })

    return ApiResponse.success(res, { item }, '物品使用成功')
  } catch (error) {
    logger.error('使用库存物品失败', { error: error.message, item_id: req.params.item_id })
    return ApiResponse.error(res, '物品使用失败', 500)
  }
})

/**
 * 管理员获取所有用户库存统计
 * GET /api/v4/inventory/admin/statistics
 */
router.get('/admin/statistics', requireAdmin, async (req, res) => {
  try {
    // 获取库存统计数据
    const [totalItems, availableItems, usedItems, expiredItems, typeStats, recentItems] =
      await Promise.all([
        models.UserInventory.count(),
        models.UserInventory.count({ where: { status: 'available' } }),
        models.UserInventory.count({ where: { status: 'used' } }),
        models.UserInventory.count({ where: { status: 'expired' } }),
        models.UserInventory.findAll({
          attributes: ['type', 'icon', [models.sequelize.fn('COUNT', '*'), 'count']],
          group: ['type', 'icon']
        }),
        models.UserInventory.findAll({
          attributes: ['id', 'name', 'type', 'icon', 'status', 'created_at'],
          order: [['created_at', 'DESC']],
          limit: 10
        })
      ])

    const statistics = {
      total_items: totalItems,
      available_items: availableItems,
      used_items: usedItems,
      expired_items: expiredItems,
      usage_rate: totalItems > 0 ? ((usedItems / totalItems) * 100).toFixed(2) : 0,
      type_distribution: typeStats.map(stat => ({
        type: stat.type,
        icon: stat.icon || getDefaultIcon(stat.type),
        count: parseInt(stat.dataValues.count)
      })),
      recent_items: recentItems.map(item => ({
        ...item.toJSON(),
        icon: item.icon || getDefaultIcon(item.type)
      }))
    }

    logger.info('管理员获取库存统计成功', { admin_id: req.user.user_id })

    return ApiResponse.success(res, { statistics }, '获取库存统计成功')
  } catch (error) {
    logger.error('获取库存统计失败', { error: error.message })
    return ApiResponse.error(res, '获取库存统计失败', 500)
  }
})

/**
 * 获取商品列表（兑换商品）
 * GET /api/v4/inventory/products
 */
router.get('/products', authenticateToken, async (req, res) => {
  try {
    const { space = 'lucky', category, page = 1, limit = 20 } = req.query
    // 🎯 分页安全保护：最大50条记录（普通用户商品列表）
    const finalLimit = Math.min(parseInt(limit), 50)
    const { getUserRoles } = require('../../../middleware/auth')
    const DataSanitizer = require('../../../services/DataSanitizer')

    // 获取用户权限
    const userRoles = await getUserRoles(req.user.user_id)
    const dataLevel = userRoles.isAdmin ? 'full' : 'public'

    // 构建查询条件
    const whereClause = {
      status: 'active' // 商品状态必须为active
    }

    // 空间过滤
    if (space !== 'all') {
      whereClause.space = [space, 'both']
    }

    // 分类过滤
    if (category && category !== 'all') {
      whereClause.category = category
    }

    const offset = (page - 1) * finalLimit

    // 查询商品
    const { count, rows: products } = await models.Product.findAndCountAll({
      where: whereClause,
      order: [
        ['sort_order', 'ASC'],
        ['created_at', 'DESC']
      ],
      limit: finalLimit,
      offset
    })

    // 🆕 转换为对应空间的展示信息（方案2核心逻辑）
    const space_products = products
      .map(p => {
        // 如果商品有getSpaceInfo方法，使用它获取空间特定信息
        if (typeof p.getSpaceInfo === 'function') {
          const space_info = p.getSpaceInfo(space)
          if (space_info) {
            return space_info
          }
        }
        // 否则返回原始数据
        return p.toJSON()
      })
      .filter(Boolean) // 过滤掉null值（商品不在该空间）

    // 数据脱敏处理
    const sanitizedProducts = DataSanitizer.sanitizeExchangeProducts(space_products, dataLevel)

    logger.info('获取商品列表成功', {
      user_id: req.user.user_id,
      space,
      category,
      total: count,
      returned: products.length
    })

    // ✅ 修复：使用正确的响应方法
    return res.apiSuccess(
      {
        products: sanitizedProducts,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: finalLimit,
          total_pages: Math.ceil(count / finalLimit)
        }
      },
      '获取商品列表成功'
    )
  } catch (error) {
    logger.error('获取商品列表失败', { error: error.message })
    return res.apiError('获取商品列表失败', 'PRODUCT_LIST_ERROR', null, 500)
  }
})

/**
 * 兑换商品
 * POST /api/v4/inventory/exchange
 */
router.post('/exchange', authenticateToken, async (req, res) => {
  try {
    const { product_id, quantity = 1, space = 'lucky' } = req.body // 🆕 新增space参数（默认lucky）
    const user_id = req.user.user_id
    const PointsService = require('../../../services/PointsService')

    // 参数验证
    if (product_id === undefined || product_id === null) {
      return res.apiError('商品ID不能为空', 'INVALID_PARAMETER', null, 400)
    }

    if (quantity <= 0 || quantity > 10) {
      return res.apiError('兑换数量必须在1-10之间', 'INVALID_QUANTITY', null, 400)
    }

    // 🆕 验证空间参数（新增逻辑）
    if (!['lucky', 'premium'].includes(space)) {
      return res.apiError('空间参数错误，必须是lucky或premium', 'INVALID_SPACE', null, 400)
    }

    // 执行兑换（🆕 传递space参数）
    const result = await PointsService.exchangeProduct(user_id, product_id, quantity, space)

    logger.info('商品兑换成功', {
      user_id,
      product_id,
      space, // 🆕 记录兑换空间
      quantity,
      exchange_id: result.exchange_id,
      total_points: result.total_points
    })

    return res.apiSuccess(result, '商品兑换成功')
  } catch (error) {
    logger.error('商品兑换失败', {
      error: error.message,
      user_id: req.user.user_id,
      product_id: req.body.product_id
    })
    return res.apiError(error.message, 'EXCHANGE_FAILED', null, 500)
  }
})

/**
 * 获取兑换记录
 * GET /api/v4/inventory/exchange-records
 */
router.get('/exchange-records', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, space } = req.query
    const user_id = req.user.user_id
    const PointsService = require('../../../services/PointsService')
    const DataSanitizer = require('../../../services/DataSanitizer')
    const { getUserRoles } = require('../../../middleware/auth')

    // 获取用户权限
    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.isAdmin ? 'full' : 'public'

    // 获取兑换记录
    const result = await PointsService.getExchangeRecords(user_id, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      space
    })

    // 数据脱敏处理
    const sanitizedRecords = DataSanitizer.sanitizeExchangeRecords(
      result.records.map(r => r.toJSON()),
      dataLevel
    )

    logger.info('获取兑换记录成功', {
      user_id,
      total: result.pagination.total,
      returned: result.records.length
    })

    return ApiResponse.success(
      res,
      {
        records: sanitizedRecords,
        pagination: result.pagination
      },
      '获取兑换记录成功'
    )
  } catch (error) {
    logger.error('获取兑换记录失败', { error: error.message, user_id: req.user.user_id })
    return ApiResponse.error(res, '获取兑换记录失败', 500)
  }
})

/**
 * 生成核销码
 * POST /api/v4/inventory/generate-code/:item_id
 */
router.post('/generate-code/:item_id', authenticateToken, async (req, res) => {
  try {
    const { item_id } = req.params
    const PointsService = require('../../../services/PointsService')

    // 查找库存物品
    const item = await models.UserInventory.findOne({
      where: { inventory_id: item_id, user_id: req.user.user_id }
    })

    if (!item) {
      return ApiResponse.error(res, '库存物品不存在', 404)
    }

    if (item.status !== 'available') {
      return ApiResponse.error(res, '物品状态不允许生成核销码', 400)
    }

    // 生成新的核销码
    const verificationCode = PointsService.generateVerificationCode()
    const expiresAt = BeijingTimeHelper.futureTime(24 * 60 * 60 * 1000) // 24小时后过期

    await item.update({
      verification_code: verificationCode,
      verification_expires_at: expiresAt
    })

    logger.info('生成核销码成功', {
      item_id,
      user_id: req.user.user_id,
      verification_code: verificationCode
    })

    return ApiResponse.success(
      res,
      {
        verification_code: verificationCode,
        expires_at: expiresAt
      },
      '核销码生成成功'
    )
  } catch (error) {
    logger.error('生成核销码失败', { error: error.message, item_id: req.params.item_id })
    return ApiResponse.error(res, '生成核销码失败', 500)
  }
})

/**
 * 取消兑换记录（仅限pending状态）
 * POST /api/v4/inventory/exchange-records/:id/cancel
 *
 * 业务规则（基于严格人工审核模式）：
 * - 只能取消pending（待审核）状态的订单
 * - 已审核通过（distributed）的订单不能取消
 * - 取消后自动退回积分和恢复库存
 */
router.post('/exchange-records/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id: exchange_id } = req.params
    const { reason } = req.body
    const user_id = req.user.user_id

    // 1. 参数验证
    if (!reason || reason.trim().length === 0) {
      return ApiResponse.error(res, '取消原因不能为空', 400)
    }

    if (reason.length > 200) {
      return ApiResponse.error(res, '取消原因不能超过200字符', 400)
    }

    // 2. 查找兑换记录（过滤已删除记录）
    const exchangeRecord = await models.ExchangeRecords.findByPk(exchange_id)

    if (!exchangeRecord) {
      return ApiResponse.error(res, '兑换记录不存在', 404)
    }

    // 检查记录是否已被删除
    if (exchangeRecord.is_deleted === 1) {
      return ApiResponse.error(res, '兑换记录不存在或已被删除', 404)
    }

    // 3. 验证权限：只允许用户取消自己的兑换记录
    if (exchangeRecord.user_id !== user_id) {
      return ApiResponse.error(res, '无权限取消此兑换记录', 403)
    }

    // 4. 验证兑换状态：只允许取消pending状态的记录（严格人工审核模式）
    if (exchangeRecord.status !== 'pending' || exchangeRecord.audit_status !== 'pending') {
      const statusText =
        {
          distributed: '已审核通过',
          used: '已使用',
          expired: '已过期',
          cancelled: '已取消'
        }[exchangeRecord.status] || '当前状态'

      return ApiResponse.error(res, `${statusText}的兑换记录无法取消`, 400)
    }

    // 5. 使用模型的cancel()方法（保证业务逻辑一致性，内部已处理事务）
    await exchangeRecord.cancel(reason)

    logger.info('兑换取消成功', {
      exchange_id,
      user_id: exchangeRecord.user_id,
      refunded_points: exchangeRecord.total_points,
      reason,
      cancelled_at: exchangeRecord.audited_at
    })

    return ApiResponse.success(
      res,
      {
        exchange_id: exchangeRecord.exchange_id,
        status: exchangeRecord.status,
        cancelled_at: exchangeRecord.audited_at,
        refunded_points: exchangeRecord.total_points,
        reason: exchangeRecord.audit_reason
      },
      '兑换已取消，积分已退回'
    )
  } catch (error) {
    logger.error('兑换取消失败', {
      error: error.message,
      exchange_id: req.params.id,
      user_id: req.user.user_id
    })
    return ApiResponse.error(res, error.message || '兑换取消失败', 500)
  }
})

/**
 * 辅助函数：获取状态描述
 * @param {string} status - 物品状态（available/pending/used/expired/transferred）
 * @returns {string} 状态的中文描述
 */
function getStatusDescription (status) {
  const statusMap = {
    available: '可用',
    pending: '待处理',
    used: '已使用',
    expired: '已过期',
    transferred: '已转让'
  }
  return statusMap[status] || status
}

/**
 * 辅助函数：获取默认图标
 * @param {string} type - 物品类型（voucher/product/service）
 * @returns {string} 对应类型的emoji图标
 */
function getDefaultIcon (type) {
  const iconMap = {
    voucher: '🎫',
    product: '🎁',
    service: '🔧'
  }
  return iconMap[type] || '��'
}

/**
 * 简化版交易市场功能
 * GET /api/v4/inventory/market/products
 */
router.get('/market/products', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, category = null, sort = 'newest' } = req.query
    // 🎯 分页安全保护：最大50条记录（普通用户交易市场）
    const finalLimit = Math.min(parseInt(limit), 50)

    const offset = (page - 1) * finalLimit

    // 查询在售商品（从用户库存中查找）
    const whereClause = {
      market_status: 'on_sale',
      is_available: true
    }

    if (category && category !== 'all') {
      whereClause.item_type = category
    }

    // 排序规则
    let order = [['created_at', 'DESC']]
    switch (sort) {
    case 'price_low':
      order = [['selling_points', 'ASC']]
      break
    case 'price_high':
      order = [['selling_points', 'DESC']]
      break
    case 'newest':
      order = [['created_at', 'DESC']]
      break
    }

    const { count, rows: marketProducts } = await models.UserInventory.findAndCountAll({
      where: whereClause,
      order,
      limit: finalLimit,
      offset
    })

    // 转换为市场商品格式
    const formattedProducts = marketProducts.map(item => ({
      id: item.id,
      seller_id: item.user_id,
      name: item.item_name || item.name,
      description: item.description || '暂无描述',
      selling_points: item.selling_points || 0,
      condition: item.condition || 'good',
      category: item.item_type || 'other',
      is_available: item.is_available,
      created_at: item.created_at
    }))

    // 使用DataSanitizer进行数据脱敏
    const DataSanitizer = require('../../../services/DataSanitizer')
    const sanitizedProducts = DataSanitizer.sanitizeMarketProducts(
      formattedProducts,
      req.user.isAdmin ? 'full' : 'public'
    )

    logger.info('获取交易市场商品成功', {
      user_id: req.user.user_id,
      total: count,
      returned: marketProducts.length
    })

    return ApiResponse.success(
      res,
      {
        products: sanitizedProducts,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(count / limit),
          total_count: count,
          has_next: count > page * limit
        }
      },
      '获取交易市场商品成功'
    )
  } catch (error) {
    logger.error('获取交易市场商品失败', { error: error.message })
    return ApiResponse.error(res, '获取交易市场商品失败', 500)
  }
})

/**
 * 转让库存物品
 * POST /api/v4/inventory/transfer
 */
router.post('/transfer', authenticateToken, async (req, res) => {
  try {
    const { item_id, target_user_id, transfer_note } = req.body
    const currentUserId = req.user.user_id

    // 参数验证
    if (!item_id || !target_user_id) {
      return ApiResponse.error(res, '物品ID和目标用户ID不能为空', 400)
    }

    if (currentUserId === parseInt(target_user_id)) {
      return ApiResponse.error(res, '不能转让给自己', 400)
    }

    // 查找库存物品
    const item = await models.UserInventory.findOne({
      where: {
        id: item_id,
        user_id: currentUserId,
        status: 'available'
      }
    })

    if (!item) {
      return ApiResponse.error(res, '库存物品不存在或不可转让', 404)
    }

    // 检查物品是否可以转让
    if (item.can_transfer === false) {
      return ApiResponse.error(res, '该物品不支持转让', 400)
    }

    // 检查物品是否已过期
    if (item.expires_at && BeijingTimeHelper.createDatabaseTime() > new Date(item.expires_at)) {
      await item.update({ status: 'expired' })
      return ApiResponse.error(res, '物品已过期，无法转让', 400)
    }

    // 检查目标用户是否存在
    const targetUser = await models.User.findByPk(target_user_id)
    if (!targetUser) {
      return ApiResponse.error(res, '目标用户不存在', 404)
    }

    // 检查转让次数限制（如果有的话）
    const maxTransferCount = 3 // 最大转让次数
    if (item.transfer_count >= maxTransferCount) {
      return ApiResponse.error(res, `该物品已达到最大转让次数(${maxTransferCount}次)`, 400)
    }

    // 开始数据库事务
    const transaction = await models.sequelize.transaction()

    try {
      // 记录转让历史（如果有TradeRecord模型）
      if (models.TradeRecord) {
        await models.TradeRecord.create(
          {
            from_user_id: currentUserId,
            to_user_id: target_user_id,
            item_type: 'inventory_item',
            item_id,
            item_name: item.name || item.item_name,
            transaction_type: 'transfer',
            status: 'completed',
            transfer_note: transfer_note || '库存物品转让',
            created_at: BeijingTimeHelper.createBeijingTime()
          },
          { transaction }
        )
      }

      // 更新物品所有者
      await item.update(
        {
          user_id: target_user_id,
          transfer_count: (item.transfer_count || 0) + 1,
          last_transfer_at: BeijingTimeHelper.createBeijingTime(),
          last_transfer_from: currentUserId,
          updated_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      // 提交事务
      await transaction.commit()

      logger.info('库存物品转让成功', {
        item_id,
        from_user_id: currentUserId,
        to_user_id: target_user_id,
        item_name: item.name || item.item_name,
        transfer_count: item.transfer_count + 1
      })

      // 构建转让响应数据（已脱敏）
      const sanitizedTransferData = {
        transfer_id: `tf_${BeijingTimeHelper.generateIdTimestamp()}_${Math.random().toString(36).substr(2, 8)}`,
        item_id,
        item_name: item.name || item.item_name,
        from_user_id: currentUserId,
        to_user_id: target_user_id,
        transfer_note: transfer_note || '库存物品转让',
        transfer_count: item.transfer_count + 1,
        transferred_at: BeijingTimeHelper.createBeijingTime()
      }

      return ApiResponse.success(res, sanitizedTransferData, '物品转让成功')
    } catch (transactionError) {
      // 回滚事务
      await transaction.rollback()
      throw transactionError
    }
  } catch (error) {
    logger.error('转让库存物品失败', {
      error: error.message,
      item_id: req.body.item_id,
      current_user: req.user.user_id,
      target_user: req.body.target_user_id
    })
    return ApiResponse.error(res, '物品转让失败', 500)
  }
})

/**
 * 获取物品转让历史记录
 * GET /api/v4/inventory/transfer-history
 */
router.get('/transfer-history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, type = 'all' } = req.query
    // 🎯 分页安全保护：最大50条记录（普通用户转让历史）
    const finalLimit = Math.min(parseInt(limit), 50)
    const user_id = req.user.user_id

    if (!models.TradeRecord) {
      return ApiResponse.error(res, '转让历史功能暂未开放', 503)
    }

    // 构建查询条件
    const whereClause = {
      transaction_type: 'transfer',
      item_type: 'inventory_item'
    }

    if (type === 'sent') {
      whereClause.from_user_id = user_id
    } else if (type === 'received') {
      whereClause.to_user_id = user_id
    } else {
      // type === 'all'
      whereClause[Op.or] = [{ from_user_id: user_id }, { to_user_id: user_id }]
    }

    // 获取转让历史记录
    const { count, rows: transferHistory } = await models.TradeRecord.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: models.User,
          as: 'fromUser',
          attributes: ['id', 'display_name'],
          required: false
        },
        {
          model: models.User,
          as: 'toUser',
          attributes: ['id', 'display_name'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: finalLimit,
      offset: (parseInt(page) - 1) * finalLimit
    })

    // 格式化转让历史数据
    const formattedHistory = transferHistory.map(record => ({
      transfer_id: record.id,
      item_id: record.item_id,
      item_name: record.item_name,
      from_user_id: record.from_user_id,
      from_user_name: record.fromUser?.display_name || '未知用户',
      to_user_id: record.to_user_id,
      to_user_name: record.toUser?.display_name || '未知用户',
      transfer_note: record.transfer_note,
      status: record.status,
      created_at: record.created_at,
      direction: record.from_user_id === user_id ? 'sent' : 'received'
    }))

    logger.info('获取转让历史成功', {
      user_id,
      total: count,
      type,
      page: parseInt(page)
    })

    return ApiResponse.success(
      res,
      {
        transfer_history: formattedHistory,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(count / parseInt(limit)),
          total_count: count,
          has_next: count > parseInt(page) * parseInt(limit)
        },
        filter: {
          type
        }
      },
      '转让历史获取成功'
    )
  } catch (error) {
    logger.error('获取转让历史失败', {
      error: error.message,
      user_id: req.user.user_id
    })
    return ApiResponse.error(res, '获取转让历史失败', 500)
  }
})

/**
 * 核销验证
 * POST /api/v4/inventory/verification/verify
 */
router.post('/verification/verify', authenticateToken, async (req, res) => {
  try {
    const { verification_code } = req.body

    // 参数验证
    if (!verification_code || verification_code.trim().length === 0) {
      return ApiResponse.error(res, '核销码不能为空', 400)
    }

    // 查找库存物品
    const item = await models.UserInventory.findOne({
      where: { verification_code: verification_code.trim().toUpperCase() },
      include: [
        {
          model: models.User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ]
    })

    if (!item) {
      logger.warn('核销码不存在', { verification_code, operator_id: req.user.user_id })
      return ApiResponse.error(res, '核销码不存在或无效', 404)
    }

    // 检查核销码状态
    if (item.status === 'used') {
      return ApiResponse.error(res, '该核销码已使用', 400)
    }

    // 检查是否过期
    if (
      item.verification_expires_at &&
      BeijingTimeHelper.createDatabaseTime() > item.verification_expires_at
    ) {
      return ApiResponse.error(res, '核销码已过期', 400)
    }

    // 核销验证通过，标记为已使用
    await item.update({
      status: 'used',
      used_at: BeijingTimeHelper.createBeijingTime()
    })

    logger.info('核销验证成功', {
      verification_code,
      inventory_id: item.inventory_id,
      user_id: item.user_id,
      operator_id: req.user.user_id
    })

    return ApiResponse.success(
      res,
      {
        inventory_id: item.inventory_id,
        item_name: item.name,
        item_type: item.type,
        value: item.value,
        used_at: item.used_at,
        user: item.user
          ? {
            user_id: item.user.user_id,
            mobile: item.user.mobile,
            nickname: item.user.nickname
          }
          : null
      },
      '核销成功'
    )
  } catch (error) {
    logger.error('核销验证失败', {
      error: error.message,
      verification_code: req.body.verification_code,
      operator_id: req.user.user_id
    })
    return ApiResponse.error(res, '核销验证失败', 500)
  }
})

/**
 * 获取市场商品详情
 * GET /api/v4/inventory/market/products/:id
 */
router.get('/market/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id: product_id } = req.params
    const { getUserRoles } = require('../../../middleware/auth')
    const DataSanitizer = require('../../../services/DataSanitizer')

    // 获取用户权限
    const userRoles = await getUserRoles(req.user.user_id)
    const dataLevel = userRoles.isAdmin ? 'full' : 'public'

    // 查找市场商品
    const marketProduct = await models.UserInventory.findOne({
      where: {
        id: product_id,
        market_status: 'on_sale',
        is_available: true
      },
      include: [
        {
          model: models.User,
          as: 'owner',
          attributes: ['user_id', 'mobile', 'nickname', 'created_at']
        }
      ]
    })

    if (!marketProduct) {
      return ApiResponse.error(res, '市场商品不存在或已下架', 404)
    }

    // 格式化商品详情
    const productDetail = {
      id: marketProduct.id,
      seller_id: marketProduct.user_id,
      seller_info: marketProduct.owner
        ? {
          user_id: marketProduct.owner.user_id,
          nickname: marketProduct.owner.nickname || '匿名用户',
          // 对于非管理员，隐藏敏感信息
          mobile: dataLevel === 'full' ? marketProduct.owner.mobile : '****',
          registration_time: marketProduct.owner.created_at
        }
        : null,

      // 商品基础信息
      name: marketProduct.item_name || marketProduct.name,
      description: marketProduct.description || '暂无描述',
      item_type: marketProduct.item_type || marketProduct.type,

      // 市场相关信息
      selling_points: marketProduct.selling_points,
      condition: marketProduct.condition || 'good',
      market_status: marketProduct.market_status,

      // 商品状态和历史
      acquisition_method: marketProduct.acquisition_method,
      acquisition_cost: marketProduct.acquisition_cost,
      transfer_count: marketProduct.transfer_count || 0,

      // 交易限制
      can_purchase: marketProduct.user_id !== req.user.user_id, // 不能购买自己的商品
      can_withdraw: marketProduct.user_id === req.user.user_id, // 只能撤回自己的商品

      // 时间信息
      listed_at: marketProduct.created_at,
      updated_at: marketProduct.updated_at
    }

    // 数据脱敏处理（使用复数方法处理单个商品）
    const sanitizedDetail = DataSanitizer.sanitizeMarketProducts([productDetail], dataLevel)[0]

    logger.info('获取市场商品详情成功', {
      product_id,
      seller_id: marketProduct.user_id,
      buyer_id: req.user.user_id
    })

    return ApiResponse.success(res, sanitizedDetail, '获取商品详情成功')
  } catch (error) {
    logger.error('获取市场商品详情失败', {
      error: error.message,
      product_id: req.params.id,
      user_id: req.user.user_id
    })
    return ApiResponse.error(res, '获取商品详情失败', 500)
  }
})

/**
 * 购买市场商品
 * POST /api/v4/inventory/market/products/:id/purchase
 */
router.post('/market/products/:id/purchase', authenticateToken, async (req, res) => {
  const transaction = await models.sequelize.transaction()

  try {
    const { id: product_id } = req.params
    const buyer_id = req.user.user_id
    const { purchase_note } = req.body

    // 1. 查找市场商品
    const marketProduct = await models.UserInventory.findOne({
      where: {
        id: product_id,
        market_status: 'on_sale',
        is_available: true
      },
      include: [
        {
          model: models.User,
          as: 'owner',
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ],
      transaction
    })

    if (!marketProduct) {
      await transaction.rollback()
      return ApiResponse.error(res, '商品不存在或已售出', 404)
    }

    // 2. 验证购买权限
    if (marketProduct.user_id === buyer_id) {
      await transaction.rollback()
      return ApiResponse.error(res, '不能购买自己的商品', 400)
    }

    // 3. 检查商品是否可转让
    if (marketProduct.can_transfer === false) {
      await transaction.rollback()
      return ApiResponse.error(res, '该商品不支持转让', 400)
    }

    // 4. 检查买家积分是否足够
    const PointsService = require('../../../services/PointsService')
    const buyerAccount = await PointsService.getPointsAccount(buyer_id)

    if (buyerAccount.balance < marketProduct.selling_points) {
      await transaction.rollback()
      return ApiResponse.error(
        res,
        `积分不足，需要${marketProduct.selling_points}积分，当前${buyerAccount.balance}积分`,
        400
      )
    }

    // 5. 扣除买家积分
    await PointsService.consumePoints(buyer_id, marketProduct.selling_points, {
      business_type: 'market_purchase',
      source_type: 'buy_from_market',
      title: `购买市场商品：${marketProduct.name}`,
      description: `从${marketProduct.owner?.nickname || '用户'}购买商品`,
      transaction
    })

    // 6. 给卖家增加积分（扣除5%手续费）
    const feeRate = 0.05 // 5%手续费
    const fee = Math.floor(marketProduct.selling_points * feeRate)
    const sellerReceived = marketProduct.selling_points - fee

    await PointsService.addPoints(marketProduct.user_id, sellerReceived, {
      business_type: 'market_sale',
      source_type: 'sell_on_market',
      title: `出售市场商品：${marketProduct.name}`,
      description: `出售给${req.user.nickname || '买家'}，手续费${fee}积分`,
      transaction
    })

    // 7. 转移商品所有权
    await marketProduct.update(
      {
        user_id: buyer_id,
        market_status: 'sold',
        selling_points: null,
        transfer_count: (marketProduct.transfer_count || 0) + 1,
        acquisition_method: 'market_purchase',
        acquisition_cost: marketProduct.selling_points
      },
      { transaction }
    )

    await transaction.commit()

    logger.info('市场商品购买成功', {
      product_id,
      seller_id: marketProduct.user_id,
      buyer_id,
      selling_points: marketProduct.selling_points,
      seller_received: sellerReceived,
      transaction_fee: fee
    })

    return ApiResponse.success(
      res,
      {
        product_id: parseInt(product_id),
        product_name: marketProduct.name,
        seller_id: marketProduct.user_id,
        buyer_id,
        transaction_amount: marketProduct.selling_points,
        seller_received: sellerReceived,
        transaction_fee: fee,
        purchased_at: BeijingTimeHelper.createDatabaseTime(),
        purchase_note: purchase_note || null
      },
      '购买成功'
    )
  } catch (error) {
    await transaction.rollback()
    logger.error('购买市场商品失败', {
      error: error.message,
      product_id: req.params.id,
      buyer_id: req.user.user_id
    })
    return ApiResponse.error(res, error.message || '购买失败', 500)
  }
})

/**
 * 撤回市场商品
 * POST /api/v4/inventory/market/products/:id/withdraw
 */
router.post('/market/products/:id/withdraw', authenticateToken, async (req, res) => {
  const transaction = await models.sequelize.transaction()

  try {
    const { id: product_id } = req.params
    const seller_id = req.user.user_id
    const { withdraw_reason } = req.body

    // 1. 查找市场商品
    const marketProduct = await models.UserInventory.findOne({
      where: {
        id: product_id,
        user_id: seller_id, // 只能撤回自己的商品
        market_status: 'on_sale'
      },
      transaction
    })

    if (!marketProduct) {
      await transaction.rollback()
      return ApiResponse.error(res, '商品不存在或无权限撤回', 404)
    }

    // 2. 检查撤回条件
    if (marketProduct.market_status !== 'on_sale') {
      await transaction.rollback()
      return ApiResponse.error(res, '只能撤回在售状态的商品', 400)
    }

    // 3. 撤回商品（恢复为普通库存状态）
    await marketProduct.update(
      {
        market_status: 'withdrawn',
        selling_points: null,
        condition: null,
        // 保留原有的基本信息
        is_available: true
      },
      { transaction }
    )

    await transaction.commit()

    logger.info('市场商品撤回成功', {
      product_id,
      seller_id,
      product_name: marketProduct.name,
      withdraw_reason: withdraw_reason || '用户主动撤回'
    })

    return ApiResponse.success(
      res,
      {
        product_id: parseInt(product_id),
        product_name: marketProduct.name,
        original_market_status: 'on_sale',
        new_status: 'withdrawn',
        withdrawn_at: BeijingTimeHelper.createDatabaseTime(),
        withdraw_reason: withdraw_reason || '用户主动撤回'
      },
      '商品撤回成功'
    )
  } catch (error) {
    await transaction.rollback()
    logger.error('撤回市场商品失败', {
      error: error.message,
      product_id: req.params.id,
      seller_id: req.user.user_id
    })
    return ApiResponse.error(res, error.message || '撤回失败', 500)
  }
})

/*
 * ========================================
 * API#7 统一软删除机制 - 兑换记录软删除
 * ========================================
 */

/**
 * @route DELETE /api/v4/inventory/exchange-records/:exchange_id
 * @desc 软删除兑换记录（用户端隐藏记录，管理员可恢复）
 * @access Private (用户自己的记录)
 *
 * @param {number} exchange_id - 兑换记录ID（路径参数）
 *
 * @returns {Object} 删除确认信息
 * @returns {number} data.exchange_id - 被删除的兑换记录ID
 * @returns {number} data.is_deleted - 删除标记（1=已删除）
 * @returns {string} data.deleted_at - 删除时间（北京时间）
 * @returns {string} data.record_type - 记录类型（exchange）
 * @returns {string} data.note - 操作说明
 *
 * 业务规则：
 * - 只能删除自己的兑换记录
 * - 软删除：记录物理保留，只是标记为已删除（is_deleted=1）
 * - 前端查询时自动过滤已删除记录
 * - 用户删除后无法自己恢复，只有管理员可以恢复
 * - 删除不影响积分（软删除只是隐藏记录，不涉及积分退回）
 */
router.delete('/exchange-records/:exchange_id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { exchange_id } = req.params

    // 1. 参数验证
    if (!exchange_id || isNaN(parseInt(exchange_id))) {
      return ApiResponse.error(res, '无效的兑换记录ID', 400)
    }

    const exchangeId = parseInt(exchange_id)

    // 2. 查询兑换记录
    const record = await models.ExchangeRecords.findOne({
      where: {
        exchange_id: exchangeId,
        is_deleted: 0 // 只查询未删除的记录
      }
    })

    if (!record) {
      return ApiResponse.error(res, '兑换记录不存在或已被删除', 404)
    }

    // 3. 权限验证：只能删除自己的记录
    if (record.user_id !== userId) {
      return ApiResponse.error(res, '您无权删除此兑换记录', 403)
    }

    // 4. 检查是否已经被删除
    if (record.is_deleted === 1) {
      return ApiResponse.error(res, '该兑换记录已经被删除，无需重复操作', 400)
    }

    // 5. 执行软删除
    const deletedAt = BeijingTimeHelper.createDatabaseTime()

    await record.update({
      is_deleted: 1,
      deleted_at: deletedAt
    })

    logger.info('软删除兑换记录成功', {
      exchange_id: exchangeId,
      user_id: userId,
      deleted_at: BeijingTimeHelper.formatForAPI(deletedAt)
    })

    // 6. 返回成功响应
    return ApiResponse.success(res, {
      exchange_id: exchangeId,
      is_deleted: 1,
      deleted_at: BeijingTimeHelper.formatForAPI(deletedAt),
      record_type: 'exchange',
      note: '兑换记录已删除，将不再显示在列表中'
    }, '兑换记录已删除')
  } catch (error) {
    logger.error('软删除兑换记录失败', {
      error: error.message,
      exchange_id: req.params.exchange_id,
      user_id: req.user?.user_id
    })
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route POST /api/v4/inventory/exchange-records/:exchange_id/restore
 * @desc 管理员恢复已删除的兑换记录（管理员专用）
 * @access Private (仅管理员)
 *
 * @param {number} exchange_id - 兑换记录ID（路径参数）
 *
 * @returns {Object} 恢复确认信息
 * @returns {number} data.exchange_id - 恢复的兑换记录ID
 * @returns {number} data.is_deleted - 删除标记（0=未删除）
 * @returns {number} data.user_id - 记录所属用户ID
 * @returns {string} data.note - 操作说明
 *
 * 业务规则：
 * - 仅管理员可以恢复已删除的记录
 * - 恢复后用户端将重新显示该记录
 * - 恢复操作会清空deleted_at时间戳
 */
router.post('/exchange-records/:exchange_id/restore', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { exchange_id } = req.params
    const adminId = req.user.user_id

    // 1. 参数验证
    if (!exchange_id || isNaN(parseInt(exchange_id))) {
      return ApiResponse.error(res, '无效的兑换记录ID', 400)
    }

    const exchangeId = parseInt(exchange_id)

    // 2. 查询已删除的记录（包含已删除的）
    const record = await models.ExchangeRecords.findOne({
      where: {
        exchange_id: exchangeId
        // 不过滤is_deleted，查询所有记录
      }
    })

    if (!record) {
      return ApiResponse.error(res, '兑换记录不存在', 404)
    }

    // 3. 检查是否已经被删除
    if (record.is_deleted === 0) {
      return ApiResponse.error(res, '该兑换记录未被删除，无需恢复', 400)
    }

    // 4. 恢复记录
    await record.update({
      is_deleted: 0,
      deleted_at: null
    })

    logger.info('管理员恢复兑换记录成功', {
      exchange_id: exchangeId,
      admin_id: adminId,
      original_user_id: record.user_id
    })

    // 5. 返回成功响应
    return ApiResponse.success(res, {
      exchange_id: exchangeId,
      is_deleted: 0,
      user_id: record.user_id,
      note: '兑换记录已恢复，用户端将重新显示该记录'
    }, '兑换记录已恢复')
  } catch (error) {
    logger.error('恢复兑换记录失败', {
      error: error.message,
      exchange_id: req.params.exchange_id,
      admin_id: req.user?.user_id
    })
    return ApiResponse.error(res, error.message, 500)
  }
})

module.exports = router
