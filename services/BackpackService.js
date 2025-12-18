/**
 * 餐厅积分抽奖系统 V4.2 - 背包服务（BackpackService）
 *
 * 职责：
 * - 背包双轨架构查询服务
 * - 统一返回 assets[] (可叠加资产) 和 items[] (不可叠加物品)
 * - 替代 InventoryService.getUserInventory 的单轨查询
 *
 * 双轨设计：
 * 1. assets（可叠加资产）：
 *    - 来源：account_asset_balances 表（账本资产）
 *    - 包含：材料、碎片、积分等可累加的虚拟资产
 *    - 服务：AssetService
 * 2. items（不可叠加物品）：
 *    - 来源：item_instances 表（物品实例）
 *    - 包含：优惠券、实物商品等唯一物品
 *    - 关联：redemption_orders 表（核销码）
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const { ItemInstance, MaterialAssetType, sequelize } = require('../models')
const AssetService = require('./AssetService')
const Logger = require('./UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('BackpackService')

/**
 * 背包服务类
 *
 * @class BackpackService
 * @description 背包双轨架构查询服务，统一返回 assets[] 和 items[]
 */
class BackpackService {
  /**
   * 获取用户背包（双轨统一查询）
   *
   * 业务场景：
   * - 用户查看自己的背包
   * - 管理员查看指定用户的背包
   *
   * 返回数据结构：
   * {
   *   assets: [      // 可叠加资产
   *     {
   *       asset_code: 'MATERIAL_001',
   *       display_name: '蓝色碎片',
   *       balance: 100,
   *       frozen_balance: 10,
   *       available_balance: 90
   *     }
   *   ],
   *   items: [       // 不可叠加物品
   *     {
   *       item_instance_id: 123,
   *       item_type: '优惠券',
   *       status: 'available',
   *       has_redemption_code: true,
   *       acquired_at: '2025-12-17T10:00:00+08:00'
   *     }
   *   ]
   * }
   *
   * @param {number} user_id - 用户ID
   * @param {Object} [options] - 选项
   * @param {number} [options.viewer_user_id] - 查看者ID（用于权限检查）
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Object>} {assets, items}
   */
  static async getUserBackpack(user_id, options = {}) {
    const { viewer_user_id, transaction = null } = options

    try {
      logger.info('开始获取用户背包', {
        user_id,
        viewer_user_id
      })

      // 1. 权限检查（用户只能查看自己的背包，除非是管理员）
      if (viewer_user_id && viewer_user_id !== user_id) {
        /*
         * TODO: 检查 viewer_user_id 是否为管理员
         * 这里暂时允许查看，实际应该检查管理员权限
         */
      }

      // 2. 并行查询 assets 和 items
      const [assets, items] = await Promise.all([
        BackpackService._getAssets(user_id, { transaction }),
        BackpackService._getItems(user_id, { transaction })
      ])

      logger.info('获取用户背包成功', {
        user_id,
        assets_count: assets.length,
        items_count: items.length
      })

      return { assets, items }
    } catch (error) {
      logger.error('获取用户背包失败', {
        error: error.message,
        user_id
      })
      throw error
    }
  }

  /**
   * 查询可叠加资产（内部方法）
   *
   * 业务规则：
   * - 查询 account_asset_balances 表
   * - 过滤 balance > 0 的资产
   * - 包含冻结余额信息
   * - 关联 material_asset_types 表获取显示名称
   *
   * @private
   * @param {number} user_id - 用户ID
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Array>} 资产列表
   */
  static async _getAssets(user_id, options = {}) {
    const { transaction = null } = options

    try {
      // 1. 查询所有资产余额（包括冻结余额）
      const assetAccounts = await AssetService.getAllBalances(
        { user_id },
        {
          transaction
        }
      )

      // 2. 过滤余额 > 0 的资产
      const validAssets = assetAccounts.filter(account => account.balance > 0)

      // ✅ 修复N+1查询问题：批量查询所有资产类型信息
      if (validAssets.length === 0) {
        return []
      }

      const asset_codes = [...new Set(validAssets.map(account => account.asset_code))]

      // 一次性查询所有需要的资产类型信息
      const assetTypes = await MaterialAssetType.findAll({
        where: {
          asset_code: {
            [sequelize.Sequelize.Op.in]: asset_codes
          }
        },
        transaction
      })

      // 建立 asset_code -> assetType 的映射
      const assetTypeMap = new Map()
      assetTypes.forEach(assetType => {
        assetTypeMap.set(assetType.asset_code, assetType)
      })

      // 3. 格式化资产数据（从 Map 中读取，避免重复查询）
      const formattedAssets = validAssets.map(account => {
        const assetType = assetTypeMap.get(account.asset_code)

        return {
          asset_code: account.asset_code,
          display_name: assetType?.display_name || account.asset_code,
          balance: account.balance,
          frozen_balance: account.frozen_balance,
          available_balance: account.available_balance,
          category: assetType?.category || 'unknown',
          rarity: assetType?.rarity || 'common'
        }
      })

      return formattedAssets
    } catch (error) {
      logger.error('查询可叠加资产失败', {
        error: error.message,
        user_id
      })
      throw error
    }
  }

  /**
   * 查询不可叠加物品（内部方法）
   *
   * 业务规则：
   * - 查询 item_instances 表
   * - 只返回 available 状态的物品
   * - 检查是否有核销码（查询 redemption_orders）
   *
   * @private
   * @param {number} user_id - 用户ID
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Array>} 物品列表
   */
  static async _getItems(user_id, options = {}) {
    const { transaction = null } = options

    try {
      /*
       * 1. 查询用户的所有物品实例（只返回 available 和 locked 状态）
       * 背包双轨架构要求：只返回可见的物品，排除已使用、已过期、已转移等终态
       */
      const instances = await ItemInstance.findAll({
        where: {
          owner_user_id: user_id,
          status: {
            [sequelize.Sequelize.Op.in]: ['available', 'locked'] // 只查询 available 和 locked 状态
          }
        },
        order: [['created_at', 'DESC']], // 使用 created_at 替代 acquired_at
        transaction
      })

      // 2. 格式化物品数据（包含核销码信息）
      const formattedItems = instances.map(instance => {
        return {
          item_instance_id: instance.item_instance_id,
          item_type: instance.item_type || 'unknown',
          item_name: instance.item_name,
          status: instance.status,
          rarity: instance.meta?.rarity || 'common',
          description: instance.meta?.description || '',
          // 核销码信息（仅标记有无，不返回具体核销码）
          has_redemption_code: false, // 需要通过 redemption_orders 表查询
          acquired_at: instance.created_at, // 使用 created_at 作为获取时间
          expires_at: instance.meta?.expires_at || null
        }
      })

      // 3. 批量查询核销码信息（判断是否有核销码）
      const { RedemptionOrder } = require('../models')
      const instanceIds = instances.map(i => i.item_instance_id)

      if (instanceIds.length > 0) {
        const redemptionOrders = await RedemptionOrder.findAll({
          where: {
            item_instance_id: instanceIds,
            status: 'pending' // 只查询待核销的订单
          },
          attributes: ['item_instance_id'],
          transaction
        })

        const hasCodeMap = new Map()
        redemptionOrders.forEach(order => {
          hasCodeMap.set(order.item_instance_id, true)
        })

        // 更新 has_redemption_code 字段
        formattedItems.forEach(item => {
          item.has_redemption_code = hasCodeMap.has(item.item_instance_id)
        })
      }

      return formattedItems
    } catch (error) {
      logger.error('查询不可叠加物品失败', {
        error: error.message,
        user_id
      })
      throw error
    }
  }

  /**
   * 获取背包统计信息
   *
   * @param {number} user_id - 用户ID
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Object>} 统计信息
   * {
   *   total_assets: 5,          // 资产种类数量
   *   total_items: 10,          // 物品数量
   *   total_asset_value: 1000   // 资产总价值（按类型统计）
   * }
   */
  static async getBackpackStats(user_id, options = {}) {
    const { transaction = null } = options

    try {
      const [assets, items] = await Promise.all([
        BackpackService._getAssets(user_id, { transaction }),
        BackpackService._getItems(user_id, { transaction })
      ])

      return {
        total_assets: assets.length,
        total_items: items.length,
        total_asset_value: assets.reduce((sum, asset) => sum + asset.balance, 0)
      }
    } catch (error) {
      logger.error('获取背包统计失败', {
        error: error.message,
        user_id
      })
      throw error
    }
  }
}

module.exports = BackpackService
