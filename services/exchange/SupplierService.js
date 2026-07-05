/**
 * @file 供应商服务（SupplierService）— 供货商主数据 CRUD + 商品关联 + 货号辅助查询
 * @description
 * 商品编码体系供应商维度的管理服务（docs/商品编码体系设计方案.md §3.8/§4.5/§6）。
 * - 供货商（进货来源）与核销商家 merchants（抽佣/结算）语义不同，彻底分表（拍4）。
 * - 一个 SPU 可挂多个供应商（多源采购），关联落在 exchange_item_suppliers，货号挂关联行。
 * - 货号 supplier_item_code 是「他们的语言」：可空、可重复，仅采购对账参考；系统内部只认我方 item_code。
 *
 * 分层约束：写操作强制外部传入事务（assertAndGetTransaction），路由经 ServiceManager 获取本服务。
 *
 * @module services/exchange/SupplierService
 */

'use strict'

const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { logger } = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')
const BusinessError = require('../../utils/BusinessError')

/**
 * 供应商服务（实例服务，依赖 models）
 * @class SupplierService
 */
class SupplierService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.sequelize = models.sequelize
  }

  /**
   * 分页查询供应商列表
   *
   * @param {Object} [filters={}] - 筛选：status、keyword（模糊匹配 supplier_name / contact_name / contact_phone）
   * @param {Object} [pagination={}] - 分页：page、page_size
   * @returns {Promise<{items:Array,total:number,page:number,page_size:number,total_pages:number}>} 分页结果
   */
  async listSuppliers(filters = {}, pagination = {}) {
    const { Supplier } = this.models
    const { Op } = this.sequelize.Sequelize

    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const where = {}
    if (filters.status) where.status = filters.status
    if (filters.keyword && String(filters.keyword).trim()) {
      const kw = `%${String(filters.keyword).trim()}%`
      where[Op.or] = [
        { supplier_name: { [Op.like]: kw } },
        { contact_name: { [Op.like]: kw } },
        { contact_phone: { [Op.like]: kw } }
      ]
    }

    const { rows, count } = await Supplier.findAndCountAll({
      where,
      order: [['supplier_id', 'DESC']],
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
   * 查询单个供应商（含供货 SPU 关联行）
   *
   * @param {number|string} supplierId - 供应商 ID
   * @returns {Promise<Object>} 供应商记录（plain，含 item_links 关联行数组）
   */
  async getSupplier(supplierId) {
    const { Supplier, ExchangeItemSupplier, ExchangeItem } = this.models
    const sid = Number(supplierId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('supplier_id 无效', 'SUPPLIER_INVALID_ID', 400)
    }
    const row = await Supplier.findByPk(sid, {
      include: [
        {
          model: ExchangeItemSupplier,
          as: 'itemLinks',
          required: false,
          include: [
            {
              model: ExchangeItem,
              as: 'exchangeItem',
              attributes: ['exchange_item_id', 'item_code', 'item_name', 'status'],
              required: false
            }
          ]
        }
      ]
    })
    if (!row) {
      throw new BusinessError('供应商不存在', 'SUPPLIER_NOT_FOUND', 404)
    }
    return row.toJSON()
  }

  /**
   * 创建供应商（supplier_name 唯一，防运营重复建档）
   *
   * @param {Object} data - 供应商字段：supplier_name、contact_name?、contact_phone?、status?、notes?
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<Object>} 创建的供应商记录
   */
  async createSupplier(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'SupplierService.createSupplier')
    const { Supplier } = this.models

    const supplierName = data.supplier_name ? String(data.supplier_name).trim() : ''
    if (!supplierName) {
      throw new BusinessError('supplier_name 不能为空', 'SUPPLIER_INVALID_NAME', 400)
    }

    const existing = await Supplier.findOne({
      where: { supplier_name: supplierName },
      transaction
    })
    if (existing) {
      throw new BusinessError(`供应商名称已存在: ${supplierName}`, 'SUPPLIER_NAME_DUPLICATE', 409)
    }

    const created = await Supplier.create(
      {
        supplier_name: supplierName,
        contact_name: data.contact_name ? String(data.contact_name).trim() : null,
        contact_phone: data.contact_phone ? String(data.contact_phone).trim() : null,
        status: data.status || 'active',
        notes: data.notes ? String(data.notes).trim() : null
      },
      { transaction }
    )
    logger.info('SupplierService.createSupplier 成功', {
      supplier_id: created.supplier_id,
      supplier_name: supplierName,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return created.toJSON()
  }

  /**
   * 更新供应商（名称变更需再次唯一校验）
   *
   * @param {number|string} supplierId - 供应商 ID
   * @param {Object} data - 要更新字段：supplier_name?、contact_name?、contact_phone?、status?、notes?
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<Object>} 更新后的供应商记录
   */
  async updateSupplier(supplierId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'SupplierService.updateSupplier')
    const { Supplier } = this.models

    const sid = Number(supplierId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('supplier_id 无效', 'SUPPLIER_INVALID_ID', 400)
    }
    const row = await Supplier.findByPk(sid, { transaction })
    if (!row) {
      throw new BusinessError('供应商不存在', 'SUPPLIER_NOT_FOUND', 404)
    }

    const patch = {}
    if (data.supplier_name !== undefined) {
      const supplierName = String(data.supplier_name).trim()
      if (!supplierName) {
        throw new BusinessError('supplier_name 不能为空', 'SUPPLIER_INVALID_NAME', 400)
      }
      if (supplierName !== row.supplier_name) {
        const dup = await Supplier.findOne({
          where: { supplier_name: supplierName },
          transaction
        })
        if (dup) {
          throw new BusinessError(
            `供应商名称已存在: ${supplierName}`,
            'SUPPLIER_NAME_DUPLICATE',
            409
          )
        }
      }
      patch.supplier_name = supplierName
    }
    if (data.contact_name !== undefined) {
      patch.contact_name = data.contact_name ? String(data.contact_name).trim() : null
    }
    if (data.contact_phone !== undefined) {
      patch.contact_phone = data.contact_phone ? String(data.contact_phone).trim() : null
    }
    if (data.status != null) patch.status = data.status
    if (data.notes !== undefined) {
      patch.notes = data.notes ? String(data.notes).trim() : null
    }

    await row.update(patch, { transaction })
    logger.info('SupplierService.updateSupplier 成功', {
      supplier_id: sid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return row.toJSON()
  }

  /**
   * 删除供应商（存在商品关联行时禁止删除，先解除关联再删——关键业务数据 RESTRICT 保护语义）
   *
   * @param {number|string} supplierId - 供应商 ID
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<void>} 无返回；不存在或被引用时抛异常
   */
  async deleteSupplier(supplierId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'SupplierService.deleteSupplier')
    const { Supplier, ExchangeItemSupplier } = this.models

    const sid = Number(supplierId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('supplier_id 无效', 'SUPPLIER_INVALID_ID', 400)
    }

    const refCount = await ExchangeItemSupplier.count({
      where: { supplier_id: sid },
      transaction
    })
    if (refCount > 0) {
      throw new BusinessError(
        `存在 ${refCount} 个商品关联该供应商，禁止删除（请先在商品上解除关联）`,
        'SUPPLIER_REFERENCED',
        409
      )
    }

    const deleted = await Supplier.destroy({ where: { supplier_id: sid }, transaction })
    if (!deleted) {
      throw new BusinessError('供应商不存在', 'SUPPLIER_NOT_FOUND', 404)
    }
    logger.info('SupplierService.deleteSupplier 成功', {
      supplier_id: sid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
  }

  /**
   * 全量替换某 SPU 的供应商关联行（商品编辑表单「多供应商区块」提交入口）
   *
   * 业务规则（§3.8）：
   * - links 每行：{ supplier_id, supplier_item_code?, is_primary? }；(exchange_item_id, supplier_id) 唯一。
   * - 货号可空可重复（脏数据如实存）；is_primary 最多一行（多行传 true 时取第一行，其余强制 false）。
   * - 传空数组 = 解除全部关联（自营/未知来源，等价"供应商可空"）。
   *
   * @param {number|string} exchangeItemId - 商品 SPU ID
   * @param {Array<Object>} links - 关联行数组
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<Array<Object>>} 替换后的关联行（含供应商名称）
   */
  async replaceItemSupplierLinks(exchangeItemId, links, options = {}) {
    const transaction = assertAndGetTransaction(options, 'SupplierService.replaceItemSupplierLinks')
    const { ExchangeItem, ExchangeItemSupplier, Supplier } = this.models

    const pid = Number(exchangeItemId)
    if (Number.isNaN(pid)) {
      throw new BusinessError('exchange_item_id 无效', 'SUPPLIER_LINK_INVALID_ITEM_ID', 400)
    }
    const item = await ExchangeItem.findByPk(pid, { transaction })
    if (!item) {
      throw new BusinessError('商品不存在', 'PRODUCT_CENTER_PRODUCT_NOT_FOUND', 404)
    }

    const linkRows = Array.isArray(links) ? links : []

    // 校验供应商存在 + supplier_id 去重（同一 SPU 同一供应商只挂一行）
    const supplierIds = linkRows.map(l => Number(l.supplier_id))
    if (supplierIds.some(Number.isNaN)) {
      throw new BusinessError('supplier_id 无效', 'SUPPLIER_INVALID_ID', 400)
    }
    if (new Set(supplierIds).size !== supplierIds.length) {
      throw new BusinessError(
        '同一供应商在关联列表中重复出现（同一 SPU 同一供应商只能挂一行）',
        'SUPPLIER_LINK_DUPLICATE',
        400
      )
    }
    if (supplierIds.length > 0) {
      const found = await Supplier.count({
        where: { supplier_id: supplierIds },
        transaction
      })
      if (found !== supplierIds.length) {
        throw new BusinessError('存在无效的供应商 ID（供应商不存在）', 'SUPPLIER_NOT_FOUND', 404)
      }
    }

    // is_primary 归一化：最多一行主供货商（多行传 true 取第一行）
    let primarySeen = false
    const normalized = linkRows.map(l => {
      let isPrimary = !!l.is_primary
      if (isPrimary && primarySeen) isPrimary = false
      if (isPrimary) primarySeen = true
      return {
        exchange_item_id: pid,
        supplier_id: Number(l.supplier_id),
        supplier_item_code: l.supplier_item_code ? String(l.supplier_item_code).trim() : null,
        is_primary: isPrimary
      }
    })

    // 全量替换（先删后建；关联行是纯配置数据，不在资产/物品互锁组内，直接替换安全）
    await ExchangeItemSupplier.destroy({ where: { exchange_item_id: pid }, transaction })
    const created = await ExchangeItemSupplier.bulkCreate(normalized, { transaction })

    logger.info('SupplierService.replaceItemSupplierLinks 成功', {
      exchange_item_id: pid,
      link_count: created.length,
      ts: BeijingTimeHelper.apiTimestamp()
    })

    // 返回带供应商名称的关联行（前端零映射直读）
    const withSupplier = await ExchangeItemSupplier.findAll({
      where: { exchange_item_id: pid },
      include: [
        {
          model: Supplier,
          as: 'supplier',
          attributes: ['supplier_id', 'supplier_name', 'status'],
          required: false
        }
      ],
      transaction
    })
    return withSupplier.map(r => r.toJSON())
  }

  /**
   * 查询某 SPU 的供应商关联行（商品编辑表单回显）
   *
   * @param {number|string} exchangeItemId - 商品 SPU ID
   * @returns {Promise<Array<Object>>} 关联行数组（含供应商名称）
   */
  async getItemSupplierLinks(exchangeItemId) {
    const { ExchangeItemSupplier, Supplier } = this.models
    const pid = Number(exchangeItemId)
    if (Number.isNaN(pid)) {
      throw new BusinessError('exchange_item_id 无效', 'SUPPLIER_LINK_INVALID_ITEM_ID', 400)
    }
    const rows = await ExchangeItemSupplier.findAll({
      where: { exchange_item_id: pid },
      include: [
        {
          model: Supplier,
          as: 'supplier',
          attributes: ['supplier_id', 'supplier_name', 'status'],
          required: false
        }
      ],
      order: [
        ['is_primary', 'DESC'],
        ['id', 'ASC']
      ]
    })
    return rows.map(r => r.toJSON())
  }

  /**
   * 货号辅助查询（§3.8：按货号找货，模糊匹配 + 供应商筛选 + 组合定位）
   *
   * 业务规则：
   * - supplier_item_code 可重复 → 结果多条命中如实返回（不去重、不合并），列表标注"共 N 条"。
   * - 每条带 供应商名 + 我方 item_code + 商品名，让运营据我方码精确定位。
   * - 同一供应商对多个 SPU 用相同货号时，返回 duplicate_in_supplier=true（非阻断"⚠️ 重复货号"提示）。
   *
   * @param {Object} [filters={}] - 筛选：supplier_item_code?（模糊）、supplier_id?（精确）
   * @param {Object} [pagination={}] - 分页：page、page_size
   * @returns {Promise<{items:Array,total:number,page:number,page_size:number,total_pages:number}>} 命中列表
   */
  async searchBySupplierItemCode(filters = {}, pagination = {}) {
    const { ExchangeItemSupplier, ExchangeItem, Supplier } = this.models
    const { Op } = this.sequelize.Sequelize

    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const where = {}
    const codeKw = filters.supplier_item_code ? String(filters.supplier_item_code).trim() : ''
    if (codeKw) {
      where.supplier_item_code = { [Op.like]: `%${codeKw}%` }
    }
    if (filters.supplier_id != null && filters.supplier_id !== '') {
      const sid = Number(filters.supplier_id)
      if (Number.isNaN(sid)) {
        throw new BusinessError('supplier_id 无效', 'SUPPLIER_INVALID_ID', 400)
      }
      where.supplier_id = sid
    }
    if (!codeKw && where.supplier_id === undefined) {
      throw new BusinessError(
        '请至少提供 supplier_item_code（货号关键词）或 supplier_id（供应商）之一',
        'SUPPLIER_CODE_SEARCH_EMPTY',
        400
      )
    }

    const { rows, count } = await ExchangeItemSupplier.findAndCountAll({
      where,
      include: [
        {
          model: ExchangeItem,
          as: 'exchangeItem',
          attributes: ['exchange_item_id', 'item_code', 'item_name', 'status'],
          required: false
        },
        {
          model: Supplier,
          as: 'supplier',
          attributes: ['supplier_id', 'supplier_name', 'status'],
          required: false
        }
      ],
      order: [['id', 'DESC']],
      limit: pageSize,
      offset
    })

    /*
     * 冲突提示（§3.8 第4条）：同一供应商 + 同一货号命中多个 SPU 时标注 duplicate_in_supplier。
     * 针对本页命中行的 (supplier_id, supplier_item_code) 组合回查全表计数（一次 GROUP BY，避免 N+1）。
     */
    const pairKeys = rows
      .filter(r => r.supplier_item_code)
      .map(r => ({ supplier_id: r.supplier_id, supplier_item_code: r.supplier_item_code }))
    const dupSet = new Set()
    if (pairKeys.length > 0) {
      const dupRows = await ExchangeItemSupplier.findAll({
        attributes: [
          'supplier_id',
          'supplier_item_code',
          [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'cnt']
        ],
        where: {
          [Op.or]: pairKeys.map(p => ({
            supplier_id: p.supplier_id,
            supplier_item_code: p.supplier_item_code
          }))
        },
        group: ['supplier_id', 'supplier_item_code'],
        raw: true
      })
      for (const d of dupRows) {
        if (Number(d.cnt) > 1) dupSet.add(`${d.supplier_id}::${d.supplier_item_code}`)
      }
    }

    const items = rows.map(r => {
      const plain = r.toJSON()
      plain.duplicate_in_supplier = plain.supplier_item_code
        ? dupSet.has(`${plain.supplier_id}::${plain.supplier_item_code}`)
        : false
      return plain
    })

    return {
      items,
      total: count,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(count / pageSize)
    }
  }

  /**
   * 商品主数据健康统计（§8.3 增强看板 7/12/13，并入 dashboard 卡片区）
   *
   * 统计口径（实连真实库聚合，非预设数据）：
   * - item_code_null_count：item_code 未回填（NULL）的 SPU 数（盯回填进度）
   * - spu_total / sku_total：SPU/SKU 总数
   * - no_supplier_item_count：无供应商归属的 SPU 数（自营/未知来源，供采购侧核对）
   * - missing_supplier_code_count：已挂供应商但货号缺失的关联行数（缺货号率分子）
   * - duplicate_supplier_codes：同一供应商下重复货号清单（非阻断，人工核对）
   * - supplier_distribution：按供应商统计供货 SPU 数 / 在售数（识别供货集中度）
   *
   * @returns {Promise<Object>} 健康统计对象
   */
  async getProductCodeHealthStats() {
    const { sequelize } = this
    const { QueryTypes } = this.sequelize.Sequelize

    const [[spuStats], [skuStats], [linkStats], duplicateCodes, supplierDistribution] =
      await Promise.all([
        sequelize
          .query(
            `SELECT COUNT(*) AS spu_total,
                SUM(CASE WHEN item_code IS NULL THEN 1 ELSE 0 END) AS item_code_null_count,
                SUM(CASE WHEN series_id IS NOT NULL THEN 1 ELSE 0 END) AS in_series_count
         FROM exchange_items`,
            { type: QueryTypes.SELECT }
          )
          .then(r => [r[0] || {}]),
        sequelize
          .query(
            `SELECT COUNT(*) AS sku_total,
                SUM(CASE WHEN barcode IS NULL THEN 1 ELSE 0 END) AS barcode_null_count
         FROM exchange_item_skus`,
            { type: QueryTypes.SELECT }
          )
          .then(r => [r[0] || {}]),
        sequelize
          .query(
            `SELECT
           (SELECT COUNT(*) FROM exchange_items ei
            WHERE NOT EXISTS (SELECT 1 FROM exchange_item_suppliers eis
                              WHERE eis.exchange_item_id = ei.exchange_item_id)) AS no_supplier_item_count,
           (SELECT COUNT(*) FROM exchange_item_suppliers
            WHERE supplier_item_code IS NULL OR supplier_item_code = '') AS missing_supplier_code_count,
           (SELECT COUNT(*) FROM exchange_item_suppliers) AS link_total`,
            { type: QueryTypes.SELECT }
          )
          .then(r => [r[0] || {}]),
        sequelize.query(
          `SELECT eis.supplier_id, s.supplier_name, eis.supplier_item_code, COUNT(*) AS spu_count
         FROM exchange_item_suppliers eis
         JOIN suppliers s ON s.supplier_id = eis.supplier_id
         WHERE eis.supplier_item_code IS NOT NULL AND eis.supplier_item_code != ''
         GROUP BY eis.supplier_id, s.supplier_name, eis.supplier_item_code
         HAVING COUNT(*) > 1
         ORDER BY spu_count DESC
         LIMIT 50`,
          { type: QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT s.supplier_id, s.supplier_name, s.status,
                COUNT(eis.id) AS supply_spu_count,
                SUM(CASE WHEN ei.status = 'active' THEN 1 ELSE 0 END) AS active_spu_count,
                SUM(CASE WHEN eis.supplier_item_code IS NULL OR eis.supplier_item_code = ''
                    THEN 1 ELSE 0 END) AS missing_code_count
         FROM suppliers s
         LEFT JOIN exchange_item_suppliers eis ON eis.supplier_id = s.supplier_id
         LEFT JOIN exchange_items ei ON ei.exchange_item_id = eis.exchange_item_id
         GROUP BY s.supplier_id, s.supplier_name, s.status
         ORDER BY supply_spu_count DESC`,
          { type: QueryTypes.SELECT }
        )
      ])

    return {
      spu_total: Number(spuStats.spu_total || 0),
      item_code_null_count: Number(spuStats.item_code_null_count || 0),
      in_series_count: Number(spuStats.in_series_count || 0),
      sku_total: Number(skuStats.sku_total || 0),
      barcode_null_count: Number(skuStats.barcode_null_count || 0),
      no_supplier_item_count: Number(linkStats.no_supplier_item_count || 0),
      missing_supplier_code_count: Number(linkStats.missing_supplier_code_count || 0),
      supplier_link_total: Number(linkStats.link_total || 0),
      duplicate_supplier_codes: duplicateCodes.map(d => ({
        supplier_id: String(d.supplier_id),
        supplier_name: d.supplier_name,
        supplier_item_code: d.supplier_item_code,
        spu_count: Number(d.spu_count)
      })),
      supplier_distribution: supplierDistribution.map(d => ({
        supplier_id: String(d.supplier_id),
        supplier_name: d.supplier_name,
        status: d.status,
        supply_spu_count: Number(d.supply_spu_count || 0),
        active_spu_count: Number(d.active_spu_count || 0),
        missing_code_count: Number(d.missing_code_count || 0)
      }))
    }
  }
}

module.exports = SupplierService
