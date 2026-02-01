const logger = require('../../../utils/logger').logger

/**
 * 抽奖预设管理路由
 * 为管理员提供用户抽奖结果预设功能
 * 实现运营干预：为特定用户预设抽奖结果，用户无感知
 * 创建时间：2025年01月21日
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 路由层不开启事务（事务管理在 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 * - 使用 LotteryPresetService 封装所有预设管理逻辑
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')

/**
 * 为用户创建抽奖预设队列
 * POST /api/v4/lottery/preset/create
 */
router.post('/create', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { user_id, presets } = req.body

    // 🎯 通过 ServiceManager 获取 LotteryPresetService
    const LotteryPresetService = req.app.locals.services.getService('lottery_preset')

    // 🎯 调用服务层方法（Service层会进行所有验证和业务逻辑处理）
    const createdPresets = await LotteryPresetService.createPresets(adminId, user_id, presets)

    // 返回创建结果 - 参数顺序：data第1个, message第2个
    return res.apiSuccess(
      {
        user_id,
        presets_count: createdPresets.length,
        created_presets: createdPresets.map(preset => ({
          lottery_preset_id: preset.lottery_preset_id,
          lottery_prize_id: preset.lottery_prize_id,
          queue_order: preset.queue_order,
          status: preset.status
        }))
      },
      '抽奖预设创建成功'
    )
  } catch (error) {
    // 🎯 细化错误处理：根据Service层抛出的错误类型返回合适的HTTP状态码
    logger.error('❌ 创建抽奖预设失败:', error.message)

    // Service层的业务错误
    if (
      error.code === 'INVALID_PARAMETERS' ||
      error.code === 'TOO_MANY_PRESETS' ||
      error.code === 'DUPLICATE_QUEUE_ORDER' ||
      error.code === 'INVALID_PRESET_DATA' ||
      error.code === 'INVALID_QUEUE_ORDER'
    ) {
      return res.apiError(error.message, error.code, null, 400)
    }

    if (error.code === 'USER_NOT_FOUND' || error.code === 'PRIZE_NOT_FOUND') {
      return res.apiError(error.message, error.code, null, 404)
    }

    // Sequelize数据库错误
    if (error.name === 'SequelizeDatabaseError') {
      return res.apiError('数据库操作失败，请稍后重试', 'DATABASE_ERROR', null, 500)
    }

    // Sequelize外键约束错误
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.apiError(
        '数据关联错误，请检查用户ID或奖品ID是否有效',
        'FOREIGN_KEY_ERROR',
        null,
        400
      )
    }

    // Sequelize唯一约束错误
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.apiError(
        '预设队列顺序重复，同一用户的queue_order不能重复',
        'DUPLICATE_QUEUE_ORDER',
        null,
        400
      )
    }

    // 其他未知错误
    return res.apiInternalError('创建抽奖预设失败')
  }
})

/**
 * 获取所有预设列表（管理员视角）
 * GET /api/v4/lottery/preset/list
 *
 * @description 获取所有用户的预设列表，支持筛选和分页（管理员查看所有预设记录）
 * @route GET /api/v4/lottery/preset/list
 * @access Private（需要JWT认证 + 管理员权限）
 *
 * 业务场景：
 * - 预设列表管理：管理员查看所有预设记录，进行统一管理
 * - 运营审计：审查所有预设配置，确保运营策略执行正确
 * - 用户支持：快速定位用户的预设配置，处理用户问题
 * - 数据分析：导出预设数据，分析运营效果
 *
 * 查询参数：
 * @query {string} status - 状态筛选（可选：pending/used/all，默认all）
 * @query {number} user_id - 用户ID筛选（可选，筛选特定用户的预设）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 * @query {string} order_by - 排序字段（默认created_at，可选：queue_order）
 * @query {string} order_dir - 排序方向（默认DESC，可选：ASC/DESC）
 *
 * 返回数据：
 * @returns {Array} list - 预设列表数组
 * @returns {Object} pagination - 分页信息（total、page、page_size、total_pages）
 * @returns {Object} filters - 当前筛选条件
 */
router.get('/list', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const adminId = req.user.user_id

    // 🎯 通过 ServiceManager 获取 LotteryPresetService
    const LotteryPresetService = req.app.locals.services.getService('lottery_preset')

    // 🎯 调用服务层方法（将查询参数传递给Service层）
    const result = await LotteryPresetService.listPresetsWithPagination(req.query)

    logger.info('📋 管理员查看预设列表', {
      adminId,
      filters: result.filters,
      totalCount: result.pagination.total
    })

    // 返回预设列表 - 参数顺序：data第1个, message第2个
    return res.apiSuccess(result, '获取预设列表成功')
  } catch (error) {
    // 🎯 细化错误处理：根据Service层抛出的错误类型返回合适的HTTP状态码
    logger.error('❌ 获取预设列表失败:', error.message)

    // Service层的业务错误
    if (
      error.code === 'INVALID_STATUS' ||
      error.code === 'INVALID_ORDER_BY' ||
      error.code === 'INVALID_ORDER_DIR' ||
      error.code === 'INVALID_PAGE' ||
      error.code === 'INVALID_PAGE_SIZE' ||
      error.code === 'INVALID_USER_ID'
    ) {
      return res.apiError(error.message, error.code, null, 400)
    }

    // Sequelize数据库错误
    if (error.name === 'SequelizeDatabaseError') {
      return res.apiError('数据库查询失败，请稍后重试', 'DATABASE_ERROR', null, 500)
    }

    // Sequelize连接错误
    if (error.name === 'SequelizeConnectionError') {
      return res.apiError('数据库连接失败，请联系技术支持', 'CONNECTION_ERROR', null, 500)
    }

    // Sequelize超时错误
    if (error.name === 'SequelizeTimeoutError') {
      return res.apiError('数据库查询超时，请重试', 'QUERY_TIMEOUT', null, 504)
    }

    // 其他未知错误
    return res.apiInternalError('获取预设列表失败')
  }
})

/**
 * 获取预设统计信息
 * GET /api/v4/lottery/preset/stats
 *
 * @description 获取系统级预设统计数据（管理员监控运营效果）
 * @route GET /api/v4/lottery/preset/stats
 * @access Private（需要JWT认证 + 管理员权限）
 *
 * 业务场景：
 * - 运营监控：查看预设总体使用情况
 * - 数据分析：评估预设运营效果（使用率、奖品分布）
 * - 决策支持：根据统计数据调整运营策略
 *
 * 返回数据：
 * @returns {number} total_presets - 总预设数量（pending + used）
 * @returns {number} pending_presets - 待使用预设数量
 * @returns {number} used_presets - 已使用预设数量
 * @returns {number} total_users_with_presets - 拥有预设的用户数量
 * @returns {string} usage_rate - 预设使用率（百分比）
 * @returns {Array} prize_type_distribution - 奖品类型分布统计
 */
router.get('/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const adminId = req.user.user_id

    // 🎯 通过 ServiceManager 获取 LotteryPresetService
    const LotteryPresetService = req.app.locals.services.getService('lottery_preset')

    // 🎯 调用服务层方法
    const stats = await LotteryPresetService.getPresetStats()

    logger.info('📊 管理员查看预设统计', {
      adminId,
      totalPresets: stats.total_presets,
      pendingPresets: stats.pending_presets,
      usedPresets: stats.used_presets
    })

    // 返回统计数据 - 参数顺序：data第1个, message第2个
    return res.apiSuccess(stats, '获取预设统计成功')
  } catch (error) {
    // 🎯 细化错误处理：根据Service层抛出的错误类型返回合适的HTTP状态码
    logger.error('❌ 获取预设统计失败:', error.message)

    // Sequelize数据库错误
    if (error.name === 'SequelizeDatabaseError') {
      return res.apiError('数据库查询失败，请稍后重试', 'DATABASE_ERROR', null, 500)
    }

    // Sequelize连接错误
    if (error.name === 'SequelizeConnectionError') {
      return res.apiError('数据库连接失败，请联系技术支持', 'CONNECTION_ERROR', null, 500)
    }

    // 其他未知错误
    return res.apiInternalError('获取预设统计失败')
  }
})

module.exports = router
