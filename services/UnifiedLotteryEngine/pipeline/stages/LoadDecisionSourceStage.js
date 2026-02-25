'use strict'

/**
 * LoadDecisionSourceStage - 加载决策来源 Stage
 *
 * 职责：
 * 1. 统一判断抽奖决策来源类型（preset/override/guarantee/normal）
 * 2. 加载对应的决策配置
 * 3. 设置 context.decision_source 供后续 Stage 使用
 *
 * 决策优先级（已拍板 2026-01-18）：
 * 1. 预设（preset）- 最高优先级：有待使用预设时
 * 2. 管理干预（override）- 次高优先级：有 force_win/force_lose 时
 * 3. 保底（guarantee）- 第三优先级：达到保底阈值时
 * 4. 正常抽奖（normal）- 最低优先级：无上述情况时
 *
 * 输出到上下文：
 * - decision_source: 决策来源类型（preset/override/guarantee/normal）
 * - preset: 预设记录（如果是 preset）
 * - override: 干预配置（如果是 override）
 * - guarantee_triggered: 保底触发信息（如果是 guarantee）
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/LoadDecisionSourceStage
 * @author 统一抽奖架构重构 - Pipeline 统一化
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const { LotteryPreset, LotteryManagementSetting, LotteryDraw, User } = require('../../../../models')
const { Op } = require('sequelize')

/**
 * 决策来源类型常量
 */
const DECISION_SOURCES = {
  PRESET: 'preset',
  OVERRIDE: 'override',
  GUARANTEE: 'guarantee',
  NORMAL: 'normal'
}

/**
 * 加载决策来源 Stage
 */
class LoadDecisionSourceStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('LoadDecisionSourceStage', {
      is_writer: false,
      required: true
    })
  }

  /**
   * 执行决策来源加载
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, lottery_campaign_id } = context

    this.log('info', '开始判断决策来源', { user_id, lottery_campaign_id })

    try {
      // 获取活动配置
      const campaign_data = this.getContextData(context, 'LoadCampaignStage.data')
      const campaign = campaign_data?.campaign || {}

      /*
       * 决策优先级判断（按优先级顺序检查）
       * 优先级：preset > override > guarantee > normal
       */

      // 1. 检查预设（最高优先级）
      const preset = await this._checkPreset(user_id, lottery_campaign_id)
      if (preset) {
        this.log('info', '命中预设决策', {
          user_id,
          lottery_preset_id: preset.lottery_preset_id,
          lottery_prize_id: preset.lottery_prize_id
        })
        return this.success({
          decision_source: DECISION_SOURCES.PRESET,
          preset: preset.toJSON ? preset.toJSON() : preset,
          override: null,
          guarantee_triggered: null
        })
      }

      // 2. 检查管理干预（次高优先级）
      const override = await this._checkOverride(user_id, lottery_campaign_id)
      if (override) {
        this.log('info', '命中管理干预', {
          user_id,
          setting_id: override.setting_id,
          setting_type: override.setting_type
        })
        return this.success({
          decision_source: DECISION_SOURCES.OVERRIDE,
          preset: null,
          override: override.toJSON ? override.toJSON() : override,
          guarantee_triggered: null
        })
      }

      // 3. 检查保底触发（第三优先级）
      const guarantee = await this._checkGuarantee(user_id, lottery_campaign_id, campaign)
      if (guarantee.triggered) {
        this.log('info', '触发保底机制', {
          user_id,
          draw_count: guarantee.current_count,
          threshold: guarantee.threshold
        })
        return this.success({
          decision_source: DECISION_SOURCES.GUARANTEE,
          preset: null,
          override: null,
          guarantee_triggered: guarantee
        })
      }

      // 4. 正常抽奖（最低优先级）
      this.log('info', '使用正常抽奖决策', { user_id, lottery_campaign_id })
      return this.success({
        decision_source: DECISION_SOURCES.NORMAL,
        preset: null,
        override: null,
        guarantee_triggered: null
      })
    } catch (error) {
      this.log('error', '判断决策来源失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 检查是否有待使用的预设
   *
   * 查询规则：
   * 1. 匹配用户 user_id
   * 2. 状态为 pending（等待使用）且审批已通过（approved）
   * 3. 活动匹配：精确匹配 lottery_campaign_id，或预设未绑定活动（NULL 表示全局预设）
   * 4. 按 queue_order 升序取第一个（队列顺序消耗）
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Object|null>} 预设记录或 null
   * @private
   */
  async _checkPreset(user_id, lottery_campaign_id) {
    try {
      /*
       * 2026-02-15 修复：支持全局预设（lottery_campaign_id 为 NULL）
       *
       * 修复根因：
       * - 原代码要求 lottery_campaign_id 精确匹配
       * - 但管理后台创建预设时未传入 lottery_campaign_id（字段值为 NULL）
       * - 导致所有预设队列永远无法命中
       *
       * 修复方案：
       * - lottery_campaign_id 精确匹配当前活动（活动级预设）
       * - 或 lottery_campaign_id 为 NULL（全局预设，对所有活动生效）
       */
      const preset = await LotteryPreset.findOne({
        where: {
          user_id,
          [Op.or]: [{ lottery_campaign_id }, { lottery_campaign_id: null }],
          status: 'pending',
          approval_status: 'approved'
        },
        order: [['queue_order', 'ASC']],
        include: [
          {
            model: User,
            as: 'admin',
            attributes: ['user_id', 'nickname']
          }
        ]
      })

      return preset
    } catch (error) {
      this.log('warn', '检查预设失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      return null
    }
  }

  /**
   * 检查是否有管理干预设置
   *
   * 查询规则：
   * 1. 匹配用户 user_id
   * 2. 设置类型为 force_win 或 force_lose
   * 3. 状态为 active（生效中）
   * 4. 未过期：expires_at 为 NULL（永不过期）或 expires_at > 当前时间
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 活动ID（按活动过滤 + 总开关前置检查）
   * @returns {Promise<Object|null>} 干预设置或 null
   * @private
   */
  async _checkOverride(user_id, lottery_campaign_id) {
    try {
      // 活动级总开关：management.enabled=false 时跳过全部干预检查
      const { DynamicConfigLoader } = require('../../compute/config/StrategyConfig')
      const management_enabled = await DynamicConfigLoader.getValue('management', 'enabled', true, {
        lottery_campaign_id
      })

      if (!management_enabled) {
        this.log('info', '管理干预总开关已关闭', { user_id, lottery_campaign_id })
        return null
      }

      /**
       * 2026-02-23 改造：按活动ID过滤管理干预
       * - lottery_campaign_id 匹配当前活动 OR NULL（全局干预）
       * - 同时检查 expires_at 实时过滤已过期的干预
       */
      const override = await LotteryManagementSetting.findOne({
        where: {
          user_id,
          setting_type: { [Op.in]: ['force_win', 'force_lose'] },
          status: 'active',
          [Op.and]: [
            {
              [Op.or]: [{ lottery_campaign_id }, { lottery_campaign_id: null }]
            },
            {
              [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: new Date() } }]
            }
          ]
        },
        order: [['lottery_campaign_id', 'DESC NULLS LAST']]
      })

      return override
    } catch (error) {
      this.log('warn', '检查管理干预失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      return null
    }
  }

  /**
   * 检查是否触发保底机制
   *
   * 保底规则（已拍板 2026-01-18）：
   * - 连续抽奖次数达到阈值时触发
   * - 阈值来源于活动配置的 guarantee_threshold
   * - 默认阈值为 10 次
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} _campaign - 活动配置（保底配置已迁移到 strategy_config，此参数保留兼容调用签名）
   * @returns {Promise<Object>} 保底检查结果
   * @private
   */
  async _checkGuarantee(user_id, lottery_campaign_id, _campaign) {
    try {
      // 从 lottery_strategy_config 读取保底配置（三层优先级：DB活动级 > env > 代码默认值）
      const { DynamicConfigLoader } = require('../../compute/config/StrategyConfig')
      const guarantee_enabled =
        (await DynamicConfigLoader.getValue('guarantee', 'enabled', false, {
          lottery_campaign_id
        })) === true
      const threshold = await DynamicConfigLoader.getValue('guarantee', 'threshold', 10, {
        lottery_campaign_id
      })

      if (!guarantee_enabled) {
        return { triggered: false, reason: 'guarantee_disabled' }
      }

      // 查询用户累计抽奖次数
      const draw_count = await LotteryDraw.count({
        where: { user_id, lottery_campaign_id }
      })

      // 检查是否达到保底阈值（每 N 次触发一次）
      const next_count = draw_count + 1
      const triggered = next_count > 0 && next_count % threshold === 0

      return {
        triggered,
        current_count: draw_count,
        next_count,
        threshold
      }
    } catch (error) {
      this.log('warn', '检查保底失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      return { triggered: false, reason: 'check_failed' }
    }
  }
}

// 导出决策来源常量
LoadDecisionSourceStage.DECISION_SOURCES = DECISION_SOURCES

module.exports = LoadDecisionSourceStage
