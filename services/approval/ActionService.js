/**
 * 审核链动作服务（ActionService）
 *
 * 职责（从 ApprovalChainService 拆分，2026-07-11 技术债务方案 7.4-6）：
 * - 审批动作执行（processStep 核心状态机：单签/会签/越级留痕/终审闭环/一票否决）
 * - 批量审批（processStepsBatch，逐条独立事务 + 终审触发 ContentAuditEngine 回调）
 * - 操作人精确鉴权（_verifyOperatorPermission：角色池/指定人/提交人门店店长/当事人回避）
 * - 当事人解析（_resolveAuditableParties，回避校验数据源）
 * - 审核统计与超时口径（getApprovalStats / getOperationAnalytics，
 *   含超时步骤数、超时率、平均审核耗时等超时处理监控指标）
 *
 * 设计说明：
 * - 本模块不独立注册服务键，由 ApprovalChainService Facade（服务键 approval_chain）转发调用
 * - 事务边界不变：processStep 要求外部事务传入；processStepsBatch 内部逐条
 *   TransactionManager.execute（与拆分前层级一致）
 * - 步骤推进复用 InstanceService.advanceToNextStep（单向依赖：Action → Instance，无循环）
 * - 纯搬移拆分：所有方法逻辑与拆分前 ApprovalChainService 完全一致
 *
 * @module services/approval/ActionService
 */
const BusinessError = require('../../utils/BusinessError')
const logger = require('../../utils/logger').logger
const {
  ApprovalChainInstance,
  ApprovalChainNode,
  ApprovalChainStep,
  ApprovalChainStepAction,
  AdminNotification,
  UserRole,
  Role,
  StoreStaff,
  UserHierarchy,
  sequelize
} = require('../../models')
const { Op } = require('sequelize')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const BeijingTimeHelper = require('../../utils/timeHelper')
/*
 * 终审闭环依赖：终审通过/拒绝后触发统一审核引擎回调（消费记录发积分/改状态）
 * ContentAuditEngine 为静态服务，直接 require 复用（符合"静态服务 + 顶部 require"约定）
 */
const ContentAuditEngine = require('../ContentAuditEngine')
const TransactionManager = require('../../utils/TransactionManager')
// 步骤流转与门店范围复用实例服务（单向依赖：Action → Instance，无循环）
const InstanceService = require('./InstanceService')

/** 审核链动作服务 */
class ActionService {
  /**
   * 处理审核步骤（核心方法）
   *
   * 权限校验逻辑（Service 层精确鉴权，_verifyOperatorPermission 返回越级上下文）：
   *   - 角色池模式：operator 的任一角色 role_id 等于 step.assignee_role_id（叠加门店/区域隔离）
   *   - 指定人模式：operator.user_id 等于 step.assignee_user_id
   *   - 提交人门店店长（submitter_manager）：operator 为该门店在职店长
   *   - admin(role_level>=100) 可审核任何步骤（终极兜底；顶替低等级节点时标记越级留痕）
   *
   * 会签（countersign）：approve 写 approval_chain_step_actions 子记录 + 累加 approved_count，
   *   凑够 required_approvals 才推进；任一 reject 整体拒绝；admin 越级一次满足整个会签节点。
   *
   * @param {number} stepId - 步骤ID
   * @param {string} action - 操作（'approve' 或 'reject'）
   * @param {string} reason - 审批意见
   * @param {number} operatorId - 操作人 user_id
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize 事务（必填）
   * @returns {Promise<Object>} 处理结果（含 countersign_pending 标识会签未凑够）
   */
  static async processStep(stepId, action, reason, operatorId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ApprovalChainService.processStep')

    if (!['approve', 'reject'].includes(action)) {
      throw new BusinessError(
        `无效的审核操作: ${action}，仅支持 approve/reject`,
        'APPROVAL_INVALID',
        400
      )
    }

    const step = await ApprovalChainStep.findByPk(stepId, {
      include: [
        { model: ApprovalChainInstance, as: 'instance' },
        { model: ApprovalChainNode, as: 'node' }
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!step) {
      throw new BusinessError(`审核步骤不存在: step_id=${stepId}`, 'APPROVAL_NOT_FOUND', 404)
    }
    if (step.status !== 'pending') {
      throw new BusinessError(
        `审核步骤状态不是 pending: 当前状态=${step.status}`,
        'APPROVAL_ERROR',
        400
      )
    }
    if (step.instance.status !== 'in_progress') {
      throw new BusinessError(
        `审核链已结束: 当前状态=${step.instance.status}`,
        'APPROVAL_ERROR',
        400
      )
    }

    const permCtx = await ActionService._verifyOperatorPermission(step, operatorId, transaction)

    const now = BeijingTimeHelper.createDatabaseTime()

    if (action === 'approve') {
      /*
       * 会签子记录（2026-06-20 会签支持）：每个审批动作写一条 approval_chain_step_actions，
       * DB 唯一约束 uk_step_actor(step_id, actioned_by) 防同一人重复投票（并发安全）。
       * 单签节点也写一条，保持审批留痕统一。
       */
      try {
        await ApprovalChainStepAction.create(
          {
            step_id: step.step_id,
            actioned_by: operatorId,
            action: 'approve',
            action_reason: reason || '审核通过',
            is_escalated: permCtx.is_escalated ? 1 : 0,
            actioned_at: now
          },
          { transaction }
        )
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          throw new BusinessError('您已审批过该步骤，请勿重复操作', 'APPROVAL_ERROR', 400)
        }
        throw err
      }

      /*
       * 会签满足判定（决策 8.6）：
       * - 单签（single）：1 个 approve 即满足。
       * - 会签（countersign）：approved_count + 1 凑够 required_approvals 才满足。
       * - admin 越级（is_escalated）：一次越级直接满足整个会签节点（异常兜底通道，决策 8.6.3）。
       */
      const isCountersign = step.approve_mode === 'countersign'
      const required = step.required_approvals || 1
      const newApprovedCount = (step.approved_count || 0) + 1
      const nodeSatisfied = !isCountersign || permCtx.is_escalated || newApprovedCount >= required

      // 越级留痕字段（仅在越级时写入，记录原应审角色与代审人）
      const escalationFields = permCtx.is_escalated
        ? {
            is_escalated: 1,
            original_assignee_role_id: permCtx.original_assignee_role_id,
            escalated_from_user_id: operatorId
          }
        : {}

      if (!nodeSatisfied) {
        /*
         * 会签未凑够人数：仅累加 approved_count，步骤保持 pending 不推进，等待其他会签人审批。
         * 当前操作人信息记到 step（最近一次审批人），完整审批名单在 step_actions 子表。
         */
        await step.update(
          {
            approved_count: newApprovedCount,
            action_reason: reason || '审核通过',
            actioned_by: operatorId,
            actioned_at: now,
            ...escalationFields
          },
          { transaction }
        )

        logger.info(
          `[审核链] 会签进度: step_id=${stepId}, approved=${newApprovedCount}/${required}（未满，保持 pending）`
        )

        return {
          action: 'approved',
          is_chain_completed: false,
          countersign_pending: true,
          approved_count: newApprovedCount,
          required_approvals: required,
          instance: step.instance,
          step
        }
      }

      // 满足（单签 / 会签凑够 / 越级）：标记步骤 approved
      await step.update(
        {
          status: 'approved',
          approved_count: newApprovedCount,
          action_reason: reason || '审核通过',
          actioned_by: operatorId,
          actioned_at: now,
          ...escalationFields
        },
        { transaction }
      )

      if (step.is_final) {
        await step.instance.update(
          {
            status: 'completed',
            final_result: 'approved',
            final_reason: reason || '审核通过',
            completed_at: now
          },
          { transaction }
        )

        logger.info(`[审核链] 终审通过: instance_id=${step.instance_id}, step_id=${stepId}`)

        // 通知提交人：审核链已完成（通过）
        try {
          if (step.instance.submitted_by) {
            await AdminNotification.create(
              {
                admin_id: step.instance.submitted_by,
                title: '审核已通过',
                content: `${step.instance.auditable_type}审核 #${step.instance.auditable_id} 已通过终审`,
                notification_type: 'system',
                priority: 'normal',
                source_type: 'approval_chain',
                source_id: step.instance_id,
                extra_data: {
                  event: 'approval_chain_approved',
                  instance_id: step.instance_id,
                  final_result: 'approved'
                }
              },
              { transaction }
            )
          }
        } catch (notifyError) {
          logger.warn(`[审核链] 终审通过通知提交人失败（非致命）: ${notifyError.message}`)
        }

        return {
          action: 'approved',
          is_chain_completed: true,
          final_result: 'approved',
          instance: step.instance,
          step
        }
      } else {
        const nextResult = await InstanceService.advanceToNextStep(step.instance, step, {
          transaction
        })
        logger.info(
          `[审核链] 推进到下一步: instance_id=${step.instance_id}, next_step=${nextResult.next_step_number}`
        )

        return {
          action: 'approved',
          is_chain_completed: false,
          next_step_number: nextResult.next_step_number,
          instance: step.instance,
          step
        }
      }
    } else {
      /*
       * 拒绝：写会签子记录（同样防重复投票）。任一 reject 即整体拒绝（会签也是一票否决）。
       */
      try {
        await ApprovalChainStepAction.create(
          {
            step_id: step.step_id,
            actioned_by: operatorId,
            action: 'reject',
            action_reason: reason,
            is_escalated: permCtx.is_escalated ? 1 : 0,
            actioned_at: now
          },
          { transaction }
        )
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          throw new BusinessError('您已审批过该步骤，请勿重复操作', 'APPROVAL_ERROR', 400)
        }
        throw err
      }

      const rejectEscalationFields = permCtx.is_escalated
        ? {
            is_escalated: 1,
            original_assignee_role_id: permCtx.original_assignee_role_id,
            escalated_from_user_id: operatorId
          }
        : {}

      await step.update(
        {
          status: 'rejected',
          action_reason: reason,
          actioned_by: operatorId,
          actioned_at: now,
          ...rejectEscalationFields
        },
        { transaction }
      )

      await step.instance.update(
        {
          status: 'rejected',
          final_result: 'rejected',
          final_reason: reason,
          completed_at: now
        },
        { transaction }
      )

      const remainingSteps = await ApprovalChainStep.findAll({
        where: {
          instance_id: step.instance_id,
          status: 'waiting'
        },
        transaction
      })
      for (const remainingStep of remainingSteps) {
        // eslint-disable-next-line no-await-in-loop
        await remainingStep.update({ status: 'skipped' }, { transaction })
      }

      logger.info(`[审核链] 审核拒绝: instance_id=${step.instance_id}, step_id=${stepId}`)

      // 通知提交人：审核链已拒绝
      try {
        if (step.instance.submitted_by) {
          await AdminNotification.create(
            {
              admin_id: step.instance.submitted_by,
              title: '审核已拒绝',
              content: `${step.instance.auditable_type}审核 #${step.instance.auditable_id} 已被拒绝，原因：${reason}`,
              notification_type: 'alert',
              priority: 'high',
              source_type: 'approval_chain',
              source_id: step.instance_id,
              extra_data: {
                event: 'approval_chain_rejected',
                instance_id: step.instance_id,
                final_result: 'rejected',
                reason
              }
            },
            { transaction }
          )
        }
      } catch (notifyError) {
        logger.warn(`[审核链] 审核拒绝通知提交人失败（非致命）: ${notifyError.message}`)
      }

      return {
        action: 'rejected',
        is_chain_completed: true,
        final_result: 'rejected',
        instance: step.instance,
        step
      }
    }
  }

  /**
   * 批量处理审核步骤（收口到审核链，批量=逐条循环 processStep）
   *
   * 设计要点（符合项目约束）：
   * - 复用单步核心逻辑 processStep，零重写业务规则（鉴权/状态机/留痕全部一致）
   * - 每条步骤独立事务（TransactionManager.execute），单条失败不影响其它（部分成功语义）
   * - 终审通过/拒绝后，在同一条事务内复刻"路由层终审触发"：调 ContentAuditEngine.approve/reject
   *   触发消费记录发积分/改状态闭环，保证批量与单条结果完全一致
   * - 仅处理"当前轮到操作人的步骤"，多级链下批量只推进操作人负责的那一步
   *
   * @param {number[]} stepIds - 待审核步骤ID数组（来自 my-pending）
   * @param {string} action - 审核动作：approve | reject
   * @param {string} reason - 审核原因（reject 必填）
   * @param {number} operatorId - 操作人用户ID（从 JWT 解析）
   * @returns {Promise<Object>} { results: [...], stats: {...} }
   */
  static async processStepsBatch(stepIds, action, reason, operatorId) {
    if (!Array.isArray(stepIds) || stepIds.length === 0) {
      throw new BusinessError('step_ids 必须是非空数组', 'APPROVAL_INVALID', 400)
    }
    if (!['approve', 'reject'].includes(action)) {
      throw new BusinessError(
        `无效的审核操作: ${action}，仅支持 approve/reject`,
        'APPROVAL_INVALID',
        400
      )
    }
    if (action === 'reject' && (!reason || reason.trim().length < 5)) {
      throw new BusinessError('拒绝原因必须提供，且不少于5个字符', 'APPROVAL_INVALID', 400)
    }

    const results = []
    let successCount = 0
    let failedCount = 0

    for (const rawStepId of stepIds) {
      const stepId = parseInt(rawStepId, 10)
      try {
        // eslint-disable-next-line no-await-in-loop
        const processResult = await TransactionManager.execute(
          async transaction => {
            const r = await ActionService.processStep(stepId, action, reason, operatorId, {
              transaction
            })
            // 终审完成 → 复刻路由层闭环：触发统一审核引擎回调（消费记录发积分/改状态）
            if (r.is_chain_completed && r.instance?.content_review_record_id) {
              if (r.final_result === 'approved') {
                await ContentAuditEngine.approve(
                  r.instance.content_review_record_id,
                  operatorId,
                  reason || '审核链终审通过',
                  { transaction }
                )
              } else if (r.final_result === 'rejected') {
                await ContentAuditEngine.reject(
                  r.instance.content_review_record_id,
                  operatorId,
                  reason,
                  { transaction }
                )
              }
            }
            return r
          },
          { description: `审核链批量处理步骤 step_id=${stepId}` }
        )

        results.push({
          step_id: stepId,
          success: true,
          action: processResult.action,
          is_chain_completed: processResult.is_chain_completed,
          final_result: processResult.final_result || null,
          next_step_number: processResult.next_step_number || null
        })
        successCount++
      } catch (error) {
        results.push({
          step_id: stepId,
          success: false,
          error_code: error.code || error.errorCode || 'APPROVAL_ERROR',
          message: error.message
        })
        failedCount++
      }
    }

    logger.info('[审核链] 批量处理完成', {
      operator_id: operatorId,
      action,
      total: stepIds.length,
      success_count: successCount,
      failed_count: failedCount
    })

    return {
      results,
      stats: { total: stepIds.length, success_count: successCount, failed_count: failedCount }
    }
  }

  /**
   * 审核统计聚合（Web 管理端数据看板，2026-06-20 决策 8.4/8.4.3/11.2）
   *
   * 按门店或区域维度聚合消费审核数据，供运营/管理层看板。读操作收口本 Service。
   * 数据来源：
   *   - consumption_records：按 store_id 分组的 待审/已审/通过/拒绝 数量、消费金额、奖励积分
   *   - approval_chain_steps（store_id + timeout_at）：各门店"超时未处理"步骤数（决策 8.6.3）
   * 区域维度（dimension='region'）：经 user_hierarchy 把门店聚合到其上级（区域负责人）下。
   *
   * @param {Object} [options] - 选项
   * @param {string} [options.dimension='store'] - 聚合维度：store=按门店，region=按区域
   * @returns {Promise<Object>} { dimension, rows: [...], summary: {...} }
   */
  static async getApprovalStats(options = {}) {
    const dimension = options.dimension === 'region' ? 'region' : 'store'
    const models = require('../../models')
    const ConsumptionRecord = models.ConsumptionRecord
    const Store = models.Store

    // 1. 按门店聚合消费审核状态分布 + 金额 + 积分
    const byStore = await ConsumptionRecord.findAll({
      attributes: [
        'store_id',
        'status',
        [sequelize.fn('COUNT', sequelize.col('consumption_record_id')), 'cnt'],
        [sequelize.fn('SUM', sequelize.col('consumption_amount')), 'amount'],
        [sequelize.fn('SUM', sequelize.col('points_to_award')), 'points']
      ],
      where: { is_deleted: 0, store_id: { [Op.not]: null } },
      group: ['store_id', 'status'],
      raw: true
    })

    // 2. 各门店"超时未处理"步骤数（pending 且 timeout_at 已过期）
    const now = new Date()
    const timeoutByStore = await ApprovalChainStep.findAll({
      attributes: ['store_id', [sequelize.fn('COUNT', sequelize.col('step_id')), 'cnt']],
      where: { status: 'pending', store_id: { [Op.not]: null }, timeout_at: { [Op.lt]: now } },
      group: ['store_id'],
      raw: true
    })
    const timeoutMap = new Map()
    timeoutByStore.forEach(r => timeoutMap.set(Number(r.store_id), parseInt(r.cnt, 10) || 0))

    /*
     * 2.1 各门店审核时效（9.3 审核时效统计）：基于 approval_chain_steps 已审结步骤
     *     (created_at→actioned_at) 的平均耗时（秒），以及"已审结步骤里超时的占比" timeout_rate。
     *     复用客服响应时长同款写法 AVG(TIMESTAMPDIFF(SECOND, ...))。
     */
    const durationByStore = await ApprovalChainStep.findAll({
      attributes: [
        'store_id',
        [
          sequelize.fn('AVG', sequelize.literal('TIMESTAMPDIFF(SECOND, created_at, actioned_at)')),
          'avg_seconds'
        ],
        [sequelize.fn('COUNT', sequelize.col('step_id')), 'finished_cnt'],
        [
          sequelize.literal(
            "SUM(CASE WHEN status = 'timeout' OR (actioned_at IS NOT NULL AND timeout_at IS NOT NULL AND actioned_at > timeout_at) THEN 1 ELSE 0 END)"
          ),
          'overtime_cnt'
        ]
      ],
      where: {
        store_id: { [Op.not]: null },
        actioned_at: { [Op.not]: null },
        status: { [Op.in]: ['approved', 'rejected', 'timeout'] }
      },
      group: ['store_id'],
      raw: true
    })
    const durationMap = new Map()
    durationByStore.forEach(r => {
      durationMap.set(Number(r.store_id), {
        avg_seconds: Math.round(parseFloat(r.avg_seconds) || 0),
        finished_cnt: parseInt(r.finished_cnt, 10) || 0,
        overtime_cnt: parseInt(r.overtime_cnt, 10) || 0
      })
    })

    // 3. 门店元信息（名称）
    const stores = await Store.findAll({ attributes: ['store_id', 'store_name'], raw: true })
    const storeNameMap = new Map(stores.map(s => [Number(s.store_id), s.store_name]))

    // 4. 组装"按门店"统计行
    const storeStatsMap = new Map()
    const ensureStoreRow = sid => {
      const id = Number(sid)
      if (!storeStatsMap.has(id)) {
        storeStatsMap.set(id, {
          store_id: id,
          store_name: storeNameMap.get(id) || null,
          pending: 0,
          approved: 0,
          rejected: 0,
          expired: 0,
          timeout: timeoutMap.get(id) || 0,
          total: 0,
          amount: 0,
          points: 0,
          // 审核时效（9.3）：平均审核耗时（秒）+ 已审结步骤数 + 超时步骤数（用于算超时率）
          avg_duration_seconds: durationMap.get(id) ? durationMap.get(id).avg_seconds : 0,
          finished_steps: durationMap.get(id) ? durationMap.get(id).finished_cnt : 0,
          overtime_steps: durationMap.get(id) ? durationMap.get(id).overtime_cnt : 0
        })
      }
      return storeStatsMap.get(id)
    }
    byStore.forEach(r => {
      const row = ensureStoreRow(r.store_id)
      const cnt = parseInt(r.cnt, 10) || 0
      if (row[r.status] !== undefined) row[r.status] = cnt
      row.total += cnt
      row.amount += parseFloat(r.amount) || 0
      row.points += parseInt(r.points, 10) || 0
    })
    // 确保有超时但无消费分组的门店也出现
    timeoutMap.forEach((_v, sid) => ensureStoreRow(sid))

    // 通过率（已通过 / 已审结(通过+拒绝)）+ 审核时效（平均耗时友好文案 + 超时率）
    const finalizeRow = row => {
      const finished = row.approved + row.rejected
      row.pass_rate = finished > 0 ? Math.round((row.approved / finished) * 10000) / 100 : 0
      // 超时率 = 超时步骤数 / 已审结步骤数（按 approval_chain_steps 口径）
      row.timeout_rate =
        row.finished_steps > 0
          ? Math.round((row.overtime_steps / row.finished_steps) * 10000) / 100
          : 0
      row.avg_duration_text = ActionService._formatDurationSeconds(row.avg_duration_seconds)
      return row
    }
    const storeRows = Array.from(storeStatsMap.values()).map(finalizeRow)

    if (dimension === 'store') {
      return {
        dimension: 'store',
        rows: storeRows,
        summary: ActionService._sumStatsRows(storeRows)
      }
    }

    /*
     * 5. 区域维度：把门店聚合到其上级（区域负责人）
     *    user_hierarchy 中业务员挂 store_id，其 superior_user_id 即所属区域负责人
     */
    const hierarchies = await UserHierarchy.findAll({
      where: { is_active: true, store_id: { [Op.not]: null } },
      attributes: ['store_id', 'superior_user_id'],
      raw: true
    })
    const storeToSuperior = new Map()
    hierarchies.forEach(h => {
      if (h.store_id != null) storeToSuperior.set(Number(h.store_id), h.superior_user_id || null)
    })

    const regionMap = new Map()
    for (const row of storeRows) {
      const superiorId = storeToSuperior.get(row.store_id) ?? null
      const key = superiorId == null ? 'unassigned' : `region_${superiorId}`
      if (!regionMap.has(key)) {
        regionMap.set(key, {
          region_key: key,
          superior_user_id: superiorId,
          store_count: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          expired: 0,
          timeout: 0,
          total: 0,
          amount: 0,
          points: 0,
          // 时效聚合：跨门店按已审结步骤数加权平均
          finished_steps: 0,
          overtime_steps: 0,
          _duration_weighted_sum: 0
        })
      }
      const region = regionMap.get(key)
      region.store_count += 1
      region.pending += row.pending
      region.approved += row.approved
      region.rejected += row.rejected
      region.expired += row.expired
      region.timeout += row.timeout
      region.total += row.total
      region.amount += row.amount
      region.points += row.points
      region.finished_steps += row.finished_steps
      region.overtime_steps += row.overtime_steps
      region._duration_weighted_sum += row.avg_duration_seconds * row.finished_steps
    }
    const regionRows = Array.from(regionMap.values()).map(region => {
      // 区域平均耗时 = 各门店(平均耗时×已审结步骤数)之和 / 区域已审结步骤总数（加权平均）
      region.avg_duration_seconds =
        region.finished_steps > 0
          ? Math.round(region._duration_weighted_sum / region.finished_steps)
          : 0
      delete region._duration_weighted_sum
      return finalizeRow(region)
    })

    return {
      dimension: 'region',
      rows: regionRows,
      summary: ActionService._sumStatsRows(regionRows)
    }
  }

  /**
   * 运营分析看板（8.4.3 丰富分析，Web 管理端，2026-06-20）
   *
   * 一次性返回 4 类运营分析，供审核链管理页"数据统计"tab 的分析区（读操作收口本 Service）：
   *   - staff_ranking：员工录入排行（按 merchant_id 聚合录入单数/通过/驳回，帮店长/区域管人）
   *   - trend：消费/积分发放的日走势（按 created_at 分天，非快照）
   *   - reject_reasons：拒绝原因 TOP（基于 approval_chain_steps 被驳回步骤的 action_reason 聚合）
   *   - user_activity：用户复购/活跃（回头客数/新客数/消费次数分布）——
   *       ⚠️ 仅返回聚合数字，不含 user_id/mobile/nickname 等 PII，满足"脱敏、仅管理端可见、不下发小程序"。
   *
   * @param {Object} [options] - 选项
   * @param {number} [options.days=30] - 分析时间窗（天），默认近 30 天
   * @param {number} [options.store_id] - 可选，限定门店
   * @returns {Promise<Object>} { window_days, staff_ranking, trend, reject_reasons, user_activity }
   */
  static async getOperationAnalytics(options = {}) {
    const models = require('../../models')
    const ConsumptionRecord = models.ConsumptionRecord
    const User = models.User
    const days = Math.min(Math.max(parseInt(options.days, 10) || 30, 1), 365)
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    const storeId = options.store_id ? parseInt(options.store_id, 10) : null

    const baseWhere = { is_deleted: 0, created_at: { [Op.gte]: since } }
    if (storeId) baseWhere.store_id = storeId

    // 1. 员工录入排行（按 merchant_id 录入人聚合：录入数 + 各状态数）
    const staffRaw = await ConsumptionRecord.findAll({
      attributes: [
        'merchant_id',
        'status',
        [sequelize.fn('COUNT', sequelize.col('consumption_record_id')), 'cnt']
      ],
      where: { ...baseWhere, merchant_id: { [Op.not]: null } },
      group: ['merchant_id', 'status'],
      raw: true
    })
    const staffMap = new Map()
    staffRaw.forEach(r => {
      const id = Number(r.merchant_id)
      if (!staffMap.has(id)) {
        staffMap.set(id, { merchant_id: id, total: 0, approved: 0, rejected: 0, pending: 0 })
      }
      const row = staffMap.get(id)
      const cnt = parseInt(r.cnt, 10) || 0
      row.total += cnt
      if (row[r.status] !== undefined) row[r.status] += cnt
    })
    // 附录入人昵称（管理端可见，非小程序下发）
    const merchantIds = Array.from(staffMap.keys())
    if (merchantIds.length > 0) {
      const users = await User.findAll({
        where: { user_id: { [Op.in]: merchantIds } },
        attributes: ['user_id', 'nickname'],
        raw: true
      })
      const nameMap = new Map(users.map(u => [Number(u.user_id), u.nickname]))
      staffMap.forEach((row, id) => {
        row.merchant_nickname = nameMap.get(id) || null
      })
    }
    const staffRanking = Array.from(staffMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 20)

    // 2. 趋势（按天分组：录入单数、消费金额、奖励积分）
    const trendRaw = await ConsumptionRecord.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('created_at')), 'day'],
        [sequelize.fn('COUNT', sequelize.col('consumption_record_id')), 'cnt'],
        [sequelize.fn('SUM', sequelize.col('consumption_amount')), 'amount'],
        [sequelize.fn('SUM', sequelize.col('points_to_award')), 'points']
      ],
      where: baseWhere,
      group: [sequelize.fn('DATE', sequelize.col('created_at'))],
      order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']],
      raw: true
    })
    const trend = trendRaw.map(r => ({
      day: BeijingTimeHelper.formatDate ? BeijingTimeHelper.formatDate(r.day) : r.day,
      count: parseInt(r.cnt, 10) || 0,
      amount: parseFloat(r.amount) || 0,
      points: parseInt(r.points, 10) || 0
    }))

    // 3. 拒绝原因 TOP（基于审核链被驳回步骤的 action_reason 聚合）
    const rejectStepWhere = { status: 'rejected', actioned_at: { [Op.gte]: since } }
    if (storeId) rejectStepWhere.store_id = storeId
    const rejectRaw = await ApprovalChainStep.findAll({
      attributes: ['action_reason', [sequelize.fn('COUNT', sequelize.col('step_id')), 'cnt']],
      where: rejectStepWhere,
      group: ['action_reason'],
      order: [[sequelize.fn('COUNT', sequelize.col('step_id')), 'DESC']],
      limit: 10,
      raw: true
    })
    const rejectReasons = rejectRaw.map(r => ({
      reason: r.action_reason || '(未填写原因)',
      count: parseInt(r.cnt, 10) || 0
    }))

    // 4. 用户复购/活跃（仅聚合数字，无 PII）
    const userAgg = await ConsumptionRecord.findAll({
      attributes: [
        'user_id',
        [sequelize.fn('COUNT', sequelize.col('consumption_record_id')), 'cnt']
      ],
      where: { ...baseWhere, user_id: { [Op.not]: null } },
      group: ['user_id'],
      raw: true
    })
    let repeatCustomers = 0
    let singleCustomers = 0
    const distribution = { '1次': 0, '2-3次': 0, '4-5次': 0, '6次以上': 0 }
    userAgg.forEach(r => {
      const c = parseInt(r.cnt, 10) || 0
      if (c >= 2) repeatCustomers++
      else singleCustomers++
      if (c === 1) distribution['1次']++
      else if (c <= 3) distribution['2-3次']++
      else if (c <= 5) distribution['4-5次']++
      else distribution['6次以上']++
    })
    const totalCustomers = userAgg.length
    const userActivity = {
      total_customers: totalCustomers,
      repeat_customers: repeatCustomers,
      single_customers: singleCustomers,
      repeat_rate:
        totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 10000) / 100 : 0,
      consumption_distribution: distribution
    }

    /*
     * 5. 审核人时效排行（9.3"各审核人平均审核耗时、超时率"）：
     *    基于 approval_chain_steps 已审结步骤，按 actioned_by(审核人) 聚合平均耗时与超时率。
     *    复用客服响应时长同款 AVG(TIMESTAMPDIFF(SECOND, created_at, actioned_at))。
     */
    const reviewerStepWhere = {
      actioned_by: { [Op.not]: null },
      actioned_at: { [Op.not]: null, [Op.gte]: since },
      status: { [Op.in]: ['approved', 'rejected', 'timeout'] }
    }
    if (storeId) reviewerStepWhere.store_id = storeId
    const reviewerRaw = await ApprovalChainStep.findAll({
      attributes: [
        'actioned_by',
        [sequelize.fn('COUNT', sequelize.col('step_id')), 'finished_cnt'],
        [
          sequelize.fn('AVG', sequelize.literal('TIMESTAMPDIFF(SECOND, created_at, actioned_at)')),
          'avg_seconds'
        ],
        [
          sequelize.literal(
            "SUM(CASE WHEN status = 'timeout' OR (timeout_at IS NOT NULL AND actioned_at > timeout_at) THEN 1 ELSE 0 END)"
          ),
          'overtime_cnt'
        ]
      ],
      where: reviewerStepWhere,
      group: ['actioned_by'],
      order: [[sequelize.fn('COUNT', sequelize.col('step_id')), 'DESC']],
      limit: 20,
      raw: true
    })
    const reviewerIds = reviewerRaw.map(r => Number(r.actioned_by))
    const reviewerNameMap = new Map()
    if (reviewerIds.length > 0) {
      const rUsers = await User.findAll({
        where: { user_id: { [Op.in]: reviewerIds } },
        attributes: ['user_id', 'nickname'],
        raw: true
      })
      rUsers.forEach(u => reviewerNameMap.set(Number(u.user_id), u.nickname))
    }
    const reviewerDuration = reviewerRaw.map(r => {
      const finished = parseInt(r.finished_cnt, 10) || 0
      const overtime = parseInt(r.overtime_cnt, 10) || 0
      const avgSeconds = Math.round(parseFloat(r.avg_seconds) || 0)
      return {
        reviewer_id: Number(r.actioned_by),
        reviewer_nickname: reviewerNameMap.get(Number(r.actioned_by)) || null,
        finished_count: finished,
        avg_duration_seconds: avgSeconds,
        avg_duration_text: ActionService._formatDurationSeconds(avgSeconds),
        timeout_rate: finished > 0 ? Math.round((overtime / finished) * 10000) / 100 : 0
      }
    })

    return {
      window_days: days,
      store_id: storeId,
      staff_ranking: staffRanking,
      trend,
      reject_reasons: rejectReasons,
      user_activity: userActivity,
      reviewer_duration: reviewerDuration
    }
  }

  /**
   * 把秒数格式化为友好耗时文案（如 "2小时30分"、"45分钟"、"30秒"），供审核时效展示
   * @param {number} seconds - 秒数
   * @returns {string} 友好文案
   * @private
   */
  static _formatDurationSeconds(seconds) {
    const s = Math.round(Number(seconds) || 0)
    if (s <= 0) return '0秒'
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (d > 0) return `${d}天${h}小时`
    if (h > 0) return `${h}小时${m}分`
    if (m > 0) return `${m}分钟`
    return `${sec}秒`
  }

  /**
   * 汇总统计行（求总计），供 getApprovalStats 复用
   * @param {Array<Object>} rows - 统计行
   * @returns {Object} 汇总对象
   * @private
   */
  static _sumStatsRows(rows) {
    const summary = {
      pending: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      timeout: 0,
      total: 0,
      amount: 0,
      points: 0,
      finished_steps: 0,
      overtime_steps: 0
    }
    let durationWeightedSum = 0
    rows.forEach(r => {
      summary.pending += r.pending
      summary.approved += r.approved
      summary.rejected += r.rejected
      summary.expired += r.expired
      summary.timeout += r.timeout
      summary.total += r.total
      summary.amount += r.amount
      summary.points += r.points
      summary.finished_steps += r.finished_steps || 0
      summary.overtime_steps += r.overtime_steps || 0
      durationWeightedSum += (r.avg_duration_seconds || 0) * (r.finished_steps || 0)
    })
    const finished = summary.approved + summary.rejected
    summary.pass_rate = finished > 0 ? Math.round((summary.approved / finished) * 10000) / 100 : 0
    // 全局平均审核耗时（按已审结步骤数加权）+ 超时率
    summary.avg_duration_seconds =
      summary.finished_steps > 0 ? Math.round(durationWeightedSum / summary.finished_steps) : 0
    summary.avg_duration_text = ActionService._formatDurationSeconds(summary.avg_duration_seconds)
    summary.timeout_rate =
      summary.finished_steps > 0
        ? Math.round((summary.overtime_steps / summary.finished_steps) * 10000) / 100
        : 0
    return summary
  }

  /**
   * 验证操作人是否有权审核当前步骤，并返回审核上下文（用于会签计数与越级留痕）
   *
   * @param {Object} step - 审核步骤
   * @param {number} operatorId - 操作人ID
   * @param {Object} transaction - 事务
   * @returns {Promise<Object>} 审核上下文 { is_escalated, original_assignee_role_id }
   *   - is_escalated：true 表示 admin 越级顶替了本不该由其审的低等级节点（需留痕）
   *   - original_assignee_role_id：越级时该步原应审角色ID（留痕，submitter_manager 时为 null）
   *   权限不足时抛 BusinessError。
   * @private
   */
  static async _verifyOperatorPermission(step, operatorId, transaction) {
    const userRoles = await UserRole.findAll({
      where: { user_id: operatorId, is_active: 1 },
      include: [{ model: Role, as: 'role', attributes: ['role_id', 'role_level'] }],
      transaction
    })

    // 操作人有效级别 = 其多个角色里的最高 role_level
    const operatorLevel = userRoles.reduce((max, ur) => Math.max(max, ur.role?.role_level || 0), 0)
    /*
     * 超级管理员（super_admin, lv≥110）豁免当事人回避：顶层唯一超管可审任何业务（含与自己相关的），
     * 避免"唯一超管被回避挡住导致无人可审"的死锁。普通 admin(100) 及以下仍受回避约束。
     */
    const SUPER_ADMIN_LEVEL = 110
    const isSuperAdmin = operatorLevel >= SUPER_ADMIN_LEVEL

    /*
     * 当事人回避校验（exclude_parties，默认开启）：
     * 审核人不得是该 auditable 业务的当事人（发起人/消费者/纠纷方/积分申请人）。
     * 即使操作人持 admin(100) 角色也拒绝，防止"自己审自己"（仲裁中立性 / 积分申请人=受益人）。
     * 例外：super_admin(lv≥110) 豁免（见上）。节点 exclude_parties=0 时也跳过回避。
     * 放在角色判定之前，确保 admin 当事人也被拦截。
     */
    const excludeParties = step.node ? step.node.exclude_parties !== 0 : true
    if (!isSuperAdmin && excludeParties && step.instance) {
      const partyIds = await ActionService._resolveAuditableParties(step.instance, transaction)
      if (partyIds.includes(operatorId)) {
        throw new BusinessError(
          '您是该业务的当事人，按回避规则不能审核与自己相关的业务',
          'APPROVAL_ERROR',
          400
        )
      }
    }

    const isAdmin = operatorLevel >= 100
    if (isAdmin) {
      /*
       * 越级代审判定（2026-06-20 越级留痕，决策 8.1）：
       * admin 顶替"本不该由 admin 审"的低等级节点时，标记越级并记录原应审角色，供 processStep 留痕。
       * 判定：该步配置了具体审核角色(assignee_role_id) 且该角色非 admin 自身角色池命中，
       *       或该步是 submitter_manager（本应门店店长审）。指定人步骤(assignee_user_id≠admin)也算越级。
       */
      const adminHasAssignedRole =
        step.assignee_role_id != null && userRoles.some(ur => ur.role_id === step.assignee_role_id)
      const adminIsAssignedUser =
        step.assignee_user_id != null && step.assignee_user_id === operatorId
      const stepAssigneeType = step.node ? step.node.assignee_type : null
      const isEscalated =
        !adminHasAssignedRole && !adminIsAssignedUser
          ? step.assignee_role_id != null ||
            step.assignee_user_id != null ||
            stepAssigneeType === 'submitter_manager'
          : false
      return {
        is_escalated: isEscalated,
        original_assignee_role_id: isEscalated ? step.assignee_role_id || null : null
      }
    }

    /*
     * ops(lv30, role_id=9) 只读角色排除（2026-06-20 分级审核链升级，决策 6/8.1）：
     * 审核接口门槛降到 lv20 后，ops(lv30) 能进路由，但 ops 是"只读运营"角色，
     * 业务上绝不应成为审核人（审核=发积分=发钱）。这里在 Service 层显式排除：
     * 操作人持 ops 角色，且不具备其它任何"可审核角色"（除 ops 外、role_level >= 店员 lv20 的角色）时，拒绝。
     * 仅持 ops 的用户被挡；若用户同时还兼任店员/店长等审核角色，则按其审核角色正常走精校。
     */
    const OPS_ROLE_ID = 9
    const STAFF_MIN_LEVEL = 20
    const hasOpsRole = userRoles.some(ur => ur.role_id === OPS_ROLE_ID)
    if (hasOpsRole) {
      const hasOtherAuditRole = userRoles.some(
        ur => ur.role_id !== OPS_ROLE_ID && (ur.role?.role_level || 0) >= STAFF_MIN_LEVEL
      )
      if (!hasOtherAuditRole) {
        throw new BusinessError(
          'ops 为只读运营角色，不具备审核权限，不能成为审核人',
          'APPROVAL_ERROR',
          400
        )
      }
    }

    if (step.assignee_user_id) {
      if (step.assignee_user_id !== operatorId) {
        throw new BusinessError('您不是当前步骤的指定审核人，无权审核该单', 'APPROVAL_ERROR', 400, {
          assignee_user_id: step.assignee_user_id,
          step_id: step.step_id
        })
      }
      return { is_escalated: false, original_assignee_role_id: null }
    }

    /*
     * submitter_manager（提交人门店店长）分配方式（2026-06-20 补全门店隔离半成品）：
     * 操作人必须是该消费单所属门店（step.store_id）的"在职店长"（store_staff.role_in_store='manager'）。
     * 天然实现"谁的店谁审"，从根上杜绝 A 店店长审 B 店单的跨店越权。
     */
    const assigneeType = step.node ? step.node.assignee_type : null
    if (assigneeType === 'submitter_manager') {
      if (!step.store_id) {
        throw new BusinessError(
          '该审核步骤缺少门店信息（store_id 为空），无法按"提交人门店店长"校验',
          'APPROVAL_ERROR',
          400
        )
      }
      const managerRecord = await StoreStaff.findOne({
        where: {
          user_id: operatorId,
          store_id: step.store_id,
          role_in_store: 'manager',
          status: 'active'
        },
        transaction
      })
      if (!managerRecord) {
        throw new BusinessError(
          '您不是该消费单所属门店的在职店长，无权审核该单',
          'APPROVAL_ERROR',
          400
        )
      }
      return { is_escalated: false, original_assignee_role_id: null }
    }

    if (step.assignee_role_id) {
      const hasRole = userRoles.some(ur => ur.role_id === step.assignee_role_id)
      if (!hasRole) {
        throw new BusinessError(
          '您不具备当前步骤要求的审核角色，无权审核该单',
          'APPROVAL_ERROR',
          400,
          { required_role_id: step.assignee_role_id, step_id: step.step_id }
        )
      }

      /*
       * 门店/区域隔离（2026-06-20 角色池分支叠加范围校验，堵跨店越权）：
       * consumption 业务（step.store_id 有值）下，角色池模式的非 admin 审核人，
       * 必须管辖该门店才放行——
       *   - 店长/店员：本人在 store_staff 该门店在职；
       *   - 区域负责人/业务经理：该门店在其 user_hierarchy 管辖集合内。
       * 二者统一由 _getUserScopedStoreIds 计算"可审门店集合"，命中才放行。
       * merchant_points 无门店维度（step.store_id 为空），跳过隔离，保持原角色池语义。
       */
      if (step.store_id) {
        const scopedStoreIds = await InstanceService._getUserScopedStoreIds(operatorId, transaction)
        if (!scopedStoreIds.has(Number(step.store_id))) {
          throw new BusinessError(
            '该审核单不属于您管辖的门店/区域范围，无权审核（请确认门店任职或区域层级配置）',
            'APPROVAL_ERROR',
            400
          )
        }
      }
      return { is_escalated: false, original_assignee_role_id: null }
    }

    throw new BusinessError('当前步骤无法确定审核人分配方式', 'APPROVAL_ERROR', 400)
  }

  /**
   * 解析审核链实例对应业务的"当事人" user_id 列表（用于回避校验）
   *
   * 按 auditable_type 取该业务的利益相关方：
   * - 通用：instance.submitted_by（提交人/发起人，所有业务都有）
   * - trade_dispute：trade_disputes.user_id（纠纷发起方）+ created_by
   * - consumption：consumption_records.user_id（消费者）
   * - merchant_points：content_review_records.audit_data.user_id（申请人=受益人）
   *
   * @param {Object} instance - 审核链实例（含 auditable_type/auditable_id/submitted_by/content_review_record_id）
   * @param {Object} transaction - 事务
   * @returns {Promise<number[]>} 去重后的当事人 user_id 列表
   * @private
   */
  static async _resolveAuditableParties(instance, transaction) {
    const models = require('../../models')
    const parties = new Set()
    if (instance.submitted_by) parties.add(Number(instance.submitted_by))

    try {
      if (instance.auditable_type === 'trade_dispute') {
        const d = await models.TradeDispute.findByPk(instance.auditable_id, {
          attributes: ['user_id', 'created_by'],
          transaction
        })
        if (d) {
          if (d.user_id) parties.add(Number(d.user_id))
          if (d.created_by) parties.add(Number(d.created_by))
        }
      } else if (instance.auditable_type === 'consumption') {
        const r = await models.ConsumptionRecord.findByPk(instance.auditable_id, {
          attributes: ['user_id'],
          transaction
        })
        if (r && r.user_id) parties.add(Number(r.user_id))
      } else if (instance.auditable_type === 'merchant_points') {
        if (instance.content_review_record_id) {
          const cr = await models.ContentReviewRecord.findByPk(instance.content_review_record_id, {
            attributes: ['audit_data'],
            transaction
          })
          const applicantId = cr?.audit_data?.user_id
          if (applicantId) parties.add(Number(applicantId))
        }
      }
    } catch (err) {
      // 当事人解析失败不应阻断审核，但需告警（回避降级为仅按 submitted_by）
      logger.warn('[审核链] 解析当事人失败，回避仅按 submitted_by', {
        auditable_type: instance.auditable_type,
        auditable_id: instance.auditable_id,
        error: err.message
      })
    }
    return Array.from(parties)
  }
}

module.exports = ActionService
