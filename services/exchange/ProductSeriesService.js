/**
 * @file 产品系列服务（ProductSeriesService）— 系列 CRUD + 连号发号协同
 * @description
 * 商品编码体系双轨制之「可读系列号」轨道的管理服务（docs/商品编码体系设计方案.md §3.6/§6）。
 * - 系列码 series_code 运营手填 + 后端唯一性校验（全大写归一化）。
 * - 序号发号由 utils/SeriesSeqAllocator 在 ExchangeItemService 创建 SPU 事务内完成，本服务只管系列主数据 CRUD。
 *
 * 分层约束：写操作强制外部传入事务（assertAndGetTransaction），路由经 ServiceManager 获取本服务。
 */

'use strict'

const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { logger } = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')
const BusinessError = require('../../utils/BusinessError')

/**
 * 产品系列服务（实例服务，依赖 models）
 */
class ProductSeriesService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.sequelize = models.sequelize
  }

  /**
   * 归一化系列码：转大写 + 去除非字母数字字符（与编码字符集口径一致）
   * @param {string} input - 原始系列码
   * @returns {string} 归一化后的系列码
   */
  static normalizeSeriesCode(input) {
    if (input === null || input === undefined) return ''
    return String(input)
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
  }

  /**
   * 分页查询系列列表
   *
   * @param {Object} [filters={}] - 筛选：status、keyword（模糊匹配 series_code / series_name）
   * @param {Object} [pagination={}] - 分页：page、page_size
   * @returns {Promise<{items:Array,total:number,page:number,page_size:number,total_pages:number}>} 分页结果
   */
  async listSeries(filters = {}, pagination = {}) {
    const { ProductSeries } = this.models
    const { Op } = this.sequelize.Sequelize

    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const where = {}
    if (filters.status) where.status = filters.status
    if (filters.keyword && String(filters.keyword).trim()) {
      const kw = `%${String(filters.keyword).trim()}%`
      where[Op.or] = [{ series_code: { [Op.like]: kw } }, { series_name: { [Op.like]: kw } }]
    }

    const { rows, count } = await ProductSeries.findAndCountAll({
      where,
      order: [['series_id', 'DESC']],
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
   * 查询单个系列
   *
   * @param {number|string} seriesId - 系列 ID
   * @returns {Promise<Object>} 系列记录（plain）
   */
  async getSeries(seriesId) {
    const { ProductSeries } = this.models
    const sid = Number(seriesId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('series_id 无效', 'PRODUCT_SERIES_INVALID_ID', 400)
    }
    const row = await ProductSeries.findByPk(sid)
    if (!row) {
      throw new BusinessError('系列不存在', 'PRODUCT_SERIES_NOT_FOUND', 404)
    }
    return row.toJSON()
  }

  /**
   * 创建系列（series_code 运营手填 + 后端唯一校验 + 全大写归一化）
   *
   * @param {Object} data - 系列字段：series_code、series_name、seq_pad?、status?
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<Object>} 创建的系列记录
   */
  async createSeries(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ProductSeriesService.createSeries')
    const { ProductSeries } = this.models

    const seriesCode = ProductSeriesService.normalizeSeriesCode(data.series_code)
    if (!seriesCode) {
      throw new BusinessError('series_code 不能为空', 'PRODUCT_SERIES_INVALID_CODE', 400)
    }
    if (!data.series_name || !String(data.series_name).trim()) {
      throw new BusinessError('series_name 不能为空', 'PRODUCT_SERIES_INVALID_NAME', 400)
    }

    const existing = await ProductSeries.findOne({
      where: { series_code: seriesCode },
      transaction
    })
    if (existing) {
      throw new BusinessError(`系列码已存在: ${seriesCode}`, 'PRODUCT_SERIES_CODE_DUPLICATE', 409)
    }

    const created = await ProductSeries.create(
      {
        series_code: seriesCode,
        series_name: String(data.series_name).trim(),
        next_seq: 1,
        seq_pad: data.seq_pad != null ? Number(data.seq_pad) : 3,
        status: data.status || 'active'
      },
      { transaction }
    )
    logger.info('ProductSeriesService.createSeries 成功', {
      series_id: created.series_id,
      series_code: seriesCode,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return created.toJSON()
  }

  /**
   * 更新系列（series_code 变更需再次唯一校验；next_seq 不允许人工改，由发号器维护）
   *
   * @param {number|string} seriesId - 系列 ID
   * @param {Object} data - 要更新字段：series_code?、series_name?、seq_pad?、status?
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<Object>} 更新后的系列记录
   */
  async updateSeries(seriesId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ProductSeriesService.updateSeries')
    const { ProductSeries } = this.models

    const sid = Number(seriesId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('series_id 无效', 'PRODUCT_SERIES_INVALID_ID', 400)
    }
    const row = await ProductSeries.findByPk(sid, { transaction })
    if (!row) {
      throw new BusinessError('系列不存在', 'PRODUCT_SERIES_NOT_FOUND', 404)
    }

    const patch = {}
    if (data.series_code !== undefined) {
      const seriesCode = ProductSeriesService.normalizeSeriesCode(data.series_code)
      if (!seriesCode) {
        throw new BusinessError('series_code 不能为空', 'PRODUCT_SERIES_INVALID_CODE', 400)
      }
      if (seriesCode !== row.series_code) {
        const dup = await ProductSeries.findOne({ where: { series_code: seriesCode }, transaction })
        if (dup) {
          throw new BusinessError(
            `系列码已存在: ${seriesCode}`,
            'PRODUCT_SERIES_CODE_DUPLICATE',
            409
          )
        }
      }
      patch.series_code = seriesCode
    }
    if (data.series_name !== undefined) {
      if (!String(data.series_name).trim()) {
        throw new BusinessError('series_name 不能为空', 'PRODUCT_SERIES_INVALID_NAME', 400)
      }
      patch.series_name = String(data.series_name).trim()
    }
    if (data.seq_pad != null) patch.seq_pad = Number(data.seq_pad)
    if (data.status != null) patch.status = data.status

    await row.update(patch, { transaction })
    logger.info('ProductSeriesService.updateSeries 成功', {
      series_id: sid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return row.toJSON()
  }

  /**
   * 删除系列（存在归属商品时禁止删除，避免 series_seq 悬空破坏连号可追溯性）
   *
   * @param {number|string} seriesId - 系列 ID
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<void>} 无返回；不存在或被引用时抛异常
   */
  async deleteSeries(seriesId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ProductSeriesService.deleteSeries')
    const { ProductSeries, ExchangeItem } = this.models

    const sid = Number(seriesId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('series_id 无效', 'PRODUCT_SERIES_INVALID_ID', 400)
    }

    const refCount = await ExchangeItem.count({ where: { series_id: sid }, transaction })
    if (refCount > 0) {
      throw new BusinessError(
        `存在 ${refCount} 个商品归属该系列，禁止删除（请先移出商品）`,
        'PRODUCT_SERIES_REFERENCED',
        409
      )
    }

    const deleted = await ProductSeries.destroy({ where: { series_id: sid }, transaction })
    if (!deleted) {
      throw new BusinessError('系列不存在', 'PRODUCT_SERIES_NOT_FOUND', 404)
    }
    logger.info('ProductSeriesService.deleteSeries 成功', {
      series_id: sid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
  }
}

module.exports = ProductSeriesService
