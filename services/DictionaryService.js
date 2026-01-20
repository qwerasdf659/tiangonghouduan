/**
 * @file 字典表管理服务（DictionaryService）
 * @description 管理配置类字典表的CRUD操作
 *
 * 管理的字典表：
 * - category_defs：物品类目字典表
 * - rarity_defs：稀有度字典表
 * - asset_group_defs：资产分组字典表
 *
 * 服务层职责：
 * 1. 封装数据库操作，提供业务语义化API
 * 2. 处理业务逻辑（如软删除、验证等）
 * 3. 支持事务管理（通过options.transaction传入）
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const { Op } = require('sequelize')
const logger = require('../utils/logger').logger

/**
 * 字典表管理服务类
 *
 * @class DictionaryService
 */
class DictionaryService {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models

    // 获取模型引用
    this.CategoryDef = models.CategoryDef
    this.RarityDef = models.RarityDef
    this.AssetGroupDef = models.AssetGroupDef
  }

  /*
   * =============================================================================
   * 类目定义（CategoryDef）方法
   * =============================================================================
   */

  /**
   * 获取类目列表（分页）
   *
   * @param {Object} options - 查询选项
   * @param {boolean} [options.is_enabled] - 是否启用筛选
   * @param {string} [options.keyword] - 关键词搜索（搜索code和display_name）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 包含list和pagination的结果对象
   */
  async getCategoryList(options = {}) {
    const { is_enabled, keyword, page = 1, page_size = 20 } = options

    const where = {}

    // 启用状态筛选
    if (is_enabled !== undefined) {
      where.is_enabled = is_enabled
    }

    // 关键词搜索
    if (keyword) {
      where[Op.or] = [
        { category_code: { [Op.like]: `%${keyword}%` } },
        { display_name: { [Op.like]: `%${keyword}%` } }
      ]
    }

    const offset = (parseInt(page) - 1) * parseInt(page_size)
    const limit = parseInt(page_size)

    const { count, rows } = await this.CategoryDef.findAndCountAll({
      where,
      order: [
        ['sort_order', 'ASC'],
        ['category_code', 'ASC']
      ],
      offset,
      limit
    })

    return {
      list: rows,
      pagination: {
        total_count: count,
        page: parseInt(page),
        page_size: parseInt(page_size),
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 根据代码获取单个类目详情
   *
   * @param {string} code - 类目代码
   * @returns {Promise<Object|null>} 类目详情，不存在返回null
   */
  async getCategoryByCode(code) {
    return this.CategoryDef.findByPk(code)
  }

  /**
   * 创建类目
   *
   * @param {Object} data - 类目数据
   * @param {string} data.category_code - 类目代码（主键）
   * @param {string} data.display_name - 显示名称
   * @param {string} [data.description] - 描述
   * @param {string} [data.icon_url] - 图标URL
   * @param {number} [data.sort_order=0] - 排序顺序
   * @param {boolean} [data.is_enabled=true] - 是否启用
   * @param {Object} [options={}] - 操作选项
   * @param {Transaction} [options.transaction] - 事务实例
   * @returns {Promise<Object>} 创建的类目记录
   * @throws {Error} 当类目代码已存在时抛出错误
   */
  async createCategory(data, options = {}) {
    const { transaction } = options

    // 检查是否已存在
    const existing = await this.CategoryDef.findByPk(data.category_code, { transaction })
    if (existing) {
      const error = new Error(`类目代码 "${data.category_code}" 已存在`)
      error.status = 409
      error.code = 'CATEGORY_EXISTS'
      throw error
    }

    const category = await this.CategoryDef.create(
      {
        category_code: data.category_code,
        display_name: data.display_name,
        description: data.description || null,
        icon_url: data.icon_url || null,
        sort_order: data.sort_order !== undefined ? data.sort_order : 0,
        is_enabled: data.is_enabled !== undefined ? data.is_enabled : true
      },
      { transaction }
    )

    logger.info('[DictionaryService] 创建类目成功', { category_code: data.category_code })
    return category
  }

  /**
   * 更新类目
   *
   * @param {string} code - 类目代码
   * @param {Object} data - 更新数据
   * @param {Object} [options={}] - 操作选项
   * @param {Transaction} [options.transaction] - 事务实例
   * @returns {Promise<Object>} 更新后的类目记录
   * @throws {Error} 当类目不存在时抛出错误
   */
  async updateCategory(code, data, options = {}) {
    const { transaction } = options

    const category = await this.CategoryDef.findByPk(code, { transaction })
    if (!category) {
      const error = new Error(`类目代码 "${code}" 不存在`)
      error.status = 404
      error.code = 'CATEGORY_NOT_FOUND'
      throw error
    }

    // 只更新允许的字段
    const updateFields = ['display_name', 'description', 'icon_url', 'sort_order', 'is_enabled']
    const updateData = {}
    updateFields.forEach(field => {
      if (data[field] !== undefined) {
        updateData[field] = data[field]
      }
    })

    await category.update(updateData, { transaction })

    logger.info('[DictionaryService] 更新类目成功', { category_code: code })
    return category
  }

  /**
   * 删除类目（软删除，设置is_enabled=false）
   *
   * @param {string} code - 类目代码
   * @param {Object} [options={}] - 操作选项
   * @param {Transaction} [options.transaction] - 事务实例
   * @returns {Promise<Object>} 删除结果 { deleted_code, is_enabled }
   * @throws {Error} 当类目不存在时抛出错误
   */
  async deleteCategory(code, options = {}) {
    const { transaction } = options

    const category = await this.CategoryDef.findByPk(code, { transaction })
    if (!category) {
      const error = new Error(`类目代码 "${code}" 不存在`)
      error.status = 404
      error.code = 'CATEGORY_NOT_FOUND'
      throw error
    }

    // 软删除：设置is_enabled=false
    await category.update({ is_enabled: false }, { transaction })

    logger.info('[DictionaryService] 删除类目成功（软删除）', { category_code: code })
    return { deleted_code: code, is_enabled: false }
  }

  /*
   * =============================================================================
   * 稀有度定义（RarityDef）方法
   * =============================================================================
   */

  /**
   * 获取稀有度列表（分页）
   *
   * @param {Object} options - 查询选项
   * @param {boolean} [options.is_enabled] - 是否启用筛选
   * @param {string} [options.keyword] - 关键词搜索
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 包含list和pagination的结果对象
   */
  async getRarityList(options = {}) {
    const { is_enabled, keyword, page = 1, page_size = 20 } = options

    const where = {}

    if (is_enabled !== undefined) {
      where.is_enabled = is_enabled
    }

    if (keyword) {
      where[Op.or] = [
        { rarity_code: { [Op.like]: `%${keyword}%` } },
        { display_name: { [Op.like]: `%${keyword}%` } }
      ]
    }

    const offset = (parseInt(page) - 1) * parseInt(page_size)
    const limit = parseInt(page_size)

    const { count, rows } = await this.RarityDef.findAndCountAll({
      where,
      order: [
        ['sort_order', 'ASC'],
        ['tier', 'ASC'],
        ['rarity_code', 'ASC']
      ],
      offset,
      limit
    })

    return {
      list: rows,
      pagination: {
        total_count: count,
        page: parseInt(page),
        page_size: parseInt(page_size),
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 根据代码获取单个稀有度详情
   *
   * @param {string} code - 稀有度代码
   * @returns {Promise<Object|null>} 稀有度详情，不存在返回null
   */
  async getRarityByCode(code) {
    return this.RarityDef.findByPk(code)
  }

  /**
   * 创建稀有度
   *
   * @param {Object} data - 稀有度数据
   * @param {string} data.rarity_code - 稀有度代码（主键）
   * @param {string} data.display_name - 显示名称
   * @param {string} [data.description] - 描述
   * @param {string} [data.color_hex] - 主题颜色（十六进制）
   * @param {number} [data.tier=1] - 稀有度等级
   * @param {number} [data.sort_order=0] - 排序顺序
   * @param {boolean} [data.is_enabled=true] - 是否启用
   * @param {Object} [options={}] - 操作选项
   * @param {Transaction} [options.transaction] - 事务实例
   * @returns {Promise<Object>} 创建的稀有度记录
   */
  async createRarity(data, options = {}) {
    const { transaction } = options

    const existing = await this.RarityDef.findByPk(data.rarity_code, { transaction })
    if (existing) {
      const error = new Error(`稀有度代码 "${data.rarity_code}" 已存在`)
      error.status = 409
      error.code = 'RARITY_EXISTS'
      throw error
    }

    const rarity = await this.RarityDef.create(
      {
        rarity_code: data.rarity_code,
        display_name: data.display_name,
        description: data.description || null,
        color_hex: data.color_hex || null,
        tier: data.tier !== undefined ? data.tier : 1,
        sort_order: data.sort_order !== undefined ? data.sort_order : 0,
        is_enabled: data.is_enabled !== undefined ? data.is_enabled : true
      },
      { transaction }
    )

    logger.info('[DictionaryService] 创建稀有度成功', { rarity_code: data.rarity_code })
    return rarity
  }

  /**
   * 更新稀有度
   *
   * @param {string} code - 稀有度代码
   * @param {Object} data - 更新数据
   * @param {Object} [options={}] - 操作选项
   * @param {Transaction} [options.transaction] - 事务实例
   * @returns {Promise<Object>} 更新后的稀有度记录
   */
  async updateRarity(code, data, options = {}) {
    const { transaction } = options

    const rarity = await this.RarityDef.findByPk(code, { transaction })
    if (!rarity) {
      const error = new Error(`稀有度代码 "${code}" 不存在`)
      error.status = 404
      error.code = 'RARITY_NOT_FOUND'
      throw error
    }

    const updateFields = [
      'display_name',
      'description',
      'color_hex',
      'tier',
      'sort_order',
      'is_enabled'
    ]
    const updateData = {}
    updateFields.forEach(field => {
      if (data[field] !== undefined) {
        updateData[field] = data[field]
      }
    })

    await rarity.update(updateData, { transaction })

    logger.info('[DictionaryService] 更新稀有度成功', { rarity_code: code })
    return rarity
  }

  /**
   * 删除稀有度（软删除）
   *
   * @param {string} code - 稀有度代码
   * @param {Object} [options={}] - 操作选项
   * @param {Transaction} [options.transaction] - 事务实例
   * @returns {Promise<Object>} 删除结果
   */
  async deleteRarity(code, options = {}) {
    const { transaction } = options

    const rarity = await this.RarityDef.findByPk(code, { transaction })
    if (!rarity) {
      const error = new Error(`稀有度代码 "${code}" 不存在`)
      error.status = 404
      error.code = 'RARITY_NOT_FOUND'
      throw error
    }

    await rarity.update({ is_enabled: false }, { transaction })

    logger.info('[DictionaryService] 删除稀有度成功（软删除）', { rarity_code: code })
    return { deleted_code: code, is_enabled: false }
  }

  /*
   * =============================================================================
   * 资产分组定义（AssetGroupDef）方法
   * =============================================================================
   */

  /**
   * 获取资产分组列表（分页）
   *
   * @param {Object} options - 查询选项
   * @param {boolean} [options.is_enabled] - 是否启用筛选
   * @param {boolean} [options.is_tradable] - 是否可交易筛选
   * @param {string} [options.group_type] - 分组类型筛选
   * @param {string} [options.keyword] - 关键词搜索
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 包含list和pagination的结果对象
   */
  async getAssetGroupList(options = {}) {
    const { is_enabled, is_tradable, group_type, keyword, page = 1, page_size = 20 } = options

    const where = {}

    if (is_enabled !== undefined) {
      where.is_enabled = is_enabled
    }

    if (is_tradable !== undefined) {
      where.is_tradable = is_tradable
    }

    if (group_type) {
      where.group_type = group_type
    }

    if (keyword) {
      where[Op.or] = [
        { group_code: { [Op.like]: `%${keyword}%` } },
        { display_name: { [Op.like]: `%${keyword}%` } }
      ]
    }

    const offset = (parseInt(page) - 1) * parseInt(page_size)
    const limit = parseInt(page_size)

    const { count, rows } = await this.AssetGroupDef.findAndCountAll({
      where,
      order: [
        ['sort_order', 'ASC'],
        ['group_code', 'ASC']
      ],
      offset,
      limit
    })

    return {
      list: rows,
      pagination: {
        total_count: count,
        page: parseInt(page),
        page_size: parseInt(page_size),
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 根据代码获取单个资产分组详情
   *
   * @param {string} code - 分组代码
   * @returns {Promise<Object|null>} 资产分组详情，不存在返回null
   */
  async getAssetGroupByCode(code) {
    return this.AssetGroupDef.findByPk(code)
  }

  /**
   * 创建资产分组
   *
   * @param {Object} data - 资产分组数据
   * @param {string} data.group_code - 分组代码（主键）
   * @param {string} data.display_name - 显示名称
   * @param {string} [data.description] - 描述
   * @param {string} [data.group_type='material'] - 分组类型
   * @param {string} [data.color_hex] - 主题颜色
   * @param {number} [data.sort_order=0] - 排序顺序
   * @param {boolean} [data.is_enabled=true] - 是否启用
   * @param {boolean} [data.is_tradable=true] - 是否可交易
   * @param {Object} [options={}] - 操作选项
   * @param {Transaction} [options.transaction] - 事务实例
   * @returns {Promise<Object>} 创建的资产分组记录
   */
  async createAssetGroup(data, options = {}) {
    const { transaction } = options

    const existing = await this.AssetGroupDef.findByPk(data.group_code, { transaction })
    if (existing) {
      const error = new Error(`分组代码 "${data.group_code}" 已存在`)
      error.status = 409
      error.code = 'GROUP_EXISTS'
      throw error
    }

    const group = await this.AssetGroupDef.create(
      {
        group_code: data.group_code,
        display_name: data.display_name,
        description: data.description || null,
        group_type: data.group_type || 'material',
        color_hex: data.color_hex || null,
        sort_order: data.sort_order !== undefined ? data.sort_order : 0,
        is_enabled: data.is_enabled !== undefined ? data.is_enabled : true,
        is_tradable: data.is_tradable !== undefined ? data.is_tradable : true
      },
      { transaction }
    )

    logger.info('[DictionaryService] 创建资产分组成功', { group_code: data.group_code })
    return group
  }

  /**
   * 更新资产分组
   *
   * @param {string} code - 分组代码
   * @param {Object} data - 更新数据
   * @param {Object} [options={}] - 操作选项
   * @param {Transaction} [options.transaction] - 事务实例
   * @returns {Promise<Object>} 更新后的资产分组记录
   */
  async updateAssetGroup(code, data, options = {}) {
    const { transaction } = options

    const group = await this.AssetGroupDef.findByPk(code, { transaction })
    if (!group) {
      const error = new Error(`分组代码 "${code}" 不存在`)
      error.status = 404
      error.code = 'GROUP_NOT_FOUND'
      throw error
    }

    const updateFields = [
      'display_name',
      'description',
      'group_type',
      'color_hex',
      'sort_order',
      'is_enabled',
      'is_tradable'
    ]
    const updateData = {}
    updateFields.forEach(field => {
      if (data[field] !== undefined) {
        updateData[field] = data[field]
      }
    })

    await group.update(updateData, { transaction })

    logger.info('[DictionaryService] 更新资产分组成功', { group_code: code })
    return group
  }

  /**
   * 删除资产分组（软删除）
   *
   * @param {string} code - 分组代码
   * @param {Object} [options={}] - 操作选项
   * @param {Transaction} [options.transaction] - 事务实例
   * @returns {Promise<Object>} 删除结果
   */
  async deleteAssetGroup(code, options = {}) {
    const { transaction } = options

    const group = await this.AssetGroupDef.findByPk(code, { transaction })
    if (!group) {
      const error = new Error(`分组代码 "${code}" 不存在`)
      error.status = 404
      error.code = 'GROUP_NOT_FOUND'
      throw error
    }

    await group.update({ is_enabled: false }, { transaction })

    logger.info('[DictionaryService] 删除资产分组成功（软删除）', { group_code: code })
    return { deleted_code: code, is_enabled: false }
  }

  /*
   * =============================================================================
   * 通用方法
   * =============================================================================
   */

  /**
   * 获取所有启用的字典数据（用于前端下拉选项）
   *
   * @description 一次性获取所有启用的字典数据，减少前端请求次数
   * @returns {Promise<Object>} 所有字典数据 { categories, rarities, asset_groups }
   */
  async getAllDictionaries() {
    const [categories, rarities, asset_groups] = await Promise.all([
      this.CategoryDef.findAll({
        where: { is_enabled: true },
        order: [
          ['sort_order', 'ASC'],
          ['category_code', 'ASC']
        ],
        attributes: ['category_code', 'display_name', 'description', 'icon_url', 'sort_order']
      }),
      this.RarityDef.findAll({
        where: { is_enabled: true },
        order: [
          ['sort_order', 'ASC'],
          ['tier', 'ASC']
        ],
        attributes: [
          'rarity_code',
          'display_name',
          'description',
          'color_hex',
          'tier',
          'sort_order'
        ]
      }),
      this.AssetGroupDef.findAll({
        where: { is_enabled: true },
        order: [
          ['sort_order', 'ASC'],
          ['group_code', 'ASC']
        ],
        attributes: [
          'group_code',
          'display_name',
          'description',
          'group_type',
          'color_hex',
          'is_tradable',
          'sort_order'
        ]
      })
    ])

    return {
      categories,
      rarities,
      asset_groups
    }
  }
}

module.exports = DictionaryService
