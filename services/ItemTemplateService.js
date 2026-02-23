/**
 * @file 物品模板管理服务（ItemTemplateService）
 * @description 管理物品模板表的CRUD操作
 *
 * 管理的表：item_templates
 *
 * 业务场景：
 * - 定义不可叠加物品（NFT类物品）的模板
 * - 为 Item 提供模板定义
 * - 为市场挂牌提供物品分类筛选维度
 *
 * 服务层职责：
 * 1. 封装数据库操作，提供业务语义化API
 * 2. 处理业务逻辑（如模板启用/禁用、可交易性控制）
 * 3. 支持事务管理（通过options.transaction传入）
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const { Op } = require('sequelize')
const logger = require('../utils/logger').logger

/**
 * 物品模板管理服务类
 *
 * @class ItemTemplateService
 */
class ItemTemplateService {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.ItemTemplate = models.ItemTemplate
    this.CategoryDef = models.CategoryDef
    this.RarityDef = models.RarityDef
  }

  /**
   * 获取物品模板列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.item_type] - 物品类型筛选
   * @param {string} [options.category_code] - 类目代码筛选
   * @param {string} [options.rarity_code] - 稀有度代码筛选
   * @param {boolean} [options.is_enabled] - 是否启用筛选
   * @param {boolean} [options.is_tradable] - 是否可交易筛选
   * @param {string} [options.keyword] - 关键词搜索（名称/描述）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 包含列表和分页信息的对象
   */
  async getTemplates(options = {}) {
    try {
      const {
        item_type,
        category_code,
        rarity_code,
        is_enabled,
        is_tradable,
        keyword,
        page = 1,
        page_size = 20
      } = options

      const where = {}

      if (item_type) {
        where.item_type = item_type
      }
      if (category_code) {
        where.category_code = category_code
      }
      if (rarity_code) {
        where.rarity_code = rarity_code
      }
      if (typeof is_enabled === 'boolean') {
        where.is_enabled = is_enabled
      }
      if (typeof is_tradable === 'boolean') {
        where.is_tradable = is_tradable
      }
      if (keyword) {
        where[Op.or] = [
          { display_name: { [Op.like]: `%${keyword}%` } },
          { description: { [Op.like]: `%${keyword}%` } },
          { template_code: { [Op.like]: `%${keyword}%` } }
        ]
      }

      const { count, rows } = await this.ItemTemplate.findAndCountAll({
        where,
        include: [
          {
            association: 'category',
            attributes: ['category_code', 'display_name', 'icon_url']
          },
          {
            association: 'rarity',
            attributes: ['rarity_code', 'display_name', 'color_hex', 'sort_order']
          }
        ],
        order: [
          ['is_enabled', 'DESC'],
          ['display_name', 'ASC']
        ],
        offset: (page - 1) * page_size,
        limit: page_size
      })

      return {
        list: rows,
        pagination: {
          total_count: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('获取物品模板列表失败:', error)
      throw error
    }
  }

  /**
   * 根据模板ID获取详情
   *
   * @param {number} item_template_id - 模板ID
   * @returns {Promise<Object>} 模板详情
   */
  async getTemplateById(item_template_id) {
    try {
      const template = await this.ItemTemplate.findByPk(item_template_id, {
        include: [
          {
            association: 'category',
            attributes: ['category_code', 'display_name', 'icon_url', 'description']
          },
          {
            association: 'rarity',
            attributes: ['rarity_code', 'display_name', 'color_hex', 'sort_order', 'description']
          }
        ]
      })

      if (!template) {
        const error = new Error(`物品模板 ID ${item_template_id} 不存在`)
        error.status = 404
        error.code = 'ITEM_TEMPLATE_NOT_FOUND'
        throw error
      }

      return template
    } catch (error) {
      logger.error(`获取物品模板详情[${item_template_id}]失败:`, error)
      throw error
    }
  }

  /**
   * 根据模板代码获取详情
   *
   * @param {string} template_code - 模板代码
   * @returns {Promise<Object>} 模板详情
   */
  async getTemplateByCode(template_code) {
    try {
      const template = await this.ItemTemplate.getByCode(template_code)

      if (!template) {
        const error = new Error(`物品模板代码 ${template_code} 不存在`)
        error.status = 404
        error.code = 'ITEM_TEMPLATE_NOT_FOUND'
        throw error
      }

      return template
    } catch (error) {
      logger.error(`获取物品模板详情[${template_code}]失败:`, error)
      throw error
    }
  }

  /**
   * 创建物品模板
   *
   * @param {Object} data - 模板数据
   * @param {string} data.template_code - 模板代码（唯一）
   * @param {string} data.item_type - 物品类型
   * @param {string} data.display_name - 显示名称
   * @param {string} [data.category_code] - 类目代码
   * @param {string} [data.rarity_code] - 稀有度代码
   * @param {string} [data.description] - 描述
   * @param {number} [data.image_resource_id] - 关联图片资源ID（优先使用，关联 image_resources 表）
   * @param {string} [data.image_url] - 图片URL（遗留字段，优先使用 image_resource_id）
   * @param {string} [data.thumbnail_url] - 缩略图URL（遗留字段）
   * @param {number} [data.reference_price_points] - 参考价格
   * @param {boolean} [data.is_tradable=true] - 是否可交易
   * @param {Object} [data.meta] - 扩展元数据
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 创建的模板
   */
  async createTemplate(data, admin_id, options = {}) {
    const { transaction } = options

    try {
      const {
        template_code,
        item_type,
        display_name,
        category_code,
        rarity_code,
        description,
        image_resource_id,
        image_url,
        thumbnail_url,
        reference_price_points = 0,
        is_tradable = true,
        meta
      } = data

      // 检查模板代码唯一性
      const existing = await this.ItemTemplate.findOne({
        where: { template_code },
        transaction
      })

      if (existing) {
        const error = new Error(`模板代码 ${template_code} 已存在`)
        error.status = 409
        error.code = 'TEMPLATE_CODE_EXISTS'
        throw error
      }

      // 验证类目代码
      if (category_code) {
        const category = await this.CategoryDef.findByPk(category_code, { transaction })
        if (!category) {
          const error = new Error(`类目代码 ${category_code} 不存在`)
          error.status = 400
          error.code = 'INVALID_CATEGORY_CODE'
          throw error
        }
      }

      // 验证稀有度代码
      if (rarity_code) {
        const rarity = await this.RarityDef.findByPk(rarity_code, { transaction })
        if (!rarity) {
          const error = new Error(`稀有度代码 ${rarity_code} 不存在`)
          error.status = 400
          error.code = 'INVALID_RARITY_CODE'
          throw error
        }
      }

      const newTemplate = await this.ItemTemplate.create(
        {
          template_code,
          item_type,
          display_name,
          category_code,
          rarity_code,
          description,
          image_resource_id: image_resource_id || null,
          image_url,
          thumbnail_url,
          reference_price_points,
          is_tradable,
          is_enabled: true,
          meta
        },
        { transaction }
      )

      logger.info(`管理员 ${admin_id} 创建物品模板成功`, {
        item_template_id: newTemplate.item_template_id,
        template_code,
        display_name
      })

      return newTemplate
    } catch (error) {
      logger.error('创建物品模板失败:', error)
      throw error
    }
  }

  /**
   * 更新物品模板
   *
   * @param {number} item_template_id - 模板ID
   * @param {Object} data - 更新数据
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 更新后的模板
   */
  async updateTemplate(item_template_id, data, admin_id, options = {}) {
    const { transaction } = options

    try {
      const template = await this.ItemTemplate.findByPk(item_template_id, { transaction })

      if (!template) {
        const error = new Error(`物品模板 ID ${item_template_id} 不存在`)
        error.status = 404
        error.code = 'ITEM_TEMPLATE_NOT_FOUND'
        throw error
      }

      const updateData = {}

      // 仅更新提供的字段（不允许更新template_code）
      const allowedFields = [
        'item_type',
        'display_name',
        'category_code',
        'rarity_code',
        'description',
        'image_resource_id',
        'image_url',
        'thumbnail_url',
        'reference_price_points',
        'is_tradable',
        'is_enabled',
        'meta'
      ]

      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          updateData[field] = data[field]
        }
      }

      // 验证类目代码
      if (updateData.category_code) {
        const category = await this.CategoryDef.findByPk(updateData.category_code, { transaction })
        if (!category) {
          const error = new Error(`类目代码 ${updateData.category_code} 不存在`)
          error.status = 400
          error.code = 'INVALID_CATEGORY_CODE'
          throw error
        }
      }

      // 验证稀有度代码
      if (updateData.rarity_code) {
        const rarity = await this.RarityDef.findByPk(updateData.rarity_code, { transaction })
        if (!rarity) {
          const error = new Error(`稀有度代码 ${updateData.rarity_code} 不存在`)
          error.status = 400
          error.code = 'INVALID_RARITY_CODE'
          throw error
        }
      }

      await template.update(updateData, { transaction })

      logger.info(`管理员 ${admin_id} 更新物品模板成功`, {
        item_template_id,
        updated_fields: Object.keys(updateData)
      })

      return template
    } catch (error) {
      logger.error(`更新物品模板[${item_template_id}]失败:`, error)
      throw error
    }
  }

  /**
   * 删除物品模板
   *
   * @param {number} item_template_id - 模板ID
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async deleteTemplate(item_template_id, admin_id, options = {}) {
    const { transaction } = options

    try {
      const template = await this.ItemTemplate.findByPk(item_template_id, { transaction })

      if (!template) {
        const error = new Error(`物品模板 ID ${item_template_id} 不存在`)
        error.status = 404
        error.code = 'ITEM_TEMPLATE_NOT_FOUND'
        throw error
      }

      // 检查是否有关联的物品实例
      if (this.models.Item) {
        const instanceCount = await this.models.Item.count({
          where: { item_template_id },
          transaction
        })

        if (instanceCount > 0) {
          const error = new Error(`无法删除模板，存在 ${instanceCount} 个关联的物品实例`)
          error.status = 400
          error.code = 'TEMPLATE_HAS_INSTANCES'
          throw error
        }
      }

      const templateInfo = {
        template_code: template.template_code,
        display_name: template.display_name
      }

      await template.destroy({ transaction })

      logger.info(`管理员 ${admin_id} 删除物品模板成功`, {
        item_template_id,
        ...templateInfo
      })
    } catch (error) {
      logger.error(`删除物品模板[${item_template_id}]失败:`, error)
      throw error
    }
  }

  /**
   * 获取物品类型列表（去重）
   *
   * @returns {Promise<Array>} 物品类型列表
   */
  async getItemTypes() {
    try {
      const results = await this.ItemTemplate.findAll({
        attributes: [
          [
            this.models.Sequelize.fn('DISTINCT', this.models.Sequelize.col('item_type')),
            'item_type'
          ]
        ],
        where: { is_enabled: true },
        raw: true
      })

      return results.map(r => r.item_type)
    } catch (error) {
      logger.error('获取物品类型列表失败:', error)
      throw error
    }
  }

  /**
   * 获取物品模板统计数据
   *
   * @description 统计物品模板的总数、类型分布、稀有度分布和启用状态
   * @returns {Promise<Object>} 统计数据
   */
  async getTemplateStats() {
    try {
      const [totalCount, enabledCount, disabledCount] = await Promise.all([
        this.ItemTemplate.count(),
        this.ItemTemplate.count({ where: { is_enabled: true } }),
        this.ItemTemplate.count({ where: { is_enabled: false } })
      ])

      const typeDistribution = await this.ItemTemplate.findAll({
        attributes: [
          'item_type',
          [
            this.models.Sequelize.fn('COUNT', this.models.Sequelize.col('item_template_id')),
            'count'
          ]
        ],
        group: ['item_type'],
        raw: true
      })

      const rarityDistribution = await this.ItemTemplate.findAll({
        attributes: [
          'rarity_code',
          [
            this.models.Sequelize.fn('COUNT', this.models.Sequelize.col('item_template_id')),
            'count'
          ]
        ],
        group: ['rarity_code'],
        raw: true
      })

      return {
        total_count: totalCount,
        enabled_count: enabledCount,
        disabled_count: disabledCount,
        item_type_count: typeDistribution.length,
        type_distribution: typeDistribution.map(t => ({
          item_type: t.item_type,
          count: parseInt(t.count)
        })),
        rarity_distribution: rarityDistribution.map(r => ({
          rarity_code: r.rarity_code || 'none',
          count: parseInt(r.count)
        }))
      }
    } catch (error) {
      logger.error('获取物品模板统计失败:', error)
      throw error
    }
  }

  /**
   * 批量启用/禁用模板
   *
   * @param {Array<number>} item_template_ids - 模板ID列表
   * @param {boolean} is_enabled - 是否启用
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 操作结果
   */
  async batchUpdateStatus(item_template_ids, is_enabled, admin_id, options = {}) {
    const { transaction } = options

    try {
      const [updated_count] = await this.ItemTemplate.update(
        { is_enabled },
        {
          where: { item_template_id: { [Op.in]: item_template_ids } },
          transaction
        }
      )

      logger.info(`管理员 ${admin_id} 批量${is_enabled ? '启用' : '禁用'}模板成功`, {
        item_template_ids,
        updated_count
      })

      return { updated_count }
    } catch (error) {
      logger.error('批量更新模板状态失败:', error)
      throw error
    }
  }
}

module.exports = ItemTemplateService
