/**
 * 用户每日抽奖配额模型（LotteryUserDailyDrawQuota）
 *
 * 业务场景：
 * - 实现抽奖次数的强一致扣减，解决并发窗口期问题
 * - 支持连抽场景的原子性扣减（10连抽一次扣减10次）
 * - 支持客服临时加次数（bonus_draw_count）
 *
 * 核心功能：
 * - 原子扣减：使用 UPDATE ... WHERE 条件扣减，避免并发超限
 * - 配额初始化：首次抽奖时自动生成当日配额行
 * - 临时补偿：通过 bonus_draw_count 实现当日临时加次数
 * - 审计追溯：记录命中规则ID和最后抽奖时间
 *
 * 关键业务规则（写死，不可配置）：
 * - 规则变更当日不回算（配额行生成后当天不变）
 * - 连抽整笔成功或整笔失败（不支持部分成功）
 * - 每日凌晨00:00（北京时间）生成新配额行
 *
 * 数据库表名：lottery_user_daily_draw_quota
 * 主键：quota_id（BIGINT，自增）
 * 唯一索引：user_id + campaign_id + quota_date
 *
 * 创建时间：2025-12-23
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定义 LotteryUserDailyDrawQuota 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} LotteryUserDailyDrawQuota 模型
 */
module.exports = sequelize => {
  const LotteryUserDailyDrawQuota = sequelize.define(
    'LotteryUserDailyDrawQuota',
    {
      // 配额记录主键ID
      quota_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '配额记录主键ID'
      },

      // 用户ID
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          notNull: { msg: '用户ID不能为空' },
          isInt: { msg: '用户ID必须是整数' }
        },
        comment: '用户ID'
      },

      // 活动ID
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          notNull: { msg: '活动ID不能为空' },
          isInt: { msg: '活动ID必须是整数' }
        },
        comment: '活动ID'
      },

      // 配额日期：北京时间日期
      quota_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
          notNull: { msg: '配额日期不能为空' },
          isDate: { msg: '配额日期格式不正确' }
        },
        comment: '配额日期：北京时间日期'
      },

      // 当日上限：来自规则计算结果
      limit_value: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 50,
        validate: {
          min: { args: [0], msg: '配额上限值不能为负数' }
        },
        comment: '当日上限：来自规则计算结果'
      },

      // 已使用抽奖次数
      used_draw_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: { args: [0], msg: '已使用次数不能为负数' }
        },
        comment: '已使用抽奖次数'
      },

      // 当日临时补偿的抽奖次数（客服加次数用）
      bonus_draw_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: { args: [0], msg: '补偿次数不能为负数' }
        },
        comment: '当日临时补偿的抽奖次数（客服加次数用）'
      },

      // 最后一次抽奖时间
      last_draw_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后一次抽奖时间'
      },

      // 命中的规则ID（便于审计追溯）
      matched_rule_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '命中的规则ID（便于审计追溯）'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
      }
    },
    {
      tableName: 'lottery_user_daily_draw_quota',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '用户每日抽奖配额表：强一致扣减层，原子操作避免并发窗口期问题',
      indexes: [
        {
          name: 'idx_user_campaign_date_unique',
          unique: true,
          fields: ['user_id', 'campaign_id', 'quota_date']
        },
        {
          name: 'idx_date_campaign',
          fields: ['quota_date', 'campaign_id']
        },
        {
          name: 'idx_user_id',
          fields: ['user_id']
        }
      ]
    }
  )

  /*
   * ============================================================
   * 虚拟字段（Virtual Fields）：计算属性
   * ============================================================
   */

  /**
   * 剩余可用次数 = 上限 + 补偿 - 已使用
   * @returns {number} 剩余可用次数
   */
  LotteryUserDailyDrawQuota.prototype.getRemainingCount = function () {
    return this.limit_value + this.bonus_draw_count - this.used_draw_count
  }

  /**
   * 总可用次数 = 上限 + 补偿
   * @returns {number} 总可用次数
   */
  LotteryUserDailyDrawQuota.prototype.getTotalAvailable = function () {
    return this.limit_value + this.bonus_draw_count
  }

  /**
   * 是否已达上限
   * @returns {boolean} 是否已达上限
   */
  LotteryUserDailyDrawQuota.prototype.isExhausted = function () {
    return this.used_draw_count >= this.limit_value + this.bonus_draw_count
  }

  /*
   * ============================================================
   * 模型作用域（Scopes）：常用查询快捷方式
   * ============================================================
   */

  /**
   * 查询作用域：今日配额
   */
  LotteryUserDailyDrawQuota.addScope('today', () => {
    const todayDate = BeijingTimeHelper.todayStart().toISOString().split('T')[0]
    return {
      where: { quota_date: todayDate }
    }
  })

  /**
   * 查询作用域：指定用户
   */
  LotteryUserDailyDrawQuota.addScope('forUser', user_id => ({
    where: { user_id }
  }))

  /**
   * 查询作用域：指定活动
   */
  LotteryUserDailyDrawQuota.addScope('forCampaign', campaign_id => ({
    where: { campaign_id }
  }))

  /*
   * ============================================================
   * 静态方法（Static Methods）：业务逻辑封装
   * ============================================================
   */

  /**
   * 确保用户当日配额行存在（不存在则创建）
   *
   * 业务逻辑：
   * 1. 查询是否已有当日配额行
   * 2. 如无，调用 LotteryDrawQuotaRule.getEffectiveDailyLimit() 获取 limit_value
   * 3. 创建配额行
   * 4. 使用 INSERT ... ON DUPLICATE KEY UPDATE 保证幂等
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {Array<string>} [params.role_uuids] - 用户角色UUID列表（可选）
   * @param {Object} options - 选项 { transaction }
   * @returns {Promise<Object>} 配额行对象
   */
  LotteryUserDailyDrawQuota.ensureDailyQuota = async function (params, options = {}) {
    const { user_id, campaign_id, role_uuids = [] } = params
    const { transaction } = options

    // 获取今日日期（北京时间）
    const todayDate = BeijingTimeHelper.todayStart().toISOString().split('T')[0]

    // 查询是否已有当日配额行
    let quota = await this.findOne({
      where: {
        user_id,
        campaign_id,
        quota_date: todayDate
      },
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined
    })

    if (quota) {
      return quota
    }

    // 获取生效的每日配额上限
    const LotteryDrawQuotaRule = sequelize.models.LotteryDrawQuotaRule
    const { limit_value, matched_rule } = await LotteryDrawQuotaRule.getEffectiveDailyLimit({
      user_id,
      campaign_id,
      role_uuids
    })

    // 创建配额行（使用 upsert 保证幂等）
    const [_createdQuota] = await this.upsert(
      {
        user_id,
        campaign_id,
        quota_date: todayDate,
        limit_value,
        used_draw_count: 0,
        bonus_draw_count: 0,
        matched_rule_id: matched_rule?.rule_id || null
      },
      { transaction }
    )

    // 重新查询完整数据
    quota = await this.findOne({
      where: {
        user_id,
        campaign_id,
        quota_date: todayDate
      },
      transaction
    })

    return quota
  }

  /**
   * 原子扣减配额（核心方法：支持连抽）
   *
   * 业务逻辑：
   * 1. 事务内执行：SELECT ... FOR UPDATE 锁定行
   * 2. 判断：used_draw_count + draw_count <= limit_value + bonus_draw_count
   * 3. 如允许：UPDATE ... SET used_draw_count = used_draw_count + draw_count
   * 4. 如超限：返回失败结果
   *
   * 关键特性：
   * - 原子操作：并发请求只有一个能成功扣减
   * - 支持连抽：一次扣减 N 次（10连抽扣减10次）
   * - 事务安全：必须在事务内调用
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {number} params.draw_count - 本次抽奖次数（连抽场景 >1）
   * @param {Object} options - 选项 { transaction }（必需）
   * @returns {Promise<Object>} { success, remaining, limit, used, message }
   */
  LotteryUserDailyDrawQuota.tryDeductQuota = async function (params, options = {}) {
    const { user_id, campaign_id, draw_count = 1 } = params
    const { transaction } = options

    if (!transaction) {
      throw new Error('tryDeductQuota 必须在事务内调用')
    }

    // 获取今日日期（北京时间）
    const todayDate = BeijingTimeHelper.todayStart().toISOString().split('T')[0]

    // 使用原生SQL进行原子扣减（条件更新）
    const [affectedRows] = await sequelize.query(
      `UPDATE lottery_user_daily_draw_quota
       SET used_draw_count = used_draw_count + :draw_count,
           last_draw_at = NOW(),
           updated_at = NOW()
       WHERE user_id = :user_id
         AND campaign_id = :campaign_id
         AND quota_date = :quota_date
         AND used_draw_count + :draw_count <= limit_value + bonus_draw_count`,
      {
        replacements: {
          user_id,
          campaign_id,
          quota_date: todayDate,
          draw_count
        },
        type: sequelize.QueryTypes.UPDATE,
        transaction
      }
    )

    // 查询最新配额状态
    const quota = await this.findOne({
      where: {
        user_id,
        campaign_id,
        quota_date: todayDate
      },
      transaction
    })

    if (!quota) {
      return {
        success: false,
        remaining: 0,
        limit: 0,
        used: 0,
        message: '配额记录不存在'
      }
    }

    if (affectedRows === 0) {
      // 扣减失败：配额不足
      const remaining = quota.limit_value + quota.bonus_draw_count - quota.used_draw_count
      return {
        success: false,
        remaining,
        limit: quota.limit_value,
        bonus: quota.bonus_draw_count,
        used: quota.used_draw_count,
        requested: draw_count,
        matched_rule_id: quota.matched_rule_id,
        message: `今日抽奖次数已达上限（${quota.limit_value + quota.bonus_draw_count}次），剩余${remaining}次，请求${draw_count}次`
      }
    }

    // 扣减成功
    const remaining = quota.limit_value + quota.bonus_draw_count - quota.used_draw_count
    return {
      success: true,
      remaining,
      limit: quota.limit_value,
      bonus: quota.bonus_draw_count,
      used: quota.used_draw_count,
      deducted: draw_count,
      matched_rule_id: quota.matched_rule_id,
      message: '配额扣减成功'
    }
  }

  /**
   * 获取用户当日配额状态
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {Object} options - 选项 { transaction }
   * @returns {Promise<Object|null>} 配额状态对象或null
   */
  LotteryUserDailyDrawQuota.getDailyQuotaStatus = async function (params, options = {}) {
    const { user_id, campaign_id } = params
    const { transaction } = options

    const todayDate = BeijingTimeHelper.todayStart().toISOString().split('T')[0]

    const quota = await this.findOne({
      where: {
        user_id,
        campaign_id,
        quota_date: todayDate
      },
      transaction
    })

    if (!quota) {
      return null
    }

    return {
      quota_id: quota.quota_id,
      user_id: quota.user_id,
      campaign_id: quota.campaign_id,
      quota_date: quota.quota_date,
      limit_value: quota.limit_value,
      used_draw_count: quota.used_draw_count,
      bonus_draw_count: quota.bonus_draw_count,
      remaining: quota.limit_value + quota.bonus_draw_count - quota.used_draw_count,
      total_available: quota.limit_value + quota.bonus_draw_count,
      is_exhausted: quota.used_draw_count >= quota.limit_value + quota.bonus_draw_count,
      last_draw_at: quota.last_draw_at,
      matched_rule_id: quota.matched_rule_id
    }
  }

  /**
   * 为用户添加临时补偿次数（客服用）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {number} params.bonus_count - 补偿次数
   * @param {string} [params.reason] - 补偿原因
   * @param {Object} options - 选项 { transaction, admin_id }
   * @returns {Promise<Object>} 更新后的配额状态
   */
  LotteryUserDailyDrawQuota.addBonusDrawCount = async function (params, options = {}) {
    const { user_id, campaign_id, bonus_count, reason: _reason } = params
    const { transaction } = options

    const todayDate = BeijingTimeHelper.todayStart().toISOString().split('T')[0]

    // 确保配额行存在
    await this.ensureDailyQuota({ user_id, campaign_id }, { transaction })

    // 更新补偿次数
    await this.update(
      {
        bonus_draw_count: sequelize.literal(`bonus_draw_count + ${bonus_count}`)
      },
      {
        where: {
          user_id,
          campaign_id,
          quota_date: todayDate
        },
        transaction
      }
    )

    // 返回更新后的状态
    return this.getDailyQuotaStatus({ user_id, campaign_id }, { transaction })
  }

  return LotteryUserDailyDrawQuota
}
