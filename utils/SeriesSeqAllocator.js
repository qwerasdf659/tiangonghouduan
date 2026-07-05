/**
 * 产品系列连号发号器（SeriesSeqAllocator）
 *
 * 业务场景（详见 docs/商品编码体系设计方案.md §3.6 / §5.1）：
 * - 双轨制中的「可读系列号」轨道：同一产品系列需要一组可读、连续的编码（如 SLNB-001/002/003），
 *   用于系列归类、手册/包装成套印刷、实物批次连号。
 * - 与随机主码 item_code 各司其职：主码防枚举保密、系列号可读连续（主动印给顾客看的成套信息）。
 *
 * 并发安全：
 * - 发号必须在事务内对 product_series 目标行加行锁（SELECT ... FOR UPDATE），避免并发重号。
 * - (series_id, series_seq) 唯一索引兜底；序号不回收，允许空号，保证系列内连续可追溯。
 *
 * @module utils/SeriesSeqAllocator
 */

'use strict'

/**
 * 系列连号发号器（静态类）
 * @class SeriesSeqAllocator
 */
class SeriesSeqAllocator {
  /**
   * 在事务内为指定系列分配「系列内下一个连续序号」
   *
   * 实现：行锁读 product_series.next_seq → 返回当前值作为本次序号 → next_seq + 1 落库。
   *
   * @param {number|string} seriesId - 系列主键（product_series.series_id）
   * @param {Object} transaction - Sequelize 事务实例（必须，发号强制在事务内）
   * @returns {Promise<{ series_seq: number, seq_pad: number }>}
   *   series_seq：本次分配的序号；seq_pad：该系列的补零位数（用于展示形拼装）
   * @throws {Error} 事务缺失、系列不存在时抛错
   */
  static async allocate(seriesId, transaction) {
    if (!transaction) {
      throw new Error('SeriesSeqAllocator.allocate 必须在事务内调用（需行锁防并发重号）')
    }

    // 延迟引入 models，避免与 models/index.js 形成加载期循环依赖
    const { ProductSeries } = require('../models')
    if (!ProductSeries) {
      throw new Error('ProductSeries 模型未注册，无法发号')
    }

    const sid = Number(seriesId)
    if (Number.isNaN(sid)) {
      throw new Error(`series_id 无效: ${seriesId}`)
    }

    // 行锁读取目标系列（FOR UPDATE），保证并发下序号不重复
    const series = await ProductSeries.findByPk(sid, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })
    if (!series) {
      throw new Error(`系列不存在: series_id=${sid}`)
    }

    const currentSeq = series.next_seq
    await series.update({ next_seq: currentSeq + 1 }, { transaction })

    return {
      series_seq: currentSeq,
      seq_pad: series.seq_pad
    }
  }

  /**
   * 组装系列号展示形：{series_code}-{补零序号}
   *
   * @param {string} seriesCode - 可读系列码（如 'SLNB'）
   * @param {number} seq - 系列内序号
   * @param {number} [pad=3] - 补零位数（默认 3 → '001'）
   * @returns {string} 展示形系列号（如 'SLNB-001'）
   *
   * @example
   * SeriesSeqAllocator.format('SLNB', 1)      // 'SLNB-001'
   * SeriesSeqAllocator.format('SLNB', 42, 3)  // 'SLNB-042'
   */
  static format(seriesCode, seq, pad = 3) {
    if (!seriesCode || seq === null || seq === undefined) return ''
    return `${String(seriesCode).toUpperCase()}-${String(seq).padStart(pad, '0')}`
  }
}

module.exports = SeriesSeqAllocator
