'use strict'

/**
 * LoadOverrideStage - 加载干预配置 Stage
 *
 * 职责：
 * 1. 加载管理干预配置
 * 2. 验证干预类型（force_win/force_lose）
 * 3. 验证干预权限
 * 4. 加载干预关联的奖品（如果是 force_win）
 *
 * 输出到上下文：
 * - override: 干预配置对象
 * - override_type: 干预类型
 * - override_prize: 干预关联的奖品（force_win时）
 * - operator_info: 操作者信息
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/LoadOverrideStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const { LotteryPrize, User } = require('../../../../models')

/**
 * 加载干预配置 Stage
 */
class LoadOverrideStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('LoadOverrideStage', {
      required: true
    })
  }

  /**
   * 执行干预配置加载
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 被干预用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.override - 干预配置
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id, override } = context

    this.log('info', '开始加载干预配置', { user_id, campaign_id })

    try {
      // 验证干预配置
      if (!override) {
        throw this.createError('缺少干预配置', 'MISSING_OVERRIDE_CONFIG', true)
      }

      // 验证干预类型
      const override_type = this._validateOverrideType(override)

      // 验证干预权限
      const operator_info = await this._validateOperatorPermission(override)

      // 加载干预关联的奖品（如果是 force_win）
      let override_prize = null
      if (override_type === 'force_win') {
        override_prize = await this._loadOverridePrize(override, campaign_id)
      }

      const result = {
        override: {
          override_id: override.override_id || `override_${Date.now()}`,
          override_type,
          prize_id: override.prize_id,
          reason: override.reason || '管理干预',
          created_by: override.created_by,
          created_at: override.created_at || new Date()
        },
        override_type,
        override_prize,
        operator_info
      }

      this.log('info', '干预配置加载完成', {
        override_type,
        prize_id: override.prize_id,
        operator_id: operator_info?.user_id
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '干预配置加载失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 验证干预类型
   *
   * @param {Object} override - 干预配置
   * @returns {string} 干预类型
   * @private
   */
  _validateOverrideType(override) {
    const valid_types = ['force_win', 'force_lose']
    const override_type = override.override_type || override.type

    if (!override_type) {
      throw this.createError('缺少干预类型', 'MISSING_OVERRIDE_TYPE', true)
    }

    if (!valid_types.includes(override_type)) {
      throw this.createError(
        `无效的干预类型: ${override_type}，有效类型: ${valid_types.join(', ')}`,
        'INVALID_OVERRIDE_TYPE',
        true
      )
    }

    return override_type
  }

  /**
   * 验证操作者权限
   *
   * @param {Object} override - 干预配置
   * @returns {Promise<Object>} 操作者信息
   * @private
   */
  async _validateOperatorPermission(override) {
    const operator_id = override.created_by || override.operator_id

    if (!operator_id) {
      throw this.createError('缺少干预操作者信息', 'MISSING_OPERATOR', true)
    }

    try {
      const operator = await User.findByPk(operator_id, {
        attributes: ['user_id', 'username', 'nickname', 'role', 'is_admin']
      })

      if (!operator) {
        throw this.createError(`操作者不存在: ${operator_id}`, 'OPERATOR_NOT_FOUND', true)
      }

      // 验证操作者是否有管理员权限
      if (!operator.is_admin && operator.role !== 'admin' && operator.role !== 'super_admin') {
        throw this.createError('操作者无管理干预权限', 'INSUFFICIENT_PERMISSION', true)
      }

      return operator.toJSON ? operator.toJSON() : operator
    } catch (error) {
      if (error.code) throw error
      this.log('warn', '验证操作者权限失败', { operator_id, error: error.message })
      // 非致命错误，返回基本信息
      return { user_id: operator_id, role: 'unknown' }
    }
  }

  /**
   * 加载干预关联的奖品
   *
   * @param {Object} override - 干预配置
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object>} 奖品对象
   * @private
   */
  async _loadOverridePrize(override, campaign_id) {
    if (!override.prize_id) {
      throw this.createError('force_win 干预必须指定奖品ID', 'MISSING_PRIZE_ID', true)
    }

    const prize = await LotteryPrize.findOne({
      where: {
        prize_id: override.prize_id,
        campaign_id,
        is_active: true
      }
    })

    if (!prize) {
      throw this.createError(
        `干预指定的奖品不存在或已禁用: prize_id=${override.prize_id}`,
        'PRIZE_NOT_FOUND',
        true
      )
    }

    // 检查库存（干预模式下可以绕过库存检查，但需要记录）
    if (prize.stock_quantity !== null && prize.stock_quantity <= 0) {
      this.log('warn', '干预指定的奖品库存不足，将强制发放', {
        prize_id: prize.prize_id,
        prize_name: prize.prize_name,
        stock_quantity: prize.stock_quantity
      })
    }

    return prize.toJSON ? prize.toJSON() : prize
  }
}

module.exports = LoadOverrideStage
