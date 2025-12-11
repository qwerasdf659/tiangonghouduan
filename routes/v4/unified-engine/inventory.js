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
const ApiResponse = require('../../../utils/ApiResponse')
const { authenticateToken, requireAdmin, getUserRoles } = require('../../../middleware/auth')
const DataSanitizer = require('../../../services/DataSanitizer') // 数据脱敏服务（/exchange-records 路由使用）
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')
const { Transaction } = require('sequelize') // eslint-disable-line no-unused-vars -- 保留用于类型引用
const {
  validatePositiveInteger,
  validateEnumValue,
  validatePaginationParams,
  handleServiceError
} = require('../../../middleware/validation')

const logger = new Logger('InventoryAPI')

/**
 * 获取用户库存列表
 * GET /api/v4/inventory/user/:user_id
 *
 * ✅ P2优化完成（2025-12-10）：
 * - 使用 validatePositiveInteger 中间件验证 user_id
 * - 使用 handleServiceError 统一错误处理
 * - 精简路由层代码，职责更单一
 */
router.get(
  '/user/:user_id',
  authenticateToken,
  validatePositiveInteger('user_id', 'params'),
  async (req, res) => {
    try {
      logger.info('开始处理库存列表请求', {
        user_id: req.validated.user_id,
        req_user_id: req.user?.user_id
      })

      const { status, type, page = 1, limit = 20 } = req.query
      const requestedUserId = req.validated.user_id

      // ✅ 调用 InventoryService 获取用户库存
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.getUserInventory(
        requestedUserId,
        { status, type, page, limit },
        { viewerId: req.user.user_id }
      )

      logger.info('获取用户库存成功', {
        user_id: requestedUserId,
        total: result.pagination.total,
        returned: result.inventory.length
      })

      return res.apiSuccess(result, '获取库存列表成功')
    } catch (error) {
      logger.error('获取用户库存失败', {
        error: error.message,
        errorName: error.name,
        user_id: req.validated.user_id,
        query: req.query
      })

      // ✅ P2优化：使用统一错误处理
      return handleServiceError(error, res, '获取库存列表失败')
    }
  }
)

/**
 * 获取库存物品详情
 * GET /api/v4/inventory/item/:item_id
 *
 * ✅ P2优化完成（2025-12-10）：
 * - 使用 validatePositiveInteger 中间件验证 item_id
 * - 使用 handleServiceError 统一错误处理
 */
router.get(
  '/item/:item_id',
  authenticateToken,
  validatePositiveInteger('item_id', 'params'),
  async (req, res) => {
    try {
      const itemId = req.validated.item_id

      // ✅ 调用 InventoryService 获取物品详情
      const InventoryService = req.app.locals.services.getService('inventory')
      const sanitizedItem = await InventoryService.getItemDetail(req.user.user_id, itemId)

      logger.info('获取库存物品详情成功', {
        item_id: itemId,
        user_id: req.user.user_id
      })

      return res.apiSuccess({ item: sanitizedItem }, '获取物品详情成功')
    } catch (error) {
      logger.error('获取物品详情失败', {
        error: error.message,
        item_id: req.validated.item_id,
        user_id: req.user?.user_id
      })

      // ✅ P2优化：使用统一错误处理
      return handleServiceError(error, res, '获取物品详情失败')
    }
  }
)

/**
 * 使用库存物品（Use Inventory Item - 库存物品使用API）
 * POST /api/v4/inventory/use/:item_id
 *
 * ✅ P2优化完成（2025-12-10）：
 * - 使用 validatePositiveInteger 中间件验证 item_id
 * - 使用 handleServiceError 统一错误处理
 */
router.post(
  '/use/:item_id',
  authenticateToken,
  validatePositiveInteger('item_id', 'params'),
  async (req, res) => {
    try {
      const itemId = req.validated.item_id
      const { verification_code } = req.body
      const userId = req.user.user_id

      // ✅ 生成 business_id 用于幂等性控制（任务4.1：补全幂等性覆盖）
      const business_id = `use_${userId}_${itemId}_${Date.now()}`

      // ✅ 调用 InventoryService 使用物品
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.useItem(userId, itemId, {
        verification_code,
        business_id
      })

      logger.info('库存物品使用成功', {
        item_id: itemId,
        user_id: req.user.user_id,
        item_name: result.item_name
      })

      return res.apiSuccess({ item: result }, '物品使用成功')
    } catch (error) {
      logger.error('使用库存物品失败', {
        error: error.message,
        item_id: req.validated.item_id,
        user_id: req.user?.user_id
      })

      // ✅ P2优化：使用统一错误处理
      return handleServiceError(error, res, '物品使用失败')
    }
  }
)

/**
 * 获取管理员库存统计
 * GET /api/v4/inventory/admin/statistics
 *
 * 业务场景：管理员查看系统库存运营数据，支持运营决策和数据分析
 *
 * 统计维度：
 * 1. 5种状态统计：available（可用）、used（已使用）、expired（已过期）、transferred（已转让）、pending（待处理）
 * 2. 类型分布统计：voucher（优惠券）、product（实物商品）、service（服务）
 * 3. 最近动态：最新获得的10个物品
 * 4. 多维度使用率：主动使用率、消耗率、有效使用率、转让率
 *
 * @route GET /api/v4/inventory/admin/statistics
 * @access Private (需要管理员权限)
 */
router.get('/admin/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // ✅ 调用 InventoryService 获取统计数据
    const InventoryService = req.app.locals.services.getService('inventory')
    const statistics = await InventoryService.getAdminStatistics()

    // 📝 记录操作日志
    logger.info('管理员获取库存统计成功', {
      admin_id: req.user.user_id,
      total_items: statistics.total_items,
      available_items: statistics.available_items,
      transferred_items: statistics.transferred_items,
      pending_items: statistics.pending_items
    })

    // ✅ 返回成功响应
    return res.apiSuccess({ statistics }, '获取库存统计成功')
  } catch (error) {
    // ❌ 错误处理（记录错误日志并返回详细错误分类）
    logger.error('获取库存统计失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      error_name: error.name
    })

    // ✅ 根据错误类型返回不同错误码和消息（提升问题排查效率）
    if (error.name === 'SequelizeConnectionError') {
      return res.apiError('数据库连接失败，请稍后重试', 'DATABASE_CONNECTION_ERROR', null, 503)
    } else if (error.name === 'SequelizeTimeoutError') {
      return res.apiError('查询超时，请稍后重试', 'QUERY_TIMEOUT', null, 504)
    } else if (error.name === 'SequelizeDatabaseError') {
      return res.apiError('数据库查询异常', 'DATABASE_QUERY_ERROR', null, 500)
    } else {
      return res.apiError('获取库存统计失败', 'STATISTICS_ERROR', { error_type: error.name }, 500)
    }
  }
})

/**
 * 获取商品列表（兑换商品）
 * GET /api/v4/inventory/products
 *
 * ✅ 重构完成（2025-12-09）：
 * - 调用 InventoryService.getProducts() 替代直接查询 models
 * - 服务层已包含参数验证、空间过滤、数据脱敏等逻辑
 */
router.get('/products', authenticateToken, async (req, res) => {
  try {
    const { space = 'lucky', category, page = 1, limit = 20 } = req.query

    // ✅ 调用 InventoryService 获取商品列表
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.getProducts(
      { space, category, page, limit },
      { viewerId: req.user.user_id }
    )

    logger.info('获取商品列表成功', {
      user_id: req.user.user_id,
      space,
      category,
      total: result.pagination.total,
      returned: result.products.length
    })

    return res.apiSuccess(result, '获取商品列表成功')
  } catch (error) {
    logger.error('获取商品列表失败', {
      error: error.message,
      query: req.query,
      user_id: req.user?.user_id
    })

    if (error.message.includes('无效')) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }
    return res.apiError('获取商品列表失败，请稍后重试', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 兑换商品
 * POST /api/v4/inventory/exchange
 *
 * ✅ 架构重构完成（2025-12-10）- 任务 3.1：
 * - 改用 ExchangeOperationService.createExchange 协调兑换流程
 * - PointsService 不再直接操作 Product/ExchangeRecords 表
 * - 实现领域边界分离：库存验证（InventoryService）+ 积分扣除（PointsService）+ 兑换协调（ExchangeOperationService）
 */
router.post('/exchange', authenticateToken, async (req, res) => {
  try {
    const { product_id, quantity = 1, space = 'lucky' } = req.body
    const user_id = req.user.user_id

    // 🔄 通过 ServiceManager 获取 ExchangeOperationService（符合TR-005规范）
    const ExchangeOperationService = req.app.locals.services.getService('exchangeOperation')

    // 参数验证
    if (product_id === undefined || product_id === null) {
      return res.apiError('商品ID不能为空', 'INVALID_PARAMETER', null, 400)
    }

    if (quantity <= 0 || quantity > 10) {
      return res.apiError('兑换数量必须在1-10之间', 'INVALID_QUANTITY', null, 400)
    }

    // 验证空间参数
    if (!['lucky', 'premium'].includes(space)) {
      return res.apiError('空间参数错误，必须是lucky或premium', 'INVALID_SPACE', null, 400)
    }

    // ✅ 执行兑换（调用 ExchangeOperationService 协调多领域服务）
    const result = await ExchangeOperationService.createExchange(
      user_id,
      product_id,
      quantity,
      space
    )

    logger.info('商品兑换成功', {
      user_id,
      product_id,
      space,
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
 *
 * ✅ 架构重构完成（2025-12-10）- 任务 3.1：
 * - 改用 ExchangeOperationService.getExchangeRecords 查询兑换记录
 * - PointsService 不再直接操作 ExchangeRecords 表
 * - 实现领域边界分离，兑换相关功能统一由 ExchangeOperationService 管理
 *
 * 业务场景：
 * - 用户个人中心查看兑换记录
 * - 订单追踪和状态查询
 * - 兑换码查询和核销记录
 */
router.get(
  '/exchange-records',
  authenticateToken,
  validatePaginationParams({ maxPageSize: 100, defaultPageSize: 20 }),
  validateEnumValue('status', ['pending', 'distributed', 'used', 'expired', 'cancelled'], 'query', {
    optional: true
  }),
  validateEnumValue('space', ['lucky', 'premium'], 'query', { optional: true }),
  async (req, res) => {
    const startTime = Date.now()

    try {
      const user_id = req.user.user_id
      const { page, limit } = req.validated
      const status = req.validated.status || null
      const space = req.validated.space || null

      // 🔄 通过 ServiceManager 获取 ExchangeOperationService（符合TR-005规范）
      const ExchangeOperationService = req.app.locals.services.getService('exchangeOperation')

      // 获取用户权限
      const userRoles = await getUserRoles(user_id)
      const dataLevel = userRoles.isAdmin ? 'full' : 'public'

      // ✅ 获取兑换记录（调用 ExchangeOperationService）
      const queryStartTime = Date.now()
      const result = await ExchangeOperationService.getExchangeRecords(user_id, {
        page,
        limit,
        status,
        space
      })
      const queryDuration = Date.now() - queryStartTime

      // 检查是否有结果
      if (!result || !result.records) {
        logger.warn('查询结果为空', { user_id, query_params: { page, limit, status, space } })
        return ApiResponse.success(
          res,
          {
            records: [],
            pagination: {
              total: 0,
              page,
              limit,
              total_pages: 0
            }
          },
          '暂无兑换记录'
        )
      }

      // 检查分页是否超出范围
      const totalPages = result.pagination.total_pages
      if (page > totalPages && totalPages > 0) {
        logger.warn('分页超出范围', {
          user_id,
          requested_page: page,
          total_pages: totalPages
        })
      }

      // 数据脱敏处理
      const sanitizedRecords = DataSanitizer.sanitizeExchangeRecords(
        result.records.map(r => {
          const record = r.toJSON()
          // 处理关联product为null的情况（商品已删除）
          if (!record.product && record.product_snapshot) {
            record.product = {
              name: record.product_snapshot.name,
              category: record.product_snapshot.category,
              image: record.product_snapshot.image
            }
          }
          return record
        }),
        dataLevel
      )

      // 日志记录
      logger.info('获取兑换记录成功', {
        user_id,
        query_params: { page, limit, status, space },
        data_level: dataLevel,
        result_stats: {
          total: result.pagination.total,
          returned: result.records.length,
          page,
          total_pages: result.pagination.total_pages
        },
        performance: {
          query_time_ms: queryDuration,
          total_time_ms: Date.now() - startTime,
          records_per_ms: result.records.length / queryDuration
        }
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
      const errorDetails = {
        error_name: error.name,
        error_message: error.message,
        user_id: req.user?.user_id,
        query_params: req.query,
        request_time: BeijingTimeHelper.formatForAPI(new Date()),
        total_time_ms: Date.now() - startTime
      }

      logger.error('获取兑换记录失败', errorDetails)

      // ✅ P2优化：使用统一错误处理
      return handleServiceError(error, res, '获取兑换记录失败')
    }
  }
)

/**
 * 生成核销码
 * POST /api/v4/inventory/generate-code/:item_id
 */
/**
 * 生成核销码API（Generate Verification Code）
 * POST /api/v4/inventory/generate-code/:item_id
 *
 * 业务场景（Business Scenario）：
 * 用户兑换商品后，为库存物品生成24小时有效的核销码，用于商家线下核销验证
 *
 * 核心功能（Core Features）：
 * 1. 身份认证：JWT Token验证，确保只有登录用户可访问
 * 2. 权限验证：user_id匹配检查，用户只能为自己的物品生成核销码
 * 3. 状态验证：只有available状态的物品可以生成核销码
 * 4. 核销码生成：使用crypto.randomBytes()生成8位大写十六进制字符，100%唯一性保证
 * 5. 过期时间设置：自动设置24小时后过期（北京时间）
 * 6. 旧码覆盖：重复生成会覆盖旧核销码（无二次确认）
 *
 * 技术实现（Technical Implementation）：
 * - 使用UserInventory模型的generateVerificationCode()方法
 * - crypto.randomBytes(4).toString('hex')生成8位随机字符
 * - while循环确保唯一性（查询数据库验证不重复）
 * - 自动设置verification_code和verification_expires_at字段
 *
 * @param {string} item_id - 库存物品ID（URL参数）
 * @returns {Object} 成功返回核销码和过期时间
 * @throws {404} 库存物品不存在
 * @throws {400} 物品状态不允许生成核销码（非available状态）
 * @throws {500} 服务器内部错误
 */
router.post('/generate-code/:item_id', authenticateToken, async (req, res) => {
  try {
    const { item_id } = req.params
    const userId = req.user.user_id

    // ✅ 调用 InventoryService 生成核销码
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.generateVerificationCode(userId, item_id)

    // 📝 记录操作日志
    logger.info('生成核销码成功', {
      item_id,
      user_id: userId,
      verification_code: result.verification_code,
      expires_at: result.expires_at
    })

    // ✅ 返回成功响应
    return res.apiSuccess(
      {
        verification_code: result.verification_code,
        expires_at: result.expires_at
      },
      '核销码生成成功'
    )
  } catch (error) {
    logger.error('生成核销码失败', {
      error: error.message,
      stack: error.stack,
      item_id: req.params.item_id,
      user_id: req.user?.user_id
    })
    return res.apiError('生成核销码失败', 'INTERNAL_ERROR', null, 500)
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
/**
 * 取消兑换记录
 * POST /api/v4/inventory/exchange-records/:id/cancel
 *
 * ✅ P2优化完成（2025-12-10）：
 * - 使用 validatePositiveInteger 中间件验证 exchange_id
 * - 使用 handleServiceError 统一错误处理
 */
router.post(
  '/exchange-records/:id/cancel',
  authenticateToken,
  validatePositiveInteger('id', 'params'),
  async (req, res) => {
    try {
      const exchangeId = req.validated.id
      const user_id = req.user.user_id

      // ✅ 调用 InventoryService 取消兑换
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.cancelExchange(user_id, exchangeId)

      logger.info('兑换取消成功', {
        exchange_id: exchangeId,
        user_id
      })

      return res.apiSuccess(result, '兑换已取消，积分已退回')
    } catch (error) {
      logger.error('兑换取消失败', {
        error: error.message,
        exchange_id: req.validated.id,
        user_id: req.user.user_id
      })

      // ✅ P2优化：使用统一错误处理
      return handleServiceError(error, res, '兑换取消失败')
    }
  }
)

/**
 * 简化版交易市场功能
 * GET /api/v4/inventory/market/products
 *
 * ✅ 重构完成（2025-12-09）：
 * - 调用 InventoryService.getMarketProducts() 替代直接查询 models
 * - 服务层已包含参数验证、分类过滤、排序、数据脱敏等逻辑
 */
router.get('/market/products', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, category, sort = 'newest' } = req.query

    // ✅ 调用 InventoryService 获取市场商品列表
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.getMarketProducts(
      { category, sort, page, limit },
      { transaction: null }
    )

    logger.info('获取交易市场商品成功', {
      user_id: req.user.user_id,
      category,
      sort,
      total: result.pagination.total,
      returned: result.products.length
    })

    return res.apiSuccess(result, '获取交易市场商品成功')
  } catch (error) {
    logger.error('获取交易市场商品失败', {
      error: error.message,
      user_id: req.user?.user_id,
      query: req.query
    })

    if (error.message.includes('无效')) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }
    return res.apiError('获取交易市场商品失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 转让库存物品（Transfer Inventory Item - 转让库存物品）
 * POST /api/v4/inventory/transfer
 *
 * 业务场景（Business Scenarios - 业务场景）：
 * - 用户将自己库存中的物品转让给其他用户（赠送礼物、好友互助等）
 * - 转让后物品归属权变更，原用户失去该物品，目标用户获得该物品
 * - 记录完整的转让历史到TradeRecord表，支持审计和溯源
 *
 * 核心流程（Core Process - 核心流程）：
 * 1. JWT认证验证用户身份
 * 2. 参数验证（物品ID、目标用户ID、转让留言）
 * 3. 查询物品并验证所有权（只能转让自己的物品）
 * 4. 验证物品可转让性（can_transfer字段、status状态、过期时间）
 * 5. 验证目标用户存在性（防止转让给无效用户）
 * 6. 检查转让次数限制（默认最多3次，防止刷单）
 * 7. 开启数据库事务执行转让操作
 * 8. 记录转让历史到TradeRecord表（用于审计追溯）
 * 9. 更新物品归属和转让信息
 * 10. 提交事务并返回成功响应
 *
 * @route POST /api/v4/inventory/transfer
 * @access 需要JWT认证（Private - 需要登录）
 * @group 库存管理 - 物品转让相关接口
 *
 * @param {Object} req.body - 请求体参数
 * @param {number} req.body.item_id - 物品ID（必填，库存物品的主键inventory_id）
 * @param {number} req.body.target_user_id - 目标用户ID（必填，接收转让的用户ID）
 * @param {string} [req.body.transfer_note] - 转让留言（可选，最多500字，增强社交互动）
 *
 * @returns {Object} 200 - 转让成功响应
 * @returns {string} data.transfer_id - 转让记录ID（格式：tf_时间戳_随机8位）
 * @returns {number} data.item_id - 物品ID
 * @returns {string} data.name - 物品名称
 * @returns {number} data.from_user_id - 发送方用户ID（当前用户）
 * @returns {number} data.to_user_id - 接收方用户ID（目标用户）
 * @returns {string} data.transfer_note - 转让留言
 * @returns {number} data.transfer_count - 转让次数（包含本次）
 * @returns {string} data.transferred_at - 转让时间（北京时间）
 *
 * @returns {Object} 400 - 参数错误或业务规则限制
 * @returns {Object} 404 - 物品不存在或目标用户不存在
 * @returns {Object} 500 - 服务器内部错误
 *
 * @example
 * // 请求示例
 * POST /api/v4/inventory/transfer
 * Headers: { "Authorization": "Bearer <JWT_TOKEN>" }
 * Body: {
 *   "item_id": 123,
 *   "target_user_id": 456,
 *   "transfer_note": "送你的礼物"
 * }
 *
 * @example
 * // 成功响应示例
 * {
 *   "code": 200,
 *   "message": "物品转让成功",
 *   "data": {
 *     "transfer_id": "tf_1731158400_a1b2c3d4",
 *     "item_id": 123,
 *     "name": "优惠券",
 *     "from_user_id": 31,
 *     "to_user_id": 456,
 *     "transfer_note": "送你的礼物",
 *     "transfer_count": 1,
 *     "transferred_at": "2025-11-10T12:00:00+08:00"
 *   }
 * }
 */
/**
 * ✅ 重构完成（2025-12-09）：
 * - 调用 InventoryService.transferItem() 替代直接操作 models
 * - 服务层已包含权限验证、目标用户验证、转让次数检查、事务管理等逻辑
 *
 * 转让库存物品（Transfer Inventory Item - 库存物品转让API）
 * POST /api/v4/inventory/transfer
 *
 * 业务场景（Business Scenarios）：
 * - 用户将库存物品转让给其他用户（礼物赠送、朋友共享等）
 * - 核心逻辑：归属权变更（owner变更） + 转让记录 + 转让次数追踪
 *
 * 请求体（Request Body）:
 * @param {number} item_id - 物品ID（必填）
 * @param {number} target_user_id - 目标用户ID（必填）
 * @param {string} transfer_note - 转让备注（可选）
 *
 * @example
 * // 请求示例
 * POST /api/v4/inventory/transfer
 * Headers: { "Authorization": "Bearer <JWT_TOKEN>" }
 * Body: {
 *   "item_id": 123,
 *   "target_user_id": 456,
 *   "transfer_note": "送你的礼物"
 * }
 */
router.post('/transfer', authenticateToken, async (req, res) => {
  try {
    const { item_id, target_user_id, transfer_note } = req.body
    const currentUserId = req.user.user_id

    // 参数验证
    if (!item_id || !target_user_id) {
      return res.apiError('物品ID和目标用户ID不能为空', 'BAD_REQUEST', null, 400)
    }

    const itemId = parseInt(item_id, 10)
    const targetUserId = parseInt(target_user_id, 10)

    if (isNaN(itemId) || itemId <= 0 || isNaN(targetUserId) || targetUserId <= 0) {
      return res.apiError('物品ID和目标用户ID必须是正整数', 'BAD_REQUEST', null, 400)
    }

    if (currentUserId === targetUserId) {
      return res.apiError('不能转让给自己', 'BAD_REQUEST', null, 400)
    }

    // ✅ 生成 business_id 用于幂等性控制（任务4.1：补全幂等性覆盖）
    const business_id = `transfer_${currentUserId}_${itemId}_${Date.now()}`

    // ✅ 调用 InventoryService 转让物品
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.transferItem(currentUserId, targetUserId, itemId, {
      transfer_note,
      business_id
    })

    logger.info('库存物品转让成功', {
      item_id: itemId,
      from_user_id: currentUserId,
      to_user_id: targetUserId,
      item_name: result.name,
      transfer_count: result.transfer_count
    })

    return res.apiSuccess(result, '物品转让成功')
  } catch (error) {
    logger.error('转让库存物品失败', {
      error: error.message,
      item_id: req.body.item_id,
      current_user: req.user.user_id,
      target_user: req.body.target_user_id
    })

    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    } else if (
      error.message.includes('不能转让') ||
      error.message.includes('不支持') ||
      error.message.includes('已过期') ||
      error.message.includes('最大转让次数')
    ) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }
    return res.apiError('物品转让失败，请稍后重试', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 获取物品转让历史记录
 * GET /api/v4/inventory/transfer-history
 *
 * 权限规则（Permission Rules - 权限规则）：
 * - 普通用户（role_level < 100）：只能查看与自己直接相关的一手转让记录（from_user_id = 自己 OR to_user_id = 自己）
 * - 管理员（role_level >= 100）：可以查看指定物品的完整转让链条（通过item_id参数）
 *
 * 业务场景示例（Business Scenario Example - 业务场景示例）：
 * 张三转给李四，李四转给王五，王五转给唐六
 * - 李四查询：只能看到"张三→李四"和"李四→王五"两条记录（与自己直接相关）
 * - 王五查询：只能看到"李四→王五"和"王五→唐六"两条记录（与自己直接相关）
 * - 管理员查询（带item_id参数）：可以看到完整链条"张三→李四→王五→唐六"
 */
router.get('/transfer-history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, type = 'all', item_id } = req.query
    const userId = req.user.user_id

    // ✅ 参数验证：item_id 如果存在需要转为整数
    const itemIdParam = item_id ? parseInt(item_id, 10) : undefined
    if (item_id && (isNaN(itemIdParam) || itemIdParam <= 0)) {
      return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
    }

    // ✅ 调用 InventoryService 获取转让历史
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.getTransferHistory(
      userId,
      { direction: type, item_id: itemIdParam, page, limit },
      { viewerId: userId }
    )

    // 📝 记录操作日志
    logger.info('获取转让历史成功', {
      user_id: userId,
      total: result.pagination.total,
      type,
      page: parseInt(page),
      query_item_id: itemIdParam || null,
      view_mode: result.filter.view_mode
    })

    // ✅ 返回成功响应
    return res.apiSuccess(
      {
        transfer_history: result.records,
        pagination: result.pagination,
        filter: result.filter
      },
      result.filter.view_mode === 'complete_chain' ? '物品完整转让链条获取成功' : '转让历史获取成功'
    )
  } catch (error) {
    logger.error('获取转让历史失败', {
      error: error.message,
      user_id: req.user.user_id
    })

    // ✅ 错误分类处理
    if (error.message.includes('无权限')) {
      return res.apiError(error.message, 'FORBIDDEN', null, 403)
    }

    return res.apiError('获取转让历史失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 核销验证码（Verification Code Validation）
 * POST /api/v4/inventory/verification/verify
 *
 * 业务场景（Business Scenario）：
 * - 商户扫描或手动输入用户核销码，验证并标记物品为已使用
 * - 适用于优惠券核销、实物商品领取、服务类核销等场景
 *
 * 权限要求（Permission Requirements）：
 * - 只允许商户（role_level>=50）或管理员（role_level>=100）执行核销
 * - 普通用户（role_level<50）无权核销，防止用户自己核销自己的核销码
 *
 * 业务规则（Business Rules）：
 * - 核销码必须存在且唯一（verification_code UNIQUE索引）
 * - 物品状态必须是available（可使用）
 * - 核销码不能过期（verification_expires_at < 当前时间）
 * - 核销后status变为used（终态，不可逆转）
 * - 记录核销时间（used_at）和核销操作人（operator_id）
 *
 * P0严重问题修复（Critical Issue Fixed）：
 * - ✅ 添加权限验证：只允许商户或管理员核销
 * - ✅ 记录operator_id：追溯核销操作人，用于财务结算和纠纷处理
 * - ✅ 添加格式验证：验证核销码为8位大写十六进制字符
 *
 * 请求体（Request Body）：
 * @param {string} verification_code - 核销码（8位大写十六进制，如：A1B2C3D4）
 *
 * 响应数据（Response Data）：
 * @returns {number} inventory_id - 库存物品ID
 * @returns {string} name - 物品名称
 * @returns {string} type - 物品类型（voucher/product/service）
 * @returns {number} value - 物品价值（积分）
 * @returns {string} used_at - 核销时间（北京时间）
 * @returns {Object} user - 物品所有者信息（user_id, mobile, nickname）
 * @returns {Object} operator - 核销操作人信息（user_id, nickname）
 */
router.post('/verification/verify', authenticateToken, async (req, res) => {
  try {
    const { verification_code } = req.body
    const merchantId = req.user.user_id

    // ============ 步骤1：参数验证（Parameter Validation）============

    // 验证1.1：非空验证
    if (!verification_code || verification_code.trim().length === 0) {
      return res.apiError('核销码不能为空', 'BAD_REQUEST', null, 400)
    }

    // ✅ P1优化：格式验证（Format Validation）- 防止无效格式查询数据库
    const codePattern = /^[A-F0-9]{8}$/ // 8位大写十六进制字符
    if (!codePattern.test(verification_code.trim().toUpperCase())) {
      logger.warn('核销码格式错误', {
        verification_code: verification_code.trim(),
        operator_id: merchantId,
        expected_format: '8位大写十六进制字符（0-9, A-F）'
      })
      return res.apiError(
        '核销码格式错误，应为8位大写字母（A-F）和数字（0-9）组合，例如：A1B2C3D4',
        'BAD_REQUEST',
        null,
        400
      )
    }

    /*
     * ============ 步骤2：权限验证（Permission Verification）============
     * ✅ P0严重问题修复：添加商户权限验证
     */
    const userRoles = await getUserRoles(merchantId)

    // 只允许商户（role_level >= 50）或管理员（role_level >= 100）核销
    if (userRoles.role_level < 50) {
      logger.warn('核销权限不足', {
        user_id: merchantId,
        role_level: userRoles.role_level,
        verification_code: verification_code.trim(),
        required_level: '50（商户）或 100（管理员）'
      })
      return res.apiError('权限不足，只有商户或管理员可以核销', 'FORBIDDEN', null, 403)
    }

    // ============ 步骤3：调用 InventoryService 执行核销============

    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.verifyCode(
      merchantId,
      verification_code.trim().toUpperCase()
    )

    // ============ 步骤4：记录核销日志（Logging）============

    // ✅ P2优化：增强日志记录（包含IP和User-Agent）
    logger.info('核销验证成功', {
      verification_code: verification_code.trim(),
      inventory_id: result.item_id,
      user_id: result.user_id,
      operator_id: merchantId,
      // 新增：请求来源追踪
      client_ip: req.ip || req.connection.remoteAddress || req.socket.remoteAddress,
      user_agent: req.get('User-Agent') || 'unknown',
      referer: req.get('Referer') || req.get('Referrer') || 'direct',
      device_type: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop'
    })

    // ============ 步骤5：发送核销通知（Notification）============

    /*
     * ✅ P1优化：核销成功后通知用户（异步非阻塞方式）
     * 🔥 不使用await，让通知在后台发送，不阻塞API响应
     */
    // 🔄 通过 ServiceManager 获取 NotificationService（符合TR-005规范）
    const NotificationService = req.app.locals.services.getService('notification')
    NotificationService.send(result.user_id, {
      type: 'verification_success',
      title: '核销通知',
      content: `您的${result.item_name}已被核销成功，核销时间：${BeijingTimeHelper.formatChinese(result.used_at)}`,
      data: {
        inventory_id: result.item_id,
        name: result.item_name,
        status: result.status,
        used_at: result.used_at,
        operator_id: merchantId,
        operator_nickname: req.user.nickname || userRoles.roleName || '商户'
      }
    })
      .then(() => {
        logger.info('核销通知已发送', {
          user_id: result.user_id,
          inventory_id: result.item_id,
          operator_id: merchantId
        })
      })
      .catch(notificationError => {
        // 通知失败不应该影响核销业务流程
        logger.warn('核销通知发送失败（不影响核销结果）', {
          error: notificationError.message,
          user_id: result.user_id,
          inventory_id: result.item_id
        })
      })

    // ============ 步骤6：返回核销结果（Response）============

    return res.apiSuccess(
      {
        inventory_id: result.item_id,
        name: result.item_name,
        user_id: result.user_id,
        status: result.status,
        used_at: result.used_at,
        // 🔥 核销操作人信息（便于前端展示"由XX商户核销"）
        operator: {
          user_id: merchantId,
          nickname: req.user.nickname || userRoles.roleName || '商户'
        }
      },
      '核销成功'
    )
  } catch (error) {
    logger.error('核销验证失败', {
      error: error.message,
      stack: error.stack,
      verification_code: req.body.verification_code,
      operator_id: req.user.user_id
    })

    // ✅ 根据错误类型返回适当的HTTP状态码
    if (error.message.includes('不存在') || error.message.includes('无效')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    if (error.message.includes('已过期')) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }
    if (error.message.includes('已使用') || error.message.includes('无法核销')) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }

    return res.apiError('核销验证失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 获取市场商品详情
 * GET /api/v4/inventory/market/products/:id
 *
 * ✅ P2优化完成（2025-12-10）：
 * - 使用 validatePositiveInteger 中间件验证 product_id
 * - 使用 handleServiceError 统一错误处理
 */
router.get(
  '/market/products/:id',
  authenticateToken,
  validatePositiveInteger('id', 'params'),
  async (req, res) => {
    try {
      const productId = req.validated.id

      // ✅ 调用 InventoryService 获取市场商品详情
      const InventoryService = req.app.locals.services.getService('inventory')
      const productDetail = await InventoryService.getMarketProductDetail(productId)

      logger.info('获取市场商品详情成功', {
        product_id: productId,
        user_id: req.user.user_id
      })

      return res.apiSuccess(productDetail, '获取商品详情成功')
    } catch (error) {
      logger.error('获取市场商品详情失败', {
        error: error.message,
        product_id: req.validated.id,
        user_id: req.user?.user_id
      })

      // ✅ P2优化：使用统一错误处理
      return handleServiceError(error, res, '获取商品详情失败')
    }
  }
)

/**
 * 购买市场商品
 * POST /api/v4/inventory/market/products/:id/purchase
 *
 * ✅ P2优化完成（2025-12-10）：
 * - 使用 validatePositiveInteger 中间件验证 product_id
 * - 使用 handleServiceError 统一错误处理
 */
router.post(
  '/market/products/:id/purchase',
  authenticateToken,
  validatePositiveInteger('id', 'params'),
  async (req, res) => {
    try {
      const productId = req.validated.id
      const buyer_id = req.user.user_id
      const { purchase_note } = req.body

      // ✅ 生成 business_id 用于幂等性控制（任务4.1：补全幂等性覆盖）
      const business_id = `purchase_${buyer_id}_${productId}_${Date.now()}`

      // ✅ 调用 InventoryService 购买市场商品
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.purchaseMarketProduct(buyer_id, productId, {
        business_id
      })

      logger.info('市场商品购买成功', {
        product_id: productId,
        buyer_id,
        seller_id: result.seller_id,
        points: result.points
      })

      return res.apiSuccess(
        {
          ...result,
          purchase_note: purchase_note || null
        },
        '购买成功'
      )
    } catch (error) {
      logger.error('购买市场商品失败', {
        error: error.message,
        product_id: req.validated.id,
        buyer_id: req.user?.user_id
      })

      // ✅ P2优化：使用统一错误处理
      return handleServiceError(error, res, '购买失败')
    }
  }
)

/**
 * 撤回市场商品
 * POST /api/v4/inventory/market/products/:id/withdraw
 *
 * ✅ 重构完成（2025-12-09）：
 * - 调用 InventoryService.withdrawMarketProduct() 替代直接操作 models
 * - 服务层已包含权限验证、状态检查、冷却时间检查等逻辑
 */
router.post('/market/products/:id/withdraw', authenticateToken, async (req, res) => {
  try {
    const { id: product_id } = req.params
    const seller_id = req.user.user_id
    const { withdraw_reason } = req.body

    // 参数验证
    const productId = parseInt(product_id, 10)
    if (isNaN(productId) || productId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    // ✅ 调用 InventoryService 撤回市场商品
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.withdrawMarketProduct(seller_id, productId, {
      withdraw_reason
    })

    logger.info('市场商品撤回成功', {
      product_id: productId,
      seller_id,
      withdraw_reason: withdraw_reason || '用户主动撤回'
    })

    return res.apiSuccess(result, '商品撤回成功。您可以重新编辑后再次上架。')
  } catch (error) {
    logger.error('撤回市场商品失败', {
      error: error.message,
      product_id: req.params.id,
      seller_id: req.user?.user_id
    })

    if (error.message.includes('不存在') || error.message.includes('无权限')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    } else if (
      error.message.includes('只能撤回') ||
      error.message.includes('冷却') ||
      error.message.includes('已撤回')
    ) {
      // 从错误消息中提取剩余分钟数（如果有）
      const remainingMatch = error.message.match(/(\d+)分钟/)
      const remainingMinutes = remainingMatch ? parseInt(remainingMatch[1]) : null

      return res.apiError(
        error.message,
        'TOO_MANY_REQUESTS',
        remainingMinutes
          ? {
            cooldown_remaining_minutes: remainingMinutes
          }
          : null,
        remainingMinutes ? 429 : 400
      )
    }
    return res.apiError(error.message || '撤回失败', 'INTERNAL_ERROR', null, 500)
  }
})

/*
 * ========================================
 * 市场交易 - 上架限制功能（Marketplace Listing Limit）
 * ========================================
 * 实施方案：上架限制完整实施方案-最终版.md
 * 创建时间：2025-12-05
 * 核心功能：限制用户同时上架的商品数量（最多10件），防止刷屏和垄断
 * ========================================
 */

const marketplaceConfig = require('../../../config/marketplace.config') // eslint-disable-line no-unused-vars -- 配置文件引用保留

/**
 * 上架商品到交易市场
 * POST /api/v4/inventory/market/list
 *
 * ✅ 重构完成（2025-12-09）：
 * - 调用 InventoryService.listProductToMarket() 和 checkListingStatus() 替代直接操作 models
 * - 服务层已包含上架限制检查、参数验证、价格验证、所有权验证等逻辑
 */
router.post('/market/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { inventory_id, selling_points, condition = 'good' } = req.body

    logger.info('开始处理上架请求', {
      user_id: userId,
      inventory_id,
      selling_points
    })

    // 参数验证
    if (!inventory_id || selling_points === undefined) {
      return res.apiError(
        '缺少必要参数：inventory_id 和 selling_points',
        'INVALID_PARAMS',
        null,
        400
      )
    }

    const itemId = parseInt(inventory_id, 10)
    const sellingPrice = parseInt(selling_points, 10)

    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
    }

    if (isNaN(sellingPrice) || sellingPrice <= 0) {
      return res.apiError('售价必须是大于0的整数', 'INVALID_PRICE', null, 400)
    }

    // ✅ 调用 InventoryService 上架商品
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.listProductToMarket(userId, itemId, {
      selling_points: sellingPrice,
      condition
    })

    // ✅ 获取上架状态统计
    const listingStatus = await InventoryService.checkListingStatus(userId)

    logger.info('商品上架成功', {
      user_id: userId,
      inventory_id: itemId,
      selling_price: sellingPrice,
      current_listings: listingStatus.on_sale_count
    })

    return res.apiSuccess(
      {
        inventory: result,
        listing_status: {
          current: listingStatus.on_sale_count,
          limit: 10,
          remaining: 10 - listingStatus.on_sale_count
        }
      },
      '上架成功'
    )
  } catch (error) {
    logger.error('上架失败', {
      error: error.message,
      user_id: req.user?.user_id,
      body: req.body
    })

    if (error.message.includes('不存在') || error.message.includes('不属于')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    } else if (
      error.message.includes('不支持') ||
      error.message.includes('售价') ||
      error.message.includes('已上架') ||
      error.message.includes('上限') ||
      error.message.includes('已有')
    ) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }
    return res.apiError(error.message || '上架失败，请稍后重试', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 获取用户上架状态
 * GET /api/v4/inventory/market/listing-status
 *
 * ✅ 重构完成（2025-12-09）：
 * - 调用 InventoryService.checkListingStatus() 替代直接查询 models
 * - 服务层已包含状态统计逻辑
 */
router.get('/market/listing-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id

    // ✅ 调用 InventoryService 获取上架状态
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.checkListingStatus(userId)

    const maxListings = 10

    logger.info('查询上架状态', {
      user_id: userId,
      current: result.on_sale_count,
      limit: maxListings
    })

    return res.apiSuccess(
      {
        current: result.on_sale_count,
        limit: maxListings,
        remaining: maxListings - result.on_sale_count,
        percentage: Math.round((result.on_sale_count / maxListings) * 100)
      },
      '获取上架状态成功'
    )
  } catch (error) {
    logger.error('获取上架状态失败', {
      error: error.message,
      user_id: req.user?.user_id
    })

    return res.apiError(error.message || '获取上架状态失败', 'INTERNAL_ERROR', null, 500)
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
/**
 * 软删除兑换记录
 * DELETE /api/v4/inventory/exchange-records/:exchange_id
 *
 * ✅ P2优化完成（2025-12-10）：
 * - 使用 validatePositiveInteger 中间件验证 exchange_id
 * - 使用 handleServiceError 统一错误处理
 */
router.delete(
  '/exchange-records/:exchange_id',
  authenticateToken,
  validatePositiveInteger('exchange_id', 'params'),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const exchangeId = req.validated.exchange_id

      // ✅ 调用 InventoryService 删除兑换记录
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.deleteExchange(userId, exchangeId)

      logger.info('软删除兑换记录成功', {
        exchange_id: exchangeId,
        user_id: userId,
        deleted_at: result.deleted_at
      })

      return res.apiSuccess(result, '兑换记录已删除')
    } catch (error) {
      logger.error('软删除兑换记录失败', {
        error: error.message,
        exchange_id: req.validated.exchange_id,
        user_id: req.user?.user_id
      })

      // ✅ P2优化：使用统一错误处理
      return handleServiceError(error, res, '删除失败')
    }
  }
)

/**
 * 恢复已删除的兑换记录
 * POST /api/v4/inventory/exchange-records/:exchange_id/restore
 *
 * ✅ P2优化完成（2025-12-10）：
 * - 使用 validatePositiveInteger 中间件验证 exchange_id
 * - 使用 handleServiceError 统一错误处理
 *
 * @access Private (仅管理员)
 */
router.post(
  '/exchange-records/:exchange_id/restore',
  authenticateToken,
  requireAdmin,
  validatePositiveInteger('exchange_id', 'params'),
  async (req, res) => {
    try {
      const exchangeId = req.validated.exchange_id
      const adminId = req.user.user_id

      // ✅ 调用 InventoryService 恢复兑换记录
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.restoreExchange(adminId, exchangeId)

      logger.info('管理员恢复兑换记录成功', {
        exchange_id: exchangeId,
        admin_id: adminId,
        restored_at: result.restored_at
      })

      return res.apiSuccess(result, '兑换记录已恢复')
    } catch (error) {
      logger.error('恢复兑换记录失败', {
        error: error.message,
        exchange_id: req.validated.exchange_id,
        admin_id: req.user?.user_id
      })

      // ✅ P2优化：使用统一错误处理
      return handleServiceError(error, res, '恢复失败')
    }
  }
)

module.exports = router
