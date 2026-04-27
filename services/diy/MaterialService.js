/**
 * DIY 素材管理服务
 *
 * 职责：珠子/素材 CRUD（管理端 + 用户端查询）
 *
 * @module services/diy/MaterialService
 */

'use strict'

const { Op, fn, col } = require('sequelize')
const logger = require('../../utils/logger').logger
const OrderNoGenerator = require('../../utils/OrderNoGenerator')
const { AssetCode } = require('../../constants/AssetCode')
const { Category, DiyMaterial, DiyTemplate, MediaFile } = require('../../models')
const TransactionManager = require('../../utils/TransactionManager')

/** DIY 素材管理服务 */
class DiyMaterialService {
  /**
   * 管理端获取材料列表（分页/筛选）
   * @param {Object} params - { page, page_size, group_code, category_id, keyword, is_enabled }
   * @returns {{rows: DiyMaterial[], count: number}} 分页材料列表
   */
  static async getAdminMaterialList(params = {}) {
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
    /* 强制校验：珠子素材图片是前端渲染的必要素材 */
    if (!data.image_media_id) {
      const error = new Error(
        '请上传珠子素材图片（image_media_id），图片是小程序设计器渲染的必要素材'
      )
      error.statusCode = 400
      throw error
    }

    // material_code 采用「先创建再回填」模式，与 TemplateService/WorkService 统一
    return TransactionManager.execute(async transaction => {
      // 安全校验：price_asset_code 不允许设为 points 或 budget_points（文档决策 4）
      const assetCode = data.price_asset_code || AssetCode.STAR_STONE
      const forbidden = ['points', 'budget_points']
      if (forbidden.includes(assetCode)) {
        const error = new Error(
          `price_asset_code 不允许设为 ${assetCode}，DIY 支付仅限星石和源晶体系`
        )
        error.statusCode = 400
        throw error
      }

      // 强制整数定价校验（文档决策 A：管理后台和后端各加一条整数校验）
      if (data.price !== undefined && data.price !== null) {
        const price = Number(data.price)
        if (!Number.isFinite(price) || price < 0) {
          const error = new Error('价格必须为非负数')
          error.statusCode = 400
          throw error
        }
        if (price % 1 !== 0) {
          const error = new Error(`价格必须为整数（当前值 ${price}），强制整数定价策略`)
          error.statusCode = 400
          throw error
        }
      }

      const material = await DiyMaterial.create(
        {
          material_code: 'DM_TEMP',
          display_name: data.display_name,
          material_name: data.material_name || null,
          group_code: data.group_code || 'default',
          diameter: data.diameter || null,
          shape: data.shape || 'round',
          price: data.price || 0,
          price_asset_code: assetCode,
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

      const materialCode = OrderNoGenerator.generate(
        'DM',
        material.diy_material_id,
        material.created_at
      )
      await material.update({ material_code: materialCode }, { transaction })

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

      // 安全校验：price_asset_code 不允许设为 points 或 budget_points（文档决策 4）
      if (updates.price_asset_code) {
        const forbidden = ['points', 'budget_points']
        if (forbidden.includes(updates.price_asset_code)) {
          const error = new Error(
            `price_asset_code 不允许设为 ${updates.price_asset_code}，DIY 支付仅限星石和源晶体系`
          )
          error.statusCode = 400
          throw error
        }
      }

      // 强制整数定价校验（文档决策 A：管理后台和后端各加一条整数校验）
      if (updates.price !== undefined && updates.price !== null) {
        const price = Number(updates.price)
        if (!Number.isFinite(price) || price < 0) {
          const error = new Error('价格必须为非负数')
          error.statusCode = 400
          throw error
        }
        if (price % 1 !== 0) {
          const error = new Error(`价格必须为整数（当前值 ${price}），强制整数定价策略`)
          error.statusCode = 400
          throw error
        }
      }

      await material.update(updates, { transaction })

      logger.info('[DIYService] 更新材料', {
        diy_material_id: materialId,
        fields: Object.keys(updates)
      })

      return material.reload({
        include: [
          { model: MediaFile, as: 'image_media', required: false },
          {
            model: Category,
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
   * 支持按 slot_id 的 allowed_diameters 约束过滤
   * @param {number} templateId - 模板 ID
   * @param {Object} params - { group_code, diameter, keyword, slot_id }
   * @returns {Object[]} 用户可见的材料列表
   */
  static async getUserMaterials(templateId, params = {}) {
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

    // 按槽位的 allowed_diameters 约束过滤
    if (params.slot_id && template.layout?.slot_definitions) {
      const slot = template.layout.slot_definitions.find(s => s.slot_id === params.slot_id)
      if (slot?.allowed_diameters?.length > 0) {
        where.diameter = { [Op.in]: slot.allowed_diameters }
      }
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
}

module.exports = DiyMaterialService
