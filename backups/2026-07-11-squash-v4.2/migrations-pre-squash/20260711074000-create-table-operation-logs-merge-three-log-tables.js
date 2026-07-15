'use strict'

/**
 * 操作日志三表合并: 建 operation_logs 单表 + 数据迁移 + drop 旧三表（技术债务方案 拍板 10 / 删23，2026-07-11）
 *
 * 背景:
 * - admin_operation_logs（管理员单笔操作审计）/ merchant_operation_logs（商家员工操作）/
 *   batch_operation_logs（管理员批量任务）三张表职责同为「操作日志」，查询路由与写入服务三套并存；
 * - 定案：合并为单表 operation_logs，operator_type 多态字段区分域（admin/merchant/batch），
 *   高频筛选字段保留实体列（含索引），低频展示型域专有字段归入 detail JSON；
 * - 直连库核对（2026-07-11）：admin 115 行 / merchant 54 行 / batch 2 行，
 *   幂等键三表交叉与表内均无重复（merchant 39 条 NULL 幂等键，唯一索引允许多 NULL）。
 *
 * 字段映射:
 * - admin:    列 1:1 平移；status 固定 'success'（审计的都是已发生操作）；target_type_raw → detail JSON
 * - merchant: result → status；target_user_id → (target_type='user', target_id)；
 *             consumption_record_id / consumption_amount / error_message / extra_data → detail JSON
 * - batch:    status/计数/参数/结果摘要/completed_at 列 1:1 平移；action/target 为 NULL
 *
 * 回滚: 本迁移为不可逆合并（旧表 drop），回滚依赖迁移前全量备份（backups/ 已存档）。
 * down() 仅删除 operation_logs 新表，旧三表需从备份恢复。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ==================== 1. 建表（显式定义所有字段和约束） ====================
    const [tables] = await queryInterface.sequelize.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operation_logs'"
    )
    if (tables.length === 0) {
      await queryInterface.createTable('operation_logs', {
        operation_log_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '操作日志ID（主键，自增）'
        },
        operator_type: {
          type: Sequelize.ENUM('admin', 'merchant', 'batch'),
          allowNull: false,
          comment: '日志域：admin=管理员单笔操作审计 | merchant=商家员工操作 | batch=管理员批量任务'
        },
        operator_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '操作员ID（管理员/商家员工 user_id）',
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        store_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '门店ID（merchant 域：操作发生的门店；admin/batch 域为 NULL）',
          references: { model: 'stores', key: 'store_id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        operation_type: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '操作类型（admin 域见 constants/AuditOperationTypes.js；merchant/batch 域见模型导出常量）'
        },
        action: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '操作动作（admin/merchant 域使用；batch 域为 NULL）'
        },
        target_type: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '目标对象类型（统一 snake_case 资源码）'
        },
        target_id: {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '目标对象ID（与 target_type 配套）'
        },
        status: {
          type: Sequelize.ENUM('success', 'failed', 'blocked', 'processing', 'partial_success', 'completed'),
          allowNull: false,
          defaultValue: 'success',
          comment: '统一状态：admin 固定 success；merchant success/failed/blocked；batch processing/partial_success/completed/failed'
        },
        before_data: { type: Sequelize.JSON, allowNull: true, comment: '操作前数据（admin 域）' },
        after_data: { type: Sequelize.JSON, allowNull: true, comment: '操作后数据（admin 域）' },
        changed_fields: { type: Sequelize.JSON, allowNull: true, comment: '变更字段列表 [{field, old_value, new_value}]' },
        reason: { type: Sequelize.TEXT, allowNull: true, comment: '操作原因/备注' },
        is_reversible: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false, comment: '是否可回滚（admin 域）' },
        reversal_data: { type: Sequelize.JSON, allowNull: true, comment: '回滚所需数据' },
        is_reversed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false, comment: '是否已回滚' },
        reversed_at: { type: Sequelize.DATE, allowNull: true, comment: '回滚执行时间' },
        reversed_by: { type: Sequelize.INTEGER, allowNull: true, comment: '回滚操作者ID' },
        risk_level: {
          type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
          allowNull: false,
          defaultValue: 'low',
          comment: '操作风险等级（admin 域）'
        },
        requires_approval: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false, comment: '是否需要二次审批' },
        approval_status: {
          type: Sequelize.ENUM('not_required', 'pending', 'approved', 'rejected'),
          allowNull: false,
          defaultValue: 'not_required',
          comment: '审批状态（admin 域）'
        },
        affected_users: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0, comment: '影响用户数' },
        affected_amount: { type: Sequelize.BIGINT, allowNull: true, defaultValue: 0, comment: '影响金额/积分数（分）' },
        rollback_deadline: { type: Sequelize.DATE, allowNull: true, comment: '回滚截止时间' },
        total_count: { type: Sequelize.INTEGER, allowNull: true, comment: '批量任务总操作数量（batch 域）' },
        success_count: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0, comment: '批量任务成功数量（batch 域）' },
        fail_count: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0, comment: '批量任务失败数量（batch 域）' },
        operation_params: { type: Sequelize.JSON, allowNull: true, comment: '批量任务参数JSON（batch 域）' },
        result_summary: { type: Sequelize.JSON, allowNull: true, comment: '批量任务结果摘要JSON（batch 域）' },
        completed_at: { type: Sequelize.DATE, allowNull: true, comment: '批量任务完成时间（batch 域）' },
        ip_address: { type: Sequelize.STRING(45), allowNull: true, comment: 'IP地址（IPv4/IPv6）' },
        user_agent: { type: Sequelize.STRING(500), allowNull: true, comment: '用户代理字符串' },
        request_id: { type: Sequelize.STRING(100), allowNull: true, comment: '请求ID（全链路追踪）' },
        idempotency_key: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: '幂等键（全局唯一，admin/batch 域必填）'
        },
        detail: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '域专有展示字段JSON（merchant: consumption_record_id/consumption_amount/error_message/extra_data；admin: target_type_raw）'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '操作时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          comment: '更新时间（仅 batch 域任务进度更新会变化）'
        }
      }, {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '统一操作日志表（admin/merchant/batch 三域合并，operator_type 多态）'
      })

      // 索引（创建前建表为全新表，无重复索引问题）
      await queryInterface.addIndex('operation_logs', ['idempotency_key'], { name: 'uk_operation_logs_idempotency_key', unique: true })
      await queryInterface.addIndex('operation_logs', ['operator_type', 'created_at'], { name: 'idx_operation_logs_domain_created' })
      await queryInterface.addIndex('operation_logs', ['operator_id', 'created_at'], { name: 'idx_operation_logs_operator_created' })
      await queryInterface.addIndex('operation_logs', ['operation_type'], { name: 'idx_operation_logs_operation_type' })
      await queryInterface.addIndex('operation_logs', ['target_type', 'target_id'], { name: 'idx_operation_logs_target' })
      await queryInterface.addIndex('operation_logs', ['store_id', 'created_at'], { name: 'idx_operation_logs_store_created' })
      await queryInterface.addIndex('operation_logs', ['operator_type', 'status'], { name: 'idx_operation_logs_domain_status' })
      await queryInterface.addIndex('operation_logs', ['risk_level'], { name: 'idx_operation_logs_risk_level' })
      await queryInterface.addIndex('operation_logs', ['is_reversible', 'is_reversed'], { name: 'idx_operation_logs_reversible' })
      await queryInterface.addIndex('operation_logs', ['request_id'], { name: 'idx_operation_logs_request_id' })
      await queryInterface.addIndex('operation_logs', ['ip_address'], { name: 'idx_operation_logs_ip' })
      console.log('✅ operation_logs 单表已创建（含 11 个索引）')
    } else {
      console.log('⏭️ operation_logs 表已存在，跳过建表')
    }

    // ==================== 2. 数据迁移（按原 created_at 排序保持时间线） ====================
    const [adminMigrated] = await queryInterface.sequelize.query(`
      INSERT INTO operation_logs
        (operator_type, operator_id, operation_type, action, target_type, target_id, status,
         before_data, after_data, changed_fields, reason,
         is_reversible, reversal_data, is_reversed, reversed_at, reversed_by,
         risk_level, requires_approval, approval_status, affected_users, affected_amount, rollback_deadline,
         ip_address, user_agent, idempotency_key, detail, created_at, updated_at)
      SELECT 'admin', operator_id, operation_type, action, target_type, target_id, 'success',
         before_data, after_data, changed_fields, reason,
         is_reversible, reversal_data, is_reversed, reversed_at, reversed_by,
         risk_level, requires_approval, approval_status, affected_users, affected_amount, rollback_deadline,
         ip_address, user_agent, idempotency_key,
         CASE WHEN target_type_raw IS NULL THEN NULL ELSE JSON_OBJECT('target_type_raw', target_type_raw) END,
         created_at, created_at
      FROM admin_operation_logs ORDER BY created_at, admin_operation_log_id
    `)
    console.log(`✅ admin 域迁移完成（${adminMigrated.affectedRows} 行）`)

    const [merchantMigrated] = await queryInterface.sequelize.query(`
      INSERT INTO operation_logs
        (operator_type, operator_id, store_id, operation_type, action, target_type, target_id, status,
         ip_address, user_agent, request_id, idempotency_key, detail, created_at, updated_at)
      SELECT 'merchant', operator_id, store_id, operation_type, action,
         CASE WHEN target_user_id IS NULL THEN NULL ELSE 'user' END, target_user_id, result,
         ip_address, user_agent, request_id, idempotency_key,
         CASE WHEN consumption_record_id IS NULL AND consumption_amount IS NULL AND error_message IS NULL AND extra_data IS NULL
              THEN NULL
              ELSE JSON_OBJECT(
                'consumption_record_id', consumption_record_id,
                'consumption_amount', consumption_amount,
                'error_message', error_message,
                'extra_data', extra_data)
         END,
         created_at, created_at
      FROM merchant_operation_logs ORDER BY created_at, merchant_operation_log_id
    `)
    console.log(`✅ merchant 域迁移完成（${merchantMigrated.affectedRows} 行）`)

    const [batchMigrated] = await queryInterface.sequelize.query(`
      INSERT INTO operation_logs
        (operator_type, operator_id, operation_type, status,
         total_count, success_count, fail_count, operation_params, result_summary, completed_at,
         idempotency_key, created_at, updated_at)
      SELECT 'batch', operator_id, operation_type, status,
         total_count, success_count, fail_count, operation_params, result_summary, completed_at,
         idempotency_key, created_at, updated_at
      FROM batch_operation_logs ORDER BY created_at, batch_operation_log_id
    `)
    console.log(`✅ batch 域迁移完成（${batchMigrated.affectedRows} 行）`)

    // ==================== 3. 行数核对（迁移完整性验证，不过即中止） ====================
    const [[counts]] = await queryInterface.sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM admin_operation_logs) +
        (SELECT COUNT(*) FROM merchant_operation_logs) +
        (SELECT COUNT(*) FROM batch_operation_logs) AS source_total,
        (SELECT COUNT(*) FROM operation_logs) AS merged_total
    `)
    if (Number(counts.source_total) !== Number(counts.merged_total)) {
      throw new Error(
        `行数核对失败：源三表合计 ${counts.source_total} ≠ operation_logs ${counts.merged_total}，中止（不 drop 旧表）`
      )
    }
    console.log(`✅ 行数核对通过（${counts.merged_total} 行）`)

    // ==================== 4. drop 旧三表（先迁移后删除） ====================
    await queryInterface.dropTable('admin_operation_logs')
    await queryInterface.dropTable('merchant_operation_logs')
    await queryInterface.dropTable('batch_operation_logs')
    console.log('✅ 旧三表已 drop（admin_operation_logs / merchant_operation_logs / batch_operation_logs）')
  },

  async down(queryInterface) {
    // 不可逆合并：仅删除新表；旧三表结构与数据需从迁移前备份恢复
    await queryInterface.dropTable('operation_logs')
    console.log('⏪ operation_logs 已删除（旧三表需从备份恢复，本迁移为不可逆合并）')
  }
}
