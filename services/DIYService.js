/**
 * DIY 饰品设计引擎 — 核心业务服务
 *
 * 职责：
 * - 款式模板 CRUD（管理端）
 * - 用户作品 CRUD + 状态流转（小程序端）
 * - 可用材料查询（联动 material_asset_types + account_asset_balances）
 * - 确认设计（冻结材料）/ 取消设计（解冻材料）/ 完成设计（扣减 + 铸造）
 *
 * @module services/DIYService
 * @version 2.0.0
 */

'use strict'

const { Op } = require('sequelize')
const logger = require('../utils/logger').logger
const { getImageUrl } = require('../utils/ImageUrlHelper')
const OrderNoGenerator = require('../utils/OrderNoGenerator')

/** DIY 饰品设计引擎核心业务服务 */
class DIYService {
  // ==================== 款式模板（管理端）====================

  /**
   * 获取模板列表（分页/筛选）
   * @param {Object} params - { page, page_size, status, is_enabled, category_id, keyword }
   * @returns {{ rows: DiyTemplate[], count: number }} 分页模板列表
   */
  static async getTemplateList(params = {}) {
    const { DiyTemplate, Category, MediaFile } = require('../models')
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
    const { DiyTemplate, Category, MediaFile } = require('../models')

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
    const { DiyTemplate } = require('../models')
    const { transaction } = options

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
    const { DiyTemplate } = require('../models')
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
    const { DiyTemplate } = require('../models')
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
    const { DiyTemplate, DiyWork } = require('../models')
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

  // ==================== 用户端：模板查询 ====================

  /**
   * 获取用户端模板列表（仅返回已发布+已启用的模板，按分类分组）
   * @returns {DiyTemplate[]} 用户可见的模板列表
   */
  static async getUserTemplates() {
    const { DiyTemplate, Category, MediaFile } = require('../models')

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

  /**
   * 获取模板可用材料列表（含用户持有量）
   *
   * 联动 material_asset_types + media_attachments + account_asset_balances
   *
   * @param {number} templateId - diy_template_id
   * @param {number} accountId - 用户 account_id
   * @returns {Object[]} 材料列表
   */
  static async getTemplateMaterials(templateId, accountId) {
    const {
      DiyTemplate,
      MaterialAssetType,
      AccountAssetBalance,
      MediaAttachment,
      MediaFile
    } = require('../models')

    const template = await DiyTemplate.findByPk(templateId)
    if (!template) {
      const error = new Error('款式模板不存在')
      error.statusCode = 404
      throw error
    }

    // 构建材料查询条件
    const materialWhere = {}
    const groupCodes = template.material_group_codes
    if (groupCodes && Array.isArray(groupCodes) && groupCodes.length > 0) {
      materialWhere.group_code = { [Op.in]: groupCodes }
    }

    // 查询所有符合条件的材料类型
    const materials = await MaterialAssetType.findAll({
      where: materialWhere,
      order: [
        ['group_code', 'ASC'],
        ['display_name', 'ASC']
      ]
    })

    // 批量查询用户持有量
    const assetCodes = materials.map(m => m.asset_code)
    const balances = await AccountAssetBalance.findAll({
      where: {
        account_id: accountId,
        asset_code: { [Op.in]: assetCodes }
      }
    })
    const balanceMap = new Map(balances.map(b => [b.asset_code, b]))

    // 批量查询材料图片（通过 media_attachments 多态关联）
    const attachments = await MediaAttachment.findAll({
      where: {
        attachable_type: 'material_asset_type',
        attachable_id: { [Op.in]: materials.map(m => m.material_asset_type_id) }
      },
      include: [
        { model: MediaFile, as: 'media', attributes: ['media_id', 'object_key', 'thumbnail_keys'] }
      ]
    })
    const imageMap = new Map()
    for (const att of attachments) {
      if (att.media) {
        let thumbnailKey = att.media.object_key
        if (att.media.thumbnail_keys) {
          const keys =
            typeof att.media.thumbnail_keys === 'string'
              ? JSON.parse(att.media.thumbnail_keys)
              : att.media.thumbnail_keys
          if (Array.isArray(keys) && keys.length > 0) thumbnailKey = keys[0]
        }
        imageMap.set(Number(att.attachable_id), {
          image_url: getImageUrl(att.media.object_key),
          thumbnail_url: getImageUrl(thumbnailKey)
        })
      }
    }

    // 组装返回数据
    return materials.map(m => {
      const balance = balanceMap.get(m.asset_code)
      const images = imageMap.get(m.material_asset_type_id) || {}
      return {
        asset_code: m.asset_code,
        display_name: m.display_name,
        group_code: m.group_code,
        form: m.form,
        image_url: images.image_url || null,
        thumbnail_url: images.thumbnail_url || null,
        available_amount: balance ? Number(balance.available_amount) : 0,
        frozen_amount: balance ? Number(balance.frozen_amount) : 0
      }
    })
  }

  // ==================== 用户端：作品 CRUD ====================

  /**
   * 获取用户作品列表
   * @param {number} accountId - 用户 account_id
   * @param {Object} params - { page, page_size, status }
   * @returns {{ rows: DiyWork[], count: number }} 分页作品列表
   */
  static async getWorkList(accountId, params = {}) {
    const { DiyWork, DiyTemplate, MediaFile } = require('../models')
    const { page = 1, page_size = 20, status } = params

    const where = { account_id: accountId }
    if (status) where.status = status

    return DiyWork.findAndCountAll({
      where,
      include: [
        {
          model: DiyTemplate,
          as: 'template',
          attributes: ['diy_template_id', 'template_code', 'display_name', 'layout']
        },
        { model: MediaFile, as: 'preview_media', required: false }
      ],
      order: [['updated_at', 'DESC']],
      limit: Number(page_size),
      offset: (Number(page) - 1) * Number(page_size)
    })
  }

  /**
   * 获取作品详情
   * @param {number} workId - diy_work_id
   * @param {number} accountId - 用户 account_id（权限校验）
   * @returns {DiyWork} 作品详情
   */
  static async getWorkDetail(workId, accountId) {
    const { DiyWork, DiyTemplate, Category, MediaFile } = require('../models')

    const work = await DiyWork.findByPk(workId, {
      include: [
        {
          model: DiyTemplate,
          as: 'template',
          include: [
            {
              model: Category,
              as: 'category',
              attributes: ['category_id', 'category_name', 'category_code']
            },
            { model: MediaFile, as: 'base_image_media', required: false }
          ]
        },
        { model: MediaFile, as: 'preview_media', required: false }
      ]
    })

    if (!work) {
      const error = new Error('作品不存在')
      error.statusCode = 404
      throw error
    }
    if (work.account_id !== accountId) {
      const error = new Error('无权访问该作品')
      error.statusCode = 403
      throw error
    }

    return work
  }

  /**
   * 保存作品（创建或更新草稿）
   *
   * 前端每次保存设计都调用此接口，如果传了 diy_work_id 则更新，否则创建
   *
   * @param {number} accountId - 用户 account_id
   * @param {Object} data - { diy_work_id?, diy_template_id, work_name, design_data, total_cost, preview_media_id }
   * @param {Object} options - { transaction }
   * @returns {DiyWork} 保存后的作品
   */
  static async saveWork(accountId, data, options = {}) {
    const { DiyWork, DiyTemplate } = require('../models')
    const { transaction } = options

    // 校验模板存在
    const template = await DiyTemplate.findByPk(data.diy_template_id, { transaction })
    if (!template) {
      const error = new Error('款式模板不存在')
      error.statusCode = 404
      throw error
    }

    // 校验材料合法性
    if (data.design_data) {
      await DIYService._validateDesignMaterials(template, data.design_data)
    }

    if (data.diy_work_id) {
      // 更新已有作品（仅 draft 状态可编辑）
      const work = await DiyWork.findByPk(data.diy_work_id, { transaction })
      if (!work) {
        const error = new Error('作品不存在')
        error.statusCode = 404
        throw error
      }
      if (work.account_id !== accountId) {
        const error = new Error('无权修改该作品')
        error.statusCode = 403
        throw error
      }
      if (work.status !== 'draft') {
        const error = new Error(`作品状态为 ${work.status}，仅草稿状态可编辑`)
        error.statusCode = 409
        throw error
      }

      await work.update(
        {
          work_name: data.work_name || work.work_name,
          design_data: data.design_data || work.design_data,
          total_cost: data.total_cost || work.total_cost,
          preview_media_id:
            data.preview_media_id !== undefined ? data.preview_media_id : work.preview_media_id
        },
        { transaction }
      )

      logger.info('[DIYService] 更新作品草稿', { diy_work_id: work.diy_work_id })
      return work
    }

    // 创建新作品
    const work = await DiyWork.create(
      {
        account_id: accountId,
        diy_template_id: data.diy_template_id,
        work_name: data.work_name || '我的设计',
        design_data: data.design_data,
        total_cost: data.total_cost || [],
        preview_media_id: data.preview_media_id || null,
        work_code: 'DW_TEMP', // 临时占位
        status: 'draft'
      },
      { transaction }
    )

    const workCode = OrderNoGenerator.generate('DW', work.diy_work_id, work.created_at)
    await work.update({ work_code: workCode }, { transaction })

    logger.info('[DIYService] 创建新作品', {
      diy_work_id: work.diy_work_id,
      work_code: workCode,
      account_id: accountId
    })

    return work
  }

  /**
   * 删除作品（仅 draft 状态可删除，硬删除）
   * @param {number} workId - diy_work_id
   * @param {number} accountId - 用户 account_id
   * @param {Object} options - { transaction }
   * @returns {void}
   */
  static async deleteWork(workId, accountId, options = {}) {
    const { DiyWork } = require('../models')
    const { transaction } = options

    const work = await DiyWork.findByPk(workId, { transaction })
    if (!work) {
      const error = new Error('作品不存在')
      error.statusCode = 404
      throw error
    }
    if (work.account_id !== accountId) {
      const error = new Error('无权删除该作品')
      error.statusCode = 403
      throw error
    }
    if (work.status !== 'draft') {
      const error = new Error(`作品状态为 ${work.status}，仅草稿状态可删除`)
      error.statusCode = 409
      throw error
    }

    await work.destroy({ transaction })
    logger.info('[DIYService] 删除作品', { diy_work_id: workId, account_id: accountId })
  }

  // ==================== 用户端：状态流转 ====================

  /**
   * 确认设计 — 冻结材料
   *
   * draft → frozen：根据 total_cost 逐项调用 BalanceService.freeze 冻结用户材料
   *
   * @param {number} workId - diy_work_id
   * @param {number} accountId - 用户 account_id（权限校验用）
   * @param {Object} options - { transaction, userId }（必须在事务中）
   * @returns {DiyWork} 冻结后的作品
   */
  static async confirmDesign(workId, accountId, options = {}) {
    const { DiyWork } = require('../models')
    const BalanceService = require('./asset/BalanceService')
    const { transaction, userId } = options

    const work = await DiyWork.findByPk(workId, { transaction, lock: true })
    if (!work) {
      const error = new Error('作品不存在')
      error.statusCode = 404
      throw error
    }
    if (work.account_id !== accountId) {
      const error = new Error('无权操作该作品')
      error.statusCode = 403
      throw error
    }
    if (work.status !== 'draft') {
      const error = new Error(`作品状态为 ${work.status}，仅草稿状态可确认`)
      error.statusCode = 409
      throw error
    }

    const totalCost = work.total_cost
    if (!totalCost || !Array.isArray(totalCost) || totalCost.length === 0) {
      const error = new Error('作品材料消耗明细为空，无法确认')
      error.statusCode = 400
      throw error
    }

    // 逐项冻结材料（BalanceService.freeze 要求 user_id + idempotency_key）
    for (const cost of totalCost) {
      await BalanceService.freeze(
        {
          user_id: userId,
          asset_code: cost.asset_code,
          amount: cost.amount,
          business_type: 'diy_freeze_material',
          idempotency_key: `diy_freeze_${work.diy_work_id}_${cost.asset_code}`
        },
        { transaction }
      )
    }

    await work.update(
      {
        status: 'frozen',
        frozen_at: new Date()
      },
      { transaction }
    )

    logger.info('[DIYService] 确认设计，材料已冻结', {
      diy_work_id: workId,
      account_id: accountId,
      frozen_items: totalCost.length
    })

    return work
  }

  /**
   * 完成设计 — 从冻结扣减材料 + 铸造 items 实例
   *
   * frozen → completed：
   * 1. 逐项调用 BalanceService.settleFromFrozen 从冻结余额扣减
   * 2. 调用 ItemService.mintItem 铸造 diy_product 实例（写 item_ledger 双录）
   * 3. 更新 diy_works.item_id + status + completed_at
   *
   * 三表互锁安全：items ↔ item_ledger ↔ item_holds 全部在同一事务内
   *
   * @param {number} workId - diy_work_id
   * @param {number} accountId - 用户 account_id（权限校验用）
   * @param {Object} options - { transaction, userId }（必须在事务中）
   * @returns {DiyWork} 完成后的作品（含 item_id）
   */
  static async completeDesign(workId, accountId, options = {}) {
    const { DiyWork, DiyTemplate } = require('../models')
    const BalanceService = require('./asset/BalanceService')
    const ItemService = require('./asset/ItemService')
    const { transaction, userId } = options

    const work = await DiyWork.findByPk(workId, {
      transaction,
      lock: true,
      include: [
        { model: DiyTemplate, as: 'template', attributes: ['display_name', 'template_code'] }
      ]
    })
    if (!work) {
      const error = new Error('作品不存在')
      error.statusCode = 404
      throw error
    }
    if (work.account_id !== accountId) {
      const error = new Error('无权操作该作品')
      error.statusCode = 403
      throw error
    }
    if (work.status !== 'frozen') {
      const error = new Error(`作品状态为 ${work.status}，仅冻结状态可完成`)
      error.statusCode = 409
      throw error
    }

    const totalCost = work.total_cost
    if (!totalCost || !Array.isArray(totalCost) || totalCost.length === 0) {
      const error = new Error('作品材料消耗明细为空')
      error.statusCode = 400
      throw error
    }

    // Step 1: 逐项从冻结余额扣减（settleFromFrozen = frozen_amount -= amount）
    for (const cost of totalCost) {
      await BalanceService.settleFromFrozen(
        {
          user_id: userId,
          asset_code: cost.asset_code,
          amount: cost.amount,
          business_type: 'diy_settle_material',
          idempotency_key: `diy_settle_${work.diy_work_id}_${cost.asset_code}`
        },
        { transaction }
      )
    }

    // Step 2: 铸造 items 实例（写 item_ledger 双录）
    const templateName = work.template?.display_name || '未知模板'
    const { item } = await ItemService.mintItem(
      {
        user_id: userId,
        item_type: 'diy_product',
        source: 'diy',
        source_ref_id: String(work.diy_work_id),
        item_name: work.work_name || `${templateName} DIY作品`,
        item_description: `DIY设计作品 - ${templateName}`,
        business_type: 'diy_mint',
        idempotency_key: `diy_mint_${work.diy_work_id}`,
        meta: {
          diy_work_id: work.diy_work_id,
          diy_template_id: work.diy_template_id,
          template_code: work.template?.template_code,
          design_data: work.design_data,
          total_cost: work.total_cost
        }
      },
      { transaction }
    )

    // Step 3: 更新作品状态
    await work.update(
      {
        status: 'completed',
        item_id: item.item_id,
        completed_at: new Date()
      },
      { transaction }
    )

    logger.info('[DIYService] 完成设计，材料已扣减，物品已铸造', {
      diy_work_id: workId,
      account_id: accountId,
      item_id: item.item_id,
      settled_items: totalCost.length
    })

    return work
  }

  /**
   * 取消设计 — 解冻材料
   *
   * frozen → cancelled：逐项调用 BalanceService.unfreeze 解冻用户材料
   *
   * @param {number} workId - diy_work_id
   * @param {number} accountId - 用户 account_id（权限校验用）
   * @param {Object} options - { transaction, userId }（必须在事务中）
   * @returns {DiyWork} 取消后的作品
   */
  static async cancelDesign(workId, accountId, options = {}) {
    const { DiyWork } = require('../models')
    const BalanceService = require('./asset/BalanceService')
    const { transaction, userId } = options

    const work = await DiyWork.findByPk(workId, { transaction, lock: true })
    if (!work) {
      const error = new Error('作品不存在')
      error.statusCode = 404
      throw error
    }
    if (work.account_id !== accountId) {
      const error = new Error('无权操作该作品')
      error.statusCode = 403
      throw error
    }
    if (work.status !== 'frozen') {
      const error = new Error(`作品状态为 ${work.status}，仅冻结状态可取消`)
      error.statusCode = 409
      throw error
    }

    const totalCost = work.total_cost || []

    // 逐项解冻材料（BalanceService.unfreeze 要求 user_id + idempotency_key）
    for (const cost of totalCost) {
      await BalanceService.unfreeze(
        {
          user_id: userId,
          asset_code: cost.asset_code,
          amount: cost.amount,
          business_type: 'diy_unfreeze_material',
          idempotency_key: `diy_unfreeze_${work.diy_work_id}_${cost.asset_code}`
        },
        { transaction }
      )
    }

    await work.update({ status: 'cancelled' }, { transaction })

    logger.info('[DIYService] 取消设计，材料已解冻', {
      diy_work_id: workId,
      account_id: accountId
    })

    return work
  }

  // ==================== 管理端查看接口 ====================

  /**
   * 管理端获取所有用户作品列表（支持筛选/分页）
   * @param {Object} params - { page, page_size, status, template_id, account_id, keyword }
   * @returns {{rows: DiyWork[], count: number}} 管理端分页作品列表
   */
  static async getAdminWorkList(params = {}) {
    const { DiyWork, DiyTemplate, Account, User, MediaFile } = require('../models')
    const { Op } = require('sequelize')

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
    const { DiyWork, DiyTemplate, Account, User, MediaFile, Category } = require('../models')

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
    const { DiyTemplate, DiyWork } = require('../models')
    const { fn, col, literal } = require('sequelize')

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

  // ==================== 管理端：材料/珠子素材 CRUD ====================

  /**
   * 管理端获取材料列表（分页/筛选）
   * @param {Object} params - { page, page_size, group_code, category_id, keyword, is_enabled }
   * @returns {{rows: DiyMaterial[], count: number}} 分页材料列表
   */
  static async getAdminMaterialList(params = {}) {
    const { DiyMaterial, MediaFile, Category } = require('../models')
    const { Op } = require('sequelize')

    const page = Number(params.page) || 1
    const pageSize = Number(params.page_size) || 50
    const where = {}

    if (params.group_code) where.group_code = params.group_code
    if (params.category_id) where.category_id = Number(params.category_id)
    if (params.is_enabled !== undefined && params.is_enabled !== '') {
      where.is_enabled =
        params.is_enabled === 'true' || params.is_enabled === true || params.is_enabled === 1
    }
    if (params.keyword) {
      where[Op.or] = [
        { display_name: { [Op.like]: `%${params.keyword}%` } },
        { material_name: { [Op.like]: `%${params.keyword}%` } },
        { material_code: { [Op.like]: `%${params.keyword}%` } }
      ]
    }

    return DiyMaterial.findAndCountAll({
      where,
      include: [
        { model: MediaFile, as: 'image_media', required: false },
        {
          model: Category,
          as: 'category',
          attributes: ['category_id', 'category_name', 'category_code'],
          required: false
        }
      ],
      order: [
        ['group_code', 'ASC'],
        ['sort_order', 'ASC'],
        ['diy_material_id', 'ASC']
      ],
      limit: pageSize,
      offset: (page - 1) * pageSize
    })
  }

  /**
   * 管理端获取材料详情
   * @param {number} materialId - 材料 ID
   * @returns {Object} 材料详情
   */
  static async getAdminMaterialDetail(materialId) {
    const { DiyMaterial, MediaFile, Category } = require('../models')

    const material = await DiyMaterial.findByPk(materialId, {
      include: [
        { model: MediaFile, as: 'image_media', required: false },
        {
          model: Category,
          as: 'category',
          attributes: ['category_id', 'category_name', 'category_code'],
          required: false
        }
      ]
    })

    if (!material) {
      const error = new Error('材料不存在')
      error.statusCode = 404
      throw error
    }
    return material
  }

  /**
   * 创建材料
   * @param {Object} data - 材料数据
   * @param {Object} options - { transaction }
   * @returns {Object} 新建的材料
   */
  static async createMaterial(data, options = {}) {
    const { DiyMaterial } = require('../models')
    const TransactionManager = require('../utils/TransactionManager')

    // 生成 material_code
    const timestamp = Date.now().toString(36).toUpperCase()
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    const materialCode = `DM${timestamp}${random}`

    return TransactionManager.execute(async transaction => {
      const material = await DiyMaterial.create(
        {
          material_code: materialCode,
          display_name: data.display_name,
          material_name: data.material_name || null,
          group_code: data.group_code || 'default',
          diameter: data.diameter || null,
          shape: data.shape || 'round',
          price: data.price || 0,
          price_asset_code: data.price_asset_code || 'POINTS',
          stock: data.stock ?? -1,
          is_stackable: data.is_stackable ?? true,
          image_media_id: data.image_media_id || null,
          category_id: data.category_id || null,
          sort_order: data.sort_order || 0,
          is_enabled: data.is_enabled ?? true,
          meta: data.meta || null
        },
        { transaction }
      )

      logger.info('[DIYService] 创建材料', {
        diy_material_id: material.diy_material_id,
        material_code: materialCode,
        display_name: data.display_name
      })

      return material
    }, options)
  }

  /**
   * 更新材料
   * @param {number} materialId - 材料 ID
   * @param {Object} data - 更新数据
   * @param {Object} options - { transaction }
   * @returns {Object} 更新后的材料
   */
  static async updateMaterial(materialId, data, options = {}) {
    const { DiyMaterial } = require('../models')
    const TransactionManager = require('../utils/TransactionManager')

    return TransactionManager.execute(async transaction => {
      const material = await DiyMaterial.findByPk(materialId, { transaction })
      if (!material) {
        const error = new Error('材料不存在')
        error.statusCode = 404
        throw error
      }

      const allowedFields = [
        'display_name',
        'material_name',
        'group_code',
        'diameter',
        'shape',
        'price',
        'price_asset_code',
        'stock',
        'is_stackable',
        'image_media_id',
        'category_id',
        'sort_order',
        'is_enabled',
        'meta'
      ]
      const updates = {}
      for (const f of allowedFields) {
        if (data[f] !== undefined) updates[f] = data[f]
      }

      await material.update(updates, { transaction })

      logger.info('[DIYService] 更新材料', {
        diy_material_id: materialId,
        fields: Object.keys(updates)
      })

      return material.reload({
        include: [
          { model: require('../models').MediaFile, as: 'image_media', required: false },
          {
            model: require('../models').Category,
            as: 'category',
            attributes: ['category_id', 'category_name', 'category_code'],
            required: false
          }
        ],
        transaction
      })
    }, options)
  }

  /**
   * 删除材料
   * @param {number} materialId - 材料 ID
   * @param {Object} options - { transaction }
   * @returns {void}
   */
  static async deleteMaterial(materialId, options = {}) {
    const { DiyMaterial } = require('../models')
    const TransactionManager = require('../utils/TransactionManager')

    return TransactionManager.execute(async transaction => {
      const material = await DiyMaterial.findByPk(materialId, { transaction })
      if (!material) {
        const error = new Error('材料不存在')
        error.statusCode = 404
        throw error
      }
      await material.destroy({ transaction })
      logger.info('[DIYService] 删除材料', {
        diy_material_id: materialId,
        display_name: material.display_name
      })
    }, options)
  }

  /**
   * 用户端：获取模板可用材料列表
   * 根据模板的 material_group_codes 和 category_id 筛选
   * @param {number} templateId - 模板 ID
   * @param {Object} params - { group_code, diameter, keyword }
   * @returns {Object[]} 用户可见的材料列表
   */
  static async getUserMaterials(templateId, params = {}) {
    const { DiyTemplate, DiyMaterial, MediaFile, Category } = require('../models')
    const { Op } = require('sequelize')

    const template = await DiyTemplate.findByPk(templateId)
    if (!template) {
      const error = new Error('模板不存在')
      error.statusCode = 404
      throw error
    }

    const where = { is_enabled: true }

    // 按模板允许的 group_codes 筛选
    const allowedGroups = template.material_group_codes
    if (allowedGroups && allowedGroups.length > 0) {
      where.group_code = { [Op.in]: allowedGroups }
    }

    // 额外筛选条件
    if (params.group_code) where.group_code = params.group_code
    if (params.diameter) where.diameter = Number(params.diameter)
    if (params.keyword) {
      where[Op.or] = [
        { display_name: { [Op.like]: `%${params.keyword}%` } },
        { material_name: { [Op.like]: `%${params.keyword}%` } }
      ]
    }

    const materials = await DiyMaterial.findAll({
      where,
      include: [
        { model: MediaFile, as: 'image_media', required: false },
        {
          model: Category,
          as: 'category',
          attributes: ['category_id', 'category_name', 'category_code'],
          required: false
        }
      ],
      order: [
        ['group_code', 'ASC'],
        ['sort_order', 'ASC']
      ],
      limit: 200
    })

    return materials
  }

  /**
   * 获取材料分组列表（用于前端 Tab 展示）
   * @returns {Object[]} 分组列表
   */
  static async getMaterialGroups() {
    const { DiyMaterial } = require('../models')
    const { fn, col } = require('sequelize')

    const groups = await DiyMaterial.findAll({
      attributes: [
        'group_code',
        [fn('COUNT', col('diy_material_id')), 'count'],
        [fn('MIN', col('display_name')), 'sample_name']
      ],
      where: { is_enabled: true },
      group: ['group_code'],
      order: [['group_code', 'ASC']],
      raw: true
    })

    return groups
  }

  // ==================== 内部工具方法 ====================

  /**
   * 通过 user_id 获取 account_id
   * @param {number} userId - user_id
   * @returns {number} 用户对应的 account_id
   */
  static async getAccountIdByUserId(userId) {
    const { Account } = require('../models')
    const account = await Account.findOne({
      where: { user_id: userId },
      attributes: ['account_id']
    })
    if (!account) {
      const error = new Error('用户账户不存在')
      error.statusCode = 404
      throw error
    }
    return account.account_id
  }

  /**
   * 校验设计数据中的材料是否在模板允许范围内
   * @param {DiyTemplate} template - 款式模板
   * @param {Object} designData - 设计数据
   * @returns {void}
   * @private
   */
  static async _validateDesignMaterials(template, designData) {
    const groupCodes = template.material_group_codes
    // 空数组或 null 表示全部允许
    if (!groupCodes || !Array.isArray(groupCodes) || groupCodes.length === 0) {
      return
    }

    const { MaterialAssetType } = require('../models')
    const allowedMaterials = await MaterialAssetType.findAll({
      where: { group_code: { [Op.in]: groupCodes } },
      attributes: ['asset_code']
    })
    const allowedCodes = new Set(allowedMaterials.map(m => m.asset_code))

    // 提取设计数据中使用的 asset_code
    let usedCodes = []
    if (designData.mode === 'beading' && Array.isArray(designData.beads)) {
      usedCodes = designData.beads.map(b => b.asset_code).filter(Boolean)
    } else if (designData.mode === 'slots' && designData.fillings) {
      usedCodes = Object.values(designData.fillings)
        .map(f => f.asset_code)
        .filter(Boolean)
    }

    for (const code of usedCodes) {
      if (!allowedCodes.has(code)) {
        const error = new Error(`材料 ${code} 不在该模板允许的材料列表中`)
        error.statusCode = 400
        throw error
      }
    }
  }
}

module.exports = DIYService
