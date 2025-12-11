/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 管理后台市场管理服务（AdminMarketplaceService）
 *
 * 业务场景：管理员视角的兑换市场管理和统计，采用Facade模式统一整合多个底层服务
 *
 * 核心功能：
 * 1. 用户上架统计管理（查询用户上架状态、识别接近上限用户）
 * 2. 兑换商品管理（创建、更新、删除兑换商品）
 * 3. 市场统计分析（市场概览、交易统计、商品排行）
 *
 * 业务流程：
 *
 * 1. **用户上架统计流程**
 *    - 获取查询参数（分页、筛选） → 调用InventoryService.getUserListingStats → 返回统计结果
 *
 * 2. **兑换商品CRUD流程**
 *    - 验证参数 → 调用ExchangeMarketService对应方法 → 返回操作结果
 *
 * 3. **市场统计流程**
 *    - 并行查询多个统计维度 → 聚合统计数据 → 返回市场分析报告
 *
 * 设计原则：
 * - **Facade模式**：为管理员提供统一的市场管理接口，屏蔽底层服务复杂性
 * - **职责分离**：本服务只做组合编排，不实现新的业务逻辑
 * - **依赖注入**：通过ServiceManager获取底层服务，降低耦合
 * - **数据脱敏**：调用DataSanitizer确保敏感数据不泄露
 *
 * 依赖服务：
 * - InventoryService：用户库存和上架管理
 * - ExchangeMarketService：兑换市场业务逻辑
 *
 * 关键方法列表：
 * - getUserListingStats(options) - 获取用户上架统计
 * - createExchangeItem(itemData, adminId) - 创建兑换商品
 * - updateExchangeItem(itemId, updateData) - 更新兑换商品
 * - deleteExchangeItem(itemId) - 删除兑换商品
 * - getMarketStatistics(options) - 获取市场统计数据（预留扩展）
 *
 * 数据模型关联：
 * - UserInventory：用户库存表（通过InventoryService）
 * - ExchangeMarketItem：兑换商品表（通过ExchangeMarketService）
 * - ExchangeOrder：兑换订单表（通过ExchangeMarketService）
 *
 * 使用示例：
 * ```javascript
 * const serviceManager = require('./services');
 * const AdminMarketplaceService = serviceManager.getService('adminMarketplace');
 *
 * // 示例1：获取用户上架统计
 * const stats = await AdminMarketplaceService.getUserListingStats({
 *   page: 1,
 *   limit: 20,
 *   filter: 'near_limit'
 * });
 *
 * // 示例2：创建兑换商品
 * const item = await AdminMarketplaceService.createExchangeItem({
 *   item_name: '测试商品',
 *   price_type: 'virtual',
 *   virtual_value_price: 1000
 * }, adminId);
 * ```
 *
 * 创建时间：2025年12月09日
 * 使用模型：Claude Sonnet 4.5
 */

const Logger = require('./UnifiedLotteryEngine/utils/Logger')
const DataSanitizer = require('./DataSanitizer')

const logger = new Logger('AdminMarketplaceService')

/**
 * 管理后台市场管理服务类（Facade模式）
 *
 * @class AdminMarketplaceService
 */
class AdminMarketplaceService {
  /**
   * 静态依赖属性（通过initialize方法注入）
   * @private
   * @static
   */
  static _dependencies = {
    inventory: null,
    exchangeMarket: null
  }

  /**
   * 初始化Service依赖（在ServiceManager初始化时调用）
   *
   * @description
   * 在ServiceManager初始化阶段显式注入依赖的Service引用，
   * 避免在每个方法内部重复调用require和getService。
   *
   * @param {Object} serviceManager - ServiceManager实例
   * @returns {void}
   *
   * @example
   * // 在ServiceManager.initialize()中调用
   * AdminMarketplaceService.initialize(serviceManager)
   */
  static initialize (serviceManager) {
    // 🎯 直接从_services Map获取，避免触发初始化检查
    this._dependencies.inventory = serviceManager._services.get('inventory')
    this._dependencies.exchangeMarket = serviceManager._services.get('exchangeMarket')
    logger.info('AdminMarketplaceService依赖注入完成')
  }
  /**
   * 获取用户上架统计
   *
   * @description
   * 整合InventoryService的getUserListingStats方法，为管理员提供用户上架状态统计。
   * 支持分页、筛选（全部/接近上限/达到上限），返回用户详情和统计信息。
   *
   * 业务场景：
   * - 管理员查看所有用户的上架情况
   * - 识别接近上限的用户，提前干预
   * - 统计市场整体上架状态
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.limit=20] - 每页数量
   * @param {string} [options.filter='all'] - 筛选条件：all/near_limit/at_limit
   * @param {number} options.max_listings - 最大上架数量限制
   * @returns {Promise<Object>} 用户上架统计结果
   * @returns {Array} result.stats - 用户上架统计列表
   * @returns {Object} result.pagination - 分页信息
   * @returns {Object} result.summary - 总体统计摘要
   *
   * @throws {Error} 当查询失败时抛出错误
   *
   * @example
   * const stats = await AdminMarketplaceService.getUserListingStats({
   *   page: 1,
   *   limit: 20,
   *   filter: 'at_limit',
   *   max_listings: 3
   * });
   */

  static async getUserListingStats (options) {
    try {
      logger.info('管理员获取用户上架统计', {
        page: options.page,
        limit: options.limit,
        filter: options.filter
      })

      // 🎯 使用初始化时注入的依赖
      const InventoryService = this._dependencies.inventory

      // 🎯 调用底层服务方法
      const result = await InventoryService.getUserListingStats(options)

      logger.info('用户上架统计查询成功', {
        total_users: result.summary.total_users_with_listings,
        filtered_count: result.pagination.total
      })

      return result
    } catch (error) {
      logger.error('获取用户上架统计失败', {
        error: error.message,
        stack: error.stack,
        options
      })
      throw error
    }
  }

  /**
   * 创建兑换商品
   *
   * @description
   * 整合ExchangeMarketService的createExchangeItem方法，管理员创建新的兑换商品。
   * 支持虚拟价值定价和积分展示价格。
   *
   * 业务场景：
   * - 管理员上架新商品到兑换市场
   * - 设置商品价格、库存、排序
   * - 记录商品创建操作日志
   *
   * @param {Object} itemData - 商品数据
   * @param {string} itemData.item_name - 商品名称（必填，最长100字符）
   * @param {string} [itemData.item_description=''] - 商品描述（可选，最长500字符）
   * @param {string} itemData.price_type - 支付方式（必填：只支持 virtual）
   * @param {number} [itemData.virtual_value_price=0] - 虚拟价值价格（必填，实际扣除的虚拟奖品价值）
   * @param {number} [itemData.points_price=0] - 积分价格（可选，仅用于前端展示，不扣除用户显示积分）
   * @param {number} itemData.cost_price - 成本价（必填）
   * @param {number} itemData.stock - 初始库存（必填，>=0）
   * @param {number} [itemData.sort_order=100] - 排序号（必填，默认100）
   * @param {string} [itemData.status='active'] - 商品状态（必填：active/inactive）
   * @param {number} adminId - 管理员ID
   * @returns {Promise<Object>} 创建结果
   * @returns {Object} result.item - 已创建的商品对象（已脱敏）
   *
   * @throws {Error} 当参数验证失败或创建失败时抛出错误
   *
   * @example
   * const result = await AdminMarketplaceService.createExchangeItem({
   *   item_name: '虚拟商品券',
   *   price_type: 'virtual',
   *   virtual_value_price: 1000,
   *   cost_price: 800,
   *   stock: 100
   * }, adminId);
   */
  static async createExchangeItem (itemData, adminId) {
    try {
      logger.info('管理员创建兑换商品', {
        admin_id: adminId,
        item_name: itemData.item_name,
        price_type: itemData.price_type
      })

      // 🎯 使用初始化时注入的依赖
      const ExchangeMarketService = this._dependencies.exchangeMarket

      // 🎯 调用底层服务方法创建商品
      const result = await ExchangeMarketService.createExchangeItem(itemData, adminId)

      // 🎯 数据脱敏（管理端使用full模式，包含更多信息）
      const sanitizedItem = DataSanitizer.sanitizeExchangeMarketItem(result.item, 'full')

      logger.info('兑换商品创建成功', {
        admin_id: adminId,
        item_id: result.item.item_id,
        item_name: result.item.item_name
      })

      return {
        item: sanitizedItem
      }
    } catch (error) {
      logger.error('创建兑换商品失败', {
        error: error.message,
        stack: error.stack,
        admin_id: adminId,
        item_data: itemData
      })
      throw error
    }
  }

  /**
   * 更新兑换商品
   *
   * @description
   * 整合ExchangeMarketService的updateExchangeItem方法，管理员更新现有兑换商品。
   * 支持部分字段更新。
   *
   * 业务场景：
   * - 管理员修改商品信息（名称、描述、价格等）
   * - 调整商品库存
   * - 更改商品状态（上架/下架）
   *
   * @param {number} itemId - 商品ID
   * @param {Object} updateData - 更新数据（只需包含要更新的字段）
   * @param {string} [updateData.item_name] - 商品名称
   * @param {string} [updateData.item_description] - 商品描述
   * @param {string} [updateData.price_type] - 支付方式
   * @param {number} [updateData.virtual_value_price] - 虚拟价值价格
   * @param {number} [updateData.points_price] - 积分价格
   * @param {number} [updateData.cost_price] - 成本价
   * @param {number} [updateData.stock] - 库存
   * @param {number} [updateData.sort_order] - 排序号
   * @param {string} [updateData.status] - 商品状态
   * @returns {Promise<Object>} 更新结果
   * @returns {Object} result.item - 更新后的商品对象（已脱敏）
   *
   * @throws {Error} 当商品不存在或更新失败时抛出错误
   *
   * @example
   * const result = await AdminMarketplaceService.updateExchangeItem(123, {
   *   stock: 50,
   *   status: 'inactive'
   * });
   */
  static async updateExchangeItem (itemId, updateData) {
    try {
      logger.info('管理员更新兑换商品', {
        item_id: itemId,
        update_fields: Object.keys(updateData)
      })

      // 🎯 使用初始化时注入的依赖
      const ExchangeMarketService = this._dependencies.exchangeMarket

      // 🎯 调用底层服务方法更新商品
      const result = await ExchangeMarketService.updateExchangeItem(itemId, updateData)

      // 🎯 数据脱敏
      const sanitizedItem = DataSanitizer.sanitizeExchangeMarketItem(result.item, 'full')

      logger.info('兑换商品更新成功', {
        item_id: itemId,
        item_name: result.item.item_name
      })

      return {
        item: sanitizedItem
      }
    } catch (error) {
      logger.error('更新兑换商品失败', {
        error: error.message,
        stack: error.stack,
        item_id: itemId,
        update_data: updateData
      })
      throw error
    }
  }

  /**
   * 删除兑换商品
   *
   * @description
   * 整合ExchangeMarketService的deleteExchangeItem方法，管理员删除兑换商品。
   * 根据业务逻辑，如果商品有未完成订单，则只停用不删除；否则物理删除。
   *
   * 业务场景：
   * - 管理员下架过期商品
   * - 清理无订单的测试商品
   * - 停用有订单历史的商品
   *
   * @param {number} itemId - 商品ID
   * @returns {Promise<Object>} 删除结果
   * @returns {string} result.action - 操作类型：'deleted'（已删除）或 'deactivated'（已停用）
   * @returns {string} result.message - 操作结果描述
   * @returns {Object} [result.item] - 如果是停用操作，返回停用后的商品对象（已脱敏）
   *
   * @throws {Error} 当商品不存在或删除失败时抛出错误
   *
   * @example
   * const result = await AdminMarketplaceService.deleteExchangeItem(123);
   * // result.action === 'deleted' 或 'deactivated'
   */
  static async deleteExchangeItem (itemId) {
    try {
      logger.info('管理员删除兑换商品', {
        item_id: itemId
      })

      // 🎯 使用初始化时注入的依赖
      const ExchangeMarketService = this._dependencies.exchangeMarket

      // 🎯 调用底层服务方法删除商品
      const result = await ExchangeMarketService.deleteExchangeItem(itemId)

      // 🎯 如果是停用操作，对商品数据进行脱敏
      if (result.action === 'deactivated' && result.item) {
        result.item = DataSanitizer.sanitizeExchangeMarketItem(result.item, 'full')
      }

      logger.info('兑换商品删除操作完成', {
        item_id: itemId,
        action: result.action,
        message: result.message
      })

      return result
    } catch (error) {
      logger.error('删除兑换商品失败', {
        error: error.message,
        stack: error.stack,
        item_id: itemId
      })
      throw error
    }
  }

  /**
   * 获取市场统计数据（预留扩展）
   *
   * @description
   * 预留方法：整合多个统计维度，为管理员提供市场概览。
   * 未来可扩展：交易量统计、热门商品排行、用户兑换行为分析等。
   *
   * 业务场景（规划中）：
   * - 市场整体交易统计
   * - 商品销售排行榜
   * - 用户兑换行为分析
   * - 时段交易趋势分析
   *
   * @param {Object} options - 统计选项
   * @param {string} [options.period='week'] - 统计周期：day/week/month
   * @param {string} [options.granularity='daily'] - 统计粒度：hourly/daily/weekly
   * @returns {Promise<Object>} 市场统计数据
   *
   * @throws {Error} 当统计失败时抛出错误
   *
   * @example
   * const stats = await AdminMarketplaceService.getMarketStatistics({
   *   period: 'month',
   *   granularity: 'daily'
   * });
   */
  static async getMarketStatistics (options = {}) {
    try {
      logger.info('管理员获取市场统计', {
        period: options.period,
        granularity: options.granularity
      })

      // 🎯 使用初始化时注入的依赖
      const ExchangeMarketService = this._dependencies.exchangeMarket

      /**
       * 🎯 调用底层服务的统计方法（如果存在）
       * 注意：ExchangeMarketService.getMarketStatistics 需要先实现
       */
      if (typeof ExchangeMarketService.getMarketStatistics === 'function') {
        const statistics = await ExchangeMarketService.getMarketStatistics(options)
        logger.info('市场统计查询成功')
        return statistics
      }

      // 如果底层方法未实现，返回占位数据
      logger.warn('ExchangeMarketService.getMarketStatistics 方法未实现，返回占位数据')
      return {
        period: options.period || 'week',
        message: '市场统计功能规划中，敬请期待'
      }
    } catch (error) {
      logger.error('获取市场统计失败', {
        error: error.message,
        stack: error.stack,
        options
      })
      throw error
    }
  }
}

module.exports = AdminMarketplaceService
