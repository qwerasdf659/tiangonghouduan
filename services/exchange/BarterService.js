/**
 * 以物易物服务 — BarterService（B2C 官方合成，非 C2C）
 *
 * 文件路径：services/exchange/BarterService.js
 *
 * 职责（合规整改执行清单 §10.15 阶段六 Step 14~18 / §10.19-C）：
 * 用户旧物 ──放入──▶ 官方(核销/销毁旧物) ──发放──▶ 官方库存新实物/道具 ──▶ 用户
 * 全程「用户↔官方」，旧物销毁、价值向下闭环，不涉及用户间财产转移、无货币回流，故安全。
 * 本质 = 与「水晶→实物」同源的 B2C 兑换，复用 exchange 域基建，不新建领域。
 *
 * 4 条落地守卫（全焊死）：
 * 1. 只能 用户↔官方：旧物进官方池销毁、新物从官方池出，无 transferItem、无用户间转移
 * 2. 旧物必须真销毁/核销（ItemService.consumeItem → status='used'，不可复活/退回）
 * 3. 产出只能是不可交易消耗品（实物/虚拟道具，is_tradable=0），禁任何货币型资产（产出侧守卫）
 * 4. 方向等价或向下（不可"破烂换高价值"形成变相价值放大/射幸）
 *
 * 架构规范：
 * - 复用 ItemService.consumeItem（旧物核销）+ ItemService.mintItem（产出）+ AssetProductGuard（产出守卫）
 * - 事务边界由路由层管理（TransactionManager.execute），本服务通过 options.transaction 接收（禁止自管理事务）
 * - 配方配置存 system_settings（category='exchange', key='barter_recipes'，JSON），不新建表
 * - 产出记录复用 ExchangeRecord(source='barter')
 *
 * @module services/exchange/BarterService
 * @created 2026-06-05（合规整改 阶段六 以物易物）
 */

'use strict'

const BusinessError = require('../../utils/BusinessError')
const { logger } = require('../../utils/logger')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const AssetProductGuard = require('../shared/AssetProductGuard')
const ItemService = require('../asset/ItemService')
const OrderNoGenerator = require('../../utils/OrderNoGenerator')
const BeijingTimeHelper = require('../../utils/timeHelper')
const crypto = require('crypto')

/** system_settings 配方配置位置 */
const RECIPE_CATEGORY = 'exchange'
const RECIPE_SETTING_KEY = 'barter_recipes'

/** 以物易物订单的占位计价（无货币支付，pay_asset_code 用非货币哨兵、pay_amount=0） */
const BARTER_PAY_ASSET = 'none'

/**
 * 以物易物服务类
 *
 * @class BarterService
 */
class BarterService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.Item = models.Item
    this.ItemTemplate = models.ItemTemplate
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeRecord = models.ExchangeRecord
    this.SystemSettings = models.SystemSettings
    this.sequelize = models.sequelize
  }

  /**
   * 读取以物易物配方列表（从 system_settings 读取 JSON）
   *
   * 配方结构（数组）：
   * [{
   *   recipe_code: 'old_towel_to_new_towel',   // 配方唯一码（业务码）
   *   name: '旧毛巾换新毛巾',                     // 展示名
   *   required_item_template_id: 16,            // 旧物模板ID（核销标的，按模板匹配用户持有的可用实例）
   *   required_quantity: 1,                     // 需消耗的旧物数量
   *   output_exchange_item_id: 20,             // 产出标的（官方库存 exchange_items）
   *   is_enabled: true
   * }]
   *
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Array>} 配方数组（未配置返回空数组）
   */
  async getRecipes(options = {}) {
    if (!this.SystemSettings) return []
    const row = await this.SystemSettings.findOne({
      where: { category: RECIPE_CATEGORY, setting_key: RECIPE_SETTING_KEY },
      transaction: options.transaction
    })
    if (!row || !row.setting_value) return []
    try {
      const parsed =
        typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      logger.error('[以物易物] 配方解析失败', { error: e.message })
      return []
    }
  }

  /**
   * 执行以物易物（核心写操作，事务由路由层传入）
   *
   * 流程：
   * ① 校验配方存在且启用
   * ② 校验旧物归属当前用户且状态可用（available）、数量足够
   * ③ 产出侧守卫：产出标的禁为货币型资产、方向等价或向下
   * ④ 旧物 ItemService.consumeItem 真销毁（status='used'，双录写入 SYSTEM_BURN）
   * ⑤ 从官方库存 mintItem 发产出物（is_tradable=0 由模板控制；产出实例不可交易）
   * ⑥ 写 ExchangeRecord(source='barter')
   * 全程用户↔官方，无 transferItem、无用户间转移。
   *
   * @param {number} userId - 用户ID
   * @param {string} recipeCode - 配方码
   * @param {Array<number>} oldItemIds - 用户选择投入的旧物实例ID列表（须归属本人、状态 available）
   * @param {string} idempotencyKey - 幂等键
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（强制，路由层管理事务边界）
   * @returns {Promise<Object>} 兑换结果 { order_no, consumed_item_ids, minted_item }
   */
  async executeBarter(userId, recipeCode, oldItemIds, idempotencyKey, options = {}) {
    const transaction = assertAndGetTransaction(options, 'BarterService.executeBarter')

    if (!userId) throw new BusinessError('user_id 是必填参数', 'EXCHANGE_REQUIRED', 400)
    if (!recipeCode) throw new BusinessError('recipe_code 是必填参数', 'EXCHANGE_REQUIRED', 400)
    if (!Array.isArray(oldItemIds) || oldItemIds.length === 0) {
      throw new BusinessError('old_item_ids 必须是非空数组', 'EXCHANGE_REQUIRED', 400)
    }
    if (!idempotencyKey) {
      throw new BusinessError('idempotency_key 是必填参数', 'EXCHANGE_REQUIRED', 400)
    }

    // ① 校验配方
    const recipes = await this.getRecipes({ transaction })
    const recipe = recipes.find(r => r.recipe_code === recipeCode && r.is_enabled !== false)
    if (!recipe) {
      throw new BusinessError(
        `以物易物配方不存在或已停用：${recipeCode}`,
        'BARTER_RECIPE_NOT_FOUND',
        404
      )
    }

    const requiredQty = Number(recipe.required_quantity) || 1
    if (oldItemIds.length !== requiredQty) {
      throw new BusinessError(
        `配方需投入 ${requiredQty} 件旧物，实际提交 ${oldItemIds.length} 件`,
        'BARTER_QUANTITY_MISMATCH',
        400
      )
    }

    // ② 校验旧物归属 + 状态可用 + 模板匹配
    const oldItems = await this._loadAndValidateOldItems(userId, oldItemIds, recipe, transaction)

    // ③ 产出侧守卫（产出禁货币型资产 + 方向等价/向下）
    const outputItem = await this.ExchangeItem.findByPk(recipe.output_exchange_item_id, {
      include: [
        {
          model: this.ItemTemplate,
          as: 'itemTemplate',
          attributes: ['item_type', 'item_template_id', 'reference_price_points']
        }
      ],
      transaction
    })
    if (!outputItem) {
      throw new BusinessError(
        `产出商品不存在：${recipe.output_exchange_item_id}`,
        'BARTER_OUTPUT_NOT_FOUND',
        404
      )
    }
    // 产出标的为实物/道具实例（非货币型资产），传 null 走"实物放行"分支；显式断言以防误配
    await AssetProductGuard.assertPayoutNotCurrency(null, this.models, { transaction })
    await this._assertDirectionNotUpward(oldItems, outputItem)

    // ④ 旧物真销毁（核销）
    const consumedIds = []
    for (const item of oldItems) {
      // eslint-disable-next-line no-await-in-loop
      await ItemService.consumeItem(
        {
          item_id: item.item_id,
          operator_user_id: userId,
          business_type: 'barter_consume',
          idempotency_key: `barter_consume_${idempotencyKey}_${item.item_id}`,
          meta: { recipe_code: recipeCode, output_exchange_item_id: recipe.output_exchange_item_id }
        },
        { transaction }
      )
      consumedIds.push(item.item_id)
    }

    // ⑤ 从官方库存铸造产出物（item_type 透传模板，产出实例 is_tradable 由模板/背包侧控制）
    const outTpl = outputItem.itemTemplate
    const mintResult = await ItemService.mintItem(
      {
        user_id: userId,
        item_type: outTpl?.item_type || 'product',
        source: 'barter',
        source_ref_id: String(recipe.output_exchange_item_id),
        item_name: outputItem.item_name,
        item_description: outputItem.description || '',
        item_value: 0,
        item_template_id: outTpl?.item_template_id || null,
        business_type: 'barter_mint',
        idempotency_key: `barter_mint_${idempotencyKey}`,
        meta: { recipe_code: recipeCode, consumed_item_ids: consumedIds }
      },
      { transaction }
    )
    const mintedItem = mintResult.item

    // ⑥ 写 ExchangeRecord(source='barter')
    const placeholderOrder = `PH${crypto.randomBytes(12).toString('hex').toUpperCase()}`
    const businessId = `barter_${userId}_${recipeCode}_${Date.now()}`
    const record = await this.ExchangeRecord.create(
      {
        user_id: userId,
        exchange_item_id: recipe.output_exchange_item_id,
        order_no: placeholderOrder,
        idempotency_key: idempotencyKey,
        business_id: businessId,
        pay_asset_code: BARTER_PAY_ASSET,
        pay_amount: 0,
        source: 'barter',
        status: 'completed',
        item_id: mintedItem.item_id,
        item_snapshot: {
          recipe_code: recipeCode,
          recipe_name: recipe.name,
          consumed_item_ids: consumedIds,
          output_item_name: outputItem.item_name
        },
        exchange_time: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )
    await record.update(
      {
        order_no: OrderNoGenerator.generate('BT', record.exchange_record_id, record.created_at)
      },
      { transaction }
    )
    await record.reload({ transaction })

    logger.info('[以物易物] 兑换成功', {
      user_id: userId,
      recipe_code: recipeCode,
      consumed_item_ids: consumedIds,
      minted_item_id: mintedItem.item_id,
      order_no: record.order_no
    })

    return {
      order_no: record.order_no,
      recipe_code: recipeCode,
      consumed_item_ids: consumedIds,
      minted_item: {
        item_id: mintedItem.item_id,
        item_name: mintedItem.item_name,
        tracking_code: mintedItem.tracking_code
      }
    }
  }

  /**
   * 保存以物易物配方列表（管理后台写入 system_settings JSON）
   *
   * 配方为运营配置数据（非互锁资产），可直接写配置表，不破坏资产体系。
   * 写入前做基本结构校验，避免脏数据。
   *
   * @param {Array} recipes - 配方数组（结构见 getRecipes）
   * @param {number} operatorId - 操作人用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（强制，路由层管理事务边界）
   * @returns {Promise<Array>} 保存后的配方数组
   */
  async saveRecipes(recipes, operatorId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'BarterService.saveRecipes')
    if (!this.SystemSettings) {
      throw new BusinessError('SystemSettings 模型不可用', 'EXCHANGE_ERROR', 500)
    }
    if (!Array.isArray(recipes)) {
      throw new BusinessError('recipes 必须是数组', 'BARTER_INVALID_RECIPES', 400)
    }

    // 结构校验：每条配方必填字段
    const codes = new Set()
    for (const r of recipes) {
      if (!r.recipe_code || typeof r.recipe_code !== 'string') {
        throw new BusinessError(
          '每条配方必须有 recipe_code（字符串）',
          'BARTER_INVALID_RECIPES',
          400
        )
      }
      if (codes.has(r.recipe_code)) {
        throw new BusinessError(`配方码重复：${r.recipe_code}`, 'BARTER_DUPLICATE_RECIPE', 400)
      }
      codes.add(r.recipe_code)
      if (!r.output_exchange_item_id) {
        throw new BusinessError(
          `配方 ${r.recipe_code} 缺少 output_exchange_item_id`,
          'BARTER_INVALID_RECIPES',
          400
        )
      }
      if (!r.required_item_template_id) {
        throw new BusinessError(
          `配方 ${r.recipe_code} 缺少 required_item_template_id`,
          'BARTER_INVALID_RECIPES',
          400
        )
      }
    }

    const value = JSON.stringify(recipes)
    const existing = await this.SystemSettings.findOne({
      where: { category: RECIPE_CATEGORY, setting_key: RECIPE_SETTING_KEY },
      transaction
    })
    if (existing) {
      await existing.update(
        { setting_value: value, value_type: 'json', updated_by: operatorId || null },
        { transaction }
      )
    } else {
      await this.SystemSettings.create(
        {
          category: RECIPE_CATEGORY,
          setting_key: RECIPE_SETTING_KEY,
          setting_value: value,
          value_type: 'json',
          description: '以物易物配方配置（旧物组合→官方产出物，B2C 官方合成）',
          updated_by: operatorId || null
        },
        { transaction }
      )
    }

    logger.info('[以物易物] 配方已保存', { count: recipes.length, operator_id: operatorId })
    return recipes
  }

  /**
   * 加载并校验旧物（归属当前用户 + 状态可用 + 模板匹配配方要求）
   *
   * @param {number} userId - 用户ID
   * @param {Array<number>} oldItemIds - 旧物实例ID
   * @param {Object} recipe - 配方
   * @param {Object} transaction - 事务
   * @returns {Promise<Array>} 校验通过的旧物实例
   * @private
   */
  async _loadAndValidateOldItems(userId, oldItemIds, recipe, transaction) {
    const BalanceService = require('../asset/BalanceService')
    // 通过用户账户校验归属（items.owner_account_id → 用户账户）
    const userAccount = await BalanceService.getOrCreateAccount(
      { user_id: userId },
      { transaction }
    )

    const items = await this.Item.findAll({
      where: { item_id: oldItemIds },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (items.length !== oldItemIds.length) {
      throw new BusinessError('部分旧物不存在', 'BARTER_ITEM_NOT_FOUND', 404)
    }

    for (const item of items) {
      if (item.owner_account_id !== userAccount.account_id) {
        throw new BusinessError(`旧物 ${item.item_id} 不归属当前用户`, 'BARTER_ITEM_NOT_OWNED', 403)
      }
      if (item.status !== 'available') {
        throw new BusinessError(
          `旧物 ${item.item_id} 状态不可用（${item.status}），无法投入以物易物`,
          'BARTER_ITEM_NOT_AVAILABLE',
          400
        )
      }
      if (
        recipe.required_item_template_id &&
        item.item_template_id !== recipe.required_item_template_id
      ) {
        throw new BusinessError(
          `旧物 ${item.item_id} 不符合配方要求的物品模板`,
          'BARTER_ITEM_TEMPLATE_MISMATCH',
          400
        )
      }
    }
    return items
  }

  /**
   * 方向守卫：产出价值不得高于投入（等价或向下；防"破烂换高价值"变相射幸）
   *
   * 用模板 reference_price_points 作价值锚（无锚时视为 0）。
   *
   * @param {Array} oldItems - 投入旧物实例
   * @param {Object} outputItem - 产出 ExchangeItem（含 itemTemplate）
   * @returns {Promise<void>} 校验通过无返回，违规抛 BusinessError(400)
   * @private
   */
  async _assertDirectionNotUpward(oldItems, outputItem) {
    const templateIds = [...new Set(oldItems.map(i => i.item_template_id).filter(Boolean))]
    let inputValue = 0
    if (templateIds.length > 0) {
      const tpls = await this.ItemTemplate.findAll({
        where: { item_template_id: templateIds },
        attributes: ['item_template_id', 'reference_price_points'],
        raw: true
      })
      const valueMap = new Map(
        tpls.map(t => [t.item_template_id, Number(t.reference_price_points || 0)])
      )
      inputValue = oldItems.reduce((sum, it) => sum + (valueMap.get(it.item_template_id) || 0), 0)
    }
    const outputValue = Number(outputItem.itemTemplate?.reference_price_points || 0)
    if (outputValue > inputValue) {
      throw new BusinessError(
        `以物易物方向违规：产出价值(${outputValue})高于投入价值(${inputValue})，仅允许等价或向下兑换`,
        'BARTER_DIRECTION_UPWARD_FORBIDDEN',
        400
      )
    }
  }
}

module.exports = BarterService
