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
const { DiyMaterial, DiyTemplate, DiyWork, Category, MediaFile } = require('../../models')
const { deriveCordOccupyMm } = require('./MaterialService')

/**
 * 全局默认弹力/工艺余量（毫米），模板 sizing_rules.elastic_margin_mm 可覆盖（拍板 Q7：15mm）
 *
 * 唯一定义处：estimate 换算 / confirm 长度校验（WorkService）/ 长度偏差统计（AdminQueryService）
 * 三处均从本模块引用，禁止再定义副本（避免口径漂移）。
 */
const DEFAULT_ELASTIC_MARGIN_MM = 15

/**
 * 串珠模式布局形状（手围/长度规则仅对串珠模板生效，slots 镶嵌模板不适用）
 * 唯一定义处，WorkService / AdminQueryService 从本模块引用。
 */
const BEADING_SHAPES = ['circle', 'ellipse', 'arc', 'line']

/**
 * 判断模板是否为串珠模式（手围驱动方案只作用于串珠模板）
 * @param {DiyTemplate|Object} template - 模板实例或 plain 对象
 * @returns {boolean} 是否串珠模式
 */
function isBeadingTemplate(template) {
  return BEADING_SHAPES.includes(template.layout?.shape)
}

/**
 * 用户端模板序列化（数据最小化，拍板决议 11.5-D）
 *
 * preview_media / base_image_media 用 MediaFile.toSafeJSON() 输出：
 * 隐藏 object_key / uploaded_by / thumbnail_keys（对象存储 key 非 URL），
 * 补齐 public_url + thumbnails.w375/w750/w1080 衍生图 URL（前端降级链数据源）。
 * 其余模板字段（layout/bead_rules/sizing_rules/capacity_rules 等）原样下发。
 *
 * @param {DiyTemplate} template - 模板模型实例（含媒体关联）
 * @returns {Object} 用户端安全的模板数据
 */
function toUserTemplateJSON(template) {
  const plain = template.toJSON()
  plain.preview_media = template.preview_media ? template.preview_media.toSafeJSON() : null
  plain.base_image_media = template.base_image_media ? template.base_image_media.toSafeJSON() : null
  return plain
}

/** DIY 款式模板管理服务 */
class DiyTemplateService {
  /**
   * 获取模板列表（分页/筛选）
   *
   * 完备度快捷筛选（拍板决议 11.6-4 P0，配合完备度卡片做成运营工作清单）：
   * - missing_preview=true     缺预览图模板（preview_media_id IS NULL）
   * - missing_base_image=true  缺底图模板（base_image_media_id IS NULL）
   *
   * @param {Object} params - { page, page_size, status, is_enabled, category_id, keyword,
   *   missing_preview, missing_base_image }
   * @returns {{ rows: DiyTemplate[], count: number }} 分页模板列表
   */
  static async getTemplateList(params = {}) {
    const {
      page = 1,
      page_size = 20,
      status,
      is_enabled,
      category_id,
      keyword,
      missing_preview,
      missing_base_image
    } = params

    const where = {}
    if (status) where.status = status
    if (is_enabled !== undefined) where.is_enabled = is_enabled
    if (category_id) where.category_id = category_id
    if (keyword) where.display_name = { [Op.like]: `%${keyword}%` }
    if (missing_preview === 'true' || missing_preview === true) where.preview_media_id = null
    if (missing_base_image === 'true' || missing_base_image === true) {
      where.base_image_media_id = null
    }

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

      /*
       * 发布护栏（手围驱动方案 §11.5）：按"本次更新落库后的最终状态"校验
       * 尺寸规则/布局/素材分组可能就在本次 update 中修改，合并后再判
       */
      await DiyTemplateService._assertPublishable({
        layout: data.layout !== undefined ? data.layout : template.layout,
        sizing_rules: data.sizing_rules !== undefined ? data.sizing_rules : template.sizing_rules,
        material_group_codes:
          data.material_group_codes !== undefined
            ? data.material_group_codes
            : template.material_group_codes
      })
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

      /* 发布护栏（手围驱动方案 §11.5）：尺寸档位毫米数据 + 可用素材物理数据完整 */
      await DiyTemplateService._assertPublishable(template)
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
   *
   * 输出经 toUserTemplateJSON 收敛（媒体字段数据最小化，拍板决议 11.5-D）
   *
   * @returns {Object[]} 用户可见的模板列表（安全序列化后的普通对象）
   */
  static async getUserTemplates() {
    const templates = await DiyTemplate.findAll({
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

    return templates.map(toUserTemplateJSON)
  }

  /**
   * 获取用户端模板详情（小程序端专用）
   *
   * 与管理端 getTemplateDetail 的区别（拍板决议 11.5-D：管理端接口不变）：
   * - 媒体字段经 toUserTemplateJSON 收敛（隐藏 object_key，补衍生图 URL）
   *
   * @param {number} templateId - diy_template_id
   * @returns {Object} 用户端安全的模板详情
   */
  static async getUserTemplateDetail(templateId) {
    const template = await DiyTemplateService.getTemplateDetail(templateId)
    return toUserTemplateJSON(template)
  }

  /**
   * 手围算珠估算（手围驱动方案拍板 Q2 方案甲：换算规则收敛在后端，前端不写公式）
   *
   * 换算规则：
   * - target_length_mm（目标成品周长）：优先取 sizing_rules.size_options 中
   *   wrist_size_mm 完全匹配档位的配置值，否则 = 手围 + 弹力余量
   * - recommend_bead_count = round(target_length_mm / diameter)，并按 capacity_rules 收敛
   * - 可制作范围：min = 手围本身（短于手围戴不上）；max = 目标周长 + 弹力余量
   * - 项链等无手围概念的模板：档位只配 target_length_mm，前端把所选档位的佩戴长度
   *   作为 wrist_size_mm 传入，档位匹配同时按 wrist_size_mm / target_length_mm 双字段命中
   *
   * @param {number} templateId - diy_template_id
   * @param {Object} params - 查询参数 { wrist_size_mm: 手围毫米, diameter: 主珠直径毫米 }
   * @returns {Object} 估算结果（字段见 return 结构，全部毫米单位）
   */
  static async estimateBeadCount(templateId, params = {}) {
    const wristSizeMm = Number(params.wrist_size_mm)
    const diameter = Number(params.diameter)

    if (!Number.isFinite(wristSizeMm) || wristSizeMm <= 0) {
      const error = new Error('wrist_size_mm 必须为正数（毫米）')
      error.statusCode = 400
      throw error
    }
    if (!Number.isFinite(diameter) || diameter <= 0) {
      const error = new Error('diameter 必须为正数（毫米）')
      error.statusCode = 400
      throw error
    }

    const template = await DiyTemplateService.getTemplateDetail(templateId)

    if (!isBeadingTemplate(template)) {
      const error = new Error('镶嵌模式模板不支持手围估算（仅串珠模板适用）')
      error.statusCode = 400
      error.errorCode = 'DIY_TEMPLATE_NOT_BEADING'
      throw error
    }

    const sizing = template.sizing_rules
    if (!sizing || !Array.isArray(sizing.size_options) || sizing.size_options.length === 0) {
      const error = new Error('该模板未配置尺寸规则，不支持手围估算')
      error.statusCode = 400
      error.errorCode = 'DIY_SIZING_RULES_MISSING'
      throw error
    }

    const elasticMarginMm = Number(sizing.elastic_margin_mm) || DEFAULT_ELASTIC_MARGIN_MM

    /*
     * 优先匹配运营配置的档位（配置值是商品口径权威，公式推导只是兜底）：
     * 手链按 wrist_size_mm 命中；项链档位无手围概念，按 target_length_mm（佩戴长度）命中
     */
    const matched = sizing.size_options.find(
      opt =>
        Number(opt.wrist_size_mm) === wristSizeMm || Number(opt.target_length_mm) === wristSizeMm
    )
    const targetLengthMm =
      matched && Number.isFinite(Number(matched.target_length_mm))
        ? Number(matched.target_length_mm)
        : wristSizeMm + elasticMarginMm

    /* 参考颗数 = 目标周长 ÷ 珠径，再按容量规则收敛（兜底防呆，拍板①保留口径） */
    let recommendBeadCount = Math.round(targetLengthMm / diameter)
    const capacityRules = template.capacity_rules || {}
    if (capacityRules.min_beads) {
      recommendBeadCount = Math.max(recommendBeadCount, Number(capacityRules.min_beads))
    }
    if (capacityRules.max_beads) {
      recommendBeadCount = Math.min(recommendBeadCount, Number(capacityRules.max_beads))
    }

    return {
      wrist_size_mm: wristSizeMm,
      diameter,
      elastic_margin_mm: elasticMarginMm,
      target_length_mm: targetLengthMm,
      recommend_bead_count: recommendBeadCount,
      /* 可制作范围：低于手围戴不上，高于目标+余量视为过长（confirm 硬校验同口径） */
      min_length_mm: wristSizeMm,
      max_length_mm: targetLengthMm + elasticMarginMm,
      matched_size_label: matched ? matched.label : null
    }
  }

  /**
   * 发布前置护栏（手围驱动方案 §11.5，与既有"底图/预览图必填"护栏同哲学）
   *
   * 仅对串珠模板校验（slots 镶嵌模板无手围/长度概念）：
   * 1. 尺寸规则完整：size_options 每档必须含数值型 wrist_size_mm 或 target_length_mm
   *    （手链品类两者都要；项链品类允许只配 target_length_mm）
   * 2. 素材物理数据完整：模板可用素材（material_group_codes 范围内已启用）不得存在
   *    沿绳占用无法派生的项（拍板 Q6：拒绝发布，错误信息列出素材编码清单）
   *
   * @param {DiyTemplate} template - 待发布的模板实例
   * @returns {Promise<void>} 校验不通过时抛错（statusCode=400 + errorCode）
   * @private
   */
  static async _assertPublishable(template) {
    if (!isBeadingTemplate(template)) return

    // ---- 护栏 1：尺寸档位数据完整 ----
    const sizing = template.sizing_rules
    const sizeOptions = sizing && Array.isArray(sizing.size_options) ? sizing.size_options : []
    if (sizeOptions.length === 0) {
      const error = new Error('发布失败：串珠模板必须配置尺寸规则（sizing_rules.size_options）')
      error.statusCode = 400
      error.errorCode = 'DIY_SIZING_RULES_MISSING'
      throw error
    }
    const invalidOptions = sizeOptions.filter(
      opt =>
        !Number.isFinite(Number(opt.target_length_mm)) &&
        !Number.isFinite(Number(opt.wrist_size_mm))
    )
    if (invalidOptions.length > 0) {
      const labels = invalidOptions.map(opt => opt.label || '?').join(', ')
      const error = new Error(
        `发布失败：尺寸档位 [${labels}] 缺少 wrist_size_mm / target_length_mm 毫米数据，请在模板编辑中补录`
      )
      error.statusCode = 400
      error.errorCode = 'DIY_SIZING_RULES_INCOMPLETE'
      throw error
    }

    // ---- 护栏 2：可用素材物理数据完整（拍板 Q6：拒绝发布） ----
    const materialWhere = { is_enabled: true }
    const groupCodes = template.material_group_codes
    if (Array.isArray(groupCodes) && groupCodes.length > 0) {
      materialWhere.group_code = { [Op.in]: groupCodes }
    }
    const materials = await DiyMaterial.findAll({
      where: materialWhere,
      attributes: [
        'material_code',
        'bore_orientation',
        'diameter',
        'size_length_mm',
        'size_width_mm'
      ],
      raw: true
    })
    const missingPhysical = materials
      .filter(mat => deriveCordOccupyMm(mat) === null)
      .map(mat => mat.material_code)
    if (missingPhysical.length > 0) {
      const error = new Error(
        `发布失败：以下素材缺少沿绳尺寸数据（管珠缺长边/药片缺短边/圆珠缺直径），请先补录：${missingPhysical.join(', ')}`
      )
      error.statusCode = 400
      error.errorCode = 'DIY_MATERIAL_SIZE_MISSING'
      error.data = { material_codes: missingPhysical }
      throw error
    }
  }
}

module.exports = DiyTemplateService
/* 手围驱动方案共享常量（WorkService 校验 / AdminQueryService 统计复用，保证三处同口径） */
module.exports.DEFAULT_ELASTIC_MARGIN_MM = DEFAULT_ELASTIC_MARGIN_MM
module.exports.BEADING_SHAPES = BEADING_SHAPES
