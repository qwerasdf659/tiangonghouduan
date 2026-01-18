'use strict'

/**
 * LoadPresetStage - 加载预设配置 Stage
 *
 * 职责：
 * 1. 加载预设记录
 * 2. 验证预设状态（待执行、已批准等）
 * 3. 加载预设关联的奖品信息
 * 4. 验证预设执行条件
 *
 * 输出到上下文：
 * - preset: 预设记录对象
 * - preset_prize: 预设关联的奖品
 * - preset_status: 预设状态信息
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/LoadPresetStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const { LotteryPreset, LotteryPrize, User } = require('../../../../models')

/**
 * 加载预设配置 Stage
 */
class LoadPresetStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('LoadPresetStage', {
      required: true
    })
  }

  /**
   * 执行预设配置加载
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.preset - 预设对象或ID
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id, preset: preset_input } = context

    this.log('info', '开始加载预设配置', { user_id, campaign_id })

    try {
      // 加载预设记录
      const preset = await this._loadPreset(preset_input, user_id, campaign_id)
      if (!preset) {
        throw this.createError('未找到待执行的预设记录', 'PRESET_NOT_FOUND', true)
      }

      // 验证预设状态
      this._validatePresetStatus(preset)

      // 加载预设关联的奖品
      const preset_prize = await this._loadPresetPrize(preset)
      if (!preset_prize) {
        throw this.createError(
          `预设关联的奖品不存在: prize_id=${preset.prize_id}`,
          'PRESET_PRIZE_NOT_FOUND',
          true
        )
      }

      // 验证预设执行条件
      this._validatePresetExecutionConditions(preset, preset_prize)

      const result = {
        preset: preset.toJSON ? preset.toJSON() : preset,
        preset_prize: preset_prize.toJSON ? preset_prize.toJSON() : preset_prize,
        preset_status: {
          is_approved: preset.approval_status === 'approved',
          advance_mode: preset.advance_mode || 'none',
          operator_id: preset.created_by,
          approved_by: preset.approved_by,
          reason: preset.reason
        }
      }

      this.log('info', '预设配置加载完成', {
        preset_id: preset.preset_id,
        prize_id: preset_prize.prize_id,
        prize_name: preset_prize.prize_name,
        advance_mode: preset.advance_mode
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '预设配置加载失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 加载预设记录
   *
   * @param {Object|number} preset_input - 预设对象或ID
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object|null>} 预设记录
   * @private
   */
  async _loadPreset(preset_input, user_id, campaign_id) {
    // 如果传入的是完整的预设对象
    if (preset_input && typeof preset_input === 'object' && preset_input.preset_id) {
      return preset_input
    }

    // 如果传入的是预设ID
    if (typeof preset_input === 'number' || typeof preset_input === 'string') {
      return await LotteryPreset.findOne({
        where: {
          preset_id: preset_input,
          status: 'pending' // 只查找待执行的预设
        },
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['user_id', 'username', 'nickname']
          }
        ]
      })
    }

    // 按用户ID和活动ID查找待执行的预设（队列模式）
    return await LotteryPreset.findOne({
      where: {
        user_id,
        campaign_id,
        status: 'pending'
      },
      order: [
        ['priority', 'DESC'], // 优先级高的先执行
        ['created_at', 'ASC'] // 创建时间早的先执行
      ],
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['user_id', 'username', 'nickname']
        }
      ]
    })
  }

  /**
   * 验证预设状态
   *
   * @param {Object} preset - 预设记录
   * @returns {void}
   * @throws {Error} 预设状态无效时抛出错误
   * @private
   */
  _validatePresetStatus(preset) {
    // 检查预设状态
    if (preset.status !== 'pending') {
      throw this.createError(
        `预设状态无效，当前状态: ${preset.status}`,
        'INVALID_PRESET_STATUS',
        true
      )
    }

    // 检查审批状态（如果需要审批）
    if (preset.approval_status === 'rejected') {
      throw this.createError(
        `预设已被驳回: ${preset.rejection_reason || '未知原因'}`,
        'PRESET_REJECTED',
        true
      )
    }

    // 检查有效期
    if (preset.expires_at && new Date(preset.expires_at) < new Date()) {
      throw this.createError('预设已过期', 'PRESET_EXPIRED', true)
    }
  }

  /**
   * 加载预设关联的奖品
   *
   * @param {Object} preset - 预设记录
   * @returns {Promise<Object|null>} 奖品记录
   * @private
   */
  async _loadPresetPrize(preset) {
    return await LotteryPrize.findOne({
      where: {
        prize_id: preset.prize_id,
        is_active: true
      }
    })
  }

  /**
   * 验证预设执行条件
   *
   * @param {Object} preset - 预设记录
   * @param {Object} prize - 奖品记录
   * @returns {void}
   * @throws {Error} 执行条件不满足时抛出错误
   * @private
   */
  _validatePresetExecutionConditions(preset, prize) {
    // 欠账模式下不检查库存
    if (preset.advance_mode === 'inventory_debt' || preset.advance_mode === 'both') {
      this.log('debug', '预设使用库存欠账模式，跳过库存检查', {
        preset_id: preset.preset_id,
        advance_mode: preset.advance_mode
      })
      return
    }

    // 非欠账模式下检查库存
    if (prize.stock_quantity !== null && prize.stock_quantity <= 0) {
      throw this.createError(
        `奖品库存不足: ${prize.prize_name}，当前库存: ${prize.stock_quantity}`,
        'INSUFFICIENT_STOCK',
        true
      )
    }
  }
}

module.exports = LoadPresetStage
