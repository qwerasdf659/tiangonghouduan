/**
 * @file 抽奖策略配置管理路由（Lottery Config Routes）
 * @description 管理抽奖策略配置表和矩阵配置表的RESTful API
 *
 * API端点：
 * 策略配置（lottery_strategy_config）:
 * - GET    /api/v4/console/lottery-config/strategy        获取策略配置列表
 * - GET    /api/v4/console/lottery-config/strategy/all    获取所有分组的完整配置
 * - GET    /api/v4/console/lottery-config/strategy/groups 获取配置分组定义
 * - GET    /api/v4/console/lottery-config/strategy/group/:group_name  获取指定分组配置
 * - GET    /api/v4/console/lottery-config/strategy/:id    获取单个配置详情
 * - POST   /api/v4/console/lottery-config/strategy        创建配置
 * - PUT    /api/v4/console/lottery-config/strategy/:id    更新配置
 * - DELETE /api/v4/console/lottery-config/strategy/:id    删除配置
 * - PUT    /api/v4/console/lottery-config/strategy/group/:group_name  批量更新分组配置
 *
 * 矩阵配置（lottery_tier_matrix_config）:
 * - GET    /api/v4/console/lottery-config/matrix          获取矩阵配置列表
 * - GET    /api/v4/console/lottery-config/matrix/full     获取完整BxPx矩阵
 * - GET    /api/v4/console/lottery-config/matrix/:id      获取单个配置详情
 * - GET    /api/v4/console/lottery-config/matrix/value/:budget_tier/:pressure_tier  获取特定组合
 * - POST   /api/v4/console/lottery-config/matrix          创建配置
 * - PUT    /api/v4/console/lottery-config/matrix/:id      更新配置
 * - PUT    /api/v4/console/lottery-config/matrix/batch    批量更新矩阵
 * - DELETE /api/v4/console/lottery-config/matrix/:id      删除配置
 *
 * 权限：仅管理员（requireAdmin）
 * 路径设计：配置实体使用 :id（自增主键）
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * 获取 LotteryConfigService 实例
 *
 * @param {Object} req - Express 请求对象
 * @returns {LotteryConfigService} 服务实例
 */
function getLotteryConfigService(req) {
  return req.app.locals.services.getService('lottery_config')
}

/*
 * =============================================================================
 * 策略配置（LotteryStrategyConfig）路由
 * =============================================================================
 */

/**
 * GET /strategy - 获取策略配置列表
 *
 * 查询参数：
 * - config_group: 配置分组筛选
 * - is_active: 是否启用（true/false）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/strategy', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const { config_group, is_active, page, page_size } = req.query

    const result = await service.getStrategyConfigs({
      config_group,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
      page: parseInt(page) || 1,
      page_size: parseInt(page_size) || 20
    })

    return res.apiSuccess(result, '获取策略配置列表成功')
  } catch (error) {
    logger.error('获取策略配置列表失败:', error)
    return res.apiError(
      `获取策略配置列表失败: ${error.message}`,
      error.code || 'STRATEGY_CONFIG_LIST_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * GET /strategy/all - 获取所有分组的完整配置
 */
router.get('/strategy/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const result = await service.getAllConfig()

    return res.apiSuccess(result, '获取所有配置成功')
  } catch (error) {
    logger.error('获取所有配置失败:', error)
    return res.apiError(
      `获取所有配置失败: ${error.message}`,
      error.code || 'STRATEGY_CONFIG_ALL_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * GET /strategy/groups - 获取配置分组定义
 */
router.get('/strategy/groups', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const groups = service.getConfigGroups()

    return res.apiSuccess(groups, '获取配置分组定义成功')
  } catch (error) {
    logger.error('获取配置分组定义失败:', error)
    return res.apiError(`获取配置分组定义失败: ${error.message}`, 'CONFIG_GROUPS_FAILED', null, 500)
  }
})

/**
 * GET /strategy/group/:group_name - 获取指定分组配置
 */
router.get('/strategy/group/:group_name', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const { group_name } = req.params
    const result = await service.getConfigByGroup(group_name)

    return res.apiSuccess(result, `获取配置分组 ${group_name} 成功`)
  } catch (error) {
    logger.error(`获取配置分组 ${req.params.group_name} 失败:`, error)
    return res.apiError(
      `获取配置分组失败: ${error.message}`,
      error.code || 'STRATEGY_CONFIG_GROUP_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * GET /strategy/:id - 获取单个配置详情
 */
router.get('/strategy/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const { id } = req.params
    const result = await service.getStrategyConfigById(parseInt(id))

    return res.apiSuccess(result, '获取策略配置详情成功')
  } catch (error) {
    logger.error(`获取策略配置详情 ${req.params.id} 失败:`, error)
    return res.apiError(
      `获取策略配置详情失败: ${error.message}`,
      error.code || 'STRATEGY_CONFIG_DETAIL_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * POST /strategy - 创建策略配置
 *
 * 请求体：
 * - config_group: 配置分组（必填）
 * - config_key: 配置键名（必填）
 * - config_value: 配置值（必填）
 * - description: 配置描述
 * - priority: 优先级（默认0）
 * - effective_start: 生效开始时间
 * - effective_end: 生效结束时间
 */
router.post('/strategy', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const admin_id = req.user.user_id

    const result = await TransactionManager.execute(async transaction => {
      return await service.createStrategyConfig(req.body, admin_id, { transaction })
    })

    return res.apiSuccess(result, '创建策略配置成功')
  } catch (error) {
    logger.error('创建策略配置失败:', error)
    return res.apiError(
      `创建策略配置失败: ${error.message}`,
      error.code || 'STRATEGY_CONFIG_CREATE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * PUT /strategy/:id - 更新策略配置
 *
 * 请求体：
 * - config_value: 配置值
 * - description: 配置描述
 * - is_active: 是否启用
 * - effective_start: 生效开始时间
 * - effective_end: 生效结束时间
 */
router.put('/strategy/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const { id } = req.params
    const admin_id = req.user.user_id

    const result = await TransactionManager.execute(async transaction => {
      return await service.updateStrategyConfig(parseInt(id), req.body, admin_id, { transaction })
    })

    return res.apiSuccess(result, '更新策略配置成功')
  } catch (error) {
    logger.error(`更新策略配置 ${req.params.id} 失败:`, error)
    return res.apiError(
      `更新策略配置失败: ${error.message}`,
      error.code || 'STRATEGY_CONFIG_UPDATE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * DELETE /strategy/:id - 删除策略配置
 */
router.delete('/strategy/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const { id } = req.params
    const admin_id = req.user.user_id

    await TransactionManager.execute(async transaction => {
      await service.deleteStrategyConfig(parseInt(id), admin_id, { transaction })
    })

    return res.apiSuccess(null, '删除策略配置成功')
  } catch (error) {
    logger.error(`删除策略配置 ${req.params.id} 失败:`, error)
    return res.apiError(
      `删除策略配置失败: ${error.message}`,
      error.code || 'STRATEGY_CONFIG_DELETE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * PUT /strategy/group/:group_name - 批量更新分组配置
 *
 * 请求体：
 * - configs: 配置键值对 { key1: value1, key2: value2 }
 */
router.put('/strategy/group/:group_name', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const { group_name } = req.params
    const { configs } = req.body
    const admin_id = req.user.user_id

    if (!configs || typeof configs !== 'object') {
      return res.apiError(
        '配置数据格式错误，需要 { configs: { key: value } }',
        'INVALID_CONFIG_DATA',
        null,
        400
      )
    }

    const result = await TransactionManager.execute(async transaction => {
      return await service.upsertConfigGroup(group_name, configs, admin_id, { transaction })
    })

    return res.apiSuccess(result, `批量更新配置分组 ${group_name} 成功`)
  } catch (error) {
    logger.error(`批量更新配置分组 ${req.params.group_name} 失败:`, error)
    return res.apiError(
      `批量更新配置分组失败: ${error.message}`,
      error.code || 'STRATEGY_CONFIG_BATCH_UPDATE_FAILED',
      null,
      error.status || 500
    )
  }
})

/*
 * =============================================================================
 * 矩阵配置（LotteryTierMatrixConfig）路由
 * =============================================================================
 */

/**
 * GET /matrix - 获取矩阵配置列表
 *
 * 查询参数：
 * - budget_tier: 预算层级筛选（B0/B1/B2/B3）
 * - is_active: 是否启用（true/false）
 */
router.get('/matrix', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const { budget_tier, is_active } = req.query

    const result = await service.getMatrixConfigs({
      budget_tier,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined
    })

    return res.apiSuccess(result, '获取矩阵配置列表成功')
  } catch (error) {
    logger.error('获取矩阵配置列表失败:', error)
    return res.apiError(
      `获取矩阵配置列表失败: ${error.message}`,
      error.code || 'MATRIX_CONFIG_LIST_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * GET /matrix/full - 获取完整BxPx矩阵
 */
router.get('/matrix/full', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const matrix = await service.getFullMatrix()

    return res.apiSuccess(
      {
        matrix,
        description: {
          budget_tiers: {
            B0: '预算极低（仅 fallback）',
            B1: '预算低（low + fallback）',
            B2: '预算中（mid + low + fallback）',
            B3: '预算高（all tiers）'
          },
          pressure_tiers: {
            P0: '低压（消耗慢，可以宽松）',
            P1: '中压（正常）',
            P2: '高压（消耗快，需要收紧）'
          },
          multipliers: {
            cap_multiplier: '预算上限乘数（0=强制空奖）',
            empty_weight_multiplier: '空奖权重乘数（<1抑制空奖，>1增强空奖）'
          }
        }
      },
      '获取完整矩阵成功'
    )
  } catch (error) {
    logger.error('获取完整矩阵失败:', error)
    return res.apiError(
      `获取完整矩阵失败: ${error.message}`,
      error.code || 'MATRIX_FULL_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * GET /matrix/value/:budget_tier/:pressure_tier - 获取特定BxPx组合配置
 */
router.get(
  '/matrix/value/:budget_tier/:pressure_tier',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const service = getLotteryConfigService(req)
      const { budget_tier, pressure_tier } = req.params
      const result = await service.getMatrixValue(budget_tier, pressure_tier)

      return res.apiSuccess(result, `获取矩阵配置 ${budget_tier}x${pressure_tier} 成功`)
    } catch (error) {
      logger.error(
        `获取矩阵配置 ${req.params.budget_tier}x${req.params.pressure_tier} 失败:`,
        error
      )
      return res.apiError(
        `获取矩阵配置失败: ${error.message}`,
        error.code || 'MATRIX_VALUE_FAILED',
        null,
        error.status || 500
      )
    }
  }
)

/**
 * GET /matrix/:id - 获取单个矩阵配置详情
 */
router.get('/matrix/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const { id } = req.params
    const result = await service.getMatrixConfigById(parseInt(id))

    return res.apiSuccess(result, '获取矩阵配置详情成功')
  } catch (error) {
    logger.error(`获取矩阵配置详情 ${req.params.id} 失败:`, error)
    return res.apiError(
      `获取矩阵配置详情失败: ${error.message}`,
      error.code || 'MATRIX_CONFIG_DETAIL_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * POST /matrix - 创建矩阵配置
 *
 * 请求体：
 * - budget_tier: Budget Tier（B0/B1/B2/B3，必填）
 * - pressure_tier: Pressure Tier（P0/P1/P2，必填）
 * - cap_multiplier: 预算上限乘数（必填）
 * - empty_weight_multiplier: 空奖权重乘数（必填）
 * - description: 配置描述
 */
router.post('/matrix', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const admin_id = req.user.user_id

    const result = await TransactionManager.execute(async transaction => {
      return await service.createMatrixConfig(req.body, admin_id, { transaction })
    })

    return res.apiSuccess(result, '创建矩阵配置成功')
  } catch (error) {
    logger.error('创建矩阵配置失败:', error)
    return res.apiError(
      `创建矩阵配置失败: ${error.message}`,
      error.code || 'MATRIX_CONFIG_CREATE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * PUT /matrix/:id - 更新矩阵配置
 *
 * 请求体：
 * - cap_multiplier: 预算上限乘数
 * - empty_weight_multiplier: 空奖权重乘数
 * - description: 配置描述
 * - is_active: 是否启用
 */
router.put('/matrix/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const { id } = req.params
    const admin_id = req.user.user_id

    const result = await TransactionManager.execute(async transaction => {
      return await service.updateMatrixConfig(parseInt(id), req.body, admin_id, { transaction })
    })

    return res.apiSuccess(result, '更新矩阵配置成功')
  } catch (error) {
    logger.error(`更新矩阵配置 ${req.params.id} 失败:`, error)
    return res.apiError(
      `更新矩阵配置失败: ${error.message}`,
      error.code || 'MATRIX_CONFIG_UPDATE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * PUT /matrix/batch - 批量更新矩阵配置
 *
 * 请求体：
 * - matrix_data: 矩阵数据对象
 *   {
 *     B2: {
 *       P1: { cap_multiplier: 1.0, empty_weight_multiplier: 0.85 }
 *     }
 *   }
 */
router.put('/matrix/batch', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const { matrix_data } = req.body
    const admin_id = req.user.user_id

    if (!matrix_data || typeof matrix_data !== 'object') {
      return res.apiError('矩阵数据格式错误', 'INVALID_MATRIX_DATA', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await service.updateMatrix(matrix_data, admin_id, { transaction })
    })

    return res.apiSuccess(result, '批量更新矩阵配置成功')
  } catch (error) {
    logger.error('批量更新矩阵配置失败:', error)
    return res.apiError(
      `批量更新矩阵配置失败: ${error.message}`,
      error.code || 'MATRIX_BATCH_UPDATE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * DELETE /matrix/:id - 删除矩阵配置
 */
router.delete('/matrix/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = getLotteryConfigService(req)
    const { id } = req.params
    const admin_id = req.user.user_id

    await TransactionManager.execute(async transaction => {
      await service.deleteMatrixConfig(parseInt(id), admin_id, { transaction })
    })

    return res.apiSuccess(null, '删除矩阵配置成功')
  } catch (error) {
    logger.error(`删除矩阵配置 ${req.params.id} 失败:`, error)
    return res.apiError(
      `删除矩阵配置失败: ${error.message}`,
      error.code || 'MATRIX_CONFIG_DELETE_FAILED',
      null,
      error.status || 500
    )
  }
})

module.exports = router
