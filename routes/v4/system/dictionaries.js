/**
 * 系统字典管理路由
 *
 * 顶层路径：/api/v4/system/dictionaries
 *
 * 功能：
 * - 获取字典列表和详情
 * - 更新字典项（需管理员权限）
 * - 版本回滚（需管理员权限）
 * - 缓存刷新（需管理员权限）
 *
 * 创建时间：2026-01-22
 * 版本：V4.7.0
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

'use strict'

const express = require('express')
const router = express.Router()

// 中间件
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')

// 日志
const { logger } = require('../../../utils/logger')

/**
 * 获取显示名称翻译服务（通过 ServiceManager 统一入口）
 * @param {Object} req - Express 请求对象
 * @returns {Object} DisplayNameService 实例
 */
function getDisplayNameService(req) {
  return req.app.locals.services.getService('display_name')
}

// ==================== 公开接口（无需登录） ====================

/**
 * GET /api/v4/system/dictionaries/types
 * 获取所有字典类型列表
 *
 * 响应示例：
 * {
 *   "success": true,
 *   "code": "DICT_TYPES_SUCCESS",
 *   "data": ["user_status", "order_status", "operation_type", ...]
 * }
 */
router.get('/types', async (req, res) => {
  try {
    const DisplayNameService = getDisplayNameService(req)
    const types = await DisplayNameService.getAllTypes()

    return res.apiSuccess(
      {
        types,
        count: types.length
      },
      '获取字典类型列表成功',
      'DICT_TYPES_SUCCESS'
    )
  } catch (error) {
    logger.error('[DictionaryRoute] 获取字典类型列表失败', { error: error.message })
    return res.apiError('获取字典类型列表失败', 'DICT_TYPES_FAILED', { error: error.message }, 500)
  }
})

/**
 * GET /api/v4/system/dictionaries/type/:dictType
 * 获取指定类型的所有字典项
 *
 * 路径参数：
 * - dictType: 字典类型（如：user_status, order_status）
 *
 * 响应示例：
 * {
 *   "success": true,
 *   "code": "DICT_ITEMS_SUCCESS",
 *   "data": {
 *     "dict_type": "user_status",
 *     "items": [
 *       { "code": "active", "name": "正常", "color": "bg-success" },
 *       { "code": "inactive", "name": "未激活", "color": "bg-warning" }
 *     ]
 *   }
 * }
 */
router.get('/type/:dictType', async (req, res) => {
  try {
    const DisplayNameService = getDisplayNameService(req)
    const { dictType } = req.params

    if (!dictType) {
      return res.apiError('字典类型不能为空', 'INVALID_DICT_TYPE', null, 400)
    }

    const items = await DisplayNameService.getByType(dictType)

    return res.apiSuccess(
      {
        dict_type: dictType,
        items,
        count: items.length
      },
      '获取字典项列表成功',
      'DICT_ITEMS_SUCCESS'
    )
  } catch (error) {
    logger.error('[DictionaryRoute] 获取字典项列表失败', {
      dict_type: req.params.dictType,
      error: error.message
    })
    return res.apiError('获取字典项列表失败', 'DICT_ITEMS_FAILED', { error: error.message }, 500)
  }
})

/**
 * GET /api/v4/system/dictionaries/lookup
 * 查询单个字典项的显示名称和颜色
 *
 * 查询参数：
 * - dict_type: 字典类型（必填）
 * - dict_code: 字典编码（必填）
 *
 * 响应示例：
 * {
 *   "success": true,
 *   "code": "DICT_LOOKUP_SUCCESS",
 *   "data": {
 *     "dict_type": "user_status",
 *     "dict_code": "active",
 *     "name": "正常",
 *     "color": "bg-success"
 *   }
 * }
 */
router.get('/lookup', async (req, res) => {
  try {
    const DisplayNameService = getDisplayNameService(req)
    const { dict_type: dictType, dict_code: dictCode } = req.query

    if (!dictType || !dictCode) {
      return res.apiError('dict_type 和 dict_code 不能为空', 'INVALID_PARAMS', null, 400)
    }

    const [name, color] = await Promise.all([
      DisplayNameService.getDisplayName(dictType, dictCode),
      DisplayNameService.getDisplayColor(dictType, dictCode)
    ])

    if (!name) {
      return res.apiError(`未找到字典项: ${dictType}:${dictCode}`, 'DICT_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(
      {
        dict_type: dictType,
        dict_code: dictCode,
        name,
        color
      },
      '查询字典项成功',
      'DICT_LOOKUP_SUCCESS'
    )
  } catch (error) {
    logger.error('[DictionaryRoute] 查询字典项失败', {
      dict_type: req.query.dict_type,
      dict_code: req.query.dict_code,
      error: error.message
    })
    return res.apiError('查询字典项失败', 'DICT_LOOKUP_FAILED', { error: error.message }, 500)
  }
})

/**
 * GET /api/v4/system/dictionaries/cache/stats
 * 获取字典缓存统计信息
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const DisplayNameService = getDisplayNameService(req)
    const stats = await DisplayNameService.getCacheStats()

    return res.apiSuccess(stats, '获取缓存统计成功', 'CACHE_STATS_SUCCESS')
  } catch (error) {
    logger.error('[DictionaryRoute] 获取缓存统计失败', { error: error.message })
    return res.apiError('获取缓存统计失败', 'CACHE_STATS_FAILED', { error: error.message }, 500)
  }
})

// ==================== 管理接口（需管理员权限） ====================

/**
 * GET /api/v4/system/dictionaries/:dictId
 * 获取字典详情（包含历史版本）
 */
router.get('/:dictId', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const DisplayNameService = getDisplayNameService(req)
    const { dictId } = req.params
    // Phase 3 收口：通过 ServiceManager 获取 SystemDictionary
    const { SystemDictionary } = req.app.locals.models

    const dictionary = await SystemDictionary.findByPk(dictId, {
      include: [
        {
          association: 'updater',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    if (!dictionary) {
      return res.apiError('字典项不存在', 'DICT_NOT_FOUND', null, 404)
    }

    // 获取版本历史
    const history = await DisplayNameService.getVersionHistory(dictId)

    return res.apiSuccess(
      {
        dictionary: {
          dict_id: dictionary.dict_id,
          dict_type: dictionary.dict_type,
          dict_code: dictionary.dict_code,
          dict_name: dictionary.dict_name,
          dict_color: dictionary.dict_color,
          sort_order: dictionary.sort_order,
          is_enabled: dictionary.is_enabled,
          remark: dictionary.remark,
          version: dictionary.version,
          updated_by: dictionary.updated_by,
          updater: dictionary.updater,
          created_at: dictionary.created_at,
          updated_at: dictionary.updated_at
        },
        history
      },
      '获取字典详情成功',
      'DICT_DETAIL_SUCCESS'
    )
  } catch (error) {
    logger.error('[DictionaryRoute] 获取字典详情失败', {
      dict_id: req.params.dictId,
      error: error.message
    })
    return res.apiError('获取字典详情失败', 'DICT_DETAIL_FAILED', { error: error.message }, 500)
  }
})

/**
 * PUT /api/v4/system/dictionaries/:dictId
 * 更新字典项
 *
 * 请求体：
 * {
 *   "dict_name": "新的中文名称",
 *   "dict_color": "bg-success",
 *   "reason": "修改原因"
 * }
 */
router.put('/:dictId', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const DisplayNameService = getDisplayNameService(req)
    const { dictId } = req.params
    const { dict_name: dictName, dict_color: dictColor, reason } = req.body
    const operatorId = req.user.user_id

    // 参数校验
    if (!dictName && dictColor === undefined) {
      return res.apiError(
        '请提供要更新的字段（dict_name 或 dict_color）',
        'INVALID_PARAMS',
        null,
        400
      )
    }

    const updateData = {}
    if (dictName !== undefined) {
      updateData.dict_name = dictName
    }
    if (dictColor !== undefined) {
      updateData.dict_color = dictColor
    }

    const updatedDict = await DisplayNameService.updateDictionary(
      dictId,
      updateData,
      operatorId,
      reason
    )

    logger.info('[DictionaryRoute] 字典更新成功', {
      dict_id: dictId,
      operator_id: operatorId,
      changes: updateData
    })

    return res.apiSuccess(
      {
        dict_id: updatedDict.dict_id,
        dict_type: updatedDict.dict_type,
        dict_code: updatedDict.dict_code,
        dict_name: updatedDict.dict_name,
        dict_color: updatedDict.dict_color,
        version: updatedDict.version
      },
      '字典更新成功',
      'DICT_UPDATE_SUCCESS'
    )
  } catch (error) {
    logger.error('[DictionaryRoute] 字典更新失败', {
      dict_id: req.params.dictId,
      error: error.message
    })

    if (error.code === 'DICT_NOT_FOUND') {
      return res.apiError(error.message, error.code, null, 404)
    }

    return res.apiError('字典更新失败', 'DICT_UPDATE_FAILED', { error: error.message }, 500)
  }
})

/**
 * POST /api/v4/system/dictionaries/:dictId/rollback
 * 回滚到指定版本
 *
 * 请求体：
 * {
 *   "target_version": 1
 * }
 */
router.post('/:dictId/rollback', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const DisplayNameService = getDisplayNameService(req)
    const { dictId } = req.params
    const { target_version: targetVersion } = req.body
    const operatorId = req.user.user_id

    if (!targetVersion || typeof targetVersion !== 'number') {
      return res.apiError('target_version 必须是有效的版本号', 'INVALID_PARAMS', null, 400)
    }

    const rolledBackDict = await DisplayNameService.rollbackToVersion(
      parseInt(dictId, 10),
      targetVersion,
      operatorId
    )

    logger.info('[DictionaryRoute] 版本回滚成功', {
      dict_id: dictId,
      target_version: targetVersion,
      operator_id: operatorId
    })

    return res.apiSuccess(
      {
        dict_id: rolledBackDict.dict_id,
        dict_type: rolledBackDict.dict_type,
        dict_code: rolledBackDict.dict_code,
        dict_name: rolledBackDict.dict_name,
        dict_color: rolledBackDict.dict_color,
        version: rolledBackDict.version
      },
      `已回滚到版本 ${targetVersion}`,
      'DICT_ROLLBACK_SUCCESS'
    )
  } catch (error) {
    logger.error('[DictionaryRoute] 版本回滚失败', {
      dict_id: req.params.dictId,
      target_version: req.body.target_version,
      error: error.message
    })

    if (error.code === 'DICT_NOT_FOUND' || error.code === 'VERSION_NOT_FOUND') {
      return res.apiError(error.message, error.code, null, 404)
    }

    return res.apiError('版本回滚失败', 'DICT_ROLLBACK_FAILED', { error: error.message }, 500)
  }
})

/**
 * POST /api/v4/system/dictionaries/cache/refresh
 * 刷新字典缓存
 */
router.post('/cache/refresh', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const DisplayNameService = getDisplayNameService(req)
    const operatorId = req.user.user_id

    const result = await DisplayNameService.refreshCache()

    logger.info('[DictionaryRoute] 缓存刷新成功', {
      operator_id: operatorId,
      loaded: result.loaded,
      version: result.version
    })

    return res.apiSuccess(
      {
        loaded: result.loaded,
        version: result.version,
        message: `已刷新 ${result.loaded} 条字典记录`
      },
      '缓存刷新成功',
      'CACHE_REFRESH_SUCCESS'
    )
  } catch (error) {
    logger.error('[DictionaryRoute] 缓存刷新失败', { error: error.message })
    return res.apiError('缓存刷新失败', 'CACHE_REFRESH_FAILED', { error: error.message }, 500)
  }
})

/**
 * GET /api/v4/system/dictionaries/history/:dictId
 * 获取字典版本历史
 */
router.get('/history/:dictId', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const DisplayNameService = getDisplayNameService(req)
    const { dictId } = req.params

    const history = await DisplayNameService.getVersionHistory(parseInt(dictId, 10))

    return res.apiSuccess(
      {
        dict_id: parseInt(dictId, 10),
        history,
        count: history.length
      },
      '获取版本历史成功',
      'DICT_HISTORY_SUCCESS'
    )
  } catch (error) {
    logger.error('[DictionaryRoute] 获取版本历史失败', {
      dict_id: req.params.dictId,
      error: error.message
    })
    return res.apiError('获取版本历史失败', 'DICT_HISTORY_FAILED', { error: error.message }, 500)
  }
})

module.exports = router
