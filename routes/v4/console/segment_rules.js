/**
 * 分群规则管理路由
 *
 * @description 分群策略版本的 CRUD + 字段注册表查询
 * @route /api/v4/console/segment-rules
 * @access Private (需要管理员权限)
 */

'use strict'

const express = require('express')
const router = express.Router()
const TransactionManager = require('../../../utils/TransactionManager')
const { getFieldRegistry } = require('../../../config/segment_field_registry')
const {
  sharedComponents,
  adminAuthMiddleware,
  asyncHandler
} = require('./shared/middleware')

/**
 * GET / - 列出所有分群策略版本
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { SegmentRuleConfig } = req.app.locals.models || require('../../../models')
      const configs = await SegmentRuleConfig.findAll({
        order: [['is_system', 'DESC'], ['created_at', 'ASC']]
      })

      return res.apiSuccess({
        configs: configs.map(c => c.toJSON()),
        total: configs.length
      }, '分群策略列表获取成功')
    } catch (error) {
      sharedComponents.logger.error('获取分群策略列表失败', { error: error.message })
      return res.apiInternalError('获取分群策略列表失败', error.message, 'SEGMENT_RULES_LIST_ERROR')
    }
  })
)

/**
 * GET /field-registry - 获取可用字段和运算符白名单
 */
router.get(
  '/field-registry',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const registry = getFieldRegistry()
      return res.apiSuccess(registry, '字段注册表获取成功')
    } catch (error) {
      sharedComponents.logger.error('获取字段注册表失败', { error: error.message })
      return res.apiInternalError('获取字段注册表失败', error.message, 'FIELD_REGISTRY_ERROR')
    }
  })
)

/**
 * GET /:version_key - 获取某版本详情
 */
router.get(
  '/:version_key',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { version_key } = req.params
      const { SegmentRuleConfig } = req.app.locals.models || require('../../../models')
      const config = await SegmentRuleConfig.findOne({
        where: { version_key }
      })

      if (!config) {
        return res.apiError(`分群策略版本不存在: ${version_key}`, 'SEGMENT_RULE_NOT_FOUND')
      }

      return res.apiSuccess(config.toJSON(), '分群策略详情获取成功')
    } catch (error) {
      sharedComponents.logger.error('获取分群策略详情失败', { error: error.message })
      return res.apiInternalError('获取分群策略详情失败', error.message, 'SEGMENT_RULE_DETAIL_ERROR')
    }
  })
)

/**
 * POST / - 创建新的分群策略版本
 */
router.post(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { version_key, version_name, description, rules } = req.body

    try {
      if (!version_key || !version_name || !rules) {
        return res.apiError('version_key、version_name、rules 不能为空', 'MISSING_FIELDS')
      }

      if (!Array.isArray(rules) || rules.length === 0) {
        return res.apiError('rules 必须为非空数组', 'INVALID_RULES')
      }

      const { SegmentRuleConfig } = req.app.locals.models || require('../../../models')

      const result = await TransactionManager.execute(
        async transaction => {
          return await SegmentRuleConfig.create({
            version_key,
            version_name,
            description: description || null,
            rules,
            is_system: 0,
            status: 'active',
            created_by: req.user?.user_id || null
          }, { transaction })
        },
        { description: 'createSegmentRuleConfig' }
      )

      sharedComponents.logger.info('创建分群策略成功', {
        version_key,
        created_by: req.user?.user_id
      })

      return res.apiSuccess(result.toJSON(), '分群策略创建成功')
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.apiError(`版本标识 ${version_key} 已存在`, 'DUPLICATE_VERSION_KEY')
      }
      sharedComponents.logger.error('创建分群策略失败', { error: error.message })
      return res.apiInternalError('创建分群策略失败', error.message, 'SEGMENT_RULE_CREATE_ERROR')
    }
  })
)

/**
 * PUT /:version_key - 编辑版本规则
 */
router.put(
  '/:version_key',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { version_key } = req.params
    const { version_name, description, rules } = req.body

    try {
      const { SegmentRuleConfig } = req.app.locals.models || require('../../../models')
      const config = await SegmentRuleConfig.findOne({ where: { version_key } })

      if (!config) {
        return res.apiError(`分群策略版本不存在: ${version_key}`, 'SEGMENT_RULE_NOT_FOUND')
      }

      const updateData = {}
      if (version_name !== undefined) updateData.version_name = version_name
      if (description !== undefined) updateData.description = description
      if (rules !== undefined) {
        if (!Array.isArray(rules) || rules.length === 0) {
          return res.apiError('rules 必须为非空数组', 'INVALID_RULES')
        }
        updateData.rules = rules
      }

      await TransactionManager.execute(
        async transaction => {
          await config.update(updateData, { transaction })
        },
        { description: 'updateSegmentRuleConfig' }
      )

      sharedComponents.logger.info('更新分群策略成功', {
        version_key,
        updated_by: req.user?.user_id
      })

      return res.apiSuccess(config.toJSON(), '分群策略更新成功')
    } catch (error) {
      sharedComponents.logger.error('更新分群策略失败', { error: error.message })
      return res.apiInternalError('更新分群策略失败', error.message, 'SEGMENT_RULE_UPDATE_ERROR')
    }
  })
)

/**
 * DELETE /:version_key - 归档版本（is_system=1 不可删）
 */
router.delete(
  '/:version_key',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { version_key } = req.params

    try {
      const { SegmentRuleConfig } = req.app.locals.models || require('../../../models')
      const config = await SegmentRuleConfig.findOne({ where: { version_key } })

      if (!config) {
        return res.apiError(`分群策略版本不存在: ${version_key}`, 'SEGMENT_RULE_NOT_FOUND')
      }

      if (config.is_system) {
        return res.apiError('系统内置策略不可删除', 'SYSTEM_RULE_PROTECTED')
      }

      await TransactionManager.execute(
        async transaction => {
          await config.update({ status: 'archived' }, { transaction })
        },
        { description: 'archiveSegmentRuleConfig' }
      )

      sharedComponents.logger.info('归档分群策略成功', {
        version_key,
        archived_by: req.user?.user_id
      })

      return res.apiSuccess({ version_key, status: 'archived' }, '分群策略已归档')
    } catch (error) {
      sharedComponents.logger.error('归档分群策略失败', { error: error.message })
      return res.apiInternalError('归档分群策略失败', error.message, 'SEGMENT_RULE_ARCHIVE_ERROR')
    }
  })
)

module.exports = router
