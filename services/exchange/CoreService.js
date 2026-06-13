/**
 * 天工商户营销平台 V4.7.0 - 兑换市场核心服务
 * Exchange Core Service（大文件拆分方案 Phase 4）
 *
 * 职责范围：核心兑换操作
 * - exchangeItem(): 商品兑换核心逻辑（材料资产扣减、订单创建、库存扣减）
 * - updateOrderStatus(): 更新订单状态（管理员操作，含状态机校验）
 * - 订单号：创建后使用 OrderNoGenerator（EM 前缀）回写
 *
 * 设计原则：
 * - 所有写操作必须在事务内执行（assertAndGetTransaction）
 * - 幂等性控制通过 idempotency_key 实现
 * - 材料资产扣减通过 BalanceService.changeBalance() 执行
 *
 * @module services/exchange/CoreService
 * @created 2026-01-31（大文件拆分方案 Phase 4）
 */

const BusinessError = require('../../utils/BusinessError')
const crypto = require('crypto')
const logger = require('../../utils/logger').logger
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { getImageUrl } = require('../../utils/ImageUrlHelper')
const OrderNoGenerator = require('../../utils/OrderNoGenerator')
const { generateExchangeBusinessId } = require('../../utils/IdempotencyHelper')
const BalanceService = require('../asset/BalanceService')
const ItemService = require('../asset/ItemService')
const UserAddressService = require('../UserAddressService')
const AttributeRuleEngine = require('../item/AttributeRuleEngine')
const AssetProductGuard = require('../shared/AssetProductGuard')
const { Op } = require('sequelize')
const { getRedisClient } = require('../../utils/UnifiedRedisClient')

/**
 * 兑换订单状态机白名单
 *
 * 业务流程：
 *   pending → approved（管理员审批通过）
 *   pending → rejected（管理员拒绝，退还材料）
 *   pending → cancelled（用户自行取消，退还材料）
 *   approved → shipped（管理员标记发货）
 *   shipped → received（用户确认收货 / 7天自动确认）
 *   received → rated（用户评分）
 *   received → completed（管理员标记完成）
 *   shipped → completed（管理员直接标记完成）
 *   rated → completed（管理员标记完成）
 *   approved → refunded（管理员退款）
 *   shipped → refunded（管理员退款-已发货阶段）
 *
 * @type {Object<string, string[]>}
 */
const ORDER_STATUS_TRANSITIONS = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['shipped', 'refunded'],
  shipped: ['received', 'completed', 'refunded'],
  received: ['rated', 'completed'],
  rated: ['completed'],
  rejected: [],
  refunded: [],
  cancelled: [],
  completed: []
}

/**
 * 兑换市场核心服务类
 *
 * @class CoreService
 */
class CoreService {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.ExchangeRecord = models.ExchangeRecord
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeItemSku = models.ExchangeItemSku
    this.ExchangeChannelPrice = models.ExchangeChannelPrice
    this.ExchangeRedeemRequirement = models.ExchangeRedeemRequirement
    this.UserGrowthLevel = models.UserGrowthLevel
    this.ItemTemplate = models.ItemTemplate
  }

  /**
   * 兑换商品（核心业务逻辑）
   * V4.5.0 材料资产支付版本
   * V4.9.0 统一商品中心 ExchangeItem 模型
   *
   * 支付方式：使用BalanceService扣减材料资产（cost_asset_code + cost_amount）
   * 定价来源：ExchangeItem → ExchangeItemSku → ExchangeChannelPrice
   *
   * @param {number} user_id - 用户ID
   * @param {number} exchange_item_id - 兑换商品ID
   * @param {number} quantity - 兑换数量
   * @param {Object} options - 选项
   * @param {string} options.idempotency_key - 幂等键（必填）
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @param {number} options.sku_id - SKU ID（必填）
   * @param {number} [options.address_id] - 收货地址主键（实物邮寄类履约必填，虚拟/即时类忽略）
   * @param {Object} [options.sku_spec_values] - SKU 规格值（铸造用）
   * @returns {Promise<Object>} 兑换结果和订单信息
   */
  async exchangeItem(user_id, exchange_item_id, quantity = 1, options = {}) {
    const { idempotency_key, sku_id } = options

    if (!idempotency_key) {
      throw new BusinessError(
        'idempotency_key 参数不能为空，用于幂等性控制',
        'EXCHANGE_NOT_ALLOWED',
        400
      )
    }

    if (!sku_id) {
      throw new BusinessError('sku_id 参数不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
    }

    const transaction = assertAndGetTransaction(options, 'CoreService.exchangeItem')

    /*
     * ✅ 幂等性检查：以 idempotency_key 为唯一键（统一幂等架构）
     * 🔴 P1-1-5: 不使用悲观锁，依赖数据库唯一约束防止并发创建重复订单
     */
    const existingOrder = await this.ExchangeRecord.findOne({
      where: { idempotency_key },
      transaction
    })

    if (existingOrder) {
      logger.info('[兑换市场] ⚠️ 幂等性检查：idempotency_key已存在，验证参数一致性', {
        idempotency_key,
        order_no: existingOrder.order_no,
        request_quantity: quantity
      })

      // 冲突保护：验证请求参数是否一致
      if (
        Number(existingOrder.exchange_item_id) !== Number(exchange_item_id) ||
        Number(existingOrder.sku_id) !== Number(sku_id) ||
        Number(existingOrder.quantity) !== Number(quantity)
      ) {
        const conflictError = new Error(
          `幂等键冲突：idempotency_key="${idempotency_key}" 已被使用于不同参数的订单。` +
            `原订单：exchange_item_id=${existingOrder.exchange_item_id}, sku_id=${existingOrder.sku_id}, 数量=${existingOrder.quantity}；` +
            `当前请求：exchange_item_id=${exchange_item_id}, sku_id=${sku_id}, 数量=${quantity}。` +
            '请使用不同的幂等键或确认请求参数正确。'
        )
        conflictError.statusCode = 409
        conflictError.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
        throw conflictError
      }

      logger.info('[兑换市场] ✅ 参数一致性验证通过，返回原结果（幂等）', {
        idempotency_key,
        order_no: existingOrder.order_no
      })

      /*
       * 🔴 幂等回放：补齐指纹字段（pay_asset_code/pay_amount）
       */

      const channelPrice = await this.ExchangeChannelPrice.findOne({
        where: { sku_id, is_enabled: true },
        transaction
      })
      if (!channelPrice) {
        throw new BusinessError('该 SKU 未配置兑换渠道定价', 'EXCHANGE_ERROR', 400)
      }
      const expectedPayAssetCode = channelPrice.cost_asset_code
      const expectedPayAmount = Number(channelPrice.cost_amount) * quantity

      if (
        existingOrder.pay_asset_code !== expectedPayAssetCode ||
        Number(existingOrder.pay_amount) !== Number(expectedPayAmount)
      ) {
        const conflictError = new Error(
          `幂等键冲突：idempotency_key="${idempotency_key}" 已被使用于不同支付参数的订单。` +
            `原订单：pay_asset_code=${existingOrder.pay_asset_code}, pay_amount=${existingOrder.pay_amount}；` +
            `当前请求：pay_asset_code=${expectedPayAssetCode}, pay_amount=${expectedPayAmount}。`
        )
        conflictError.statusCode = 409
        conflictError.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
        throw conflictError
      }

      let materialBalance = 0
      if (existingOrder.pay_asset_code) {
        const balanceResult = await BalanceService.getBalance(
          { user_id, asset_code: existingOrder.pay_asset_code },
          { transaction }
        )
        materialBalance = balanceResult.available_amount || 0
      }

      return {
        success: true,
        message: '兑换订单已存在',
        order: {
          order_no: existingOrder.order_no,
          record_id: existingOrder.exchange_record_id,
          name: existingOrder.item_snapshot?.item_name || '未知商品',
          quantity: existingOrder.quantity,
          pay_asset_code: existingOrder.pay_asset_code,
          pay_amount: existingOrder.pay_amount,
          status: existingOrder.status
        },
        remaining: {
          material_balance: materialBalance
        },
        is_duplicate: true,
        timestamp: BeijingTimeHelper.now()
      }
    }

    logger.info(
      `[兑换市场] 用户${user_id}兑换商品 exchange_item_id=${exchange_item_id}，数量${quantity}，idempotency_key=${idempotency_key}`
    )

    /*
     * ═══════════════════════════════════════════════════
     * 1. 商品信息解析：根据路径获取定价、库存、铸造参数
     * ═══════════════════════════════════════════════════
     */
    const product = await this.ExchangeItem.findOne({
      where: { exchange_item_id },
      include: [
        {
          model: this.models.MediaFile,
          as: 'primary_media',
          attributes: ['object_key'],
          required: false
        }
      ],
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!product) {
      throw new BusinessError('商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404)
    }
    if (product.status !== 'active') {
      throw new BusinessError('商品已下架', 'EXCHANGE_ERROR', 400)
    }

    /*
     * 每单数量上限校验（议题四·P6=A，2026-06-12）：读商品级可配列 max_quantity_per_order，
     * 替代历史在路由层硬编码的「1-10」魔术数字。业务规则后端权威、商品级可配、单一真相源。
     */
    const maxQtyPerOrder = Number(product.max_quantity_per_order) || 10
    if (quantity > maxQtyPerOrder) {
      throw new BusinessError(
        `兑换数量超过每单上限（最多 ${maxQtyPerOrder} 件）`,
        'EXCHANGE_ERROR',
        400
      )
    }

    const productSku = await this.ExchangeItemSku.findOne({
      where: { sku_id, exchange_item_id, status: 'active' },
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!productSku) {
      throw new BusinessError('SKU 不存在或已停售', 'EXCHANGE_SKU_NOT_FOUND', 404)
    }
    if (productSku.stock < quantity) {
      throw new BusinessError(
        `库存不足，当前库存：${productSku.stock}`,
        'EXCHANGE_STOCK_INSUFFICIENT',
        400
      )
    }

    const channelPrice = await this.ExchangeChannelPrice.findOne({
      where: { sku_id, is_enabled: true },
      transaction
    })
    if (!channelPrice) {
      throw new BusinessError('该 SKU 未配置兑换渠道定价', 'EXCHANGE_ERROR', 400)
    }
    if (!channelPrice.isPublished()) {
      throw new BusinessError('该 SKU 兑换定价当前未在发布窗口内', 'EXCHANGE_ERROR', 400)
    }

    const itemName = product.item_name
    const itemDescription = product.description
    const costAssetCode = channelPrice.cost_asset_code
    const costAmount = Number(channelPrice.cost_amount)
    const imageUrl = product.primary_media?.object_key
      ? getImageUrl(product.primary_media.object_key, product.primary_media.content_hash)
      : null
    const costPrice = productSku.cost_price || 0
    const rarityCode = product.rarity_code || 'common'
    const mintInstance = product.mint_instance
    const itemTemplateId = product.item_template_id
    const productSkuRecord = productSku

    /*
     * 履约类型分流（P1 拍板②：显式 fulfillment_type 取代靠模板推断）
     * - fulfillment_type 是商品级权威字段（physical/virtual/voucher）：
     *   · virtual（虚拟即时）：建单即 completed，不需要收货地址；
     *   · voucher（卡券核销）：建单即 completed（线上发券/到店核销），不需要邮寄地址；
     *   · physical（实物邮寄）：维持 pending + 走发货链，必须收集收货地址。
     * - 同时保留 item_template.item_type==='prop' 的「禁退款」语义（守星石单向铁律，见 _assertNotPropOrder）：
     *   prop 模板单仍即时 completed（与 virtual 一致），由 fulfillment_type 与 prop 共同决定即时完成。
     */
    const fulfillmentType = product.fulfillment_type || 'physical'
    let isPropOrder = false
    if (itemTemplateId && this.models.ItemTemplate) {
      const propTpl = await this.models.ItemTemplate.findByPk(itemTemplateId, {
        attributes: ['item_type'],
        transaction
      })
      isPropOrder = propTpl?.item_type === 'prop'
    }
    // 即时完成：虚拟即时 / 卡券核销 / 纯道具单（均无需邮寄）
    const isInstantFulfillment =
      fulfillmentType === 'virtual' || fulfillmentType === 'voucher' || isPropOrder
    const finalStatus = isInstantFulfillment ? 'completed' : 'pending'

    /*
     * 收货地址快照（断点一修复 + P1 履约校验）：
     * - 实物邮寄类（fulfillment_type='physical' 且非即时完成）下单必须携带有效 address_id，
     *   否则客服/运营无法发货——这是整条链路的真正断点，故在此强制校验。
     * - 复用 UserAddressService.buildSnapshot()（与 DIY 链路同一份逻辑），校验地址归属本人后生成快照，
     *   写入 exchange_records.address_snapshot。
     * - 虚拟即时 / 卡券核销 / 道具单：不要求地址（无需邮寄）。
     */
    let addressSnapshot = null
    const requiresShippingAddress = fulfillmentType === 'physical' && !isInstantFulfillment
    if (requiresShippingAddress) {
      if (!options.address_id) {
        throw new BusinessError('实物商品兑换需选择收货地址', 'EXCHANGE_ADDRESS_REQUIRED', 400)
      }
      addressSnapshot = await UserAddressService.buildSnapshot(user_id, options.address_id, {
        transaction
      })
    }

    // 2. 计算总支付金额
    const totalPayAmount = costAmount * quantity

    logger.info('[兑换市场] 材料资产支付计算', {
      cost_asset_code: costAssetCode,
      cost_amount: costAmount,
      quantity,
      totalPayAmount
    })

    /*
     * ═══════════════════════════════════════════════════
     * 2.5 复合门槛校验（路线B 模块C·第3步，高价值实物防代币化锚定）
     * 扣费前校验：成长等级 + 额外多资产余额（逐项过守卫） + 持有指定消耗道具
     * 全满足才放行，否则抛 BusinessError 提示缺项；无门槛配置的商品直接通过
     * ═══════════════════════════════════════════════════
     */
    const extraConsumption = await this._assertRedeemRequirement(
      { user_id, exchange_item_id, sku_id, quantity, itemTemplateId },
      { transaction }
    )

    // 3. 使用BalanceService统一账本扣减材料资产

    logger.info('[兑换市场] 开始扣减材料资产（统一账本）', {
      user_id,
      asset_code: costAssetCode,
      amount: totalPayAmount,
      idempotency_key: `exchange_debit_${idempotency_key}`
    })

    const burnAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_BURN' },
      { transaction }
    )
    // eslint-disable-next-line no-restricted-syntax
    const materialResult = await BalanceService.changeBalance(
      {
        user_id,
        asset_code: costAssetCode,
        delta_amount: -totalPayAmount,
        idempotency_key: `exchange_debit_${idempotency_key}`,
        business_type: 'exchange_debit',
        counterpart_account_id: burnAccount.account_id,
        meta: {
          idempotency_key,
          exchange_item_id,
          sku_id,
          item_name: itemName,
          quantity,
          cost_amount: costAmount,
          total_pay_amount: totalPayAmount
        }
      },
      { transaction }
    )

    // 如果是重复扣减，说明之前已经创建过订单但事务未提交
    if (materialResult.is_duplicate) {
      logger.info('[兑换市场] ⚠️ 材料扣减幂等返回，查询已存在订单', {
        idempotency_key
      })

      const existingRecord = await this.ExchangeRecord.findOne({
        where: { idempotency_key },
        transaction
      })

      if (existingRecord) {
        const currentBalance = await BalanceService.getBalance(
          { user_id, asset_code: costAssetCode },
          { transaction }
        )

        return {
          success: true,
          message: '兑换订单已存在（材料扣减幂等）',
          order: existingRecord.toJSON(),
          remaining: {
            material_balance: currentBalance.available_amount
          },
          is_duplicate: true,
          timestamp: BeijingTimeHelper.now()
        }
      }
    }

    logger.info(
      `[兑换市场] 材料扣减成功：${totalPayAmount}个${costAssetCode}，剩余余额通过统一账本管理`
    )

    /*
     * 3.5 复合门槛的额外消耗执行（与 2.5 校验对称）：
     * 校验已确认余额足够/持有足够，这里在同一事务内逐项扣减额外资产 + 销毁指定道具
     */
    if (extraConsumption) {
      await this._consumeRedeemRequirement(
        { user_id, idempotency_key, extraConsumption },
        { transaction }
      )
    }

    /*
     * 🔴 P0治理：提取扣减流水ID用于对账
     */
    const debit_transaction_id = materialResult.transaction_record?.transaction_id || null

    /*
     * 4~5. 创建兑换订单：订单号依赖自增主键，先用占位唯一值再回写统一格式（OrderNoGenerator）
     */
    const placeholder_order_no = `PH${crypto.randomBytes(12).toString('hex').toUpperCase()}`
    const business_ts = Date.now()
    const business_id = generateExchangeBusinessId(user_id, sku_id, business_ts)

    let record
    try {
      record = await this.ExchangeRecord.create(
        {
          order_no: placeholder_order_no,
          idempotency_key,
          business_id,
          debit_transaction_id,
          user_id,
          exchange_item_id,
          sku_id,
          item_snapshot: {
            exchange_item_id,
            sku_id,
            item_name: itemName,
            description: itemDescription,
            cost_asset_code: costAssetCode,
            cost_amount: costAmount,
            image_url: imageUrl
          },
          quantity,
          pay_asset_code: costAssetCode,
          pay_amount: totalPayAmount,
          total_cost: costPrice * quantity,
          address_snapshot: addressSnapshot,
          status: finalStatus,
          exchange_time: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )
    } catch (createError) {
      // 🔴 捕获唯一约束冲突（并发场景）
      if (
        createError.name === 'SequelizeUniqueConstraintError' ||
        createError.message?.includes('Duplicate entry') ||
        createError.message?.includes('idx_idempotency_key_unique')
      ) {
        logger.info('[兑换市场] ⚠️ 并发冲突：idempotency_key已存在，抛出错误让调用方处理', {
          idempotency_key
        })

        const conflictError = new Error(
          `并发冲突：idempotency_key="${idempotency_key}" 已被其他请求使用。请重试。`
        )
        conflictError.statusCode = 409
        conflictError.errorCode = 'CONCURRENT_CONFLICT'
        conflictError.originalError = createError
        throw conflictError
      }
      throw createError
    }

    await record.update(
      {
        order_no: OrderNoGenerator.generate(
          'EM',
          record.exchange_record_id,
          record.createdAt || record.created_at
        )
      },
      { transaction }
    )
    await record.reload({ transaction })
    const order_no = record.order_no

    // 6. 扣减库存（ExchangeItem SKU）
    await productSkuRecord.update(
      {
        stock: productSkuRecord.stock - quantity,
        sold_count: (productSkuRecord.sold_count || 0) + quantity
      },
      { transaction }
    )

    record.item_snapshot = {
      ...record.item_snapshot,
      sku_id: productSkuRecord.sku_id,
      sku_code: productSkuRecord.sku_code
    }
    await record.save({ transaction })

    try {
      await this.models.AdminOperationLog.create(
        {
          operator_id: null,
          operation_type: 'stock_change',
          target_type: 'product_sku',
          target_id: productSkuRecord.sku_id,
          action: 'purchase',
          before_data: { stock: productSkuRecord.stock, item_name: itemName },
          after_data: { stock: productSkuRecord.stock - quantity, item_name: itemName },
          changed_fields: {
            stock: {
              from: productSkuRecord.stock,
              to: productSkuRecord.stock - quantity,
              delta: -quantity
            }
          },
          reason: `用户兑换扣减库存（数量：${quantity}）`,
          risk_level: 'low',
          requires_approval: false,
          approval_status: 'not_required',
          affected_amount: quantity
        },
        { transaction }
      )
    } catch (logErr) {
      logger.warn('[兑换市场] 库存变动日志记录失败', { error: logErr.message })
    }

    /*
     * ═══════════════════════════════════════════════════
     * EAV改造：铸造物品实例分支
     * ExchangeItem.item_template_id → ItemTemplate → 铸造
     * ═══════════════════════════════════════════════════
     */
    let mintedItem = null
    if (mintInstance && itemTemplateId) {
      try {
        const { ItemTemplate, ItemHold } = this.models

        const template = await ItemTemplate.findByPk(itemTemplateId, { transaction })
        if (!template) {
          logger.warn('[兑换市场] 铸造跳过：关联的物品模板不存在', {
            item_template_id: itemTemplateId,
            exchange_item_id
          })
        } else {
          // 计算限量编号（按 item_template_id 计数 + 1）
          let serialNumber = null
          const editionTotal = template.max_edition || null
          if (template.max_edition) {
            const currentCount = await this.models.Item.count({
              where: {
                item_template_id: template.item_template_id,
                serial_number: { [require('sequelize').Op.ne]: null }
              },
              transaction
            })
            serialNumber = currentCount + 1
            if (serialNumber > template.max_edition) {
              throw new BusinessError(
                `限量售罄：${template.display_name} 限量${template.max_edition}件，已铸造${currentCount}件`,
                'EXCHANGE_ERROR',
                400
              )
            }
          }

          // 生成随机实例属性（品质分 + 纹理编号 + SKU规格副本）
          const skuSpecValues = options.sku_spec_values || {}
          const instanceAttributes = AttributeRuleEngine.generate(template, skuSpecValues)

          // 铸造物品实例
          const mintResult = await ItemService.mintItem(
            {
              user_id,
              item_type: template.item_type || 'product',
              source: 'exchange',
              source_ref_id: String(record.exchange_record_id),
              /*
               * P4（2026-06-12）：铸造物品名取「兑换商品名」(exchange_items.item_name)，所见即所得 + 成交快照。
               * 不再用模板 display_name（曾导致兑"衣服"背包却显示模板名"毛巾礼盒"，用户搜不到）。
               */
              item_name: itemName,
              item_description: template.description || itemDescription,
              item_value: 0,
              prize_definition_id: null,
              rarity_code: template.rarity_code || rarityCode,
              business_type: 'exchange_mint',
              idempotency_key: `exchange_mint_${idempotency_key}`,
              item_template_id: template.item_template_id,
              instance_attributes: instanceAttributes,
              serial_number: serialNumber,
              edition_total: editionTotal
            },
            { transaction }
          )

          mintedItem = mintResult.item

          // 创建交易冷却期 hold（默认7天，可在模板meta中配置）
          const cooldownDays = template.meta?.trade_cooldown_days || 7
          const expiresAt = new Date(Date.now() + cooldownDays * 24 * 60 * 60 * 1000)
          await ItemHold.create(
            {
              item_id: mintedItem.item_id,
              hold_type: 'trade_cooldown',
              holder_ref: `exchange_${record.exchange_record_id}`,
              priority: 0,
              status: 'active',
              reason: `新物品交易冷却期（${cooldownDays}天）`,
              expires_at: expiresAt
            },
            { transaction }
          )

          // 更新兑换订单的 item_id 关联
          await record.update({ item_id: mintedItem.item_id }, { transaction })

          logger.info('[兑换市场] ✅ 物品实例铸造成功', {
            item_id: mintedItem.item_id,
            tracking_code: mintedItem.tracking_code,
            serial_number: serialNumber,
            edition_total: editionTotal,
            quality_score: instanceAttributes?.quality_score,
            quality_grade: instanceAttributes?.quality_grade,
            pattern_id: instanceAttributes?.pattern_id,
            cooldown_days: cooldownDays,
            exchange_record_id: record.exchange_record_id
          })
        }
      } catch (mintError) {
        /*
         * P5（2026-06-12）：铸造失败即抛、整单事务回滚。
         * 此函数运行在 TransactionManager.execute 事务内，抛错会回滚资产扣减，杜绝"扣款成功但无物品"资损。
         * 不再吞异常当"非致命"（曾导致铸造失败仍返回成功、用户扣了资产却拿不到物品）。
         */
        logger.error('[兑换市场] ❌ 物品铸造失败，整单回滚', {
          error: mintError.message,
          exchange_item_id,
          order_no
        })
        throw mintError
      }
    }

    // 缓存失效
    await BusinessCacheHelper.invalidateExchangeItems('exchange_success')

    // 写入创建事件
    await this._recordEvent(
      {
        order_no,
        old_status: null,
        new_status: finalStatus,
        operator_id: user_id,
        operator_type: 'user',
        reason: isInstantFulfillment ? '用户兑换商品（即时完成）' : '用户兑换商品',
        metadata: {
          exchange_item_id,
          sku_id,
          quantity,
          pay_amount: totalPayAmount,
          minted_item_id: mintedItem?.item_id || null,
          is_prop_order: isPropOrder,
          fulfillment_type: fulfillmentType
        }
      },
      { transaction }
    )

    logger.info(`[兑换市场] 兑换成功，订单号：${order_no}`)

    const result = {
      success: true,
      message: '兑换成功',
      order: {
        order_no,
        record_id: record.exchange_record_id,
        item_name: itemName,
        quantity,
        pay_asset_code: costAssetCode,
        pay_amount: totalPayAmount,
        status: finalStatus
      },
      remaining: {
        material_balance: materialResult.new_balance
      },
      timestamp: BeijingTimeHelper.now()
    }

    if (mintedItem) {
      result.minted_item = {
        item_id: mintedItem.item_id,
        tracking_code: mintedItem.tracking_code,
        serial_number: mintedItem.serial_number,
        edition_total: mintedItem.edition_total,
        instance_attributes: mintedItem.instance_attributes
      }
    }

    return result
  }

  /**
   * 更新订单状态（管理员操作）
   *
   * @param {string} order_no - 订单号
   * @param {string} new_status - 新状态（completed/shipped/cancelled）
   * @param {number} operator_id - 操作员ID
   * @param {string} remark - 备注
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 更新结果
   */
  async updateOrderStatus(order_no, new_status, operator_id, remark = '', options = {}) {
    // 强制要求事务边界
    const transaction = assertAndGetTransaction(options, 'CoreService.updateOrderStatus')

    /*
     * 附加业务字段（如发货时的物流信息），与状态变更在同一事务内一并写入，
     * 避免路由层另起 ExchangeRecord.update（写操作收口到 Service）。
     */
    const extraFields =
      options.extraFields && typeof options.extraFields === 'object' ? options.extraFields : {}

    logger.info(`[兑换市场] 更新订单状态：${order_no} -> ${new_status}`)

    const order = await this.ExchangeRecord.findOne({
      where: { order_no },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      throw new BusinessError('订单不存在', 'EXCHANGE_ORDER_NOT_FOUND', 404)
    }

    const old_status = order.status

    // 状态机校验：只允许白名单中定义的合法状态转换
    const allowedTransitions = ORDER_STATUS_TRANSITIONS[old_status]
    if (!allowedTransitions) {
      const error = new Error(`当前订单状态 "${old_status}" 无法执行任何状态变更`)
      error.statusCode = 400
      error.code = 'INVALID_STATUS_TRANSITION'
      error.data = { current_status: old_status, requested_status: new_status }
      throw error
    }
    if (!allowedTransitions.includes(new_status)) {
      const error = new Error(
        `不允许的状态转换：${old_status} → ${new_status}，` +
          `当前状态仅可转换为：${allowedTransitions.length > 0 ? allowedTransitions.join(', ') : '（终态，不可变更）'}`
      )
      error.statusCode = 400
      error.code = 'INVALID_STATUS_TRANSITION'
      error.data = {
        current_status: old_status,
        requested_status: new_status,
        allowed_transitions: allowedTransitions
      }
      throw error
    }

    // 更新订单状态
    await order.update(
      {
        status: new_status,
        admin_remark: remark,
        ...extraFields,
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 根据状态类型记录对应时间戳
    const timestampMap = {
      approved: { approved_at: BeijingTimeHelper.createDatabaseTime() },
      shipped: { shipped_at: BeijingTimeHelper.createDatabaseTime() },
      received: { received_at: BeijingTimeHelper.createDatabaseTime() },
      rejected: { rejected_at: BeijingTimeHelper.createDatabaseTime() },
      refunded: { refunded_at: BeijingTimeHelper.createDatabaseTime() }
    }

    if (timestampMap[new_status]) {
      await order.update(timestampMap[new_status], { transaction })
    }

    // 写入状态变更事件
    await this._recordEvent(
      {
        order_no,
        old_status,
        new_status,
        operator_id,
        operator_type: 'admin',
        reason: remark || `管理员变更状态为 ${new_status}`,
        metadata: null
      },
      { transaction }
    )

    logger.info(`[兑换市场] 订单状态更新成功：${order_no} -> ${new_status}`)

    return {
      message: '订单状态更新成功',
      order: {
        order_no,
        status: new_status
      },
      timestamp: BeijingTimeHelper.now()
    }
  }

  /**
   * 用户对兑换订单评分（需求6：兑换商品统计字段）
   *
   * 业务规则：
   * - 只能对自己的订单评分
   * - 订单状态必须为 completed 或 shipped（已完成/已发货才能评分）
   * - 每笔订单只能评分一次（rating 非空则不可重复评分）
   * - 评分范围：1-5分
   * - 评分后清除该商品的缓存（触发 avg_rating 重新计算）
   *
   * @param {number} user_id - 用户ID
   * @param {string} order_no - 订单号
   * @param {number} rating - 评分（1-5分）
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 评分结果
   */
  async rateOrder(user_id, order_no, rating, options = {}) {
    const transaction = assertAndGetTransaction(options, 'rateOrder')

    // 评分范围校验
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      const error = new Error('评分必须为1-5的整数')
      error.statusCode = 400
      error.code = 'INVALID_RATING'
      throw error
    }

    // 查找订单
    const order = await this.ExchangeRecord.findOne({
      where: { order_no, user_id },
      transaction
    })

    if (!order) {
      const error = new Error('订单不存在或无权操作')
      error.statusCode = 404
      error.code = 'ORDER_NOT_FOUND'
      throw error
    }

    // 订单状态校验：已收货/已完成/已发货的订单才能评分
    if (!['received', 'completed', 'shipped'].includes(order.status)) {
      const error = new Error('只有已收货、已完成或已发货的订单才能评分')
      error.statusCode = 400
      error.code = 'ORDER_STATUS_INVALID'
      throw error
    }

    // 重复评分校验
    if (order.rating !== null) {
      const error = new Error('该订单已评分，不可重复评分')
      error.statusCode = 409
      error.code = 'ALREADY_RATED'
      error.data = { existing_rating: order.rating }
      throw error
    }

    const previousStatus = order.status

    await order.update(
      {
        status: 'rated',
        rating,
        rated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 写入事件记录
    await this._recordEvent(
      {
        order_no,
        old_status: previousStatus,
        new_status: 'rated',
        operator_id: user_id,
        operator_type: 'user',
        reason: `用户评分 ${rating} 分`,
        metadata: { rating }
      },
      { transaction }
    )

    // 清除该商品的列表缓存（触发 avg_rating 重新计算）
    await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
      logger.warn('[兑换市场] 评分后清除缓存失败（非致命）:', err.message)
    })

    logger.info('[兑换市场] 用户评分成功', {
      user_id,
      order_no,
      exchange_item_id: order.exchange_item_id,
      rating
    })

    return {
      message: '评分成功',
      order_no,
      rating,
      rated_at: BeijingTimeHelper.now()
    }
  }

  /**
   * 用户确认收货（决策4/Phase 3：发货后7天未操作自动确认）
   *
   * 业务规则：
   * - 只能对自己的订单确认收货
   * - 订单状态必须为 shipped（已发货才能确认收货）
   * - 确认收货后状态变为 received
   * - 管理员可通过 auto_confirmed=true 标记自动确认
   *
   * @param {number} user_id - 用户ID
   * @param {string} order_no - 订单号
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @param {boolean} [options.auto_confirmed=false] - 是否为系统自动确认
   * @returns {Promise<Object>} 确认收货结果
   */
  async confirmReceipt(user_id, order_no, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.confirmReceipt')
    const { auto_confirmed = false } = options

    const whereClause = { order_no }
    if (!auto_confirmed) {
      whereClause.user_id = user_id
    }

    const order = await this.ExchangeRecord.findOne({
      where: whereClause,
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      const error = new Error('订单不存在或无权操作')
      error.statusCode = 404
      error.code = 'ORDER_NOT_FOUND'
      throw error
    }

    if (order.status !== 'shipped') {
      const error = new Error('只有已发货的订单才能确认收货')
      error.statusCode = 400
      error.code = 'ORDER_STATUS_INVALID'
      error.data = { current_status: order.status }
      throw error
    }

    await order.update(
      {
        status: 'received',
        received_at: BeijingTimeHelper.createDatabaseTime(),
        auto_confirmed
      },
      { transaction }
    )

    // 写入事件记录
    await this._recordEvent(
      {
        order_no,
        old_status: 'shipped',
        new_status: 'received',
        operator_id: auto_confirmed ? 11021 : user_id,
        operator_type: auto_confirmed ? 'system' : 'user',
        reason: auto_confirmed ? '发货7天后系统自动确认收货' : '用户手动确认收货',
        metadata: { auto_confirmed }
      },
      { transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
      logger.warn('[兑换市场] 确认收货后清除缓存失败（非致命）:', err.message)
    })

    logger.info('[兑换市场] 确认收货成功', {
      user_id,
      order_no,
      auto_confirmed
    })

    return {
      message: auto_confirmed ? '系统自动确认收货成功' : '确认收货成功',
      order_no,
      status: 'received',
      received_at: BeijingTimeHelper.now(),
      auto_confirmed
    }
  }

  /**
   * 用户为自己的兑换订单补录/修改收货地址（实物履约，下单/中标后补地址）
   *
   * 业务场景（拍板 A）：
   * - 竞价中标为异步结算、用户不在场，实物中标订单建为 pending 但无地址，用户事后在订单页补地址。
   * - 普通实物订单若需改地址（发货前）也可复用本方法。
   * 复用 UserAddressService.buildSnapshot()（与下单同一份地址快照逻辑，避免重复）。
   *
   * 约束：
   * - 仅订单归属本人；仅 pending/approved（未发货）阶段可改地址，已发货/完成不可改。
   * - 写操作收口到 Service + 外部事务。
   *
   * @param {number} user_id - 当前用户ID
   * @param {string} order_no - 订单号
   * @param {number} address_id - 收货地址主键（须属于本人）
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} { order_no, address_snapshot }
   */
  async updateOrderAddress(user_id, order_no, address_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.updateOrderAddress')

    const order = await this.ExchangeRecord.findOne({
      where: { order_no, user_id },
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!order) {
      const error = new Error('订单不存在或无权操作')
      error.statusCode = 404
      error.code = 'ORDER_NOT_FOUND'
      throw error
    }
    // 仅未发货阶段可改地址（发货后地址已用于发货，不可变更）
    if (!['pending', 'approved'].includes(order.status)) {
      const error = new Error('当前订单状态不可修改收货地址（仅未发货阶段可改）')
      error.statusCode = 400
      error.code = 'ORDER_STATUS_INVALID'
      error.data = { current_status: order.status }
      throw error
    }

    const addressSnapshot = await UserAddressService.buildSnapshot(user_id, address_id, {
      transaction
    })
    await order.update(
      { address_snapshot: addressSnapshot, updated_at: BeijingTimeHelper.createDatabaseTime() },
      { transaction }
    )

    logger.info('[兑换市场] 用户补录/修改订单收货地址', { user_id, order_no, address_id })

    return { order_no, address_snapshot: addressSnapshot }
  }

  /**
   * 物流签收驱动确认收货（webhook 推送「已签收」时调用，物流方案一·拍板③）
   *
   * 业务场景：第三方快递推送「已签收(delivered)」轨迹 → 自动把订单 shipped→received，
   * 无需等待用户手动确认或 7 天兜底，提升履约时效。
   * - 仅当订单当前为 shipped 才推进（其它状态幂等跳过，不报错）。
   * - operator_type=system，operator_id 取系统任务用户（与 7 天兜底一致口径）。
   *
   * @param {string} order_no - 订单号
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} { driven: boolean, status: string }
   */
  async confirmReceiptByDelivery(order_no, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.confirmReceiptByDelivery')

    const order = await this.ExchangeRecord.findOne({
      where: { order_no },
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!order) {
      return { driven: false, status: null }
    }
    // 仅 shipped 可被签收推进；其它状态（已收货/已完成等）幂等跳过
    if (order.status !== 'shipped') {
      return { driven: false, status: order.status }
    }

    const systemUserId = parseInt(process.env.SYSTEM_DAILY_JOB_USER_ID, 10) || 11021
    await order.update(
      {
        status: 'received',
        received_at: BeijingTimeHelper.createDatabaseTime(),
        auto_confirmed: true
      },
      { transaction }
    )

    await this._recordEvent(
      {
        order_no,
        old_status: 'shipped',
        new_status: 'received',
        operator_id: systemUserId,
        operator_type: 'system',
        reason: '物流签收回推自动确认收货',
        metadata: { auto_confirmed: true, source: 'shipping_webhook' }
      },
      { transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
      logger.warn('[兑换市场] 签收回推确认收货后清除缓存失败（非致命）:', err.message)
    })

    logger.info('[兑换市场] 物流签收回推自动确认收货', { order_no })

    return { driven: true, status: 'received' }
  }

  /**
   * 批量自动确认收货（定时任务调用：发货7天后自动确认）
   *
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<number>} 自动确认的订单数量
   */
  async autoConfirmShippedOrders(options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.autoConfirmShippedOrders')

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const whereClause = {
      status: 'shipped',
      shipped_at: { [Op.lt]: sevenDaysAgo }
    }

    // 先查出即将被自动确认的订单号（用于事件记录）
    const pendingOrders = await this.ExchangeRecord.findAll({
      where: whereClause,
      attributes: ['order_no'],
      transaction
    })

    if (pendingOrders.length === 0) {
      return 0
    }

    const [affectedCount] = await this.ExchangeRecord.update(
      {
        status: 'received',
        received_at: BeijingTimeHelper.createDatabaseTime(),
        auto_confirmed: true
      },
      { where: whereClause, transaction }
    )

    if (affectedCount > 0) {
      // 批量写入事件记录（SYSTEM_DAILY_JOB_USER_ID = 11021）
      for (const row of pendingOrders) {
        // eslint-disable-next-line no-await-in-loop
        await this._recordEvent(
          {
            order_no: row.order_no,
            old_status: 'shipped',
            new_status: 'received',
            operator_id: 11021,
            operator_type: 'system',
            reason: '发货7天后系统自动确认收货',
            metadata: { auto_confirmed: true }
          },
          { transaction }
        )
      }

      logger.info(`[兑换市场] 自动确认收货完成，共 ${affectedCount} 笔订单`)
      await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
        logger.warn('[兑换市场] 批量确认收货后清除缓存失败（非致命）:', err.message)
      })
    }

    return affectedCount
  }

  /**
   * 校验订单不是虚拟道具单（F1 选 A：道具买入即消耗、禁止退款）
   *
   * 合规约束（§10.16-D / §10.15 Step 5）：
   * - 虚拟道具（item_type='prop'）单不可走 cancel/reject/refund，否则等于变相"官方回收"，
   *   给星石装"可回笼"货币属性，撞代币红线。
   * - 实物单（需发货）不受影响：未消耗可退=解冻；本守卫只拦截 prop 单。
   * - 通过订单关联的 exchange_item → item_template 的 item_type 判定。
   *
   * @param {Object} order - ExchangeRecord 订单实例
   * @param {Transaction} transaction - 事务对象
   * @throws {BusinessError} PROP_NO_REFUND - 虚拟道具单禁止退款
   * @returns {Promise<void>} 校验通过无返回，违规抛 BusinessError(400)
   * @private
   */
  async _assertNotPropOrder(order, transaction) {
    if (!order || !order.exchange_item_id) return
    const { ExchangeItem, ItemTemplate } = this.models
    if (!ExchangeItem || !ItemTemplate) return

    const exchangeItem = await ExchangeItem.findByPk(order.exchange_item_id, {
      attributes: ['item_template_id'],
      transaction
    })
    if (!exchangeItem || !exchangeItem.item_template_id) return

    const template = await ItemTemplate.findByPk(exchangeItem.item_template_id, {
      attributes: ['item_type'],
      transaction
    })
    if (template && template.item_type === 'prop') {
      throw new BusinessError(
        '虚拟道具买入即消耗，不可退款/取消（禁止官方回收，守星石单向铁律）',
        'PROP_NO_REFUND',
        400
      )
    }
  }

  /**
   * 用户取消订单（仅 pending 状态可取消，退还材料资产）
   *
   * 业务规则：
   * - 只能取消自己的订单
   * - 订单状态必须为 pending（待审核阶段才可取消）
   * - 退还 pay_amount 到用户账户（通过 BalanceService，幂等键防重）
   * - 记录状态变更事件
   *
   * @param {number} user_id - 用户ID
   * @param {string} order_no - 订单号
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 取消结果
   */
  async cancelOrder(user_id, order_no, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.cancelOrder')

    const order = await this.ExchangeRecord.findOne({
      where: { order_no, user_id },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      const error = new Error('订单不存在或无权操作')
      error.statusCode = 404
      error.code = 'ORDER_NOT_FOUND'
      throw error
    }

    if (order.status !== 'pending') {
      const error = new Error('只有待审核的订单才能取消')
      error.statusCode = 400
      error.code = 'ORDER_STATUS_INVALID'
      error.data = { current_status: order.status }
      throw error
    }

    // F1 选 A：虚拟道具单买入即消耗、禁止退款（防止变相"官方回收"撞星石货币属性红线）
    await this._assertNotPropOrder(order, transaction)

    // 退还材料资产（与 exchangeItem 扣减完全对称）
    const burnAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_BURN' },
      { transaction }
    )
    // eslint-disable-next-line no-restricted-syntax
    await BalanceService.changeBalance(
      {
        user_id: order.user_id,
        asset_code: order.pay_asset_code,
        delta_amount: +order.pay_amount,
        idempotency_key: `exchange_refund_${order.order_no}`,
        business_type: 'exchange_cancel_refund',
        counterpart_account_id: burnAccount.account_id,
        meta: {
          order_no: order.order_no,
          reason: 'user_cancel',
          original_pay_amount: order.pay_amount
        }
      },
      { transaction }
    )

    await order.update(
      {
        status: 'cancelled',
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 写入事件记录
    await this._recordEvent(
      {
        order_no,
        old_status: 'pending',
        new_status: 'cancelled',
        operator_id: user_id,
        operator_type: 'user',
        reason: '用户主动取消订单',
        metadata: { refund_amount: order.pay_amount, refund_asset_code: order.pay_asset_code }
      },
      { transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
      logger.warn('[兑换市场] 取消订单后清除缓存失败（非致命）:', err.message)
    })

    logger.info('[兑换市场] 用户取消订单成功', {
      user_id,
      order_no,
      refund_amount: order.pay_amount,
      refund_asset_code: order.pay_asset_code
    })

    return {
      message: '订单取消成功，材料资产已退还',
      order_no,
      status: 'cancelled',
      refund: {
        asset_code: order.pay_asset_code,
        amount: order.pay_amount
      }
    }
  }

  /**
   * 管理员拒绝订单（仅 pending 状态可拒绝，退还材料资产）
   *
   * 业务规则：
   * - 管理员操作，不校验 user_id
   * - 订单状态必须为 pending（待审核阶段才可拒绝）
   * - 退还 pay_amount 到用户账户
   * - 记录 admin_remark 和 rejected_at
   * - 记录状态变更事件
   *
   * @param {string} order_no - 订单号
   * @param {number} operator_id - 管理员ID
   * @param {string} remark - 拒绝原因
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 拒绝结果
   */
  async rejectOrder(order_no, operator_id, remark, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.rejectOrder')

    const order = await this.ExchangeRecord.findOne({
      where: { order_no },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      const error = new Error('订单不存在')
      error.statusCode = 404
      error.code = 'ORDER_NOT_FOUND'
      throw error
    }

    if (order.status !== 'pending') {
      const error = new Error('只有待审核的订单才能拒绝')
      error.statusCode = 400
      error.code = 'ORDER_STATUS_INVALID'
      error.data = { current_status: order.status }
      throw error
    }

    // F1 选 A：虚拟道具单买入即消耗、禁止退款
    await this._assertNotPropOrder(order, transaction)

    // 退还材料资产
    const burnAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_BURN' },
      { transaction }
    )
    // eslint-disable-next-line no-restricted-syntax
    await BalanceService.changeBalance(
      {
        user_id: order.user_id,
        asset_code: order.pay_asset_code,
        delta_amount: +order.pay_amount,
        idempotency_key: `exchange_refund_${order.order_no}`,
        business_type: 'exchange_reject_refund',
        counterpart_account_id: burnAccount.account_id,
        meta: {
          order_no: order.order_no,
          reason: 'admin_reject',
          operator_id,
          remark,
          original_pay_amount: order.pay_amount
        }
      },
      { transaction }
    )

    await order.update(
      {
        status: 'rejected',
        admin_remark: remark,
        rejected_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 写入事件记录
    await this._recordEvent(
      {
        order_no,
        old_status: 'pending',
        new_status: 'rejected',
        operator_id,
        operator_type: 'admin',
        reason: remark || '管理员拒绝审批',
        metadata: { refund_amount: order.pay_amount, refund_asset_code: order.pay_asset_code }
      },
      { transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
      logger.warn('[兑换市场] 拒绝订单后清除缓存失败（非致命）:', err.message)
    })

    logger.info('[兑换市场] 管理员拒绝订单成功', {
      operator_id,
      order_no,
      remark,
      refund_amount: order.pay_amount
    })

    return {
      message: '订单已拒绝，材料资产已退还用户',
      order: {
        order_no,
        status: 'rejected'
      }
    }
  }

  /**
   * 管理员退款（审核通过或已发货的订单可退款）
   *
   * 业务规则：
   * - 管理员操作，不校验 user_id
   * - 订单状态必须为 approved 或 shipped（审核通过/已发货阶段可退款）
   * - 退还 pay_amount 到用户账户（通过 BalanceService.changeBalance）
   * - 记录 admin_remark 和 refunded_at
   * - 记录状态变更事件
   * - 如果已发货，退款后需要恢复商品库存
   *
   * @param {string} order_no - 订单号
   * @param {number} operator_id - 管理员ID
   * @param {string} remark - 退款原因
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 退款结果
   */
  async refundOrder(order_no, operator_id, remark, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.refundOrder')

    const order = await this.ExchangeRecord.findOne({
      where: { order_no },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      const error = new Error('订单不存在')
      error.statusCode = 404
      error.code = 'ORDER_NOT_FOUND'
      throw error
    }

    const refundableStatuses = ['approved', 'shipped']
    if (!refundableStatuses.includes(order.status)) {
      const error = new Error(`只有审核通过或已发货的订单才能退款，当前状态：${order.status}`)
      error.statusCode = 400
      error.code = 'ORDER_STATUS_INVALID'
      error.data = { current_status: order.status, allowed_statuses: refundableStatuses }
      throw error
    }

    const old_status = order.status

    // F1 选 A：虚拟道具单买入即消耗、禁止退款
    await this._assertNotPropOrder(order, transaction)

    // 退款防刷检查（三层防护，从 system_settings 读取配置，初始值全 0 = 关闭）
    await this._checkRefundRules(order, transaction)

    // 退还材料资产到用户账户
    const burnAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_BURN' },
      { transaction }
    )
    // eslint-disable-next-line no-restricted-syntax
    await BalanceService.changeBalance(
      {
        user_id: order.user_id,
        asset_code: order.pay_asset_code,
        delta_amount: +order.pay_amount,
        idempotency_key: `exchange_admin_refund_${order.order_no}`,
        business_type: 'exchange_admin_refund',
        counterpart_account_id: burnAccount.account_id,
        meta: {
          order_no: order.order_no,
          reason: 'admin_refund',
          operator_id,
          remark,
          original_pay_amount: order.pay_amount,
          refund_from_status: old_status
        }
      },
      { transaction }
    )

    // 恢复商品库存（退款回补）
    const restoreItemId = order.exchange_item_id
    if (restoreItemId) {
      const exchangeItem = await this.ExchangeItem.findByPk(restoreItemId, { transaction })
      if (exchangeItem) {
        const quantity = order.quantity || 1
        await exchangeItem.update(
          {
            stock: exchangeItem.stock + quantity,
            sold_count: Math.max(0, exchangeItem.sold_count - quantity)
          },
          { transaction }
        )

        try {
          await this.models.AdminOperationLog.create(
            {
              operator_id: null,
              operation_type: 'stock_change',
              target_type: 'exchange_item',
              target_id: exchangeItem.exchange_item_id,
              action: 'refund',
              before_data: { stock: exchangeItem.stock, item_name: exchangeItem.item_name },
              after_data: {
                stock: exchangeItem.stock + quantity,
                item_name: exchangeItem.item_name
              },
              changed_fields: {
                stock: {
                  from: exchangeItem.stock,
                  to: exchangeItem.stock + quantity,
                  delta: quantity
                }
              },
              reason: `退款回补库存（订单：${order.exchange_record_id}，数量：${quantity}）`,
              risk_level: 'low',
              requires_approval: false,
              approval_status: 'not_required',
              affected_amount: quantity
            },
            { transaction }
          )
        } catch (logErr) {
          logger.warn('[兑换市场] 库存变动日志记录失败', { error: logErr.message })
        }
      }
    }

    await order.update(
      {
        status: 'refunded',
        admin_remark: remark,
        refunded_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    await this._recordEvent(
      {
        order_no,
        old_status,
        new_status: 'refunded',
        operator_id,
        operator_type: 'admin',
        reason: remark || '管理员退款',
        metadata: {
          refund_amount: order.pay_amount,
          refund_asset_code: order.pay_asset_code,
          refund_from_status: old_status
        }
      },
      { transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
      logger.warn('[兑换市场] 退款后清除缓存失败（非致命）:', err.message)
    })

    logger.info('[兑换市场] 管理员退款成功', {
      operator_id,
      order_no,
      remark,
      refund_amount: order.pay_amount,
      refund_from_status: old_status
    })

    return {
      message: '订单已退款，材料资产已退还用户',
      order: {
        order_no,
        status: 'refunded',
        refund_amount: order.pay_amount,
        refund_asset_code: order.pay_asset_code
      }
    }
  }

  /**
   * 复合门槛校验（路线B 模块C·第3步）— 扣费前只校验不扣减
   *
   * 校验项（全满足才放行）：
   * ① 成长等级 ≥ min_growth_level_key（按 users.history_total_points 派生）
   * ② extra_cost_assets 每项余额足够，且逐项过 AssetProductGuard 守卫（实物侧禁星石）
   * ③ required_consume_items 每项持有量足够（status available 的 item 实例计数）
   *
   * @param {Object} ctx - { user_id, exchange_item_id, sku_id, quantity, itemTemplateId }
   * @param {Object} options - { transaction }
   * @returns {Promise<Object|null>} 待执行的额外消耗清单（无门槛返回 null）
   * @throws {BusinessError} 缺项时抛出（提示具体缺哪项）
   * @private
   */
  async _assertRedeemRequirement(ctx, options = {}) {
    const { transaction } = options
    const { user_id, exchange_item_id, sku_id, quantity, itemTemplateId } = ctx

    if (!this.ExchangeRedeemRequirement) return null

    const req = await this.ExchangeRedeemRequirement.getEffectiveRequirement(
      exchange_item_id,
      sku_id,
      { transaction }
    )
    if (!req) return null

    // 判断兑换目标是否"有价值"（实物/券），用于守卫分叉
    let targetTemplate = null
    if (itemTemplateId && this.ItemTemplate) {
      targetTemplate = await this.ItemTemplate.findByPk(itemTemplateId, {
        attributes: ['item_type', 'reference_price_points'],
        transaction
      })
    }
    const targetIsValuable = AssetProductGuard.isValuable(targetTemplate)

    // ① 成长等级门槛
    if (req.min_growth_level_key && this.UserGrowthLevel) {
      const user = await this.models.User.findByPk(user_id, {
        attributes: ['user_id', 'history_total_points'],
        transaction
      })
      const levels = await this.UserGrowthLevel.getActiveLevels({ transaction })
      const required = levels.find(l => l.level_key === req.min_growth_level_key)
      const userPoints = Number(user?.history_total_points || 0)
      if (required && userPoints < Number(required.min_history_points)) {
        throw new BusinessError(
          `成长等级不足：需达到「${required.level_name}」（累计积分 ${required.min_history_points}），当前 ${userPoints}`,
          'REDEEM_GROWTH_LEVEL_INSUFFICIENT',
          400
        )
      }
    }

    // ② 额外多资产：校验余额 + 逐项过守卫
    const extraAssets = Array.isArray(req.extra_cost_assets) ? req.extra_cost_assets : []
    const assetDeductions = []
    for (const entry of extraAssets) {
      const asset_code = entry.asset_code
      const amount = Number(entry.amount) * quantity
      if (!asset_code || !(amount > 0)) continue

      // 守卫分叉：目标为实物/券时，额外资产禁含 star_stone（仅水晶系），由守卫统一裁决
      AssetProductGuard.assertPriceAssetAllowed(
        targetIsValuable ? { item_type: 'product' } : { item_type: 'prop' },
        asset_code
      )

      // 同一事务内的顺序读：Sequelize 事务不支持并发查询，必须串行（禁止 Promise.all）
      // eslint-disable-next-line no-await-in-loop
      const balanceResult = await BalanceService.getBalance(
        { user_id, asset_code },
        { transaction }
      )
      const available = Number(balanceResult.available_amount || 0)
      if (available < amount) {
        throw new BusinessError(
          `门槛资产不足：需 ${amount} 个 ${asset_code}，当前可用 ${available}`,
          'REDEEM_EXTRA_ASSET_INSUFFICIENT',
          400
        )
      }
      assetDeductions.push({ asset_code, amount })
    }

    // ③ 需消耗的指定道具：校验持有量
    const consumeItems = Array.isArray(req.required_consume_items) ? req.required_consume_items : []
    const itemConsumptions = []
    if (consumeItems.length > 0) {
      const userAccount = await this.models.Account.findOne({
        where: { user_id, account_type: 'user' },
        transaction
      })
      for (const ci of consumeItems) {
        const item_template_id = ci.item_template_id
        const needQty = Number(ci.quantity) * quantity
        if (!item_template_id || !(needQty > 0)) continue

        // 同一事务内的顺序读：事务不支持并发查询，必须串行（禁止 Promise.all）
        let heldItems = []
        if (userAccount) {
          // eslint-disable-next-line no-await-in-loop
          heldItems = await this.models.Item.findAll({
            where: {
              owner_account_id: userAccount.account_id,
              item_template_id,
              status: 'available'
            },
            attributes: ['item_id'],
            limit: needQty,
            transaction
          })
        }
        if (heldItems.length < needQty) {
          throw new BusinessError(
            `门槛道具不足：模板 ${item_template_id} 需 ${needQty} 件，当前持有 ${heldItems.length} 件`,
            'REDEEM_CONSUME_ITEM_INSUFFICIENT',
            400
          )
        }
        itemConsumptions.push({
          item_template_id,
          item_ids: heldItems.map(i => i.item_id)
        })
      }
    }

    return { assetDeductions, itemConsumptions }
  }

  /**
   * 复合门槛的额外消耗执行（与 _assertRedeemRequirement 对称，同一事务内）
   *
   * @param {Object} ctx - { user_id, idempotency_key, extraConsumption }
   * @param {Object} options - { transaction }
   * @returns {Promise<void>} 无返回值（事务内执行扣减与销毁）
   * @private
   */
  async _consumeRedeemRequirement(ctx, options = {}) {
    const { transaction } = options
    const { user_id, idempotency_key, extraConsumption } = ctx
    const { assetDeductions = [], itemConsumptions = [] } = extraConsumption

    const burnAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_BURN' },
      { transaction }
    )

    // 额外资产逐项扣减（向 SYSTEM_BURN 销毁）
    for (const ded of assetDeductions) {
      // eslint-disable-next-line no-restricted-syntax, no-await-in-loop
      await BalanceService.changeBalance(
        {
          user_id,
          asset_code: ded.asset_code,
          delta_amount: -ded.amount,
          idempotency_key: `redeem_req_${idempotency_key}_${ded.asset_code}`,
          business_type: 'exchange_redeem_requirement',
          counterpart_account_id: burnAccount.account_id,
          meta: { reason: 'redeem_threshold_extra_asset', asset_code: ded.asset_code }
        },
        { transaction }
      )
    }

    // 指定道具逐件销毁
    for (const ic of itemConsumptions) {
      for (const item_id of ic.item_ids) {
        // eslint-disable-next-line no-await-in-loop
        await ItemService.consumeItem(
          {
            item_id,
            operator_user_id: user_id,
            business_type: 'exchange_redeem_requirement',
            idempotency_key: `redeem_req_item_${idempotency_key}_${item_id}`,
            meta: { reason: 'redeem_threshold_consume_item' }
          },
          { transaction }
        )
      }
    }

    logger.info('[兑换市场] 复合门槛额外消耗执行完成', {
      user_id,
      asset_count: assetDeductions.length,
      item_count: itemConsumptions.reduce((s, c) => s + c.item_ids.length, 0)
    })
  }

  /**
   * 【管理端】列出某兑换商品的门槛配置（exchange_redeem_requirement）
   *
   * @param {number} exchange_item_id - 兑换商品ID
   * @param {Object} [options={}] - 查询选项（可含 transaction）
   * @returns {Promise<Array<Object>>} 门槛配置列表
   */
  async listRedeemRequirements(exchange_item_id, options = {}) {
    if (!this.ExchangeRedeemRequirement) return []
    const rows = await this.ExchangeRedeemRequirement.findAll({
      where: { exchange_item_id },
      order: [['exchange_redeem_requirement_id', 'ASC']],
      transaction: options.transaction
    })
    return rows.map(r => r.toJSON())
  }

  /**
   * 【管理端】创建/更新兑换门槛配置
   *
   * @param {Object} data - 门槛数据
   * @param {number} data.exchange_item_id - 兑换商品ID（必填）
   * @param {number} [data.sku_id] - SKU ID（可空=作用整个商品）
   * @param {string} [data.min_growth_level_key] - 最低成长等级
   * @param {Array} [data.extra_cost_assets] - 多资产组合 [{asset_code, amount}]
   * @param {Array} [data.required_consume_items] - 消耗道具 [{item_template_id, quantity}]
   * @param {boolean} [data.is_enabled] - 是否启用
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 保存后的门槛配置
   */
  async saveRedeemRequirement(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.saveRedeemRequirement')
    const {
      exchange_redeem_requirement_id,
      exchange_item_id,
      sku_id = null,
      min_growth_level_key = null,
      extra_cost_assets = null,
      required_consume_items = null,
      required_badges = null,
      required_tasks = null,
      is_enabled = true,
      publish_at = null,
      unpublish_at = null
    } = data

    if (!exchange_item_id) {
      throw new BusinessError('exchange_item_id 必填', 'REDEEM_REQ_INVALID_PARAMS', 400)
    }

    // 校验：目标商品存在；额外资产逐项过守卫（实物侧禁星石）
    const exchangeItem = await this.ExchangeItem.findByPk(exchange_item_id, {
      include: [{ model: this.ItemTemplate, as: 'itemTemplate', required: false }],
      transaction
    })
    if (!exchangeItem) {
      throw new BusinessError('兑换商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404)
    }
    const targetTemplate = exchangeItem.itemTemplate || null
    const targetIsValuable = AssetProductGuard.isValuable(targetTemplate)
    if (Array.isArray(extra_cost_assets)) {
      for (const entry of extra_cost_assets) {
        AssetProductGuard.assertPriceAssetAllowed(
          targetIsValuable ? { item_type: 'product' } : { item_type: 'prop' },
          entry.asset_code
        )
      }
    }

    const payload = {
      exchange_item_id,
      sku_id,
      min_growth_level_key,
      extra_cost_assets,
      required_consume_items,
      required_badges,
      required_tasks,
      is_enabled: !!is_enabled,
      publish_at,
      unpublish_at
    }

    let record
    if (exchange_redeem_requirement_id) {
      record = await this.ExchangeRedeemRequirement.findByPk(exchange_redeem_requirement_id, {
        transaction
      })
      if (!record) {
        throw new BusinessError('门槛配置不存在', 'REDEEM_REQ_NOT_FOUND', 404)
      }
      await record.update(payload, { transaction })
    } else {
      record = await this.ExchangeRedeemRequirement.create(payload, { transaction })
    }
    logger.info('[兑换市场] 门槛配置已保存', {
      exchange_redeem_requirement_id: record.exchange_redeem_requirement_id,
      exchange_item_id
    })
    return record.toJSON()
  }

  /**
   * 【管理端】删除兑换门槛配置（配置类数据，硬删除）
   *
   * @param {number} exchange_redeem_requirement_id - 门槛配置ID
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 删除结果
   */
  async deleteRedeemRequirement(exchange_redeem_requirement_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.deleteRedeemRequirement')
    const record = await this.ExchangeRedeemRequirement.findByPk(exchange_redeem_requirement_id, {
      transaction
    })
    if (!record) {
      throw new BusinessError('门槛配置不存在', 'REDEEM_REQ_NOT_FOUND', 404)
    }
    await record.destroy({ transaction })
    logger.info('[兑换市场] 门槛配置已删除', { exchange_redeem_requirement_id })
    return { exchange_redeem_requirement_id, deleted: true }
  }

  /**
   * 写入订单状态变更事件（私有方法，事务内同步写入）
   *
   * @param {Object} eventData - 事件数据
   * @param {string} eventData.order_no - 订单号
   * @param {string|null} eventData.old_status - 变更前状态
   * @param {string} eventData.new_status - 变更后状态
   * @param {number} eventData.operator_id - 操作人ID
   * @param {string} eventData.operator_type - 操作人类型（user/admin/system）
   * @param {string} [eventData.reason] - 变更原因
   * @param {Object} [eventData.metadata] - 额外元数据
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _recordEvent(eventData, options = {}) {
    try {
      const ExchangeOrderEvent = this.models.ExchangeOrderEvent
      if (!ExchangeOrderEvent) {
        logger.warn('[兑换市场] ExchangeOrderEvent 模型未注册，跳过事件记录')
        return
      }

      const idempotency_key = ExchangeOrderEvent.generateIdempotencyKey(
        eventData.order_no,
        eventData.new_status,
        eventData.operator_id
      )

      await ExchangeOrderEvent.create(
        { ...eventData, idempotency_key },
        { transaction: options.transaction }
      )
    } catch (err) {
      // 幂等冲突不抛出（防止重复写入）
      if (err.name === 'SequelizeUniqueConstraintError') {
        logger.info('[兑换市场] 事件记录幂等命中，跳过', { order_no: eventData.order_no })
        return
      }
      logger.error('[兑换市场] 写入事件记录失败（非致命）:', err.message)
    }
  }

  /**
   * 退款防刷检查（配置驱动三层防护）
   * 从 system_settings 读取规则，初始值全 0 = 关闭，上线后按需开启
   *
   * @param {Object} order - 兑换订单记录
   * @param {Transaction} transaction - 事务对象
   * @returns {Promise<void>} 检查通过无返回值，违规时抛出异常
   * @throws {Error} 违反退款规则时抛出
   * @private
   */
  async _checkRefundRules(order, transaction) {
    /**
     * 从 system_settings 读取退款防刷配置（白名单管控）
     * @param {string} settingKey - 配置键名
     * @returns {Promise<number>} 配置值（数字），读取失败返回 0
     */
    const getSettingValue = async settingKey => {
      try {
        const [rows] = await this.sequelize.query(
          'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
          { replacements: [settingKey], transaction }
        )
        if (rows.length > 0) {
          return parseInt(rows[0].setting_value) || 0
        }
      } catch {
        /* 配置读取失败不阻断退款 */
      }
      return 0
    }

    // 第一层：冷却期检查
    const cooldownHours = await getSettingValue('exchange/refund_cooldown_hours')
    if (cooldownHours > 0) {
      const redis = await getRedisClient()
      const cooldownKey = `app:v4:refund_cooldown:${order.user_id}:${order.exchange_item_id || order.exchange_item_id}`
      const exists = await redis.exists(cooldownKey)
      if (exists) {
        const error = new Error(`退款冷却期内不可再次兑换同一商品（冷却${cooldownHours}小时）`)
        error.statusCode = 429
        error.code = 'REFUND_COOLDOWN'
        throw error
      }
    }

    // 第二层：月限检查
    const monthlyLimit = await getSettingValue('exchange/refund_monthly_limit')
    if (monthlyLimit > 0) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const refundCount = await this.models.ExchangeOrderEvent.count({
        where: {
          new_status: 'refunded',
          operator_id: order.user_id,
          created_at: { [Op.gte]: startOfMonth }
        },
        transaction
      })

      if (refundCount >= monthlyLimit) {
        const error = new Error(`本月退款次数已达上限（${monthlyLimit}次/月）`)
        error.statusCode = 429
        error.code = 'REFUND_MONTHLY_LIMIT'
        throw error
      }
    }

    // 第三层：大额审批（记录日志，由路由层决定是否走审批链）
    const approvalThreshold = await getSettingValue('exchange/refund_approval_threshold')
    if (approvalThreshold > 0 && Number(order.pay_amount) > approvalThreshold) {
      logger.warn('[兑换市场] 大额退款触发审批检查', {
        order_no: order.order_no,
        pay_amount: order.pay_amount,
        threshold: approvalThreshold
      })
    }
  }
}

module.exports = CoreService
module.exports.ORDER_STATUS_TRANSITIONS = ORDER_STATUS_TRANSITIONS
