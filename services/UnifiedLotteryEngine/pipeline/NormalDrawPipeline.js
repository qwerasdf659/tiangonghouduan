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
const {
  LoadCampaignStage,
  EligibilityStage,
  BudgetContextStage,
  BuildPrizePoolStage,
  GuaranteeStage,
  TierPickStage,
  PrizePickStage,
  DecisionSnapshotStage,
  SettleStage
} = require('./stages')

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
   * 执行顺序严格按照架构文档定义
   *
   * @returns {void}
   * @private
   */
  _initializeStages() {
    // 1. 加载活动配置 - 加载活动、奖品、档位规则
    this.addStage(new LoadCampaignStage())

    // 2. 检查用户资格 - 验证用户是否有权参与
    this.addStage(new EligibilityStage())

    // 3. 初始化预算上下文 - 根据预算模式创建 BudgetProvider
    this.addStage(new BudgetContextStage())

    // 4. 构建可用奖品池 - 过滤有库存且有效的奖品
    this.addStage(new BuildPrizePoolStage())

    // 5. 检查保底机制 - 判断是否触发保底
    this.addStage(new GuaranteeStage())

    // 6. 选择档位（tier_first模式）- 根据权重选择奖品档位
    this.addStage(new TierPickStage())

    // 7. 选择奖品 - 在选中档位内选择具体奖品
    this.addStage(new PrizePickStage())

    // 8. 记录决策快照 - 生成完整的决策审计数据
    this.addStage(new DecisionSnapshotStage())

    // 9. 结算（唯一写操作点）- 扣库存、扣预算、发奖品、记录
    this.addStage(new SettleStage())
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
