'use strict'

/**
 * OverridePipeline - 管理干预管线
 *
 * 职责：
 * 1. 处理管理员的强制干预（force_win/force_lose）
 * 2. 绕过概率抽取，直接执行指定结果
 * 3. 记录完整的审计信息
 *
 * 设计原则（已拍板 2026-01-18）：
 * - 管理干预使用独立管线，不复用 PresetAwardPipeline
 * - 权限隔离更强，便于审计和权限控制
 * - 必须写快照：快照中必须包含 override_id、created_by、reason
 *
 * 优先级说明：
 * - 预设 > 干预 > 保底 > 正常抽奖
 * - 干预命中后不再执行低优先级逻辑
 *
 * Stage 执行顺序：
 * 1. LoadCampaignStage - 加载活动配置
 * 2. LoadOverrideStage - 加载干预配置
 * 3. OverrideExecuteStage - 执行干预逻辑
 * 4. DecisionSnapshotStage - 记录决策快照
 * 5. OverrideSettleStage - 干预结算
 *
 * @module services/UnifiedLotteryEngine/pipeline/OverridePipeline
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const PipelineRunner = require('./PipelineRunner')
const LoadCampaignStage = require('./stages/LoadCampaignStage')
// 以下 Stage 将在后续实现
// const LoadOverrideStage = require('./stages/LoadOverrideStage')
// const OverrideExecuteStage = require('./stages/OverrideExecuteStage')
// const DecisionSnapshotStage = require('./stages/DecisionSnapshotStage')
// const OverrideSettleStage = require('./stages/OverrideSettleStage')

/**
 * 管理干预管线
 */
class OverridePipeline extends PipelineRunner {
  /**
   * 创建管理干预管线实例
   *
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super('OverridePipeline', options)

    // 初始化 Stage
    this._initializeStages()
  }

  /**
   * 初始化 Stage
   *
   * @private
   */
  _initializeStages() {
    // 1. 加载活动配置
    this.addStage(new LoadCampaignStage())

    // TODO: 后续添加其他 Stage
    // 2. 加载干预配置
    // this.addStage(new LoadOverrideStage())

    // 3. 执行干预逻辑
    // this.addStage(new OverrideExecuteStage())

    // 4. 记录决策快照
    // this.addStage(new DecisionSnapshotStage())

    // 5. 干预结算
    // this.addStage(new OverrideSettleStage())
  }

  /**
   * 执行管理干预
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.override - 干预配置
   * @param {string} context.idempotency_key - 幂等键
   * @param {Object} context.transaction - 数据库事务（可选）
   * @returns {Promise<Object>} 执行结果
   */
  async run(context) {
    // 设置管线类型
    context.pipeline_type = 'override'

    // 验证干预配置
    if (!context.override) {
      throw new Error('OverridePipeline requires override in context')
    }

    // 调用父类的 run 方法
    return await super.run(context)
  }
}

module.exports = OverridePipeline

