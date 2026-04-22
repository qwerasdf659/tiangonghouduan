/**
 * DIY 款式模板管理服务
 *
 * 职责：款式模板 CRUD（管理端 + 用户端查询）
 *
 * @module services/diy/TemplateService
 */

'use strict'

const { Op } = require('sequelize')
const logger = require('../../utils/logger').logger
const OrderNoGenerator = require('../../utils/OrderNoGenerator')
const { DiyTemplate, DiyWork, Category, MediaFile } = require('../../models')

/** DIY 款式模板管理服务 */
class DiyTemplateService {
  /**
   * 获取模板列表（分页/筛选）
   * @param {Object} params - { page, page_size, status, is_enabled, category_id, keyword }
   * @returns {{ rows: DiyTemplate[], count: number }} 分页模板列表
   */
  static async getTemplateList(params = {}) {
    const { page = 1, page_size = 20, status, is_enabled, category_id, keyword } = params

    const where = {}
    if (status) where.status = status
    if (is_enabled !== undefined) where.is_enabled = is_enabled
    if (category_id) where.category_id = category_id
    if (keyword) where.display_name = { [Op.like]: `%${keyword}%` }

    return DiyTemplate.findAndCountAll({
      where,
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['category_id', 'category_name', 'category_code']
        },
        { model: MediaFile, as: 'preview_media', required: false },
        { model: MediaFile, as: 'base_image_media', required: false }
      ],
      order: [
        ['sort_order', 'ASC'],
        ['diy_template_id', 'DESC']
      ],
      limit: Number(page_size),
      offset: (Number(page) - 1) * Number(page_size)
    })
  }

  /**
   * 获取模板详情
   * @param {number} templateId - diy_template_id
   * @returns {DiyTemplate} 模板详情
   */
  static async getTemplateDetail(templateId) {
    const template = await DiyTemplate.findByPk(templateId, {
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['category_id', 'category_name', 'category_code']
        },
        { model: MediaFile, as: 'preview_media', required: false },
        { model: MediaFile, as: 'base_image_media', required: false }
      ]
    })

    if (!template) {
      const error = new Error('款式模板不存在')
      error.statusCode = 404
      throw error
    }

    return template
  }

  /**
   * 创建款式模板（管理端）
   * @param {Object} data - 模板数据
   * @param {Object} options - { transaction }
   * @returns {DiyTemplate} 新建的模板
   */
  static async createTemplate(data, options = {}) {
    const { transaction } = options

    /* 强制校验：底图和预览图是前端渲染的必要素材 */
    if (!data.base_image_media_id) {
      const error = new Error(
        '请上传款式底图（base_image_media_id），底图是小程序设计器渲染的必要素材'
      )
      error.statusCode = 400
      throw error
    }
    if (!data.preview_media_id) {
      const error = new Error('请上传模板预览图（preview_media_id），预览图用于模板列表展示')
      error.statusCode = 400
      throw error
    }

    /*
     * 生成 template_code（bizCode=DT）
     * 先创建记录获取自增ID，再回填 code
     */
    const template = await DiyTemplate.create(
      {
        ...data,
        template_code: 'DT_TEMP' // 临时占位，下面回填
      },
      { transaction }
    )

    const templateCode = OrderNoGenerator.generate(
      'DT',
      template.diy_template_id,
      template.created_at
    )
    await template.update({ template_code: templateCode }, { transaction })

    logger.info('[DIYService] 创建款式模板', {
      diy_template_id: template.diy_template_id,
      template_code: templateCode,
      display_name: data.display_name
    })

    return template
  }

  /**
   * 更新款式模板（管理端）
   * @param {number} templateId - diy_template_id
   * @param {Object} data - 更新数据
   * @param {Object} options - { transaction }
   * @returns {DiyTemplate} 更新后的模板
   */
  static async updateTemplate(templateId, data, options = {}) {
    const { transaction } = options

    const template = await DiyTemplate.findByPk(templateId, { transaction })
    if (!template) {
      const error = new Error('款式模板不存在')
      error.statusCode = 404
      throw error
    }

    // 禁止修改 template_code
    delete data.template_code
    delete data.diy_template_id

    /* 如果通过 update 直接设置 status=published，也要校验图片 */
    if (data.status === 'published') {
      const baseImageId = data.base_image_media_id || template.base_image_media_id
      const previewId = data.preview_media_id || template.preview_media_id
      if (!baseImageId) {
        const error = new Error('发布失败：请先上传款式底图（base_image_media_id）')
        error.statusCode = 400
        throw error
      }
      if (!previewId) {
        const error = new Error('发布失败：请先上传模板预览图（preview_media_id）')
        error.statusCode = 400
        throw error
      }
    }

    await template.update(data, { transaction })

    logger.info('[DIYService] 更新款式模板', {
      diy_template_id: templateId,
      updated_fields: Object.keys(data)
    })

    return template
  }

  /**
   * 变更模板状态（独立接口，含状态机校验）
   *
   * 合法转换：draft → published, published → archived, archived → published
   *
   * @param {number} templateId - diy_template_id
   * @param {string} newStatus - 目标状态
   * @param {Object} options - { transaction }
   * @returns {DiyTemplate} 更新后的模板
   */
  static async updateTemplateStatus(templateId, newStatus, options = {}) {
    const { transaction } = options

    const VALID_TRANSITIONS = {
      draft: ['published'],
      published: ['archived'],
      archived: ['published']
    }

    const template = await DiyTemplate.findByPk(templateId, { transaction, lock: true })
    if (!template) {
      const error = new Error('款式模板不存在')
      error.statusCode = 404
      throw error
    }

    const allowed = VALID_TRANSITIONS[template.status] || []
    if (!allowed.includes(newStatus)) {
      const error = new Error(
        `状态转换不合法：${template.status} → ${newStatus}（允许：${allowed.join(', ') || '无'}）`
      )
      error.statusCode = 409
      throw error
    }

    /* 发布前强制校验：底图 + 预览图必须存在 */
    if (newStatus === 'published') {
      if (!template.base_image_media_id) {
        const error = new Error('发布失败：请先上传款式底图（base_image_media_id）')
        error.statusCode = 400
        throw error
      }
      if (!template.preview_media_id) {
        const error = new Error('发布失败：请先上传模板预览图（preview_media_id）')
        error.statusCode = 400
        throw error
      }
    }

    await template.update({ status: newStatus }, { transaction })

    logger.info('[DIYService] 模板状态变更', {
      diy_template_id: templateId,
      from: template.previous('status'),
      to: newStatus
    })

    return template
  }

  /**
   * 删除款式模板（管理端，硬删除）
   * @param {number} templateId - diy_template_id
   * @param {Object} options - { transaction }
   * @returns {void}
   */
  static async deleteTemplate(templateId, options = {}) {
    const { transaction } = options

    // 检查是否有关联的用户作品
    const workCount = await DiyWork.count({
      where: { diy_template_id: templateId },
      transaction
    })
    if (workCount > 0) {
      const error = new Error(`该模板下有 ${workCount} 个用户作品，无法删除`)
      error.statusCode = 409
      throw error
    }

    const deleted = await DiyTemplate.destroy({
      where: { diy_template_id: templateId },
      transaction
    })
    if (deleted === 0) {
      const error = new Error('款式模板不存在')
      error.statusCode = 404
      throw error
    }

    logger.info('[DIYService] 删除款式模板', { diy_template_id: templateId })
  }

  /**
   * 获取用户端模板列表（仅返回已发布+已启用的模板，按分类分组）
   * @returns {DiyTemplate[]} 用户可见的模板列表
   */
  static async getUserTemplates() {
    return DiyTemplate.findAll({
      where: { status: 'published', is_enabled: true },
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['category_id', 'category_name', 'category_code']
        },
        { model: MediaFile, as: 'preview_media', required: false },
        { model: MediaFile, as: 'base_image_media', required: false }
      ],
      order: [
        ['sort_order', 'ASC'],
        ['diy_template_id', 'ASC']
      ]
    })
  }
}

module.exports = DiyTemplateService
