/**
 * 用户分群策略管理路由
 *
 * @description CRUD 管理分群策略版本，供 tier_first 选奖方式按用户群使用不同档位权重
 * @route /api/v4/console/segment-rules
 * @version 4.0.0
 */

'use strict'

const express = require('express')
const router = express.Router()
const { SEGMENT_FIELDS, SEGMENT_OPERATORS } = require('../../../config/segment_field_registry')
const TransactionManager = require('../../../utils/TransactionManager')
const { adminAuthMiddleware, asyncHandler, sharedComponents } = require('./shared/middleware')

/**
 * GET / - 列出所有分群策略版本
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const SegmentRuleService = req.app.locals.services.getService('segment_rule')
      const configs = await SegmentRuleService.getAllVersions()

      return res.apiSuccess(
        {
          configs: configs.map(c => ({
            ...c,
            is_editable: !c.is_system,
            is_deletable: !c.is_system
          })),
          total: configs.length
        },
        '分群策略列表获取成功'
      )
    } catch (error) {
      sharedComponents.logger.error('获取分群策略列表失败', { error: error.message })
      return res.apiInternalError('获取分群策略列表失败', error.message)
    }
  })
)

/**
 * GET /field-registry - 获取可用字段+运算符白名单（供前端条件构建器渲染）
 */
router.get(
  '/field-registry',
  adminAuthMiddleware,
  asyncHandler(async (_req, res) => {
    /* 序列化时去掉 evaluate 函数（前端不需要） */
    const fields = {}
    for (const [key, field] of Object.entries(SEGMENT_FIELDS)) {
      fields[key] = { label: field.label, type: field.type, operators: field.operators }
      if (field.options) fields[key].options = field.options
    }

    const operators = {}
    for (const [key, op] of Object.entries(SEGMENT_OPERATORS)) {
      operators[key] = {
        label: op.label,
        value_type: op.value_type,
        value_hint: op.value_hint || null
      }
    }

    return res.apiSuccess({ fields, operators }, '字段注册表获取成功')
  })
)

/**
 * GET /:version_key - 获取某版本详情（含完整 rules JSON）
 */
router.get(
  '/:version_key',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const SegmentRuleService = req.app.locals.services.getService('segment_rule')
      const config = await SegmentRuleService.getVersionDetail(req.params.version_key)

      return res.apiSuccess(
        {
          ...config,
          is_editable: !config.is_system,
          is_deletable: !config.is_system
        },
        '分群策略详情获取成功'
      )
    } catch (error) {
      sharedComponents.logger.error('获取分群策略详情失败', { error: error.message })
      return res.apiInternalError('获取分群策略详情失败', error.message)
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
    try {
      const { version_key, version_name, description, rules } = req.body

      if (!version_key || !version_name || !rules) {
        return res.apiError('version_key、version_name、rules 为必填字段', 'VALIDATION_ERROR')
      }

      const SegmentRuleService = req.app.locals.services.getService('segment_rule')
      const config = await TransactionManager.execute(
        async transaction => {
          return SegmentRuleService.createVersion(
            { version_key, version_name, description, rules },
            { transaction, created_by: req.user?.user_id || null }
          )
        },
        { description: '创建分群策略版本' }
      )

      return res.apiSuccess(config, '分群策略创建成功')
    } catch (error) {
      sharedComponents.logger.error('创建分群策略失败', { error: error.message })
      return res.apiInternalError('创建分群策略失败', error.message)
    }
  })
)

/**
 * PUT /:version_key - 编辑分群策略版本
 */
router.put(
  '/:version_key',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { version_name, description, rules } = req.body

      const SegmentRuleService = req.app.locals.services.getService('segment_rule')
      const result = await TransactionManager.execute(
        async transaction => {
          return SegmentRuleService.updateVersion(
            req.params.version_key,
            { version_name, description, rules },
            { transaction, updated_by: req.user?.user_id || null }
          )
        },
        { description: '更新分群策略版本' }
      )

      return res.apiSuccess(result, '分群策略更新成功')
    } catch (error) {
      sharedComponents.logger.error('更新分群策略失败', { error: error.message })
      return res.apiInternalError('更新分群策略失败', error.message)
    }
  })
)

/**
 * DELETE /:version_key - 归档分群策略版本
 */
router.delete(
  '/:version_key',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const SegmentRuleService = req.app.locals.services.getService('segment_rule')
      const result = await TransactionManager.execute(
        async transaction => {
          return SegmentRuleService.archiveVersion(req.params.version_key, {
            transaction,
            deleted_by: req.user?.user_id || null
          })
        },
        { description: '归档分群策略版本' }
      )

      return res.apiSuccess(result, '分群策略已归档')
    } catch (error) {
      sharedComponents.logger.error('归档分群策略失败', { error: error.message })
      return res.apiInternalError('归档分群策略失败', error.message)
    }
  })
)

module.exports = router
