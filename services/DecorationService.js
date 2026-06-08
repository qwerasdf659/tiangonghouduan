'use strict'

/**
 * 装饰服务 — DecorationService（星石虚拟装饰体系，模块D）
 *
 * 业务定位（路线B 合规改造 第十节 / 决策 17.3）：
 * - 星石（star_stone）的正当消耗出口：明码标价购买纯展示装饰。
 * - 🔴 红线（务必守住）：
 *   ① 明码标价直购，严禁抽装饰/开箱（本服务无任何随机获取入口）
 *   ② 纯展示零数值，佩戴只影响 UI，不进任何业务计算（不碰抽奖/回馈/资产计算）
 *   ③ 星石购买装饰 = 向下销毁（向 SYSTEM_BURN 转移），符合 AssetProductGuard 放行逻辑
 *   ④ 限时装饰到期由 jobs/daily-decoration-expiry.js 清理
 *
 * 架构约束：
 * - 写操作强制外部事务传入（assertAndGetTransaction），事务边界由路由层 TransactionManager 管理
 * - 通过 ServiceManager 以 key 'decoration' 注册获取
 *
 * @module services/DecorationService
 * @created 2026-06-08（路线B 合规改造 模块D）
 */

const BusinessError = require('../utils/BusinessError')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const BalanceService = require('./asset/BalanceService')
const { AssetCode } = require('../constants/AssetCode')

/**
 * 装饰服务类（实例化，需 models）
 * @class DecorationService
 */
class DecorationService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.DecorationSku = models.DecorationSku
    this.UserOwnedDecoration = models.UserOwnedDecoration
    this.DecorationSeason = models.DecorationSeason
  }

  /**
   * 获取在售装饰商城列表（含赛季信息）
   *
   * @param {Object} [options={}] - 查询选项（可含 transaction）
   * @returns {Promise<Array<Object>>} 在售装饰列表
   */
  async listOnSaleDecorations(options = {}) {
    const rows = await this.DecorationSku.findAll({
      where: { status: 'on_sale' },
      include: [{ model: this.DecorationSeason, as: 'season', required: false }],
      order: [['sort_order', 'ASC']],
      transaction: options.transaction
    })
    return rows.map(r => ({
      decoration_sku_id: r.decoration_sku_id,
      decoration_code: r.decoration_code,
      decoration_name: r.decoration_name,
      decoration_type: r.decoration_type,
      rarity_code: r.rarity_code,
      set_code: r.set_code,
      is_limited: r.is_limited,
      price_star_stone: r.price_star_stone,
      validity_days: r.validity_days,
      image_url: r.image_url,
      season: r.season
        ? { season_code: r.season.season_code, season_name: r.season.season_name }
        : null
    }))
  }

  /**
   * 获取用户拥有的装饰列表
   *
   * @param {number} user_id - 用户ID
   * @param {Object} [options={}] - 查询选项（可含 transaction）
   * @returns {Promise<Array<Object>>} 用户装饰列表
   */
  async listUserDecorations(user_id, options = {}) {
    const rows = await this.UserOwnedDecoration.findAll({
      where: { user_id, status: 'active' },
      include: [{ model: this.DecorationSku, as: 'decoration', required: true }],
      order: [['acquired_at', 'DESC']],
      transaction: options.transaction
    })
    return rows.map(r => ({
      user_owned_decoration_id: r.user_owned_decoration_id,
      decoration_sku_id: r.decoration_sku_id,
      decoration_name: r.decoration?.decoration_name,
      decoration_type: r.decoration?.decoration_type,
      rarity_code: r.decoration?.rarity_code,
      image_url: r.decoration?.image_url,
      equipped: r.equipped,
      acquired_at: r.acquired_at,
      expires_at: r.expires_at
    }))
  }

  /**
   * 购买装饰（星石明码标价直购，向下销毁；严禁抽取/开箱）
   *
   * @param {number} user_id - 用户ID
   * @param {number} decoration_sku_id - 装饰SKU ID
   * @param {Object} options - 选项
   * @param {string} options.idempotency_key - 幂等键（必填）
   * @param {Object} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 购买结果
   */
  async purchaseDecoration(user_id, decoration_sku_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'DecorationService.purchaseDecoration')
    const { idempotency_key } = options
    if (!idempotency_key) {
      throw new BusinessError('idempotency_key 不能为空', 'DECORATION_NOT_ALLOWED', 400)
    }

    const sku = await this.DecorationSku.findByPk(decoration_sku_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!sku) {
      throw new BusinessError('装饰不存在', 'DECORATION_NOT_FOUND', 404)
    }
    if (sku.status !== 'on_sale') {
      throw new BusinessError('装饰未在售', 'DECORATION_NOT_ON_SALE', 400)
    }

    // 防重复持有
    const existing = await this.UserOwnedDecoration.findOne({
      where: { user_id, decoration_sku_id, status: 'active' },
      transaction
    })
    if (existing) {
      throw new BusinessError('已拥有该装饰，不可重复购买', 'DECORATION_ALREADY_OWNED', 400)
    }

    // 星石扣减（向下销毁到 SYSTEM_BURN）
    const price = Number(sku.price_star_stone)
    if (price > 0) {
      const burnAccount = await BalanceService.getOrCreateAccount(
        { system_code: 'SYSTEM_BURN' },
        { transaction }
      )
      // eslint-disable-next-line no-restricted-syntax
      await BalanceService.changeBalance(
        {
          user_id,
          asset_code: AssetCode.STAR_STONE,
          delta_amount: -price,
          idempotency_key: `decoration_buy_${idempotency_key}`,
          business_type: 'decoration_purchase',
          counterpart_account_id: burnAccount.account_id,
          meta: { decoration_sku_id, decoration_code: sku.decoration_code, price }
        },
        { transaction }
      )
    }

    // 计算到期时间（限时装饰）
    let expires_at = null
    if (sku.validity_days && Number(sku.validity_days) > 0) {
      expires_at = new Date(Date.now() + Number(sku.validity_days) * 24 * 60 * 60 * 1000)
    }

    const owned = await this.UserOwnedDecoration.create(
      {
        user_id,
        decoration_sku_id,
        equipped: false,
        acquired_at: BeijingTimeHelper.createDatabaseTime(),
        expires_at,
        status: 'active'
      },
      { transaction }
    )

    logger.info('[装饰] 购买成功', {
      user_id,
      decoration_sku_id,
      price_star_stone: price,
      expires_at
    })

    return {
      user_owned_decoration_id: owned.user_owned_decoration_id,
      decoration_sku_id,
      price_star_stone: price,
      expires_at,
      acquired_at: owned.acquired_at
    }
  }

  /**
   * 佩戴/卸下装饰（仅影响 UI 展示，不进任何业务计算）
   *
   * 同类型装饰互斥佩戴：佩戴某装饰时，自动卸下同 decoration_type 的其他已佩戴装饰。
   *
   * @param {number} user_id - 用户ID
   * @param {number} user_owned_decoration_id - 用户拥有装饰ID
   * @param {boolean} equipped - true=佩戴 false=卸下
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 操作结果
   */
  async setEquipped(user_id, user_owned_decoration_id, equipped, options = {}) {
    const transaction = assertAndGetTransaction(options, 'DecorationService.setEquipped')

    const owned = await this.UserOwnedDecoration.findOne({
      where: { user_owned_decoration_id, user_id, status: 'active' },
      include: [{ model: this.DecorationSku, as: 'decoration', required: true }],
      transaction
    })
    if (!owned) {
      throw new BusinessError('未拥有该装饰或装饰已失效', 'DECORATION_NOT_OWNED', 404)
    }

    if (equipped) {
      // 同类型互斥：卸下同类型其他已佩戴装饰
      const sameTypeOwnedIds = await this.UserOwnedDecoration.findAll({
        where: { user_id, equipped: true, status: 'active' },
        include: [
          {
            model: this.DecorationSku,
            as: 'decoration',
            required: true,
            where: { decoration_type: owned.decoration.decoration_type }
          }
        ],
        attributes: ['user_owned_decoration_id'],
        transaction
      })
      const ids = sameTypeOwnedIds.map(r => r.user_owned_decoration_id)
      if (ids.length > 0) {
        await this.UserOwnedDecoration.update(
          { equipped: false },
          { where: { user_owned_decoration_id: ids }, transaction }
        )
      }
    }

    await owned.update({ equipped: !!equipped }, { transaction })

    logger.info('[装饰] 佩戴状态变更', {
      user_id,
      user_owned_decoration_id,
      equipped: !!equipped
    })

    return { user_owned_decoration_id, equipped: !!equipped }
  }

  /**
   * 清理到期的限时装饰（定时任务调用：status active→expired，并卸下佩戴）
   *
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<number>} 清理的装饰数量
   */
  async expireOverdueDecorations(options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'DecorationService.expireOverdueDecorations'
    )
    const { Op } = require('sequelize')
    const now = new Date()

    const [affected] = await this.UserOwnedDecoration.update(
      { status: 'expired', equipped: false },
      {
        where: {
          status: 'active',
          expires_at: { [Op.ne]: null, [Op.lte]: now }
        },
        transaction
      }
    )

    if (affected > 0) {
      logger.info('[装饰] 到期清理完成', { expired_count: affected })
    }
    return affected
  }

  /**
   * 【管理端】创建装饰 SKU（草稿态，运营配置后再上架）
   *
   * @param {Object} data - 装饰数据
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 创建的装饰 SKU
   */
  async createDecorationSku(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'DecorationService.createDecorationSku')
    const {
      decoration_code,
      decoration_name,
      decoration_type,
      rarity_code = null,
      decoration_season_id = null,
      set_code = null,
      is_limited = false,
      price_star_stone = 0,
      validity_days = null,
      image_url = null,
      sort_order = 0
    } = data

    if (!decoration_code || !decoration_name || !decoration_type) {
      throw new BusinessError(
        'decoration_code/decoration_name/decoration_type 为必填',
        'DECORATION_INVALID_PARAMS',
        400
      )
    }
    if (Number(price_star_stone) < 0) {
      throw new BusinessError('价格不能为负', 'DECORATION_INVALID_PRICE', 400)
    }

    const sku = await this.DecorationSku.create(
      {
        decoration_code,
        decoration_name,
        decoration_type,
        rarity_code,
        decoration_season_id,
        set_code,
        is_limited: !!is_limited,
        price_star_stone: parseInt(price_star_stone, 10) || 0,
        validity_days: validity_days ? parseInt(validity_days, 10) : null,
        image_url,
        status: 'draft',
        sort_order: parseInt(sort_order, 10) || 0
      },
      { transaction }
    )
    logger.info('[装饰] 管理端创建SKU', { decoration_sku_id: sku.decoration_sku_id })
    return sku.toJSON()
  }

  /**
   * 【管理端】更新装饰 SKU（含上下架：status=on_sale/off_sale/draft）
   *
   * @param {number} decoration_sku_id - 装饰SKU ID
   * @param {Object} data - 更新字段
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 更新后的装饰 SKU
   */
  async updateDecorationSku(decoration_sku_id, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'DecorationService.updateDecorationSku')
    const sku = await this.DecorationSku.findByPk(decoration_sku_id, { transaction })
    if (!sku) {
      throw new BusinessError('装饰不存在', 'DECORATION_NOT_FOUND', 404)
    }

    const allowed = [
      'decoration_name',
      'decoration_type',
      'rarity_code',
      'decoration_season_id',
      'set_code',
      'is_limited',
      'price_star_stone',
      'validity_days',
      'image_url',
      'status',
      'sort_order'
    ]
    const updateData = {}
    for (const f of allowed) {
      if (data[f] !== undefined) updateData[f] = data[f]
    }
    if (updateData.status && !['draft', 'on_sale', 'off_sale'].includes(updateData.status)) {
      throw new BusinessError('非法上架状态', 'DECORATION_INVALID_STATUS', 400)
    }
    if (updateData.price_star_stone !== undefined && Number(updateData.price_star_stone) < 0) {
      throw new BusinessError('价格不能为负', 'DECORATION_INVALID_PRICE', 400)
    }

    await sku.update(updateData, { transaction })
    logger.info('[装饰] 管理端更新SKU', {
      decoration_sku_id,
      fields: Object.keys(updateData)
    })
    return sku.toJSON()
  }

  /**
   * 【管理端】列出全部装饰 SKU（含草稿/下架，供运营管理）
   *
   * @param {Object} [options={}] - 查询选项
   * @returns {Promise<Array<Object>>} 装饰 SKU 列表
   */
  async listAllDecorationsForAdmin(options = {}) {
    const rows = await this.DecorationSku.findAll({
      include: [{ model: this.DecorationSeason, as: 'season', required: false }],
      order: [['sort_order', 'ASC']],
      transaction: options.transaction
    })
    return rows.map(r => r.toJSON())
  }

  /**
   * 【管理端】列出全部赛季
   *
   * @param {Object} [options={}] - 查询选项
   * @returns {Promise<Array<Object>>} 赛季列表
   */
  async listSeasons(options = {}) {
    const rows = await this.DecorationSeason.findAll({
      order: [['decoration_season_id', 'DESC']],
      transaction: options.transaction
    })
    return rows.map(r => r.toJSON())
  }

  /**
   * 【管理端】创建赛季
   *
   * @param {Object} data - 赛季数据 {season_code, season_name, start_at, end_at, status}
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 创建的赛季
   */
  async createSeason(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'DecorationService.createSeason')
    const { season_code, season_name, start_at = null, end_at = null, status = 'draft' } = data
    if (!season_code || !season_name) {
      throw new BusinessError('season_code/season_name 为必填', 'DECORATION_SEASON_INVALID', 400)
    }
    const season = await this.DecorationSeason.create(
      { season_code, season_name, start_at, end_at, status },
      { transaction }
    )
    logger.info('[装饰] 管理端创建赛季', { decoration_season_id: season.decoration_season_id })
    return season.toJSON()
  }

  /**
   * 【管理端】更新赛季（含状态 draft/active/ended）
   *
   * @param {number} decoration_season_id - 赛季ID
   * @param {Object} data - 更新字段
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 更新后的赛季
   */
  async updateSeason(decoration_season_id, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'DecorationService.updateSeason')
    const season = await this.DecorationSeason.findByPk(decoration_season_id, { transaction })
    if (!season) {
      throw new BusinessError('赛季不存在', 'DECORATION_SEASON_NOT_FOUND', 404)
    }
    const allowed = ['season_name', 'start_at', 'end_at', 'status']
    const updateData = {}
    for (const f of allowed) {
      if (data[f] !== undefined) updateData[f] = data[f]
    }
    if (updateData.status && !['draft', 'active', 'ended'].includes(updateData.status)) {
      throw new BusinessError('非法赛季状态', 'DECORATION_SEASON_INVALID_STATUS', 400)
    }
    await season.update(updateData, { transaction })
    logger.info('[装饰] 管理端更新赛季', {
      decoration_season_id,
      fields: Object.keys(updateData)
    })
    return season.toJSON()
  }
}

module.exports = DecorationService
