'use strict'

/**
 * NormalDrawPipeline - 普通抽奖管线
 *
 * 职责：
 * 1. 执行标准的抽奖流程
 * 2. 支持 tier_first 选奖策略
 * 3. 支持保底机制
 * 4. 记录决策快照
 *
 * Stage 执行顺序：
 * 1. LoadCampaignStage - 加载活动配置
 * 2. EligibilityStage - 检查用户资格
 * 3. BudgetContextStage - 初始化预算上下文
 * 4. BuildPrizePoolStage - 构建可用奖品池
 * 5. GuaranteeStage - 检查保底机制
 * 6. TierPickStage - 选择档位（tier_first模式）
 * 7. PrizePickStage - 选择奖品
 * 8. DecisionSnapshotStage - 记录决策快照
 * 9. SettleStage - 结算（唯一写操作点）
 *
 * @module services/UnifiedLotteryEngine/pipeline/NormalDrawPipeline
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const PipelineRunner = require('./PipelineRunner')
const LoadCampaignStage = require('./stages/LoadCampaignStage')
// 以下 Stage 将在后续实现
// const EligibilityStage = require('./stages/EligibilityStage')
// const BudgetContextStage = require('./stages/BudgetContextStage')
// const BuildPrizePoolStage = require('./stages/BuildPrizePoolStage')
// const GuaranteeStage = require('./stages/GuaranteeStage')
// const TierPickStage = require('./stages/TierPickStage')
// const PrizePickStage = require('./stages/PrizePickStage')
// const DecisionSnapshotStage = require('./stages/DecisionSnapshotStage')
// const SettleStage = require('./stages/SettleStage')

/**
 * 普通抽奖管线
 */
class NormalDrawPipeline extends PipelineRunner {
  /**
   * 创建普通抽奖管线实例
   *
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super('NormalDrawPipeline', options)

    // 初始化 Stage（按执行顺序添加）
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
    // 2. 检查用户资格
    // this.addStage(new EligibilityStage())

    // 3. 初始化预算上下文
    // this.addStage(new BudgetContextStage())

    // 4. 构建可用奖品池
    // this.addStage(new BuildPrizePoolStage())

    // 5. 检查保底机制
    // this.addStage(new GuaranteeStage())

    // 6. 选择档位（tier_first模式）
    // this.addStage(new TierPickStage())

    // 7. 选择奖品
    // this.addStage(new PrizePickStage())

    // 8. 记录决策快照
    // this.addStage(new DecisionSnapshotStage())

    // 9. 结算（唯一写操作点）
    // this.addStage(new SettleStage())
  }

  /**
   * 执行抽奖
   *
   * @param {Object} context - 抽奖上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {string} context.idempotency_key - 幂等键
   * @param {Object} context.transaction - 数据库事务（可选）
   * @returns {Promise<Object>} 抽奖结果
   */
  async run(context) {
    // 设置管线类型
    context.pipeline_type = 'normal'

    // 调用父类的 run 方法
    return await super.run(context)
  }
}

module.exports = NormalDrawPipeline

