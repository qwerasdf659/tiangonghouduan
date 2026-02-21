/**
 * 餐厅积分抽奖系统 V4.2 - 背包服务（BackpackService）
 *
 * 职责：
 * - 背包双轨架构查询服务
 * - 统一返回 assets[] (可叠加资产) 和 items[] (不可叠加物品)
 *
 * 双轨设计：
 * 1. assets（可叠加资产）：
 *    - 来源：account_asset_balances 表（账本资产）
 *    - 包含：材料、碎片、积分等可累加的虚拟资产
 *    - 服务：BalanceService
 * 2. items（不可叠加物品）：
 *    - 来源：item_instances 表（物品实例）
 *    - 包含：优惠券、实物商品等唯一物品
 *    - 关联：redemption_orders 表（核销码）
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const { ItemInstance, MaterialAssetType, SystemConfig, sequelize } = require('../models')
// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService（2026-01-31）
const BalanceService = require('./asset/BalanceService')
const { attachDisplayNames } = require('../utils/displayNameHelper')

const logger = require('../utils/logger').logger

/**
 * allowed_actions 配置缓存
 * 避免每次请求都查询 system_configs，TTL 5 分钟
 */
const _actionRulesCacheHolder = { value: null, time: 0 }
const ACTION_RULES_CACHE_TTL = 5 * 60 * 1000

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
   *       total_amount: 100,
   *       frozen_amount: 10,
   *       available_amount: 90
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

      /**
       * 权限检查（用户只能查看自己的背包，除非是管理员）
       *
       * 设计说明：
       * - 当前版本：允许查看（管理员权限检查在路由层通过 requireRoleLevel(100) 中间件完成）
       * - 如需在Service层做额外检查，可注入auth模块的getUserRoles方法
       */
      if (viewer_user_id && viewer_user_id !== user_id) {
        // 管理员权限已在路由层验证，此处无需重复检查
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
      /*
       * 1. 查询所有资产余额（包括冻结余额）
       * BalanceService.getAllBalances 返回 AccountAssetBalance 模型实例数组
       * 字段：available_amount（可用余额）、frozen_amount（冻结余额）
       */
      const assetAccounts = await BalanceService.getAllBalances(
        { user_id },
        {
          transaction
        }
      )

      /*
       * 2. 过滤总余额 > 0 的资产 + 排除系统内部资产类型
       * 总余额 = available_amount + frozen_amount
       * BUDGET_POINTS 是系统内部资产（活动预算积分），绝对不暴露给前端
       * is_enabled=false 的资产类型也不暴露给前端（如 POINTS 已禁用）
       */
      const validAssets = assetAccounts.filter(
        account =>
          account.available_amount + account.frozen_amount > 0 &&
          account.asset_code !== 'BUDGET_POINTS'
      )

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

      /*
       * 3. 格式化资产数据（从 Map 中读取，避免重复查询）
       * - 过滤掉 is_enabled=false 的资产类型（如 POINTS 已禁用，不展示给前端）
       * - 字段命名与数据库 account_asset_balances 表一致（available_amount / frozen_amount）
       * - BIGINT 类型需要显式转换为数字类型，避免字符串拼接问题
       * - is_tradable 字段从 material_asset_types 表获取，用于前端控制"上架到市场"按钮显示
       */
      const formattedAssets = validAssets
        .filter(account => {
          const assetType = assetTypeMap.get(account.asset_code)
          // 已配置且明确禁用的资产类型不展示（未配置的保留，避免遗漏新资产）
          return !assetType || assetType.is_enabled !== false
        })
        .map(account => {
          const assetType = assetTypeMap.get(account.asset_code)
          const availableAmount = Number(account.available_amount) || 0
          const frozenAmount = Number(account.frozen_amount) || 0
          const totalAmount = availableAmount + frozenAmount

          return {
            asset_code: account.asset_code,
            display_name: assetType?.display_name || account.asset_code,
            total_amount: totalAmount, // 总余额（可用 + 冻结）
            frozen_amount: frozenAmount, // 冻结余额
            available_amount: availableAmount, // 可用余额
            category: assetType?.group_code || 'unknown', // MaterialAssetType 实际字段为 group_code
            rarity: assetType?.rarity || 'common',
            is_tradable: assetType?.is_tradable ?? false // 是否可在C2C市场交易（未配置默认不可交易）
          }
        })

      /*
       * 4. 附加中文显示名称
       * 使用 displayNameHelper 从系统字典获取 rarity 的中文显示名称
       */
      const assetsWithDisplayNames = await attachDisplayNames(formattedAssets, [
        { field: 'rarity', dictType: 'rarity' }
      ])

      return assetsWithDisplayNames
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
       * 1. 查询用户的所有物品实例（只返回 available 状态）
       * 背包双轨架构要求：只返回可用的物品，排除locked（交易中）、used、expired等状态
       *
       * 业务理由：
       * - locked状态：物品正在交易/核销流程中，用户暂时不可使用，不应显示在背包
       * - available状态：物品可正常使用、转让、核销，应显示在背包
       */
      const instances = await ItemInstance.findAll({
        where: {
          owner_user_id: user_id,
          status: 'available' // 只查询 available 状态（可用物品）
        },
        order: [['created_at', 'DESC']], // 使用 created_at 替代 acquired_at
        transaction
      })

      // 2. 格式化物品数据（物品名称从 meta.name 获取）
      const formattedItems = instances.map(instance => {
        return {
          item_instance_id: instance.item_instance_id,
          item_type: instance.item_type || 'unknown',
          name: instance.meta?.name || '未命名物品',
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

      /*
       * 4. 附加 allowed_actions（按 item_type 从 system_configs 读取配置）
       * 支持模板级覆盖：item_templates.meta.allowed_actions
       * 缓存 5 分钟避免频繁查库
       */
      const now = Date.now()
      if (
        !_actionRulesCacheHolder.value ||
        now - _actionRulesCacheHolder.time > ACTION_RULES_CACHE_TTL
      ) {
        _actionRulesCacheHolder.value = await SystemConfig.getValue('item_type_action_rules', {}) // eslint-disable-line require-atomic-updates
        _actionRulesCacheHolder.time = Date.now() // eslint-disable-line require-atomic-updates
      }

      const actionRules = _actionRulesCacheHolder.value
      formattedItems.forEach(item => {
        item.allowed_actions = actionRules[item.item_type] || []
      })

      /*
       * 5. 附加中文显示名称
       * 使用 displayNameHelper 从系统字典获取以下字段的中文显示名称：
       * - status → item_status 字典类型
       * - item_type → item_type 字典类型
       * - rarity → rarity 字典类型
       */
      const itemsWithDisplayNames = await attachDisplayNames(formattedItems, [
        { field: 'status', dictType: 'item_status' },
        { field: 'item_type', dictType: 'item_type' },
        { field: 'rarity', dictType: 'rarity' }
      ])

      return itemsWithDisplayNames
    } catch (error) {
      logger.error('查询不可叠加物品失败', {
        error: error.message,
        user_id
      })
      throw error
    }
  }

  /**
   * 获取物品详情
   *
   * 业务场景：
   * - 用户查看库存物品的详细信息
   * - 管理员查看任意物品的详情（需要权限检查）
   *
   * @param {number} item_instance_id - 物品实例ID
   * @param {Object} [options] - 选项
   * @param {number} [options.viewer_user_id] - 查看者用户ID（用于权限检查）
   * @param {boolean} [options.has_admin_access] - 是否具有管理员访问权限（role_level >= 100）
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Object|null>} 物品详情对象，不存在返回 null
   *
   * 返回数据结构：
   * {
   *   item_instance_id: 123,
   *   item_type: '优惠券',
   *   name: '10元代金券',    // 2026-01-20 统一使用 name（从 meta.name 获取）
   *   status: 'available',
   *   rarity: 'common',
   *   description: '满100元可用',
   *   acquired_at: '2025-12-17T10:00:00+08:00',
   *   expires_at: null,
   *   is_owner: true,
   *   has_redemption_code: false
   * }
   *
   * @throws {Error} FORBIDDEN - 无权查看此物品
   */
  static async getItemDetail(item_instance_id, options = {}) {
    const { viewer_user_id, has_admin_access = false, transaction = null } = options

    try {
      logger.info('获取物品详情', {
        item_instance_id,
        viewer_user_id,
        has_admin_access
      })

      // 1. 查询物品实例
      const item = await ItemInstance.findOne({
        where: { item_instance_id },
        transaction
      })

      if (!item) {
        logger.info('物品不存在', { item_instance_id })
        return null
      }

      // 2. 权限检查：普通用户只能查看自己的物品
      if (!has_admin_access && viewer_user_id && item.owner_user_id !== viewer_user_id) {
        const error = new Error('无权查看此物品')
        error.code = 'FORBIDDEN'
        throw error
      }

      // 3. 查询是否有核销码（仅查询待核销的订单）
      const { RedemptionOrder } = require('../models')
      const redemptionOrder = await RedemptionOrder.findOne({
        where: {
          item_instance_id,
          status: 'pending'
        },
        attributes: ['redemption_order_id'],
        transaction
      })

      // 4. 附加 allowed_actions（复用缓存）
      const detailNow = Date.now()
      if (
        !_actionRulesCacheHolder.value ||
        detailNow - _actionRulesCacheHolder.time > ACTION_RULES_CACHE_TTL
      ) {
        _actionRulesCacheHolder.value = await SystemConfig.getValue('item_type_action_rules', {}) // eslint-disable-line require-atomic-updates
        _actionRulesCacheHolder.time = Date.now() // eslint-disable-line require-atomic-updates
      }
      const detailActionRules = _actionRulesCacheHolder.value
      const itemType = item.item_type || 'unknown'

      // 5. 格式化返回数据（name 从 meta.name 获取）
      const itemDetail = {
        item_instance_id: item.item_instance_id,
        item_type: itemType,
        name: item.meta?.name || '未命名物品',
        status: item.status,
        rarity: item.meta?.rarity || 'common',
        description: item.meta?.description || '',
        acquired_at: item.created_at,
        expires_at: item.meta?.expires_at || null,
        is_owner: viewer_user_id ? item.owner_user_id === viewer_user_id : null,
        has_redemption_code: !!redemptionOrder,
        allowed_actions: detailActionRules[itemType] || []
      }

      /*
       * 5. 附加中文显示名称
       * 使用 displayNameHelper 从系统字典获取以下字段的中文显示名称：
       * - status → item_status 字典类型
       * - item_type → item_type 字典类型
       * - rarity → rarity 字典类型
       */
      const detailWithDisplayNames = await attachDisplayNames(itemDetail, [
        { field: 'status', dictType: 'item_status' },
        { field: 'item_type', dictType: 'item_type' },
        { field: 'rarity', dictType: 'rarity' }
      ])

      logger.info('获取物品详情成功', {
        item_instance_id,
        status: item.status,
        has_redemption_code: detailWithDisplayNames.has_redemption_code
      })

      return detailWithDisplayNames
    } catch (error) {
      logger.error('获取物品详情失败', {
        error: error.message,
        item_instance_id
      })
      throw error
    }
  }

  /**
   * 获取背包统计信息
   *
   * 业务场景：
   * - 前端背包页面顶部统计面板展示
   * - 包含资产种类数、物品数量、资产总价值、按物品类型分组统计
   *
   * @param {number} user_id - 用户ID
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Object>} 统计信息
   * {
   *   total_assets: 5,                          // 可叠加资产种类数量
   *   total_items: 10,                           // 不可叠加物品数量（available 状态）
   *   total_asset_value: 1000,                   // 资产可用余额总和
   *   items_by_type: { voucher: 3, product: 7 }  // 按物品类型分组计数
   * }
   */
  static async getBackpackStats(user_id, options = {}) {
    const { transaction = null } = options

    try {
      const [assets, items] = await Promise.all([
        BackpackService._getAssets(user_id, { transaction }),
        BackpackService._getItems(user_id, { transaction })
      ])

      /*
       * 按物品类型分组统计（items_by_type）
       * 遍历 items 数组，按 item_type 字段聚合计数
       * 前端可据此展示分类统计面板（如：优惠券 3 张、实物商品 7 件）
       */
      const items_by_type = items.reduce((groups, item) => {
        const type = item.item_type || 'unknown'
        groups[type] = (groups[type] || 0) + 1
        return groups
      }, {})

      return {
        total_assets: assets.length,
        total_items: items.length,
        total_asset_value: assets.reduce((sum, asset) => sum + (asset.available_amount || 0), 0),
        items_by_type
      }
    } catch (error) {
      logger.error('获取背包统计失败', {
        error: error.message,
        user_id
      })
      throw error
    }
  }

  /**
   * 获取物品使用后的操作指引文案
   * 优先级：模板级 meta.use_instructions > item_type 级配置 > null
   * @param {Object} itemInstance - 已使用的 ItemInstance 模型实例
   * @returns {Promise<string|null>} 操作指引文案
   */
  static async getUseInstructions(itemInstance) {
    if (!itemInstance) return null

    const { SystemConfig, ItemTemplate } = require('../models')

    const instructionsConfig = await SystemConfig.getValue('backpack_use_instructions', {})
    const itemType = itemInstance.item_type

    if (itemInstance.item_template_id) {
      const template = await ItemTemplate.findByPk(itemInstance.item_template_id, {
        attributes: ['meta']
      })
      if (template?.meta?.use_instructions) {
        return template.meta.use_instructions
      }
    }

    if (itemType) {
      return instructionsConfig[itemType] || null
    }

    return null
  }
}

module.exports = BackpackService
