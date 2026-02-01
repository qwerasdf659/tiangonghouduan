'use strict'

/**
 * NormalDrawPipeline - 统一抽奖管线
 *
 * ⚠️ V4.6 Phase 5 重构（2026-01-19）：
 * - 原 3 条管线（Normal/Preset/Override）已合并为统一管线
 * - 决策来源由 LoadDecisionSourceStage 内部判断
 * - TierPickStage / PrizePickStage 根据决策来源自动跳过正常抽取逻辑
 *
 * 职责：
 * 1. 执行统一的抽奖流程（支持 normal/preset/override 三种决策来源）
 * 2. 支持 tier_first 选奖策略
 * 3. 支持保底机制
 * 4. 记录决策快照
 *
 * Stage 执行顺序（统一管线）：
 * 1. LoadCampaignStage - 加载活动配置
 * 2. EligibilityStage - 检查用户资格
 * 3. LoadDecisionSourceStage - 加载决策来源（normal/preset/override）
 * 4. BudgetContextStage - 初始化预算上下文
 * 5. PricingStage - 定价计算、draw_count 白名单校验
 * 6. BuildPrizePoolStage - 构建可用奖品池
 * 7. GuaranteeStage - 检查保底机制
 * 8. TierPickStage - 选择档位（根据决策来源决定是否跳过）
 * 9. PrizePickStage - 选择奖品（根据决策来源决定是否跳过）
 * 10. DecisionSnapshotStage - 记录决策快照
 * 11. SettleStage - 结算（唯一写操作点）
 *
 * @module services/UnifiedLotteryEngine/pipeline/NormalDrawPipeline
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 * @updated 2026-01-19 Phase 5 统一管线合并
 */

const PipelineRunner = require('./PipelineRunner')
const {
  LoadCampaignStage,
  EligibilityStage,
  LoadDecisionSourceStage,
  BudgetContextStage,
  PricingStage,
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
   * ⚠️ Phase 5 更新：增加 LoadDecisionSourceStage
   *
   * @returns {void}
   * @private
   */
  _initializeStages() {
    // 1. 加载活动配置 - 加载活动、奖品、档位规则
    this.addStage(new LoadCampaignStage())

    // 2. 检查用户资格 - 验证用户是否有权参与
    this.addStage(new EligibilityStage())

    // 3. 加载决策来源 - 判断 normal/preset/override（Phase 5 新增）
    this.addStage(new LoadDecisionSourceStage())

    // 4. 初始化预算上下文 - 根据预算模式创建 BudgetProvider
    this.addStage(new BudgetContextStage())

    // 5. 定价计算 - 计算抽奖费用、验证积分充足性、draw_count 白名单校验
    this.addStage(new PricingStage())

    // 6. 构建可用奖品池 - 过滤有库存且有效的奖品
    this.addStage(new BuildPrizePoolStage())

    // 7. 检查保底机制 - 判断是否触发保底
    this.addStage(new GuaranteeStage())

    /*
     * 8. 选择档位 - 根据决策来源决定是否执行正常抽取
     *    preset/override 模式：跳过正常抽取，使用预设/干预指定的档位
     *    normal 模式：执行正常的 tier_first 抽取
     */
    this.addStage(new TierPickStage())

    /*
     * 9. 选择奖品 - 根据决策来源决定是否执行正常抽取
     *    preset/override/guarantee 模式：直接使用指定奖品
     *    normal 模式：在选中档位内执行加权随机选择
     */
    this.addStage(new PrizePickStage())

    // 10. 记录决策快照 - 生成完整的决策审计数据
    this.addStage(new DecisionSnapshotStage())

    // 11. 结算（唯一写操作点）- 扣积分、扣库存、扣预算、发奖品、记录
    this.addStage(new SettleStage())
  }

  /**
   * 执行抽奖
   *
   * ⚠️ Phase 5 更新：
   * - pipeline_type 现在为 'unified'，表示统一管线
   * - 决策来源由 LoadDecisionSourceStage 在管线内部判断
   *
   * @param {Object} context - 抽奖上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {string} context.idempotency_key - 幂等键
   * @param {Object} context.transaction - 数据库事务（可选）
   * @returns {Promise<Object>} 抽奖结果
   */
  async run(context) {
    // 设置管线类型为统一管线
    context.pipeline_type = 'unified'

    // 调用父类的 run 方法
    return await super.run(context)
  }
}

module.exports = NormalDrawPipeline
