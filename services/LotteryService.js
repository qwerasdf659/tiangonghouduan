const { sequelize } = require('../models')
const { User, Prize, LotteryRecord, PointsRecord, BusinessConfigs } = require('../models')

/**
 * 抽奖业务服务类
 * 根据前端业务需求实现完整的抽奖功能
 */
class LotteryService {
  constructor () {
    // 抽奖配置缓存
    this.lotteryConfig = null
    this.configLastUpdate = null
    this.configCacheTTL = 5 * 60 * 1000 // 5分钟缓存
  }

  /**
   * 获取抽奖配置
   * 支持前端Canvas转盘绘制的8个奖品配置
   */
  async getLotteryConfig () {
    try {
      // 检查缓存
      if (
        this.lotteryConfig &&
        this.configLastUpdate &&
        Date.now() - this.configLastUpdate < this.configCacheTTL
      ) {
        return this.lotteryConfig
      }

      // 获取系统配置
      const systemConfig = await BusinessConfigs.findOne({
        where: { business_type: 'lottery' }
      })

      const parsedSystemConfig = systemConfig ? systemConfig.extended_config || {} : {}

      // 获取8个奖品配置（转盘固定8个区域）
      const prizes = await Prize.findAll({
        where: { is_active: true },
        order: [['display_order', 'ASC']],
        limit: 8
      })

      // 确保有8个奖品配置
      if (prizes.length !== 8) {
        throw new Error('转盘必须配置8个奖品区域')
      }

      // 验证概率总和为100 (win_rate是0-1的小数，需要转换为百分比)
      const totalProbability = prizes.reduce(
        (sum, prize) => sum + parseFloat(prize.win_rate) * 100,
        0
      )
      if (Math.abs(totalProbability - 100) > 0.01) {
        throw new Error(`奖品概率总和必须为100%，当前为${totalProbability.toFixed(2)}%`)
      }

      const config = {
        system_config: {
          is_active: parsedSystemConfig.is_active !== false,
          cost_points: parsedSystemConfig.cost_points || 100,
          daily_limit: parsedSystemConfig.daily_limit || 50,
          maintenance_mode: parsedSystemConfig.maintenance_mode || false
        },
        prizes: prizes.map(prize => ({
          position: prize.display_order,
          prize_id: prize.prize_id,
          name: prize.prize_name,
          probability: parseFloat(prize.win_rate) * 100, // 转换为百分比
          type: prize.prize_type,
          color: '#FF6B6B', // 默认颜色，可以后续从配置获取
          image: prize.image_url,
          description: prize.description,
          value: parseFloat(prize.prize_value),
          exchange_method: 'auto' // 默认兑换方式，可以后续从配置获取
        })),
        validation: {
          total_probability: totalProbability,
          last_updated: new Date().toISOString(),
          updated_by: 'system'
        }
      }

      // 更新缓存
      this.lotteryConfig = config
      this.configLastUpdate = Date.now()

      return config
    } catch (error) {
      console.error('❌ 获取抽奖配置失败:', error.message)
      throw error
    }
  }

  /**
   * 执行抽奖
   * 支持单抽和连抽，包含保底机制
   */
  async executeLottery (userId, drawType, drawCount, costPoints, clientTimestamp) {
    const transaction = await sequelize.transaction()

    try {
      // 1. 获取用户信息和抽奖配置
      const [user, config] = await Promise.all([
        User.findByPk(userId, { transaction }),
        this.getLotteryConfig()
      ])

      if (!user) {
        throw new Error('用户不存在')
      }

      if (!config.system_config.is_active) {
        throw new Error('抽奖系统暂时关闭')
      }

      if (config.system_config.maintenance_mode) {
        throw new Error('系统维护中，请稍后再试')
      }

      // 2. 验证用户状态和积分
      await this._validateUserForLottery(user, drawCount, costPoints, config, transaction)

      // 3. 检查今日抽奖次数（管理员无限制）
      const todayDrawCount = await this._getTodayDrawCount(userId, transaction)

      // 🔧 管理员无限制抽奖特权
      if (!user.is_admin && todayDrawCount + drawCount > config.system_config.daily_limit) {
        throw new Error(`今日抽奖次数已达上限${config.system_config.daily_limit}次`)
      }

      // 管理员抽奖日志记录
      if (user.is_admin) {
        console.log(`👑 管理员抽奖 - 用户${userId}(${user.mobile})，今日已抽奖${todayDrawCount}次，本次抽奖${drawCount}次，无限制模式`)
      } else {
        console.log(`👤 普通用户抽奖 - 用户${userId}，今日已抽奖${todayDrawCount}次，本次抽奖${drawCount}次，限制${config.system_config.daily_limit}次/天`)
      }

      // 4. 获取用户保底信息
      const consecutiveFailCount = await this._getConsecutiveFailCount(userId, transaction)

      // 5. 执行抽奖（单次或多次）
      const lotteryResults = []
      let totalPointsDeducted = 0
      let updatedConsecutiveFailCount = consecutiveFailCount

      for (let i = 0; i < drawCount; i++) {
        // 5.1 判断是否触发保底
        const isGuarantee = updatedConsecutiveFailCount >= 10

        // 5.2 执行单次抽奖
        const result = await this._performSingleDraw(config.prizes, isGuarantee, i, transaction)

        // 5.3 更新保底计数
        if (result.prize.type !== '谢谢参与' && result.prize.name !== '谢谢参与') {
          updatedConsecutiveFailCount = 0 // 中奖后重置
        } else {
          updatedConsecutiveFailCount++
        }

        // 5.4 扣除积分
        await this._deductPoints(
          user,
          config.system_config.cost_points,
          `${drawType}抽奖-第${i + 1}次`,
          transaction
        )
        totalPointsDeducted += config.system_config.cost_points

        lotteryResults.push(result)
      }

      // 6. 更新用户保底计数
      await this._updateConsecutiveFailCount(userId, updatedConsecutiveFailCount, transaction)

      // 7. 记录抽奖历史
      const drawId = `draw_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const lotteryId = require('crypto').randomUUID()

      await LotteryRecord.create(
        {
          draw_id: drawId, // 🔧 修复：添加必需的draw_id主键
          lottery_id: lotteryId, // 🔧 修复：添加必需的lottery_id字段
          user_id: userId,
          draw_type: drawType,
          draw_count: drawCount,
          cost_points: totalPointsDeducted,
          results: JSON.stringify(lotteryResults),
          winning_indexes: lotteryResults.map(r => r.winning_index),
          prize_ids: lotteryResults.map(r => r.prize.prize_id),
          is_guarantee: lotteryResults.some(r => r.is_guarantee),
          client_timestamp: clientTimestamp
        },
        { transaction }
      )

      // 8. 刷新用户信息
      await user.reload({ transaction })

      // 9. 提交事务
      await transaction.commit()

      // 10. 构造响应数据
      const responseData =
        drawCount === 1
          ? this._buildSingleDrawResponse(lotteryResults[0], user, todayDrawCount + drawCount)
          : this._buildMultipleDrawResponse(lotteryResults, user, todayDrawCount + drawCount)

      // 11. 清除配置缓存（如果有变更）
      this._clearConfigCache()

      return responseData
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 抽奖执行失败:', error.message)
      throw error
    }
  }

  /**
   * 验证用户抽奖条件
   */
  async _validateUserForLottery (user, drawCount, expectedCostPoints, config, _transaction) {
    const actualCostPoints = drawCount * config.system_config.cost_points

    // 验证积分计算
    if (expectedCostPoints !== actualCostPoints) {
      throw new Error(`积分计算错误，期望${expectedCostPoints}，实际需要${actualCostPoints}`)
    }

    // 验证积分余额
    if (user.total_points < actualCostPoints) {
      throw new Error('积分不足，请先上传消费小票获取积分')
    }

    // 验证账户状态
    if (user.status !== 'active') {
      throw new Error('账户状态异常，无法参与抽奖')
    }
  }

  /**
   * 获取今日抽奖次数
   */
  async _getTodayDrawCount (userId, transaction) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const records = await LotteryRecord.findAll({
      where: {
        user_id: userId,
        created_at: {
          [sequelize.Sequelize.Op.gte]: today,
          [sequelize.Sequelize.Op.lt]: tomorrow
        }
      },
      transaction
    })

    return records.reduce((total, record) => total + record.draw_count, 0)
  }

  /**
   * 获取连续未中奖次数（保底机制）
   */
  async _getConsecutiveFailCount (userId, transaction) {
    const user = await User.findByPk(userId, {
      attributes: ['consecutive_fail_count'],
      transaction
    })
    return user?.consecutive_fail_count || 0
  }

  /**
   * 执行单次抽奖
   */
  async _performSingleDraw (prizes, isGuarantee, _drawIndex, _transaction) {
    let selectedPrize
    let winningIndex

    if (isGuarantee) {
      // 保底机制：强制返回非"谢谢参与"奖品
      const valuablePrizes = prizes.filter(p => p.name !== '谢谢参与' && p.type !== '谢谢参与')
      if (valuablePrizes.length === 0) {
        throw new Error('保底机制错误：没有可用的有价值奖品')
      }

      // 在有价值奖品中随机选择（可以是八八折券或更好的）
      const randomIndex = Math.floor(Math.random() * valuablePrizes.length)
      selectedPrize = valuablePrizes[randomIndex]
      winningIndex = selectedPrize.position
    } else {
      // 正常概率抽奖
      const random = Math.random() * 100
      let cumulativeProbability = 0

      for (const prize of prizes) {
        cumulativeProbability += prize.probability
        if (random <= cumulativeProbability) {
          selectedPrize = prize
          winningIndex = prize.position
          break
        }
      }
    }

    // 生成兑换码（如果是实物或优惠券）
    let exchangeCode = null
    if (selectedPrize.type === '实物' || selectedPrize.type === '优惠券') {
      exchangeCode = this._generateExchangeCode(selectedPrize.prize_id)
    }

    return {
      winning_index: winningIndex,
      prize: {
        prize_id: selectedPrize.prize_id,
        name: selectedPrize.name,
        type: selectedPrize.type,
        description: selectedPrize.description,
        value: selectedPrize.value,
        exchange_code: exchangeCode,
        expire_date: this._calculateExpireDate()
      },
      is_guarantee: isGuarantee,
      animation_config: {
        highlight_duration: 3000,
        celebration_level: this._getCelebrationLevel(selectedPrize)
      }
    }
  }

  /**
   * 扣除用户积分
   */
  async _deductPoints (user, points, reason, transaction) {
    // 更新用户积分
    await user.decrement('total_points', { by: points, transaction })

    // 🔧 修复PointsRecord字段名匹配实际表结构
    await PointsRecord.create(
      {
        user_id: user.user_id,
        type: 'spend', // 修复：使用正确的字段名和枚举值
        points, // 修复：使用正确的字段名
        description: reason, // 修复：使用正确的字段名
        source: 'lottery', // 修复：使用正确的字段名和枚举值
        balance_after: user.total_points - points // 修复：使用正确的字段名
      },
      { transaction }
    )
  }

  /**
   * 更新连续未中奖次数
   */
  async _updateConsecutiveFailCount (userId, count, transaction) {
    await User.update(
      { consecutive_fail_count: count },
      { where: { user_id: userId }, transaction }
    )
  }

  /**
   * 构造单次抽奖响应
   */
  _buildSingleDrawResponse (result, user, todayDrawCount) {
    return {
      winning_index: result.winning_index,
      prize: result.prize,
      user_status: {
        remaining_points: user.total_points,
        today_draw_count: todayDrawCount,
        total_draw_count: user.total_draw_count || 0,
        consecutive_fail_count: user.consecutive_fail_count || 0
      },
      animation_config: result.animation_config
    }
  }

  /**
   * 构造多次抽奖响应
   */
  _buildMultipleDrawResponse (results, user, todayDrawCount) {
    return {
      results: results.map(r => ({
        winning_index: r.winning_index,
        prize: r.prize,
        is_guarantee: r.is_guarantee
      })),
      user_status: {
        remaining_points: user.total_points,
        today_draw_count: todayDrawCount,
        total_draw_count: user.total_draw_count || 0,
        consecutive_fail_count: user.consecutive_fail_count || 0
      },
      summary: {
        total_prizes: results.length,
        best_prize: this._getBestPrize(results),
        guarantee_triggered: results.some(r => r.is_guarantee)
      }
    }
  }

  /**
   * 生成兑换码
   */
  _generateExchangeCode (prizeId) {
    const timestamp = Date.now().toString()
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    return `${prizeId.toUpperCase()}${timestamp.slice(-6)}${random}`
  }

  /**
   * 计算过期时间
   */
  _calculateExpireDate () {
    const expireDate = new Date()
    expireDate.setMonth(expireDate.getMonth() + 1) // 1个月有效期
    return expireDate.toISOString().split('T')[0] // YYYY-MM-DD格式
  }

  /**
   * 获取庆祝等级
   */
  _getCelebrationLevel (prize) {
    if (prize.name === '谢谢参与') return 1
    if (prize.type === '优惠券') return 2
    if (prize.type === '实物') return 3
    return 2
  }

  /**
   * 获取最佳奖品
   */
  _getBestPrize (results) {
    const valueOrder = { 实物: 3, 优惠券: 2, 积分: 1, 谢谢参与: 0 }
    let bestPrize = results[0].prize
    let bestValue = valueOrder[bestPrize.type] || 0

    for (const result of results) {
      const currentValue = valueOrder[result.prize.type] || 0
      if (currentValue > bestValue) {
        bestPrize = result.prize
        bestValue = currentValue
      }
    }

    return bestPrize.name
  }

  /**
   * 清除配置缓存
   */
  _clearConfigCache () {
    this.lotteryConfig = null
    this.configLastUpdate = null
  }

  /**
   * 获取抽奖统计数据
   */
  async getLotteryStatistics (userId = null, _isAdmin = false) {
    try {
      const baseWhere = userId ? { user_id: userId } : {}

      const [totalRecords, todayRecords, weekRecords] = await Promise.all([
        LotteryRecord.count({ where: baseWhere }),
        LotteryRecord.count({
          where: {
            ...baseWhere,
            created_at: {
              [sequelize.Sequelize.Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        }),
        LotteryRecord.count({
          where: {
            ...baseWhere,
            created_at: {
              [sequelize.Sequelize.Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        })
      ])

      return {
        total_draws: totalRecords,
        today_draws: todayRecords,
        week_draws: weekRecords,
        last_updated: new Date().toISOString()
      }
    } catch (error) {
      console.error('❌ 获取抽奖统计失败:', error.message)
      throw error
    }
  }
}

module.exports = LotteryService
