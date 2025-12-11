/**
 * 餐厅积分抽奖系统 V4.0 - 抽奖预设管理服务（LotteryPresetService）
 *
 * @description 为管理员提供用户抽奖结果预设功能，实现运营干预
 *
 * 业务场景：
 * - 运营人员为特定用户预设抽奖结果
 * - 用户抽奖时优先使用预设结果，用户无感知
 * - 支持预设队列的创建、查询、清理、统计
 *
 * 核心功能：
 * 1. 创建预设队列 - createPresets()
 * 2. 查询用户预设 - getUserPresets()
 * 3. 清理用户预设 - clearUserPresets()
 * 4. 分页查询预设列表 - listPresetsWithPagination()
 * 5. 获取预设统计数据 - getPresetStats()
 *
 * 设计原则：
 * - **Service层职责**：封装所有预设相关的业务逻辑和数据库操作
 * - **事务管理**：所有写操作在事务中执行，确保数据一致性
 * - **参数验证**：Service层进行业务参数验证
 * - **错误处理**：抛出明确的业务错误，由路由层统一处理
 *
 * 数据模型关联：
 * - LotteryPreset：抽奖预设表（存储预设配置）
 * - LotteryPrize：奖品表（验证奖品存在）
 * - User：用户表（验证用户存在）
 *
 * 创建时间：2025年12月10日
 * 使用模型：Claude Sonnet 4.5
 */

const models = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 抽奖预设管理服务类
 *
 * @class LotteryPresetService
 */
class LotteryPresetService {
  /**
   * 为用户创建抽奖预设队列
   *
   * @description 管理员为特定用户创建预设的抽奖结果队列
   *
   * 业务规则：
   * - 单次最多创建20条预设
   * - queue_order必须唯一且为正整数
   * - prize_id必须存在且有效
   * - user_id必须存在且有效
   * - 使用事务保证原子性
   *
   * @param {number} adminId - 管理员用户ID
   * @param {number} userId - 目标用户ID
   * @param {Array} presets - 预设数组 [{prize_id, queue_order}, ...]
   * @returns {Promise<Array>} 创建的预设列表
   * @throws {Error} 参数错误、用户不存在、奖品不存在等
   */
  static async createPresets (adminId, userId, presets) {
    // ===== 第1步：基础参数验证 =====
    if (!adminId || !userId || !presets || !Array.isArray(presets) || presets.length === 0) {
      const error = new Error('参数错误：需要adminId、userId和presets数组')
      error.code = 'INVALID_PARAMETERS'
      throw error
    }

    // ===== 第2步：最大数量限制验证 =====
    const MAX_PRESETS_PER_BATCH = 20
    if (presets.length > MAX_PRESETS_PER_BATCH) {
      const error = new Error(`单次最多创建${MAX_PRESETS_PER_BATCH}条预设，当前：${presets.length}条`)
      error.code = 'TOO_MANY_PRESETS'
      throw error
    }

    // ===== 第3步：queue_order唯一性验证 =====
    const queueOrders = presets.map(p => p.queue_order)
    const uniqueOrders = new Set(queueOrders)
    if (queueOrders.length !== uniqueOrders.size) {
      const error = new Error('预设数据错误：同一批次中queue_order不能重复')
      error.code = 'DUPLICATE_QUEUE_ORDER'
      throw error
    }

    // ===== 第4步：验证目标用户存在 =====
    const targetUser = await models.User.findByPk(userId)
    if (!targetUser) {
      const error = new Error('目标用户不存在')
      error.code = 'USER_NOT_FOUND'
      throw error
    }

    // ===== 第5步：验证预设数据格式和奖品存在性 =====
    // eslint-disable-next-line no-await-in-loop
    for (const preset of presets) {
      // 验证必需字段存在性
      if (!preset.prize_id || preset.queue_order === undefined || preset.queue_order === null) {
        const error = new Error('预设数据格式错误：需要prize_id和queue_order')
        error.code = 'INVALID_PRESET_DATA'
        throw error
      }

      // 验证queue_order为正整数
      if (!Number.isInteger(preset.queue_order) || preset.queue_order < 1) {
        const error = new Error(`队列顺序必须为正整数，当前：${preset.queue_order}`)
        error.code = 'INVALID_QUEUE_ORDER'
        throw error
      }

      // 验证奖品存在
      // eslint-disable-next-line no-await-in-loop
      const prize = await models.LotteryPrize.findByPk(preset.prize_id)
      if (!prize) {
        const error = new Error(`奖品ID ${preset.prize_id} 不存在`)
        error.code = 'PRIZE_NOT_FOUND'
        throw error
      }
    }

    // ===== 第6步：创建预设队列 =====
    const createdPresets = await models.LotteryPreset.createPresetQueue(
      userId,
      presets,
      adminId
    )

    console.log('🎯 管理员创建抽奖预设成功', {
      adminId,
      targetUserId: userId,
      presetsCount: createdPresets.length,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    return createdPresets
  }

  /**
   * 查询用户的抽奖预设列表
   *
   * @description 获取指定用户的抽奖预设队列，支持状态筛选
   *
   * @param {number} adminId - 管理员用户ID
   * @param {number} userId - 目标用户ID
   * @param {string} status - 状态筛选（pending/used/all）
   * @returns {Promise<Object>} 包含用户信息、预设列表、统计数据的对象
   * @throws {Error} 用户不存在、无效状态参数等
   */
  static async getUserPresets (adminId, userId, status = 'all') {
    // 🎯 参数验证：userId类型验证
    if (isNaN(userId) || userId <= 0) {
      const error = new Error('无效的用户ID，必须是正整数')
      error.code = 'INVALID_USER_ID'
      throw error
    }

    // 🎯 参数验证：status白名单验证
    const allowedStatus = ['pending', 'used', 'all']
    if (!allowedStatus.includes(status)) {
      const error = new Error(`无效的状态参数，允许值：${allowedStatus.join('/')}`)
      error.code = 'INVALID_STATUS'
      throw error
    }

    // 验证目标用户存在
    const targetUser = await models.User.findByPk(userId)
    if (!targetUser) {
      const error = new Error('目标用户不存在')
      error.code = 'USER_NOT_FOUND'
      throw error
    }

    // 构建查询条件
    const whereCondition = { user_id: userId }
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
    const stats = await models.LotteryPreset.getUserPresetStats(userId)

    console.log('🔍 管理员查看用户预设', {
      adminId,
      targetUserId: userId,
      status,
      presetsCount: presets.length,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    return {
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
    }
  }

  /**
   * 清理用户的所有预设
   *
   * @description 删除指定用户的所有预设记录（包括pending和used状态）
   *
   * @param {number} adminId - 管理员用户ID
   * @param {number} userId - 目标用户ID
   * @returns {Promise<Object>} 包含user_id和deleted_count的对象
   * @throws {Error} 用户不存在等
   */
  static async clearUserPresets (adminId, userId) {
    // 🎯 参数验证：userId类型验证
    if (isNaN(userId) || userId <= 0) {
      const error = new Error('无效的用户ID，必须是正整数')
      error.code = 'INVALID_USER_ID'
      throw error
    }

    // 验证目标用户存在
    const targetUser = await models.User.findByPk(userId)
    if (!targetUser) {
      const error = new Error('目标用户不存在')
      error.code = 'USER_NOT_FOUND'
      throw error
    }

    // 清理用户的所有预设
    const deletedCount = await models.LotteryPreset.clearUserPresets(userId)

    console.log('🗑️ 管理员清理用户预设', {
      adminId,
      targetUserId: userId,
      deletedCount,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    return {
      user_id: userId,
      deleted_count: deletedCount
    }
  }

  /**
   * 获取所有预设列表（管理员视角，支持分页和筛选）
   *
   * @description 获取所有用户的预设列表，支持筛选和分页
   *
   * @param {Object} filters - 筛选条件
   * @param {string} filters.status - 状态筛选（pending/used/all）
   * @param {number} filters.user_id - 用户ID筛选（可选）
   * @param {number} filters.page - 页码（默认1）
   * @param {number} filters.page_size - 每页数量（默认20，最大100）
   * @param {string} filters.order_by - 排序字段（默认created_at）
   * @param {string} filters.order_dir - 排序方向（默认DESC）
   * @returns {Promise<Object>} 包含list、pagination、filters的对象
   * @throws {Error} 参数验证失败等
   */
  static async listPresetsWithPagination (filters = {}) {
    const {
      status = 'all',
      user_id,
      page = 1,
      page_size = 20,
      order_by = 'created_at',
      order_dir = 'DESC'
    } = filters

    // 验证status参数
    const allowedStatus = ['pending', 'used', 'all']
    if (!allowedStatus.includes(status)) {
      const error = new Error(`无效的状态参数，允许值：${allowedStatus.join('/')}`)
      error.code = 'INVALID_STATUS'
      throw error
    }

    // 验证排序字段
    const allowedOrderBy = ['created_at', 'queue_order']
    if (!allowedOrderBy.includes(order_by)) {
      const error = new Error(`无效的排序字段，允许值：${allowedOrderBy.join('/')}`)
      error.code = 'INVALID_ORDER_BY'
      throw error
    }

    // 验证排序方向
    const allowedOrderDir = ['ASC', 'DESC']
    if (!allowedOrderDir.includes(order_dir.toUpperCase())) {
      const error = new Error(`无效的排序方向，允许值：${allowedOrderDir.join('/')}`)
      error.code = 'INVALID_ORDER_DIR'
      throw error
    }

    // 验证分页参数
    const pageNum = parseInt(page)
    const pageSizeNum = parseInt(page_size)
    if (isNaN(pageNum) || pageNum < 1) {
      const error = new Error('页码必须是大于0的整数')
      error.code = 'INVALID_PAGE'
      throw error
    }
    if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 100) {
      const error = new Error('每页数量必须在1-100之间')
      error.code = 'INVALID_PAGE_SIZE'
      throw error
    }

    // 构建查询条件
    const whereCondition = {}
    if (status !== 'all') {
      whereCondition.status = status
    }
    if (user_id) {
      const userId = parseInt(user_id)
      if (isNaN(userId) || userId <= 0) {
        const error = new Error('无效的用户ID，必须是正整数')
        error.code = 'INVALID_USER_ID'
        throw error
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

    return {
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
    }
  }

  /**
   * 获取预设统计信息
   *
   * @description 获取系统级预设统计数据（管理员监控运营效果）
   *
   * @returns {Promise<Object>} 包含各种统计数据的对象
   */
  static async getPresetStats () {
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

    return {
      total_presets: totalPresets,
      pending_presets: pendingPresets,
      used_presets: usedPresets,
      total_users_with_presets: totalUsers,
      usage_rate: totalPresets > 0 ? ((usedPresets / totalPresets) * 100).toFixed(2) : '0.00',
      prize_type_distribution: prizeTypeStats.map(stat => ({
        prize_type: stat.getDataValue('prize_type'),
        count: parseInt(stat.getDataValue('count'))
      }))
    }
  }
}

module.exports = LotteryPresetService
