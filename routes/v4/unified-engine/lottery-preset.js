/**
 * 抽奖预设管理路由
 * 为管理员提供用户抽奖结果预设功能
 * 实现运营干预：为特定用户预设抽奖结果，用户无感知
 * 创建时间：2025年01月21日
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const models = require('../../../models')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * 为用户创建抽奖预设队列
 * POST /api/v4/lottery-preset/create
 */
router.post('/create', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { user_id, presets } = req.body

    // ===== 第1步：基础参数验证 =====
    if (!user_id || !presets || !Array.isArray(presets) || presets.length === 0) {
      return res.apiError('参数错误：需要user_id和presets数组', 'INVALID_PARAMETERS', null, null)
    }

    /*
     * ===== 第2步：最大数量限制验证（风险2修复）=====
     * 业务规则：单次最多创建20条预设（基于实际业务：VIP用户最多10条）
     * ROI评分：⭐⭐⭐⭐⭐（成本极低，防护价值高）
     */
    const MAX_PRESETS_PER_BATCH = 20
    if (presets.length > MAX_PRESETS_PER_BATCH) {
      return res.apiError(
        `单次最多创建${MAX_PRESETS_PER_BATCH}条预设，当前：${presets.length}条`,
        'TOO_MANY_PRESETS',
        null,
        null
      )
    }

    /*
     * ===== 第3步：queue_order唯一性验证（风险1修复）=====
     * 业务规则：同一批次中，queue_order不能重复
     * ROI评分：⭐⭐⭐⭐⭐（成本极低，收益极高）
     */
    const queueOrders = presets.map(p => p.queue_order)
    const uniqueOrders = new Set(queueOrders)
    if (queueOrders.length !== uniqueOrders.size) {
      return res.apiError(
        '预设数据错误：同一批次中queue_order不能重复',
        'DUPLICATE_QUEUE_ORDER',
        null,
        null
      )
    }

    // ===== 第4步：验证目标用户存在 =====
    const targetUser = await models.User.findByPk(user_id)
    if (!targetUser) {
      return res.apiError('目标用户不存在', 'USER_NOT_FOUND', null, null)
    }

    // ===== 第5步：验证预设数据格式和奖品存在性 =====
    for (const preset of presets) {
      // 验证必需字段存在性（使用更精确的判断，避免0被误判为缺失）
      if (!preset.prize_id || preset.queue_order === undefined || preset.queue_order === null) {
        return res.apiError(
          '预设数据格式错误：需要prize_id和queue_order',
          'INVALID_PRESET_DATA',
          null,
          null
        )
      }

      // 验证queue_order为正整数（在验证存在性之后，避免0被误判）
      if (!Number.isInteger(preset.queue_order) || preset.queue_order < 1) {
        return res.apiError(
          `队列顺序必须为正整数，当前：${preset.queue_order}`,
          'INVALID_QUEUE_ORDER',
          null,
          null
        )
      }

      // 验证奖品存在
      const prize = await models.LotteryPrize.findByPk(preset.prize_id)
      if (!prize) {
        return res.apiError(`奖品ID ${preset.prize_id} 不存在`, 'PRIZE_NOT_FOUND', null, null)
      }
    }

    // 创建预设队列
    const createdPresets = await models.LotteryPreset.createPresetQueue(
      user_id,
      presets,
      adminId
    )

    console.log('🎯 管理员创建抽奖预设成功', {
      adminId,
      targetUserId: user_id,
      presetsCount: createdPresets.length,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 返回创建结果 - 参数顺序：data第1个, message第2个
    return res.apiSuccess({
      user_id,
      presets_count: createdPresets.length,
      created_presets: createdPresets.map(preset => ({
        preset_id: preset.preset_id,
        prize_id: preset.prize_id,
        queue_order: preset.queue_order,
        status: preset.status
      }))
    }, '抽奖预设创建成功')
  } catch (error) {
    // 🎯 细化错误处理：区分Sequelize错误类型
    console.error('❌ 创建抽奖预设失败:', error.message, error.stack)

    // Sequelize数据库错误
    if (error.name === 'SequelizeDatabaseError') {
      return res.apiError('数据库操作失败，请稍后重试', 'DATABASE_ERROR', null, null)
    }

    // Sequelize外键约束错误
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.apiError('数据关联错误，请检查用户ID或奖品ID是否有效', 'FOREIGN_KEY_ERROR', null, null)
    }

    // Sequelize唯一约束错误
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.apiError('预设队列顺序重复，同一用户的queue_order不能重复', 'DUPLICATE_QUEUE_ORDER', null, null)
    }

    // 其他未知错误
    return res.apiInternalError('创建抽奖预设失败')
  }
})

/**
 * 查看用户的抽奖预设列表
 * GET /api/v4/lottery-preset/user/:user_id
 *
 * @description 查看指定用户的抽奖预设队列，包含完整的预设信息和统计数据
 * @route GET /api/v4/lottery-preset/user/:user_id
 * @access Private（需要JWT认证 + 管理员权限）
 *
 * 业务场景：
 * - 运营审计：查看为用户创建的预设配置，核对预设奖品是否正确
 * - 用户支持：用户投诉时，客服查询用户预设状态，确认是否有运营干预
 * - 预设监控：管理员监控预设使用情况，判断用户是否已使用完所有预设
 * - 策略调整：运营人员查看用户预设队列，决定是否需要补充或清理预设
 *
 * 参数说明：
 * @param {number} user_id - 路径参数，目标用户ID（必填）
 * @query {string} status - 查询参数，状态筛选（可选：pending/used/all，默认all）
 *
 * 返回数据：
 * @returns {Object} data.user - 目标用户信息（user_id、mobile、nickname）
 * @returns {Object} data.stats - 预设统计信息（total、pending、used）
 * @returns {Array} data.presets - 预设列表数组（按queue_order升序排序）
 */
router.get('/user/:user_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id

    // 🎯 参数验证：user_id类型验证（防止SQL注入和无效值）
    const user_id = parseInt(req.params.user_id)
    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('无效的用户ID，必须是正整数', 'INVALID_USER_ID', null, null)
    }

    // 🎯 参数验证：status白名单验证（防止无效状态值）
    const { status = 'all' } = req.query
    const allowedStatus = ['pending', 'used', 'all']
    if (!allowedStatus.includes(status)) {
      return res.apiError(`无效的状态参数，允许值：${allowedStatus.join('/')}`, 'INVALID_STATUS', null, null)
    }

    // 验证目标用户存在
    const targetUser = await models.User.findByPk(user_id)
    if (!targetUser) {
      return res.apiError('目标用户不存在', 'USER_NOT_FOUND', null, null)
    }

    // 构建查询条件
    const whereCondition = { user_id }
    if (status !== 'all') {
      whereCondition.status = status
    }

    // 查询用户的预设
    const presets = await models.LotteryPreset.findAll({
      where: whereCondition,
      include: [
        {
          model: models.LotteryPrize,
          as: 'prize',
          attributes: ['prize_id', 'prize_name', 'prize_type', 'prize_value', 'prize_description']
        },
        {
          model: models.User,
          as: 'admin',
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ],
      order: [['queue_order', 'ASC']]
    })

    // 获取统计信息
    const stats = await models.LotteryPreset.getUserPresetStats(user_id)

    console.log('🔍 管理员查看用户预设', {
      adminId,
      targetUserId: user_id,
      status,
      presetsCount: presets.length,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 返回用户预设数据 - 参数顺序：data第1个, message第2个
    return res.apiSuccess({
      user: {
        user_id: targetUser.user_id,
        mobile: targetUser.mobile,
        nickname: targetUser.nickname
      },
      stats,
      presets: presets.map(preset => ({
        preset_id: preset.preset_id,
        prize_id: preset.prize_id,
        queue_order: preset.queue_order,
        status: preset.status,
        created_at: preset.created_at,
        prize: preset.prize,
        admin: preset.admin
      }))
    }, '获取用户预设成功')
  } catch (error) {
    // 🎯 细化错误处理：区分Sequelize错误类型
    console.error('❌ 查看用户预设失败:', error.message, error.stack)

    // Sequelize数据库错误
    if (error.name === 'SequelizeDatabaseError') {
      return res.apiError('数据库查询失败，请稍后重试', 'DATABASE_ERROR', null, null)
    }

    // Sequelize连接错误
    if (error.name === 'SequelizeConnectionError') {
      return res.apiError('数据库连接失败，请联系技术支持', 'CONNECTION_ERROR', null, null)
    }

    // Sequelize超时错误
    if (error.name === 'SequelizeTimeoutError') {
      return res.apiError('数据库查询超时，请重试', 'QUERY_TIMEOUT', null, null)
    }

    // 其他未知错误
    return res.apiInternalError('查看用户预设失败')
  }
})

/**
 * 清理用户的所有预设
 * DELETE /api/v4/lottery-preset/user/:user_id
 *
 * @description 删除指定用户的所有预设记录（包括pending和used状态）
 * @route DELETE /api/v4/lottery-preset/user/:user_id
 * @access Private（需要JWT认证 + 管理员权限）
 *
 * 业务场景：
 * - 运营调整：重新规划用户的预设策略前，先清除旧预设
 * - 用户投诉：删除错误的预设配置
 * - 活动结束：清理活动期间的预设记录
 *
 * 参数说明：
 * @param {number} user_id - 路径参数，目标用户ID（必填）
 */
router.delete('/user/:user_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id

    // 🎯 参数验证：user_id类型验证
    const user_id = parseInt(req.params.user_id)
    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('无效的用户ID，必须是正整数', 'INVALID_USER_ID', null, null)
    }

    // 验证目标用户存在
    const targetUser = await models.User.findByPk(user_id)
    if (!targetUser) {
      return res.apiError('目标用户不存在', 'USER_NOT_FOUND', null, null)
    }

    // 清理用户的所有预设
    const deletedCount = await models.LotteryPreset.clearUserPresets(user_id)

    console.log('🗑️ 管理员清理用户预设', {
      adminId,
      targetUserId: user_id,
      deletedCount,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 返回清理结果 - 参数顺序：data第1个, message第2个
    return res.apiSuccess({
      user_id,
      deleted_count: deletedCount
    }, `成功清理${deletedCount}条预设记录`)
  } catch (error) {
    // 🎯 细化错误处理：区分Sequelize错误类型
    console.error('❌ 清理用户预设失败:', error.message, error.stack)

    // Sequelize数据库错误
    if (error.name === 'SequelizeDatabaseError') {
      return res.apiError('数据库删除失败，请稍后重试', 'DATABASE_ERROR', null, null)
    }

    // Sequelize连接错误
    if (error.name === 'SequelizeConnectionError') {
      return res.apiError('数据库连接失败，请联系技术支持', 'CONNECTION_ERROR', null, null)
    }

    // 其他未知错误
    return res.apiInternalError('清理用户预设失败')
  }
})

/**
 * 获取所有预设列表（管理员视角）
 * GET /api/v4/lottery-preset/list
 *
 * @description 获取所有用户的预设列表，支持筛选和分页（管理员查看所有预设记录）
 * @route GET /api/v4/lottery-preset/list
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
router.get('/list', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id

    // 🎯 参数验证和默认值设置
    const {
      status = 'all',
      user_id,
      page = 1,
      page_size = 20,
      order_by = 'created_at',
      order_dir = 'DESC'
    } = req.query

    // 验证status参数
    const allowedStatus = ['pending', 'used', 'all']
    if (!allowedStatus.includes(status)) {
      return res.apiError(`无效的状态参数，允许值：${allowedStatus.join('/')}`, 'INVALID_STATUS', null, null)
    }

    // 验证排序字段
    const allowedOrderBy = ['created_at', 'queue_order']
    if (!allowedOrderBy.includes(order_by)) {
      return res.apiError(`无效的排序字段，允许值：${allowedOrderBy.join('/')}`, 'INVALID_ORDER_BY', null, null)
    }

    // 验证排序方向
    const allowedOrderDir = ['ASC', 'DESC']
    if (!allowedOrderDir.includes(order_dir.toUpperCase())) {
      return res.apiError(`无效的排序方向，允许值：${allowedOrderDir.join('/')}`, 'INVALID_ORDER_DIR', null, null)
    }

    // 验证分页参数
    const pageNum = parseInt(page)
    const pageSizeNum = parseInt(page_size)
    if (isNaN(pageNum) || pageNum < 1) {
      return res.apiError('页码必须是大于0的整数', 'INVALID_PAGE', null, null)
    }
    if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 100) {
      return res.apiError('每页数量必须在1-100之间', 'INVALID_PAGE_SIZE', null, null)
    }

    // 构建查询条件
    const whereCondition = {}
    if (status !== 'all') {
      whereCondition.status = status
    }
    if (user_id) {
      const userId = parseInt(user_id)
      if (isNaN(userId) || userId <= 0) {
        return res.apiError('无效的用户ID，必须是正整数', 'INVALID_USER_ID', null, null)
      }
      whereCondition.user_id = userId
    }

    // 计算分页偏移量
    const offset = (pageNum - 1) * pageSizeNum

    // 🎯 并行查询：获取数据和总数（性能优化）
    const [presets, totalCount] = await Promise.all([
      models.LotteryPreset.findAll({
        where: whereCondition,
        include: [
          {
            model: models.User,
            as: 'targetUser',
            attributes: ['user_id', 'mobile', 'nickname']
          },
          {
            model: models.LotteryPrize,
            as: 'prize',
            attributes: ['prize_id', 'prize_name', 'prize_type', 'prize_value', 'prize_description']
          },
          {
            model: models.User,
            as: 'admin',
            attributes: ['user_id', 'mobile', 'nickname']
          }
        ],
        order: [[order_by, order_dir.toUpperCase()]],
        limit: pageSizeNum,
        offset
      }),
      models.LotteryPreset.count({ where: whereCondition })
    ])

    // 计算总页数
    const totalPages = Math.ceil(totalCount / pageSizeNum)

    console.log('📋 管理员查看预设列表', {
      adminId,
      status,
      user_id: user_id || 'all',
      page: pageNum,
      page_size: pageSizeNum,
      totalCount,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 返回预设列表 - 参数顺序：data第1个, message第2个
    return res.apiSuccess({
      list: presets.map(preset => ({
        preset_id: preset.preset_id,
        user_id: preset.user_id,
        prize_id: preset.prize_id,
        queue_order: preset.queue_order,
        status: preset.status,
        created_at: preset.created_at,
        target_user: preset.targetUser,
        prize: preset.prize,
        admin: preset.admin
      })),
      pagination: {
        total: totalCount,
        page: pageNum,
        page_size: pageSizeNum,
        total_pages: totalPages
      },
      filters: {
        status,
        user_id: user_id || null
      }
    }, '获取预设列表成功')
  } catch (error) {
    // 🎯 细化错误处理：区分Sequelize错误类型
    console.error('❌ 获取预设列表失败:', error.message, error.stack)

    // Sequelize数据库错误
    if (error.name === 'SequelizeDatabaseError') {
      return res.apiError('数据库查询失败，请稍后重试', 'DATABASE_ERROR', null, null)
    }

    // Sequelize连接错误
    if (error.name === 'SequelizeConnectionError') {
      return res.apiError('数据库连接失败，请联系技术支持', 'CONNECTION_ERROR', null, null)
    }

    // Sequelize超时错误
    if (error.name === 'SequelizeTimeoutError') {
      return res.apiError('数据库查询超时，请重试', 'QUERY_TIMEOUT', null, null)
    }

    // 其他未知错误
    return res.apiInternalError('获取预设列表失败')
  }
})

/**
 * 获取预设统计信息
 * GET /api/v4/lottery-preset/stats
 *
 * @description 获取系统级预设统计数据（管理员监控运营效果）
 * @route GET /api/v4/lottery-preset/stats
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
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id

    // 🎯 性能优化：并行执行所有统计查询
    const [totalPresets, pendingPresets, usedPresets, totalUsers] = await Promise.all([
      models.LotteryPreset.count(),
      models.LotteryPreset.count({ where: { status: 'pending' } }),
      models.LotteryPreset.count({ where: { status: 'used' } }),
      models.LotteryPreset.count({
        distinct: true,
        col: 'user_id'
      })
    ])

    // 获取奖品类型分布
    const prizeTypeStats = await models.LotteryPreset.findAll({
      attributes: [
        [models.sequelize.col('prize.prize_type'), 'prize_type'],
        [models.sequelize.fn('COUNT', models.sequelize.col('LotteryPreset.preset_id')), 'count']
      ],
      include: [
        {
          model: models.LotteryPrize,
          as: 'prize',
          attributes: []
        }
      ],
      group: ['prize.prize_type']
    })

    console.log('📊 管理员查看预设统计', {
      adminId,
      totalPresets,
      pendingPresets,
      usedPresets,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 返回统计数据 - 参数顺序：data第1个, message第2个
    return res.apiSuccess({
      total_presets: totalPresets,
      pending_presets: pendingPresets,
      used_presets: usedPresets,
      total_users_with_presets: totalUsers,
      usage_rate: totalPresets > 0 ? ((usedPresets / totalPresets) * 100).toFixed(2) : '0.00',
      prize_type_distribution: prizeTypeStats.map(stat => ({
        prize_type: stat.getDataValue('prize_type'),
        count: parseInt(stat.getDataValue('count'))
      }))
    }, '获取预设统计成功')
  } catch (error) {
    // 🎯 细化错误处理：区分Sequelize错误类型
    console.error('❌ 获取预设统计失败:', error.message, error.stack)

    // Sequelize数据库错误
    if (error.name === 'SequelizeDatabaseError') {
      return res.apiError('数据库查询失败，请稍后重试', 'DATABASE_ERROR', null, null)
    }

    // Sequelize连接错误
    if (error.name === 'SequelizeConnectionError') {
      return res.apiError('数据库连接失败，请联系技术支持', 'CONNECTION_ERROR', null, null)
    }

    // 其他未知错误
    return res.apiInternalError('获取预设统计失败')
  }
})

module.exports = router
