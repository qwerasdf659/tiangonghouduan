/**
 * 奖品池管理模块
 *
 * @description 奖品池管理相关路由，包括奖品添加、查询、修改等
 * @version 4.0.0
 * @date 2025-09-24
 * @updated 2026-01-05（事务边界治理改造）
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 写操作使用 TransactionManager.execute() 统一管理事务
 * - 通过 ServiceManager 统一获取服务实例
 */

const express = require('express')
const TransactionManager = require('../../../utils/TransactionManager')
const router = express.Router()
const {
  sharedComponents,
  adminAuthMiddleware,
  adminOpsAuthMiddleware, // P1只读API中间件（admin+ops，ops只读）
  asyncHandler,
  validators
} = require('./shared/middleware')

/**
 * POST /batch-add - 批量添加奖品到奖品池
 *
 * @description 批量添加奖品到指定活动的奖品池
 * @route POST /api/v4/console/prize-pool/batch-add
 * @access Private (需要管理员权限)
 *
 * 🔒 P0修复：
 * 1. 修正模型名称：models.Prize → models.LotteryPrize
 * 2. 修正字段映射：name→prize_name, type→prize_type等
 * 3. 添加事务保护：确保原子性操作
 * 4. 添加概率验证：验证概率总和=1
 */
router.post(
  '/batch-add',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id, prizes } = req.body

    try {
      // 参数验证
      if (!campaign_id) {
        return res.apiError('活动ID不能为空', 'MISSING_CAMPAIGN_ID')
      }

      // 验证奖品列表基础格式
      try {
        validators.validatePrizePool(prizes)
      } catch (validationError) {
        return res.apiError(validationError.message, 'VALIDATION_ERROR')
      }

      // 通过 ServiceManager 获取 PrizePoolService
      const PrizePoolService = req.app.locals.services.getService('prize_pool')

      // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
      const result = await TransactionManager.execute(
        async transaction => {
          return await PrizePoolService.batchAddPrizes(campaign_id, prizes, {
            created_by: req.user?.user_id,
            transaction
          })
        },
        { description: 'batchAddPrizes' }
      )

      sharedComponents.logger.info('批量添加奖品成功', {
        campaign_id,
        prize_count: result.added_prizes,
        created_by: req.user?.id
      })

      return res.apiSuccess(result, '奖品批量添加成功')
    } catch (error) {
      // 🔒 识别sort_order唯一约束冲突错误
      if (
        error.message.includes('奖品排序') &&
        error.message.includes('已存在') &&
        error.message.includes('活动')
      ) {
        sharedComponents.logger.warn('奖品排序冲突', {
          error: error.message,
          campaign_id: req.body.campaign_id
        })
        return res.apiError(error.message, 'SORT_ORDER_DUPLICATE', {
          campaign_id: req.body.campaign_id,
          suggestion: '请检查sort_order字段，确保每个奖品在活动内有唯一的排序值'
        })
      }

      // 其他错误
      sharedComponents.logger.error('奖品批量添加失败', { error: error.message })
      return res.apiInternalError('奖品批量添加失败', error.message, 'PRIZE_BATCH_ADD_ERROR')
    }
  })
)

/**
 * GET /list - 获取所有奖品列表（不限活动）
 *
 * @description 获取所有奖品的列表，支持按活动和状态筛选
 * @route GET /api/v4/prizes/list
 * @access Private (需要管理员权限)
 * @query campaign_id - 可选，筛选指定活动
 * @query status - 可选，筛选状态
 *
 * 🔴 注意：必须在 /:code 之前定义，否则会被参数化路由捕获
 */
router.get(
  '/list',
  adminOpsAuthMiddleware, // P1只读API：允许admin和ops角色访问
  asyncHandler(async (req, res) => {
    try {
      const { campaign_id, status } = req.query

      const filters = {}
      if (campaign_id) filters.campaign_id = parseInt(campaign_id)
      if (status) filters.status = status

      // 通过 ServiceManager 获取 PrizePoolService
      const PrizePoolService = req.app.locals.services.getService('prize_pool')

      // 调用 Service 层方法
      const result = await PrizePoolService.getAllPrizes(filters)

      return res.apiSuccess(result, '奖品列表获取成功')
    } catch (error) {
      sharedComponents.logger.error('获取奖品列表失败', { error: error.message })
      return res.apiInternalError('获取奖品列表失败', error.message, 'PRIZE_LIST_ERROR')
    }
  })
)

/**
 * GET /:code - 获取指定活动的奖品池
 *
 * @description 获取指定活动的所有奖品信息
 * @route GET /api/v4/console/prize-pool/:code
 * @access Private (需要管理员权限)
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 奖品池（按活动查询）是配置实体，使用业务码（:code）作为标识符
 * - 业务码格式：snake_case（如 spring_festival）
 */
router.get(
  '/:code',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // 配置实体使用 :code 占位符，内部变量保持业务语义
      const campaign_code = req.params.code

      if (!campaign_code) {
        return res.apiError('缺少活动代码', 'MISSING_CAMPAIGN_CODE')
      }

      // 通过 ServiceManager 获取 PrizePoolService
      const PrizePoolService = req.app.locals.services.getService('prize_pool')

      // 调用 Service 层方法
      const prizePoolInfo = await PrizePoolService.getPrizesByCampaign(campaign_code)

      return res.apiSuccess(prizePoolInfo, '奖品池信息获取成功')
    } catch (error) {
      if (error.message.includes('活动不存在')) {
        return res.apiError(error.message, 'CAMPAIGN_NOT_FOUND', {
          campaign_code: req.params.code
        })
      }

      sharedComponents.logger.error('奖品池信息获取失败', { error: error.message })
      return res.apiInternalError('奖品池信息获取失败', error.message, 'PRIZE_POOL_GET_ERROR')
    }
  })
)

/**
 * PUT /prize/:id - 更新奖品信息
 *
 * @description 更新指定奖品的信息
 * @route PUT /api/v4/console/prize-pool/prize/:id
 * @access Private (需要管理员权限)
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 奖品配置实例是事务实体，使用数字ID（:id）作为标识符
 *
 * 🔒 P0修复：修正模型名称和字段映射
 */
router.put(
  '/prize/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const prize_id = parseInt(req.params.id, 10)
    const updateData = req.body

    try {
      if (!prize_id || isNaN(prize_id) || prize_id <= 0) {
        return res.apiError('无效的奖品ID', 'INVALID_PRIZE_ID')
      }

      // 通过 ServiceManager 获取 PrizePoolService
      const PrizePoolService = req.app.locals.services.getService('prize_pool')

      /*
       * 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
       * 🔧 2026-01-21 修复：使用正确的字段名 user_id 而不是 id
       */
      const result = await TransactionManager.execute(
        async transaction => {
          return await PrizePoolService.updatePrize(prize_id, updateData, {
            updated_by: req.user?.user_id,
            transaction
          })
        },
        { description: 'updatePrize' }
      )

      sharedComponents.logger.info('奖品信息更新成功', {
        prize_id,
        updated_fields: result.updated_fields,
        updated_by: req.user?.user_id
      })

      return res.apiSuccess(result, '奖品信息更新成功')
    } catch (error) {
      // 🔒 识别sort_order唯一约束冲突错误
      if (
        error.message.includes('奖品排序') &&
        error.message.includes('已存在') &&
        error.message.includes('活动')
      ) {
        sharedComponents.logger.warn('奖品排序冲突', {
          error: error.message,
          prize_id
        })
        return res.apiError(error.message, 'SORT_ORDER_DUPLICATE', {
          prize_id,
          suggestion: '该排序值已被同一活动的其他奖品使用，请使用不同的排序值'
        })
      }

      sharedComponents.logger.error('奖品信息更新失败', { error: error.message })
      return res.apiInternalError('奖品信息更新失败', error.message, 'PRIZE_UPDATE_ERROR')
    }
  })
)

/**
 * POST /prize/:id/add-stock - 补充库存
 *
 * @description 为指定奖品补充库存数量
 * @route POST /api/v4/console/prize-pool/prize/:id/add-stock
 * @access Private (需要管理员权限)
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 奖品配置实例是事务实体，使用数字ID（:id）作为标识符
 */
router.post(
  '/prize/:id/add-stock',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const prizeId = parseInt(req.params.id, 10)
      const { quantity } = req.body

      if (!quantity || quantity <= 0) {
        return res.apiError('补充数量必须大于0', 'INVALID_QUANTITY')
      }

      // 通过 ServiceManager 获取 PrizePoolService
      const PrizePoolService = req.app.locals.services.getService('prize_pool')

      // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
      const result = await TransactionManager.execute(
        async transaction => {
          return await PrizePoolService.addStock(prizeId, quantity, {
            operated_by: req.user?.user_id,
            transaction
          })
        },
        { description: 'addStock' }
      )

      sharedComponents.logger.info('库存补充成功', {
        prize_id: prizeId,
        old_quantity: result.old_quantity,
        add_quantity: quantity,
        new_quantity: result.new_quantity,
        operated_by: req.user?.id
      })

      return res.apiSuccess(result, '库存补充成功')
    } catch (error) {
      if (error.message === '奖品不存在') {
        return res.apiError(error.message, 'PRIZE_NOT_FOUND')
      }

      sharedComponents.logger.error('补充库存失败', { error: error.message })
      return res.apiInternalError('补充库存失败', error.message, 'ADD_STOCK_ERROR')
    }
  })
)

/**
 * DELETE /prize/:id - 删除奖品
 *
 * @description 删除指定的奖品（仅当无中奖记录时）
 * @route DELETE /api/v4/console/prize-pool/prize/:id
 * @access Private (需要管理员权限)
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 奖品配置实例是事务实体，使用数字ID（:id）作为标识符
 */
router.delete(
  '/prize/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const prizeId = parseInt(req.params.id, 10)

      // 通过 ServiceManager 获取 PrizePoolService
      const PrizePoolService = req.app.locals.services.getService('prize_pool')

      // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
      const result = await TransactionManager.execute(
        async transaction => {
          return await PrizePoolService.deletePrize(prizeId, {
            deleted_by: req.user?.user_id,
            transaction
          })
        },
        { description: 'deletePrize' }
      )

      sharedComponents.logger.info('奖品删除成功', {
        prize_id: prizeId,
        deleted_by: req.user?.id
      })

      return res.apiSuccess(result, '奖品删除成功')
    } catch (error) {
      if (error.message === '奖品不存在') {
        return res.apiError(error.message, 'PRIZE_NOT_FOUND')
      }

      if (error.message.includes('已被中奖') && error.message.includes('不能删除')) {
        return res.apiError(error.message, 'PRIZE_IN_USE')
      }

      sharedComponents.logger.error('删除奖品失败', { error: error.message })
      return res.apiInternalError('删除奖品失败', error.message, 'PRIZE_DELETE_ERROR')
    }
  })
)

module.exports = router
