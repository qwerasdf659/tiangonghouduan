/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 库存服务（InventoryService）
 *
 * 业务场景：管理用户库存的完整生命周期，包括库存查询、物品使用、转让、核销等所有库存相关业务
 *
 * 核心功能：
 * 1. 库存查询管理（获取库存列表、物品详情、数据脱敏）
 * 2. 物品操作业务（使用物品、转让物品、核销验证）
 * 3. 核销系统管理（生成核销码、核销验证、状态更新）
 * 4. 交易记录审计（转让记录、操作日志、数据追溯）
 * 5. 权限控制（用户/管理员权限、数据级别控制）
 *
 * 业务流程：
 *
 * 1. **物品使用流程**（核销流程）
 *    - 用户选择物品使用 → useItem()更新状态为used
 *    - 记录使用时间 → 业务完成
 *
 * 2. **物品转让流程**（带事务保护）
 *    - 查询物品（加行级锁）→ transferItem()检查状态和权限
 *    - 更新物品所有者 → 创建转让记录 → 提交事务
 *
 * 3. **核销验证流程**（商家核销）
 *    - 用户生成核销码 → generateVerificationCode()设置过期时间
 *    - 商家验证核销码 → verifyCode()验证并使用物品
 *
 * 设计原则：
 * - **数据模型统一**：只使用UserInventory + TradeRecord表，保持数据一致性
 * - **事务安全保障**：所有写操作支持外部事务传入，确保原子性
 * - **权限控制严格**：区分用户/管理员权限，数据脱敏处理
 * - **审计完整性**：每笔操作都有完整记录（操作者、操作时间、业务关联）
 * - **状态管理清晰**：available（可用）→ used（已使用）→ transferred（已转让）→ expired（已过期）状态流转
 *
 * 关键方法列表：
 * - getUserInventory() - 获取用户库存列表（支持过滤、分页、权限控制）
 * - getItemDetail() - 获取物品详情（支持权限检查、审计日志）
 * - useItem() - 使用物品（支持事务、状态检查）
 * - transferItem() - 转让物品（支持事务、幂等性、转让记录）
 * - generateVerificationCode() - 生成核销码（支持过期时间）
 * - verifyCode() - 核销验证（支持商家核销）
 *
 * 数据模型关联：
 * - UserInventory：用户库存表（核心数据：inventory_id、user_id、status、name）
 * - TradeRecord：交易记录表（审计日志：转让记录、交易链条追溯）
 * - User：用户表（关联查询：用户信息、权限验证）
 *
 * 权限控制：
 * - 普通用户：只能查看/操作自己的库存
 * - 管理员：可以查看所有用户的库存、操作任意物品
 * - 数据脱敏：根据权限级别返回不同的数据字段（full/public）
 *
 * 事务支持：
 * - 所有写操作支持外部事务传入（options.transaction参数）
 * - 事务内使用悲观锁（FOR UPDATE）防止并发问题
 * - 典型场景：转让物品、核销验证等需要多表操作的业务
 *
 * 使用示例：
 * ```javascript
 * // 示例1：获取用户库存列表
 * const result = await InventoryService.getUserInventory(userId, {
 *   status: 'available',
 *   type: 'voucher',
 *   page: 1,
 *   limit: 20
 * }, {
 *   viewerId: requesterId
 * });
 *
 * // 示例2：转让物品（带事务保护）
 * const transaction = await sequelize.transaction();
 * try {
 *   const transferResult = await InventoryService.transferItem(
 *     fromUserId,
 *     toUserId,
 *     itemId,
 *     { transaction, transfer_note: '赠送朋友' }
 *   );
 *   await transaction.commit();
 * } catch (error) {
 *   await transaction.rollback();
 * }
 *
 * // 示例3：使用物品
 * const useResult = await InventoryService.useItem(userId, itemId);
 * ```
 *
 * 创建时间：2025年12月09日
 * 使用模型：Claude Sonnet 4.5
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const { UserInventory, TradeRecord, User, Product, ExchangeRecords } = require('../models')
const { Op } = require('sequelize')
const DataSanitizer = require('./DataSanitizer')
const Logger = require('./UnifiedLotteryEngine/utils/Logger')
const { getUserRoles } = require('../middleware/auth')
const AuditLogService = require('./AuditLogService')

const logger = new Logger('InventoryService')

/**
 * 🎯 统一数据输出视图常量（Data Output View Constants）
 *
 * 业务场景（Business Scenario）：
 * - 统一管理库存领域的数据输出字段，避免字段选择分散在各方法
 * - 符合架构规范：与积分领域的 POINTS_ATTRIBUTES 模式保持一致
 * - 根据权限级别（用户/管理员）和业务场景返回不同的数据字段，保护敏感信息
 *
 * 设计原则（Design Principles）：
 * - ownerView：物品所有者视图 - 用户查看自己的库存物品时返回的字段
 * - adminView：管理员视图 - 管理员查看用户库存时返回的字段（包含所有字段）
 * - marketView：市场视图 - 用户浏览交易市场商品时返回的字段
 * - exchangeRecordView：兑换记录视图 - 查询兑换记录时返回的字段
 * - transferRecordView：转让记录视图 - 查询转让历史时返回的字段
 * - productView：商品视图 - 查询可兑换商品列表时返回的字段
 * - statisticsView：统计视图 - 管理员统计查询时返回的字段
 *
 * 使用示例（Usage Example）：
 * ```javascript
 * // 用户查看自己的库存
 * const items = await UserInventory.findAll({
 *   where: { user_id: userId },
 *   attributes: INVENTORY_ATTRIBUTES.ownerView
 * });
 *
 * // 管理员查看用户库存
 * const items = await UserInventory.findAll({
 *   where: { user_id: userId },
 *   attributes: INVENTORY_ATTRIBUTES.adminView
 * });
 *
 * // 查询市场商品
 * const products = await UserInventory.findAll({
 *   where: { market_status: 'on_sale' },
 *   attributes: INVENTORY_ATTRIBUTES.marketView
 * });
 * ```
 */
const INVENTORY_ATTRIBUTES = {
  /**
   * 物品所有者视图（Owner View）
   * 用户查看自己的库存物品时返回的字段
   * 包含物品基本信息、状态、时间等，不包含敏感的来源信息
   */
  ownerView: [
    'inventory_id', // 库存ID（Inventory ID）
    'name', // 物品名称（Item Name）
    'description', // 物品描述（Item Description）
    'icon', // 物品图标（Item Icon）
    'type', // 物品类型：voucher/product/service（Item Type）
    'value', // 物品价值（Item Value）
    'status', // 状态：available/used/expired/transferred（Status）
    'acquired_at', // 获得时间（Acquired At）
    'expires_at', // 过期时间（Expires At）
    'used_at', // 使用时间（Used At）
    'transfer_count', // 转让次数（Transfer Count）
    'last_transfer_at', // 最后转让时间（Last Transfer At）
    'created_at', // 创建时间（Created At）
    'updated_at' // 更新时间（Updated At）
  ],

  /**
   * 管理员视图（Admin View）
   * 管理员查看用户库存时返回的字段
   * 包含所有字段，用于后台管理和数据分析
   */
  adminView: [
    'inventory_id', // 库存ID（Inventory ID）
    'user_id', // 用户ID（User ID）
    'name', // 物品名称（Item Name）
    'description', // 物品描述（Item Description）
    'icon', // 物品图标（Item Icon）
    'type', // 物品类型（Item Type）
    'value', // 物品价值（Item Value）
    'status', // 状态（Status）
    'source_type', // 来源类型：lottery/exchange/system（Source Type）
    'source_id', // 来源ID（Source ID）
    'acquired_at', // 获得时间（Acquired At）
    'expires_at', // 过期时间（Expires At）
    'used_at', // 使用时间（Used At）
    'verification_code', // 核销码（Verification Code）
    'verification_expires_at', // 核销码过期时间（Verification Expires At）
    'transfer_to_user_id', // 转让目标用户ID（Transfer To User ID）
    'transfer_at', // 转让时间（Transfer At）
    'transfer_count', // 转让次数（Transfer Count）
    'last_transfer_at', // 最后转让时间（Last Transfer At）
    'last_transfer_from', // 最后转让来源用户ID（Last Transfer From）
    'operator_id', // 操作员ID（Operator ID）
    'created_at', // 创建时间（Created At）
    'updated_at' // 更新时间（Updated At）
  ],

  /**
   * 市场视图（Market View）
   * 用户浏览交易市场商品时返回的字段
   * 只包含市场展示所需的字段，不暴露用户敏感信息
   */
  marketView: [
    'inventory_id', // 库存ID（Inventory ID）
    'user_id', // 卖家ID（Seller ID）
    'name', // 物品名称（Item Name）
    'description', // 物品描述（Item Description）
    'icon', // 物品图标（Item Icon）
    'type', // 物品类型（Item Type）
    'selling_points', // 售价（积分）（Selling Points）
    'condition', // 成色：new/good/fair（Condition）
    'market_status', // 市场状态：on_sale/sold/withdrawn（Market Status）
    'is_available', // 是否可用（Is Available）
    'listed_at', // 上架时间（Listed At）
    'created_at' // 创建时间（Created At）
  ],

  /**
   * 兑换记录视图（Exchange Record View）
   * 查询兑换记录时返回的字段
   * 包含兑换订单核心信息
   */
  exchangeRecordView: [
    'exchange_id', // 兑换ID（Exchange ID）
    'user_id', // 用户ID（User ID）
    'product_id', // 商品ID（Product ID）
    'quantity', // 数量（Quantity）
    'total_points', // 总积分（Total Points）
    'status', // 状态：pending/distributed/cancelled/expired（Status）
    'exchange_time', // 兑换时间（Exchange Time）
    'is_deleted' // 是否删除（Is Deleted）
  ],

  /**
   * 转让记录视图（Transfer Record View）
   * 查询转让历史时返回的字段
   * 包含转让交易核心信息
   */
  transferRecordView: [
    'trade_id', // 交易ID（Trade ID）
    'trade_code', // 交易编号（Trade Code）
    'item_id', // 物品ID（Item ID）
    'name', // 物品名称（Item Name）
    'from_user_id', // 转让方用户ID（From User ID）
    'to_user_id', // 接收方用户ID（To User ID）
    'transfer_note', // 转让备注（Transfer Note）
    'status', // 状态：completed/cancelled（Status）
    'trade_time', // 交易时间（Trade Time）
    'created_at' // 创建时间（Created At）
  ],

  /**
   * 商品视图（Product View）
   * 查询可兑换商品列表时返回的字段
   * 包含商品基本信息和兑换相关字段
   */
  productView: [
    'product_id', // 商品ID（Product ID）
    'name', // 商品名称（Product Name）
    'description', // 商品描述（Product Description）
    'icon', // 商品图标（Product Icon）
    'category', // 分类（Category）
    'space', // 空间：lucky/premium/both（Space）
    'exchange_points', // 兑换积分（Exchange Points）
    'stock', // 库存（Stock）
    'premium_stock', // 臻选空间独立库存（Premium Stock）
    'status', // 状态：active/inactive（Status）
    'sort_order', // 排序（Sort Order）
    'created_at' // 创建时间（Created At）
  ],

  /**
   * 统计视图（Statistics View）
   * 管理员统计查询时返回的字段
   * 包含统计分析所需的核心字段
   */
  statisticsView: [
    'inventory_id', // 库存ID（Inventory ID）
    'name', // 物品名称（Item Name）
    'type', // 物品类型（Item Type）
    'icon', // 物品图标（Item Icon）
    'status', // 状态（Status）
    'created_at' // 创建时间（Created At）
  ]
}

/**
 * 库存服务类
 * 职责：管理用户库存的增删改查、转让、核销等核心业务逻辑
 * 设计模式：服务层模式 + 事务管理模式（与PointsService保持一致）
 */
class InventoryService {
  /**
   * 获取用户库存列表
   *
   * @param {number} userId - 用户ID
   * @param {Object} filters - 过滤条件
   * @param {string} filters.status - 状态过滤（available/used/expired/transferred）
   * @param {string} filters.type - 类型过滤（voucher/product/service）
   * @param {number} filters.page - 页码（默认1）
   * @param {number} filters.limit - 每页数量（默认20，最大50）
   * @param {Object} options - 选项
   * @param {number} options.viewerId - 查看者ID（用于权限检查）
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} {inventory, pagination}
   */
  static async getUserInventory (userId, filters = {}, options = {}) {
    try {
      const { status, type, page = 1, limit = 20 } = filters
      const { viewerId, transaction = null } = options

      logger.info('开始获取用户库存', {
        user_id: userId,
        viewer_id: viewerId,
        filters
      })

      // 1. 权限检查（普通用户只能查自己，管理员可查所有）
      await this._checkViewPermission(viewerId, userId)

      // 2. 获取权限级别，选择对应的视图常量
      const userRoles = await getUserRoles(viewerId)
      const attributes = userRoles.isAdmin
        ? INVENTORY_ATTRIBUTES.adminView
        : INVENTORY_ATTRIBUTES.ownerView

      // 3. 构建查询条件
      const whereConditions = { user_id: userId }
      if (status) whereConditions.status = status
      if (type) whereConditions.type = type

      // 4. 分页参数验证（确保范围1-50，默认20）
      const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50)
      const offset = (page - 1) * finalLimit

      // 5. 查询数据（✅ 使用统一视图常量）
      const { count, rows: inventory } = await UserInventory.findAndCountAll({
        where: whereConditions,
        attributes, // ✅ 使用统一视图常量（INVENTORY_ATTRIBUTES.ownerView 或 adminView）
        order: [['acquired_at', 'DESC']],
        limit: finalLimit,
        offset,
        transaction
      })

      // 6. 数据处理（添加业务字段）
      const processedInventory = this._processInventoryData(inventory)

      // 7. 数据脱敏（根据权限级别）
      const dataLevel = userRoles.isAdmin ? 'full' : 'public'
      const sanitizedInventory = DataSanitizer.sanitizeInventory(processedInventory, dataLevel)

      logger.info('获取用户库存成功', {
        user_id: userId,
        total: count,
        returned: inventory.length,
        data_level: dataLevel
      })

      return {
        inventory: sanitizedInventory,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: finalLimit,
          total_pages: Math.ceil(count / finalLimit)
        }
      }
    } catch (error) {
      logger.error('获取用户库存失败', {
        error: error.message,
        user_id: userId,
        filters
      })
      throw error
    }
  }

  /**
   * 获取物品详情
   *
   * @param {number} viewerId - 查看者ID
   * @param {number} itemId - 物品ID
   * @returns {Promise<Object>} 物品详情
   */
  static async getItemDetail (viewerId, itemId) {
    try {
      logger.info('开始获取物品详情', {
        viewer_id: viewerId,
        item_id: itemId
      })

      /*
       * 1. 查询物品（包含用户关联）- ✅ 使用统一视图常量
       * 先判断权限级别，选择对应视图（需要提前获取权限，避免两次查询）
       */
      const userRoles = await getUserRoles(viewerId)
      const attributes = userRoles.isAdmin
        ? INVENTORY_ATTRIBUTES.adminView
        : INVENTORY_ATTRIBUTES.ownerView

      const item = await UserInventory.findOne({
        where: { inventory_id: itemId },
        attributes, // ✅ 使用统一视图常量
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname']
          }
        ]
      })

      if (!item) {
        throw new Error('物品不存在')
      }

      // 2. 权限检查（管理员可查所有，普通用户只能查自己的）
      if (!userRoles.isAdmin && item.user_id !== viewerId) {
        throw new Error('无权限查看该物品')
      }

      // 3. 审计日志（管理员查看他人物品时记录）
      if (userRoles.isAdmin && item.user_id !== viewerId) {
        logger.info('管理员查询用户物品详情', {
          admin_id: viewerId,
          target_user_id: item.user_id,
          item_id: itemId,
          query_time: BeijingTimeHelper.formatForAPI(new Date())
        })
      }

      // 4. 数据处理
      const itemData = item.toJSON()
      itemData.status_description = this._getStatusDescription(itemData.status)
      if (itemData.expires_at) {
        itemData.is_expired = BeijingTimeHelper.createBeijingTime() > new Date(itemData.expires_at)
      }

      // 处理icon字段默认值
      if (!itemData.icon) {
        itemData.icon = this._getDefaultIcon(itemData.type)
      }

      // 5. 数据脱敏
      const dataLevel = userRoles.isAdmin ? 'full' : 'public'
      const sanitizedItem = DataSanitizer.sanitizeInventory([itemData], dataLevel)[0]

      logger.info('获取物品详情成功', {
        viewer_id: viewerId,
        item_id: itemId,
        owner_id: item.user_id
      })

      return sanitizedItem
    } catch (error) {
      logger.error('获取物品详情失败', {
        error: error.message,
        viewer_id: viewerId,
        item_id: itemId
      })
      throw error
    }
  }

  /**
   * 使用物品（核销）
   *
   * @param {number} actorId - 操作者ID
   * @param {number} itemId - 物品ID
   * @param {Object} context - 上下文信息
   * @param {Object} context.transaction - 事务对象（可选）
   * @param {string} context.business_id - 业务唯一ID（可选，用于幂等性）
   * @returns {Promise<Object>} 使用结果
   */
  static async useItem (actorId, itemId, context = {}) {
    const { transaction: externalTransaction, business_id } = context

    // 支持外部事务传入
    const transaction = externalTransaction || (await UserInventory.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      logger.info('开始使用物品', {
        actor_id: actorId,
        item_id: itemId,
        business_id
      })

      // 1. 查询物品（加行级锁）
      const item = await UserInventory.findOne({
        where: { inventory_id: itemId },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item) {
        throw new Error('物品不存在')
      }

      /*
       * ✅ 幂等性检查（解决任务4.1：为高风险操作添加强制幂等检查）
       * 如果物品已经被使用，返回原结果（防止重复核销）
       */
      if (item.status === 'used') {
        logger.info('⚠️ 幂等性检查：物品已被使用，返回原结果', {
          business_id,
          item_id: itemId,
          actor_id: actorId,
          used_at: item.used_at,
          operator_id: item.operator_id
        })

        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          item_id: itemId,
          status: 'used',
          used_at: item.used_at,
          item_name: item.name,
          is_duplicate: true // ✅ 标记为重复请求
        }
      }

      // 2. 权限检查（物品所有者或管理员）
      const userRoles = await getUserRoles(actorId)
      if (item.user_id !== actorId && !userRoles.isAdmin) {
        throw new Error('无权限操作此物品')
      }

      // 3. 状态检查（只有available状态可使用）
      if (item.status !== 'available') {
        throw new Error(`物品状态为${item.status}，无法使用`)
      }

      // 4. 更新状态
      await item.update(
        {
          status: 'used',
          used_at: BeijingTimeHelper.createBeijingTime(),
          operator_id: actorId
        },
        { transaction }
      )

      // 5. 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      // 📝 记录审计日志（异步，失败不影响业务）
      try {
        await AuditLogService.logInventoryUse({
          operator_id: actorId,
          item_id: itemId,
          item_name: item.name,
          reason: `使用物品：${item.name}`,
          business_id,
          transaction: shouldCommit ? null : transaction // 已提交则不传事务
        })
      } catch (auditError) {
        logger.error('审计日志记录失败', { error: auditError.message })
      }

      logger.info('使用物品成功', {
        actor_id: actorId,
        item_id: itemId,
        item_name: item.name
      })

      return {
        item_id: itemId,
        status: 'used',
        used_at: item.used_at,
        item_name: item.name
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('使用物品失败', {
        error: error.message,
        actor_id: actorId,
        item_id: itemId
      })
      throw error
    }
  }

  /**
   * 转让物品
   *
   * @param {number} fromUserId - 转让方ID
   * @param {number} toUserId - 接收方ID
   * @param {number} itemId - 物品ID
   * @param {Object} context - 上下文信息
   * @param {Object} context.transaction - 事务对象（可选）
   * @param {string} context.transfer_note - 转让备注（可选）
   * @param {string} context.business_id - 业务唯一ID（可选，用于幂等性）
   * @returns {Promise<Object>} 转让结果
   */
  static async transferItem (fromUserId, toUserId, itemId, context = {}) {
    const { transaction: externalTransaction, transfer_note, business_id } = context

    // 参数验证
    if (fromUserId === toUserId) {
      throw new Error('不能转让给自己')
    }

    // ✅ 幂等性检查（解决任务4.1：为高风险操作添加强制幂等检查）
    if (business_id) {
      const existingTransfer = await TradeRecord.findOne({
        where: {
          trade_type: 'inventory_transfer',
          item_id: itemId,
          from_user_id: fromUserId,
          to_user_id: toUserId,
          status: 'completed'
        }
      })

      if (existingTransfer) {
        logger.info('⚠️ 幂等性检查：转让操作已存在，返回原结果', {
          business_id,
          transfer_id: existingTransfer.trade_code,
          from_user_id: fromUserId,
          to_user_id: toUserId,
          item_id: itemId
        })

        return {
          transfer_id: existingTransfer.trade_code,
          item_id: itemId,
          name: existingTransfer.name,
          from_user_id: fromUserId,
          to_user_id: toUserId,
          transfer_note: existingTransfer.transfer_note || '库存物品转让',
          transfer_count: existingTransfer.transfer_count || 0,
          transferred_at: existingTransfer.trade_time,
          is_duplicate: true // ✅ 标记为重复请求
        }
      }
    }

    // 支持外部事务传入
    const transaction = externalTransaction || (await UserInventory.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      logger.info('开始转让物品', {
        from_user_id: fromUserId,
        to_user_id: toUserId,
        item_id: itemId,
        business_id
      })

      // 1. 查询物品（加行级锁）
      const item = await UserInventory.findOne({
        where: {
          inventory_id: itemId,
          user_id: fromUserId,
          status: 'available'
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item) {
        throw new Error('物品不存在或不属于您')
      }

      // 2. 检查物品是否可以转让
      if (item.can_transfer === false) {
        throw new Error('该物品不支持转让')
      }

      // 3. 检查物品是否已过期
      if (item.expires_at && BeijingTimeHelper.createDatabaseTime() > new Date(item.expires_at)) {
        await item.update({ status: 'expired' }, { transaction })
        throw new Error('物品已过期，无法转让')
      }

      // 4. 检查接收方是否存在
      const toUser = await User.findByPk(toUserId, { transaction })
      if (!toUser) {
        throw new Error('目标用户不存在')
      }

      // 5. 检查转让次数限制
      const maxTransferCount = 3
      if (item.transfer_count >= maxTransferCount) {
        throw new Error(`该物品已达到最大转让次数(${maxTransferCount}次)`)
      }

      // 6. 创建交易记录
      const tradeCode = `tf_${BeijingTimeHelper.generateIdTimestamp()}_${Math.random()
        .toString(36)
        .substr(2, 8)}`

      await TradeRecord.create(
        {
          trade_code: tradeCode,
          trade_type: 'inventory_transfer',
          from_user_id: fromUserId,
          to_user_id: toUserId,
          points_amount: 0,
          fee_points_amount: 0,
          net_points_amount: 0,
          status: 'completed',
          item_id: itemId,
          name: item.name,
          transfer_note: transfer_note || '库存物品转让',
          trade_reason: transfer_note || '用户主动转让物品',
          trade_time: BeijingTimeHelper.createBeijingTime(),
          processed_time: BeijingTimeHelper.createBeijingTime(),
          created_at: BeijingTimeHelper.createBeijingTime(),
          updated_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      // 7. 更新物品所有者
      await item.update(
        {
          user_id: toUserId,
          transfer_count: (item.transfer_count || 0) + 1,
          last_transfer_at: BeijingTimeHelper.createBeijingTime(),
          last_transfer_from: fromUserId,
          updated_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      // 8. 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      // 📝 记录审计日志（异步，失败不影响业务）
      try {
        await AuditLogService.logOperation({
          operator_id: fromUserId,
          operation_type: 'inventory_transfer', // ✅ 使用独立的物品转让审计类型
          target_type: 'UserInventory',
          target_id: itemId,
          action: 'transfer',
          before_data: {
            user_id: fromUserId,
            transfer_count: (item.transfer_count || 0)
          },
          after_data: {
            user_id: toUserId,
            transfer_count: (item.transfer_count || 0) + 1
          },
          reason: `物品转让：${item.name}（${fromUserId} → ${toUserId}）${transfer_note ? `，备注：${transfer_note}` : ''}`,
          business_id: tradeCode,
          transaction: shouldCommit ? null : transaction // 已提交则不传事务
        })
      } catch (auditError) {
        logger.error('审计日志记录失败', { error: auditError.message })
      }

      logger.info('转让物品成功', {
        from_user_id: fromUserId,
        to_user_id: toUserId,
        item_id: itemId,
        item_name: item.name,
        transfer_count: item.transfer_count + 1
      })

      return {
        transfer_id: tradeCode,
        item_id: itemId,
        name: item.name,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        transfer_note: transfer_note || '库存物品转让',
        transfer_count: item.transfer_count + 1,
        transferred_at: BeijingTimeHelper.createBeijingTime()
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('转让物品失败', {
        error: error.message,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        item_id: itemId
      })
      throw error
    }
  }

  /**
   * 生成核销码
   *
   * @param {number} userId - 用户ID
   * @param {number} itemId - 物品ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} {verification_code, expires_at}
   */
  static async generateVerificationCode (userId, itemId, options = {}) {
    const { transaction = null } = options

    try {
      logger.info('开始生成核销码', {
        user_id: userId,
        item_id: itemId
      })

      // 1. 查询物品（验证所有权）
      const item = await UserInventory.findOne({
        where: {
          inventory_id: itemId,
          user_id: userId,
          status: 'available'
        },
        transaction
      })

      if (!item) {
        throw new Error('物品不存在或不可用')
      }

      // 2. 生成6位数字码
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()

      // 3. 设置过期时间（5分钟）
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

      // 4. 更新物品记录
      await item.update(
        {
          verification_code: verificationCode,
          verification_expires_at: expiresAt
        },
        { transaction }
      )

      logger.info('生成核销码成功', {
        user_id: userId,
        item_id: itemId,
        verification_code: verificationCode
      })

      return {
        verification_code: verificationCode,
        expires_at: expiresAt
      }
    } catch (error) {
      logger.error('生成核销码失败', {
        error: error.message,
        user_id: userId,
        item_id: itemId
      })
      throw error
    }
  }

  /**
   * 核销验证
   *
   * @param {number} merchantId - 商家ID
   * @param {string} verificationCode - 核销码
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 核销结果
   */
  static async verifyCode (merchantId, verificationCode, options = {}) {
    const { transaction: externalTransaction } = options

    // 支持外部事务传入
    const transaction = externalTransaction || (await UserInventory.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      logger.info('开始核销验证', {
        merchant_id: merchantId,
        verification_code: verificationCode
      })

      // 1. 根据核销码查询物品（加行级锁，不限制状态）
      const item = await UserInventory.findOne({
        where: {
          verification_code: verificationCode
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item) {
        throw new Error('核销码无效')
      }

      /*
       * ✅ 幂等性检查（解决任务4.1：为高风险操作添加强制幂等检查）
       * 如果物品已经被核销，返回原结果（防止重复核销）
       */
      if (item.status === 'used') {
        logger.info('⚠️ 幂等性检查：物品已被核销，返回原结果', {
          verification_code: verificationCode,
          item_id: item.inventory_id,
          merchant_id: merchantId,
          used_at: item.used_at,
          operator_id: item.operator_id
        })

        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          item_id: item.inventory_id,
          item_name: item.name,
          user_id: item.user_id,
          status: 'used',
          used_at: item.used_at,
          is_duplicate: true // ✅ 标记为重复请求
        }
      }

      // 2. 状态检查（只有available状态可核销）
      if (item.status !== 'available') {
        throw new Error(`物品状态为${item.status}，无法核销`)
      }

      // 3. 验证码有效性检查（未过期）
      if (item.verification_expires_at && new Date() > new Date(item.verification_expires_at)) {
        throw new Error('核销码已过期')
      }

      // 4. 更新物品状态
      await item.update(
        {
          status: 'used',
          used_at: BeijingTimeHelper.createBeijingTime(),
          operator_id: merchantId
        },
        { transaction }
      )

      // 5. 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      // 📝 记录审计日志（异步，失败不影响业务）
      try {
        await AuditLogService.logInventoryVerify({
          operator_id: merchantId,
          item_id: item.inventory_id,
          user_id: item.user_id,
          item_name: item.name,
          verification_code: verificationCode,
          reason: '核销物品',
          business_id: `verify_${item.inventory_id}_${Date.now()}`,
          transaction: shouldCommit ? null : transaction // 已提交则不传事务
        })
      } catch (auditError) {
        logger.error('审计日志记录失败', { error: auditError.message })
      }

      logger.info('核销验证成功', {
        merchant_id: merchantId,
        item_id: item.inventory_id,
        user_id: item.user_id
      })

      return {
        item_id: item.inventory_id,
        item_name: item.name,
        user_id: item.user_id,
        status: 'used',
        used_at: item.used_at
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('核销验证失败', {
        error: error.message,
        merchant_id: merchantId,
        verification_code: verificationCode
      })
      throw error
    }
  }

  /**
   * 获取管理员统计数据
   *
   * 业务场景：
   * - 管理员查看系统库存运营数据
   * - 支持运营决策和数据分析
   *
   * 统计维度：
   * - 基础统计：总数、可用、已使用、已过期、已转让、待处理
   * - 使用率指标：主动使用率、消耗率、有效使用率、转让率
   * - 类型分布：按类型和图标分组统计
   * - 最近动态：最近获得的10个物品
   *
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 统计数据
   */
  static async getAdminStatistics (options = {}) {
    const { transaction = null } = options

    try {
      logger.info('开始获取管理员统计数据')

      // 并行查询所有统计数据
      const [
        totalItems,
        availableItems,
        usedItems,
        expiredItems,
        transferredItems,
        pendingItems,
        typeStats,
        recentItems
      ] = await Promise.all([
        // 查询1：统计库存物品总数
        UserInventory.count({ transaction }),

        // 查询2：统计可用物品数量
        UserInventory.count({ where: { status: 'available' }, transaction }),

        // 查询3：统计已使用物品数量
        UserInventory.count({ where: { status: 'used' }, transaction }),

        // 查询4：统计已过期物品数量
        UserInventory.count({ where: { status: 'expired' }, transaction }),

        // 查询5：统计已转让物品数量
        UserInventory.count({ where: { status: 'transferred' }, transaction }),

        // 查询6：统计待处理物品数量
        UserInventory.count({ where: { status: 'pending' }, transaction }),

        // 查询7：按类型分组统计
        UserInventory.findAll({
          attributes: ['type', 'icon', [UserInventory.sequelize.fn('COUNT', '*'), 'count']],
          group: ['type', 'icon'],
          transaction
        }),

        // 查询8：查询最近获得的10个物品（✅ 使用统一视图常量）
        UserInventory.findAll({
          attributes: INVENTORY_ATTRIBUTES.statisticsView, // ✅ 使用统一视图常量
          order: [['created_at', 'DESC']],
          limit: 10,
          transaction
        })
      ])

      // 计算多维度使用率指标
      const activeUsageRate = totalItems > 0 ? ((usedItems / totalItems) * 100).toFixed(2) : 0
      const consumptionRate =
        totalItems > 0 ? (((usedItems + expiredItems) / totalItems) * 100).toFixed(2) : 0
      const effectiveUsageRate =
        usedItems + availableItems > 0
          ? ((usedItems / (usedItems + availableItems)) * 100).toFixed(2)
          : 0
      const transferRate = totalItems > 0 ? ((transferredItems / totalItems) * 100).toFixed(2) : 0

      // 组装统计数据
      const statistics = {
        // 基础统计数据
        total_items: totalItems || 0,
        available_items: availableItems || 0,
        used_items: usedItems || 0,
        expired_items: expiredItems || 0,
        transferred_items: transferredItems || 0,
        pending_items: pendingItems || 0,

        // 多维度使用率指标
        active_usage_rate: activeUsageRate,
        consumption_rate: consumptionRate,
        effective_usage_rate: effectiveUsageRate,
        transfer_rate: transferRate,

        // 类型分布数据
        type_distribution: Array.isArray(typeStats)
          ? typeStats.map(stat => ({
            type: stat.type || 'unknown',
            icon: stat.icon || this._getDefaultIcon(stat.type || 'voucher'),
            count: parseInt(stat.dataValues?.count || 0)
          }))
          : [],

        // 最近物品动态
        recent_items: Array.isArray(recentItems)
          ? recentItems.map(item => ({
            ...item.toJSON(),
            icon: item.icon || this._getDefaultIcon(item.type || 'voucher')
          }))
          : []
      }

      logger.info('获取管理员统计数据成功', {
        total_items: totalItems,
        available_items: availableItems
      })

      return statistics
    } catch (error) {
      logger.error('获取管理员统计数据失败', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取转让历史记录
   *
   * 业务场景：
   * - 用户查看自己的转让历史（发出和接收）
   * - 管理员查看所有用户的转让历史
   * - 管理员查看指定物品的完整转让链条
   *
   * @param {number} userId - 用户ID
   * @param {Object} filters - 过滤条件
   * @param {string} filters.direction - 方向过滤（sent/received/all）
   * @param {number} filters.item_id - 物品ID（管理员查看完整转让链条）
   * @param {number} filters.page - 页码（默认1）
   * @param {number} filters.limit - 每页数量（默认20，最大50）
   * @param {Object} options - 选项
   * @param {number} options.viewerId - 查看者ID（用于权限检查）
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} {records, pagination, filter}
   */
  static async getTransferHistory (userId, filters = {}, options = {}) {
    try {
      const { direction = 'all', item_id, page = 1, limit = 20 } = filters
      const { viewerId, transaction = null } = options

      logger.info('开始获取转让历史', {
        user_id: userId,
        viewer_id: viewerId,
        direction,
        item_id
      })

      // 权限检查
      const userRoles = await getUserRoles(viewerId)
      const isAdmin = userRoles.isAdmin
      const isSelfQuery = viewerId === userId

      // 构建查询条件
      const whereConditions = {}

      // 只查询转让类型的交易记录
      whereConditions.trade_type = 'inventory_transfer'

      // 权限控制逻辑
      if (!isAdmin) {
        // 普通用户只能查看与自己直接相关的转让记录
        if (!isSelfQuery) {
          throw new Error('无权限查看其他用户的转让历史')
        }

        // 普通用户不能通过 item_id 查看完整转让链条
        if (item_id) {
          throw new Error('无权限查看物品完整转让链条，仅管理员可查看')
        }

        // 根据方向过滤
        if (direction === 'sent') {
          whereConditions.from_user_id = userId
        } else if (direction === 'received') {
          whereConditions.to_user_id = userId
        } else {
          // direction === 'all' - 查询发出和接收的所有记录
          whereConditions[Op.or] = [{ from_user_id: userId }, { to_user_id: userId }]
        }
      } else {
        // 管理员权限
        if (item_id) {
          // 管理员通过 item_id 查看完整转让链条
          whereConditions.item_id = item_id
          logger.info('管理员查看物品完整转让链条', {
            admin_id: viewerId,
            item_id,
            role_level: userRoles.role_level
          })
        } else if (!isSelfQuery) {
          // 管理员查看指定用户的转让历史
          if (direction === 'sent') {
            whereConditions.from_user_id = userId
          } else if (direction === 'received') {
            whereConditions.to_user_id = userId
          } else {
            // direction === 'all'
            whereConditions[Op.or] = [{ from_user_id: userId }, { to_user_id: userId }]
          }
        } else {
          // 管理员查看自己的转让历史
          if (direction === 'sent') {
            whereConditions.from_user_id = userId
          } else if (direction === 'received') {
            whereConditions.to_user_id = userId
          } else {
            whereConditions[Op.or] = [{ from_user_id: userId }, { to_user_id: userId }]
          }
        }
      }

      // 分页参数
      const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50)
      const offset = (page - 1) * finalLimit

      // 查询数据（✅ 使用统一视图常量）
      const { count, rows: records } = await TradeRecord.findAndCountAll({
        where: whereConditions,
        attributes: INVENTORY_ATTRIBUTES.transferRecordView, // ✅ 使用统一视图常量
        include: [
          {
            model: User,
            as: 'fromUser',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'toUser',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: finalLimit,
        offset,
        transaction
      })

      // 数据处理：格式化转让历史数据
      const processedRecords = records.map(record => {
        const baseData = {
          transfer_id: record.trade_id,
          item_id: record.item_id,
          name: record.name,
          from_user_id: record.from_user_id,
          from_user_name: record.fromUser?.nickname || '未知用户',
          to_user_id: record.to_user_id,
          to_user_name: record.toUser?.nickname || '未知用户',
          transfer_note: record.transfer_note,
          status: record.status,
          created_at: record.created_at
        }

        // 仅普通用户或管理员查看自己的历史时需要 direction 标识
        if (!isAdmin || (isSelfQuery && !item_id)) {
          baseData.direction = record.from_user_id === userId ? 'sent' : 'received'
        }

        return baseData
      })

      logger.info('获取转让历史成功', {
        user_id: userId,
        total: count,
        returned: records.length,
        is_admin: isAdmin,
        query_item_id: item_id || null
      })

      return {
        records: processedRecords,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: finalLimit,
          total_pages: Math.ceil(count / finalLimit),
          has_next: count > parseInt(page) * finalLimit
        },
        filter: {
          direction,
          item_id: item_id || null,
          view_mode: isAdmin && item_id ? 'complete_chain' : 'direct_only'
        }
      }
    } catch (error) {
      logger.error('获取转让历史失败', {
        error: error.message,
        user_id: userId,
        filters
      })
      throw error
    }
  }

  /**
   * 获取商品列表
   *
   * 业务场景：
   * - 用户浏览可兑换的商品列表
   * - 支持按空间、分类过滤
   * - 支持分页查询
   *
   * @param {Object} filters - 过滤条件
   * @param {string} filters.space - 空间过滤（lucky/premium/both/all）
   * @param {string} filters.category - 分类过滤（可选）
   * @param {number} filters.page - 页码（默认1）
   * @param {number} filters.limit - 每页数量（默认20，最大50）
   * @param {Object} options - 选项
   * @param {number} options.viewerId - 查看者ID（用于数据脱敏）
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} {products, pagination}
   */
  static async getProducts (filters = {}, options = {}) {
    try {
      const { space = 'lucky', category, page = 1, limit = 20 } = filters
      const { viewerId, transaction = null } = options

      logger.info('开始获取商品列表', {
        space,
        category,
        page,
        limit,
        viewer_id: viewerId
      })

      // 空间参数验证
      const validSpaces = ['lucky', 'premium', 'both', 'all']
      if (!validSpaces.includes(space)) {
        throw new Error(`无效的space参数：${space}。允许的值：${validSpaces.join(', ')}`)
      }

      // 分页参数验证
      const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50)
      const finalPage = Math.max(parseInt(page) || 1, 1)
      const offset = (finalPage - 1) * finalLimit

      // 构建查询条件
      const whereClause = {
        status: 'active'
      }

      // 空间过滤
      if (space !== 'all') {
        whereClause.space = [space, 'both']
      }

      // 分类过滤
      if (category && category !== 'all') {
        whereClause.category = category
      }

      // 查询商品（✅ 使用统一视图常量）
      const { count, rows: products } = await Product.findAndCountAll({
        where: whereClause,
        attributes: INVENTORY_ATTRIBUTES.productView, // ✅ 使用统一视图常量
        order: [
          ['sort_order', 'ASC'],
          ['created_at', 'DESC']
        ],
        limit: finalLimit,
        offset,
        transaction
      })

      // 转换为空间特定信息
      const spaceProducts = products
        .map(p => {
          if (typeof p.getSpaceInfo === 'function') {
            const spaceInfo = p.getSpaceInfo(space)
            if (spaceInfo) {
              return spaceInfo
            }
          }
          return p.toJSON()
        })
        .filter(Boolean)

      // 数据脱敏
      const userRoles = viewerId ? await getUserRoles(viewerId) : { isAdmin: false }
      const dataLevel = userRoles.isAdmin ? 'full' : 'public'
      const sanitizedProducts = DataSanitizer.sanitizeExchangeProducts(spaceProducts, dataLevel)

      logger.info('获取商品列表成功', {
        space,
        total: count,
        returned: sanitizedProducts.length
      })

      return {
        products: sanitizedProducts,
        pagination: {
          total: count,
          page: finalPage,
          limit: finalLimit,
          total_pages: Math.ceil(count / finalLimit)
        }
      }
    } catch (error) {
      logger.error('获取商品列表失败', {
        error: error.message,
        filters
      })
      throw error
    }
  }

  /**
   * 取消兑换记录
   *
   * 业务场景：
   * - 用户取消未分配的兑换订单
   * - 退还已扣除的积分
   *
   * @param {number} userId - 用户ID
   * @param {number} exchangeId - 兑换记录ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 取消结果
   */
  static async cancelExchange (userId, exchangeId, options = {}) {
    const { transaction: externalTransaction } = options

    // 支持外部事务传入
    const transaction = externalTransaction || (await ExchangeRecords.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      logger.info('开始取消兑换记录', {
        user_id: userId,
        exchange_id: exchangeId
      })

      // 查询兑换记录（加行级锁）
      const exchangeRecord = await ExchangeRecords.findByPk(exchangeId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!exchangeRecord) {
        throw new Error('兑换记录不存在')
      }

      // 权限检查
      if (exchangeRecord.user_id !== userId) {
        throw new Error('无权限操作此兑换记录')
      }

      /*
       * ✅ 幂等性检查（解决任务4.1：为高风险操作添加强制幂等检查）
       * 如果订单已经取消，返回原结果（防止重复取消和重复退款）
       */
      if (exchangeRecord.status === 'cancelled') {
        logger.info('⚠️ 幂等性检查：兑换订单已取消，返回原结果', {
          exchange_id: exchangeId,
          user_id: userId,
          status: exchangeRecord.status,
          audit_status: exchangeRecord.audit_status,
          audited_at: exchangeRecord.audited_at
        })

        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          exchange_id: exchangeId,
          status: 'cancelled',
          audit_status: exchangeRecord.audit_status,
          audited_at: exchangeRecord.audited_at,
          total_points: exchangeRecord.total_points,
          is_duplicate: true // ✅ 标记为重复请求
        }
      }

      // 调用模型的取消方法（包含业务逻辑）
      const result = await exchangeRecord.cancel({ transaction })

      // 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      logger.info('取消兑换记录成功', {
        user_id: userId,
        exchange_id: exchangeId
      })

      return result
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('取消兑换记录失败', {
        error: error.message,
        user_id: userId,
        exchange_id: exchangeId
      })
      throw error
    }
  }

  /**
   * 软删除兑换记录
   *
   * 业务场景：
   * - 用户删除已完成或已取消的兑换记录
   * - 软删除，数据仍保留可恢复
   *
   * @param {number} userId - 用户ID
   * @param {number} exchangeId - 兑换记录ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 删除结果
   */
  static async deleteExchange (userId, exchangeId, options = {}) {
    const { transaction = null } = options

    try {
      logger.info('开始软删除兑换记录', {
        user_id: userId,
        exchange_id: exchangeId
      })

      // 查询兑换记录
      const record = await ExchangeRecords.findOne({
        where: {
          exchange_id: exchangeId,
          user_id: userId
        },
        transaction
      })

      if (!record) {
        throw new Error('兑换记录不存在')
      }

      // 状态检查
      if (!['distributed', 'cancelled', 'expired'].includes(record.status)) {
        throw new Error('只能删除已完成、已取消或已过期的兑换记录')
      }

      // 执行软删除
      await record.destroy({ transaction })

      logger.info('软删除兑换记录成功', {
        user_id: userId,
        exchange_id: exchangeId
      })

      return {
        exchange_id: exchangeId,
        deleted_at: new Date()
      }
    } catch (error) {
      logger.error('软删除兑换记录失败', {
        error: error.message,
        user_id: userId,
        exchange_id: exchangeId
      })
      throw error
    }
  }

  /**
   * 恢复已删除的兑换记录
   *
   * 业务场景：
   * - 用户恢复误删的兑换记录
   *
   * @param {number} userId - 用户ID
   * @param {number} exchangeId - 兑换记录ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 恢复结果
   */
  static async restoreExchange (userId, exchangeId, options = {}) {
    const { transaction = null } = options

    try {
      logger.info('开始恢复兑换记录', {
        user_id: userId,
        exchange_id: exchangeId
      })

      // 查询已删除的记录
      const record = await ExchangeRecords.scope('includeDeleted').findOne({
        where: {
          exchange_id: exchangeId,
          user_id: userId
        },
        transaction
      })

      if (!record) {
        throw new Error('兑换记录不存在')
      }

      if (!record.deleted_at) {
        throw new Error('该记录未被删除')
      }

      // 恢复记录
      await record.restore({ transaction })

      logger.info('恢复兑换记录成功', {
        user_id: userId,
        exchange_id: exchangeId
      })

      return {
        exchange_id: exchangeId,
        restored_at: new Date()
      }
    } catch (error) {
      logger.error('恢复兑换记录失败', {
        error: error.message,
        user_id: userId,
        exchange_id: exchangeId
      })
      throw error
    }
  }

  /**
   * 获取市场商品列表
   *
   * 业务场景：
   * - 用户浏览交易市场中的在售商品
   * - 支持按分类过滤和排序
   *
   * @param {Object} filters - 过滤条件
   * @param {string} filters.category - 分类过滤（可选）
   * @param {string} filters.sort - 排序方式（newest/price_low/price_high）
   * @param {number} filters.page - 页码（默认1）
   * @param {number} filters.limit - 每页数量（默认20，最大50）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} {products, pagination}
   */
  static async getMarketProducts (filters = {}, options = {}) {
    try {
      const { category, sort = 'newest', page = 1, limit = 20 } = filters
      const { transaction = null } = options

      logger.info('开始获取市场商品列表', {
        category,
        sort,
        page,
        limit
      })

      // 分类参数验证
      if (category && category !== 'all') {
        const validCategories = ['voucher', 'product', 'service']
        if (!validCategories.includes(category)) {
          throw new Error(
            `无效的category参数：${category}。允许的值：${validCategories.join(', ')}, all`
          )
        }
      }

      // 排序参数验证
      const validSortOptions = ['newest', 'price_low', 'price_high']
      if (!validSortOptions.includes(sort)) {
        throw new Error(`无效的sort参数：${sort}。允许的值：${validSortOptions.join(', ')}`)
      }

      // 分页参数验证
      const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50)
      const finalPage = Math.max(parseInt(page) || 1, 1)
      const offset = (finalPage - 1) * finalLimit

      // 构建查询条件
      const whereClause = {
        market_status: 'on_sale',
        is_available: true
      }

      if (category && category !== 'all') {
        whereClause.type = category
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

      // 查询市场商品（✅ 使用统一视图常量）
      const { count, rows: marketProducts } = await UserInventory.findAndCountAll({
        where: whereClause,
        attributes: INVENTORY_ATTRIBUTES.marketView, // ✅ 使用统一视图常量
        order,
        limit: finalLimit,
        offset,
        transaction
      })

      // 格式化商品数据
      const formattedProducts = marketProducts.map(item => ({
        id: item.inventory_id,
        seller_id: item.user_id,
        name: item.name,
        description: item.description || '暂无描述',
        selling_points: item.selling_points || 0,
        condition: item.condition || 'good',
        category: item.type,
        is_available: item.is_available,
        created_at: item.created_at
      }))

      logger.info('获取市场商品列表成功', {
        total: count,
        returned: formattedProducts.length
      })

      return {
        products: formattedProducts,
        pagination: {
          total: count,
          page: finalPage,
          limit: finalLimit,
          total_pages: Math.ceil(count / finalLimit)
        }
      }
    } catch (error) {
      logger.error('获取市场商品列表失败', {
        error: error.message,
        filters
      })
      throw error
    }
  }

  /**
   * 获取市场商品详情
   *
   * 业务场景：
   * - 用户查看市场商品的详细信息
   *
   * @param {number} productId - 商品ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 商品详情
   */
  static async getMarketProductDetail (productId, options = {}) {
    const { transaction = null } = options

    try {
      logger.info('开始获取市场商品详情', {
        product_id: productId
      })

      const marketProduct = await UserInventory.findOne({
        where: {
          inventory_id: productId,
          market_status: 'on_sale',
          is_available: true
        },
        attributes: INVENTORY_ATTRIBUTES.marketView, // ✅ 使用统一视图常量
        transaction
      })

      if (!marketProduct) {
        throw new Error('市场商品不存在或已下架')
      }

      const productDetail = {
        id: marketProduct.inventory_id,
        seller_id: marketProduct.user_id,
        name: marketProduct.name,
        description: marketProduct.description || '暂无描述',
        selling_points: marketProduct.selling_points || 0,
        condition: marketProduct.condition || 'good',
        category: marketProduct.type,
        is_available: marketProduct.is_available,
        created_at: marketProduct.created_at,
        expires_at: marketProduct.expires_at
      }

      logger.info('获取市场商品详情成功', {
        product_id: productId
      })

      return productDetail
    } catch (error) {
      logger.error('获取市场商品详情失败', {
        error: error.message,
        product_id: productId
      })
      throw error
    }
  }

  /**
   * 上架商品到市场
   *
   * 业务场景：
   * - 用户将库存物品上架到交易市场
   *
   * @param {number} userId - 用户ID
   * @param {number} itemId - 物品ID
   * @param {Object} marketInfo - 市场信息
   * @param {number} marketInfo.selling_points - 售价（积分）
   * @param {string} marketInfo.condition - 成色（new/good/fair）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 上架结果
   */
  static async listProductToMarket (userId, itemId, marketInfo, options = {}) {
    const { transaction: externalTransaction } = options

    // 支持外部事务传入
    const transaction = externalTransaction || (await UserInventory.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      logger.info('开始上架商品到市场', {
        user_id: userId,
        item_id: itemId,
        selling_points: marketInfo.selling_points
      })

      // 查询物品（加行级锁）
      const inventory = await UserInventory.findOne({
        where: {
          inventory_id: itemId,
          user_id: userId,
          status: 'available'
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!inventory) {
        throw new Error('物品不存在或不可上架')
      }

      // 检查是否已上架
      if (inventory.market_status === 'on_sale') {
        throw new Error('该物品已在市场上架')
      }

      // 参数验证
      const sellingPoints = parseInt(marketInfo.selling_points)
      if (isNaN(sellingPoints) || sellingPoints <= 0) {
        throw new Error('售价必须大于0')
      }

      const validConditions = ['new', 'good', 'fair']
      const condition = marketInfo.condition || 'good'
      if (!validConditions.includes(condition)) {
        throw new Error(`无效的成色参数：${condition}`)
      }

      // 更新物品状态为上架
      await inventory.update(
        {
          market_status: 'on_sale',
          selling_points: sellingPoints,
          condition,
          is_available: true,
          listed_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      // 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      logger.info('上架商品到市场成功', {
        user_id: userId,
        item_id: itemId,
        selling_points: sellingPoints
      })

      return {
        item_id: itemId,
        market_status: 'on_sale',
        selling_points: sellingPoints,
        condition,
        listed_at: inventory.listed_at
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('上架商品到市场失败', {
        error: error.message,
        user_id: userId,
        item_id: itemId
      })
      throw error
    }
  }

  /**
   * 购买市场商品
   *
   * 业务场景：
   * - 用户使用积分购买市场上的商品
   * - 涉及积分扣除、物品归属变更
   *
   * @param {number} buyerId - 购买者ID
   * @param {number} productId - 商品ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @param {string} options.business_id - 业务唯一ID（可选，用于幂等性）
   * @returns {Promise<Object>} 购买结果
   */
  static async purchaseMarketProduct (buyerId, productId, options = {}) {
    const { transaction: externalTransaction, business_id } = options

    // ✅ 幂等性检查（解决任务4.1：为高风险操作添加强制幂等检查）
    if (business_id) {
      const existingTrade = await TradeRecord.findOne({
        where: {
          trade_type: 'market_purchase',
          item_id: productId,
          to_user_id: buyerId,
          status: 'completed'
        }
      })

      if (existingTrade) {
        logger.info('⚠️ 幂等性检查：市场购买操作已存在，返回原结果', {
          business_id,
          trade_code: existingTrade.trade_code,
          buyer_id: buyerId,
          seller_id: existingTrade.from_user_id,
          product_id: productId,
          points: existingTrade.points_amount
        })

        return {
          trade_code: existingTrade.trade_code,
          item_id: productId,
          name: existingTrade.name,
          seller_id: existingTrade.from_user_id,
          buyer_id: buyerId,
          points: existingTrade.points_amount,
          purchased_at: existingTrade.trade_time,
          is_duplicate: true // ✅ 标记为重复请求
        }
      }
    }

    // 支持外部事务传入
    const transaction = externalTransaction || (await UserInventory.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      logger.info('开始购买市场商品', {
        buyer_id: buyerId,
        product_id: productId,
        business_id
      })

      // 查询市场商品（加行级锁）
      const marketProduct = await UserInventory.findOne({
        where: {
          inventory_id: productId,
          market_status: 'on_sale',
          is_available: true
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!marketProduct) {
        throw new Error('商品不存在或已下架')
      }

      const sellerId = marketProduct.user_id
      const sellingPoints = marketProduct.selling_points

      // 检查是否购买自己的商品
      if (buyerId === sellerId) {
        throw new Error('不能购买自己的商品')
      }

      // 扣除买家积分（通过 PointsService）
      const PointsService = require('./PointsService')
      await PointsService.deductPoints(buyerId, sellingPoints, {
        reason: `购买市场商品：${marketProduct.name}`,
        transaction
      })

      // 增加卖家积分
      await PointsService.addPoints(sellerId, sellingPoints, {
        reason: `出售市场商品：${marketProduct.name}`,
        transaction
      })

      // 更新物品归属和状态
      await marketProduct.update(
        {
          user_id: buyerId,
          market_status: 'sold',
          is_available: true,
          sold_at: BeijingTimeHelper.createBeijingTime(),
          transfer_count: (marketProduct.transfer_count || 0) + 1,
          last_transfer_at: BeijingTimeHelper.createBeijingTime(),
          last_transfer_from: sellerId
        },
        { transaction }
      )

      // 创建交易记录
      const tradeCode = `mp_${BeijingTimeHelper.generateIdTimestamp()}_${Math.random().toString(36).substr(2, 8)}`
      await TradeRecord.create(
        {
          trade_code: tradeCode,
          trade_type: 'market_purchase',
          from_user_id: sellerId,
          to_user_id: buyerId,
          points_amount: sellingPoints,
          fee_points_amount: 0,
          net_points_amount: sellingPoints,
          status: 'completed',
          item_id: productId,
          name: marketProduct.name,
          trade_reason: '市场商品交易',
          trade_time: BeijingTimeHelper.createBeijingTime(),
          processed_time: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      // 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      logger.info('购买市场商品成功', {
        buyer_id: buyerId,
        seller_id: sellerId,
        product_id: productId,
        points: sellingPoints
      })

      return {
        trade_code: tradeCode,
        item_id: productId,
        name: marketProduct.name,
        seller_id: sellerId,
        buyer_id: buyerId,
        points: sellingPoints,
        purchased_at: BeijingTimeHelper.createBeijingTime()
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('购买市场商品失败', {
        error: error.message,
        buyer_id: buyerId,
        product_id: productId
      })
      throw error
    }
  }

  /**
   * 撤回市场商品
   *
   * 业务场景：
   * - 卖家撤回自己上架的商品
   *
   * @param {number} userId - 用户ID
   * @param {number} productId - 商品ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 撤回结果
   */
  static async withdrawMarketProduct (userId, productId, options = {}) {
    const { transaction: externalTransaction } = options

    // 支持外部事务传入
    const transaction = externalTransaction || (await UserInventory.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      logger.info('开始撤回市场商品', {
        user_id: userId,
        product_id: productId
      })

      // 查询商品（加行级锁）
      const marketProduct = await UserInventory.findOne({
        where: {
          inventory_id: productId,
          user_id: userId,
          market_status: 'on_sale'
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!marketProduct) {
        throw new Error('商品不存在或不属于您')
      }

      // 更新状态为撤回
      await marketProduct.update(
        {
          market_status: 'withdrawn',
          is_available: true,
          withdrawn_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      // 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      logger.info('撤回市场商品成功', {
        user_id: userId,
        product_id: productId
      })

      return {
        item_id: productId,
        market_status: 'withdrawn',
        withdrawn_at: marketProduct.withdrawn_at
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('撤回市场商品失败', {
        error: error.message,
        user_id: userId,
        product_id: productId
      })
      throw error
    }
  }

  /**
   * 检查上架状态
   *
   * 业务场景：
   * - 用户查询自己有多少商品在市场上架
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 上架状态统计
   */
  static async checkListingStatus (userId, options = {}) {
    const { transaction = null } = options

    try {
      logger.info('开始检查上架状态', {
        user_id: userId
      })

      const onSaleCount = await UserInventory.count({
        where: {
          user_id: userId,
          market_status: 'on_sale'
        },
        transaction
      })

      logger.info('检查上架状态成功', {
        user_id: userId,
        on_sale_count: onSaleCount
      })

      return {
        user_id: userId,
        on_sale_count: onSaleCount
      }
    } catch (error) {
      logger.error('检查上架状态失败', {
        error: error.message,
        user_id: userId
      })
      throw error
    }
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 权限检查
   * @private
   * @param {number} viewerId - 查看者ID
   * @param {number} targetUserId - 目标用户ID
   * @returns {Promise<boolean>} 权限检查结果
   */
  static async _checkViewPermission (viewerId, targetUserId) {
    if (viewerId === targetUserId) {
      return true
    }

    const userRoles = await getUserRoles(viewerId)
    if (!userRoles.isAdmin) {
      throw new Error('无权限查看其他用户库存')
    }

    return true
  }

  /**
   * 数据处理
   * @private
   * @param {Array} inventory - 库存数据
   * @returns {Array} 处理后的库存数据
   */
  static _processInventoryData (inventory) {
    return inventory.map(item => {
      const itemData = item.toJSON()

      // 添加状态描述
      itemData.status_description = this._getStatusDescription(itemData.status)

      // 添加过期状态
      if (itemData.expires_at) {
        itemData.is_expired = BeijingTimeHelper.createBeijingTime() > new Date(itemData.expires_at)
      }

      return itemData
    })
  }

  /**
   * 获取状态描述
   * @private
   * @param {string} status - 状态
   * @returns {string} 状态描述
   */
  static _getStatusDescription (status) {
    const statusMap = {
      available: '可用',
      used: '已使用',
      expired: '已过期',
      transferred: '已转让',
      pending: '待处理'
    }
    return statusMap[status] || '未知'
  }

  /**
   * 获取默认图标
   * @private
   * @param {string} type - 物品类型
   * @returns {string} 默认图标
   */
  static _getDefaultIcon (type) {
    const iconMap = {
      voucher: '🎫',
      product: '🎁',
      service: '🔧'
    }
    return iconMap[type] || '📦'
  }

  /**
   * 获取用户上架统计（管理员功能）
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.limit=20] - 每页数量
   * @param {string} [options.filter='all'] - 筛选条件（all/near_limit/at_limit）
   * @param {number} [options.max_listings=10] - 上架上限
   * @returns {Promise<Object>} 统计结果
   */
  static async getUserListingStats (options = {}) {
    const { page = 1, limit = 20, filter = 'all', max_listings = 10 } = options

    try {
      logger.info('查询用户上架统计', { page, limit, filter, max_listings })

      const offset = (page - 1) * limit

      // 查询所有用户的上架统计（按user_id分组统计在售商品数量）
      const stats = await UserInventory.findAll({
        attributes: [
          'user_id',
          [
            UserInventory.sequelize.fn('COUNT', UserInventory.sequelize.col('inventory_id')),
            'active_listings'
          ]
        ],
        where: {
          market_status: 'on_sale'
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile', 'created_at'],
            required: true
          }
        ],
        group: ['user_id'],
        order: [[UserInventory.sequelize.literal('active_listings'), 'DESC']],
        raw: true
      })

      // 应用筛选条件
      let filteredStats = stats
      if (filter === 'near_limit') {
        // 接近上限：8-9件
        filteredStats = stats.filter(
          item => item.active_listings >= 8 && item.active_listings < max_listings
        )
      } else if (filter === 'at_limit') {
        // 达到上限：10件及以上
        filteredStats = stats.filter(item => item.active_listings >= max_listings)
      }

      // 分页处理
      const totalCount = filteredStats.length
      const paginatedStats = filteredStats.slice(offset, offset + parseInt(limit))

      // 格式化返回数据
      const formattedStats = paginatedStats.map(item => {
        const activeListings = parseInt(item.active_listings)
        let status = 'normal'
        if (activeListings >= max_listings) {
          status = 'at_limit'
        } else if (activeListings >= 8) {
          status = 'near_limit'
        }

        return {
          user_id: item.user_id,
          nickname: item['user.nickname'],
          mobile: item['user.mobile'],
          active_listings: activeListings,
          limit: max_listings,
          remaining: max_listings - activeListings,
          percentage: Math.round((activeListings / max_listings) * 100),
          status,
          registered_at: item['user.created_at']
        }
      })

      // 计算总体统计摘要
      const summary = {
        total_users_with_listings: stats.length,
        users_at_limit: stats.filter(s => s.active_listings >= max_listings).length,
        users_near_limit: stats.filter(
          s => s.active_listings >= 8 && s.active_listings < max_listings
        ).length
      }

      logger.info('查询用户上架状态成功', {
        total_users: summary.total_users_with_listings,
        filtered_count: totalCount,
        page: parseInt(page)
      })

      return {
        success: true,
        stats: formattedStats,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: totalCount,
          total_pages: Math.ceil(totalCount / limit)
        },
        summary,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      logger.error('查询用户上架状态失败', { error: error.message })
      throw error
    }
  }

  /**
   * 验证商品是否可兑换（用于兑换流程）
   *
   * 业务场景：
   * - ExchangeOperationService 在创建兑换订单前验证商品信息
   * - 验证商品存在性、可用性、库存充足性
   * - 返回商品信息和空间信息，供后续流程使用
   *
   * @param {number} productId - 商品ID
   * @param {string} space - 空间类型（lucky/premium）
   * @param {number} quantity - 兑换数量
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必需，确保原子性）
   * @returns {Promise<Object>} {product, space_info, current_stock, total_points}
   * @throws {Error} 商品不存在、不可兑换、库存不足等错误
   */
  static async validateProductForExchange (productId, space, quantity, options = {}) {
    const { transaction } = options

    if (!transaction) {
      throw new Error('validateProductForExchange 必须在事务内调用')
    }

    try {
      logger.info('开始验证商品可兑换性', {
        product_id: productId,
        space,
        quantity
      })

      // 1. 获取商品信息（加悲观锁，防止并发超卖）
      const product = await Product.findByPk(productId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!product) {
        throw new Error('商品不存在')
      }

      // 2. 获取对应空间的商品信息
      const space_info = product.getSpaceInfo ? product.getSpaceInfo(space) : null
      if (!space_info) {
        throw new Error(`该商品在${space}空间不可用`)
      }

      // 3. 验证商品可用性
      if (!product.isAvailable()) {
        throw new Error('商品暂不可兑换')
      }

      // 4. 检查对应空间的库存
      let current_stock
      if (space === 'premium' && product.space === 'both') {
        // 臻选空间：使用premium_stock（如果有独立库存）
        current_stock = product.premium_stock !== null ? product.premium_stock : product.stock
      } else {
        // 幸运空间或单一空间商品：使用stock
        current_stock = product.stock
      }

      if (current_stock < quantity) {
        throw new Error(`商品库存不足（当前库存：${current_stock}）`)
      }

      // 5. 计算所需积分
      const total_points = space_info.exchange_points * quantity

      logger.info('商品验证通过', {
        product_id: productId,
        product_name: product.name,
        space,
        quantity,
        current_stock,
        total_points
      })

      return {
        product,
        space_info,
        current_stock,
        total_points
      }
    } catch (error) {
      logger.error('验证商品可兑换性失败', {
        product_id: productId,
        space,
        quantity,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 扣减商品库存（用于兑换流程）
   *
   * 业务场景：
   * - ExchangeOperationService 在兑换订单创建成功后扣减库存
   * - 使用原子性操作，防止并发超卖
   * - 支持不同空间的库存扣减逻辑
   *
   * @param {number} productId - 商品ID
   * @param {string} space - 空间类型（lucky/premium）
   * @param {number} quantity - 扣减数量
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必需，确保原子性）
   * @returns {Promise<number>} 受影响的行数（应为1）
   * @throws {Error} 库存不足或并发冲突
   */
  static async deductProductStock (productId, space, quantity, options = {}) {
    const { transaction } = options
    const { sequelize, Sequelize } = require('../models')

    if (!transaction) {
      throw new Error('deductProductStock 必须在事务内调用')
    }

    try {
      logger.info('开始扣减商品库存', {
        product_id: productId,
        space,
        quantity
      })

      // 获取商品信息（用于日志）
      const product = await Product.findByPk(productId, { transaction })

      // 构建原子性更新语句
      let update_fields
      let where_condition

      if (space === 'premium' && product.space === 'both' && product.premium_stock !== null) {
        // 臻选空间有独立库存：扣减premium_stock
        update_fields = {
          premium_stock: sequelize.literal(`premium_stock - ${quantity}`)
        }
        where_condition = {
          product_id: productId,
          premium_stock: { [Sequelize.Op.gte]: quantity }
        }
      } else {
        // 幸运空间或共享库存：扣减stock
        update_fields = {
          stock: sequelize.literal(`stock - ${quantity}`)
        }
        where_condition = {
          product_id: productId,
          stock: { [Sequelize.Op.gte]: quantity }
        }
      }

      // 执行原子性更新
      const [affectedRows] = await Product.update(update_fields, {
        where: where_condition,
        transaction
      })

      // 检查更新结果
      if (affectedRows === 0) {
        throw new Error('商品库存不足（并发冲突或库存已售罄）')
      }

      logger.info('商品库存扣减成功', {
        product_id: productId,
        product_name: product.name,
        space,
        quantity,
        affected_rows: affectedRows
      })

      return affectedRows
    } catch (error) {
      logger.error('扣减商品库存失败', {
        product_id: productId,
        space,
        quantity,
        error: error.message
      })
      throw error
    }
  }
}

module.exports = InventoryService
