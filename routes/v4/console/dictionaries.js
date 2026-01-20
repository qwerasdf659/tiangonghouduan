/**
 * @file 字典表管理路由（Dictionaries Management Routes）
 * @description 管理配置类字典表的CRUD API
 *
 * 管理的字典表：
 * - category_defs：物品类目字典表
 * - rarity_defs：稀有度字典表
 * - asset_group_defs：资产分组字典表
 *
 * API路径设计规范：
 * - 配置实体使用 :code 作为标识符（符合项目规范）
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const { asyncHandler } = require('./shared/middleware')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * 通过 ServiceManager 获取 DictionaryService
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} DictionaryService
 */
const getDictionaryService = req => {
  return req.app.locals.services.getService('dictionary')
}

/*
 * =============================================================================
 * 类目定义（CategoryDef）API
 * =============================================================================
 */

/**
 * GET /categories - 获取类目列表
 *
 * @description 获取物品类目字典列表（支持分页和筛选）
 * @route GET /api/v4/console/dictionaries/categories
 * @query {boolean} [is_enabled] - 是否启用
 * @query {string} [keyword] - 关键词搜索
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 * @access admin
 * @returns {Object} 分页类目列表
 */
router.get(
  '/categories',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)
    const result = await DictionaryService.getCategoryList({
      is_enabled:
        req.query.is_enabled === 'true'
          ? true
          : req.query.is_enabled === 'false'
            ? false
            : undefined,
      keyword: req.query.keyword,
      page: req.query.page,
      page_size: req.query.page_size
    })

    logger.info('[dictionaries] 查询类目列表', {
      admin_id: req.user.user_id,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '获取类目列表成功')
  })
)

/**
 * GET /categories/:code - 获取单个类目详情
 *
 * @description 根据类目代码获取类目详情
 * @route GET /api/v4/console/dictionaries/categories/:code
 * @param {string} code - 类目代码
 * @access admin
 * @returns {Object} 类目详情
 */
router.get(
  '/categories/:code',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)
    const category = await DictionaryService.getCategoryByCode(req.params.code)

    if (!category) {
      return res.apiError(`类目代码 "${req.params.code}" 不存在`, 'CATEGORY_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(category, '获取类目详情成功')
  })
)

/**
 * POST /categories - 创建类目
 *
 * @description 创建新的物品类目
 * @route POST /api/v4/console/dictionaries/categories
 * @body {string} category_code - 类目代码（主键）
 * @body {string} display_name - 显示名称
 * @body {string} [description] - 描述
 * @body {string} [icon_url] - 图标URL
 * @body {number} [sort_order=0] - 排序顺序
 * @body {boolean} [is_enabled=true] - 是否启用
 * @access admin
 * @returns {Object} 创建的类目
 */
router.post(
  '/categories',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { category_code, display_name, description, icon_url, sort_order, is_enabled } = req.body

    // 参数验证
    if (!category_code || !display_name) {
      return res.apiError(
        '缺少必要参数：category_code 和 display_name',
        'INVALID_PARAMS',
        null,
        400
      )
    }

    // 验证 category_code 格式（snake_case）
    if (!/^[a-z][a-z0-9_]*$/.test(category_code)) {
      return res.apiError(
        'category_code 必须是 snake_case 格式（小写字母开头，仅包含小写字母、数字和下划线）',
        'INVALID_CODE_FORMAT',
        null,
        400
      )
    }

    const DictionaryService = getDictionaryService(req)

    const category = await TransactionManager.execute(async transaction => {
      return DictionaryService.createCategory(
        { category_code, display_name, description, icon_url, sort_order, is_enabled },
        { transaction }
      )
    })

    logger.info('[dictionaries] 创建类目成功', {
      admin_id: req.user.user_id,
      category_code
    })

    return res.apiSuccess(category, '创建类目成功')
  })
)

/**
 * PUT /categories/:code - 更新类目
 *
 * @description 更新类目信息
 * @route PUT /api/v4/console/dictionaries/categories/:code
 * @param {string} code - 类目代码
 * @body {string} [display_name] - 显示名称
 * @body {string} [description] - 描述
 * @body {string} [icon_url] - 图标URL
 * @body {number} [sort_order] - 排序顺序
 * @body {boolean} [is_enabled] - 是否启用
 * @access admin
 * @returns {Object} 更新后的类目
 */
router.put(
  '/categories/:code',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)

    const category = await TransactionManager.execute(async transaction => {
      return DictionaryService.updateCategory(req.params.code, req.body, { transaction })
    })

    logger.info('[dictionaries] 更新类目成功', {
      admin_id: req.user.user_id,
      category_code: req.params.code
    })

    return res.apiSuccess(category, '更新类目成功')
  })
)

/**
 * DELETE /categories/:code - 删除类目
 *
 * @description 删除类目（软删除，设置is_enabled=false）
 * @route DELETE /api/v4/console/dictionaries/categories/:code
 * @param {string} code - 类目代码
 * @access admin
 * @returns {Object} 删除结果
 */
router.delete(
  '/categories/:code',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)

    const result = await TransactionManager.execute(async transaction => {
      return DictionaryService.deleteCategory(req.params.code, { transaction })
    })

    logger.info('[dictionaries] 删除类目成功', {
      admin_id: req.user.user_id,
      category_code: req.params.code
    })

    return res.apiSuccess(result, '删除类目成功')
  })
)

/*
 * =============================================================================
 * 稀有度定义（RarityDef）API
 * =============================================================================
 */

/**
 * GET /rarities - 获取稀有度列表
 *
 * @route GET /api/v4/console/dictionaries/rarities
 * @access admin
 * @returns {Object} 分页稀有度列表
 */
router.get(
  '/rarities',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)
    const result = await DictionaryService.getRarityList({
      is_enabled:
        req.query.is_enabled === 'true'
          ? true
          : req.query.is_enabled === 'false'
            ? false
            : undefined,
      keyword: req.query.keyword,
      page: req.query.page,
      page_size: req.query.page_size
    })

    logger.info('[dictionaries] 查询稀有度列表', {
      admin_id: req.user.user_id,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '获取稀有度列表成功')
  })
)

/**
 * GET /rarities/:code - 获取单个稀有度详情
 *
 * @route GET /api/v4/console/dictionaries/rarities/:code
 * @param {string} code - 稀有度代码
 * @access admin
 * @returns {Object} 稀有度详情
 */
router.get(
  '/rarities/:code',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)
    const rarity = await DictionaryService.getRarityByCode(req.params.code)

    if (!rarity) {
      return res.apiError(`稀有度代码 "${req.params.code}" 不存在`, 'RARITY_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(rarity, '获取稀有度详情成功')
  })
)

/**
 * POST /rarities - 创建稀有度
 *
 * @route POST /api/v4/console/dictionaries/rarities
 * @body {string} rarity_code - 稀有度代码（主键）
 * @body {string} display_name - 显示名称
 * @body {string} [description] - 描述
 * @body {string} [color_hex] - 主题颜色
 * @body {number} [tier=1] - 稀有度等级
 * @body {number} [sort_order=0] - 排序顺序
 * @body {boolean} [is_enabled=true] - 是否启用
 * @access admin
 * @returns {Object} 创建的稀有度
 */
router.post(
  '/rarities',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rarity_code, display_name, description, color_hex, tier, sort_order, is_enabled } =
      req.body

    if (!rarity_code || !display_name) {
      return res.apiError('缺少必要参数：rarity_code 和 display_name', 'INVALID_PARAMS', null, 400)
    }

    if (!/^[a-z][a-z0-9_]*$/.test(rarity_code)) {
      return res.apiError('rarity_code 必须是 snake_case 格式', 'INVALID_CODE_FORMAT', null, 400)
    }

    const DictionaryService = getDictionaryService(req)

    const rarity = await TransactionManager.execute(async transaction => {
      return DictionaryService.createRarity(
        { rarity_code, display_name, description, color_hex, tier, sort_order, is_enabled },
        { transaction }
      )
    })

    logger.info('[dictionaries] 创建稀有度成功', {
      admin_id: req.user.user_id,
      rarity_code
    })

    return res.apiSuccess(rarity, '创建稀有度成功')
  })
)

/**
 * PUT /rarities/:code - 更新稀有度
 *
 * @route PUT /api/v4/console/dictionaries/rarities/:code
 * @param {string} code - 稀有度代码
 * @access admin
 * @returns {Object} 更新后的稀有度
 */
router.put(
  '/rarities/:code',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)

    const rarity = await TransactionManager.execute(async transaction => {
      return DictionaryService.updateRarity(req.params.code, req.body, { transaction })
    })

    logger.info('[dictionaries] 更新稀有度成功', {
      admin_id: req.user.user_id,
      rarity_code: req.params.code
    })

    return res.apiSuccess(rarity, '更新稀有度成功')
  })
)

/**
 * DELETE /rarities/:code - 删除稀有度
 *
 * @route DELETE /api/v4/console/dictionaries/rarities/:code
 * @param {string} code - 稀有度代码
 * @access admin
 * @returns {Object} 删除结果
 */
router.delete(
  '/rarities/:code',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)

    const result = await TransactionManager.execute(async transaction => {
      return DictionaryService.deleteRarity(req.params.code, { transaction })
    })

    logger.info('[dictionaries] 删除稀有度成功', {
      admin_id: req.user.user_id,
      rarity_code: req.params.code
    })

    return res.apiSuccess(result, '删除稀有度成功')
  })
)

/*
 * =============================================================================
 * 资产分组定义（AssetGroupDef）API
 * =============================================================================
 */

/**
 * GET /asset-groups - 获取资产分组列表
 *
 * @route GET /api/v4/console/dictionaries/asset-groups
 * @query {boolean} [is_enabled] - 是否启用
 * @query {boolean} [is_tradable] - 是否可交易
 * @query {string} [group_type] - 分组类型（system/material/custom）
 * @query {string} [keyword] - 关键词搜索
 * @access admin
 * @returns {Object} 分页资产分组列表
 */
router.get(
  '/asset-groups',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)
    const result = await DictionaryService.getAssetGroupList({
      is_enabled:
        req.query.is_enabled === 'true'
          ? true
          : req.query.is_enabled === 'false'
            ? false
            : undefined,
      is_tradable:
        req.query.is_tradable === 'true'
          ? true
          : req.query.is_tradable === 'false'
            ? false
            : undefined,
      group_type: req.query.group_type,
      keyword: req.query.keyword,
      page: req.query.page,
      page_size: req.query.page_size
    })

    logger.info('[dictionaries] 查询资产分组列表', {
      admin_id: req.user.user_id,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '获取资产分组列表成功')
  })
)

/**
 * GET /asset-groups/:code - 获取单个资产分组详情
 *
 * @route GET /api/v4/console/dictionaries/asset-groups/:code
 * @param {string} code - 分组代码
 * @access admin
 * @returns {Object} 资产分组详情
 */
router.get(
  '/asset-groups/:code',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)
    const group = await DictionaryService.getAssetGroupByCode(req.params.code)

    if (!group) {
      return res.apiError(`分组代码 "${req.params.code}" 不存在`, 'GROUP_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(group, '获取资产分组详情成功')
  })
)

/**
 * POST /asset-groups - 创建资产分组
 *
 * @route POST /api/v4/console/dictionaries/asset-groups
 * @body {string} group_code - 分组代码（主键）
 * @body {string} display_name - 显示名称
 * @body {string} [description] - 描述
 * @body {string} [group_type='material'] - 分组类型
 * @body {string} [color_hex] - 主题颜色
 * @body {number} [sort_order=0] - 排序顺序
 * @body {boolean} [is_enabled=true] - 是否启用
 * @body {boolean} [is_tradable=true] - 是否可交易
 * @access admin
 * @returns {Object} 创建的资产分组
 */
router.post(
  '/asset-groups',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const {
      group_code,
      display_name,
      description,
      group_type,
      color_hex,
      sort_order,
      is_enabled,
      is_tradable
    } = req.body

    if (!group_code || !display_name) {
      return res.apiError('缺少必要参数：group_code 和 display_name', 'INVALID_PARAMS', null, 400)
    }

    if (!/^[a-z][a-z0-9_]*$/.test(group_code)) {
      return res.apiError('group_code 必须是 snake_case 格式', 'INVALID_CODE_FORMAT', null, 400)
    }

    const DictionaryService = getDictionaryService(req)

    const group = await TransactionManager.execute(async transaction => {
      return DictionaryService.createAssetGroup(
        {
          group_code,
          display_name,
          description,
          group_type,
          color_hex,
          sort_order,
          is_enabled,
          is_tradable
        },
        { transaction }
      )
    })

    logger.info('[dictionaries] 创建资产分组成功', {
      admin_id: req.user.user_id,
      group_code
    })

    return res.apiSuccess(group, '创建资产分组成功')
  })
)

/**
 * PUT /asset-groups/:code - 更新资产分组
 *
 * @route PUT /api/v4/console/dictionaries/asset-groups/:code
 * @param {string} code - 分组代码
 * @access admin
 * @returns {Object} 更新后的资产分组
 */
router.put(
  '/asset-groups/:code',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)

    const group = await TransactionManager.execute(async transaction => {
      return DictionaryService.updateAssetGroup(req.params.code, req.body, { transaction })
    })

    logger.info('[dictionaries] 更新资产分组成功', {
      admin_id: req.user.user_id,
      group_code: req.params.code
    })

    return res.apiSuccess(group, '更新资产分组成功')
  })
)

/**
 * DELETE /asset-groups/:code - 删除资产分组
 *
 * @route DELETE /api/v4/console/dictionaries/asset-groups/:code
 * @param {string} code - 分组代码
 * @access admin
 * @returns {Object} 删除结果
 */
router.delete(
  '/asset-groups/:code',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)

    const result = await TransactionManager.execute(async transaction => {
      return DictionaryService.deleteAssetGroup(req.params.code, { transaction })
    })

    logger.info('[dictionaries] 删除资产分组成功', {
      admin_id: req.user.user_id,
      group_code: req.params.code
    })

    return res.apiSuccess(result, '删除资产分组成功')
  })
)

/*
 * =============================================================================
 * 通用API
 * =============================================================================
 */

/**
 * GET /all - 获取所有启用的字典数据
 *
 * @description 用于前端下拉选项，一次性获取所有字典数据
 * @route GET /api/v4/console/dictionaries/all
 * @access admin
 * @returns {Object} 所有字典数据 {categories, rarities, asset_groups}
 */
router.get(
  '/all',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const DictionaryService = getDictionaryService(req)
    const result = await DictionaryService.getAllDictionaries()

    logger.info('[dictionaries] 获取所有字典数据', {
      admin_id: req.user.user_id,
      counts: {
        categories: result.categories.length,
        rarities: result.rarities.length,
        asset_groups: result.asset_groups.length
      }
    })

    return res.apiSuccess(result, '获取所有字典数据成功')
  })
)

module.exports = router
