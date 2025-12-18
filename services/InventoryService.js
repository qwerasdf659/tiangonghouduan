/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 库存服务（InventoryService）
 *
 * @deprecated 此服务已废弃，请使用新的双轨架构：
 *   - 背包查询 → 使用 BackpackService.getUserBackpack()
 *   - 核销码生成 → 使用 RedemptionOrderService.createOrder()
 *   - 核销验证 → 使用 RedemptionOrderService.fulfillOrder()
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
const { UserInventory, TradeRecord, User, Product } = require('../models')
const { sequelize, Op } = require('../config/database')
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
  static async getUserInventory(userId, filters = {}, options = {}) {
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
  static async getItemDetail(viewerId, itemId) {
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
  static async useItem(actorId, itemId, context = {}) {
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
  static async transferItem(fromUserId, toUserId, itemId, context = {}) {
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
            transfer_count: item.transfer_count || 0
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
   * ❌ 已废弃：生成核销码（方案A - 2025-12-17立即停止）
   *
   * @deprecated 此方法已完全废弃，请使用 RedemptionOrderService.createOrder(item_instance_id)
   * @param {number} userId - 用户ID
   * @param {number} itemId - 物品ID
   * @param {Object} _options - 选项（未使用）
   * @returns {Promise<never>} 总是抛出异常
   * @throws {Error} 强制抛出异常，不再支持旧6位数字码生成
   *
   * 废弃原因：
   * - 旧码（6位数字，5分钟TTL）已废弃，系统统一使用新码（12位Base32，30天TTL）
   * - 新码使用SHA-256哈希存储，更安全
   * - 新码通过 redemption_orders 表管理，支持更完善的状态机
   *
   * 迁移指南：
   * 1. 使用 RedemptionOrderService.createOrder(item_instance_id, options) 生成新码
   * 2. 新码返回格式：{ order: RedemptionOrder, code: '1234-5678-90AB' }
   * 3. 新码有效期：30天（vs 旧码5分钟）
   * 4. 核销接口：RedemptionOrderService.fulfillOrder(code, redeemer_user_id)
   *
   * 决策记录：2025-12-17 用户选择方案A（一刀切，立即停止旧码生成）
   */
  static async generateVerificationCode(userId, itemId, _options = {}) {
    logger.error('尝试调用已废弃的旧码生成方法', {
      method: 'generateVerificationCode',
      deprecated_since: '2025-12-17',
      user_id: userId,
      item_id: itemId,
      caller: new Error().stack.split('\n')[2]?.trim()
    })

    throw new Error(
      '此方法已完全废弃（方案A - 一刀切）。' +
        '旧6位数字码不再支持。' +
        '请使用 RedemptionOrderService.createOrder(item_instance_id) 生成新12位Base32码。' +
        '新码有效期30天，更安全且功能更完善。' +
        '迁移文档：docs/背包双轨架构迁移执行方案-真实版.md'
    )
  }

  /**
   * ❌ 已废弃：核销验证（方案A - 2025-12-17立即停止）
   *
   * @deprecated 此方法已完全废弃，请使用 RedemptionOrderService.fulfillOrder(code, redeemer_user_id)
   * @param {number} merchantId - 商家ID
   * @param {string} verificationCode - 核销码
   * @param {Object} _options - 选项（未使用）
   * @returns {Promise<never>} 总是抛出异常
   * @throws {Error} 强制抛出异常，不再支持旧8位HEX码核销
   *
   * 废弃原因：
   * - 旧码（8位HEX，24小时TTL）已废弃，系统统一使用新码（12位Base32，30天TTL）
   * - 新码使用SHA-256哈希存储，安全性大幅提升
   * - 新码通过 redemption_orders 表管理，支持完整的状态机（pending/fulfilled/cancelled/expired）
   * - 新码支持更完善的幂等性和并发控制
   *
   * 迁移指南：
   * 1. 使用 RedemptionOrderService.fulfillOrder(code, redeemer_user_id, options) 核销新码
   * 2. 新码格式：12位Base32，如 '1234-5678-90AB'（带连字符为显示格式）
   * 3. 核销返回格式：{ order: RedemptionOrder, item: ItemInstance }
   * 4. 新码有效期：30天（vs 旧码24小时）
   * 5. 新码状态：pending → fulfilled（核销成功）或 expired（超时）或 cancelled（取消）
   *
   * 商家端迁移：
   * - 旧接口：POST /api/v4/inventory/verification/verify
   * - 新接口：POST /api/v4/redemption/fulfill
   * - 新接口请求体：{ code: "1234567890AB", redeemer_user_id: 123 }
   *
   * 决策记录：2025-12-17 用户选择方案A（一刀切，立即停止旧码核销）
   */
  static async verifyCode(merchantId, verificationCode, _options = {}) {
    logger.error('尝试调用已废弃的旧码核销方法', {
      method: 'verifyCode',
      deprecated_since: '2025-12-17',
      merchant_id: merchantId,
      verification_code: verificationCode,
      caller: new Error().stack.split('\n')[2]?.trim()
    })

    throw new Error(
      '此方法已完全废弃（方案A - 一刀切）。' +
        '旧8位HEX码不再支持核销。' +
        '请使用 RedemptionOrderService.fulfillOrder(code, redeemer_user_id) 核销新12位Base32码。' +
        '商家端请更新扫码接口为 POST /api/v4/redemption/fulfill。' +
        '新码有效期30天，更安全且功能更完善。' +
        '迁移文档：docs/背包双轨架构迁移执行方案-真实版.md'
    )
  }

  /**
   * 验证核销码格式（用于提前校验，避免无效查询）
   *
   * @param {string} verificationCode - 核销码
   * @returns {Object} {valid: boolean, error?: string}
   */
  static validateVerificationCodeFormat(verificationCode) {
    // 验证非空
    if (!verificationCode || verificationCode.trim().length === 0) {
      return { valid: false, error: '核销码不能为空' }
    }

    // 验证格式：8位大写十六进制字符
    const codePattern = /^[A-F0-9]{8}$/
    if (!codePattern.test(verificationCode.trim().toUpperCase())) {
      return {
        valid: false,
        error: '核销码格式错误，应为8位大写字母（A-F）和数字（0-9）组合，例如：A1B2C3D4'
      }
    }

    return { valid: true }
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
  static async getAdminStatistics(options = {}) {
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
  static async getTransferHistory(userId, filters = {}, options = {}) {
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
  static async getProducts(filters = {}, options = {}) {
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
  static async getMarketProducts(filters = {}, options = {}) {
    try {
      const { category, sort = 'newest', page = 1, limit = 20 } = filters
      const { transaction = null } = options

      // 引入所需模型
      const { MarketListing, ItemInstance } = require('../models')

      logger.info('开始获取市场商品列表（从 market_listings 查询）', {
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

      /*
       * 🔴 P0-1 修复：从 market_listings 表查询，不再使用 UserInventory
       * 🔴 P1-1c 增强：支持可叠加资产和不可叠加物品两种类型
       * 构建查询条件
       */
      const whereClause = {
        status: 'on_sale'
        // 🔴 P1-1c：不限制 listing_kind，同时支持 item_instance 和 fungible_asset
      }

      // 排序规则（按 price_amount 排序）
      let order = [['created_at', 'DESC']]
      switch (sort) {
        case 'price_low':
          order = [['price_amount', 'ASC']]
          break
        case 'price_high':
          order = [['price_amount', 'DESC']]
          break
        case 'newest':
          order = [['created_at', 'DESC']]
          break
      }

      /*
       * 🔴 P0-1 + P1-1c：查询 market_listings 表，支持两种类型
       * - item_instance：关联 item_instances 表（物品所有权真相）
       * - fungible_asset：不关联，直接从 market_listings 读取
       */
      const { count, rows: marketListings } = await MarketListing.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: ItemInstance,
            as: 'offerItem',
            required: false, // LEFT JOIN，允许 fungible_asset 类型不关联
            attributes: ['item_instance_id', 'owner_user_id', 'item_type', 'status', 'meta']
          }
        ],
        order,
        limit: finalLimit,
        offset,
        transaction
      })

      /*
       * 🔴 P1-1c 增强：格式化商品数据，支持两种类型
       * - item_instance：从 item_instances.meta 获取信息
       * - fungible_asset：从 market_listings 字段直接获取
       */
      const formattedProducts = marketListings
        .map(listing => {
          // 判断挂牌类型
          if (listing.listing_kind === 'item_instance') {
            // 不可叠加物品
            const itemMeta = listing.offerItem?.meta || {}
            const itemType = listing.offerItem?.item_type || 'unknown'

            // 如果前端需要按 category 过滤，需要从 item_type 映射
            if (category && category !== 'all') {
              const typeMapping = {
                voucher: 'voucher',
                product: 'product',
                service: 'service'
              }
              if (typeMapping[itemType] !== category) {
                return null // 过滤掉不匹配的类别
              }
            }

            return {
              listing_id: listing.listing_id,
              listing_kind: 'item_instance',
              id: listing.offer_item_instance_id,
              seller_id: listing.seller_user_id,
              name: itemMeta.name || '未命名物品',
              description: itemMeta.description || '暂无描述',
              price_amount: listing.price_amount,
              selling_points: listing.price_amount,
              condition: 'good',
              category: itemType,
              is_available: listing.status === 'on_sale',
              created_at: listing.created_at
            }
          } else if (listing.listing_kind === 'fungible_asset') {
            // 可叠加资产
            return {
              listing_id: listing.listing_id,
              listing_kind: 'fungible_asset',
              seller_id: listing.seller_user_id,
              offer_asset_code: listing.offer_asset_code,
              offer_amount: listing.offer_amount,
              name: `${listing.offer_asset_code} x${listing.offer_amount}`,
              description: `出售 ${listing.offer_amount} 个 ${listing.offer_asset_code}`,
              price_amount: listing.price_amount,
              selling_points: listing.price_amount,
              category: 'material',
              is_available: listing.status === 'on_sale',
              created_at: listing.created_at
            }
          }

          return null
        })
        .filter(item => item !== null) // 过滤掉空值

      logger.info('获取市场商品列表成功（从 market_listings）', {
        total: count,
        returned: formattedProducts.length
      })

      return {
        products: formattedProducts,
        pagination: {
          total: formattedProducts.length, // 注意：如果有 category 过滤，total 可能不准确
          page: finalPage,
          limit: finalLimit,
          total_pages: Math.ceil(formattedProducts.length / finalLimit)
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
   * 🔴 P0-2 修复：从 market_listings 查询，关联 item_instances（物品所有权真相）
   *
   * @param {number} listingIdOrItemId - 挂牌ID 或 物品实例ID（兼容旧参数）
   * @param {Object} options - 选项
   * @param {Object} [options.transaction] - 事务对象（可选）
   * @returns {Promise<Object>} 商品详情
   */
  static async getMarketProductDetail(listingIdOrItemId, options = {}) {
    const { transaction = null } = options

    // 引入所需模型
    const { MarketListing, ItemInstance } = require('../models')

    try {
      logger.info('开始获取市场商品详情（从 market_listings 查询）', {
        listing_id_or_item_id: listingIdOrItemId
      })

      // 🔴 P0-2：优先按 listing_id 查询，兼容按 offer_item_instance_id 查询
      let marketListing = await MarketListing.findOne({
        where: {
          listing_id: listingIdOrItemId,
          status: 'on_sale'
        },
        include: [
          {
            model: ItemInstance,
            as: 'offerItem',
            required: true,
            attributes: ['item_instance_id', 'owner_user_id', 'item_type', 'status', 'meta']
          }
        ],
        transaction
      })

      // 兼容：如果按 listing_id 没找到，尝试按 offer_item_instance_id 查询
      if (!marketListing) {
        marketListing = await MarketListing.findOne({
          where: {
            offer_item_instance_id: listingIdOrItemId,
            status: 'on_sale'
          },
          include: [
            {
              model: ItemInstance,
              as: 'offerItem',
              required: true,
              attributes: ['item_instance_id', 'owner_user_id', 'item_type', 'status', 'meta']
            }
          ],
          transaction
        })
      }

      if (!marketListing) {
        throw new Error('市场商品不存在或已下架')
      }

      const itemMeta = marketListing.offerItem?.meta || {}
      const itemType = marketListing.offerItem?.item_type || 'unknown'

      const productDetail = {
        listing_id: marketListing.listing_id,
        id: marketListing.offer_item_instance_id,
        seller_id: marketListing.seller_user_id,
        name: itemMeta.name || '未命名物品',
        description: itemMeta.description || '暂无描述',
        price_amount: marketListing.price_amount,
        selling_points: marketListing.price_amount,
        condition: 'good',
        category: itemType,
        is_available: marketListing.status === 'on_sale',
        created_at: marketListing.created_at,
        expires_at: null
      }

      logger.info('获取市场商品详情成功（从 market_listings）', {
        listing_id: marketListing.listing_id,
        item_instance_id: marketListing.offer_item_instance_id,
        seller_id: productDetail.seller_id
      })

      return productDetail
    } catch (error) {
      logger.error('获取市场商品详情失败', {
        error: error.message,
        listing_id_or_item_id: listingIdOrItemId
      })
      throw error
    }
  }

  /**
   * 上架商品到市场（V4.2 - DIAMOND定价）
   *
   * 业务场景：
   * - 用户将闲置物品上架到市场出售
   * - 使用DIAMOND资产定价（不再使用积分）
   * - 只有available状态的物品可以上架
   *
   * 业务规则（不做兼容）：
   * - **强幂等**：必须由客户端提供 business_id（缺失直接报错）
   * - 只接收 price_amount 参数（DIAMOND定价）
   * - 直接拒绝 selling_amount / selling_points（不做兼容）
   * - 定价资产固定为 DIAMOND（price_asset_code='DIAMOND'）
   *
   * @param {number} userId - 用户ID
   * @param {number} itemId - 物品ID
   * @param {Object} marketInfo - 市场信息
   * @param {string} marketInfo.business_id - 幂等键（必填，客户端提供）
   * @param {number} marketInfo.price_amount - 售价（DIAMOND，整数，必填）
   * @param {string} marketInfo.condition - 成色（new/excellent/good/fair/poor，可选，默认good）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 上架结果
   * @throws {Error} 如果传入selling_points参数或缺少selling_amount
   */
  static async listProductToMarket(userId, itemId, marketInfo, options = {}) {
    const { transaction: externalTransaction } = options

    // 支持外部事务传入
    const transaction = externalTransaction || (await UserInventory.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 🔴 强幂等：business_id 必填（客户端提供）
      if (!marketInfo.business_id) {
        throw new Error('缺少必填参数：business_id（幂等键，客户端必须提供）')
      }

      // 【不做兼容】拒绝旧字段
      if (marketInfo.selling_points !== undefined) {
        throw new Error('不支持 selling_points，请使用 price_amount（DIAMOND定价）')
      }
      if (marketInfo.selling_amount !== undefined) {
        throw new Error('不支持 selling_amount，请使用 price_amount（DIAMOND定价）')
      }

      // 【必填验证】price_amount 必须存在
      if (marketInfo.price_amount === undefined || marketInfo.price_amount === null) {
        throw new Error('缺少必填参数：price_amount（DIAMOND定价）')
      }

      // 参数验证：price_amount 必须为正整数
      const priceAmount = parseInt(marketInfo.price_amount)
      if (isNaN(priceAmount) || priceAmount <= 0) {
        throw new Error('售价必须大于0（DIAMOND）')
      }

      const businessId = marketInfo.business_id

      // 参数验证：成色
      const validConditions = ['new', 'excellent', 'good', 'fair', 'poor']
      const condition = marketInfo.condition || 'good'
      if (!validConditions.includes(condition)) {
        throw new Error(`无效的成色参数：${condition}，允许值：${validConditions.join(', ')}`)
      }

      logger.info('开始上架商品到市场（DIAMOND定价）', {
        user_id: userId,
        item_id: itemId,
        business_id: businessId,
        price_amount: priceAmount,
        price_asset_code: 'DIAMOND',
        condition
      })

      // 🔴 强幂等：检查是否已存在同 business_id 的挂牌
      const { MarketListing } = require('../models')
      const existingListing = await MarketListing.findOne({
        where: { business_id: businessId },
        transaction
      })

      if (existingListing) {
        const isParamsMatch =
          existingListing.listing_kind === 'item_instance' &&
          Number(existingListing.seller_user_id) === Number(userId) &&
          Number(existingListing.offer_item_instance_id) === Number(itemId) &&
          Number(existingListing.price_amount) === Number(priceAmount) &&
          existingListing.price_asset_code === 'DIAMOND'

        if (!isParamsMatch) {
          const conflictError = new Error(
            `幂等键冲突：business_id="${businessId}" 已用于不同参数的挂牌操作。` +
              `（已存在：seller_user_id=${existingListing.seller_user_id}, offer_item_instance_id=${existingListing.offer_item_instance_id}, price_amount=${existingListing.price_amount}；` +
              `当前：seller_user_id=${userId}, offer_item_instance_id=${itemId}, price_amount=${priceAmount}）`
          )
          conflictError.statusCode = 409
          conflictError.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
          throw conflictError
        }

        // 参数一致：幂等返回同结果
        logger.info('命中幂等：挂牌已存在，直接返回', {
          user_id: userId,
          business_id: businessId,
          listing_id: existingListing.listing_id
        })

        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          is_duplicate: true,
          business_id: businessId,
          listing_id: existingListing.listing_id,
          listing_kind: existingListing.listing_kind,
          item_instance_id: itemId,
          price_asset_code: existingListing.price_asset_code,
          price_amount: Number(existingListing.price_amount),
          status: existingListing.status,
          condition,
          listed_at: existingListing.created_at || BeijingTimeHelper.createBeijingTime()
        }
      }

      // 🔴 P0-2 修复：使用 ItemInstance 作为物品所有权真相
      const { ItemInstance } = require('../models')
      const itemInstance = await ItemInstance.findOne({
        where: {
          item_instance_id: itemId,
          owner_user_id: userId,
          status: 'available'
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!itemInstance) {
        throw new Error('物品不存在或不可上架')
      }

      // 更新物品状态为上架（锁定状态）
      await itemInstance.update(
        {
          status: 'locked', // 上架时锁定物品
          locked_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      /**
       * 创建 market_listings 记录（物品所有权真相）
       */
      const listing = await MarketListing.create(
        {
          listing_kind: 'item_instance',
          seller_user_id: userId,
          business_id: businessId,
          offer_item_instance_id: itemInstance.item_instance_id, // 引用 item_instances.item_instance_id
          price_asset_code: 'DIAMOND',
          price_amount: priceAmount,
          seller_offer_frozen: false, // 物品实例不需要冻结（所有权直接转移）
          status: 'on_sale'
        },
        { transaction }
      )

      logger.info('[InventoryService] 物品已上架到 market_listings', {
        item_instance_id: itemInstance.item_instance_id,
        seller_user_id: userId,
        business_id: businessId,
        listing_id: listing.listing_id,
        price_amount: priceAmount
      })

      // 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      logger.info('上架商品到市场成功（DIAMOND定价）', {
        user_id: userId,
        item_id: itemId,
        business_id: businessId,
        price_asset_code: 'DIAMOND',
        price_amount: priceAmount,
        condition
      })

      // 返回结果（只返回 DIAMOND 口径）
      return {
        is_duplicate: false,
        business_id: businessId,
        listing_id: listing.listing_id,
        listing_kind: 'item_instance',
        item_instance_id: itemId,
        price_asset_code: 'DIAMOND',
        price_amount: priceAmount,
        condition,
        listed_at: itemInstance.locked_at // 使用 itemInstance 的锁定时间
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('上架商品到市场失败（DIAMOND定价）', {
        error: error.message,
        user_id: userId,
        item_id: itemId,
        price_amount: marketInfo.price_amount,
        business_id: marketInfo.business_id
      })
      throw error
    }
  }

  /**
   * 购买市场商品（Phase 2 - 冻结链路升级版）
   *
   * 业务场景：
   * - 用户使用DIAMOND资产购买市场上的商品
   * - 使用冻结链路：锁定挂牌 → 冻结资产 → 结算 → 转移所有权
   * - 强幂等性控制，防止重复扣款
   * - 通过 TradeOrderService 统一管理订单流程
   *
   * 业务流程（Phase 2 架构）：
   * 1. 查询 market_listings 表获取挂牌信息（不再使用 UserInventory.market_status）
   * 2. 调用 TradeOrderService.createOrder() 创建订单并冻结资产
   * 3. 调用 TradeOrderService.completeOrder() 完成订单并结算资产
   * 4. 更新 UserInventory 的所有权（user_id: seller → buyer）
   *
   * 业务规则：
   * - business_id必填（强制幂等）
   * - 使用 market_listings 表作为挂牌真相
   * - 使用 TradeOrderService 统一管理订单和资产冻结/结算
   * - 手续费入系统账户（SYSTEM_PLATFORM_FEE）
   *
   * @param {number} buyerId - 购买者ID
   * @param {number} productId - 商品ID（UserInventory.inventory_id）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @param {string} options.business_id - 业务唯一ID（必填，用于幂等性）
   * @returns {Promise<Object>} 购买结果
   * @throws {Error} 如果缺少business_id、挂牌不存在、余额不足等
   */
  static async purchaseMarketProduct(buyerId, productId, options = {}) {
    const { transaction: externalTransaction, business_id } = options

    // 【强制验证】business_id必填
    if (!business_id) {
      throw new Error('缺少必填参数：business_id（强幂等控制）')
    }

    // 引入所需服务
    const TradeOrderService = require('./TradeOrderService')
    const { MarketListing } = require('../models')

    logger.info('[Phase 2] 开始购买市场商品（冻结链路）', {
      buyer_id: buyerId,
      product_id: productId,
      business_id
    })

    // 支持外部事务传入
    const transaction = externalTransaction || (await UserInventory.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 1. 查询挂牌信息（从 market_listings 表，不再使用 UserInventory.market_status）
      const listing = await MarketListing.findOne({
        where: {
          offer_item_instance_id: productId,
          status: 'on_sale'
        },
        include: [
          {
            model: UserInventory,
            as: 'offerItem',
            required: true
          }
        ],
        transaction
      })

      if (!listing) {
        throw new Error(`挂牌不存在或已下架: inventory_id=${productId}`)
      }

      // 验证物品实例存在且可用
      const itemInstance = listing.offerItem
      if (!itemInstance || !itemInstance.is_available) {
        throw new Error('物品实例不存在或不可用')
      }

      // 检查是否购买自己的商品
      if (buyerId === listing.seller_user_id) {
        throw new Error('不能购买自己的商品')
      }

      // 2. 创建订单并冻结买家资产（调用 TradeOrderService）
      logger.info('[Phase 2] 创建订单并冻结资产', {
        listing_id: listing.listing_id,
        buyer_id: buyerId,
        price_amount: listing.price_amount
      })

      const createOrderResult = await TradeOrderService.createOrder(
        {
          business_id,
          listing_id: listing.listing_id,
          buyer_user_id: buyerId
        },
        { transaction }
      )

      const order = createOrderResult.order
      const is_duplicate = createOrderResult.is_duplicate

      // 如果是幂等请求，直接返回已有订单信息
      if (is_duplicate) {
        logger.info('[Phase 2] 幂等请求，返回已有订单', {
          order_id: order.order_id,
          business_id
        })

        // 提交事务
        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          order_id: order.order_id,
          trade_code: `order_${order.order_id}`,
          item_id: productId,
          name: itemInstance.name,
          seller_id: listing.seller_user_id,
          buyer_id: buyerId,
          asset_code: order.asset_code,
          gross_amount: order.gross_amount,
          fee_amount: order.fee_amount,
          net_amount: order.net_amount,
          purchased_at: order.created_at,
          is_duplicate: true
        }
      }

      // 3. 完成订单并结算资产（调用 TradeOrderService）
      logger.info('[Phase 2] 完成订单并结算资产', {
        order_id: order.order_id
      })

      // 🔴 P0-1 修复：使用同一 business_id（不加后缀），通过 business_type 区分各分录
      await TradeOrderService.completeOrder(
        {
          order_id: order.order_id,
          business_id // 使用同一个 business_id
        },
        { transaction }
      )

      // 4. 更新物品实例的转让追踪信息
      await itemInstance.update(
        {
          sold_at: BeijingTimeHelper.createBeijingTime(),
          transfer_count: (itemInstance.transfer_count || 0) + 1,
          last_transfer_at: BeijingTimeHelper.createBeijingTime(),
          last_transfer_from: listing.seller_user_id
        },
        { transaction }
      )

      // 5. 创建交易记录（用于兼容性和历史追溯）
      const tradeCode = `order_${order.order_id}`
      await TradeRecord.create(
        {
          trade_code: tradeCode,
          trade_type: 'market_purchase',
          from_user_id: listing.seller_user_id,
          to_user_id: buyerId,
          // 【旧字段】保留用于兼容性
          points_amount: order.gross_amount,
          fee_points_amount: order.fee_amount,
          net_points_amount: order.net_amount,
          // 【新字段】对账字段
          asset_code: order.asset_code,
          gross_amount: order.gross_amount,
          fee_amount: order.fee_amount,
          net_amount: order.net_amount,
          business_id, // 【幂等键】
          // 其他字段
          status: 'completed',
          item_id: productId,
          name: itemInstance.name,
          trade_reason: '市场商品交易（Phase 2 冻结链路）',
          trade_time: BeijingTimeHelper.createBeijingTime(),
          processed_time: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      // 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      logger.info('[Phase 2] 购买市场商品成功（冻结链路）', {
        buyer_id: buyerId,
        seller_id: listing.seller_user_id,
        product_id: productId,
        order_id: order.order_id,
        asset_code: order.asset_code,
        gross_amount: order.gross_amount,
        fee_amount: order.fee_amount,
        net_amount: order.net_amount,
        trade_code: tradeCode
      })

      return {
        order_id: order.order_id,
        trade_code: tradeCode,
        item_id: productId,
        name: itemInstance.name,
        seller_id: listing.seller_user_id,
        buyer_id: buyerId,
        asset_code: order.asset_code,
        gross_amount: order.gross_amount,
        fee_amount: order.fee_amount,
        net_amount: order.net_amount,
        purchased_at: order.completed_at || order.created_at,
        is_duplicate: false
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('[Phase 2] 购买市场商品失败（冻结链路）', {
        error: error.message,
        buyer_id: buyerId,
        product_id: productId,
        business_id
      })
      throw error
    }
  }

  /**
   * 购买市场挂牌商品（基于listing_id）
   *
   * 🔴 P0-3 修复：新方法，基于 listing_id（挂牌ID）而非 item_instance_id
   *
   * 业务场景：
   * - 用户购买交易市场中的挂牌商品
   * - 支持强幂等性控制（business_id）
   * - 使用 DIAMOND 结算
   *
   * 业务流程：
   * 1. 根据 listing_id 查询挂牌信息
   * 2. 创建订单并冻结买家资产
   * 3. 完成订单并结算（买家扣减、卖家入账、平台手续费）
   * 4. 转移物品所有权
   * 5. 创建交易记录
   *
   * @param {number} buyerId - 买家用户ID
   * @param {number} listingId - 挂牌ID（listing_id）
   * @param {Object} options - 选项
   * @param {string} options.business_id - 业务ID（幂等键，必填）
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 购买结果
   */
  static async purchaseMarketListing(buyerId, listingId, options = {}) {
    const { transaction: externalTransaction, business_id } = options

    // 【强制验证】business_id必填
    if (!business_id) {
      throw new Error('缺少必填参数：business_id（强幂等控制）')
    }

    // 引入所需服务
    const TradeOrderService = require('./TradeOrderService')
    const { MarketListing, ItemInstance } = require('../models')

    logger.info('[Phase 2] 开始购买市场挂牌商品（listing_id）', {
      buyer_id: buyerId,
      listing_id: listingId,
      business_id
    })

    // 支持外部事务传入
    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      /*
       * 🔴 P1-1c 增强：支持可叠加资产和不可叠加物品两种类型的购买
       * 1. 根据 listing_id 查询挂牌信息（从 market_listings 表）
       */
      const listing = await MarketListing.findOne({
        where: {
          listing_id: listingId,
          status: 'on_sale'
        },
        include: [
          {
            model: ItemInstance,
            as: 'offerItem',
            required: false // 🔴 P1-1c：允许 fungible_asset 类型不关联 ItemInstance
          }
        ],
        transaction
      })

      if (!listing) {
        throw new Error(`挂牌不存在或已下架: listing_id=${listingId}`)
      }

      // 🔴 P1-1c：根据挂牌类型进行不同的验证
      if (listing.listing_kind === 'item_instance') {
        // 不可叠加物品：验证物品实例存在且可用
        const itemInstance = listing.offerItem
        if (!itemInstance) {
          throw new Error('物品实例不存在或不可用')
        }

        // 所有权一致性校验（物品所有权真相）
        if (Number(itemInstance.owner_user_id) !== Number(listing.seller_user_id)) {
          throw new Error('物品所有权异常：物品不属于当前卖家，禁止购买')
        }

        /**
         * 物品挂牌时会被锁定（status=locked），以防止卖家同时使用/转让。
         * 购买时应允许 locked（以及兼容历史数据的 available）。
         */
        const allowedItemStatuses = ['locked', 'available']
        if (!allowedItemStatuses.includes(itemInstance.status)) {
          throw new Error(`物品实例状态不可购买：${itemInstance.status}`)
        }
      } else if (listing.listing_kind === 'fungible_asset') {
        // 可叠加资产：验证卖家标的已冻结
        if (!listing.seller_offer_frozen) {
          throw new Error('卖家标的资产未冻结，挂牌状态异常')
        }
      }

      // 检查是否购买自己的商品
      if (buyerId === listing.seller_user_id) {
        throw new Error('不能购买自己的商品')
      }

      // 2. 创建订单并冻结买家资产（调用 TradeOrderService）
      logger.info('[Phase 2] 创建订单并冻结资产', {
        listing_id: listing.listing_id,
        buyer_id: buyerId,
        price_amount: listing.price_amount
      })

      const createOrderResult = await TradeOrderService.createOrder(
        {
          business_id,
          listing_id: listing.listing_id,
          buyer_user_id: buyerId
        },
        { transaction }
      )

      const order = createOrderResult.order
      const is_duplicate = createOrderResult.is_duplicate

      // 如果是幂等请求，直接返回已有订单信息
      if (is_duplicate) {
        logger.info('[Phase 2] 幂等请求，返回已有订单', {
          order_id: order.order_id,
          business_id
        })

        // 提交事务
        if (shouldCommit) {
          await transaction.commit()
        }

        // 🔴 P1-1c：根据挂牌类型返回不同的信息
        const result = {
          order_id: order.order_id,
          trade_code: `order_${order.order_id}`,
          listing_id: listingId,
          listing_kind: listing.listing_kind,
          seller_id: listing.seller_user_id,
          buyer_id: buyerId,
          asset_code: order.asset_code,
          gross_amount: order.gross_amount,
          fee_amount: order.fee_amount,
          net_amount: order.net_amount,
          purchased_at: order.created_at,
          is_duplicate: true
        }

        if (listing.listing_kind === 'item_instance') {
          const itemMeta = listing.offerItem?.meta || {}
          result.item_id = listing.offer_item_instance_id
          result.name = itemMeta.name || '未命名物品'
        } else if (listing.listing_kind === 'fungible_asset') {
          result.offer_asset_code = listing.offer_asset_code
          result.offer_amount = listing.offer_amount
          result.name = `${listing.offer_asset_code} x${listing.offer_amount}`
        }

        return result
      }

      // 3. 完成订单并结算资产（调用 TradeOrderService）
      logger.info('[Phase 2] 完成订单并结算资产', {
        order_id: order.order_id
      })

      await TradeOrderService.completeOrder(
        {
          order_id: order.order_id,
          business_id
        },
        { transaction }
      )

      /*
       * 🔴 P1-1c：创建交易记录（支持两种类型）
       * 4. 创建交易记录（用于兼容性和历史追溯）
       */
      const tradeCode = `order_${order.order_id}`
      let tradeName = '未命名物品'

      if (listing.listing_kind === 'item_instance') {
        const itemMeta = listing.offerItem?.meta || {}
        tradeName = itemMeta.name || '未命名物品'
      } else if (listing.listing_kind === 'fungible_asset') {
        tradeName = `${listing.offer_asset_code} x${listing.offer_amount}`
      }

      await TradeRecord.create(
        {
          trade_code: tradeCode,
          trade_type: 'market_purchase',
          from_user_id: listing.seller_user_id,
          to_user_id: buyerId,
          // 【旧字段】保留用于兼容性
          points_amount: order.gross_amount,
          fee_points_amount: order.fee_amount,
          net_points_amount: order.net_amount,
          // 【新字段】对账字段
          asset_code: order.asset_code,
          gross_amount: order.gross_amount,
          fee_amount: order.fee_amount,
          net_amount: order.net_amount,
          business_id,
          // 其他字段
          status: 'completed',
          item_id: listing.offer_item_instance_id,
          name: tradeName,
          trade_reason: '市场商品交易（Phase 2 冻结链路）',
          trade_time: BeijingTimeHelper.createBeijingTime(),
          processed_time: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      // 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      logger.info('[Phase 2] 购买市场挂牌商品成功', {
        buyer_id: buyerId,
        seller_id: listing.seller_user_id,
        listing_id: listingId,
        listing_kind: listing.listing_kind,
        item_instance_id: listing.offer_item_instance_id,
        offer_asset_code: listing.offer_asset_code,
        offer_amount: listing.offer_amount,
        order_id: order.order_id,
        asset_code: order.asset_code,
        gross_amount: order.gross_amount,
        fee_amount: order.fee_amount,
        net_amount: order.net_amount,
        trade_code: tradeCode
      })

      // 🔴 P1-1c：根据挂牌类型返回不同的信息
      const result = {
        order_id: order.order_id,
        trade_code: tradeCode,
        listing_id: listingId,
        listing_kind: listing.listing_kind,
        seller_id: listing.seller_user_id,
        buyer_id: buyerId,
        asset_code: order.asset_code,
        gross_amount: order.gross_amount,
        fee_amount: order.fee_amount,
        net_amount: order.net_amount,
        purchased_at: order.completed_at || order.created_at,
        is_duplicate: false
      }

      if (listing.listing_kind === 'item_instance') {
        const itemMeta = listing.offerItem?.meta || {}
        result.item_id = listing.offer_item_instance_id
        result.name = itemMeta.name || '未命名物品'
      } else if (listing.listing_kind === 'fungible_asset') {
        result.offer_asset_code = listing.offer_asset_code
        result.offer_amount = listing.offer_amount
        result.name = `${listing.offer_asset_code} x${listing.offer_amount}`
      }

      return result
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('[Phase 2] 购买市场挂牌商品失败', {
        error: error.message,
        buyer_id: buyerId,
        listing_id: listingId,
        business_id
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
  static async withdrawMarketProduct(userId, productId, options = {}) {
    const { transaction: externalTransaction } = options

    // 支持外部事务传入
    const transaction = externalTransaction || (await UserInventory.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      logger.info('开始撤回市场商品', {
        user_id: userId,
        product_id: productId
      })

      /**
       * 🔴 Phase 2/3：优先撤回新交易市场挂牌（market_listings）
       * - 兼容旧逻辑：如果未命中 market_listings，则回落到 UserInventory.market_status
       */
      const { MarketListing, ItemInstance } = require('../models')

      const listing = await MarketListing.findOne({
        where: {
          listing_id: productId,
          seller_user_id: userId
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (listing) {
        if (listing.status !== 'on_sale') {
          throw new Error(`挂牌状态不允许撤回：${listing.status}（只允许 on_sale）`)
        }

        // 物品挂牌：撤回时需要解锁物品实例
        if (listing.listing_kind === 'item_instance' && listing.offer_item_instance_id) {
          const itemInstance = await ItemInstance.findOne({
            where: {
              item_instance_id: listing.offer_item_instance_id,
              owner_user_id: userId
            },
            lock: transaction.LOCK.UPDATE,
            transaction
          })

          if (!itemInstance) {
            throw new Error('物品实例不存在或不属于您，无法撤回')
          }

          // 解锁物品实例（回到可用）
          await itemInstance.update(
            {
              status: 'available',
              locked_by_order_id: null,
              locked_at: null
            },
            { transaction }
          )
        }

        await listing.update(
          {
            status: 'withdrawn',
            locked_by_order_id: null,
            locked_at: null
          },
          { transaction }
        )

        if (shouldCommit) {
          await transaction.commit()
        }

        logger.info('撤回市场挂牌成功（market_listings）', {
          user_id: userId,
          listing_id: listing.listing_id,
          listing_kind: listing.listing_kind
        })

        return {
          listing_id: listing.listing_id,
          status: listing.status,
          withdrawn: true
        }
      }

      // ====== 兼容旧逻辑：UserInventory.market_status ======
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
  static async checkListingStatus(userId, options = {}) {
    const { transaction = null } = options

    try {
      logger.info('开始检查上架状态', {
        user_id: userId
      })

      const { MarketListing } = require('../models')

      // ✅ 迁移已完成（2025-12-17截止），仅统计 market_listings
      const onSaleCount = await MarketListing.count({
        where: {
          seller_user_id: userId,
          status: 'on_sale'
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
  static async _checkViewPermission(viewerId, targetUserId) {
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
  static _processInventoryData(inventory) {
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
  static _getStatusDescription(status) {
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
  static _getDefaultIcon(type) {
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
  static async getUserListingStats(options = {}) {
    const { page = 1, limit = 20, filter = 'all', max_listings = 10 } = options

    try {
      logger.info('查询用户上架统计', { page, limit, filter, max_listings })

      const offset = (page - 1) * limit

      /**
       * Phase 2/3：按 market_listings 统计（新交易市场）
       * - 同时兼容旧数据（UserInventory.market_status）作为补充
       */
      const { MarketListing } = require('../models')

      const [marketStats, legacyStats] = await Promise.all([
        MarketListing.findAll({
          attributes: [
            'seller_user_id',
            [sequelize.fn('COUNT', sequelize.col('listing_id')), 'active_listings']
          ],
          where: { status: 'on_sale' },
          group: ['seller_user_id'],
          raw: true
        }),
        UserInventory.findAll({
          attributes: [
            'user_id',
            [
              UserInventory.sequelize.fn('COUNT', UserInventory.sequelize.col('inventory_id')),
              'active_listings'
            ]
          ],
          where: { market_status: 'on_sale' },
          group: ['user_id'],
          raw: true
        }).catch(() => [])
      ])

      // 拉取用户信息（避免 GROUP BY + include 在部分SQL模式下出错）
      const userIds = new Set()
      for (const row of marketStats) userIds.add(Number(row.seller_user_id))
      for (const row of legacyStats) userIds.add(Number(row.user_id))

      const users = userIds.size
        ? await User.findAll({
            where: { user_id: Array.from(userIds) },
            attributes: ['user_id', 'nickname', 'mobile', 'created_at'],
            raw: true
          })
        : []

      const userMap = new Map(users.map(u => [Number(u.user_id), u]))

      // 合并两份统计（按 user_id/seller_user_id 聚合）
      const merged = new Map()

      for (const row of marketStats) {
        const userId = Number(row.seller_user_id)
        const u = userMap.get(userId) || {}
        merged.set(userId, {
          user_id: userId,
          nickname: u.nickname,
          mobile: u.mobile,
          registered_at: u.created_at,
          active_listings: Number(row.active_listings || 0)
        })
      }

      for (const row of legacyStats) {
        const userId = Number(row.user_id)
        const u = userMap.get(userId) || {}
        const existing = merged.get(userId)
        const legacyCount = Number(row.active_listings || 0)
        if (existing) {
          existing.active_listings += legacyCount
        } else {
          merged.set(userId, {
            user_id: userId,
            nickname: u.nickname,
            mobile: u.mobile,
            registered_at: u.created_at,
            active_listings: legacyCount
          })
        }
      }

      const stats = Array.from(merged.values()).sort(
        (a, b) => b.active_listings - a.active_listings
      )

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
          nickname: item.nickname,
          mobile: item.mobile,
          active_listings: activeListings,
          limit: max_listings,
          remaining: max_listings - activeListings,
          percentage: Math.round((activeListings / max_listings) * 100),
          status,
          registered_at: item.registered_at
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
  static async validateProductForExchange(productId, space, quantity, options = {}) {
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
  static async deductProductStock(productId, space, quantity, options = {}) {
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

  /**
   * 挂牌可叠加资产到交易市场（Fungible Asset Listing）
   *
   * Phase 3 - P3-4：实现可叠加资产挂牌功能（冻结卖家标的）
   *
   * 业务场景：
   * - 用户将余额型资产（如 red_shard、DIAMOND）挂牌出售
   * - 挂牌时冻结卖家标的资产（防止重复出售）
   * - 创建 market_listings 记录
   *
   * 硬约束（来自文档）：
   * - **冻结强制**：listing_kind=fungible_asset 时必须冻结卖家标的
   * - **DIAMOND定价**：price_asset_code 只允许 DIAMOND
   * - **幂等键**：business_id 由调用方提供（如 listing_freeze_seller_offer_${user_id}_${timestamp}）
   *
   * @param {number} userId - 卖家用户ID
   * @param {Object} listingInfo - 挂牌信息
   * @param {string} listingInfo.business_id - 幂等键（挂牌冻结业务ID）
   * @param {string} listingInfo.offer_asset_code - 标的资产代码（如 red_shard）
   * @param {number} listingInfo.offer_amount - 标的资产数量
   * @param {number} listingInfo.price_amount - 售价（DIAMOND）
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 外部事务
   * @returns {Promise<Object>} 挂牌记录
   */
  static async listFungibleAssetToMarket(userId, listingInfo, options = {}) {
    const { transaction: externalTransaction } = options
    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      const { business_id, offer_asset_code, offer_amount, price_amount } = listingInfo

      // 1. 参数验证
      if (!business_id) {
        throw new Error('缺少必填参数：business_id（幂等键）')
      }
      if (!offer_asset_code) {
        throw new Error('缺少必填参数：offer_asset_code（标的资产代码）')
      }
      if (!offer_amount || offer_amount <= 0) {
        throw new Error('标的资产数量必须大于0')
      }
      if (!price_amount || price_amount <= 0) {
        throw new Error('售价必须大于0（DIAMOND）')
      }

      logger.info('开始挂牌可叠加资产到市场', {
        user_id: userId,
        business_id,
        offer_asset_code,
        offer_amount,
        price_amount
      })

      // 1.1 幂等性检查（优先返回已有挂牌，避免重复冻结+重复插入）
      const { MarketListing } = require('../models')
      const existingListing = await MarketListing.findOne({
        where: { business_id },
        transaction
      })

      if (existingListing) {
        const isParamsMatch =
          existingListing.listing_kind === 'fungible_asset' &&
          Number(existingListing.seller_user_id) === Number(userId) &&
          existingListing.offer_asset_code === offer_asset_code &&
          Number(existingListing.offer_amount) === Number(offer_amount) &&
          Number(existingListing.price_amount) === Number(price_amount) &&
          existingListing.price_asset_code === 'DIAMOND'

        if (!isParamsMatch) {
          const conflictError = new Error(
            `幂等键冲突：business_id="${business_id}" 已用于不同参数的挂牌操作。`
          )
          conflictError.statusCode = 409
          conflictError.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
          throw conflictError
        }

        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          is_duplicate: true,
          listing_id: existingListing.listing_id,
          listing_kind: existingListing.listing_kind,
          offer_asset_code: existingListing.offer_asset_code,
          offer_amount: Number(existingListing.offer_amount),
          price_amount: Number(existingListing.price_amount),
          status: existingListing.status,
          seller_offer_frozen: existingListing.seller_offer_frozen
        }
      }

      // 2. 冻结卖家标的资产
      const AssetService = require('./AssetService')
      const freezeResult = await AssetService.freeze(
        {
          business_id,
          business_type: 'listing_freeze_seller_offer',
          user_id: userId,
          asset_code: offer_asset_code,
          amount: offer_amount,
          meta: {
            listing_action: 'create',
            offer_asset_code,
            offer_amount,
            price_amount,
            price_asset_code: 'DIAMOND'
          }
        },
        { transaction }
      )

      logger.info('卖家标的资产已冻结', {
        user_id: userId,
        asset_code: offer_asset_code,
        frozen_amount: offer_amount,
        freeze_result: freezeResult
      })

      // 3. 创建 market_listings 记录（🔴 P1-1 修复：添加 business_id 幂等保证）
      const listing = await MarketListing.create(
        {
          listing_id: null, // 自增
          listing_kind: 'fungible_asset',
          seller_user_id: userId,
          business_id, // 🔴 P1-1 修复：填充 business_id（幂等键）
          offer_item_instance_id: null, // 可叠加资产不需要
          offer_asset_code,
          offer_amount,
          price_asset_code: 'DIAMOND',
          price_amount,
          seller_offer_frozen: true, // 强制为 true
          status: 'on_sale',
          locked_by_order_id: null,
          locked_at: null,
          created_at: BeijingTimeHelper.createBeijingTime(),
          updated_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      logger.info('market_listings 记录已创建', {
        listing_id: listing.listing_id,
        listing_kind: 'fungible_asset',
        seller_user_id: userId,
        offer_asset_code,
        offer_amount
      })

      // 4. 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      return {
        listing_id: listing.listing_id,
        listing_kind: listing.listing_kind,
        offer_asset_code: listing.offer_asset_code,
        offer_amount: listing.offer_amount,
        price_amount: listing.price_amount,
        status: listing.status,
        seller_offer_frozen: listing.seller_offer_frozen
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }

      logger.error('挂牌可叠加资产失败', {
        user_id: userId,
        listing_info: listingInfo,
        error: error.message
      })

      throw error
    }
  }

  /**
   * 撤回可叠加资产挂牌（Withdraw Fungible Asset Listing）
   *
   * Phase 3 - P3-5：实现可叠加资产撤单功能（解冻卖家标的）
   *
   * 业务场景：
   * - 卖家撤回挂牌，解冻标的资产
   * - 只允许 status=on_sale 的挂牌撤回
   *
   * 硬约束（来自文档）：
   * - **状态校验**：只允许 on_sale → withdrawn
   * - **解冻强制**：必须解冻卖家标的资产
   * - **幂等键**：business_id 由调用方提供
   *
   * @param {number} userId - 卖家用户ID
   * @param {number} listingId - 挂牌ID
   * @param {Object} withdrawInfo - 撤回信息
   * @param {string} withdrawInfo.business_id - 幂等键（挂牌解冻业务ID）
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 外部事务
   * @returns {Promise<Object>} 撤回结果
   */
  static async withdrawFungibleAssetListing(userId, listingId, withdrawInfo, options = {}) {
    const { transaction: externalTransaction } = options
    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      const { business_id } = withdrawInfo

      // 1. 参数验证
      if (!business_id) {
        throw new Error('缺少必填参数：business_id（幂等键）')
      }

      logger.info('开始撤回可叠加资产挂牌', {
        user_id: userId,
        listing_id: listingId,
        business_id
      })

      // 2. 查询挂牌记录（加锁）
      const { MarketListing } = require('../models')
      const listing = await MarketListing.findOne({
        where: {
          listing_id: listingId,
          seller_user_id: userId,
          listing_kind: 'fungible_asset'
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!listing) {
        throw new Error('挂牌不存在或无权撤回')
      }

      // 3. 状态校验
      if (listing.status !== 'on_sale') {
        // 幂等：如果已撤回，直接返回成功
        if (listing.status === 'withdrawn') {
          if (shouldCommit) {
            await transaction.commit()
          }
          return {
            listing_id: listing.listing_id,
            status: listing.status,
            withdrawn: true,
            is_duplicate: true
          }
        }

        throw new Error(`挂牌状态不允许撤回：${listing.status}（只允许 on_sale）`)
      }

      // 4. 解冻卖家标的资产
      const AssetService = require('./AssetService')
      const unfreezeResult = await AssetService.unfreeze(
        {
          business_id,
          business_type: 'listing_unfreeze_seller_offer',
          user_id: userId,
          asset_code: listing.offer_asset_code,
          amount: listing.offer_amount,
          meta: {
            listing_action: 'withdraw',
            listing_id: listingId,
            offer_asset_code: listing.offer_asset_code,
            offer_amount: listing.offer_amount
          }
        },
        { transaction }
      )

      logger.info('卖家标的资产已解冻', {
        user_id: userId,
        asset_code: listing.offer_asset_code,
        unfrozen_amount: listing.offer_amount,
        unfreeze_result: unfreezeResult
      })

      // 5. 更新挂牌状态
      await listing.update(
        {
          status: 'withdrawn',
          updated_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      logger.info('挂牌已撤回', {
        listing_id: listingId,
        status: 'withdrawn'
      })

      // 6. 提交事务
      if (shouldCommit) {
        await transaction.commit()
      }

      return {
        listing_id: listing.listing_id,
        status: listing.status,
        withdrawn: true
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }

      logger.error('撤回可叠加资产挂牌失败', {
        user_id: userId,
        listing_id: listingId,
        withdraw_info: withdrawInfo,
        error: error.message
      })

      throw error
    }
  }
}

module.exports = InventoryService
