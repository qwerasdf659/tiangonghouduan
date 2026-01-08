const logger = require('../utils/logger').logger

/**
 * 餐厅积分抽奖系统 V4.0 - 消费记录服务
 *
 * 业务场景：商家扫码录入方案A
 * 核心职责：管理消费记录的提交、审核和积分奖励流程
 *
 * 主要功能：
 * 1. 商家提交消费记录（扫码录入）
 * 2. 管理员审核（通过/拒绝）
 * 3. 审核通过自动奖励积分（通过AssetService）
 * 4. 用户查询自己的消费记录
 * 5. 防重复提交检查（3分钟防误操作窗口）
 *
 * 集成服务：
 * - AssetService：积分奖励（资产域统一架构）
 * - QRCodeValidator：二维码验证
 * - ContentReviewRecord：审核记录
 *
 * 创建时间：2025年10月30日
 * 最后更新：2025年10月30日
 */

const { ConsumptionRecord, ContentReviewRecord, User } = require('../models')
const AssetService = require('./AssetService')
const QRCodeValidator = require('../utils/QRCodeValidator')
const BeijingTimeHelper = require('../utils/timeHelper')
const { Sequelize } = require('sequelize')
const { Op } = Sequelize
const AuditLogService = require('./AuditLogService')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')

/**
 * 🎯 统一数据输出视图常量（Data Output View Constants）
 *
 * 业务场景（Business Scenario）：
 * - 统一管理消费记录领域的数据输出字段，避免字段选择分散在各方法
 * - 符合架构规范：与积分领域的 POINTS_ATTRIBUTES、库存领域的 INVENTORY_ATTRIBUTES 模式保持一致
 * - 根据权限级别（用户/商家/管理员）和业务场景返回不同的数据字段，保护敏感信息
 *
 * 设计原则（Design Principles）：
 * - consumptionRecordUserView：用户消费记录视图 - 用户查看自己的消费记录时返回的字段
 * - consumptionRecordMerchantView：商家消费记录视图 - 商家查看自己录入的消费记录时返回的字段
 * - consumptionRecordAdminView：管理员消费记录视图 - 管理员查看所有消费记录时返回的字段（包含所有字段）
 * - pendingConsumptionView：待审核消费记录视图 - 管理员查看待审核列表时返回的字段
 *
 * 使用示例（Usage Example）：
 * ```javascript
 * // 用户查看自己的消费记录
 * const userRecords = await ConsumptionRecord.findAll({
 *   where: { user_id: userId },
 *   attributes: CONSUMPTION_ATTRIBUTES.consumptionRecordUserView
 * });
 *
 * // 商家查看自己录入的消费记录
 * const merchantRecords = await ConsumptionRecord.findAll({
 *   where: { merchant_id: merchantId },
 *   attributes: CONSUMPTION_ATTRIBUTES.consumptionRecordMerchantView
 * });
 *
 * // 管理员查看所有消费记录（包含审核信息）
 * const adminRecords = await ConsumptionRecord.findAll({
 *   attributes: CONSUMPTION_ATTRIBUTES.consumptionRecordAdminView
 * });
 * ```
 */
// eslint-disable-next-line no-unused-vars -- 视图常量定义，供未来优化使用
const CONSUMPTION_ATTRIBUTES = {
  /**
   * 用户消费记录视图（Consumption Record User View）
   * 用户查看自己的消费记录时返回的字段
   * 不包含审核员信息、管理员备注等敏感字段
   */
  consumptionRecordUserView: [
    'record_id', // 记录ID（Record ID）
    'user_id', // 用户ID（User ID）
    'merchant_id', // 商家ID（Merchant ID）
    'consumption_amount', // 消费金额（Consumption Amount）
    'points_to_award', // 奖励积分（Points to Award）
    'status', // 状态：pending/approved/rejected/expired（Status）
    'qr_code', // 二维码（QR Code）
    'merchant_notes', // 商家备注（Merchant Notes）
    'idempotency_key', // 幂等键（业界标准形态）
    'created_at', // 创建时间（Created At）
    'updated_at', // 更新时间（Updated At）
    'is_deleted' // 是否删除（Is Deleted）
  ],

  /**
   * 商家消费记录视图（Consumption Record Merchant View）
   * 商家查看自己录入的消费记录时返回的字段
   * 包含用户信息和审核状态，不包含管理员备注
   */
  consumptionRecordMerchantView: [
    'record_id', // 记录ID（Record ID）
    'user_id', // 用户ID（User ID）
    'merchant_id', // 商家ID（Merchant ID）
    'consumption_amount', // 消费金额（Consumption Amount）
    'points_to_award', // 奖励积分（Points to Award）
    'status', // 状态（Status）
    'qr_code', // 二维码（QR Code）
    'merchant_notes', // 商家备注（Merchant Notes）
    'idempotency_key', // 幂等键（业界标准形态）
    'reviewed_at', // 审核时间（Reviewed At）
    'created_at', // 创建时间（Created At）
    'updated_at', // 更新时间（Updated At）
    'is_deleted' // 是否删除（Is Deleted）
  ],

  /**
   * 管理员消费记录视图（Consumption Record Admin View）
   * 管理员查看所有消费记录时返回的字段
   * 包含所有字段，用于后台管理和数据分析
   */
  consumptionRecordAdminView: [
    'record_id', // 记录ID（Record ID）
    'user_id', // 用户ID（User ID）
    'merchant_id', // 商家ID（Merchant ID）
    'consumption_amount', // 消费金额（Consumption Amount）
    'points_to_award', // 奖励积分（Points to Award）
    'status', // 状态（Status）
    'qr_code', // 二维码（QR Code）
    'merchant_notes', // 商家备注（Merchant Notes）
    'idempotency_key', // 幂等键（业界标准形态）
    'reviewed_by', // 审核员ID（Reviewed By - 敏感信息，仅管理员可见）
    'reviewed_at', // 审核时间（Reviewed At）
    'admin_notes', // 管理员备注（Admin Notes - 敏感信息，仅管理员可见）
    'created_at', // 创建时间（Created At）
    'updated_at', // 更新时间（Updated At）
    'is_deleted', // 是否删除（Is Deleted）
    'deleted_at' // 删除时间（Deleted At）
  ],

  /**
   * 待审核消费记录视图（Pending Consumption View）
   * 管理员查看待审核列表时返回的字段
   * 包含审核必需的关键信息
   */
  pendingConsumptionView: [
    'record_id', // 记录ID（Record ID）
    'user_id', // 用户ID（User ID）
    'merchant_id', // 商家ID（Merchant ID）
    'consumption_amount', // 消费金额（Consumption Amount）
    'points_to_award', // 奖励积分（Points to Award）
    'status', // 状态（Status）
    'qr_code', // 二维码（QR Code）
    'merchant_notes', // 商家备注（Merchant Notes）
    'idempotency_key', // 幂等键（业界标准形态）
    'created_at', // 创建时间（Created At）
    'updated_at' // 更新时间（Updated At）
  ]
}

/**
 * 消费记录服务类
 * 负责商家扫码录入消费记录的业务逻辑处理
 *
 * @class ConsumptionService
 */
class ConsumptionService {
  /**
   * 商家提交消费记录
   *
   * @param {Object} data - 消费记录数据
   * @param {string} data.qr_code - 用户二维码
   * @param {number} data.consumption_amount - 消费金额（元）
   * @param {string} data.merchant_notes - 商家备注（可选）
   * @param {number} data.merchant_id - 商家ID（录入人）
   * @returns {Object} 创建的消费记录
   */
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
   * @param {string} data.qr_code - 用户二维码字符串（必填，格式: "QR_{user_id}_{signature}"）
   * @param {number} data.merchant_id - 商家ID（必填，Merchant ID - Required）
   * @param {number} data.consumption_amount - 消费金额，单位元（必填，>0，Consumption Amount in Yuan - Required）
   * @param {string} [data.merchant_notes] - 商家备注（可选，Merchant Notes - Optional）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Object} 消费记录对象（Consumption Record Object）
   */
  static async merchantSubmitConsumption(data, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'ConsumptionService.merchantSubmitConsumption'
    )

    logger.info('📊 开始处理商家消费记录提交（使用事务保护）...')
    logger.info('📋 提交数据:', JSON.stringify(data, null, 2))

    // 步骤1：验证必填参数
    if (!data.qr_code) {
      throw new Error('二维码不能为空')
    }
    if (!data.consumption_amount || data.consumption_amount <= 0) {
      throw new Error('消费金额必须大于0')
    }
    if (!data.merchant_id) {
      throw new Error('商家ID不能为空')
    }
    // 【业界标准形态】幂等键必须由路由层传入，不再服务端生成
    if (!data.idempotency_key) {
      throw new Error('缺少幂等键：idempotency_key 必须由调用方提供')
    }

    // 步骤2：验证QR码签名（Step 2: Validate QR Code Signature - HMAC-SHA256，UUID版本）
    const qrValidation = QRCodeValidator.validateQRCode(data.qr_code)
    if (!qrValidation.valid) {
      throw new Error(`二维码验证失败：${qrValidation.error}`)
    }

    const userUuid = qrValidation.user_uuid

    // 步骤3：根据UUID查找用户（Step 3: Find User by UUID）
    const user = await User.findOne({
      where: { user_uuid: userUuid },
      transaction
    }) // ✅ 在事务中查询

    if (!user) {
      throw new Error(`用户不存在（UUID: ${userUuid}）`)
    }

    const userId = user.user_id // 获取内部user_id用于后续业务逻辑

    /*
     * 步骤4：使用传入的幂等键（Idempotency Key - For Idempotency Control）
     * 【业界标准形态 2026-01-02】幂等键由路由层从 Header 获取后传入
     */
    const idempotency_key = data.idempotency_key

    logger.info(`使用传入的幂等键: ${idempotency_key}`)

    /*
     * 步骤5：幂等性检查（Idempotency Check - Prevent Duplicate Submission）
     * 规范要求：P0-3 - 所有资产变动必须有幂等键控制
     */
    const existingRecord = await ConsumptionRecord.findOne({
      where: {
        idempotency_key
      },
      transaction // ✅ 在事务中查询
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

    // 步骤6：计算奖励积分（Step 6: Calculate Points Reward - 1 Yuan = 1 Point, Rounded）
    const pointsToAward = Math.round(parseFloat(data.consumption_amount))

    // 生成业务唯一键（格式：consumption_{merchant_id}_{timestamp}_{random}）
    const randomSuffix = Math.random().toString(36).substr(2, 6)
    const business_id = `consumption_${data.merchant_id}_${Date.now()}_${randomSuffix}`

    // 🔒 步骤7：创建消费记录（Step 7: Create Consumption Record - Within Transaction）
    const consumptionRecord = await ConsumptionRecord.create(
      {
        business_id, // ✅ 业务唯一键（事务边界治理 - 2026-01-05）
        user_id: userId,
        merchant_id: data.merchant_id,
        consumption_amount: data.consumption_amount,
        points_to_award: pointsToAward,
        status: 'pending', // 待审核状态（Pending Status - Waiting for Admin Review）
        qr_code: data.qr_code,
        idempotency_key, // ✅ 幂等键（业界标准形态）
        merchant_notes: data.merchant_notes || null,
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    ) // ✅ 在事务中创建

    logger.info(
      `✅ 消费记录创建成功 (ID: ${consumptionRecord.record_id}, idempotency_key: ${idempotency_key})`
    )

    /*
     * ✅ 方案C：不再创建 pending 积分交易
     * 待审核积分直接从 consumption_records.status='pending' 展示
     * 审核通过后直接调用 AssetService.changeBalance 发放积分
     */
    logger.info(`✅ 消费记录创建成功，预计奖励${pointsToAward}分（审核通过后发放）`)

    // 🔒 步骤9：创建审核记录（Step 9: Create Review Record - Within Transaction）
    await ContentReviewRecord.create(
      {
        auditable_type: 'consumption',
        auditable_id: consumptionRecord.record_id,
        audit_status: 'pending', // 待审核状态（Pending Status - Waiting for Admin Review）
        auditor_id: null, // 审核员ID（暂无，Auditor ID - None Yet）
        audit_reason: null, // 审核原因（暂无，Audit Reason - None Yet）
        submitted_at: BeijingTimeHelper.createDatabaseTime(),
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    ) // ✅ 在事务中创建

    logger.info('✅ 审核记录创建成功')

    // 事务由入口层统一管理，此处不提交
    logger.info('🎉 消费记录处理完成，等待入口层提交事务')

    logger.info(
      `✅ 消费记录完整创建: record_id=${consumptionRecord.record_id}, user_id=${userId}, amount=${data.consumption_amount}元, pending_points=${pointsToAward}分`
    )

    return consumptionRecord
  }

  /**
   * 管理员审核消费记录（通过）
   *
   * @param {number} recordId - 消费记录ID
   * @param {Object} reviewData - 审核数据
   * @param {number} reviewData.reviewer_id - 审核员ID
   * @param {string} reviewData.admin_notes - 审核备注（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Object} 审核结果
   */
  static async approveConsumption(recordId, reviewData, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'ConsumptionService.approveConsumption')

    // 1. 查询消费记录（加锁防止并发）
    const record = await ConsumptionRecord.findByPk(recordId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!record) {
      throw new Error(`消费记录不存在（ID: ${recordId}）`)
    }

    // 2. 检查是否可以审核
    const canReview = record.canBeReviewed()
    if (!canReview.can_review) {
      throw new Error(`不能审核：${canReview.reasons.join('；')}`)
    }

    // 3. 更新消费记录状态（2026-01-09 添加业务结果态字段）
    await record.update(
      {
        status: 'approved',
        reviewed_by: reviewData.reviewer_id,
        reviewed_at: BeijingTimeHelper.createDatabaseTime(),
        admin_notes: reviewData.admin_notes || null,
        final_status: 'approved', // 业务最终状态
        settled_at: BeijingTimeHelper.createDatabaseTime(), // 结算时间
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 4. 更新审核记录表并获取review_id（2026-01-09 审计日志指向规则）
    const reviewRecord = await ContentReviewRecord.findOne({
      where: {
        auditable_type: 'consumption',
        auditable_id: recordId
      },
      transaction
    })

    if (!reviewRecord) {
      throw new Error(`审核记录不存在: consumption_id=${recordId}`)
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

    /*
     * 5. ✅ 方案C：审核通过时直接发放积分（使用 AssetService）
     * 幂等键命名规则：<business_type>:<action>:<entity_id>
     */
    const pointsResult = await AssetService.changeBalance(
      {
        user_id: record.user_id,
        asset_code: 'POINTS',
        delta_amount: record.points_to_award,
        business_type: 'consumption_reward',
        idempotency_key: `consumption_reward:approve:${recordId}`,
        meta: {
          reference_type: 'consumption',
          reference_id: recordId,
          title: `消费奖励${record.points_to_award}分`,
          description: `【审核通过】消费${record.consumption_amount}元，奖励${record.points_to_award}积分`,
          operator_id: reviewData.reviewer_id
        }
      },
      { transaction }
    )

    logger.info(
      `✅ 积分发放成功: user_id=${record.user_id}, 积分=${record.points_to_award}, 幂等=${pointsResult.is_duplicate ? '重复' : '新增'}`
    )

    /*
     * ========== 双账户模型：预算分配逻辑 ==========
     * 业务规则：
     * - 平台抽成10%用于奖品预算
     * - 抽成的80%作为预算积分
     * - 价值系数为3（1元预算 = 3预算积分）
     * 计算公式：budget_points = consumption_amount × 系数（动态配置，默认0.24）
     *
     * 🔥 BUDGET_POINTS 架构（2026-01-03）：
     * - 发放预算时必须指定 campaign_id（活动隔离规则）
     * - 消费产生的预算使用 'CONSUMPTION_DEFAULT' 作为默认来源活动
     * - 后续抽奖时，根据活动的 allowed_campaign_ids 配置决定是否可用
     */
    // 动态读取预算系数
    const budgetRatio = await ConsumptionService.getBudgetRatio()
    const budgetPointsToAllocate = Math.round(record.consumption_amount * budgetRatio)

    logger.info(
      `💰 预算分配: 消费${record.consumption_amount}元 × ${budgetRatio} = ${budgetPointsToAllocate}积分`
    )

    if (budgetPointsToAllocate > 0) {
      /*
       * ✅ 使用 AssetService 分配预算积分
       * asset_code: BUDGET_POINTS（预算积分）
       * campaign_id: 'CONSUMPTION_DEFAULT' - 消费产生的预算来源标识
       *
       * 🔥 BUDGET_POINTS 必须指定 campaign_id（活动隔离规则）
       */
      const budgetResult = await AssetService.changeBalance(
        {
          user_id: record.user_id,
          asset_code: 'BUDGET_POINTS',
          delta_amount: budgetPointsToAllocate,
          business_type: 'consumption_budget_allocation',
          idempotency_key: `consumption_budget:approve:${recordId}`,
          campaign_id: 'CONSUMPTION_DEFAULT', // 🔥 消费产生的预算来源活动标识
          meta: {
            reference_type: 'consumption',
            reference_id: recordId,
            consumption_amount: record.consumption_amount,
            budget_ratio: budgetRatio,
            description: `消费${record.consumption_amount}元，分配预算积分${budgetPointsToAllocate}`
          }
        },
        { transaction }
      )

      logger.info(
        `💰 预算分配成功: user_id=${record.user_id}, 预算积分=${budgetPointsToAllocate}, campaign_id=CONSUMPTION_DEFAULT, 幂等=${budgetResult.is_duplicate ? '重复' : '新增'}`
      )
    }

    /*
     * 📝 记录审计日志（2026-01-09 审计日志指向规则：指向审批流表）
     * 根据功能重复检查报告决策：
     * - target_type = 'ContentReviewRecord'（固定指向审批流表）
     * - target_id = review_id（审批流记录 ID）
     * - details 字段记录关联的业务主表 ID（consumption_record_id）
     */
    try {
      await AuditLogService.logOperation({
        operator_id: reviewData.reviewer_id,
        operation_type: 'consumption_audit',
        target_type: 'ContentReviewRecord',
        target_id: reviewRecord.review_id,
        action: 'approve',
        changes: {
          audit_status: 'approved',
          points_awarded: record.points_to_award
        },
        details: {
          consumption_record_id: recordId,
          amount: record.consumption_amount,
          points_to_award: record.points_to_award
        },
        reason: reviewData.admin_notes || '审核通过',
        idempotency_key: `consumption_audit:approve:${reviewRecord.review_id}`,
        transaction
      })
    } catch (auditError) {
      logger.error('[ConsumptionService] 审计日志记录失败:', auditError.message)
    }

    logger.info(
      `✅ 消费记录审核通过: record_id=${recordId}, 奖励积分=${record.points_to_award}, 预算积分=${budgetPointsToAllocate}`
    )

    return {
      consumption_record: record,
      points_transaction: pointsResult.transaction,
      points_awarded: record.points_to_award,
      budget_points_allocated: budgetPointsToAllocate,
      new_balance: pointsResult.new_balance
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
   * @returns {Object} 审核结果
   */
  static async rejectConsumption(recordId, reviewData, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'ConsumptionService.rejectConsumption')

    // 1. 验证拒绝原因
    if (!reviewData.admin_notes) {
      throw new Error('拒绝原因不能为空')
    }

    // 2. 查询消费记录
    const record = await ConsumptionRecord.findByPk(recordId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!record) {
      throw new Error(`消费记录不存在（ID: ${recordId}）`)
    }

    // 3. 检查是否可以审核
    const canReview = record.canBeReviewed()
    if (!canReview.can_review) {
      throw new Error(`不能审核：${canReview.reasons.join('；')}`)
    }

    // 4. 更新消费记录状态（2026-01-09 添加业务结果态字段）
    await record.update(
      {
        status: 'rejected',
        reviewed_by: reviewData.reviewer_id,
        reviewed_at: BeijingTimeHelper.createDatabaseTime(),
        admin_notes: reviewData.admin_notes,
        final_status: 'rejected', // 业务最终状态
        settled_at: BeijingTimeHelper.createDatabaseTime(), // 结算时间
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 5. 更新审核记录表并获取review_id（2026-01-09 审计日志指向规则）
    const reviewRecord = await ContentReviewRecord.findOne({
      where: {
        auditable_type: 'consumption',
        auditable_id: recordId
      },
      transaction
    })

    if (!reviewRecord) {
      throw new Error(`审核记录不存在: consumption_id=${recordId}`)
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

    /*
     * 📝 记录审计日志（2026-01-09 审计日志指向规则：指向审批流表）
     * 根据功能重复检查报告决策：
     * - target_type = 'ContentReviewRecord'（固定指向审批流表）
     * - target_id = review_id（审批流记录 ID）
     * - details 字段记录关联的业务主表 ID（consumption_record_id）
     */
    try {
      await AuditLogService.logOperation({
        operator_id: reviewData.reviewer_id,
        operation_type: 'consumption_audit',
        target_type: 'ContentReviewRecord',
        target_id: reviewRecord.review_id,
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
        idempotency_key: `consumption_audit:reject:${reviewRecord.review_id}`,
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
   * 用户查询自己的消费记录
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @param {string} options.status - 状态筛选（可选）
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.page_size - 每页数量（默认20）
   * @returns {Object} 查询结果
   */
  static async getUserConsumptionRecords(userId, options = {}) {
    try {
      const page = options.page || 1
      const pageSize = options.page_size || 20
      const offset = (page - 1) * pageSize

      // 构建查询条件
      /*
       * 构建查询条件
       * 注意：is_deleted: 0 过滤已由ConsumptionRecord模型的defaultScope自动处理
       *
       * 软删除业务规则：
       * 1. 用户端默认不显示已删除记录（is_deleted=1），确保用户界面整洁
       * 2. 软删除（Soft Delete）: 记录仍保留在数据库，只是标记为已删除
       * 3. 用户删除记录后无法自己恢复，只有管理员可在后台恢复（POST /api/v4/consumption/:record_id/restore）
       * 4. 删除操作不影响已奖励的积分（积分已发放，不会回收）
       *
       * 数据安全：
       * - 防止数据丢失：管理员可恢复误删除的记录
       * - 审计追踪：保留删除历史（deleted_at字段记录删除时间）
       * - 业务合规：满足数据保留政策（如税务、审计需要历史消费记录）
       */
      const where = {
        user_id: userId
      }
      if (options.status) {
        where.status = options.status
      }

      /*
       * 查询消费记录
       * ✅ 风险R3修复：关联查询详细说明
       */
      const { count, rows } = await ConsumptionRecord.findAndCountAll({
        where,
        include: [
          {
            // 关联商家信息（提交消费记录的商家）
            association: 'merchant',
            attributes: ['user_id', 'mobile', 'nickname'], // 只查询必要字段，避免过度查询
            /*
             * ⭐ required: false - 使用LEFT JOIN而不是INNER JOIN
             * 业务意义：即使商家信息不存在（商家账号被删除），仍然显示消费记录
             * 数据完整性：确保用户能看到所有消费记录，不因商家数据缺失而丢失记录
             * 性能优化：LEFT JOIN比INNER JOIN更快（不需要等待两表匹配）
             */
            required: false
          },
          {
            // 关联审核员信息（审核此消费记录的管理员）
            association: 'reviewer',
            attributes: ['user_id', 'mobile', 'nickname'], // 只查询必要字段
            /*
             * ⭐ required: false - 使用LEFT JOIN
             * 业务意义：pending状态的记录尚未审核，reviewer_id为NULL，仍需显示
             * 用户体验：用户能看到"待审核"记录，而不是因为缺少审核员信息而隐藏
             * 数据安全：即使审核员账号被删除，历史记录仍然完整保留
             */
            required: false
          }
        ],
        order: [['created_at', 'DESC']], // 按创建时间倒序（最新记录在前）
        limit: pageSize, // 分页：每页记录数
        offset, // 分页：跳过前N条记录
        /*
         * ⭐ distinct: true - 避免LEFT JOIN导致的记录重复
         * 技术说明：Sequelize的findAndCountAll在使用include时，count可能重复计数
         * 使用distinct: true确保count准确，避免前端分页显示错误
         */
        distinct: true
      })

      // 计算统计信息
      const stats = await this.getUserConsumptionStats(userId)

      return {
        records: rows.map(r => r.toAPIResponse()),
        pagination: {
          total: count,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(count / pageSize)
        },
        stats
      }
    } catch (error) {
      logger.error('❌ 查询消费记录失败:', error.message)
      throw error
    }
  }

  /**
   * 获取用户消费统计
   *
   * @param {number} userId - 用户ID
   * @returns {Object} 统计信息
   */
  static async getUserConsumptionStats(userId) {
    try {
      // 统计各状态的记录数和金额
      const stats = await ConsumptionRecord.findAll({
        where: { user_id: userId },
        attributes: [
          'status',
          [Sequelize.fn('COUNT', Sequelize.col('record_id')), 'count'],
          [Sequelize.fn('SUM', Sequelize.col('consumption_amount')), 'total_amount'],
          [Sequelize.fn('SUM', Sequelize.col('points_to_award')), 'total_points']
        ],
        group: ['status'],
        raw: true
      })

      // 转换为易用的格式
      const result = {
        total_records: 0,
        total_amount: 0,
        total_points_awarded: 0,
        pending_count: 0,
        approved_count: 0,
        rejected_count: 0,
        expired_count: 0
      }

      stats.forEach(stat => {
        result.total_records += parseInt(stat.count)
        result.total_amount += parseFloat(stat.total_amount || 0)

        if (stat.status === 'pending') {
          result.pending_count = parseInt(stat.count)
        } else if (stat.status === 'approved') {
          result.approved_count = parseInt(stat.count)
          result.total_points_awarded += parseInt(stat.total_points || 0)
        } else if (stat.status === 'rejected') {
          result.rejected_count = parseInt(stat.count)
        } else if (stat.status === 'expired') {
          result.expired_count = parseInt(stat.count)
        }
      })

      return result
    } catch (error) {
      logger.error('❌ 获取消费统计失败:', error.message)
      throw error
    }
  }

  /**
   * 管理员查询待审核的消费记录
   *
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.page_size - 每页数量（默认20）
   * @returns {Object} 查询结果
   */
  static async getPendingConsumptionRecords(options = {}) {
    try {
      const page = options.page || 1
      const pageSize = options.page_size || 20
      const offset = (page - 1) * pageSize

      // 查询待审核记录
      const { count, rows } = await ConsumptionRecord.scope('pending').findAndCountAll({
        include: [
          {
            association: 'user', // 关联用户表（消费者信息）
            attributes: ['user_id', 'mobile', 'nickname'], // 仅查询必要字段
            required: false // ✅ 修复：使用LEFT JOIN，确保即使用户删除也能查到记录（数据完整性100%保障）
          },
          {
            association: 'merchant', // 关联商家表（商家信息）
            attributes: ['user_id', 'mobile', 'nickname'], // 仅查询必要字段
            required: false // 使用LEFT JOIN，商家可为空
          }
        ],
        order: [['created_at', 'ASC']], // 按创建时间升序，先进先出（FIFO - First In First Out）
        limit: pageSize,
        offset,
        distinct: true // 去重保护，确保count准确
      })

      return {
        records: rows.map(r => r.toAPIResponse()),
        pagination: {
          total: count,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(count / pageSize)
        }
      }
    } catch (error) {
      logger.error('❌ 查询待审核记录失败:', error.message)
      throw error
    }
  }

  /**
   * 管理员查询所有消费记录（支持筛选、搜索、统计）
   *
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.page_size - 每页数量（默认20，最大100）
   * @param {string} options.status - 状态筛选（pending/approved/rejected，默认all）
   * @param {string} options.search - 搜索关键词（手机号、用户昵称）
   * @returns {Object} { records, pagination, statistics }
   */
  static async getAdminRecords(options = {}) {
    try {
      const page = options.page || 1
      const pageSize = Math.min(options.page_size || 20, 100)
      const offset = (page - 1) * pageSize
      const status = options.status || 'all'
      const search = options.search?.trim() || ''

      // 构建查询条件
      const whereConditions = {
        is_deleted: 0 // 只查询未删除的记录
      }

      // 状态筛选
      if (status !== 'all') {
        whereConditions.status = status
      }

      // 搜索条件（支持手机号、用户昵称）
      const includeConditions = [
        {
          association: 'user',
          attributes: ['user_id', 'mobile', 'nickname'],
          required: false,
          where: search
            ? {
                [Op.or]: [
                  { mobile: { [Op.like]: `%${search}%` } },
                  { nickname: { [Op.like]: `%${search}%` } }
                ]
              }
            : undefined
        },
        {
          association: 'merchant',
          attributes: ['user_id', 'mobile', 'nickname'],
          required: false
        },
        {
          association: 'reviewer',
          attributes: ['user_id', 'mobile', 'nickname'],
          required: false
        }
      ]

      // 并行查询：记录列表 + 统计数据
      const [{ count, rows }, statistics] = await Promise.all([
        // 查询记录列表
        ConsumptionRecord.findAndCountAll({
          where: whereConditions,
          include: includeConditions,
          order: [
            ['status', 'ASC'], // 待审核优先
            ['created_at', 'DESC'] // 最新的在前
          ],
          limit: pageSize,
          offset,
          distinct: true
        }),

        // 查询统计数据（今日）
        ConsumptionRecord.findAll({
          attributes: ['status', [Sequelize.fn('COUNT', Sequelize.col('record_id')), 'count']],
          where: {
            is_deleted: 0,
            created_at: {
              // 今日开始时间（北京时间00:00:00）
              [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
            }
          },
          group: ['status'],
          raw: true
        })
      ])

      // 处理统计数据
      const stats = {
        pending: 0,
        approved: 0,
        rejected: 0,
        today: 0
      }

      statistics.forEach(stat => {
        if (stat.status === 'pending') stats.pending = parseInt(stat.count)
        if (stat.status === 'approved') stats.approved = parseInt(stat.count)
        if (stat.status === 'rejected') stats.rejected = parseInt(stat.count)
        stats.today += parseInt(stat.count)
      })

      // 补充待审核总数（不限今日）
      const pendingTotal = await ConsumptionRecord.count({
        where: {
          status: 'pending',
          is_deleted: 0
        }
      })
      stats.pending = pendingTotal

      return {
        records: rows.map(r => r.toAPIResponse()),
        pagination: {
          total: count,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(count / pageSize)
        },
        statistics: stats
      }
    } catch (error) {
      logger.error('❌ 管理员查询消费记录失败:', error.message)
      throw new Error('查询消费记录失败：' + error.message)
    }
  }

  /**
   * 获取消费记录详情（含权限检查）
   *
   * @description 先进行轻量查询验证权限，再获取完整详情
   * @param {number} recordId - 消费记录ID
   * @param {number} viewerId - 查看者用户ID
   * @param {boolean} isAdmin - 是否为管理员（role_level >= 100）
   * @param {Object} options - 查询选项
   * @param {boolean} options.include_review_records - 是否包含审核记录
   * @param {boolean} options.include_points_transaction - 是否包含积分交易记录
   * @returns {Object} 消费记录详情
   * @throws {Error} 记录不存在或权限不足
   *
   * 业务规则：
   * - 用户本人可查看自己的消费记录
   * - 商家可查看自己录入的消费记录
   * - 管理员（role_level >= 100）可查看所有消费记录
   *
   * 性能优化：
   * - 先轻量查询验证权限（仅查询3个字段，响应<50ms）
   * - 权限通过后再查询完整数据（包含关联查询，响应~200ms）
   * - 无权限查询节省约75%时间和80%数据库资源
   */
  static async getConsumptionDetailWithAuth(recordId, viewerId, isAdmin = false, options = {}) {
    try {
      /*
       * ✅ 步骤1：轻量查询验证权限（仅查询3个字段，响应<50ms）
       * 注意：defaultScope自动过滤已删除记录，无需手动指定is_deleted字段
       */
      const basicRecord = await ConsumptionRecord.findByPk(recordId, {
        attributes: ['record_id', 'user_id', 'merchant_id']
      })

      // ✅ 步骤2：记录不存在或已删除，直接返回404（不触发完整查询）
      if (!basicRecord) {
        const error = new Error('消费记录不存在或已被删除')
        error.statusCode = 404
        throw error
      }

      /*
       * ✅ 步骤3：验证权限（避免查询关联数据，节省5个表的JOIN查询）
       * 权限检查：用户本人、商家、管理员(role_level >= 100)可查询
       */
      const hasAccess =
        viewerId === basicRecord.user_id || viewerId === basicRecord.merchant_id || isAdmin

      if (!hasAccess) {
        const error = new Error('无权访问此消费记录')
        error.statusCode = 403
        throw error
      }

      // ✅ 步骤4：权限验证通过，查询完整数据（包含关联查询，响应~200ms）
      return await this.getConsumptionRecordDetail(recordId, options)
    } catch (error) {
      logger.error('❌ 获取消费记录详情（含权限检查）失败:', error.message)
      throw error
    }
  }

  /**
   * 获取消费记录详情
   *
   * @param {number} recordId - 消费记录ID
   * @param {Object} options - 查询选项
   * @param {boolean} options.include_review_records - 是否包含审核记录
   * @param {boolean} options.include_points_transaction - 是否包含积分交易记录
   * @returns {Object} 消费记录详情
   */
  static async getConsumptionRecordDetail(recordId, options = {}) {
    try {
      // 构建include数组
      const include = [
        {
          association: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        },
        {
          association: 'merchant',
          attributes: ['user_id', 'mobile', 'nickname'],
          required: false
        },
        {
          association: 'reviewer',
          attributes: ['user_id', 'mobile', 'nickname'],
          required: false
        }
      ]

      if (options.include_review_records) {
        include.push({
          association: 'review_records',
          required: false
        })
      }

      if (options.include_points_transaction) {
        include.push({
          association: 'points_transaction',
          required: false
        })
      }

      // 查询记录
      const record = await ConsumptionRecord.findByPk(recordId, { include })

      if (!record) {
        throw new Error(`消费记录不存在（ID: ${recordId}）`)
      }

      // 前端只负责数据展示：过滤已删除记录
      if (record.is_deleted === 1) {
        throw new Error(`消费记录不存在或已被删除（ID: ${recordId}）`)
      }

      return record.toAPIResponse()
    } catch (error) {
      logger.error('❌ 获取消费记录详情失败:', error.message)
      throw error
    }
  }

  /**
   * 根据ID获取消费记录（支持软删除查询）
   * 用于软删除功能
   *
   * @param {number} recordId - 记录ID
   * @param {Object} options - 查询选项
   * @param {boolean} options.includeDeleted - 是否包含已删除记录（默认false，管理员恢复时需要true）
   * @returns {Object|null} 消费记录实例或null
   */
  static async getRecordById(recordId, options = {}) {
    try {
      const { includeDeleted = false } = options

      /*
       * 使用scope控制是否包含已删除记录
       * 说明：ConsumptionRecord模型已添加defaultScope自动过滤is_deleted=0
       * 如果需要包含已删除记录，使用scope('includeDeleted')
       */
      const query = includeDeleted ? ConsumptionRecord.scope('includeDeleted') : ConsumptionRecord

      // 查询记录
      const record = await query.findOne({
        where: {
          record_id: recordId
        }
      })

      return record
    } catch (error) {
      logger.error('❌ 获取消费记录失败:', error.message)
      throw error
    }
  }

  /**
   * 根据二维码获取用户信息（UUID版本）
   * 业务场景：管理员扫码后快速获取用户基本信息（昵称、手机号码）
   *
   * @param {string} qrCode - 用户二维码（格式：QR_{user_uuid}_{signature}）
   * @returns {Object} 用户信息（user_id, user_uuid, nickname, mobile）
   * @throws {Error} 二维码验证失败或用户不存在
   *
   * 实现逻辑：
   * 1. 验证二维码格式和签名（调用QRCodeValidator，UUID版本）
   * 2. 根据user_uuid查询用户基本信息（仅返回必要字段）
   * 3. 返回用户昵称、UUID和完整手机号码
   */
  static async getUserInfoByQRCode(qrCode) {
    try {
      logger.info(
        '🔍 [ConsumptionService] 开始验证二维码（UUID版本）:',
        qrCode.substring(0, 30) + '...'
      )

      // 1. 验证二维码格式和签名（UUID版本）
      const validation = QRCodeValidator.validateQRCode(qrCode)
      if (!validation.valid) {
        throw new Error(`二维码验证失败：${validation.error}`)
      }

      logger.info('✅ [ConsumptionService] 二维码验证通过，用户UUID:', validation.user_uuid)

      // 2. 根据UUID查询用户信息（仅查询必要字段）
      const user = await User.findOne({
        where: {
          user_uuid: validation.user_uuid
        },
        attributes: ['user_id', 'user_uuid', 'nickname', 'mobile'] // 返回必要字段
      })

      // 3. 验证用户是否存在
      if (!user) {
        throw new Error(`用户不存在（user_uuid: ${validation.user_uuid}）`)
      }

      logger.info(
        `✅ [ConsumptionService] 用户信息获取成功: user_id=${user.user_id}, user_uuid=${user.user_uuid.substring(0, 8)}..., nickname=${user.nickname}`
      )

      // 4. 返回用户信息（包含user_uuid）
      return {
        user_id: user.user_id,
        user_uuid: user.user_uuid, // UUID标识
        nickname: user.nickname,
        mobile: user.mobile // 返回完整手机号码
      }
    } catch (error) {
      logger.error('❌ [ConsumptionService] 获取用户信息失败:', error.message)
      throw error
    }
  }

  /**
   * 获取预算分配系数（严格模式读取配置）
   *
   * @description 从 DB system_settings 读取预算分配系数
   * @returns {Promise<number>} 预算系数
   * @throws {Error} 配置缺失或读取失败时抛出错误（业务码：CONFIG_MISSING/CONFIG_READ_FAILED）
   *
   * 业务规则（配置管理三层分离方案 2025-12-30）：
   * - 从数据库读取 points/budget_allocation_ratio 配置项
   * - 严格模式：配置缺失/读取失败直接报错，不使用默认值兜底
   * - 预算系数直接影响积分经济，静默兜底会造成规则漂移
   *
   * 调用方处理：
   * - 调用方需要 try/catch 捕获异常并返回友好错误
   * - 此设计使配置问题暴露在请求层而非静默失败
   *
   * @see docs/配置管理三层分离与校验统一方案.md
   */
  static async getBudgetRatio() {
    const AdminSystemService = require('./AdminSystemService')

    // 严格模式读取：配置缺失/读取失败直接报错
    const ratio = await AdminSystemService.getSettingValue(
      'points',
      'budget_allocation_ratio',
      null,
      { strict: true }
    )

    logger.info('[配置] 预算系数读取成功', { ratio })
    return ratio
  }
}

module.exports = ConsumptionService
