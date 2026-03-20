/**
 * @file 统一商品中心 — 属性（EAV）服务
 * @description 管理属性定义、选项及品类绑定
 */

'use strict'

const { Op, Transaction } = require('sequelize')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const BusinessError = require('../../utils/BusinessError')
const { logger } = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 属性与品类 EAV 服务
 */
class AttributeService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.Attribute = models.Attribute
    this.AttributeOption = models.AttributeOption
    this.CategoryAttribute = models.CategoryAttribute
    this.Category = models.Category
    this.SkuAttributeValue = models.SkuAttributeValue
    this.sequelize = models.sequelize
  }

  /**
   * 列表查询属性（可选品类过滤），并附带选项数量
   *
   * @param {Object} [filters={}] - 筛选条件
   * @param {boolean} [filters.is_sale_attr] - 是否销售属性
   * @param {boolean} [filters.is_enabled] - 是否启用
   * @param {number} [filters.category_id] - 品类 ID（仅返回已绑定该品类的属性）
   * @returns {Promise<Array>} 属性列表（含 options_count）
   */
  async listAttributes(filters = {}) {
    const { is_sale_attr, is_enabled, category_id } = filters
    const where = {}

    if (typeof is_sale_attr === 'boolean') {
      where.is_sale_attr = is_sale_attr
    }
    if (typeof is_enabled === 'boolean') {
      where.is_enabled = is_enabled
    }

    const aoTable = this.AttributeOption.tableName
    const optionsCountLiteral = this.sequelize.literal(
      `(SELECT COUNT(*) FROM \`${aoTable}\` AS ao WHERE ao.attribute_id = \`Attribute\`.\`attribute_id\`)`
    )

    const include = []
    if (category_id !== undefined && category_id !== null && category_id !== '') {
      const cid = Number(category_id)
      if (Number.isNaN(cid)) {
        throw new BusinessError('category_id 无效', 'PRODUCT_CENTER_INVALID_CATEGORY_ID', 400)
      }
      include.push({
        association: 'categories',
        where: { category_id: cid },
        required: true,
        attributes: [],
        through: { attributes: [] }
      })
    }

    const rows = await this.Attribute.findAll({
      where,
      attributes: {
        include: [[optionsCountLiteral, 'options_count']]
      },
      include,
      order: [
        ['sort_order', 'ASC'],
        ['attribute_id', 'ASC']
      ],
      subQuery: false
    })

    return rows.map(r => {
      const plain = r.get({ plain: true })
      plain.options_count = Number(plain.options_count) || 0
      return plain
    })
  }

  /**
   * 获取属性详情（含选项，按 sort_order）
   *
   * @param {number} attributeId - 属性 ID
   * @returns {Promise<Object|null>}
   */
  async getAttributeDetail(attributeId) {
    const id = Number(attributeId)
    if (Number.isNaN(id)) {
      throw new BusinessError('attribute_id 无效', 'PRODUCT_CENTER_INVALID_ATTRIBUTE_ID', 400)
    }

    const row = await this.Attribute.findByPk(id, {
      include: [
        {
          association: 'options',
          separate: true,
          order: [
            ['sort_order', 'ASC'],
            ['option_id', 'ASC']
          ]
        }
      ]
    })

    if (!row) {
      return null
    }

    return row.get({ plain: true })
  }

  /**
   * 创建属性定义
   *
   * @param {Object} data - 属性字段
   * @param {string} data.attribute_name - 显示名
   * @param {string} data.attribute_code - 唯一编码
   * @param {string} [data.input_type] - select | text | number
   * @param {boolean} [data.is_required]
   * @param {boolean} [data.is_sale_attr]
   * @param {boolean} [data.is_searchable]
   * @param {number} [data.sort_order]
   * @param {Object} [options={}] - 含 transaction
   * @returns {Promise<Object>}
   */
  async createAttribute(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AttributeService.createAttribute')
    const {
      attribute_name,
      attribute_code,
      input_type = 'select',
      is_required = false,
      is_sale_attr = false,
      is_searchable = false,
      sort_order = 0
    } = data || {}

    if (!attribute_name || !String(attribute_name).trim()) {
      throw new BusinessError('attribute_name 不能为空', 'PRODUCT_CENTER_ATTR_NAME_REQUIRED', 400)
    }
    if (!attribute_code || !String(attribute_code).trim()) {
      throw new BusinessError('attribute_code 不能为空', 'PRODUCT_CENTER_ATTR_CODE_REQUIRED', 400)
    }

    const code = String(attribute_code).trim()
    const dup = await this.Attribute.findOne({
      where: { attribute_code: code },
      transaction,
      lock: Transaction.LOCK.UPDATE
    })
    if (dup) {
      throw new BusinessError('属性编码已存在', 'PRODUCT_CENTER_ATTRIBUTE_CODE_DUPLICATE', 409, {
        attribute_code: code
      })
    }

    const row = await this.Attribute.create(
      {
        attribute_name: String(attribute_name).trim(),
        attribute_code: code,
        input_type,
        is_required: Boolean(is_required),
        is_sale_attr: Boolean(is_sale_attr),
        is_searchable: Boolean(is_searchable),
        sort_order: Number(sort_order) || 0,
        is_enabled: true
      },
      { transaction }
    )

    logger.info('AttributeService.createAttribute', {
      attribute_id: row.attribute_id,
      attribute_code: row.attribute_code,
      ts: BeijingTimeHelper.now()
    })

    return row.get({ plain: true })
  }

  /**
   * 更新属性
   *
   * @param {number} attributeId - 属性 ID
   * @param {Object} data - 可更新字段（与创建类似）
   * @param {Object} [options={}]
   * @returns {Promise<Object>}
   */
  async updateAttribute(attributeId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AttributeService.updateAttribute')
    const id = Number(attributeId)
    if (Number.isNaN(id)) {
      throw new BusinessError('attribute_id 无效', 'PRODUCT_CENTER_INVALID_ATTRIBUTE_ID', 400)
    }

    const row = await this.Attribute.findByPk(id, { transaction, lock: Transaction.LOCK.UPDATE })
    if (!row) {
      throw new BusinessError('属性不存在', 'PRODUCT_CENTER_ATTRIBUTE_NOT_FOUND', 404, {
        attribute_id: id
      })
    }

    const patch = { ...(data || {}) }
    if (patch.attribute_code !== undefined && patch.attribute_code !== null) {
      const code = String(patch.attribute_code).trim()
      if (!code) {
        throw new BusinessError('attribute_code 不能为空', 'PRODUCT_CENTER_ATTR_CODE_REQUIRED', 400)
      }
      if (code !== row.attribute_code) {
        const dup = await this.Attribute.findOne({
          where: {
            attribute_code: code,
            attribute_id: { [Op.ne]: id }
          },
          transaction
        })
        if (dup) {
          throw new BusinessError(
            '属性编码已存在',
            'PRODUCT_CENTER_ATTRIBUTE_CODE_DUPLICATE',
            409,
            {
              attribute_code: code
            }
          )
        }
      }
      patch.attribute_code = code
    }
    if (patch.attribute_name !== undefined && patch.attribute_name !== null) {
      patch.attribute_name = String(patch.attribute_name).trim()
      if (!patch.attribute_name) {
        throw new BusinessError('attribute_name 不能为空', 'PRODUCT_CENTER_ATTR_NAME_REQUIRED', 400)
      }
    }

    const allowed = [
      'attribute_name',
      'attribute_code',
      'input_type',
      'is_required',
      'is_sale_attr',
      'is_searchable',
      'sort_order',
      'is_enabled'
    ]
    const updatePayload = {}
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        updatePayload[key] = patch[key]
      }
    }

    await row.update(updatePayload, { transaction })

    logger.info('AttributeService.updateAttribute', {
      attribute_id: id,
      ts: BeijingTimeHelper.now()
    })

    return row.reload({ transaction }).then(r => r.get({ plain: true }))
  }

  /**
   * 硬删除属性（依赖数据库级联清理选项与品类绑定）
   *
   * @param {number} attributeId - 属性 ID
   * @param {Object} [options={}]
   * @returns {Promise<void>}
   */
  async deleteAttribute(attributeId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AttributeService.deleteAttribute')
    const id = Number(attributeId)
    if (Number.isNaN(id)) {
      throw new BusinessError('attribute_id 无效', 'PRODUCT_CENTER_INVALID_ATTRIBUTE_ID', 400)
    }

    const row = await this.Attribute.findByPk(id, { transaction, lock: Transaction.LOCK.UPDATE })
    if (!row) {
      throw new BusinessError('属性不存在', 'PRODUCT_CENTER_ATTRIBUTE_NOT_FOUND', 404, {
        attribute_id: id
      })
    }

    await row.destroy({ transaction })

    logger.info('AttributeService.deleteAttribute', {
      attribute_id: id,
      ts: BeijingTimeHelper.now()
    })
  }

  /**
   * 为属性新增选项
   *
   * @param {number} attributeId - 属性 ID
   * @param {Object} data - option_value, sort_order
   * @param {Object} [options={}]
   * @returns {Promise<Object>}
   */
  async createAttributeOption(attributeId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AttributeService.createAttributeOption')
    const aid = Number(attributeId)
    if (Number.isNaN(aid)) {
      throw new BusinessError('attribute_id 无效', 'PRODUCT_CENTER_INVALID_ATTRIBUTE_ID', 400)
    }

    const attr = await this.Attribute.findByPk(aid, { transaction })
    if (!attr) {
      throw new BusinessError('属性不存在', 'PRODUCT_CENTER_ATTRIBUTE_NOT_FOUND', 404, {
        attribute_id: aid
      })
    }

    const { option_value, sort_order = 0 } = data || {}
    if (option_value === undefined || option_value === null || String(option_value).trim() === '') {
      throw new BusinessError('option_value 不能为空', 'PRODUCT_CENTER_OPTION_VALUE_REQUIRED', 400)
    }

    const opt = await this.AttributeOption.create(
      {
        attribute_id: aid,
        option_value: String(option_value).trim(),
        sort_order: Number(sort_order) || 0,
        is_enabled: true
      },
      { transaction }
    )

    logger.info('AttributeService.createAttributeOption', {
      option_id: opt.option_id,
      attribute_id: aid,
      ts: BeijingTimeHelper.now()
    })

    return opt.get({ plain: true })
  }

  /**
   * 更新属性选项
   *
   * @param {number} optionId - 选项 ID
   * @param {Object} data - option_value, sort_order, is_enabled
   * @param {Object} [options={}]
   * @returns {Promise<Object>}
   */
  async updateAttributeOption(optionId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AttributeService.updateAttributeOption')
    const oid = Number(optionId)
    if (Number.isNaN(oid)) {
      throw new BusinessError('option_id 无效', 'PRODUCT_CENTER_INVALID_OPTION_ID', 400)
    }

    const row = await this.AttributeOption.findByPk(oid, {
      transaction,
      lock: Transaction.LOCK.UPDATE
    })
    if (!row) {
      throw new BusinessError('属性选项不存在', 'PRODUCT_CENTER_ATTRIBUTE_OPTION_NOT_FOUND', 404, {
        option_id: oid
      })
    }

    const patch = { ...(data || {}) }
    if (patch.option_value !== undefined && patch.option_value !== null) {
      const v = String(patch.option_value).trim()
      if (!v) {
        throw new BusinessError(
          'option_value 不能为空',
          'PRODUCT_CENTER_OPTION_VALUE_REQUIRED',
          400
        )
      }
      patch.option_value = v
    }
    if (patch.sort_order !== undefined) {
      patch.sort_order = Number(patch.sort_order) || 0
    }

    const allowed = ['option_value', 'sort_order', 'is_enabled']
    const updatePayload = {}
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        updatePayload[key] = patch[key]
      }
    }

    await row.update(updatePayload, { transaction })

    logger.info('AttributeService.updateAttributeOption', {
      option_id: oid,
      ts: BeijingTimeHelper.now()
    })

    return row.reload({ transaction }).then(r => r.get({ plain: true }))
  }

  /**
   * 硬删除属性选项（若已被 SKU 引用则禁止）
   *
   * @param {number} optionId - 选项 ID
   * @param {Object} [options={}]
   * @returns {Promise<void>}
   */
  async deleteAttributeOption(optionId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AttributeService.deleteAttributeOption')
    const oid = Number(optionId)
    if (Number.isNaN(oid)) {
      throw new BusinessError('option_id 无效', 'PRODUCT_CENTER_INVALID_OPTION_ID', 400)
    }

    const row = await this.AttributeOption.findByPk(oid, {
      transaction,
      lock: Transaction.LOCK.UPDATE
    })
    if (!row) {
      throw new BusinessError('属性选项不存在', 'PRODUCT_CENTER_ATTRIBUTE_OPTION_NOT_FOUND', 404, {
        option_id: oid
      })
    }

    const used = await this.SkuAttributeValue.count({
      where: { option_id: oid },
      transaction
    })
    if (used > 0) {
      throw new BusinessError('选项已被 SKU 引用，无法删除', 'PRODUCT_CENTER_OPTION_IN_USE', 422, {
        option_id: oid,
        sku_ref_count: used
      })
    }

    await row.destroy({ transaction })

    logger.info('AttributeService.deleteAttributeOption', {
      option_id: oid,
      ts: BeijingTimeHelper.now()
    })
  }

  /**
   * 将属性列表绑定到品类（全量替换）
   *
   * @param {number} categoryId - 品类 ID
   * @param {number[]} attributeIds - 属性 ID 列表（顺序即品类内 sort_order）
   * @param {Object} [options={}]
   * @returns {Promise<Object[]>} 新建绑定行（plain）
   */
  async bindCategoryAttributes(categoryId, attributeIds, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AttributeService.bindCategoryAttributes')
    const cid = Number(categoryId)
    if (Number.isNaN(cid)) {
      throw new BusinessError('category_id 无效', 'PRODUCT_CENTER_INVALID_CATEGORY_ID', 400)
    }

    const cat = await this.Category.findByPk(cid, { transaction })
    if (!cat) {
      throw new BusinessError('品类不存在', 'PRODUCT_CENTER_CATEGORY_NOT_FOUND', 404, {
        category_id: cid
      })
    }

    const ids = Array.isArray(attributeIds) ? attributeIds : []
    const normalized = []
    const seen = new Set()
    for (const raw of ids) {
      const aid = Number(raw)
      if (Number.isNaN(aid)) {
        throw new BusinessError(
          'attribute_ids 含无效 ID',
          'PRODUCT_CENTER_INVALID_ATTRIBUTE_ID',
          400
        )
      }
      if (seen.has(aid)) continue
      seen.add(aid)
      normalized.push(aid)
    }

    if (normalized.length > 0) {
      const found = await this.Attribute.findAll({
        where: { attribute_id: { [Op.in]: normalized } },
        attributes: ['attribute_id'],
        transaction
      })
      if (found.length !== normalized.length) {
        throw new BusinessError('部分属性不存在', 'PRODUCT_CENTER_ATTRIBUTE_NOT_FOUND', 404)
      }
    }

    await this.CategoryAttribute.destroy({
      where: { category_id: cid },
      transaction
    })

    if (normalized.length === 0) {
      logger.info('AttributeService.bindCategoryAttributes', {
        category_id: cid,
        bound_count: 0,
        ts: BeijingTimeHelper.now()
      })
      return []
    }

    await this.CategoryAttribute.bulkCreate(
      normalized.map((attribute_id, index) => ({
        category_id: cid,
        attribute_id,
        sort_order: index
      })),
      { transaction }
    )

    const bound = await this.CategoryAttribute.findAll({
      where: { category_id: cid },
      order: [
        ['sort_order', 'ASC'],
        ['id', 'ASC']
      ],
      transaction
    })

    logger.info('AttributeService.bindCategoryAttributes', {
      category_id: cid,
      bound_count: bound.length,
      ts: BeijingTimeHelper.now()
    })

    return bound.map(r => r.get({ plain: true }))
  }

  /**
   * 查询品类已绑定的属性（含选项，按绑定 sort_order）
   *
   * @param {number} categoryId - 品类 ID
   * @returns {Promise<Array>}
   */
  async getCategoryAttributes(categoryId) {
    const cid = Number(categoryId)
    if (Number.isNaN(cid)) {
      throw new BusinessError('category_id 无效', 'PRODUCT_CENTER_INVALID_CATEGORY_ID', 400)
    }

    const category = await this.Category.findByPk(cid, { attributes: ['category_id'] })
    if (!category) {
      throw new BusinessError('品类不存在', 'PRODUCT_CENTER_CATEGORY_NOT_FOUND', 404, {
        category_id: cid
      })
    }

    const bindings = await this.CategoryAttribute.findAll({
      where: { category_id: cid },
      include: [
        {
          association: 'attribute',
          include: [
            {
              association: 'options',
              separate: true,
              order: [
                ['sort_order', 'ASC'],
                ['option_id', 'ASC']
              ]
            }
          ]
        }
      ],
      order: [
        ['sort_order', 'ASC'],
        ['id', 'ASC']
      ]
    })

    return bindings
      .map(b => {
        const plain = b.get({ plain: true })
        const attr = plain.attribute
        if (!attr) {
          return null
        }
        return {
          ...attr,
          category_sort_order: plain.sort_order,
          category_attribute_id: plain.id
        }
      })
      .filter(Boolean)
  }
}

module.exports = AttributeService
