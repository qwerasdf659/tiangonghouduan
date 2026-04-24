/**
 * @file 抽奖配置管理路由（Lottery Configs Routes）
 * @description 管理抽奖策略配置和BxPx矩阵配置的RESTful API
 *
 * API端点：
 *
 * 策略配置（lottery_strategy_config）：
 * - GET    /api/v4/console/lottery-configs/strategies           获取策略配置列表
 * - GET    /api/v4/console/lottery-configs/strategies/:id       获取策略配置详情
 * - POST   /api/v4/console/lottery-configs/strategies           创建策略配置
 * - PUT    /api/v4/console/lottery-configs/strategies/:id       更新策略配置
 * - DELETE /api/v4/console/lottery-configs/strategies/:id       删除策略配置
 *
 * 矩阵配置（lottery_tier_matrix_config）：
 * - GET    /api/v4/console/lottery-configs/matrix               获取矩阵配置列表
 * - GET    /api/v4/console/lottery-configs/matrix/:id           获取矩阵配置详情
 * - POST   /api/v4/console/lottery-configs/matrix               创建矩阵配置
 * - PUT    /api/v4/console/lottery-configs/matrix/:id           更新矩阵配置
 * - DELETE /api/v4/console/lottery-configs/matrix/:id           删除矩阵配置
 *
 * 权限：仅管理员（requireRoleLevel(100)）
 * 路径设计：事务实体使用 :id（自增主键）
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../shared/middleware')
const TransactionManager = require('../../../../utils/TransactionManager')

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
 * 策略配置（LotteryStrategyConfig）API
 * =============================================================================
 */

/**
 * GET /strategies - 获取策略配置列表
 *
 * 查询参数：
 * - config_group: 配置分组筛选
 * - is_active: 是否启用（true/false）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/strategies', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const service = getLotteryConfigService(req)
  const { config_group, is_active, page, page_size } = req.query

  const result = await service.getStrategyConfigs({
    config_group,
    is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
    page: parseInt(page) || 1,
    page_size: parseInt(page_size) || 20
  })

  return res.apiSuccess(result, '获取策略配置列表成功')
}))

/**
 * GET /strategies/:id - 获取策略配置详情
 */
router.get('/strategies/:id', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const service = getLotteryConfigService(req)
  const { id } = req.params
  const result = await service.getStrategyConfigById(parseInt(id))

  return res.apiSuccess(result, '获取策略配置详情成功')
}))

/**
 * POST /strategies - 创建策略配置
 *
 * 请求体：
 * - config_group: 配置分组（必填）
 * - config_key: 配置键名（必填）
 * - config_value: 配置值（必填）
 * - description: 配置描述
 * - is_active: 是否启用（默认true）
 * - priority: 配置优先级（默认0）
 * - effective_start: 生效开始时间
 * - effective_end: 生效结束时间
 */
router.post('/strategies', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const service = getLotteryConfigService(req)
  const admin_id = req.user.user_id

  const result = await TransactionManager.execute(async transaction => {
    return await service.createStrategyConfig(req.body, admin_id, { transaction })
  })

  return res.apiSuccess(result, '创建策略配置成功')
}))

/**
 * PUT /strategies/:id - 更新策略配置
 *
 * 请求体（均为可选）：
 * - config_group: 配置分组
 * - config_key: 配置键名
 * - config_value: 配置值
 * - description: 配置描述
 * - is_active: 是否启用
 * - priority: 配置优先级
 * - effective_start: 生效开始时间
 * - effective_end: 生效结束时间
 */
router.put('/strategies/:id', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const service = getLotteryConfigService(req)
  const { id } = req.params
  const admin_id = req.user.user_id

  const result = await TransactionManager.execute(async transaction => {
    return await service.updateStrategyConfig(parseInt(id), req.body, admin_id, { transaction })
  })

  return res.apiSuccess(result, '更新策略配置成功')
}))

/**
 * DELETE /strategies/:id - 删除策略配置
 */
router.delete('/strategies/:id', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const service = getLotteryConfigService(req)
  const { id } = req.params
  const admin_id = req.user.user_id

  await TransactionManager.execute(async transaction => {
    await service.deleteStrategyConfig(parseInt(id), admin_id, { transaction })
  })

  return res.apiSuccess(null, '删除策略配置成功')
}))

/*
 * =============================================================================
 * 矩阵配置（LotteryTierMatrixConfig）API
 * =============================================================================
 */

/**
 * GET /matrix - 获取矩阵配置列表
 *
 * 查询参数：
 * - budget_tier: Budget Tier筛选
 * - pressure_tier: Pressure Tier筛选
 * - is_active: 是否启用（true/false）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/matrix', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const service = getLotteryConfigService(req)
  const { budget_tier, pressure_tier, is_active, page, page_size } = req.query

  const result = await service.getMatrixConfigs({
    budget_tier,
    pressure_tier,
    is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
    page: parseInt(page) || 1,
    page_size: parseInt(page_size) || 20
  })

  return res.apiSuccess(result, '获取矩阵配置列表成功')
}))

/**
 * GET /matrix/:id - 获取矩阵配置详情
 */
router.get('/matrix/:id', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const service = getLotteryConfigService(req)
  const { id } = req.params
  const result = await service.getMatrixConfigById(parseInt(id))

  return res.apiSuccess(result, '获取矩阵配置详情成功')
}))

/**
 * POST /matrix - 创建矩阵配置
 *
 * 请求体：
 * - budget_tier: Budget Tier（必填，如：B1, B2, B3, B4）
 * - pressure_tier: Pressure Tier（必填，如：P1, P2, P3, P4）
 * - cap_multiplier: 预算上限乘数（必填）
 * - empty_weight_multiplier: 空奖权重乘数（必填）
 * - description: 配置描述
 * - is_active: 是否启用（默认true）
 */
router.post('/matrix', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const service = getLotteryConfigService(req)
  const admin_id = req.user.user_id

  const result = await TransactionManager.execute(async transaction => {
    return await service.createMatrixConfig(req.body, admin_id, { transaction })
  })

  return res.apiSuccess(result, '创建矩阵配置成功')
}))

/**
 * PUT /matrix/:id - 更新矩阵配置
 *
 * 请求体（均为可选）：
 * - budget_tier: Budget Tier
 * - pressure_tier: Pressure Tier
 * - cap_multiplier: 预算上限乘数
 * - empty_weight_multiplier: 空奖权重乘数
 * - description: 配置描述
 * - is_active: 是否启用
 */
router.put('/matrix/:id', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const service = getLotteryConfigService(req)
  const { id } = req.params
  const admin_id = req.user.user_id

  const result = await TransactionManager.execute(async transaction => {
    return await service.updateMatrixConfig(parseInt(id), req.body, admin_id, { transaction })
  })

  return res.apiSuccess(result, '更新矩阵配置成功')
}))

/**
 * DELETE /matrix/:id - 删除矩阵配置
 */
router.delete('/matrix/:id', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const service = getLotteryConfigService(req)
  const { id } = req.params
  const admin_id = req.user.user_id

  await TransactionManager.execute(async transaction => {
    await service.deleteMatrixConfig(parseInt(id), admin_id, { transaction })
  })

  return res.apiSuccess(null, '删除矩阵配置成功')
}))

module.exports = router
