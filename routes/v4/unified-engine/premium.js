/**
 * 高级空间解锁API路由 - 实用主义极简版
 *
 * 📋 功能说明：
 * - 用户支付100积分解锁高级空间功能，有效期24小时
 * - 过期需重新手动解锁（无自动续费）
 * - 极简直观、降低复杂度、易于维护
 *
 * 🎯 双重条件AND关系（缺一不可）：
 * - 条件1: users.history_total_points ≥ 100000（历史累计10万积分门槛）
 * - 条件2: user_points_accounts.available_points ≥ 100（当前余额≥100积分）
 *
 * API端点：
 * - POST /api/v4/premium/unlock - 解锁高级空间
 * - GET /api/v4/premium/status - 查询解锁状态
 *
 * 创建时间：2025-11-02
 */

const express = require('express')
const router = express.Router()
const {
  User,
  UserPointsAccount,
  UserPremiumStatus,
  PointsTransaction,
  sequelize
} = require('../../../models')
const { authenticateToken } = require('../../../middleware/auth')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const logger = require('../../../utils/logger')
const NotificationService = require('../../../services/NotificationService')

/*
 * ========================================
 * 业务常量定义
 * ========================================
 */
const UNLOCK_COST = 100 // 解锁费用：100积分（固定值）
const HISTORY_POINTS_THRESHOLD = 100000 // 历史累计积分门槛：10万（识别高级用户资格）
const VALIDITY_HOURS = 24 // 有效期：24小时（固定值）

/**
 * ========================================
 * API #1: 解锁高级空间（极简版，手动解锁，无自动续费）
 * ========================================
 *
 * 📍 路由: POST /api/v4/premium/unlock
 * 🔐 认证: 需要JWT认证（authenticateToken中间件）
 *
 * 📊 业务逻辑（基于实际数据库结构，极简清晰）：
 * 步骤1: 检查当前解锁状态（如果有效期内，拒绝重复解锁，返回409冲突）
 * 步骤2: 关联查询用户信息和积分账户（User.findByPk + include UserPointsAccount）
 * 步骤3: 验证解锁条件1 - 历史积分门槛（users.history_total_points ≥ 100000）
 * 步骤4: 验证解锁条件2 - 当前余额充足（user_points_accounts.available_points ≥ 100）
 * 步骤5: 扣除积分（available_points - 100，total_consumed + 100，last_consume_time更新）
 * 步骤6: 记录积分交易（points_transactions表，business_type='premium_unlock'）
 * 步骤7: 创建/更新解锁记录（user_premium_status表，expires_at = unlock_time + 24小时）
 * 步骤8: 提交事务，返回解锁结果
 *
 * @returns {Object} 解锁结果
 * @returns {boolean} success - 是否成功
 * @returns {string} message - 返回消息
 * @returns {Object} data - 解锁结果数据
 */
router.post('/unlock', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction()

  try {
    const userId = req.user.user_id // 从JWT token中获取用户ID

    /*
     * ========================================
     * 步骤1: 检查当前解锁状态（防止重复解锁）
     * ========================================
     */
    let premiumStatus = await UserPremiumStatus.findOne({
      where: { user_id: userId },
      transaction // 使用事务确保数据一致性
    })

    const now = BeijingTimeHelper.createBeijingTime() // 获取当前北京时间
    const isFirstUnlock = !premiumStatus // 判断是否首次解锁（无记录=首次解锁）

    // 如果已解锁且在有效期内，拒绝重复解锁（返回409冲突）
    if (premiumStatus && premiumStatus.is_unlocked && premiumStatus.expires_at) {
      const expiresAt = new Date(premiumStatus.expires_at)
      const isValid = expiresAt > now // 检查是否在有效期内（过期时间>当前时间）

      if (isValid) {
        const remainingHours = Math.ceil((expiresAt - now) / (1000 * 60 * 60)) // 计算剩余小时数（向上取整）

        await transaction.rollback() // 回滚事务（无需执行任何操作）
        return res.apiError(
          '您的高级空间访问权限仍在有效期内，无需重复解锁',
          'ALREADY_UNLOCKED',
          {
            unlocked: true,
            is_valid: true,
            unlock_time: BeijingTimeHelper.toBeijingTime(premiumStatus.unlock_time),
            expires_at: BeijingTimeHelper.toBeijingTime(premiumStatus.expires_at),
            remaining_hours: remainingHours,
            remaining_minutes: Math.ceil((expiresAt - now) / (1000 * 60)), // 剩余分钟数
            total_unlock_count: premiumStatus.total_unlock_count || 0,
            note: `您的高级空间访问权限有效，剩余${remainingHours}小时，无需重复解锁`
          },
          409
        )
      }
    }

    /*
     * ========================================
     * 步骤2: 关联查询用户信息和积分账户（使用行锁防止并发问题）
     * ========================================
     * ⚠️ 关键：必须使用include关联查询user_points_accounts表获取available_points
     * ⚠️ 关键：使用行锁（LOCK.UPDATE）防止并发解锁时重复扣费
     */
    const user = await User.findByPk(userId, {
      include: [
        {
          model: UserPointsAccount,
          as: 'pointsAccount', // 使用User模型中定义的关联别名
          required: true // 内连接（INNER JOIN），确保用户必须有积分账户，无账户则查询失败
        }
      ],
      transaction, // 在事务中查询，确保数据一致性
      lock: transaction.LOCK.UPDATE // 行锁（FOR UPDATE），锁定用户记录，防止并发扣款导致余额不一致
    })

    // 验证用户是否存在
    if (!user) {
      await transaction.rollback()
      return res.apiError('用户不存在', 'USER_NOT_FOUND', null, 404)
    }

    // 验证用户是否有积分账户（理论上所有用户都应该有，注册时自动创建）
    if (!user.pointsAccount) {
      await transaction.rollback()
      return res.apiError(
        '用户积分账户不存在，请联系管理员初始化积分账户',
        'ACCOUNT_NOT_FOUND',
        null,
        404
      )
    }

    /*
     * ========================================
     * 步骤3: 验证解锁条件1 - 历史累计积分门槛（识别高级用户资格）
     * ========================================
     * 从users表获取history_total_points字段（INT类型，历史累计总积分）
     */
    const historyPoints = user.history_total_points || 0 // 获取历史积分，默认0
    const historyPointsSatisfied = historyPoints >= HISTORY_POINTS_THRESHOLD // 判断是否≥10万

    // 如果历史积分不足，返回403 Forbidden（权限不足）
    if (!historyPointsSatisfied) {
      await transaction.rollback()
      return res.apiError(
        '历史累计积分不足，无法解锁高级空间（需要10万历史积分门槛）',
        'INSUFFICIENT_HISTORY_POINTS',
        {
          unlocked: false,
          condition_1: {
            name: '历史累计积分门槛',
            description: '用于识别高级用户资格，只增不减',
            required: HISTORY_POINTS_THRESHOLD, // 需要10万
            current: historyPoints, // 当前历史积分
            satisfied: false, // 不满足条件
            shortage: HISTORY_POINTS_THRESHOLD - historyPoints, // 还差多少积分
            percentage: parseFloat(((historyPoints / HISTORY_POINTS_THRESHOLD) * 100).toFixed(1)) // 完成度百分比
          },
          tip: `您还需要累计获得 ${HISTORY_POINTS_THRESHOLD - historyPoints} 积分才能解锁高级空间（当前进度：${historyPoints}/${HISTORY_POINTS_THRESHOLD}）`
        },
        403
      )
    }

    /*
     * ========================================
     * 步骤4: 验证解锁条件2 - 当前积分余额充足（用于支付解锁费用）
     * ========================================
     * ⚠️ 关键：从user_points_accounts表获取available_points字段（DECIMAL(10,2)类型）
     * ⚠️ 关键：不是users.current_points字段（users表没有这个字段）
     */
    const availablePoints = parseFloat(user.pointsAccount.available_points) || 0 // 当前可用积分余额
    const balanceSufficient = availablePoints >= UNLOCK_COST // 判断余额是否≥100积分

    // 如果余额不足，返回403 Forbidden（余额不足）
    if (!balanceSufficient) {
      await transaction.rollback()
      return res.apiError(
        '当前积分余额不足，无法支付100积分解锁费用',
        'INSUFFICIENT_BALANCE',
        {
          unlocked: false,
          condition_1: {
            name: '历史累计积分门槛',
            required: HISTORY_POINTS_THRESHOLD,
            current: historyPoints,
            satisfied: true, // 条件1已满足
            percentage: 100 // 已达到100%
          },
          condition_2: {
            name: '当前积分余额',
            description: '用于支付解锁费用，可增可减',
            required: UNLOCK_COST, // 需要100积分
            current: availablePoints, // 当前余额
            satisfied: false, // 不满足条件
            shortage: UNLOCK_COST - availablePoints, // 还差多少积分
            percentage: parseFloat(((availablePoints / UNLOCK_COST) * 100).toFixed(1)) // 完成度百分比
          },
          tip: `您的积分余额不足，还需要 ${UNLOCK_COST - availablePoints} 积分才能解锁（当前余额：${availablePoints}/${UNLOCK_COST}）`
        },
        403
      )
    }

    /*
     * ========================================
     * 步骤5: 扣除100积分（同时更新available_points、total_consumed、last_consume_time）
     * ========================================
     * ⚠️ 关键：从user_points_accounts表扣除，不是users表（users表没有积分余额字段）
     * 扣除逻辑：available_points - 100，total_consumed + 100，last_consume_time更新为当前时间
     */
    const newAvailablePoints = availablePoints - UNLOCK_COST // 扣除后的可用积分余额
    const newTotalConsumed = parseFloat(user.pointsAccount.total_consumed) + UNLOCK_COST // 累计消耗积分+100

    await user.pointsAccount.update(
      {
        available_points: newAvailablePoints, // 更新可用积分余额（-100）
        total_consumed: newTotalConsumed, // 更新累计消耗积分（+100）
        last_consume_time: BeijingTimeHelper.createBeijingTime() // 更新最后消耗时间（北京时间）
      },
      { transaction }
    ) // 在事务中更新，确保原子性

    logger.info('高级空间解锁-积分扣除', {
      user_id: userId,
      unlock_cost: UNLOCK_COST,
      remaining_points: newAvailablePoints
    })

    /*
     * ========================================
     * 步骤6: 记录积分交易到points_transactions表（用于积分流水追踪和对账）
     * ========================================
     * ⚠️ 关键：需要关联account_id字段（user_points_accounts表的主键）
     * ⚠️ 关键：business_type='premium_unlock'枚举值已在数据库中添加
     */
    const unlockTime = BeijingTimeHelper.createBeijingTime() // 获取当前北京时间作为解锁时间

    await PointsTransaction.create(
      {
        user_id: userId, // 用户ID（关联users表）
        account_id: user.pointsAccount.account_id, // 积分账户ID（关联user_points_accounts表，必需字段）
        transaction_type: 'consume', // 交易类型：consume=消费（枚举值：earn、consume、expire、refund）
        points_amount: UNLOCK_COST, // 积分数量：100积分（统一存储正数，类型由transaction_type区分）
        points_balance_before: availablePoints, // 交易前余额（用于对账验证）
        points_balance_after: newAvailablePoints, // 交易后余额（用于对账验证）
        business_type: 'premium_unlock', // 业务类型：高级空间解锁
        source_type: 'user', // 积分来源类型：user=用户主动操作（枚举：system、user、admin、api、batch）
        transaction_title: '解锁高级空间', // 交易标题（用于用户积分明细显示）
        transaction_description: `支付${UNLOCK_COST}积分解锁高级空间功能，有效期${VALIDITY_HOURS}小时`, // 交易描述（详细说明）
        status: 'completed', // 交易状态：completed=已完成（枚举：pending、completed、failed、cancelled）
        transaction_time: unlockTime, // 交易时间（毫秒精度，DATE(3)类型，用于精确排序）
        created_at: unlockTime // 创建时间（与transaction_time一致）
      },
      { transaction }
    ) // 在事务中创建，确保原子性

    logger.info('高级空间解锁-积分交易记录', {
      user_id: userId,
      transaction_type: 'consume',
      points_amount: UNLOCK_COST,
      balance_after: newAvailablePoints
    })

    /*
     * ========================================
     * 步骤7: 创建/更新解锁记录到user_premium_status表（存储解锁状态和过期时间）
     * ========================================
     * 计算过期时间：unlock_time + 24小时（使用Date对象直接计算）
     */
    const expiresAt = new Date(unlockTime)
    expiresAt.setHours(expiresAt.getHours() + VALIDITY_HOURS) // 加24小时（setHours方法自动处理跨天）

    // 判断是首次解锁还是重新解锁（根据isFirstUnlock标志）
    if (isFirstUnlock) {
      // 首次解锁：创建新记录
      premiumStatus = await UserPremiumStatus.create(
        {
          user_id: userId, // 用户ID（唯一约束，一个用户只有一条记录）
          is_unlocked: true, // 解锁状态：TRUE=已解锁且有效
          unlock_time: unlockTime, // 解锁时间（每次解锁时更新）
          unlock_method: 'points', // 解锁方式：points=积分解锁（枚举：points/exchange/vip/manual）
          total_unlock_count: 1, // 累计解锁次数：首次解锁为1（每次解锁+1）
          expires_at: expiresAt // 过期时间：unlock_time + 24小时（用于判断是否过期）
        },
        { transaction }
      ) // 在事务中创建，确保原子性

      logger.info('高级空间首次解锁', {
        user_id: userId,
        unlock_method: 'points',
        expires_at: BeijingTimeHelper.toBeijingTime(expiresAt)
      })
    } else {
      // 重新解锁：更新现有记录
      await premiumStatus.update(
        {
          is_unlocked: true, // 更新解锁状态为TRUE
          unlock_time: unlockTime, // 更新解锁时间为当前时间
          expires_at: expiresAt, // 更新过期时间为当前时间+24小时
          total_unlock_count: (premiumStatus.total_unlock_count || 0) + 1 // 累计解锁次数+1
        },
        { transaction }
      ) // 在事务中更新，确保原子性

      logger.info('高级空间重新解锁', {
        user_id: userId,
        unlock_count: premiumStatus.total_unlock_count,
        expires_at: BeijingTimeHelper.toBeijingTime(expiresAt)
      })
    }

    /*
     * ========================================
     * 步骤8: 提交事务（确保所有操作原子性完成）
     * ========================================
     * 提交事务：积分扣除 + 交易记录 + 解锁状态同步生效
     */
    await transaction.commit()

    logger.info('高级空间解锁成功', {
      user_id: userId,
      is_first_unlock: isFirstUnlock,
      unlock_cost: UNLOCK_COST,
      remaining_points: newAvailablePoints,
      validity_hours: VALIDITY_HOURS,
      total_unlock_count: premiumStatus.total_unlock_count
    })

    /*
     * ========================================
     * 步骤9: 发送解锁成功通知（异步，不影响返回）
     * ========================================
     * 通过客服聊天系统发送通知给用户
     */
    setImmediate(async () => {
      try {
        await NotificationService.notifyPremiumUnlockSuccess(userId, {
          unlock_cost: UNLOCK_COST,
          remaining_points: newAvailablePoints,
          expires_at: BeijingTimeHelper.toBeijingTime(expiresAt),
          validity_hours: VALIDITY_HOURS,
          is_first_unlock: isFirstUnlock
        })
      } catch (notifyError) {
        logger.error('高级空间解锁通知发送失败', {
          user_id: userId,
          error: notifyError.message
        })
      }
    })

    /*
     * ========================================
     * 返回解锁成功结果（JSON格式）
     * ========================================
     */
    return res.apiSuccess(
      {
        unlocked: true, // 解锁状态：固定TRUE
        is_first_unlock: isFirstUnlock, // 是否首次解锁：true=首次解锁，false=重新解锁
        unlock_cost: UNLOCK_COST, // 本次解锁费用：固定100积分
        remaining_points: newAvailablePoints, // 剩余积分：扣费后的user_points_accounts.available_points
        unlock_time: BeijingTimeHelper.toBeijingTime(unlockTime), // 本次解锁时间（北京时间格式：YYYY-MM-DD HH:mm:ss）
        expires_at: BeijingTimeHelper.toBeijingTime(expiresAt), // 过期时间（24小时后，北京时间格式：YYYY-MM-DD HH:mm:ss）
        validity_hours: VALIDITY_HOURS, // 有效期时长：固定24小时
        total_unlock_count: premiumStatus.total_unlock_count, // 累计解锁次数（包括本次解锁）
        note: `恭喜！您已成功解锁高级空间功能（${isFirstUnlock ? '首次' : '重新'}解锁，支付${UNLOCK_COST}积分，剩余${newAvailablePoints}积分，有效期${VALIDITY_HOURS}小时）`
      },
      '高级空间解锁成功'
    )
  } catch (error) {
    /*
     * ========================================
     * 错误处理：回滚事务，返回500错误
     * ========================================
     */
    await transaction.rollback() // 回滚事务，撤销所有操作
    logger.error('高级空间解锁失败', {
      user_id: req.user.user_id,
      error: error.message,
      stack: error.stack
    })

    return res.apiError('解锁失败，请稍后重试', 'UNLOCK_FAILED', { error: error.message }, 500)
  }
})

/**
 * ========================================
 * API #2: 查询高级空间状态（极简版，纯查询，无自动续费）
 * ========================================
 *
 * 📍 路由: GET /api/v4/premium/status
 * 🔐 认证: 需要JWT认证（authenticateToken中间件）
 *
 * 📊 业务逻辑（纯查询，无扣费操作）：
 * 步骤1: 查询用户的高级空间解锁状态（user_premium_status表）
 * 步骤2: 判断是否过期（expires_at > NOW()）
 * 步骤3: 关联查询用户信息和积分账户（获取历史积分和当前余额）
 * 步骤4: 计算解锁条件进度（条件1：历史积分进度，条件2：余额充足情况）
 * 步骤5: 返回解锁状态和条件进度（含剩余时间、是否可解锁等信息）
 *
 * @returns {Object} 状态查询结果
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id

    // 查询解锁状态
    const premiumStatus = await UserPremiumStatus.findOne({
      where: { user_id: userId }
    })

    const now = BeijingTimeHelper.createBeijingTime()

    // 检查是否已解锁且在有效期内
    const isUnlocked = premiumStatus && premiumStatus.is_unlocked
    const isValid =
      isUnlocked && premiumStatus.expires_at && new Date(premiumStatus.expires_at) > now
    const isExpired = isUnlocked && !isValid // 已解锁但过期

    // 查询用户信息（包含积分账户）- ⚠️ 关键：必须关联查询获取available_points
    const user = await User.findByPk(userId, {
      include: [
        {
          model: UserPointsAccount,
          as: 'pointsAccount',
          required: false // 左连接，允许没有积分账户
        }
      ]
    })

    if (!user) {
      return res.apiError('用户不存在', 404)
    }

    // 获取历史积分和当前余额
    const historyPoints = user.history_total_points || 0
    const availablePoints = user.pointsAccount ? parseFloat(user.pointsAccount.available_points) : 0

    // 如果未解锁或已过期，返回解锁条件进度
    if (!isValid) {
      return res.apiSuccess(
        {
          unlocked: false,
          is_expired: isExpired, // 是否已过期
          last_unlock_time: isUnlocked
            ? BeijingTimeHelper.toBeijingTime(premiumStatus.unlock_time)
            : null,
          last_expires_at:
            isUnlocked && premiumStatus.expires_at
              ? BeijingTimeHelper.toBeijingTime(premiumStatus.expires_at)
              : null,
          conditions: {
            condition_1: {
              name: '历史累计积分',
              required: HISTORY_POINTS_THRESHOLD,
              current: historyPoints,
              satisfied: historyPoints >= HISTORY_POINTS_THRESHOLD,
              percentage: Math.min(
                100,
                parseFloat(((historyPoints / HISTORY_POINTS_THRESHOLD) * 100).toFixed(1))
              ),
              shortage: Math.max(0, HISTORY_POINTS_THRESHOLD - historyPoints)
            },
            condition_2: {
              name: '当前积分余额',
              required: UNLOCK_COST,
              current: availablePoints,
              satisfied: availablePoints >= UNLOCK_COST,
              percentage: Math.min(
                100,
                parseFloat(((availablePoints / UNLOCK_COST) * 100).toFixed(1))
              ),
              shortage: Math.max(0, UNLOCK_COST - availablePoints)
            }
          },
          can_unlock: historyPoints >= HISTORY_POINTS_THRESHOLD && availablePoints >= UNLOCK_COST,
          unlock_cost: UNLOCK_COST,
          validity_hours: VALIDITY_HOURS,
          tip: isExpired
            ? `您的高级空间访问权限已过期，需要重新支付${UNLOCK_COST}积分解锁（有效期${VALIDITY_HOURS}小时）`
            : `解锁高级空间需要同时满足2个条件：1.历史累计积分≥${HISTORY_POINTS_THRESHOLD} 2.支付${UNLOCK_COST}积分（有效期${VALIDITY_HOURS}小时）`
        },
        isExpired ? '高级空间已过期' : '高级空间未解锁'
      )
    }

    // 已解锁且在有效期内，返回解锁信息
    const expiresAt = new Date(premiumStatus.expires_at)
    const remainingMs = expiresAt - now
    const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60))
    const remainingMinutes = Math.ceil(remainingMs / (1000 * 60))

    return res.apiSuccess(
      {
        unlocked: true,
        is_valid: true,
        unlock_time: BeijingTimeHelper.toBeijingTime(premiumStatus.unlock_time),
        unlock_method: premiumStatus.unlock_method,
        unlock_cost: UNLOCK_COST,
        expires_at: BeijingTimeHelper.toBeijingTime(premiumStatus.expires_at),
        remaining_hours: remainingHours,
        remaining_minutes: remainingMinutes,
        validity_hours: VALIDITY_HOURS,
        total_unlock_count: premiumStatus.total_unlock_count || 1,
        note: `您的高级空间访问权限有效，剩余${remainingHours}小时（${remainingMinutes}分钟）`
      },
      '高级空间访问中'
    )
  } catch (error) {
    logger.error('查询高级空间状态失败', {
      user_id: req.user.user_id,
      error: error.message
    })
    return res.apiError('查询失败', 'QUERY_FAILED', { error: error.message }, 500)
  }
})

module.exports = router
