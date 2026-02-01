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
const logger = require('../../utils/logger').logger
const BusinessError = require('../../utils/BusinessError')
const { ConsumptionRecord, ContentReviewRecord, User } = require('../../models')
const BalanceService = require('../asset/BalanceService')
const BeijingTimeHelper = require('../../utils/timeHelper')
const AuditLogService = require('../AuditLogService')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')

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

    // 步骤6：计算奖励积分（1元=1分，四舍五入）
    const pointsToAward = Math.round(parseFloat(data.consumption_amount))

    // 生成业务唯一键
    const randomSuffix = Math.random().toString(36).substr(2, 6)
    const business_id = `consumption_${data.merchant_id}_${Date.now()}_${randomSuffix}`

    // 步骤6.5：处理 store_id
    let storeId = data.store_id
    if (!storeId) {
      const { StoreStaff } = require('../../models')
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

    // 步骤7：创建消费记录
    const consumptionRecord = await ConsumptionRecord.create(
      {
        business_id,
        user_id: userId,
        merchant_id: data.merchant_id,
        store_id: storeId || null,
        consumption_amount: data.consumption_amount,
        points_to_award: pointsToAward,
        status: 'pending',
        qr_code: data.qr_code,
        idempotency_key,
        merchant_notes: data.merchant_notes || null,
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    logger.info(
      `✅ 消费记录创建成功 (ID: ${consumptionRecord.consumption_record_id}, idempotency_key: ${idempotency_key})`
    )

    // 步骤9：创建审核记录
    await ContentReviewRecord.create(
      {
        auditable_type: 'consumption',
        auditable_id: consumptionRecord.consumption_record_id,
        audit_status: 'pending',
        auditor_id: null,
        audit_reason: null,
        submitted_at: BeijingTimeHelper.createDatabaseTime(),
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    logger.info('✅ 审核记录创建成功')
    logger.info('🎉 消费记录处理完成，等待入口层提交事务')

    logger.info(
      `✅ 消费记录完整创建: consumption_record_id=${consumptionRecord.consumption_record_id}, user_id=${userId}, amount=${data.consumption_amount}元, pending_points=${pointsToAward}分`
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
      throw new Error(`消费记录不存在（ID: ${recordId}）`)
    }

    // 2. 检查是否可以审核
    const canReview = record.canBeReviewed()
    if (!canReview.can_review) {
      throw new Error(`不能审核：${canReview.reasons.join('；')}`)
    }

    // 3. 先发放积分（满足数据库约束 chk_approved_has_reward）
    // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
    const pointsResult = await BalanceService.changeBalance(
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

    // 🔧 修复：BalanceService 返回的是 asset_transaction_id，不是 transaction_id
    const rewardTransactionId = pointsResult.transaction_record?.asset_transaction_id || null

    if (!rewardTransactionId) {
      throw new Error('积分发放成功但未获取到流水ID，无法完成审核')
    }

    logger.info(`🔗 获取积分流水ID: ${rewardTransactionId}`)

    // 4. 更新消费记录状态
    await record.update(
      {
        status: 'approved',
        reviewed_by: reviewData.reviewer_id,
        reviewed_at: BeijingTimeHelper.createDatabaseTime(),
        admin_notes: reviewData.admin_notes || null,
        reward_transaction_id: rewardTransactionId,
        final_status: 'approved',
        settled_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 5. 更新审核记录表
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

    // 6. 双账户模型：预算分配逻辑
    const budgetRatio = await CoreService.getBudgetRatio()
    const budgetPointsToAllocate = Math.round(record.consumption_amount * budgetRatio)

    logger.info(
      `💰 预算分配: 消费${record.consumption_amount}元 × ${budgetRatio} = ${budgetPointsToAllocate}积分`
    )

    if (budgetPointsToAllocate > 0) {
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
      const budgetResult = await BalanceService.changeBalance(
        {
          user_id: record.user_id,
          asset_code: 'BUDGET_POINTS',
          delta_amount: budgetPointsToAllocate,
          business_type: 'consumption_budget_allocation',
          idempotency_key: `consumption_budget:approve:${recordId}`,
          lottery_campaign_id: 'CONSUMPTION_DEFAULT',
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
        `💰 预算分配成功: user_id=${record.user_id}, 预算积分=${budgetPointsToAllocate}, lottery_campaign_id=CONSUMPTION_DEFAULT, 幂等=${budgetResult.is_duplicate ? '重复' : '新增'}`
      )
    }

    // 7. 记录审计日志
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
   * @returns {Promise<Object>} 审核结果
   */
  static async rejectConsumption(recordId, reviewData, options = {}) {
    // 强制要求事务边界
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

    // 4. 更新消费记录状态
    await record.update(
      {
        status: 'rejected',
        reviewed_by: reviewData.reviewer_id,
        reviewed_at: BeijingTimeHelper.createDatabaseTime(),
        admin_notes: reviewData.admin_notes,
        final_status: 'rejected',
        settled_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 5. 更新审核记录表
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

    // 6. 记录审计日志
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
      throw new Error('消费记录不存在')
    }

    // 权限检查
    if (!has_admin_access && record.user_id !== userId) {
      throw new Error('无权删除此消费记录')
    }

    // 状态检查：普通用户只能删除 pending 状态
    if (role_level < 100 && record.status !== 'pending') {
      throw new Error(
        `仅允许删除待审核状态的消费记录，当前状态：${record.status}。已审核的记录请联系管理员处理`
      )
    }

    // 检查是否已删除
    if (record.is_deleted === 1) {
      throw new Error('该消费记录已经被删除，无需重复操作')
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
      deleted_at: BeijingTimeHelper.formatForAPI(deletedAt)
    })

    return {
      consumption_record_id: recordId,
      is_deleted: 1,
      deleted_at: BeijingTimeHelper.formatForAPI(deletedAt),
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
        throw new Error('该消费记录未被删除，无需恢复')
      }
      throw new Error('消费记录不存在')
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
    const AdminSystemService = require('../AdminSystemService')

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

module.exports = CoreService
