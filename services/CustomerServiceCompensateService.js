/**
 * 客服补偿发放服务（CustomerServiceCompensateService）
 *
 * 业务说明：
 * - 来自游戏GM工作台模型，解决问题的终极手段
 * - 在数据库事务中完成所有补偿操作，保证原子性
 * - 操作流程：发放资产/物品 → 写入操作审计日志 → 在聊天中插入系统消息
 * - 权限控制：当前阶段 admin role_level >= 100 即可操作
 * - 接口设计预留 max_compensate_amount 阈值检查位置（未来加金额阈值控制只需改配置）
 *
 * 事务控制：
 * - 路由层通过 TransactionManager.execute() 管理事务边界
 * - 本服务通过 options.transaction 接受外部传入的事务
 *
 * 服务类型：静态类
 * ServiceManager Key: cs_compensate
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

const logger = require('../utils/logger').logger

class CustomerServiceCompensateService {
  /**
   * 执行补偿发放（在事务内完成所有操作）
   *
   * @param {Object} models - Sequelize models 对象
   * @param {Object} params - 补偿参数
   * @param {number} params.user_id - 接受补偿的用户ID
   * @param {number} params.operator_id - 操作人ID（客服管理员）
   * @param {string} params.reason - 补偿原因
   * @param {number} [params.session_id] - 关联的客服会话ID
   * @param {number} [params.issue_id] - 关联的工单ID
   * @param {Array<Object>} params.items - 补偿项目列表
   * @param {string} params.items[].type - 补偿类型：'asset'（资产）或 'item'（物品）
   * @param {string} [params.items[].asset_code] - 资产代码（type='asset' 时必填）
   * @param {number} [params.items[].amount] - 资产数量（type='asset' 时必填）
   * @param {string} [params.items[].item_type] - 物品类型（type='item' 时必填）
   * @param {number} [params.items[].quantity] - 物品数量（type='item' 时必填，默认1）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务对象（必填，由路由层 TransactionManager 传入）
   * @returns {Object} 补偿结果（包含所有发放明细）
   */
  static async compensate (models, params, options = {}) {
    const { user_id, operator_id, reason, session_id, issue_id, items } = params
    const transaction = options.transaction

    if (!transaction) {
      throw new Error('补偿操作必须在事务内执行（缺少 options.transaction）')
    }

    if (!user_id || !operator_id || !reason || !items || items.length === 0) {
      throw new Error('补偿参数不完整：需要 user_id, operator_id, reason, items')
    }

    /* 验证用户存在 */
    const user = await models.User.findByPk(user_id, { transaction })
    if (!user) {
      throw new Error(`用户 ${user_id} 不存在`)
    }

    const compensationLog = []
    const results = []

    for (const compensateItem of items) {
      if (compensateItem.type === 'asset') {
        /* 资产补偿：委托 BalanceService */
        const BalanceService = require('./asset/BalanceService')
        const idempotencyKey = `cs_compensate_${issue_id || session_id || Date.now()}_${compensateItem.asset_code}_${Date.now()}`

        await BalanceService.changeBalance(
          {
            user_id,
            asset_code: compensateItem.asset_code,
            delta_amount: Math.abs(compensateItem.amount),
            business_type: 'cs_compensation',
            idempotency_key: idempotencyKey,
            meta: {
              reason,
              operator_id,
              session_id,
              issue_id
            }
          },
          { transaction }
        )

        const logEntry = {
          type: 'asset',
          asset_code: compensateItem.asset_code,
          amount: Math.abs(compensateItem.amount)
        }
        compensationLog.push(logEntry)
        results.push(logEntry)
        logger.info(`补偿发放资产: user_id=${user_id}, ${compensateItem.asset_code} +${compensateItem.amount}`)
      } else if (compensateItem.type === 'item') {
        /* 物品补偿：委托 ItemService */
        const ItemService = require('./asset/ItemService')
        const quantity = compensateItem.quantity || 1

        for (let i = 0; i < quantity; i++) {
          await ItemService.mintItem(
            {
              user_id,
              item_type: compensateItem.item_type,
              source_type: 'cs_compensation',
              source_id: `cs_comp_${issue_id || session_id || Date.now()}_${i}`,
              meta: {
                reason,
                operator_id,
                session_id,
                issue_id
              }
            },
            { transaction }
          )
        }

        const logEntry = {
          type: 'item',
          item_type: compensateItem.item_type,
          quantity
        }
        compensationLog.push(logEntry)
        results.push(logEntry)
        logger.info(`补偿发放物品: user_id=${user_id}, ${compensateItem.item_type} x${quantity}`)
      }
    }

    /* 写入操作审计日志（admin_operation_logs） */
    if (models.AdminOperationLog) {
      await models.AdminOperationLog.create(
        {
          admin_id: operator_id,
          operation_type: 'cs_compensation',
          target_type: 'user',
          target_id: String(user_id),
          details: JSON.stringify({
            reason,
            items: compensationLog,
            session_id,
            issue_id
          }),
          ip_address: options.ip_address || 'unknown'
        },
        { transaction }
      )
    }

    /* 在客服会话中插入系统消息（通知用户补偿已发放） */
    if (session_id) {
      const compensationSummary = compensationLog
        .map(item => {
          if (item.type === 'asset') return `${item.asset_code} +${item.amount}`
          return `${item.item_type} x${item.quantity}`
        })
        .join('、')

      await models.ChatMessage.create(
        {
          customer_service_session_id: session_id,
          sender_type: 'system',
          sender_id: operator_id,
          message_type: 'system',
          content: `【补偿发放】${compensationSummary}。原因：${reason}`
        },
        { transaction }
      )
    }

    /* 如果关联了工单，更新工单的补偿记录 */
    if (issue_id) {
      const issue = await models.CustomerServiceIssue.findByPk(issue_id, { transaction })
      if (issue) {
        const existingLog = issue.compensation_log || []
        await issue.update(
          {
            compensation_log: [...existingLog, ...compensationLog]
          },
          { transaction }
        )
      }
    }

    return {
      user_id,
      operator_id,
      reason,
      session_id,
      issue_id,
      compensation_items: results,
      compensated_at: new Date().toISOString()
    }
  }
}

module.exports = CustomerServiceCompensateService
