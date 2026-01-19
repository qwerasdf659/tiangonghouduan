'use strict'

/**
 * PresetAwardPipeline - 预设发放管线
 *
 * 职责：
 * 1. 处理预设奖品的强制发放
 * 2. 支持库存/预算欠账机制
 * 3. 绕过概率抽取，直接发放指定奖品
 *
 * 设计原则（已拍板）：
 * - 预设语义：必须发放 + 尽力扣减 + 记欠账
 * - 预设/干预绕开概率：凡是"指定结果"，一律绕开 tier_first 和概率抽取
 * - 必须写快照：无论走哪条管线，都必须写 lottery_draw_decisions
 *
 * Stage 执行顺序：
 * 1. LoadCampaignStage - 加载活动配置
 * 2. LoadPresetStage - 加载预设配置
 * 3. PresetBudgetStage - 处理预设预算（支持欠账）
 * 4. DecisionSnapshotStage - 记录决策快照
 * 5. PresetSettleStage - 预设结算（强制变体）
 *
 * @module services/UnifiedLotteryEngine/pipeline/PresetAwardPipeline
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const PipelineRunner = require('./PipelineRunner')
const {
  LoadCampaignStage,
  LoadPresetStage,
  PresetBudgetStage,
  /* DecisionSnapshotStage 预留用于审计快照（当前预设流程集成在 PresetSettleStage） */
  PresetSettleStage
} = require('./stages')

/**
 * 预设发放管线
 */
class PresetAwardPipeline extends PipelineRunner {
  /**
   * 创建预设发放管线实例
   *
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super('PresetAwardPipeline', options)

    // 初始化 Stage
    this._initializeStages()
  }

  /**
   * 初始化 Stage
   *
   * 执行顺序严格按照架构文档定义（预设发放流程）
   *
   * @returns {void}
   * @private
   */
  _initializeStages() {
    // 1. 加载活动配置 - 加载活动基本信息
    this.addStage(new LoadCampaignStage())

    // 2. 加载预设配置 - 加载预设记录和关联奖品
    this.addStage(new LoadPresetStage())

    // 3. 处理预设预算（支持欠账）- 检查/扣减预算，支持欠账模式
    this.addStage(new PresetBudgetStage())

    /*
     * 4. 预设结算（强制变体）- 扣库存、发奖品、记录欠账
     * 注意：PresetSettleStage 内部会创建决策记录
     */
    this.addStage(new PresetSettleStage())
  }

  /**
   * 执行预设发放
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.preset - 预设配置
   * @param {string} context.idempotency_key - 幂等键
   * @param {Object} context.transaction - 数据库事务（可选）
   * @returns {Promise<Object>} 执行结果
   */
  async run(context) {
    // 设置管线类型
    context.pipeline_type = 'preset'

    // 验证预设配置
    if (!context.preset) {
      throw new Error('PresetAwardPipeline requires preset in context')
    }

    // 调用父类的 run 方法
    return await super.run(context)
  }
}

module.exports = PresetAwardPipeline
