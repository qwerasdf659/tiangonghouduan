/**
 * 消费记录核心服务
 * V4.7.0 ConsumptionService 拆分（2026-01-31 大文件拆分方案 Phase 4）
 *
 * 职责：
 * - 商家提交消费记录（merchantSubmitConsumption）
 * - 管理员审核通过（approveConsumption）
 * - 管理员审核拒绝（rejectConsumption）
 * - 软删除记录（softDeleteRecord）
 * - 恢复已删除记录（restoreRecord）
 * - 获取预算分配系数（getBudgetRatio）
 *
 * @module services/consumption/CoreService
 */
const crypto = require('crypto')
const logger = require('../../utils/logger').logger
const BusinessError = require('../../utils/BusinessError')
const {
  ConsumptionRecord,
  ContentReviewRecord,
  User,
  StoreStaff,
  UserRatioOverride,
  UserGrowthLevel
} = require('../../models')
const BalanceService = require('../asset/BalanceService')
const AssetQueryService = require('../asset/QueryService') // 累计积分账本派生（拍板 4：users.history_total_points 冗余列已删除）
const ConsumptionBonusService = require('./BonusService') // 消费加成活动命中（方案C：多活动独立倍率，商家专属优先）
const BeijingTimeHelper = require('../../utils/timeHelper')
const OrderNoGenerator = require('../../utils/OrderNoGenerator')
const { generateConsumptionBusinessId } = require('../../utils/IdempotencyHelper')
const AuditLogService = require('../AuditLogService')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { AssetCode } = require('../../constants/AssetCode')
const AdminSystemService = require('../AdminSystemService')
const ContentAuditEngine = require('../ContentAuditEngine')
const EventBudgetService = require('../lottery/EventBudgetService')
const NotificationService = require('../NotificationService')

/**
 * 可用积分总倍数硬封顶（拍板⑮-(d)，2026-07-10 确认）
 *
 * 无论等级/活动加成如何叠加，消费发放的可用积分总额 ≤ 基础分 × 3.0
 * （例：消费 100 元最多到账 300 可用积分）。与抽奖 high≤8% 硬上限同款设计哲学：
 * 运营怎么配系统都兜底。与等级编辑接口的 earn_multiplier 上限 3.00 同值双保险。
 *
 * @constant {number}
 */
const EARN_MULTIPLIER_HARD_CAP = 3.0

/**
 * 预算积分注入率硬封顶（拍板⑮-(c)，2026-07-10 确认）
 *
 * 无论等级/活动加成如何叠加，预算账户注入 ≤ 消费金额 × 0.16（基准 8% 的 2 倍；
 * 例：消费 100 元预算账户最多 +16）。唯一例外 = 运营经管理端手动发放（不走本链路）。
 *
 * @constant {number}
 */
const BUDGET_INJECTION_RATE_HARD_CAP = 0.16

/**
 * 消费记录核心服务类
 * 负责消费记录的提交、审核、删除等核心业务逻辑
 *
 * @class CoreService
 */
class CoreService {
  /**
   * 商家提交消费记录（扫码后录入）
   *
   * 业务场景（Business Scenario）：
   * 1. 商家用管理APP扫描用户的积分卡二维码
   * 2. 录入本次消费金额（如88.50元）
   * 3. 系统自动创建消费记录 + pending积分交易 + 审核记录（三个操作原子性）
   * 4. 用户APP显示"冻结积分89分（待审核）"
   * 5. 管理员审核通过后，积分自动激活到账
   *
   * 技术特点（Technical Features）：
   * - ✅ 强制事务边界：必须由入口层传入事务（2026-01-05 治理决策）
   * - ✅ HMAC-SHA256验证QR码签名，防止伪造二维码攻击
   * - ✅ 3分钟防重复提交窗口，避免商家误操作多次点击
   * - ✅ 1元=1分的积分计算规则，四舍五入处理
   * - ✅ pending积分机制，用户可见但不可用（提升信任感）
   * - ✅ 完整的错误处理和日志记录（便于问题排查）
   *
   * @param {Object} data - 消费记录数据
   * @param {string} data.qr_code - 用户V2动态二维码字符串（必填）
   * @param {string} data.user_uuid - 用户UUID（由路由层验证二维码后提取）
   * @param {number} data.merchant_id - 商家ID（必填）
   * @param {number} data.consumption_amount - 消费金额，单位元（必填）
   * @param {string} data.idempotency_key - 幂等键（必填）
   * @param {number} [data.store_id] - 门店ID（Phase 2 后为必填）
   * @param {string} [data.merchant_notes] - 商家备注（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 消费记录对象
   */
  static async merchantSubmitConsumption(data, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'ConsumptionService.merchantSubmitConsumption'
    )

    logger.info('📊 开始处理商家消费记录提交（使用事务保护）...')
    // 安全记录提交数据
    const safeLogData = {
      qr_code: data.qr_code?.substring(0, 30) + '...',
      user_uuid: data.user_uuid ? data.user_uuid.substring(0, 8) + '...' : null,
      consumption_amount: data.consumption_amount,
      merchant_id: data.merchant_id,
      store_id: data.store_id,
      merchant_notes: data.merchant_notes,
      idempotency_key: data.idempotency_key
    }
    logger.info('📋 提交数据:', safeLogData)

    // 步骤1：契约校验 - 服务层合约
    if (!data.qr_code) {
      throw new BusinessError('二维码不能为空', 'MISSING_REQUIRED_PARAM', 400)
    }
    if (!data.consumption_amount || data.consumption_amount <= 0) {
      throw new BusinessError('消费金额必须大于0', 'CONSUMPTION_INVALID_AMOUNT', 400, {
        received_amount: data.consumption_amount
      })
    }
    if (data.consumption_amount > 99999.99) {
      throw new BusinessError(
        '消费金额超过上限（99999.99元）',
        'CONSUMPTION_AMOUNT_EXCEEDED',
        400,
        { received_amount: data.consumption_amount, max_amount: 99999.99 }
      )
    }
    if (!data.merchant_id) {
      throw new BusinessError('商家ID不能为空', 'MISSING_REQUIRED_PARAM', 400)
    }
    if (!data.idempotency_key) {
      throw new BusinessError(
        '缺少幂等键：idempotency_key 必须由调用方提供',
        'CONSUMPTION_MISSING_IDEMPOTENCY_KEY',
        400
      )
    }

    // 步骤2：契约断言 - user_uuid 必须由路由层验证后传入
    const userUuid = data.user_uuid
    if (!userUuid) {
      throw new BusinessError(
        'user_uuid 必须由路由层验证二维码后传入（服务层契约）',
        'CONSUMPTION_MISSING_USER_UUID',
        400,
        { received_data_keys: Object.keys(data) }
      )
    }

    // 步骤3：根据UUID查找用户
    const user = await User.findOne({
      where: { user_uuid: userUuid },
      transaction
    })

    if (!user) {
      throw new BusinessError('用户不存在', 'CONSUMPTION_USER_NOT_FOUND', 404, {
        user_uuid: userUuid.substring(0, 8) + '...'
      })
    }

    const userId = user.user_id

    // 步骤4-5：幂等性检查
    const idempotency_key = data.idempotency_key
    logger.info(`使用传入的幂等键: ${idempotency_key}`)

    const existingRecord = await ConsumptionRecord.findOne({
      where: { idempotency_key },
      transaction
    })

    if (existingRecord) {
      logger.info(`⚠️ 幂等性检查: idempotency_key=${idempotency_key}已存在，返回已有记录（幂等）`)
      return {
        success: true,
        message: '消费记录已存在（幂等保护）',
        is_duplicate: true,
        record: existingRecord
      }
    }

    // 步骤6：计算奖励基础积分（可配置比例，提交时锁定，保证用户承诺一致）
    const pointsRatio = await CoreService.getEffectiveRatio(
      data.user_id,
      'points_award_ratio',
      await AdminSystemService.getSettingValue('points', 'points_award_ratio', 1.0)
    )
    const pointsToAward = Math.round(parseFloat(data.consumption_amount) * pointsRatio)

    /*
     * 步骤6.1：等级发放倍数提交时锁定（拍板⑬-(a) / §2.4-5，2026-07-10）
     * - 与 points_award_ratio 同点位锁定：小票提交时点派生用户成长等级，
     *   锁定 level_key_locked + earn_multiplier_locked 随消费记录落表；
     * - 审核发分按锁定值执行，审核快慢不影响到账金额（用户承诺一致）；
     * - 无启用等级（等级体系未配置）时按 1.00 锁定，行为与基准完全一致。
     * - 累计积分由资产账本实时派生（拍板 4：users.history_total_points 冗余列已删除），
     *   事务内直查账本保证一致性。
     */
    const userHistoryPoints = await AssetQueryService.getHistoryTotalPoints(userId, {
      transaction
    })
    const lockedLevel = await UserGrowthLevel.resolveLevel(userHistoryPoints, {
      transaction
    })
    const levelKeyLocked = lockedLevel ? lockedLevel.level_key : null
    const earnMultiplierLocked = lockedLevel ? Number(lockedLevel.earn_multiplier) || 1.0 : 1.0

    // 业务唯一键：consume_{merchant_id}_{user_id}_{timestamp_ms}
    const business_id = generateConsumptionBusinessId(data.merchant_id, userId, Date.now())
    const placeholder_cs = `PH${crypto.randomBytes(12).toString('hex').toUpperCase()}`

    // 步骤6.5：处理 store_id（活动命中依赖门店/商家，须在活动锁定前确定）
    let storeId = data.store_id
    if (!storeId) {
      const merchantStores = await StoreStaff.findAll({
        where: {
          user_id: data.merchant_id,
          status: 'active'
        },
        attributes: ['store_id'],
        transaction
      })

      if (merchantStores.length === 1) {
        storeId = merchantStores[0].store_id
        logger.info(`✅ 自动填充 store_id: ${storeId}（商家仅关联一个门店）`)
      } else if (merchantStores.length > 1) {
        logger.warn(
          `⚠️ 商家关联 ${merchantStores.length} 个门店但未指定 store_id，消费记录将缺少门店信息`
        )
      } else {
        logger.warn(`⚠️ 商家 ${data.merchant_id} 未关联任何门店，消费记录将缺少门店信息`)
      }
    }

    /*
     * 步骤6.6：活动加成率提交时锁定（消费加成活动·方案C，2026-07-15）
     * - 按门店/商家/时间窗自动命中消费加成活动（ConsumptionBonusService，商家专属优先），
     *   命中的 bonus_rate 锁定随消费记录落表——活动启停/调率不影响已提交小票（用户承诺一致）；
     * - 须在 store_id 确定后执行（命中判定依赖门店/商家）；
     * - 发放侧独立成 activity_bonus_reward 笔（加法叠加、不计 history_total_points），逻辑不变。
     */
    const { bonus_rate: activityBonusRate } =
      await ConsumptionBonusService.resolveConsumptionBonusRate({
        store_id: storeId || null,
        merchant_id: data.merchant_id,
        now: BeijingTimeHelper.createBeijingTime(),
        transaction
      })
    const activityBonusRateLocked =
      Number.isFinite(activityBonusRate) && activityBonusRate > 0
        ? Math.min(activityBonusRate, EARN_MULTIPLIER_HARD_CAP - 1)
        : null

    // 步骤7：创建消费记录
    const consumptionRecord = await ConsumptionRecord.create(
      {
        business_id,
        user_id: userId,
        merchant_id: data.merchant_id,
        store_id: storeId || null,
        consumption_amount: data.consumption_amount,
        points_to_award: pointsToAward,
        level_key_locked: levelKeyLocked,
        earn_multiplier_locked: earnMultiplierLocked,
        activity_bonus_rate_locked: activityBonusRateLocked,
        status: 'pending',
        qr_code: data.qr_code,
        idempotency_key,
        order_no: placeholder_cs,
        merchant_notes: data.merchant_notes || null,
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )
    await consumptionRecord.update(
      {
        order_no: OrderNoGenerator.generate(
          'CS',
          consumptionRecord.consumption_record_id,
          consumptionRecord.createdAt || consumptionRecord.created_at
        )
      },
      { transaction }
    )
    await consumptionRecord.reload({ transaction })

    logger.info(
      `✅ 消费记录创建成功 (ID: ${consumptionRecord.consumption_record_id}, idempotency_key: ${idempotency_key})`
    )

    // 步骤9：通过 ContentAuditEngine 统一创建审核记录（含审核链匹配）
    await ContentAuditEngine.submitForAudit(
      'consumption',
      consumptionRecord.consumption_record_id,
      {
        auditData: {
          consumption_amount: data.consumption_amount,
          merchant_id: data.merchant_id,
          store_id: storeId || null,
          submitted_by: data.merchant_id,
          operator_id: data.merchant_id
        },
        transaction
      }
    )

    logger.info('✅ 审核记录创建成功（含审核链匹配）')
    logger.info('🎉 消费记录处理完成，等待入口层提交事务')

    logger.info(
      `✅ 消费记录完整创建: consumption_record_id=${consumptionRecord.consumption_record_id}, user_id=${userId}, amount=${data.consumption_amount}元, pending_points=${pointsToAward}分`
    )

    return consumptionRecord
  }

  /**
   * 消费审核通过的发放组合器（拍板②⑮ / §2.4，2026-07-10 唯一发放收口）
   *
   * 组合器结构 = 基础笔 + N 个加成笔（同事务多笔流水）：
   * - 基础笔：points_to_award（business_type='consumption_reward'，计入 history_total_points，驱动等级）
   * - 等级加成笔：round(基础 × (earn_multiplier_locked - 1))（business_type='level_bonus_reward'，
   *   不计 history_total_points——BalanceService 排除名单防复利）
   * - 未来活动加成笔：business_type='activity_bonus_reward'，向 _buildBonusRules 追加规则即插即用，
   *   各加成独立按基础分计算（加法叠加，禁止乘法叠加）
   * - 硬封顶：可用积分总倍数 ≤ 3.0（EARN_MULTIPLIER_HARD_CAP）；预算注入率 ≤ 16%（BUDGET_INJECTION_RATE_HARD_CAP）
   * - 预算笔：round(消费金额 × budget_ratio × 总倍数) 封顶后入预算桶（含活动归集判定）
   * - 星石配额笔：floor(消费金额 × star_stone_quota_ratio × 总倍数)（2026-07-16 拍板①A/②A：
   *   与预算笔同口径复用总倍数——含等级+活动加成，仅受总倍数硬顶 3.0 约束，无额外注入率封顶）
   * - 升级即时通知（拍板⑬-(d)）：发分前后两次派生等级，跨档则在事务提交后（transaction.afterCommit）
   *   经 NotificationService 发站内通知——通知失败不影响发分（工程加固 §9-1）
   *
   * 调用方：approveConsumption（管理员直审复用）与 ConsumptionAuditCallback（审核链终审回调）。
   *
   * @param {Object} record - 消费记录实例（已加锁的 ConsumptionRecord）
   * @param {Object} settleData - 结算数据
   * @param {number} settleData.operator_id - 操作人ID（审核员）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 发放结果 { reward_transaction_id, points_awarded, level_bonus_points, budget_points_allocated, star_stone_quota_allocated, level_upgrade, new_balance }
   */
  static async settleApprovedConsumption(record, settleData, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'ConsumptionService.settleApprovedConsumption'
    )
    const recordId = record.consumption_record_id
    const operatorId = settleData.operator_id

    const mintAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_MINT' },
      { transaction }
    )

    /*
     * 升级检测基准（拍板⑬-(d)）：发分前先记录用户当前等级。
     * 累计积分由资产账本实时派生（拍板 4），事务内直查账本 + 等级表（保证事务一致性）。
     */
    const historyPointsBefore = await AssetQueryService.getHistoryTotalPoints(record.user_id, {
      transaction
    })
    const levelKeyBefore = await UserGrowthLevel.resolveLevelKey(historyPointsBefore, {
      transaction
    })

    // ── 1. 基础笔（计入累计积分派生口径，驱动等级）─────────────────
    // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
    const pointsResult = await BalanceService.changeBalance(
      {
        user_id: record.user_id,
        asset_code: AssetCode.POINTS,
        delta_amount: record.points_to_award,
        business_type: 'consumption_reward',
        idempotency_key: `consumption_reward:approve:${recordId}`,
        counterpart_account_id: mintAccount.account_id,
        meta: {
          reference_type: 'consumption',
          reference_id: recordId,
          title: `消费奖励${record.points_to_award}分`,
          description: `【审核通过】消费${record.consumption_amount}元，奖励${record.points_to_award}积分`,
          operator_id: operatorId
        }
      },
      { transaction }
    )

    logger.info(
      `✅ 基础积分发放成功: user_id=${record.user_id}, 积分=${record.points_to_award}, 幂等=${pointsResult.is_duplicate ? '重复' : '新增'}`
    )

    // BalanceService 返回的是 asset_transaction_id（用于消费记录对账关联）
    const rewardTransactionId = pointsResult.transaction_record?.asset_transaction_id || null
    if (!rewardTransactionId) {
      throw new BusinessError(
        '积分发放成功但未获取到流水ID，无法完成审核',
        'CONSUMPTION_ERROR',
        400
      )
    }

    // ── 2. 加成笔（发放组合器规则列表，拍板⑮-(e)）─────────────────────
    const bonusRules = CoreService._buildBonusRules(record)
    let levelBonusPoints = 0
    // 总倍数 = 1 + Σ 各加成率（加法叠加），硬封顶 3.0（拍板⑮-(d)）
    const totalMultiplier = Math.min(
      1 + bonusRules.reduce((sum, r) => sum + r.rate, 0),
      EARN_MULTIPLIER_HARD_CAP
    )
    for (const rule of bonusRules) {
      const bonusAmount = rule.amount
      if (bonusAmount <= 0) continue
      // 同一事务内的顺序写：禁止 Promise.all（事务内并发写冲突）
      // eslint-disable-next-line no-restricted-syntax, no-await-in-loop -- 已传递 transaction；事务内串行
      const bonusResult = await BalanceService.changeBalance(
        {
          user_id: record.user_id,
          asset_code: AssetCode.POINTS,
          delta_amount: bonusAmount,
          business_type: rule.business_type,
          idempotency_key: `${rule.business_type}:approve:${recordId}`,
          counterpart_account_id: mintAccount.account_id,
          meta: {
            reference_type: 'consumption',
            reference_id: recordId,
            title: rule.title,
            description: rule.description,
            level_key_locked: record.level_key_locked || null,
            earn_multiplier_locked: record.earn_multiplier_locked || null,
            activity_bonus_rate_locked: record.activity_bonus_rate_locked || null,
            operator_id: operatorId
          }
        },
        { transaction }
      )
      if (rule.business_type === 'level_bonus_reward') {
        levelBonusPoints = bonusAmount
      }
      logger.info(
        `✅ 加成积分发放成功: user_id=${record.user_id}, 类型=${rule.business_type}, 积分=${bonusAmount}, 幂等=${bonusResult.is_duplicate ? '重复' : '新增'}`
      )
    }

    // ── 3. 预算笔（含等级倍数放大 + 16% 注入率硬封顶 + 活动归集判定）────
    const globalBudgetRatio = await CoreService.getBudgetRatio()
    const budgetRatio = await CoreService.getEffectiveRatio(
      record.user_id,
      'budget_allocation_ratio',
      globalBudgetRatio
    )
    /*
     * 预算积分同步放大（拍板②-(b)）：round(消费金额 × budget_ratio × 总倍数)，
     * 注入率硬封顶 16%（拍板⑮-(c)，运营经管理端手动发放不走本链路故不受限）。
     * 预算变厚 → 预算分层升档 → 现有 BxPx 闸门自然放行更高奖品档位。
     */
    const amountNumber = parseFloat(record.consumption_amount)
    const budgetPointsToAllocate = Math.min(
      Math.round(amountNumber * budgetRatio * totalMultiplier),
      Math.round(amountNumber * BUDGET_INJECTION_RATE_HARD_CAP)
    )

    logger.info(
      `💰 预算分配: 消费${record.consumption_amount}元 × ${budgetRatio} × 倍数${totalMultiplier} = ${budgetPointsToAllocate}积分（注入率封顶${BUDGET_INJECTION_RATE_HARD_CAP}）`
    )

    if (budgetPointsToAllocate > 0) {
      /*
       * 活动预算归集判定（水晶奖品倍率活动设计方案 §12.10 / §18.4 防囤积套利）：
       * - 命中活动归集规则 → 预算全额重定向进该活动专属桶 EVENT_<活动code>（防7 全量重定向），
       *   并按规则比率同步发放活动积分 event_points（可见层入场代币，§12.7 双层货币）。
       * - 未命中 → 维持全局桶 CONSUMPTION_DEFAULT（常驻活动/日常消费不受影响）。
       * 归集去向由后端规则自动判定，小程序/商家端无人工选择口（防9）。
       */
      const collectionTarget = await EventBudgetService.resolveCollectionTarget({
        store_id: record.store_id,
        merchant_id: record.merchant_id,
        transaction
      })
      const budgetBucketKey = collectionTarget ? collectionTarget.bucket_key : 'CONSUMPTION_DEFAULT'

      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
      const budgetResult = await BalanceService.changeBalance(
        {
          user_id: record.user_id,
          asset_code: AssetCode.BUDGET_POINTS,
          delta_amount: budgetPointsToAllocate,
          business_type: 'consumption_budget_allocation',
          idempotency_key: `consumption_budget:approve:${recordId}`,
          lottery_campaign_id: budgetBucketKey,
          counterpart_account_id: mintAccount.account_id,
          meta: {
            reference_type: 'consumption',
            reference_id: recordId,
            consumption_amount: record.consumption_amount,
            budget_ratio: budgetRatio,
            earn_multiplier_applied: totalMultiplier,
            ...(collectionTarget
              ? {
                  collection_rule_id: Number(collectionTarget.rule.collection_rule_id),
                  event_campaign_id: collectionTarget.campaign.lottery_campaign_id
                }
              : {}),
            description: `消费${record.consumption_amount}元，分配预算积分${budgetPointsToAllocate}（桶：${budgetBucketKey}）`
          }
        },
        { transaction }
      )

      logger.info(
        `💰 预算分配成功: user_id=${record.user_id}, 预算积分=${budgetPointsToAllocate}, lottery_campaign_id=${budgetBucketKey}, 幂等=${budgetResult.is_duplicate ? '重复' : '新增'}`
      )

      // 命中归集规则时同步发放活动积分 event_points（可见层入场代币，按活动分桶，到期清零）
      if (collectionTarget && collectionTarget.event_points_ratio > 0) {
        const eventPointsToIssue = Math.round(amountNumber * collectionTarget.event_points_ratio)
        if (eventPointsToIssue > 0) {
          // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
          const eventPointsResult = await BalanceService.changeBalance(
            {
              user_id: record.user_id,
              asset_code: AssetCode.EVENT_POINTS,
              delta_amount: eventPointsToIssue,
              business_type: 'consumption_event_points_allocation',
              idempotency_key: `consumption_event_points:approve:${recordId}`,
              lottery_campaign_id: budgetBucketKey,
              counterpart_account_id: mintAccount.account_id,
              meta: {
                reference_type: 'consumption',
                reference_id: recordId,
                consumption_amount: record.consumption_amount,
                event_points_ratio: collectionTarget.event_points_ratio,
                collection_rule_id: Number(collectionTarget.rule.collection_rule_id),
                event_campaign_id: collectionTarget.campaign.lottery_campaign_id,
                description: `活动"${collectionTarget.campaign.campaign_name}"期间消费${record.consumption_amount}元，获得活动积分${eventPointsToIssue}`
              }
            },
            { transaction }
          )

          logger.info(
            `🎪 活动积分发放成功: user_id=${record.user_id}, event_points=${eventPointsToIssue}, 桶=${budgetBucketKey}, 幂等=${eventPointsResult.is_duplicate ? '重复' : '新增'}`
          )
        }
      }
    }

    // ── 4. 星石配额（随等级/活动倍数放大，与预算笔同口径 totalMultiplier）──
    /*
     * 星石配额发放公式（2026-07-16 拍板①A/②A）：
     *   星石配额 = floor(消费金额 × star_stone_quota_ratio × totalMultiplier)
     * - star_stone_quota_ratio：个人覆盖优先，其次全局默认（getEffectiveRatio）
     * - totalMultiplier：复用第 2 步已算好的总倍数 = min(1 + Σ加成率, 3.0)，
     *   含等级倍率（earn_multiplier_locked）+ 活动加成，与预算积分完全同一套口径；
     *   历史 earn_multiplier_locked 为 NULL 的存量记录 → _buildBonusRules 按 1.00 处理，
     *   即 totalMultiplier=1.0，行为与放大前一致（不影响存量）。
     * - 封顶：仅受总倍数硬顶 3.0 约束（拍板②A：星石配额是兑换额度非抽奖预算，不加额外注入率封顶）。
     */
    let starStoneQuotaAllocated = 0
    try {
      const quotaConfig = await CoreService._getStarStoneQuotaConfig()
      if (quotaConfig.enabled) {
        const effectiveRatio = await CoreService.getEffectiveRatio(
          record.user_id,
          'star_stone_quota_ratio',
          quotaConfig.ratio
        )
        const quotaAmount = Math.floor(amountNumber * effectiveRatio * totalMultiplier)
        if (quotaAmount > 0) {
          // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
          const quotaResult = await BalanceService.changeBalance(
            {
              user_id: record.user_id,
              asset_code: 'STAR_STONE_QUOTA',
              delta_amount: quotaAmount,
              business_type: 'consumption_quota_allocation',
              idempotency_key: `consumption_quota:approve:${recordId}`,
              counterpart_account_id: mintAccount.account_id,
              meta: {
                reference_type: 'consumption',
                reference_id: recordId,
                consumption_amount: record.consumption_amount,
                quota_ratio: effectiveRatio,
                earn_multiplier_applied: totalMultiplier,
                description: `消费${record.consumption_amount}元，按${totalMultiplier}倍发放星石配额${quotaAmount}`
              }
            },
            { transaction }
          )

          starStoneQuotaAllocated = quotaAmount
          logger.info(
            `💎 星石配额发放成功: user_id=${record.user_id}, 配额=${quotaAmount}, 幂等=${quotaResult.is_duplicate ? '重复' : '新增'}`
          )
        }
      }
    } catch (quotaError) {
      logger.error(`[ConsumptionService] 星石配额发放失败（非致命）: ${quotaError.message}`)
    }

    // ── 5. 升级检测 + 事务提交后通知（拍板⑬-(d) / 工程加固 §9-1）───────
    const levelUpgrade = await CoreService._detectLevelUpgrade(record.user_id, levelKeyBefore, {
      transaction
    })
    if (levelUpgrade) {
      /*
       * NotificationService.send 必须在事务提交后调用（transaction.afterCommit 仅在
       * COMMIT 成功后触发）：通知失败不回滚发分，发分回滚也不会误发"恭喜升级"。
       * send 内部已捕获自身异常，不会向外抛错。
       */
      transaction.afterCommit(() => {
        NotificationService.send(record.user_id, {
          type: 'growth_level_upgrade',
          title: '🎉 会员等级升级',
          content: `恭喜升级${levelUpgrade.to_level_name}，您的积分回馈已提升至 ${levelUpgrade.to_earn_multiplier} 倍`,
          data: {
            from_level_key: levelUpgrade.from_level_key,
            to_level_key: levelUpgrade.to_level_key,
            to_level_name: levelUpgrade.to_level_name,
            to_earn_multiplier: levelUpgrade.to_earn_multiplier,
            consumption_record_id: recordId
          }
        })
      })
    }

    return {
      reward_transaction_id: rewardTransactionId,
      points_awarded: record.points_to_award,
      level_bonus_points: levelBonusPoints,
      budget_points_allocated: budgetPointsToAllocate,
      star_stone_quota_allocated: starStoneQuotaAllocated,
      level_upgrade: levelUpgrade,
      new_balance: pointsResult.new_balance,
      reward_transaction: pointsResult.transaction
    }
  }

  /**
   * 构建加成规则列表（发放组合器的可插拔规则，拍板⑮-(e)）
   *
   * 当前规则（按序应用，加法叠加）：
   * 1. 等级加成（发放线九档阶梯，倍数取提交时锁定值 earn_multiplier_locked）；
   * 2. 活动加成（消费加成活动·方案C，2026-07-15：加成率取提交时锁定值 activity_bonus_rate_locked，
   *    由 consumption_bonus_rules 按门店/商家/时间命中活动锁定，商家专属优先，0/NULL=无活动）。
   *
   * 硬封顶（拍板⑮-(d)）：可用积分总倍数 = 1 + Σ 加成率 ≤ 3.0（EARN_MULTIPLIER_HARD_CAP）——
   * 按规则顺序对后续规则的加成率做"剩余空间截断"（等级优先、活动让位），
   * 运营怎么配系统都兜底；各加成独立按基础分计算、各自独立成笔，禁止乘法叠加。
   *
   * @param {Object} record - 消费记录实例
   * @returns {Array<{business_type: string, rate: number, amount: number, title: string, description: string}>} 加成规则列表
   * @private
   */
  static _buildBonusRules(record) {
    const rules = []
    const basePoints = Number(record.points_to_award) || 0
    // 加成率剩余空间（总倍数封顶 3.0 → 加成率合计封顶 2.0），按规则顺序消耗
    let rateHeadroom = EARN_MULTIPLIER_HARD_CAP - 1

    // 规则1：等级加成（提交时锁定倍数，NULL=存量记录按 1.00 → 加成率 0 → 无加成笔）
    const lockedMultiplier = Math.min(
      Number(record.earn_multiplier_locked) || 1.0,
      EARN_MULTIPLIER_HARD_CAP
    )
    const levelBonusRate = Math.min(Math.max(0, lockedMultiplier - 1), rateHeadroom)
    rateHeadroom -= levelBonusRate
    if (levelBonusRate > 0 && basePoints > 0) {
      const bonusAmount = Math.round(basePoints * levelBonusRate)
      rules.push({
        business_type: 'level_bonus_reward',
        rate: levelBonusRate,
        amount: bonusAmount,
        title: `会员等级加成${bonusAmount}分`,
        description: `【会员权益】等级发放倍数 ${lockedMultiplier}，消费${record.consumption_amount}元额外加成${bonusAmount}积分`
      })
    }

    // 规则2：活动加成（提交时锁定加成率，NULL/0=无活动；超出剩余空间部分截断）
    const activityBonusRate = Math.min(
      Math.max(0, Number(record.activity_bonus_rate_locked) || 0),
      rateHeadroom
    )
    rateHeadroom -= activityBonusRate
    if (activityBonusRate > 0 && basePoints > 0) {
      const bonusAmount = Math.round(basePoints * activityBonusRate)
      rules.push({
        business_type: 'activity_bonus_reward',
        rate: activityBonusRate,
        amount: bonusAmount,
        title: `活动加成${bonusAmount}分`,
        description: `【限时活动】活动加成率 ${activityBonusRate}，消费${record.consumption_amount}元额外加成${bonusAmount}积分`
      })
    }

    return rules
  }

  /**
   * 升级检测（发分后对比等级，拍板⑬-(d)）
   *
   * 等级实时派生无升级事件，审核发分是唯一可靠触达点：
   * 基础笔流水已在同事务内落账，事务内重新派生累计积分（拍板 4：账本直查）即为"发分后"值。
   *
   * @param {number} user_id - 用户ID
   * @param {string|null} levelKeyBefore - 发分前等级码
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object|null>} 跨档时返回 { from_level_key, to_level_key, to_level_name, to_earn_multiplier }，未跨档返回 null
   * @private
   */
  static async _detectLevelUpgrade(user_id, levelKeyBefore, options = {}) {
    const { transaction } = options
    const historyPointsAfter = await AssetQueryService.getHistoryTotalPoints(user_id, {
      transaction
    })

    const levelAfter = await UserGrowthLevel.resolveLevel(historyPointsAfter, {
      transaction
    })
    if (!levelAfter || levelAfter.level_key === levelKeyBefore) return null

    return {
      from_level_key: levelKeyBefore,
      to_level_key: levelAfter.level_key,
      to_level_name: levelAfter.level_name,
      to_earn_multiplier: Number(levelAfter.earn_multiplier) || 1.0
    }
  }

  /**
   * 管理员审核消费记录（通过）
   *
   * 发放逻辑统一收口 settleApprovedConsumption（发放组合器）；
   * 本方法负责：记录加锁校验 → 组合器发放 → 消费记录/审核记录状态更新 → 审计日志。
   * 审核链终审回调（ConsumptionAuditCallback）同样委托本方法，全库仅此一条发放路径。
   *
   * @param {number} recordId - 消费记录ID
   * @param {Object} reviewData - 审核数据
   * @param {number} reviewData.reviewer_id - 审核员ID
   * @param {string} reviewData.admin_notes - 审核备注（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {Object} [options.review_record] - 审核记录实例（审核链回调传入，避免重查）
   * @returns {Promise<Object>} 审核结果
   */
  static async approveConsumption(recordId, reviewData, options = {}) {
    // 强制要求事务边界
    const transaction = assertAndGetTransaction(options, 'ConsumptionService.approveConsumption')

    // 1. 查询消费记录（加锁防止并发）
    const record = await ConsumptionRecord.findByPk(recordId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!record) {
      throw new BusinessError(`消费记录不存在（ID: ${recordId}）`, 'CONSUMPTION_NOT_FOUND', 404)
    }

    // 2. 检查是否可以审核
    const canReview = record.canBeReviewed()
    if (!canReview.can_review) {
      throw new BusinessError(
        `不能审核：${canReview.reasons.join('；')}`,
        'CONSUMPTION_NOT_ALLOWED',
        400
      )
    }

    // 3. 发放组合器：基础笔 + 等级加成笔 + 预算笔（封顶） + 星石配额 + 升级通知
    const settlement = await CoreService.settleApprovedConsumption(
      record,
      { operator_id: reviewData.reviewer_id },
      { transaction }
    )

    // 4. 更新消费记录状态
    await record.update(
      {
        status: 'approved',
        reviewed_by: reviewData.reviewer_id,
        reviewed_at: BeijingTimeHelper.createDatabaseTime(),
        admin_notes: reviewData.admin_notes || null,
        reward_transaction_id: settlement.reward_transaction_id,
        settled_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 5. 更新审核记录表（审核链回调路径下引擎已更新，此处为同值幂等写）
    const reviewRecord =
      options.review_record ||
      (await ContentReviewRecord.findOne({
        where: {
          auditable_type: 'consumption',
          auditable_id: recordId
        },
        transaction
      }))

    if (!reviewRecord) {
      throw new BusinessError(
        `审核记录不存在: consumption_id=${recordId}`,
        'CONSUMPTION_NOT_FOUND',
        404
      )
    }

    await reviewRecord.update(
      {
        audit_status: 'approved',
        auditor_id: reviewData.reviewer_id,
        audit_reason: reviewData.admin_notes || '审核通过',
        audited_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 6. 记录审计日志
    try {
      await AuditLogService.logOperation({
        operator_id: reviewData.reviewer_id,
        operation_type: 'consumption_audit',
        target_type: 'ContentReviewRecord',
        target_id: reviewRecord.content_review_record_id,
        action: 'approve',
        changes: {
          audit_status: 'approved',
          points_awarded: record.points_to_award,
          level_bonus_points: settlement.level_bonus_points
        },
        details: {
          consumption_record_id: recordId,
          amount: record.consumption_amount,
          points_to_award: record.points_to_award,
          level_key_locked: record.level_key_locked,
          level_bonus_points: settlement.level_bonus_points,
          budget_points_allocated: settlement.budget_points_allocated,
          star_stone_quota_allocated: settlement.star_stone_quota_allocated
        },
        reason: reviewData.admin_notes || '审核通过',
        idempotency_key: `consumption_audit:approve:${reviewRecord.content_review_record_id}`,
        transaction
      })
    } catch (auditError) {
      logger.error('[ConsumptionService] 审计日志记录失败:', auditError.message)
    }

    logger.info(
      `✅ 消费记录审核通过: record_id=${recordId}, 基础积分=${record.points_to_award}, 等级加成=${settlement.level_bonus_points}, 预算积分=${settlement.budget_points_allocated}, 星石配额=${settlement.star_stone_quota_allocated}`
    )

    return {
      consumption_record: record,
      reward_transaction: settlement.reward_transaction,
      points_awarded: settlement.points_awarded,
      level_bonus_points: settlement.level_bonus_points,
      budget_points_allocated: settlement.budget_points_allocated,
      star_stone_quota_allocated: settlement.star_stone_quota_allocated,
      level_upgrade: settlement.level_upgrade,
      new_balance: settlement.new_balance
    }
  }

  /**
   * 管理员审核消费记录（拒绝）
   *
   * @param {number} recordId - 消费记录ID
   * @param {Object} reviewData - 审核数据
   * @param {number} reviewData.reviewer_id - 审核员ID
   * @param {string} reviewData.admin_notes - 拒绝原因（必填）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {Object} [options.review_record] - 审核记录实例（审核链回调传入，避免重查）
   * @returns {Promise<Object>} 审核结果
   */
  static async rejectConsumption(recordId, reviewData, options = {}) {
    // 强制要求事务边界
    const transaction = assertAndGetTransaction(options, 'ConsumptionService.rejectConsumption')

    // 1. 验证拒绝原因
    if (!reviewData.admin_notes) {
      throw new BusinessError('拒绝原因不能为空', 'CONSUMPTION_NOT_ALLOWED', 400)
    }

    // 2. 查询消费记录
    const record = await ConsumptionRecord.findByPk(recordId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!record) {
      throw new BusinessError(`消费记录不存在（ID: ${recordId}）`, 'CONSUMPTION_NOT_FOUND', 404)
    }

    // 3. 检查是否可以审核
    const canReview = record.canBeReviewed()
    if (!canReview.can_review) {
      throw new BusinessError(
        `不能审核：${canReview.reasons.join('；')}`,
        'CONSUMPTION_NOT_ALLOWED',
        400
      )
    }

    // 4. 更新消费记录状态
    await record.update(
      {
        status: 'rejected',
        reviewed_by: reviewData.reviewer_id,
        reviewed_at: BeijingTimeHelper.createDatabaseTime(),
        admin_notes: reviewData.admin_notes,
        settled_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 5. 更新审核记录表（审核链回调路径下引擎已更新，此处为同值幂等写）
    const reviewRecord =
      options.review_record ||
      (await ContentReviewRecord.findOne({
        where: {
          auditable_type: 'consumption',
          auditable_id: recordId
        },
        transaction
      }))

    if (!reviewRecord) {
      throw new BusinessError(
        `审核记录不存在: consumption_id=${recordId}`,
        'CONSUMPTION_NOT_FOUND',
        404
      )
    }

    await reviewRecord.update(
      {
        audit_status: 'rejected',
        auditor_id: reviewData.reviewer_id,
        audit_reason: reviewData.admin_notes,
        audited_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 6. 记录审计日志
    try {
      await AuditLogService.logOperation({
        operator_id: reviewData.reviewer_id,
        operation_type: 'consumption_audit',
        target_type: 'ContentReviewRecord',
        target_id: reviewRecord.content_review_record_id,
        action: 'reject',
        changes: {
          audit_status: 'rejected'
        },
        details: {
          consumption_record_id: recordId,
          amount: record.consumption_amount,
          reject_reason: reviewData.admin_notes
        },
        reason: reviewData.admin_notes,
        idempotency_key: `consumption_audit:reject:${reviewRecord.content_review_record_id}`,
        transaction
      })
    } catch (auditError) {
      logger.error('[ConsumptionService] 审计日志记录失败:', auditError.message)
    }

    logger.info(`✅ 消费记录审核拒绝: record_id=${recordId}, 原因=${reviewData.admin_notes}`)

    return {
      consumption_record: record,
      reject_reason: reviewData.admin_notes
    }
  }

  /**
   * 软删除消费记录（Soft Delete Consumption Record）
   *
   * @param {number} recordId - 消费记录ID
   * @param {number} userId - 操作用户ID（用于权限验证）
   * @param {Object} options - 选项
   * @param {boolean} [options.has_admin_access=false] - 是否具有管理员访问权限
   * @param {number} [options.role_level=0] - 用户角色级别
   * @param {Object} [options.transaction] - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 删除结果
   */
  static async softDeleteRecord(recordId, userId, options = {}) {
    const { has_admin_access = false, role_level = 0, transaction } = options

    logger.info('软删除消费记录', { record_id: recordId, user_id: userId, has_admin_access })

    // 查询记录
    const record = await ConsumptionRecord.findByPk(recordId, {
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined
    })

    if (!record) {
      throw new BusinessError('消费记录不存在', 'CONSUMPTION_NOT_FOUND', 404)
    }

    // 权限检查
    if (!has_admin_access && record.user_id !== userId) {
      throw new BusinessError('无权删除此消费记录', 'CONSUMPTION_ERROR', 400)
    }

    // 状态检查：普通用户只能删除 pending 状态
    if (role_level < 100 && record.status !== 'pending') {
      throw new BusinessError(
        `仅允许删除待审核状态的消费记录，当前状态：${record.status}。已审核的记录请联系管理员处理`,
        'CONSUMPTION_ERROR',
        400
      )
    }

    // 检查是否已删除
    if (record.is_deleted === 1) {
      throw new BusinessError(
        '该消费记录已经被删除，无需重复操作',
        'CONSUMPTION_ALREADY_EXISTS',
        409
      )
    }

    // 执行软删除
    const deletedAt = BeijingTimeHelper.createDatabaseTime()
    await record.update(
      {
        is_deleted: 1,
        deleted_at: deletedAt
      },
      { transaction }
    )

    logger.info('软删除消费记录成功', {
      consumption_record_id: recordId,
      user_id: userId,
      deleted_at: deletedAt
    })

    return {
      consumption_record_id: recordId,
      is_deleted: 1,
      deleted_at: deletedAt,
      record_type: 'consumption',
      note: '消费记录已删除，将不再显示在列表中'
    }
  }

  /**
   * 恢复已删除的消费记录（Restore Deleted Consumption Record）
   *
   * @param {number} recordId - 消费记录ID
   * @param {number} adminId - 管理员用户ID
   * @param {Object} [options={}] - 选项
   * @param {Object} [options.transaction] - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 恢复结果
   */
  static async restoreRecord(recordId, adminId, options = {}) {
    const { transaction } = options

    logger.info('管理员恢复消费记录', { record_id: recordId, admin_id: adminId })

    // 查询记录（包含已删除的）
    const record = await ConsumptionRecord.findByPk(recordId, {
      where: { is_deleted: 1 },
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
      paranoid: false
    })

    if (!record) {
      const existingRecord = await ConsumptionRecord.findByPk(recordId, { transaction })
      if (existingRecord) {
        throw new BusinessError('该消费记录未被删除，无需恢复', 'CONSUMPTION_ERROR', 400)
      }
      throw new BusinessError('消费记录不存在', 'CONSUMPTION_NOT_FOUND', 404)
    }

    // 恢复记录
    await record.update(
      {
        is_deleted: 0,
        deleted_at: null
      },
      { transaction }
    )

    logger.info('管理员恢复消费记录成功', {
      consumption_record_id: recordId,
      admin_id: adminId,
      original_user_id: record.user_id
    })

    return {
      consumption_record_id: recordId,
      is_deleted: 0,
      user_id: record.user_id,
      note: '消费记录已恢复，用户端将重新显示该记录'
    }
  }

  /**
   * 获取预算分配系数（严格模式读取配置）
   *
   * @returns {Promise<number>} 预算系数
   * @throws {Error} 配置缺失或读取失败时抛出错误
   */
  static async getBudgetRatio() {
    const ratio = await AdminSystemService.getSettingValue(
      'points',
      'budget_allocation_ratio',
      null,
      { strict: true }
    )

    logger.info('[配置] 预算系数读取成功', { ratio })
    return ratio
  }

  /**
   * 读取星石配额配置（通过 AdminSystemService 统一读取 system_settings）
   *
   * @returns {Promise<{enabled: boolean, ratio: number, action: string}>} 配额配置
   * @private
   */
  static async _getStarStoneQuotaConfig() {
    try {
      const [enabled, ratio, action] = await Promise.all([
        AdminSystemService.getSettingValue('points', 'star_stone_quota_enabled', true),
        AdminSystemService.getSettingValue('points', 'star_stone_quota_ratio', 1.0),
        AdminSystemService.getSettingValue('points', 'star_stone_quota_exhausted_action', 'filter')
      ])

      return {
        enabled: enabled === true || enabled === 'true',
        ratio: typeof ratio === 'number' ? ratio : parseFloat(ratio) || 1.0,
        action: String(action || 'filter').replace(/"/g, '')
      }
    } catch (error) {
      logger.warn(`[ConsumptionService] 读取星石配额配置失败: ${error.message}`)
      return { enabled: false, ratio: 1.0, action: 'filter' }
    }
  }

  /**
   * 获取用户有效比例（优先个人覆盖，其次全局默认）
   *
   * 读取逻辑：先查 user_ratio_overrides 表是否有生效中的个人覆盖，
   * 有效覆盖存在则返回覆盖值，否则返回 globalDefault。
   *
   * 有效覆盖条件：
   * - effective_start IS NULL 或 effective_start <= NOW()
   * - effective_end IS NULL 或 effective_end > NOW()
   *
   * @param {number} user_id - 用户ID
   * @param {string} ratio_key - 比例类型（points_award_ratio / budget_allocation_ratio / star_stone_quota_ratio）
   * @param {number} globalDefault - 全局默认值（来自 system_settings）
   * @returns {Promise<number>} 有效比例值
   */
  static async getEffectiveRatio(user_id, ratio_key, globalDefault) {
    try {
      const { Op } = require('sequelize')
      const now = new Date()

      const override = await UserRatioOverride.findOne({
        where: {
          user_id,
          ratio_key,
          [Op.and]: [
            {
              [Op.or]: [{ effective_start: null }, { effective_start: { [Op.lte]: now } }]
            },
            {
              [Op.or]: [{ effective_end: null }, { effective_end: { [Op.gt]: now } }]
            }
          ]
        }
      })

      if (override) {
        logger.info('[配置] 使用用户个人比例覆盖', {
          user_id,
          ratio_key,
          override_value: override.ratio_value,
          global_default: globalDefault
        })
        return override.ratio_value
      }

      return globalDefault
    } catch (error) {
      logger.warn(`[配置] 查询用户比例覆盖失败，降级到全局默认: ${error.message}`, {
        user_id,
        ratio_key
      })
      return globalDefault
    }
  }
}

module.exports = CoreService
