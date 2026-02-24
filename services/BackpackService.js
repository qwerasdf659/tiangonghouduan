/**
 * 餐厅积分抽奖系统 V4.3 - 背包服务（BackpackService）
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
 *    - 来源：items 表（三表模型缓存层）
 *    - 包含：优惠券、实物商品等唯一物品
 *    - 关联：redemption_orders 表（核销码）
 *
 * 三表模型升级说明（V4.3）：
 * - ItemInstance → Item（items 表，正式列替代 meta JSON）
 * - owner_user_id → owner_account_id（统一账户体系）
 * - meta.name → item_name, meta.rarity → rarity_code, meta.description → item_description
 *
 * 创建时间：2025-12-17
 * 三表模型迁移：2026-02-22
 */

const {
  Item,
  Account,
  Merchant,
  MaterialAssetType,
  SystemConfig,
  RedemptionOrder,
  sequelize
} = require('../models')
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
   * @param {number} user_id - 用户ID
   * @param {Object} [options] - 选项
   * @param {number} [options.viewer_user_id] - 查看者ID（用于权限检查）
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Object>} {assets, items}
   */
  static async getUserBackpack(user_id, options = {}) {
    const { viewer_user_id, transaction = null } = options

    try {
      logger.info('开始获取用户背包', { user_id, viewer_user_id })

      if (viewer_user_id && viewer_user_id !== user_id) {
        // 管理员权限已在路由层验证
      }

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
      logger.error('获取用户背包失败', { error: error.message, user_id })
      throw error
    }
  }

  /**
   * 查询可叠加资产（内部方法）
   *
   * 业务规则：
   * - 查询 account_asset_balances 表
   * - 过滤 balance > 0 的资产
   * - 关联 material_asset_types 获取显示名称
   * - BUDGET_POINTS 是系统内部资产，不暴露给前端
   *
   * @private
   * @param {number} user_id - 用户ID
   * @param {Object} [options] - 选项
   * @returns {Promise<Array>} 资产列表
   */
  static async _getAssets(user_id, options = {}) {
    const { transaction = null } = options

    try {
      const assetAccounts = await BalanceService.getAllBalances({ user_id }, { transaction })

      const validAssets = assetAccounts.filter(
        account =>
          account.available_amount + account.frozen_amount > 0 &&
          account.asset_code !== 'BUDGET_POINTS'
      )

      if (validAssets.length === 0) {
        return []
      }

      const asset_codes = [...new Set(validAssets.map(account => account.asset_code))]

      const assetTypes = await MaterialAssetType.findAll({
        where: {
          asset_code: { [sequelize.Sequelize.Op.in]: asset_codes }
        },
        transaction
      })

      const assetTypeMap = new Map()
      assetTypes.forEach(assetType => {
        assetTypeMap.set(assetType.asset_code, assetType)
      })

      const formattedAssets = validAssets
        .filter(account => {
          const assetType = assetTypeMap.get(account.asset_code)
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
            total_amount: totalAmount,
            frozen_amount: frozenAmount,
            available_amount: availableAmount,
            category: assetType?.group_code || 'unknown',
            rarity: assetType?.rarity || 'common',
            is_tradable: assetType?.is_tradable ?? false
          }
        })

      const assetsWithDisplayNames = await attachDisplayNames(formattedAssets, [
        { field: 'rarity', dictType: 'rarity' }
      ])

      return assetsWithDisplayNames
    } catch (error) {
      logger.error('查询可叠加资产失败', { error: error.message, user_id })
      throw error
    }
  }

  /**
   * 查询不可叠加物品（内部方法）
   *
   * 业务规则：
   * - 通过 accounts 表将 user_id 转换为 account_id
   * - 查询 items 表（三表模型缓存层）
   * - 只返回 available 状态的物品
   * - 物品名称/稀有度/描述从正式列读取（非 JSON meta）
   *
   * @private
   * @param {number} user_id - 用户ID
   * @param {Object} [options] - 选项
   * @returns {Promise<Array>} 物品列表
   */
  static async _getItems(user_id, options = {}) {
    const { transaction = null } = options

    try {
      /* user_id → account_id 转换（统一账户体系） */
      const account = await Account.findOne({
        where: { user_id, account_type: 'user' },
        attributes: ['account_id'],
        transaction
      })

      if (!account) {
        logger.warn('用户未关联账户，返回空物品列表', { user_id })
        return []
      }

      /* 查询 items 表，只返回 available 状态，LEFT JOIN merchants 获取 merchant_name */
      const items = await Item.findAll({
        where: {
          owner_account_id: account.account_id,
          status: 'available'
        },
        include: [
          {
            model: Merchant,
            as: 'merchant',
            attributes: ['merchant_id', 'merchant_name'],
            required: false
          }
        ],
        order: [['created_at', 'DESC']],
        transaction
      })

      /* 格式化物品数据（正式列，无需解析 JSON），包含商家名称 */
      const formattedItems = items.map(item => ({
        item_id: item.item_id,
        tracking_code: item.tracking_code,
        item_type: item.item_type || 'unknown',
        item_name: item.item_name || '未命名物品',
        status: item.status,
        rarity_code: item.rarity_code || 'common',
        item_description: item.item_description || '',
        item_value: item.item_value || 0,
        source: item.source,
        merchant_id: item.merchant_id || null,
        merchant_name: item.merchant?.merchant_name || null,
        has_redemption_code: false,
        acquired_at: item.created_at,
        prize_definition_id: item.prize_definition_id
      }))

      /* 批量查询核销码信息 */
      const itemIds = items.map(i => i.item_id)

      if (itemIds.length > 0) {
        const redemptionOrders = await RedemptionOrder.findAll({
          where: {
            item_id: itemIds,
            status: 'pending'
          },
          attributes: ['item_id'],
          transaction
        })

        const hasCodeMap = new Map()
        redemptionOrders.forEach(order => {
          hasCodeMap.set(order.item_id, true)
        })

        formattedItems.forEach(item => {
          item.has_redemption_code = hasCodeMap.has(item.item_id)
        })
      }

      /* 附加 allowed_actions（按 item_type 从 system_configs 读取） */
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

      /* 附加中文显示名称 */
      const itemsWithDisplayNames = await attachDisplayNames(formattedItems, [
        { field: 'status', dictType: 'item_status' },
        { field: 'item_type', dictType: 'item_type' },
        { field: 'rarity_code', dictType: 'rarity' }
      ])

      return itemsWithDisplayNames
    } catch (error) {
      logger.error('查询不可叠加物品失败', { error: error.message, user_id })
      throw error
    }
  }

  /**
   * 获取物品详情
   *
   * @param {number} item_id - 物品ID（items 表主键）
   * @param {Object} [options] - 选项
   * @param {number} [options.viewer_user_id] - 查看者用户ID
   * @param {boolean} [options.has_admin_access] - 是否管理员
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Object|null>} 物品详情
   */
  static async getItemDetail(item_id, options = {}) {
    const { viewer_user_id, has_admin_access = false, transaction = null } = options

    try {
      logger.info('获取物品详情', { item_id, viewer_user_id, has_admin_access })

      const item = await Item.findByPk(item_id, { transaction })

      if (!item) {
        logger.info('物品不存在', { item_id })
        return null
      }

      /* 权限检查：普通用户只能查看自己的物品 */
      if (!has_admin_access && viewer_user_id) {
        const viewerAccount = await Account.findOne({
          where: { user_id: viewer_user_id, account_type: 'user' },
          attributes: ['account_id'],
          transaction
        })
        if (viewerAccount && item.owner_account_id !== viewerAccount.account_id) {
          const error = new Error('无权查看此物品')
          error.code = 'FORBIDDEN'
          throw error
        }
      }

      /* 查询是否有核销码 */
      const redemptionOrder = await RedemptionOrder.findOne({
        where: {
          item_id,
          status: 'pending'
        },
        attributes: ['redemption_order_id'],
        transaction
      })

      /* 附加 allowed_actions */
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

      const itemDetail = {
        item_id: item.item_id,
        tracking_code: item.tracking_code,
        item_type: itemType,
        item_name: item.item_name || '未命名物品',
        status: item.status,
        rarity_code: item.rarity_code || 'common',
        item_description: item.item_description || '',
        item_value: item.item_value || 0,
        source: item.source,
        source_ref_id: item.source_ref_id,
        acquired_at: item.created_at,
        is_owner: viewer_user_id
          ? await BackpackService._isOwner(item, viewer_user_id, transaction)
          : null,
        has_redemption_code: !!redemptionOrder,
        allowed_actions: detailActionRules[itemType] || [],
        prize_definition_id: item.prize_definition_id
      }

      const detailWithDisplayNames = await attachDisplayNames(itemDetail, [
        { field: 'status', dictType: 'item_status' },
        { field: 'item_type', dictType: 'item_type' },
        { field: 'rarity_code', dictType: 'rarity' }
      ])

      logger.info('获取物品详情成功', {
        item_id,
        status: item.status,
        has_redemption_code: detailWithDisplayNames.has_redemption_code
      })

      return detailWithDisplayNames
    } catch (error) {
      logger.error('获取物品详情失败', { error: error.message, item_id })
      throw error
    }
  }

  /**
   * 检查物品是否属于指定用户
   *
   * @private
   * @param {Object} item - Item模型实例
   * @param {number} user_id - 用户ID
   * @param {Object} [transaction] - Sequelize事务
   * @returns {Promise<boolean>} 是否是物品所有者
   */
  static async _isOwner(item, user_id, transaction) {
    const account = await Account.findOne({
      where: { user_id, account_type: 'user' },
      attributes: ['account_id'],
      transaction
    })
    return account ? item.owner_account_id === account.account_id : false
  }

  /**
   * 获取背包统计信息
   *
   * @param {number} user_id - 用户ID
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>} 统计信息
   */
  static async getBackpackStats(user_id, options = {}) {
    const { transaction = null } = options

    try {
      const [assets, items] = await Promise.all([
        BackpackService._getAssets(user_id, { transaction }),
        BackpackService._getItems(user_id, { transaction })
      ])

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
      logger.error('获取背包统计失败', { error: error.message, user_id })
      throw error
    }
  }

  /**
   * 获取物品使用后的操作指引文案
   * 优先级：模板级 meta.use_instructions > item_type 级配置 > null
   *
   * @param {Object} item - Item 模型实例
   * @returns {Promise<string|null>} 操作指引文案
   */
  static async getUseInstructions(item) {
    if (!item) return null

    const { SystemConfig: SysConfig, ItemTemplate } = require('../models')

    const instructionsConfig = await SysConfig.getValue('backpack_use_instructions', {})
    const itemType = item.item_type

    if (item.prize_definition_id) {
      const template = await ItemTemplate.findOne({
        where: { item_template_id: item.prize_definition_id },
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
