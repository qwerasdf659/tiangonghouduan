/**
 * @file 外部渠道映射服务（ExternalChannelMappingService）— S5 分销映射
 * @description 外部平台商品 ID 与我方 SPU 映射 CRUD + 同步状态管理
 * @module services/exchange/ExternalChannelMappingService
 */

'use strict'

/* eslint-disable valid-jsdoc, require-jsdoc */

const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { logger } = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')
const BusinessError = require('../../utils/BusinessError')

/** 渠道字典类型（拍板 #24：渠道字典化，管理台字典页可维护，加渠道零 DDL） */
const CHANNEL_DICT_TYPE = 'distribution_channel'

/**
 * @class ExternalChannelMappingService
 */
class ExternalChannelMappingService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.sequelize = models.sequelize
  }

  /**
   * 校验渠道码在字典中存在且启用（拍板 #24）
   *
   * @param {string} channel - 渠道码（如 taobao）
   * @param {Object} [options={}] - 配置（transaction 可选）
   * @returns {Promise<void>} 校验通过无返回，不通过抛 BusinessError
   * @private
   */
  async _assertChannelInDict(channel, options = {}) {
    const { SystemDictionary } = this.models
    const row = await SystemDictionary.findOne({
      where: { dict_type: CHANNEL_DICT_TYPE, dict_code: channel, is_enabled: 1 },
      transaction: options.transaction || null
    })
    if (!row) {
      throw new BusinessError(
        `渠道 ${channel} 不在启用的分销渠道字典中（字典类型 ${CHANNEL_DICT_TYPE}，可在管理台字典页维护）`,
        'CHANNEL_MAPPING_CHANNEL_NOT_IN_DICT',
        400
      )
    }
  }

  /**
   * 获取启用的分销渠道字典项（管理台下拉数据源）
   *
   * @returns {Promise<Array<{code:string,name:string}>>} 渠道列表
   */
  async listChannelDict() {
    const { SystemDictionary } = this.models
    const rows = await SystemDictionary.findAllByType(CHANNEL_DICT_TYPE)
    return rows.map(r => ({ code: r.dict_code, name: r.dict_name }))
  }

  /**
   * 分页查询渠道映射
   */
  async listChannelMappings(filters = {}, pagination = {}) {
    const { ExternalChannelMapping, ExchangeItem } = this.models
    const { Op } = this.sequelize.Sequelize

    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const where = {}
    if (filters.channel) where.channel = filters.channel
    if (filters.sync_status) where.sync_status = filters.sync_status
    if (filters.exchange_item_id) {
      const eid = Number(filters.exchange_item_id)
      if (!Number.isNaN(eid)) where.exchange_item_id = eid
    }
    if (filters.keyword && String(filters.keyword).trim()) {
      const kw = `%${String(filters.keyword).trim()}%`
      where[Op.or] = [{ external_item_id: { [Op.like]: kw } }, { channel: { [Op.like]: kw } }]
    }

    const { rows, count } = await ExternalChannelMapping.findAndCountAll({
      where,
      include: [
        {
          model: ExchangeItem,
          as: 'exchangeItem',
          attributes: ['exchange_item_id', 'item_code', 'item_name', 'status']
        }
      ],
      order: [['id', 'DESC']],
      limit: pageSize,
      offset
    })

    return {
      items: rows.map(r => r.toJSON()),
      total: count,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(count / pageSize)
    }
  }

  /**
   * 查询映射详情
   */
  async getChannelMapping(mappingId, options = {}) {
    const { ExternalChannelMapping, ExchangeItem } = this.models
    const transaction = options.transaction || null

    const mid = Number(mappingId)
    if (Number.isNaN(mid)) {
      throw new BusinessError('mapping_id 无效', 'CHANNEL_MAPPING_INVALID_ID', 400)
    }

    const row = await ExternalChannelMapping.findByPk(mid, {
      transaction,
      include: [{ model: ExchangeItem, as: 'exchangeItem' }]
    })

    if (!row) {
      throw new BusinessError('渠道映射不存在', 'CHANNEL_MAPPING_NOT_FOUND', 404)
    }
    return row.toJSON()
  }

  /**
   * 创建渠道映射
   */
  async createChannelMapping(data, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'ExternalChannelMappingService.createChannelMapping'
    )
    const { ExternalChannelMapping, ExchangeItem } = this.models

    const channel = String(data.channel || '')
      .trim()
      .toLowerCase()
    if (!channel) {
      throw new BusinessError('channel 不能为空', 'CHANNEL_MAPPING_INVALID_CHANNEL', 400)
    }
    await this._assertChannelInDict(channel, { transaction })

    const externalItemId = String(data.external_item_id || '').trim()
    if (!externalItemId) {
      throw new BusinessError(
        'external_item_id 不能为空',
        'CHANNEL_MAPPING_INVALID_EXTERNAL_ID',
        400
      )
    }

    const exchangeItemId = Number(data.exchange_item_id)
    if (Number.isNaN(exchangeItemId)) {
      throw new BusinessError('exchange_item_id 无效', 'CHANNEL_MAPPING_INVALID_ITEM', 400)
    }

    const item = await ExchangeItem.findByPk(exchangeItemId, { transaction })
    if (!item) {
      throw new BusinessError('我方商品不存在', 'CHANNEL_MAPPING_ITEM_NOT_FOUND', 404)
    }

    const existing = await ExternalChannelMapping.findOne({
      where: { channel, external_item_id: externalItemId },
      transaction
    })
    if (existing) {
      throw new BusinessError('该渠道外部商品 ID 已映射', 'CHANNEL_MAPPING_DUPLICATE', 409)
    }

    // 拍板 #28：一对一——同一我方商品在同一渠道只允许一条映射
    const itemMapped = await ExternalChannelMapping.findOne({
      where: { channel, exchange_item_id: exchangeItemId },
      transaction
    })
    if (itemMapped) {
      throw new BusinessError(
        `该商品在渠道 ${channel} 已有映射（id=${itemMapped.id}），一对一约束禁止重复映射`,
        'CHANNEL_MAPPING_ITEM_ALREADY_MAPPED',
        409
      )
    }

    const channelPrice = this._normalizeChannelPrice(data.channel_price)

    const created = await ExternalChannelMapping.create(
      {
        channel,
        external_item_id: externalItemId,
        exchange_item_id: exchangeItemId,
        sync_status: data.sync_status || 'pending',
        channel_price: channelPrice,
        last_synced_at: null
      },
      { transaction }
    )

    logger.info('[S5] 渠道映射创建成功', {
      id: created.id,
      channel,
      external_item_id: externalItemId,
      ts: BeijingTimeHelper.apiTimestamp()
    })

    return this.getChannelMapping(created.id, { transaction })
  }

  /**
   * 更新渠道映射
   */
  async updateChannelMapping(mappingId, data, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'ExternalChannelMappingService.updateChannelMapping'
    )
    const { ExternalChannelMapping, ExchangeItem } = this.models

    const mid = Number(mappingId)
    if (Number.isNaN(mid)) {
      throw new BusinessError('mapping_id 无效', 'CHANNEL_MAPPING_INVALID_ID', 400)
    }

    const row = await ExternalChannelMapping.findByPk(mid, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })
    if (!row) {
      throw new BusinessError('渠道映射不存在', 'CHANNEL_MAPPING_NOT_FOUND', 404)
    }

    const updates = {}
    if (data.exchange_item_id != null) {
      const eid = Number(data.exchange_item_id)
      if (Number.isNaN(eid)) {
        throw new BusinessError('exchange_item_id 无效', 'CHANNEL_MAPPING_INVALID_ITEM', 400)
      }
      const item = await ExchangeItem.findByPk(eid, { transaction })
      if (!item) {
        throw new BusinessError('我方商品不存在', 'CHANNEL_MAPPING_ITEM_NOT_FOUND', 404)
      }
      updates.exchange_item_id = eid
    }
    if (data.sync_status) updates.sync_status = data.sync_status
    if (data.external_item_id) updates.external_item_id = String(data.external_item_id).trim()
    if (data.channel) {
      const nextCh = String(data.channel).trim().toLowerCase()
      await this._assertChannelInDict(nextCh, { transaction })
      updates.channel = nextCh
    }
    if (data.channel_price !== undefined) {
      updates.channel_price = this._normalizeChannelPrice(data.channel_price)
    }

    if (updates.sync_status === 'synced') {
      updates.last_synced_at = BeijingTimeHelper.createDatabaseTime()
    }

    // 拍板 #28：改渠道/改商品后仍须满足「同商品同渠道一对一」
    const nextChannel = updates.channel || row.channel
    const nextItemId = updates.exchange_item_id || row.exchange_item_id
    if (updates.channel || updates.exchange_item_id) {
      const { Op } = this.sequelize.Sequelize
      const conflict = await ExternalChannelMapping.findOne({
        where: {
          channel: nextChannel,
          exchange_item_id: nextItemId,
          id: { [Op.ne]: mid }
        },
        transaction
      })
      if (conflict) {
        throw new BusinessError(
          `该商品在渠道 ${nextChannel} 已有映射（id=${conflict.id}），一对一约束禁止重复映射`,
          'CHANNEL_MAPPING_ITEM_ALREADY_MAPPED',
          409
        )
      }
    }

    if (Object.keys(updates).length > 0) {
      await row.update(updates, { transaction })
    }

    logger.info('[S5] 渠道映射更新成功', { id: mid, ts: BeijingTimeHelper.apiTimestamp() })
    return this.getChannelMapping(mid, { transaction })
  }

  /**
   * 归一化渠道价（拍板 #26：NULL=默认取我方价；有值须为非负数字，单位人民币元）
   *
   * @param {*} raw - 原始入参
   * @returns {number|null} 归一化后的渠道价
   * @private
   */
  _normalizeChannelPrice(raw) {
    if (raw === null || raw === undefined || raw === '') return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) {
      throw new BusinessError(
        'channel_price 必须为非负数字（人民币元）',
        'CHANNEL_MAPPING_INVALID_PRICE',
        400
      )
    }
    return Math.round(n * 100) / 100
  }

  /**
   * 删除渠道映射
   */
  async deleteChannelMapping(mappingId, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'ExternalChannelMappingService.deleteChannelMapping'
    )
    const { ExternalChannelMapping } = this.models

    const mid = Number(mappingId)
    const row = await ExternalChannelMapping.findByPk(mid, { transaction })
    if (!row) {
      throw new BusinessError('渠道映射不存在', 'CHANNEL_MAPPING_NOT_FOUND', 404)
    }

    await row.destroy({ transaction })
    logger.info('[S5] 渠道映射已删除', { id: mid, ts: BeijingTimeHelper.apiTimestamp() })
    return { id: mid, action: 'deleted' }
  }
}

module.exports = ExternalChannelMappingService
