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
const { LoadCampaignStage, LoadOverrideStage, OverrideSettleStage } = require('./stages')

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
   * 执行顺序严格按照架构文档定义（管理干预流程）
   *
   * @returns {void}
   * @private
   */
  _initializeStages() {
    // 1. 加载活动配置 - 加载活动基本信息
    this.addStage(new LoadCampaignStage())

    // 2. 加载干预配置 - 验证干预类型和权限
    this.addStage(new LoadOverrideStage())

    /*
     * 3. 干预结算 - 执行干预逻辑、发奖品、记录决策
     * 注意：OverrideSettleStage 内部会创建决策记录
     */
    this.addStage(new OverrideSettleStage())
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
