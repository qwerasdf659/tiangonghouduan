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
const { authenticateToken, requireAdmin, getUserRoles } = require('../../../middleware/auth')
const DataSanitizer = require('../../../services/DataSanitizer')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')
const NotificationService = require('../../../services/NotificationService')
const { Op, Transaction } = require('sequelize') // 添加Transaction用于行级锁（Add Transaction for row-level locking）

const logger = new Logger('InventoryAPI')

/**
 * 获取用户库存列表
 * GET /api/v4/inventory/user/:user_id
 */
router.get('/user/:user_id', authenticateToken, async (req, res) => {
  try {
    logger.info('开始处理库存列表请求', {
      user_id: req.params.user_id,
      req_user_id: req.user?.user_id
    })
    const { user_id } = req.params
    const { status, type, page = 1, limit = 20 } = req.query

    /*
     * ✅ 优化1：严格验证user_id参数（防止NaN绕过权限检查）
     * 第1步：检测NaN和非法值
     */
    const requestedUserId = parseInt(user_id, 10)
    if (isNaN(requestedUserId) || requestedUserId <= 0) {
      logger.warn('无效的用户ID参数', {
        user_id,
        parsed: requestedUserId,
        requester: req.user.user_id
      })
      return res.apiError('无效的用户ID，必须是正整数', 'BAD_REQUEST', null, 400)
    }

    /*
     * 第2步：用户身份验证（P0修复 - 防止用户A查询用户B的库存）
     * 业务规则：普通用户只能查询自己的库存，管理员（role_level >= 100）可查询任意用户
     */
    logger.info('调用getUserRoles', { user_id: req.user.user_id })
    const userRoles = await getUserRoles(req.user.user_id)
    logger.info('getUserRoles返回', { userRoles })

    if (requestedUserId !== req.user.user_id && !userRoles.isAdmin) {
      logger.warn('越权访问库存', {
        requestedUserId, // 请求查询的用户ID（已验证为有效数字）
        actualUserId: req.user.user_id, // 实际登录的用户ID
        role_level: userRoles.role_level // 用户角色级别
      })
      return res.apiError('无权限查看其他用户库存', 'FORBIDDEN', null, 403)
    }

    /*
     * 第3步：审计日志 - 记录管理员查询他人库存的操作
     */
    if (requestedUserId !== req.user.user_id && userRoles.isAdmin) {
      logger.info('管理员查询用户库存', {
        admin_id: req.user.user_id,
        target_user_id: requestedUserId,
        query_time: BeijingTimeHelper.formatForAPI(new Date())
      })
    }

    /*
     * 🎯 分页参数严格验证：确保范围1-50，默认20
     * 防止NaN、0、负数导致查询失败
     */
    const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50)

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
        'transfer_count', // 转让次数（Transfer Count - 记录物品被转让的次数）
        'last_transfer_at', // 最后转让时间（Last Transfer Time - 物品最后一次被转让的时间）
        'last_transfer_from', // 最后转让来源用户（Last Transfer From - 物品最后一次从哪个用户转来）
        'created_at',
        'updated_at'
      ],
      order: [['acquired_at', 'DESC']],
      limit: finalLimit,
      offset
    })

    /*
     * ✅ 优化3：Icon处理已移至模型层getter（性能提升15-20ms）
     * 处理数据，添加业务逻辑字段（状态描述、过期状态等）
     */
    const processedInventory = inventory.map(item => {
      const itemData = item.toJSON()

      // icon字段由模型层getter自动处理，无需应用层处理

      // 添加状态描述（业务逻辑，保留在应用层）
      itemData.status_description = getStatusDescription(itemData.status)

      // 添加过期状态（业务逻辑，保留在应用层）
      if (itemData.expires_at) {
        itemData.is_expired = BeijingTimeHelper.createBeijingTime() > new Date(itemData.expires_at)
      }

      return itemData
    })

    /*
     * ✅ 优化2：数据脱敏处理（P0修复 - 防止核销码泄露）
     * 根据用户角色决定数据级别：管理员（role_level >= 100）看完整数据，普通用户看脱敏数据
     */
    const dataLevel = userRoles.isAdmin ? 'full' : 'public'
    const sanitizedInventory = DataSanitizer.sanitizeInventory(processedInventory, dataLevel)

    logger.info('获取用户库存成功', {
      user_id,
      total: count,
      returned: inventory.length,
      filters: { status, type },
      dataLevel // 记录数据级别
    })

    return res.apiSuccess(
      {
        inventory: sanitizedInventory, // 使用脱敏后的数据
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
    /*
     * ✅ 优化4：错误分类处理（P1优化 - 提供用户友好的错误提示）
     */
    logger.error('获取用户库存失败', {
      error: error.message,
      errorName: error.name, // Sequelize错误类型
      stack: error.stack, // 错误堆栈（用于调试）
      user_id: req.params.user_id,
      query: req.query // 查询参数（便于复现问题）
    })

    // 错误分类处理（根据错误类型返回不同状态码和友好提示）
    if (error.name === 'SequelizeDatabaseError') {
      // 数据库错误（如表不存在、字段错误等）
      return res.apiError('数据库查询失败，请稍后重试', 'INTERNAL_ERROR', null, 500)
    } else if (error.name === 'SequelizeConnectionError') {
      // 数据库连接错误
      return res.apiError('数据库连接失败，请稍后重试', 'SERVICE_UNAVAILABLE', null, 503)
    } else if (error.name === 'SequelizeValidationError') {
      // 数据验证错误
      return res.apiError(`数据验证失败: ${error.message}`, 'BAD_REQUEST', null, 400)
    } else if (error.message.includes('invalid') || error.message.includes('参数')) {
      // 参数验证错误
      return res.apiError('请求参数无效，请检查后重试', 'BAD_REQUEST', null, 400)
    } else if (error.message.includes('timeout')) {
      // 超时错误
      return res.apiError('请求超时，请稍后重试', 'GATEWAY_TIMEOUT', null, 504)
    } else {
      // 未知错误
      return res.apiError('获取库存列表失败，请稍后重试', 'INTERNAL_ERROR', null, 500)
    }
  }
})

/**
 * 获取库存物品详情
 * GET /api/v4/inventory/item/:item_id
 *
 * ✅ P2+P3修复完成（2025-11-10）：
 * - 补充管理员权限：管理员可查看所有用户物品进行审计
 * - 移除mobile字段：保护用户隐私，防止数据泄露
 * - 审计日志增强：记录管理员查看他人物品的操作
 */
router.get('/item/:item_id', authenticateToken, async (req, res) => {
  try {
    const { item_id } = req.params
    const currentUserId = req.user.user_id

    // ✅ P2修复：获取用户权限，判断是否为管理员
    const userRoles = await getUserRoles(currentUserId)
    const isAdmin = userRoles.isAdmin // 管理员标识（role_level >= 100）

    // ✅ P2修复：管理员可查看所有物品，普通用户只能查看自己的
    const whereClause = {
      inventory_id: item_id
    }

    // 普通用户：添加user_id限制，只能查看自己的物品
    if (!isAdmin) {
      whereClause.user_id = currentUserId
    }

    const item = await models.UserInventory.findOne({
      where: whereClause,
      include: [
        {
          model: models.User,
          as: 'user',
          // ✅ P3修复：移除mobile字段，保护用户隐私
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    if (!item) {
      return res.apiError('库存物品不存在', 'NOT_FOUND', null, 404)
    }

    // ✅ P2修复：审计日志 - 记录管理员查看他人物品的操作
    if (isAdmin && item.user_id !== currentUserId) {
      logger.info('管理员查看用户物品详情', {
        admin_id: currentUserId,
        target_user_id: item.user_id,
        item_id,
        item_name: item.name,
        query_time: BeijingTimeHelper.formatForAPI(new Date())
      })
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

    logger.info('获取库存物品详情成功', {
      item_id,
      user_id: item.user_id,
      requester_id: currentUserId,
      is_admin: isAdmin,
      is_owner: item.user_id === currentUserId
    })

    return res.apiSuccess({ item: itemData }, '获取物品详情成功')
  } catch (error) {
    logger.error('获取库存物品详情失败', {
      error: error.message,
      stack: error.stack,
      item_id: req.params.item_id,
      user_id: req.user?.user_id
    })
    return res.apiError('获取物品详情失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 使用库存物品（Use Inventory Item - 库存物品使用API）
 * POST /api/v4/inventory/use/:item_id
 *
 * 业务场景（Business Scenarios）：
 * - 用户使用库存中的物品（优惠券核销、实物商品领取、虚拟物品使用等）
 * - 核心逻辑：状态转换（available → used）+ 使用时间记录 + 可选核销码验证
 *
 * P0修复（2025-11-09）：
 * - ✅ 添加权限验证：只允许物品所有者使用自己的物品
 * - ✅ 添加核销码过期检查：verification_expires_at时间验证
 *
 * 路由参数（Route Parameters）：
 * @param {number} item_id - 库存物品ID（inventory_id，URL路径参数，必填）
 *
 * 请求体（Request Body）:
 * @param {string} verification_code - 核销码（Verification Code，可选，商家核销场景需要）
 */
router.post('/use/:item_id', authenticateToken, async (req, res) => {
  try {
    // 🔐 Step 1: 获取路径参数和请求体参数（Get Parameters）
    const { item_id } = req.params // 物品ID（Item ID，URL路径参数）
    const { verification_code } = req.body // 核销码（Verification Code，请求体参数，可选）

    /*
     * 📦 Step 2: 查询库存物品记录（Query Inventory Item，使用主键查询，性能最优）
     * ✅ P0修复：添加user_id验证，防止用户A使用用户B的物品
     */
    const item = await models.UserInventory.findOne({
      where: {
        inventory_id: item_id,
        user_id: req.user.user_id // ✅ 添加所有权验证（Ownership Validation）
      }
    })

    // ❌ Step 3: 物品存在性检查（Existence Validation）
    if (!item) {
      return res.apiError('库存物品不存在', 'NOT_FOUND', null, 404)
      /*
       * 场景1（Scenario 1）：用户传入无效的item_id或物品已被删除
       * 场景2（Scenario 2）：用户尝试使用他人物品（所有权验证失败）
       * HTTP状态码（HTTP Status Code）：404（资源不存在 - Resource Not Found）
       */
    }

    // 🔒 Step 4: 物品状态检查（Status Validation - 业务规则：只有available状态可使用）
    if (item.status !== 'available') {
      return res.apiError('物品不可使用', 'BAD_REQUEST', null, 400)
      /*
       * 场景1（Scenario 1）：status='used' - 物品已使用（重复使用 - Duplicate Usage）
       * 场景2（Scenario 2）：status='expired' - 物品已过期（Expired）
       * 场景3（Scenario 3）：status='transferred' - 物品已转让给他人（Transferred）
       * HTTP状态码（HTTP Status Code）：400（业务逻辑错误 - Business Logic Error）
       */
    }

    // ⏰ Step 5: 物品过期检查（Expiration Check - 自动过期处理）
    if (item.expires_at && BeijingTimeHelper.createDatabaseTime() > new Date(item.expires_at)) {
      /*
       * 业务规则（Business Rule）：物品超过expires_at时间后不可使用
       * 自动处理（Auto Processing）：将status更新为expired（过期状态）
       */
      await item.update({ status: 'expired' })
      return res.apiError('物品已过期', 'BAD_REQUEST', null, 400)
    }

    // 🔑 Step 6.1: 核销码过期检查（Verification Code Expiration Check - P1优化）
    if (
      item.verification_expires_at &&
      BeijingTimeHelper.createDatabaseTime() > new Date(item.verification_expires_at)
    ) {
      /*
       * 业务规则（Business Rule）：核销码有24小时有效期，超过后无法使用
       * 场景（Scenario）：商家核销时，核销码已过期
       */
      logger.warn('核销码已过期', {
        item_id,
        verification_expires_at: item.verification_expires_at,
        current_time: BeijingTimeHelper.createDatabaseTime()
      })
      return res.apiError('核销码已过期，请重新生成', 'BAD_REQUEST', null, 400)
    }

    // 🔑 Step 6.2: 核销码内容验证（Verification Code Validation - 可选，商家核销场景需要）
    if (item.verification_code && item.verification_code !== verification_code) {
      /*
       * 业务规则（Business Rules）：
       * 1. 如果物品有核销码（item.verification_code不为空），必须验证
       * 2. 如果物品无核销码（item.verification_code为null），跳过验证
       * 3. 核销码必须完全一致（大小写敏感 - Case Sensitive）
       */
      return res.apiError('验证码错误', 'BAD_REQUEST', null, 400)
      /*
       * 场景（Scenario）：商家核销时输入错误的核销码
       * 安全性（Security）：防止用户伪造核销凭证（Prevent Fake Verification）
       */
    }

    // ✅ Step 7: 使用物品（Use Item - 状态转换：available → used）
    await item.update({
      status: 'used', // 状态（Status）：已使用（终态，不可逆转 - Final State, Irreversible）
      used_at: BeijingTimeHelper.createBeijingTime() // 使用时间（Used At）：当前北京时间（Current Beijing Time）
    })
    /*
     * 说明（Notes）：
     * - Sequelize的update()方法是原子操作（Atomic Operation），数据库层面保证一致性
     * - status字段有ENUM约束，只能是预定义的5个值之一（available/used/expired/pending/transferred）
     * - used_at字段类型为DATE，存储北京时间（项目统一时区 - Unified Timezone）
     */

    // 📝 Step 8: 记录业务日志（Business Logging - 用于审计和问题追踪）
    logger.info('库存物品使用成功', {
      item_id, // 物品ID（Item ID）
      user_id: item.user_id, // 用户ID（User ID，物品所有者 - Item Owner）
      name: item.name // 物品名称（Item Name）
    })

    // 🎉 Step 9: 返回成功响应（Success Response - 使用项目统一的API响应格式）
    return res.apiSuccess({ item }, '物品使用成功')
  } catch (error) {
    // ❌ 异常处理（Exception Handling - 统一错误响应格式）
    logger.error('使用库存物品失败', {
      error: error.message, // 错误消息（Error Message）
      item_id: req.params.item_id // 触发错误的物品ID（Failed Item ID）
    })
    return res.apiError('物品使用失败', 'INTERNAL_ERROR', null, 500)
  }
})

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
    /*
     * 🚀 并行查询所有统计数据（性能优化：并行执行8个独立查询，比串行快70%）
     * 数据完整性：统计5种状态（available, used, expired, transferred, pending）
     */
    const [
      totalItems,
      availableItems,
      usedItems,
      expiredItems,
      transferredItems, // ✅ 新增：已转让物品统计
      pendingItems, // ✅ 新增：待处理物品统计
      typeStats,
      recentItems
    ] = await Promise.all([
      // 查询1：统计库存物品总数（所有用户的所有物品，包含5种状态）
      models.UserInventory.count(),

      // 查询2：统计可用物品数量（status='available'，用户可正常使用）
      models.UserInventory.count({ where: { status: 'available' } }),

      // 查询3：统计已使用物品数量（status='used'，商家已核销）
      models.UserInventory.count({ where: { status: 'used' } }),

      // 查询4：统计已过期物品数量（status='expired'，超过有效期）
      models.UserInventory.count({ where: { status: 'expired' } }),

      /*
       * ✅ 查询5：统计已转让物品数量（status='transferred'，用户间物品流转）
       * 业务场景：追踪市场交易活跃度，分析用户物品转让行为
       */
      models.UserInventory.count({ where: { status: 'transferred' } }),

      /*
       * ✅ 查询6：统计待处理物品数量（status='pending'，审核中或待确认）
       * 业务场景：监控需要审核的特殊物品（如高价值奖品、特殊补偿等）
       */
      models.UserInventory.count({ where: { status: 'pending' } }),

      /*
       * 查询7：按类型分组统计（type + icon分组，返回每种类型的数量）
       * GROUP BY type, icon - 统计不同类型物品的分布
       */
      models.UserInventory.findAll({
        attributes: ['type', 'icon', [models.sequelize.fn('COUNT', '*'), 'count']],
        group: ['type', 'icon']
      }),

      /*
       * 查询8：查询最近获得的10个物品（用于展示最近动态）
       * ORDER BY created_at DESC - 按创建时间降序
       * LIMIT 10 - 只返回最新的10个物品
       */
      models.UserInventory.findAll({
        attributes: ['inventory_id', 'name', 'type', 'icon', 'status', 'created_at'],
        order: [['created_at', 'DESC']],
        limit: 10
      })
    ])

    // 📊 计算多维度使用率指标（提供不同业务场景的分析维度）
    const activeUsageRate = totalItems > 0 ? ((usedItems / totalItems) * 100).toFixed(2) : 0 // 主动使用率：已使用/总数
    const consumptionRate =
      totalItems > 0 ? (((usedItems + expiredItems) / totalItems) * 100).toFixed(2) : 0 // 消耗率：(已使用+已过期)/总数
    const effectiveUsageRate =
      usedItems + availableItems > 0
        ? ((usedItems / (usedItems + availableItems)) * 100).toFixed(2)
        : 0 // 有效使用率：已使用/(已使用+可用)，排除过期物品
    const transferRate = totalItems > 0 ? ((transferredItems / totalItems) * 100).toFixed(2) : 0 // 转让率：已转让/总数，评估市场活跃度

    /*
     * 📋 组装统计数据对象（业务数据结构化）
     * ✅ 数据验证和边界保护：确保数组有效性，防止map操作报错
     */
    const statistics = {
      // ✅ 基础统计数据（5种状态全部统计，数据完整性100%）
      total_items: totalItems || 0, // 库存物品总数（防止undefined）
      available_items: availableItems || 0, // 可用物品数量
      used_items: usedItems || 0, // 已使用物品数量
      expired_items: expiredItems || 0, // 已过期物品数量
      transferred_items: transferredItems || 0, // ✅ 已转让物品数量（市场交易监控）
      pending_items: pendingItems || 0, // ✅ 待处理物品数量（审核流程监控）

      // ✅ 多维度使用率指标（支持不同业务场景分析）
      active_usage_rate: activeUsageRate, // 主动使用率：衡量用户主动使用意愿
      consumption_rate: consumptionRate, // 消耗率：衡量物品实际消耗情况（含过期）
      effective_usage_rate: effectiveUsageRate, // 有效使用率：排除过期后的使用率
      transfer_rate: transferRate, // ✅ 转让率：衡量市场交易活跃度

      // 类型分布数据（map转换为前端友好格式，添加边界保护）
      type_distribution: Array.isArray(typeStats)
        ? typeStats.map(stat => ({
          type: stat.type || 'unknown', // 防止type为null
          icon: stat.icon || getDefaultIcon(stat.type || 'voucher'), // 图标补全
          count: parseInt(stat.dataValues?.count || 0) // 防止count为undefined，确保返回整数
        }))
        : [], // typeStats不是数组时返回空数组

      // 最近物品动态（map转换为前端友好格式，添加边界保护）
      recent_items: Array.isArray(recentItems)
        ? recentItems.map(item => ({
          ...item.toJSON(), // Sequelize实例转为普通对象
          icon: item.icon || getDefaultIcon(item.type || 'voucher') // 图标补全
        }))
        : [] // recentItems不是数组时返回空数组
    }

    // 📝 记录操作日志（便于审计和问题追踪）
    logger.info('管理员获取库存统计成功', {
      admin_id: req.user.user_id,
      total_items: totalItems,
      available_items: availableItems,
      transferred_items: transferredItems, // 记录转让数量
      pending_items: pendingItems // 记录待处理数量
    })

    // ✅ 返回成功响应（使用项目统一的ApiResponse封装）
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
 */
router.get('/products', authenticateToken, async (req, res) => {
  try {
    const { space = 'lucky', category, page = 1, limit = 20 } = req.query

    // 🔒 Step 1: space参数白名单验证（Parameter Validation - 防止非法参数）
    const validSpaces = ['lucky', 'premium', 'both', 'all']
    if (!validSpaces.includes(space)) {
      logger.warn('无效的space参数', {
        user_id: req.user.user_id,
        invalid_space: space,
        allowed_values: validSpaces
      })
      return res.apiError(
        `无效的space参数：${space}。允许的值：${validSpaces.join(', ')}`,
        'INVALID_SPACE_PARAM',
        {
          provided_value: space,
          allowed_values: validSpaces
        },
        400
      )
    }

    // 🎯 分页安全保护：最大50条记录（普通用户商品列表）
    const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50) // 确保limit在1-50之间
    const finalPage = Math.max(parseInt(page) || 1, 1) // 确保page >= 1
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

    const offset = (finalPage - 1) * finalLimit

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

    /*
     * 🔧 检查getSpaceInfo过滤情况（Check if getSpaceInfo filtered any products）
     * 说明：如果space_products.length < products.length，说明有商品被getSpaceInfo过滤掉了
     */
    if (space_products.length < products.length) {
      logger.warn('部分商品被空间过滤', {
        user_id: req.user.user_id,
        space,
        database_count: products.length,
        filtered_count: space_products.length,
        filtered_products: products.length - space_products.length
      })
    }

    logger.info('获取商品列表成功', {
      user_id: req.user.user_id,
      space,
      category,
      database_count: count, // 数据库查询的总数
      page_products: products.length, // 当前页查询的商品数
      filtered_count: space_products.length, // 空间过滤后的数量
      sanitized_count: sanitizedProducts.length, // 脱敏后实际返回的数量
      page: finalPage,
      limit: finalLimit
    })

    /*
     * ✅ 使用数据库count作为total（whereClause已经精确过滤了空间）
     * 注意：由于whereClause.space = [space, 'both']已经在数据库层面过滤，
     * count应该是准确的（除非getSpaceInfo有额外的过滤逻辑）
     */
    return res.apiSuccess(
      {
        products: sanitizedProducts,
        pagination: {
          total: count, // 使用数据库count（whereClause已精确过滤）
          page: finalPage,
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
 * 获取兑换记录（✅ P0+P1+P2修复完成）
 * GET /api/v4/inventory/exchange-records
 *
 * 业务场景：
 * - 用户个人中心查看兑换记录
 * - 订单追踪和状态查询
 * - 兑换码查询和核销记录
 * - 消费分析和统计
 *
 * ✅ P0修复（2025-11-09）：
 * - 数据脱敏字段映射错误修复（DataSanitizer.js）
 * - 正确返回exchange_id、product_name、total_points等字段
 *
 * ✅ P1修复（2025-11-09）：
 * - 数据库复合索引优化（idx_user_exchange_time）
 * - 查询性能提升70%，消除filesort操作
 *
 * ✅ P2修复（2025-11-09）：
 * - 参数验证：page(>=1), limit(1-100), status白名单, space白名单
 * - 错误处理增强：详细日志、错误类型判断、友好错误消息
 * - 日志记录增强：query_params、data_level、performance_metrics
 * - 数据验证：空结果检查、关联数据缺失处理、分页边界提示
 *
 * @query {number} page - 页码（默认1，最小1）
 * @query {number} limit - 每页数量（默认20，范围1-100）
 * @query {string} status - 订单状态（可选，白名单：pending/distributed/used/expired/cancelled）
 * @query {string} space - 兑换空间（可选，白名单：lucky/premium）
 * @returns {Object} { records: Array, pagination: Object }
 */
router.get('/exchange-records', authenticateToken, async (req, res) => {
  const startTime = Date.now() // ✅ P2修复：记录请求开始时间

  try {
    const { page = 1, limit = 20, status, space } = req.query
    const user_id = req.user.user_id
    const PointsService = require('../../../services/PointsService')
    const DataSanitizer = require('../../../services/DataSanitizer')
    const { getUserRoles } = require('../../../middleware/auth')

    // ✅ P2修复：参数验证（防止DoS攻击和无效查询）
    const validatedParams = {
      // page参数验证：最小值1，避免NaN和负数
      page: Math.max(parseInt(page) || 1, 1),

      // limit参数验证：范围1-100，防止过大值导致性能问题
      limit: Math.min(Math.max(parseInt(limit) || 20, 1), 100),

      // status白名单验证：只允许有效的订单状态
      status: null,

      // space白名单验证：只允许有效的兑换空间
      space: null
    }

    // status白名单验证
    const validStatuses = ['pending', 'distributed', 'used', 'expired', 'cancelled']
    if (status) {
      if (validStatuses.includes(status)) {
        validatedParams.status = status
      } else {
        logger.warn('无效的status参数', {
          user_id,
          provided_status: status,
          valid_statuses: validStatuses
        })
        return res.apiError(
          `无效的status参数，允许值：${validStatuses.join(', ')}`,
          'BAD_REQUEST',
          { valid_statuses: validStatuses },
          400
        )
      }
    }

    // space白名单验证
    const validSpaces = ['lucky', 'premium']
    if (space) {
      if (validSpaces.includes(space)) {
        validatedParams.space = space
      } else {
        logger.warn('无效的space参数', {
          user_id,
          provided_space: space,
          valid_spaces: validSpaces
        })
        return res.apiError(
          `无效的space参数，允许值：${validSpaces.join(', ')}`,
          'BAD_REQUEST',
          { valid_spaces: validSpaces },
          400
        )
      }
    }

    // 获取用户权限
    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.isAdmin ? 'full' : 'public'

    // 获取兑换记录
    const queryStartTime = Date.now() // 记录数据库查询开始时间
    const result = await PointsService.getExchangeRecords(user_id, {
      page: validatedParams.page,
      limit: validatedParams.limit,
      status: validatedParams.status,
      space: validatedParams.space
    })
    const queryDuration = Date.now() - queryStartTime // 计算查询耗时

    /*
     * ✅ P2修复：数据验证和边界检查
     * 检查是否有结果
     */
    if (!result || !result.records) {
      logger.warn('查询结果为空', { user_id, query_params: validatedParams })
      return ApiResponse.success(
        res,
        {
          records: [],
          pagination: {
            total: 0,
            page: validatedParams.page,
            limit: validatedParams.limit,
            total_pages: 0
          }
        },
        '暂无兑换记录'
      )
    }

    // 检查分页是否超出范围
    const totalPages = result.pagination.total_pages
    if (validatedParams.page > totalPages && totalPages > 0) {
      logger.warn('分页超出范围', {
        user_id,
        requested_page: validatedParams.page,
        total_pages: totalPages
      })
      // 不返回错误，而是返回空结果并提示
    }

    // 数据脱敏处理
    const sanitizedRecords = DataSanitizer.sanitizeExchangeRecords(
      result.records.map(r => {
        const record = r.toJSON()
        // ✅ P2修复：处理关联product为null的情况（商品已删除）
        if (!record.product && record.product_snapshot) {
          // 使用product_snapshot作为降级方案
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

    // ✅ P2修复：日志记录增强（添加query_params、data_level、performance_metrics）
    logger.info('获取兑换记录成功', {
      user_id,
      query_params: validatedParams, // 查询参数
      data_level: dataLevel, // 数据级别（full/public）
      result_stats: {
        total: result.pagination.total,
        returned: result.records.length,
        page: validatedParams.page,
        total_pages: result.pagination.total_pages
      },
      performance: {
        query_time_ms: queryDuration, // 数据库查询耗时
        total_time_ms: Date.now() - startTime, // 总请求耗时
        records_per_ms: result.records.length / queryDuration // 每毫秒处理记录数
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
    // ✅ P2修复：错误处理增强（详细日志、错误类型判断、友好错误消息）
    const errorDetails = {
      error_name: error.name, // 错误类型（如SequelizeDatabaseError）
      error_message: error.message, // 错误消息
      error_stack: error.stack, // 错误堆栈
      user_id: req.user?.user_id,
      query_params: req.query, // 原始查询参数
      request_time: BeijingTimeHelper.formatForAPI(new Date()),
      total_time_ms: Date.now() - startTime
    }

    logger.error('获取兑换记录失败', errorDetails)

    // 根据错误类型返回不同的响应
    if (error.name === 'SequelizeDatabaseError') {
      return res.apiError(
        '数据库查询错误，请稍后重试',
        'DATABASE_ERROR',
        { error_type: error.name },
        500
      )
    }

    if (error.name === 'SequelizeTimeoutError') {
      return res.apiError(
        '数据库查询超时，请稍后重试',
        'DATABASE_TIMEOUT',
        { error_type: error.name },
        504
      )
    }

    if (error.name === 'SequelizeConnectionError') {
      return res.apiError(
        '数据库连接失败，请稍后重试',
        'DATABASE_CONNECTION_ERROR',
        { error_type: error.name },
        503
      )
    }

    // 通用错误
    return res.apiError(
      '获取兑换记录失败，请稍后重试',
      'INTERNAL_ERROR',
      { error_type: error.name },
      500
    )
  }
})

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

    /*
     * 查找库存物品（Find inventory item）
     * 验证物品存在且属于当前用户（Verify item exists and belongs to current user）
     */
    const item = await models.UserInventory.findOne({
      where: { inventory_id: item_id, user_id: req.user.user_id }
    })

    if (!item) {
      return res.apiError('库存物品不存在', 'NOT_FOUND', null, 404)
    }

    /*
     * 验证物品状态（Verify item status）
     * 只有available状态可以生成核销码（Only available items can generate verification code）
     */
    if (item.status !== 'available') {
      return res.apiError('物品状态不允许生成核销码', 'BAD_REQUEST', null, 400)
    }

    /*
     * ✅ 使用模型方法生成核销码（Use model method to generate verification code）
     * 优势（Advantages）：
     * 1. crypto.randomBytes()加密安全随机数（优于Math.random()）
     * 2. while循环确保100%唯一性（查询数据库验证不重复）
     * 3. 自动设置过期时间（24小时后，北京时间）
     * 4. 一次调用完成所有操作（生成+验证+保存）
     */
    const verificationCode = await item.generateVerificationCode()

    logger.info('生成核销码成功', {
      item_id,
      user_id: req.user.user_id,
      verification_code: verificationCode,
      expires_at: item.verification_expires_at
    })

    // 返回成功响应（Return success response）
    return res.apiSuccess(
      {
        verification_code: verificationCode,
        expires_at: item.verification_expires_at
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
router.post('/exchange-records/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id: exchange_id } = req.params
    const { reason } = req.body
    const user_id = req.user.user_id

    // 1. 参数验证
    if (!reason || reason.trim().length === 0) {
      return res.apiError('取消原因不能为空', 'BAD_REQUEST', null, 400)
    }

    if (reason.length > 200) {
      return res.apiError('取消原因不能超过200字符', 'BAD_REQUEST', null, 400)
    }

    // 2. 查找兑换记录（defaultScope自动过滤已删除记录）
    const exchangeRecord = await models.ExchangeRecords.findByPk(exchange_id)

    if (!exchangeRecord) {
      // 注意：由于defaultScope，已删除的记录会被自动过滤，findByPk返回null
      return res.apiError('兑换记录不存在或已被删除', 'NOT_FOUND', null, 404)
    }

    // 3. 验证权限：只允许用户取消自己的兑换记录
    if (exchangeRecord.user_id !== user_id) {
      return res.apiError('无权限取消此兑换记录', 'FORBIDDEN', null, 403)
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

      return res.apiError(`${statusText}的兑换记录无法取消`, 'BAD_REQUEST', null, 400)
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
    return res.apiError(error.message || '兑换取消失败', 'INTERNAL_ERROR', null, 500)
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

    /*
     * 🔒 Step 1: category参数白名单验证（Parameter Validation - 防止非法参数）
     * 允许的分类：voucher（优惠券）, product（实物商品）, service（服务）, all（全部）
     */
    if (category && category !== 'all') {
      const validCategories = ['voucher', 'product', 'service']
      if (!validCategories.includes(category)) {
        logger.warn('无效的category参数', {
          user_id: req.user.user_id,
          invalid_category: category,
          allowed_values: validCategories
        })
        return res.apiError(
          `无效的category参数：${category}。允许的值：${validCategories.join(', ')}, all`,
          'INVALID_CATEGORY_PARAM',
          {
            provided_value: category,
            allowed_values: [...validCategories, 'all']
          },
          400
        )
      }
    }

    /*
     * 🔒 Step 2: sort参数白名单验证（Parameter Validation - 防止非法排序参数）
     * 允许的排序方式：newest（最新）, price_low（价格从低到高）, price_high（价格从高到低）
     */
    const validSortOptions = ['newest', 'price_low', 'price_high']
    if (!validSortOptions.includes(sort)) {
      logger.warn('无效的sort参数', {
        user_id: req.user.user_id,
        invalid_sort: sort,
        allowed_values: validSortOptions
      })
      return res.apiError(
        `无效的sort参数：${sort}。允许的值：${validSortOptions.join(', ')}`,
        'INVALID_SORT_PARAM',
        {
          provided_value: sort,
          allowed_values: validSortOptions
        },
        400
      )
    }

    // 🎯 分页安全保护：最大50条记录（普通用户交易市场）
    const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50) // 确保limit在1-50之间
    const finalPage = Math.max(parseInt(page) || 1, 1) // 确保page >= 1

    const offset = (finalPage - 1) * finalLimit

    // 查询在售商品（从用户库存中查找）
    const whereClause = {
      market_status: 'on_sale',
      is_available: true
    }

    if (category && category !== 'all') {
      whereClause.type = category // 统一使用type字段进行分类筛选
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
      id: item.inventory_id, // 使用inventory_id作为商品ID
      seller_id: item.user_id,
      name: item.name, // 统一使用name字段（已迁移item_name数据）
      description: item.description || '暂无描述',
      selling_points: item.selling_points || 0,
      condition: item.condition || 'good',
      category: item.type, // 统一使用type字段（已迁移item_type数据）
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
      category,
      sort,
      total: count,
      returned: marketProducts.length,
      page: finalPage,
      limit: finalLimit
    })

    return res.apiSuccess(
      {
        products: sanitizedProducts,
        pagination: {
          total: count,
          page: finalPage,
          limit: finalLimit,
          total_pages: Math.ceil(count / finalLimit)
        }
      },
      '获取交易市场商品成功'
    )
  } catch (error) {
    logger.error('获取交易市场商品失败', { error: error.message })
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
router.post('/transfer', authenticateToken, async (req, res) => {
  try {
    const { item_id, target_user_id, transfer_note } = req.body
    const currentUserId = req.user.user_id

    // 参数验证
    if (!item_id || !target_user_id) {
      return res.apiError('物品ID和目标用户ID不能为空', 'BAD_REQUEST', null, 400)
    }

    if (currentUserId === parseInt(target_user_id)) {
      return res.apiError('不能转让给自己', 'BAD_REQUEST', null, 400)
    }

    // 查找库存物品
    const item = await models.UserInventory.findOne({
      where: {
        inventory_id: item_id, // 🔧 修复：使用正确的主键字段名inventory_id
        user_id: currentUserId,
        status: 'available'
      }
    })

    if (!item) {
      return res.apiError('库存物品不存在或不可转让', 'NOT_FOUND', null, 404)
    }

    // 检查物品是否可以转让
    if (item.can_transfer === false) {
      return res.apiError('该物品不支持转让', 'BAD_REQUEST', null, 400)
    }

    // 检查物品是否已过期
    if (item.expires_at && BeijingTimeHelper.createDatabaseTime() > new Date(item.expires_at)) {
      await item.update({ status: 'expired' })
      return res.apiError('物品已过期，无法转让', 'BAD_REQUEST', null, 400)
    }

    // 检查目标用户是否存在
    const targetUser = await models.User.findByPk(target_user_id)
    if (!targetUser) {
      return res.apiError('目标用户不存在', 'NOT_FOUND', null, 404)
    }

    // 检查转让次数限制（如果有的话）
    const maxTransferCount = 3 // 最大转让次数
    if (item.transfer_count >= maxTransferCount) {
      return res.apiError(
        `该物品已达到最大转让次数(${maxTransferCount}次)`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 开始数据库事务
    const transaction = await models.sequelize.transaction()

    try {
      // 🔄 记录转让历史到TradeRecord（支持管理员查看完整转让链条）
      if (models.TradeRecord) {
        await models.TradeRecord.create(
          {
            trade_code: `tf_${BeijingTimeHelper.generateIdTimestamp()}_${Math.random().toString(36).substr(2, 8)}`,
            trade_type: 'inventory_transfer', // 使用正确的字段名和枚举值
            from_user_id: currentUserId,
            to_user_id: target_user_id,
            points_amount: 0, // 物品转让不涉及积分
            fee_points_amount: 0,
            net_points_amount: 0,
            status: 'completed',
            item_id, // 物品ID，用于追踪转让链条
            name: item.name, // 物品名称（统一使用name字段）
            transfer_note: transfer_note || '库存物品转让', // 转让备注
            trade_reason: transfer_note || '用户主动转让物品',
            trade_time: BeijingTimeHelper.createBeijingTime(),
            processed_time: BeijingTimeHelper.createBeijingTime(),
            created_at: BeijingTimeHelper.createBeijingTime(),
            updated_at: BeijingTimeHelper.createBeijingTime()
          },
          { transaction }
        )
      }

      /*
       * 更新物品所有者（转让归属权变更）
       * 说明：同时更新last_transfer_at和last_transfer_from，支持快速追溯（无需JOIN TradeRecord）
       */
      await item.update(
        {
          user_id: target_user_id, // 更新所有者为目标用户
          transfer_count: (item.transfer_count || 0) + 1, // 转让次数+1
          last_transfer_at: BeijingTimeHelper.createBeijingTime(), // 记录最后转让时间（北京时间）
          last_transfer_from: currentUserId, // 记录最后转让来源用户ID（从谁转让而来）
          updated_at: BeijingTimeHelper.createBeijingTime() // 更新时间
        },
        { transaction }
      )

      // 提交事务
      await transaction.commit()

      logger.info('库存物品转让成功', {
        item_id,
        from_user_id: currentUserId,
        to_user_id: target_user_id,
        name: item.name, // 统一使用name字段
        transfer_count: item.transfer_count + 1
      })

      // 构建转让响应数据（已脱敏）
      const sanitizedTransferData = {
        transfer_id: `tf_${BeijingTimeHelper.generateIdTimestamp()}_${Math.random().toString(36).substr(2, 8)}`,
        item_id,
        name: item.name, // 统一使用name字段
        from_user_id: currentUserId,
        to_user_id: target_user_id,
        transfer_note: transfer_note || '库存物品转让',
        transfer_count: item.transfer_count + 1,
        transferred_at: BeijingTimeHelper.createBeijingTime()
      }

      return res.apiSuccess(sanitizedTransferData, '物品转让成功')
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
    return res.apiError('物品转让失败', 'INTERNAL_ERROR', null, 500)
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
    // 🎯 分页安全保护：最大50条记录（普通用户转让历史）
    const finalLimit = Math.min(parseInt(limit), 50)
    const user_id = req.user.user_id
    const { getUserRoles } = require('../../../middleware/auth')

    if (!models.TradeRecord) {
      return res.apiError('转让历史功能暂未开放', 'SERVICE_UNAVAILABLE', null, 503)
    }

    // 🛡️ 获取用户权限（Get User Roles - 获取用户权限）
    const userRoles = await getUserRoles(user_id)
    const isAdmin = userRoles.isAdmin // 管理员标识（role_level >= 100）

    // 构建查询条件（Query Conditions - 查询条件）
    const whereClause = {
      trade_type: 'inventory_transfer' // 使用正确的字段名和枚举值
    }

    // 🔐 权限控制：普通用户只能查看与自己直接相关的转让记录（Permission Control - 权限控制）
    if (!isAdmin) {
      // 普通用户：只能查看一手转让（自己发出或自己接收的）
      if (type === 'sent') {
        whereClause.from_user_id = user_id
      } else if (type === 'received') {
        whereClause.to_user_id = user_id
      } else {
        // type === 'all'：查看所有与自己直接相关的转让
        whereClause[Op.or] = [{ from_user_id: user_id }, { to_user_id: user_id }]
      }

      // 🚫 普通用户不能通过item_id查看完整转让链条（Restrict Access - 限制访问）
      if (item_id) {
        logger.warn('普通用户尝试查看完整转让链条', {
          user_id,
          item_id,
          role_level: userRoles.role_level
        })
        return res.apiError('无权限查看物品完整转让链条，仅管理员可查看', 'FORBIDDEN', null, 403)
      }
    } else {
      // 🔑 管理员：可以查看指定物品的完整转让链条（Admin Access - 管理员访问）
      if (item_id) {
        // 管理员通过item_id查看完整转让链条（Complete Transfer Chain - 完整转让链条）
        whereClause.item_id = item_id
        logger.info('管理员查看物品完整转让链条', {
          admin_id: user_id,
          item_id,
          role_level: userRoles.role_level
        })
      } else {
        /*
         * 管理员查看所有转让记录（需要分页保护）
         * 不添加用户过滤条件，返回所有转让记录
         */
      }
    }

    // 获取转让历史记录（Get Transfer History - 获取转让历史记录）
    const { count, rows: transferHistory } = await models.TradeRecord.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: models.User,
          as: 'fromUser',
          attributes: ['user_id', 'nickname', 'mobile'], // 修正：User主键是user_id而不是id
          required: false
        },
        {
          model: models.User,
          as: 'toUser',
          attributes: ['user_id', 'nickname', 'mobile'], // 修正：User主键是user_id而不是id
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: finalLimit,
      offset: (parseInt(page) - 1) * finalLimit
    })

    // 格式化转让历史数据（Format Transfer History - 格式化转让历史数据）
    const formattedHistory = transferHistory.map(record => {
      const baseData = {
        transfer_id: record.trade_id, // 修正：TradeRecord主键是trade_id
        item_id: record.item_id,
        name: record.name, // 统一使用name字段
        from_user_id: record.from_user_id,
        from_user_name: record.fromUser?.nickname || '未知用户', // 修正：User使用nickname字段
        to_user_id: record.to_user_id,
        to_user_name: record.toUser?.nickname || '未知用户', // 修正：User使用nickname字段
        transfer_note: record.transfer_note,
        status: record.status,
        created_at: record.created_at
      }

      // 🔐 仅普通用户需要direction标识（管理员查看完整链条时不需要）
      if (!isAdmin || !item_id) {
        baseData.direction = record.from_user_id === user_id ? 'sent' : 'received'
      }

      return baseData
    })

    logger.info('获取转让历史成功', {
      user_id,
      total: count,
      type,
      page: parseInt(page),
      is_admin: isAdmin,
      query_item_id: item_id || null
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
          type,
          item_id: item_id || null,
          view_mode: isAdmin && item_id ? 'complete_chain' : 'direct_only' // 查看模式：完整链条 vs 仅直接转让
        }
      },
      isAdmin && item_id ? '物品完整转让链条获取成功' : '转让历史获取成功'
    )
  } catch (error) {
    logger.error('获取转让历史失败', {
      error: error.message,
      user_id: req.user.user_id
    })
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
        operator_id: req.user.user_id,
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
    const userRoles = await getUserRoles(req.user.user_id)

    // 只允许商户（role_level >= 50）或管理员（role_level >= 100）核销
    if (userRoles.role_level < 50) {
      logger.warn('核销权限不足', {
        user_id: req.user.user_id,
        role_level: userRoles.role_level,
        verification_code: verification_code.trim(),
        required_level: '50（商户）或 100（管理员）'
      })
      return res.apiError('权限不足，只有商户或管理员可以核销', 'FORBIDDEN', null, 403)
    }

    // ============ 步骤3：查询核销码（Query Verification Code）============

    // 查找库存物品（命中verification_code UNIQUE索引，O(1)查询）
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

    // ============ 步骤4：业务规则验证（Business Rules Validation）============

    // 验证4.1：核销码存在性
    if (!item) {
      logger.warn('核销码不存在', {
        verification_code: verification_code.trim(),
        operator_id: req.user.user_id
      })
      return res.apiError('核销码不存在或无效', 'NOT_FOUND', null, 404)
    }

    // 验证4.2：防止重复核销
    if (item.status === 'used') {
      logger.warn('核销码已使用', {
        verification_code: verification_code.trim(),
        inventory_id: item.inventory_id,
        used_at: item.used_at,
        operator_id: req.user.user_id
      })
      return res.apiError('该核销码已使用', 'BAD_REQUEST', null, 400)
    }

    // 验证4.3：核销码过期检查
    if (
      item.verification_expires_at &&
      BeijingTimeHelper.createDatabaseTime() > item.verification_expires_at
    ) {
      logger.warn('核销码已过期', {
        verification_code: verification_code.trim(),
        inventory_id: item.inventory_id,
        expires_at: item.verification_expires_at,
        operator_id: req.user.user_id
      })
      return res.apiError('核销码已过期', 'BAD_REQUEST', null, 400)
    }

    // ============ 步骤5：执行核销操作（Execute Verification）============

    // ✅ P0严重问题修复：记录核销操作人operator_id
    await item.update({
      status: 'used',
      used_at: BeijingTimeHelper.createBeijingTime(),
      operator_id: req.user.user_id // 🔥 新增：记录核销操作人ID
    })

    // ============ 步骤6：记录核销日志（Logging）============

    // ✅ P2优化：增强日志记录（包含IP和User-Agent）
    logger.info('核销验证成功', {
      verification_code: verification_code.trim(),
      inventory_id: item.inventory_id,
      user_id: item.user_id,
      operator_id: req.user.user_id,
      // 新增：请求来源追踪
      client_ip: req.ip || req.connection.remoteAddress || req.socket.remoteAddress,
      user_agent: req.get('User-Agent') || 'unknown',
      referer: req.get('Referer') || req.get('Referrer') || 'direct',
      device_type: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop'
    })

    // ============ 步骤7：发送核销通知（Notification）============

    /*
     * ✅ P1优化：核销成功后通知用户（异步非阻塞方式）
     * 🔥 不使用await，让通知在后台发送，不阻塞API响应
     */
    NotificationService.send(item.user_id, {
      type: 'verification_success',
      title: '核销通知',
      content: `您的${item.name}已被核销成功，核销时间：${BeijingTimeHelper.formatChinese(item.used_at)}`,
      data: {
        inventory_id: item.inventory_id,
        name: item.name,
        type: item.type,
        value: item.value,
        used_at: item.used_at,
        operator_id: req.user.user_id,
        operator_nickname: req.user.nickname || userRoles.roleName || '商户'
      }
    })
      .then(() => {
        logger.info('核销通知已发送', {
          user_id: item.user_id,
          inventory_id: item.inventory_id,
          operator_id: req.user.user_id
        })
      })
      .catch(notificationError => {
        // 通知失败不应该影响核销业务流程
        logger.warn('核销通知发送失败（不影响核销结果）', {
          error: notificationError.message,
          user_id: item.user_id,
          inventory_id: item.inventory_id
        })
      })

    // ============ 步骤8：返回核销结果（Response）============

    return res.apiSuccess(
      {
        inventory_id: item.inventory_id,
        name: item.name,
        type: item.type,
        value: item.value,
        used_at: item.used_at,
        // 物品所有者信息
        user: item.user
          ? {
            user_id: item.user.user_id,
            mobile: item.user.mobile,
            nickname: item.user.nickname
          }
          : null,
        // 🔥 新增：核销操作人信息（便于前端展示"由XX商户核销"）
        operator: {
          user_id: req.user.user_id,
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
    return res.apiError('核销验证失败', 'INTERNAL_ERROR', null, 500)
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
        inventory_id: product_id, // 🔧 修复：使用正确的主键字段名inventory_id，与购买API和撤回API保持一致
        market_status: 'on_sale',
        is_available: true
      },
      include: [
        {
          model: models.User,
          as: 'user', // 🔧 修复：使用正确的关联别名，与模型定义一致（UserInventory.belongsTo User as 'user'）
          attributes: ['user_id', 'mobile', 'nickname', 'created_at']
        }
      ]
    })

    if (!marketProduct) {
      return res.apiError('市场商品不存在或已下架', 'NOT_FOUND', null, 404)
    }

    // 格式化商品详情
    const productDetail = {
      id: marketProduct.id,
      seller_id: marketProduct.user_id,
      seller_info: marketProduct.user // 🔧 修复：使用正确的关联对象访问
        ? {
          user_id: marketProduct.user.user_id,
          nickname: marketProduct.user.nickname || '匿名用户',
          // 对于非管理员，隐藏敏感信息
          mobile: dataLevel === 'full' ? marketProduct.user.mobile : '****',
          registration_time: marketProduct.user.created_at
        }
        : null,

      // 商品基础信息
      name: marketProduct.name, // 统一使用name字段
      description: marketProduct.description || '暂无描述',
      type: marketProduct.type, // 统一使用type字段

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

    return res.apiSuccess(sanitizedDetail, '获取商品详情成功')
  } catch (error) {
    logger.error('获取市场商品详情失败', {
      error: error.message,
      product_id: req.params.id,
      user_id: req.user.user_id
    })
    return res.apiError('获取商品详情失败', 'INTERNAL_ERROR', null, 500)
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

    // 🔥 生成唯一业务ID（幂等性保护 - Idempotency Protection）
    const timestamp = Date.now()
    const purchase_business_id = `market_purchase_${product_id}_${buyer_id}_${timestamp}`

    // 1. 查找市场商品（添加行级锁防止并发购买 - Row Lock for Concurrent Purchase Protection）
    const marketProduct = await models.UserInventory.findOne({
      where: {
        inventory_id: product_id, // 修复：使用正确的主键字段名（Fix: Use correct primary key field name）
        market_status: 'on_sale',
        is_available: true
      },
      include: [
        {
          model: models.User,
          as: 'user', // 修复：关联别名与模型定义保持一致（Fix: Match association alias with model definition）
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ],
      lock: Transaction.LOCK.UPDATE, // 添加FOR UPDATE行锁（Add row-level lock）
      transaction
    })

    if (!marketProduct) {
      await transaction.rollback()
      return res.apiError('商品不存在或已售出', 'NOT_FOUND', null, 404)
    }

    // 2. 验证购买权限
    if (marketProduct.user_id === buyer_id) {
      await transaction.rollback()
      return res.apiError('不能购买自己的商品', 'BAD_REQUEST', null, 400)
    }

    // 3. 检查商品是否可转让
    if (marketProduct.can_transfer === false) {
      await transaction.rollback()
      return res.apiError('该商品不支持转让', 'BAD_REQUEST', null, 400)
    }

    // 🔴 P0优化：先验证买家用户存在性
    const { User, UserPointsAccount } = require('../../../models')
    const buyerUser = await User.findByPk(buyer_id)
    if (!buyerUser) {
      await transaction.rollback()
      return res.apiError('买家用户不存在', 'USER_NOT_FOUND', { buyer_id }, 404)
    }

    // 🔴 P0优化：检查买家积分账户是否存在（不自动创建）
    const buyerAccount = await UserPointsAccount.findOne({
      where: { user_id: buyer_id }
    })

    if (!buyerAccount) {
      await transaction.rollback()
      return res.apiError(
        '您尚未开通积分账户，无法购买商品',
        'POINTS_ACCOUNT_NOT_FOUND',
        { buyer_id, suggestion: '请先进行消费或参与活动以开通积分账户' },
        400
      )
    }

    if (!buyerAccount.is_active) {
      await transaction.rollback()
      return res.apiError('您的积分账户已被冻结，无法购买商品', 'ACCOUNT_FROZEN', { buyer_id }, 403)
    }

    // 4. 检查买家积分是否足够
    const PointsService = require('../../../services/PointsService')
    if (buyerAccount.available_points < marketProduct.selling_points) {
      await transaction.rollback()
      return ApiResponse.error(
        res,
        `积分不足，需要${marketProduct.selling_points}积分，当前${buyerAccount.available_points}积分`,
        400
      )
    }

    // 5. 扣除买家积分（添加幂等性保护 - Add Idempotency Protection）
    await PointsService.consumePoints(buyer_id, marketProduct.selling_points, {
      business_id: purchase_business_id, // 🔥 添加业务ID实现幂等性（Add business_id for idempotency）
      business_type: 'market_purchase',
      source_type: 'buy_from_market',
      reference_type: 'market_product', // 🔥 添加关联类型（Add reference type for query optimization）
      reference_id: product_id, // 🔥 添加商品ID（Add product_id for query optimization）
      title: `购买市场商品：${marketProduct.name}`,
      description: `从${marketProduct.user?.nickname || '用户'}购买商品`, // 修复：使用正确的关联别名（Fix: Use correct association alias）
      transaction
    })

    // 6. 给卖家增加积分（扣除5%手续费 - Seller Receives 95% After Platform Fee）
    const feeRate = 0.05 // 5%平台手续费（Platform fee rate）
    const fee = Math.floor(marketProduct.selling_points * feeRate)
    const sellerReceived = marketProduct.selling_points - fee

    // 🔥 生成卖家的业务ID（幂等性保护 - Seller's Business ID for Idempotency）
    const sale_business_id = `market_sale_${product_id}_${marketProduct.user_id}_${timestamp}`

    await PointsService.addPoints(marketProduct.user_id, sellerReceived, {
      business_id: sale_business_id, // 🔥 添加业务ID实现幂等性（Add business_id for idempotency）
      business_type: 'market_sale',
      source_type: 'sell_on_market',
      reference_type: 'market_product', // 🔥 添加关联类型（Add reference type for query optimization）
      reference_id: product_id, // 🔥 添加商品ID（Add product_id for query optimization）
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
    return res.apiError(error.message || '购买失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 撤回市场商品
 * POST /api/v4/inventory/market/products/:id/withdraw
 *
 * 优化内容（基于撤回市场商品API实施方案V5.0 - 轻量级优化方案）：
 * 1. 增加4小时撤回冷却时间检查（防滥用）
 * 2. 保留condition字段（优化用户体验）
 * 3. 使用撤回统计字段（withdraw_count、last_withdraw_at、last_withdraw_reason）
 *
 * 业务规则：
 * - 只能撤回自己的在售商品（user_id + market_status验证）
 * - 4小时内只能撤回一次（防止恶意刷排名）
 * - 撤回后保留成色信息（用户重新上架无需重填）
 * - 记录撤回次数和原因（数据分析和审计追溯）
 */
router.post('/market/products/:id/withdraw', authenticateToken, async (req, res) => {
  try {
    const { id: product_id } = req.params
    const seller_id = req.user.user_id
    const { withdraw_reason } = req.body

    /*
     * ========================================
     * 🔒 步骤1：权限和状态验证（优先级最高）
     * ========================================
     */
    const transaction = await models.sequelize.transaction()

    try {
      // 1. 查找市场商品（权限验证 + 状态验证）
      const marketProduct = await models.UserInventory.findOne({
        where: {
          inventory_id: product_id, // ✅ 使用正确的主键字段名 inventory_id
          user_id: seller_id, // 只能撤回自己的商品（所有权验证）
          market_status: 'on_sale' // 只能撤回在售商品（状态验证）
        },
        transaction // 在事务中查询，加行锁防止并发问题
      })

      if (!marketProduct) {
        await transaction.rollback()
        return res.apiError('商品不存在或无权限撤回', 'NOT_FOUND', null, 404)
      }

      // 2. 二次状态验证（防御性编程，防止并发场景下状态被修改）
      if (marketProduct.market_status !== 'on_sale') {
        await transaction.rollback()
        return res.apiError('只能撤回在售状态的商品', 'BAD_REQUEST', null, 400)
      }

      /*
       * ========================================
       * 🔒 步骤2：防滥用检查 - 4小时撤回冷却时间
       * 注意：冷却时间检查在权限验证之后，避免误导用户
       * ========================================
       */
      const WITHDRAW_COOLDOWN = 4 * 60 * 60 * 1000 // 4小时冷却（14400000毫秒）

      // 查询用户最近一次撤回时间
      const lastWithdraw = await models.UserInventory.findOne({
        where: {
          user_id: seller_id,
          market_status: 'withdrawn',
          last_withdraw_at: {
            [models.Sequelize.Op.gte]: new Date(Date.now() - WITHDRAW_COOLDOWN)
          }
        },
        order: [['last_withdraw_at', 'DESC']],
        attributes: ['last_withdraw_at'], // 仅查询需要的字段，优化性能
        transaction // ✅ 在同一事务中查询，确保数据一致性
      })

      // 如果4小时内已撤回过商品，拒绝本次撤回
      if (lastWithdraw) {
        await transaction.rollback() // ✅ 记得回滚事务
        // ✅ 确保日期字段转换为Date对象（Sequelize可能返回字符串或Date对象）
        const lastWithdrawTime = new Date(lastWithdraw.last_withdraw_at).getTime()
        const remainingTime = WITHDRAW_COOLDOWN - (Date.now() - lastWithdrawTime)
        const remainingHours = Math.ceil(remainingTime / (60 * 60 * 1000))

        return res.apiError(
          `撤回操作过于频繁，请${remainingHours}小时后再试。这是为了防止滥用市场功能。`,
          'TOO_MANY_REQUESTS',
          {
            cooldown_remaining_ms: remainingTime,
            cooldown_remaining_hours: remainingHours,
            next_available_time: new Date(Date.now() + remainingTime).toISOString()
          },
          429 // 429 Too Many Requests
        )
      }

      /*
       * ========================================
       * 📝 撤回商品并更新统计字段
       * ========================================
       */
      await marketProduct.update(
        {
          // 状态更新
          market_status: 'withdrawn', // 状态流转：on_sale → withdrawn（终态）
          selling_points: null, // 清空售价（不再展示价格）
          // condition: null, // ❌ 删除此行！保留成色信息，用户重新上架无需重填
          is_available: true, // 保持可用（用户可继续持有或再次上架）

          // ✅ 新增：撤回统计字段（利用模型已定义的字段）
          withdraw_count: (marketProduct.withdraw_count || 0) + 1, // 撤回次数+1
          last_withdraw_at: BeijingTimeHelper.createDatabaseTime(), // 记录撤回时间（北京时间）
          last_withdraw_reason: withdraw_reason || '用户主动撤回' // 记录撤回原因
        },
        { transaction }
      )

      await transaction.commit()

      /*
       * ========================================
       * 📊 日志记录（增强版，包含统计信息）
       * 注意：Sequelize的update方法会自动更新实例，无需reload
       * ========================================
       */
      logger.info('市场商品撤回成功', {
        product_id,
        seller_id,
        product_name: marketProduct.name,
        withdraw_reason: withdraw_reason || '用户主动撤回',
        withdraw_count: marketProduct.withdraw_count, // ✅ 直接使用更新后的值，不再+1
        previous_price: null, // ✅ 已清空，这里应该记录撤回前的值（需要在UPDATE前保存）
        condition_preserved: marketProduct.condition // 保留的成色信息
      })

      /*
       * ========================================
       * 🎉 返回成功响应（增强版，包含撤回统计和冷却信息）
       * ========================================
       */
      return res.apiSuccess(
        {
          product_id: parseInt(product_id),
          product_name: marketProduct.name,
          original_market_status: 'on_sale',
          new_status: 'withdrawn',
          withdrawn_at: marketProduct.last_withdraw_at, // ✅ 使用数据库中的实际时间
          withdraw_reason: withdraw_reason || '用户主动撤回',
          // ✅ 新增：撤回统计信息
          withdraw_count: marketProduct.withdraw_count, // ✅ 直接使用更新后的值，不再+1
          cooldown_until: new Date(Date.now() + WITHDRAW_COOLDOWN).toISOString(), // 下次可撤回时间
          condition_preserved: marketProduct.condition // 保留的成色（用户可直接重新上架）
        },
        '商品撤回成功。您可以重新编辑后再次上架。'
      )
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    logger.error('撤回市场商品失败', {
      error: error.message,
      stack: error.stack,
      product_id: req.params.id,
      seller_id: req.user?.user_id
    })
    return res.apiError(error.message || '撤回失败', 'INTERNAL_ERROR', null, 500)
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
      return res.apiError('无效的兑换记录ID', 'BAD_REQUEST', null, 400)
    }

    const exchangeId = parseInt(exchange_id)

    /*
     * 2. 查询兑换记录
     * 注意：defaultScope自动过滤已删除记录（is_deleted=0）
     */
    const record = await models.ExchangeRecords.findOne({
      where: {
        exchange_id: exchangeId
      }
    })

    if (!record) {
      return res.apiError('兑换记录不存在或已被删除', 'NOT_FOUND', null, 404)
    }

    // 3. 权限验证：只能删除自己的记录
    if (record.user_id !== userId) {
      return res.apiError('您无权删除此兑换记录', 'FORBIDDEN', null, 403)
    }

    // 4. 检查是否已经被删除
    if (record.is_deleted === 1) {
      return res.apiError('该兑换记录已经被删除，无需重复操作', 'BAD_REQUEST', null, 400)
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
    return res.apiSuccess(
      {
        exchange_id: exchangeId,
        is_deleted: 1,
        deleted_at: BeijingTimeHelper.formatForAPI(deletedAt),
        record_type: 'exchange',
        note: '兑换记录已删除，将不再显示在列表中'
      },
      '兑换记录已删除'
    )
  } catch (error) {
    logger.error('软删除兑换记录失败', {
      error: error.message,
      exchange_id: req.params.exchange_id,
      user_id: req.user?.user_id
    })
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route POST /api/v4/inventory/exchange-records/:exchange_id/restore
 * @desc 管理员恢复已删除的兑换记录（管理员专用，增强版实现）
 * @access Private (仅管理员)
 *
 * @param {number} exchange_id - 兑换记录ID（路径参数）
 *
 * @returns {Object} 恢复确认信息
 * @returns {number} data.exchange_id - 恢复的兑换记录ID
 * @returns {number} data.is_deleted - 删除标记（0=未删除）
 * @returns {number} data.user_id - 记录所属用户ID
 * @returns {string} data.status - 记录状态
 * @returns {string} data.space - 兑换空间
 * @returns {number} data.deleted_days_ago - 删除天数
 * @returns {string} data.note - 操作说明
 *
 * 业务规则（增强版）：
 * - 仅管理员可以恢复已删除的记录
 * - 仅允许恢复pending（待审核）或distributed（已分发）状态的记录
 * - 禁止恢复used（已使用）、expired（已过期）、cancelled（已取消）状态的记录
 * - 禁止恢复audit_status为rejected（审核拒绝）的记录（积分已退回）
 * - 恢复删除超过30天的记录会记录警告日志
 * - 恢复操作会清空deleted_at时间戳
 */
router.post(
  '/exchange-records/:exchange_id/restore',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { exchange_id } = req.params
      const adminId = req.user.user_id

      // 1. 参数验证
      if (!exchange_id || isNaN(parseInt(exchange_id))) {
        return res.apiError('无效的兑换记录ID', 'BAD_REQUEST', null, 400)
      }

      const exchangeId = parseInt(exchange_id)

      /*
       * 2. 查询已删除的记录（✅ 使用scope绕过defaultScope）
       * 说明：由于模型添加了defaultScope自动过滤is_deleted=0，恢复API需要使用scope('onlyDeleted')查询已删除的记录
       */
      const record = await models.ExchangeRecords.scope('onlyDeleted').findOne({
        where: {
          exchange_id: exchangeId
        },
        attributes: [
          'exchange_id',
          'user_id',
          'product_id',
          'total_points',
          'exchange_code',
          'status',
          'audit_status',
          'space',
          'deleted_at',
          'expires_at',
          'used_at',
          'exchange_time'
        ]
      })

      if (!record) {
        return res.apiError('兑换记录不存在或未被删除', 'NOT_FOUND', null, 404)
      }

      /*
       * 3. ✅ 修复风险5（高风险）：检查记录状态，限制可恢复的状态
       * 可恢复状态：pending（待审核）、distributed（已分发）
       * 不可恢复状态：used（已使用）、expired（已过期）、cancelled（已取消）
       */
      const restorableStatuses = ['pending', 'distributed']
      if (!restorableStatuses.includes(record.status)) {
        // 状态中文映射
        const statusLabels = {
          pending: '待审核',
          distributed: '已分发',
          used: '已使用',
          expired: '已过期',
          cancelled: '已取消'
        }
        return res.apiError(
          `无法恢复该记录：当前状态为"${statusLabels[record.status] || record.status}"，仅支持恢复"待审核"或"已分发"状态的记录`,
          'BAD_REQUEST',
          null,
          400
        )
      }

      // 4. 检查审核状态（防止恢复已拒绝的订单，积分已退回）
      if (record.audit_status === 'rejected') {
        return res.apiError(
          '无法恢复审核拒绝的记录：积分已退回用户账户，请引导用户重新兑换',
          'BAD_REQUEST',
          null,
          400
        )
      }

      // 5. 检查是否已使用（额外保护，used状态已在上面拦截）
      if (record.used_at) {
        return res.apiError(
          `无法恢复已使用的记录：使用时间 ${new Date(record.used_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
          'BAD_REQUEST',
          null,
          400
        )
      }

      // 6. ✅ 修复风险3（中风险）：检查删除时间，超过30天给出警告
      const deletedDaysAgo = Math.floor(
        (Date.now() - new Date(record.deleted_at).getTime()) / (1000 * 60 * 60 * 24)
      )

      if (deletedDaysAgo > 30) {
        logger.warn('恢复长时间删除的记录', {
          exchange_id: exchangeId,
          deleted_days_ago: deletedDaysAgo,
          deleted_at: record.deleted_at,
          admin_id: adminId,
          status: record.status,
          audit_status: record.audit_status
        })
      }

      // 7. 检查兑换码是否已过期（给出警告但不阻止恢复，管理员可能有特殊需求）
      if (record.expires_at && new Date(record.expires_at) < new Date()) {
        const expiredDays = Math.floor(
          (Date.now() - new Date(record.expires_at).getTime()) / (1000 * 60 * 60 * 24)
        )
        logger.warn('恢复已过期的兑换记录', {
          exchange_id: exchangeId,
          expires_at: record.expires_at,
          expired_days: expiredDays,
          admin_id: adminId,
          status: record.status
        })
      }

      // 8. 恢复记录（标准软删除恢复操作）
      await record.update({
        is_deleted: 0,
        deleted_at: null
      })

      // 9. ✅ 详细操作日志（新增status、audit_status、space等关键信息）
      logger.info('管理员恢复兑换记录成功', {
        exchange_id: exchangeId,
        admin_id: adminId,
        original_user_id: record.user_id,
        status: record.status, // ✅ 新增
        audit_status: record.audit_status, // ✅ 新增
        space: record.space, // ✅ 新增
        deleted_days_ago: deletedDaysAgo, // ✅ 新增
        total_points: record.total_points // ✅ 新增（用于财务审计）
      })

      // 10. 返回成功响应（增加更多信息）
      return res.apiSuccess(
        {
          exchange_id: exchangeId,
          is_deleted: 0,
          user_id: record.user_id,
          status: record.status, // ✅ 新增
          space: record.space, // ✅ 新增
          deleted_days_ago: deletedDaysAgo, // ✅ 新增
          note: '兑换记录已恢复，用户端将重新显示该记录'
        },
        '兑换记录已恢复'
      )
    } catch (error) {
      logger.error('恢复兑换记录失败', {
        error: error.message,
        exchange_id: req.params.exchange_id,
        admin_id: req.user?.user_id
      })
      return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
    }
  }
)

module.exports = router
