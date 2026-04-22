/**
 * DIY 管理后台查询服务
 *
 * 职责：管理端作品列表/详情/统计查询
 *
 * @module services/diy/AdminQueryService
 */

'use strict'

const { Op, fn, col, literal } = require('sequelize')
const {
  Account,
  Category,
  DiyTemplate,
  DiyWork,
  ExchangeRecord,
  MediaFile,
  User
} = require('../../models')

/** DIY 管理后台查询服务 */
class DiyAdminQueryService {
  /**
   * 管理端获取所有用户作品列表（支持筛选/分页）
   * @param {Object} params - { page, page_size, status, template_id, account_id, keyword }
   * @returns {{rows: DiyWork[], count: number}} 管理端分页作品列表
   */
  static async getAdminWorkList(params = {}) {
    const page = Number(params.page) || 1
    const pageSize = Number(params.page_size) || 20
    const where = {}

    if (params.status) where.status = params.status
    if (params.template_id) where.diy_template_id = Number(params.template_id)
    if (params.account_id) where.account_id = Number(params.account_id)
    if (params.keyword) {
      where[Op.or] = [
        { work_name: { [Op.like]: `%${params.keyword}%` } },
        { work_code: { [Op.like]: `%${params.keyword}%` } }
      ]
    }

    const { rows, count } = await DiyWork.findAndCountAll({
      where,
      include: [
        {
          model: DiyTemplate,
          as: 'template',
          attributes: ['diy_template_id', 'template_code', 'display_name', 'layout']
        },
        {
          model: Account,
          as: 'account',
          attributes: ['account_id', 'user_id'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['user_id', 'nickname', 'mobile']
            }
          ]
        },
        {
          model: MediaFile,
          as: 'preview_media',
          attributes: ['media_id', 'object_key', 'original_name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    })

    return { rows, count }
  }

  /**
   * 管理端获取作品详情
   * @param {number} workId - diy_work_id
   * @returns {DiyWork} 管理端作品详情
   */
  static async getAdminWorkDetail(workId) {
    const work = await DiyWork.findByPk(workId, {
      include: [
        {
          model: DiyTemplate,
          as: 'template',
          attributes: [
            'diy_template_id',
            'template_code',
            'display_name',
            'category_id',
            'layout',
            'bead_rules'
          ],
          include: [
            {
              model: Category,
              as: 'category',
              attributes: ['category_id', 'category_name', 'category_code']
            }
          ]
        },
        {
          model: Account,
          as: 'account',
          attributes: ['account_id', 'user_id'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['user_id', 'nickname', 'mobile']
            }
          ]
        },
        {
          model: MediaFile,
          as: 'preview_media',
          attributes: ['media_id', 'object_key', 'original_name']
        }
      ]
    })

    if (!work) {
      const error = new Error('作品不存在')
      error.statusCode = 404
      throw error
    }

    return work
  }

  /**
   * 管理端 DIY 数据统计
   * @returns {Object} DIY 业务统计数据
   */
  static async getAdminStats() {
    // 模板统计
    const templateTotal = await DiyTemplate.count()
    const templatePublished = await DiyTemplate.count({
      where: { status: 'published', is_enabled: true }
    })

    // 作品统计
    const workTotal = await DiyWork.count()
    const workByStatus = await DiyWork.findAll({
      attributes: ['status', [fn('COUNT', col('diy_work_id')), 'count']],
      group: ['status'],
      raw: true
    })

    // 模板使用排行（按作品数量）
    const templateRanking = await DiyWork.findAll({
      attributes: ['diy_template_id', [fn('COUNT', col('diy_work_id')), 'work_count']],
      include: [
        {
          model: DiyTemplate,
          as: 'template',
          attributes: ['display_name', 'template_code']
        }
      ],
      group: [
        'diy_template_id',
        'template.diy_template_id',
        'template.display_name',
        'template.template_code'
      ],
      order: [[literal('work_count'), 'DESC']],
      limit: 10,
      raw: false
    })

    // 最近 7 天每日新增作品数
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const dailyWorks = await DiyWork.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('diy_work_id')), 'count']
      ],
      where: { created_at: { [require('sequelize').Op.gte]: sevenDaysAgo } },
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true
    })

    return {
      templates: {
        total: templateTotal,
        published: templatePublished
      },
      works: {
        total: workTotal,
        by_status: workByStatus.reduce((acc, r) => {
          acc[r.status] = Number(r.count)
          return acc
        }, {}),
        daily_trend: dailyWorks.map(d => ({ date: d.date, count: Number(d.count) }))
      },
      template_ranking: templateRanking.map(r => ({
        diy_template_id: r.diy_template_id,
        display_name: r.template?.display_name || '-',
        template_code: r.template?.template_code || '-',
        work_count: Number(r.dataValues?.work_count || r.work_count || 0)
      }))
    }
  }

  /**
   * 管理端获取作品关联的兑换订单
   *
   * 通过 exchange_records.source = 'diy' AND business_id = 'diy_exchange_{workId}' 关联
   *
   * @param {number} workId - diy_work_id
   * @returns {Object|null} 关联的兑换订单（含 address_snapshot、发货信息）
   */
  static async getWorkExchangeRecord(workId) {
    const record = await ExchangeRecord.findOne({
      where: {
        source: 'diy',
        business_id: `diy_exchange_${workId}`
      }
    })

    return record
  }
}

module.exports = DiyAdminQueryService
