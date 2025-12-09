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
const { UserInventory, TradeRecord, User } = require('../models')
const { Op } = require('sequelize')
const DataSanitizer = require('./DataSanitizer')
const Logger = require('./UnifiedLotteryEngine/utils/Logger')
const { getUserRoles } = require('../middleware/auth')

const logger = new Logger('InventoryService')

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

      // 2. 构建查询条件
      const whereConditions = { user_id: userId }
      if (status) whereConditions.status = status
      if (type) whereConditions.type = type

      // 3. 分页参数验证（确保范围1-50，默认20）
      const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50)
      const offset = (page - 1) * finalLimit

      // 4. 查询数据
      const { count, rows: inventory } = await UserInventory.findAndCountAll({
        where: whereConditions,
        attributes: [
          'inventory_id',
          'name',
          'description',
          'icon',
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
          'transfer_count',
          'last_transfer_at',
          'last_transfer_from',
          'created_at',
          'updated_at'
        ],
        order: [['acquired_at', 'DESC']],
        limit: finalLimit,
        offset,
        transaction
      })

      // 5. 数据处理（添加业务字段）
      const processedInventory = this._processInventoryData(inventory)

      // 6. 数据脱敏（根据权限级别）
      const userRoles = await getUserRoles(viewerId)
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

      // 1. 查询物品（包含用户关联）
      const item = await UserInventory.findOne({
        where: { inventory_id: itemId },
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
      const userRoles = await getUserRoles(viewerId)
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
    const transaction = externalTransaction || await UserInventory.sequelize.transaction()
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

    // 支持外部事务传入
    const transaction = externalTransaction || await UserInventory.sequelize.transaction()
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
    const transaction = externalTransaction || await UserInventory.sequelize.transaction()
    const shouldCommit = !externalTransaction

    try {
      logger.info('开始核销验证', {
        merchant_id: merchantId,
        verification_code: verificationCode
      })

      // 1. 根据核销码查询物品（加行级锁）
      const item = await UserInventory.findOne({
        where: {
          verification_code: verificationCode,
          status: 'available'
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item) {
        throw new Error('核销码无效或物品已使用')
      }

      // 2. 验证码有效性检查（未过期）
      if (item.verification_expires_at && new Date() > new Date(item.verification_expires_at)) {
        throw new Error('核销码已过期')
      }

      // 3. 更新物品状态
      await item.update(
        {
          status: 'used',
          used_at: BeijingTimeHelper.createBeijingTime(),
          operator_id: merchantId
        },
        { transaction }
      )

      // 4. 提交事务
      if (shouldCommit) {
        await transaction.commit()
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
          attributes: [
            'type',
            'icon',
            [UserInventory.sequelize.fn('COUNT', '*'), 'count']
          ],
          group: ['type', 'icon'],
          transaction
        }),

        // 查询8：查询最近获得的10个物品
        UserInventory.findAll({
          attributes: ['inventory_id', 'name', 'type', 'icon', 'status', 'created_at'],
          order: [['created_at', 'DESC']],
          limit: 10,
          transaction
        })
      ])

      // 计算多维度使用率指标
      const activeUsageRate = totalItems > 0 ? ((usedItems / totalItems) * 100).toFixed(2) : 0
      const consumptionRate = totalItems > 0 ? (((usedItems + expiredItems) / totalItems) * 100).toFixed(2) : 0
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
          whereConditions[Op.or] = [
            { from_user_id: userId },
            { to_user_id: userId }
          ]
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
            whereConditions[Op.or] = [
              { from_user_id: userId },
              { to_user_id: userId }
            ]
          }
        } else {
          // 管理员查看自己的转让历史
          if (direction === 'sent') {
            whereConditions.from_user_id = userId
          } else if (direction === 'received') {
            whereConditions.to_user_id = userId
          } else {
            whereConditions[Op.or] = [
              { from_user_id: userId },
              { to_user_id: userId }
            ]
          }
        }
      }

      // 分页参数
      const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50)
      const offset = (page - 1) * finalLimit

      // 查询数据
      const { count, rows: records } = await TradeRecord.findAndCountAll({
        where: whereConditions,
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
}

module.exports = InventoryService
