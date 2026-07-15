'use strict'

/**
 * 迁移：新建交易售后申诉表 trade_disputes + 客服工单瘦身（方案A）
 *
 * 变更说明（按 up 执行顺序）：
 * 1. 创建 trade_disputes 表（交易售后申诉，含 auction 订单类型，修复 P4）+ 索引
 * 2. 插入 trade_dispute 审批链模板 + 1 个终审节点（修复 P5：升级仲裁缺模板）
 * 3. 幂等兜底：将 customer_service_issues 中 issue_type='trade' 的历史纠纷迁入 trade_disputes
 *    （实测真实库 0 行，正常空跑；如有则搬迁，保证幂等）
 * 4. 删除工单纠纷专用列：dispute_type / dispute_evidence / dispute_deadline / approval_chain_instance_id
 *    （compensation_log 属内部工单职责，保留不删）
 * 5. 收敛 issue_type 枚举为 asset/lottery/item/account/consumption/other（移除 trade/feedback）
 * 6. 新增聚合引用列 feedback_id(INT) / dispute_id(BIGINT) + 索引
 *
 * 真相库：.env 指定的 restaurant_points_dev（已连真实库核对 customer_service_issues = 0 行）
 *
 * @version 1.0.0
 * @date 2026-06-02
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // ========== 1. 创建 trade_disputes 表 ==========
      await queryInterface.createTable(
        'trade_disputes',
        {
          trade_dispute_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '售后申诉主键ID'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '申诉人（买家）用户ID → users.user_id'
          },
          order_type: {
            type: Sequelize.ENUM('trade', 'redemption', 'consumption', 'auction'),
            allowNull: false,
            comment: '关联订单类型：trade=交易, redemption=兑换, consumption=消费核销, auction=拍卖'
          },
          order_id: {
            type: Sequelize.STRING(64),
            allowNull: false,
            comment: '关联订单ID（多态值，统一字符串存储兼容 BIGINT 和 UUID）'
          },
          dispute_type: {
            type: Sequelize.ENUM(
              'item_not_received',
              'item_mismatch',
              'quality_issue',
              'fraud',
              'other'
            ),
            allowNull: false,
            comment: '纠纷类型：未收到物品/物品不符/质量问题/欺诈/其他'
          },
          title: {
            type: Sequelize.STRING(200),
            allowNull: false,
            comment: '申诉标题'
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '申诉描述'
          },
          evidence: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '证据（截图URL数组、订单快照等，对应旧 dispute_evidence）'
          },
          status: {
            type: Sequelize.ENUM('open', 'reviewing', 'arbitrating', 'resolved', 'rejected'),
            allowNull: false,
            defaultValue: 'open',
            comment: '申诉状态机：open→reviewing→arbitrating→resolved/rejected'
          },
          priority: {
            type: Sequelize.ENUM('low', 'medium', 'high', 'urgent'),
            allowNull: false,
            defaultValue: 'high',
            comment: '申诉优先级'
          },
          assigned_to: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '处理客服用户ID（内部字段，下发小程序时脱敏）'
          },
          approval_chain_instance_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '仲裁审批链实例ID（内部字段，下发小程序时脱敏）'
          },
          deadline: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '处理截止时间（超时升级，对应旧 dispute_deadline）'
          },
          resolution: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '处理结果说明（下发小程序的用户可见摘要）'
          },
          resolved_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '处理完成时间'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '发起人用户ID（自助=买家本人，代发=客服）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '交易售后申诉表（用户可见的纠纷/售后流程，由方案A 从客服工单表拆出）'
        }
      )

      // 表索引
      await queryInterface.addIndex('trade_disputes', ['user_id'], {
        name: 'idx_trade_disputes_user_id',
        transaction
      })
      await queryInterface.addIndex('trade_disputes', ['status'], {
        name: 'idx_trade_disputes_status',
        transaction
      })
      await queryInterface.addIndex('trade_disputes', ['order_type', 'order_id'], {
        name: 'idx_trade_disputes_order_polymorphic',
        transaction
      })
      await queryInterface.addIndex('trade_disputes', ['assigned_to'], {
        name: 'idx_trade_disputes_assigned_to',
        transaction
      })
      await queryInterface.addIndex('trade_disputes', ['created_at'], {
        name: 'idx_trade_disputes_created_at',
        transaction
      })

      // 外键：user_id → users.user_id（RESTRICT，保护申诉人引用完整性）
      await queryInterface.addConstraint('trade_disputes', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_trade_disputes_user_id',
        references: { table: 'users', field: 'user_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // ========== 2. 插入 trade_dispute 审批链模板 + 终审节点 ==========
      const now = new Date()
      await queryInterface.sequelize.query(
        `INSERT INTO approval_chain_templates
          (template_code, template_name, auditable_type, description, total_nodes, is_active, priority, match_conditions, created_at, updated_at)
         VALUES
          ('trade_dispute_default', '交易纠纷仲裁-默认链', 'trade_dispute', '交易售后申诉升级仲裁的默认审批链（1级：高级客服/管理员终审）', 1, 1, 0, '{}', :now, :now)`,
        { replacements: { now }, transaction }
      )
      const [[{ template_id: tplId }]] = await queryInterface.sequelize.query(
        `SELECT template_id FROM approval_chain_templates WHERE template_code = 'trade_dispute_default'`,
        { transaction }
      )
      // 终审节点：step_number=9（与现有模板约定一致），role_id=2 为 admin 终审
      await queryInterface.sequelize.query(
        `INSERT INTO approval_chain_nodes
          (template_id, step_number, node_name, assignee_type, assignee_role_id, is_final, timeout_hours, timeout_action, sort_order, created_at, updated_at)
         VALUES
          (:tplId, 9, '管理员终审（交易纠纷仲裁）', 'role', 2, 1, 12, 'notify', 1, :now, :now)`,
        { replacements: { tplId, now }, transaction }
      )

      // ========== 3. 幂等兜底：迁移历史 trade 纠纷（实测 0 行，正常空跑）==========
      await queryInterface.sequelize.query(
        `INSERT INTO trade_disputes
          (user_id, order_type, order_id, dispute_type, title, description, evidence, status, priority,
           assigned_to, approval_chain_instance_id, deadline, resolution, resolved_at, created_by, created_at, updated_at)
         SELECT
           user_id,
           CASE WHEN order_type IS NULL THEN 'trade' ELSE order_type END,
           CASE WHEN order_id IS NULL THEN '0' ELSE order_id END,
           CASE WHEN dispute_type IS NULL THEN 'other' ELSE dispute_type END,
           title, description, dispute_evidence,
           CASE
             WHEN status = 'processing' THEN 'reviewing'
             WHEN status = 'closed' THEN 'resolved'
             ELSE status
           END,
           priority, assigned_to, approval_chain_instance_id, dispute_deadline, resolution, resolved_at,
           created_by, created_at, updated_at
         FROM customer_service_issues
         WHERE issue_type = 'trade'`,
        { transaction }
      )

      // ========== 4. 删除工单纠纷专用列（compensation_log 保留）==========
      await queryInterface.removeColumn('customer_service_issues', 'dispute_type', { transaction })
      await queryInterface.removeColumn('customer_service_issues', 'dispute_evidence', { transaction })
      await queryInterface.removeColumn('customer_service_issues', 'dispute_deadline', { transaction })
      await queryInterface.removeColumn('customer_service_issues', 'approval_chain_instance_id', {
        transaction
      })

      // ========== 5. 收敛 issue_type 枚举（移除 trade/feedback）==========
      await queryInterface.changeColumn(
        'customer_service_issues',
        'issue_type',
        {
          type: Sequelize.ENUM('asset', 'lottery', 'item', 'account', 'consumption', 'other'),
          allowNull: false,
          comment: '工单问题类型（对应业务模块，纠纷已迁出至 trade_disputes）'
        },
        { transaction }
      )

      // ========== 6. 新增聚合引用列 + 索引 ==========
      await queryInterface.addColumn(
        'customer_service_issues',
        'feedback_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
          comment: '聚合引用：关联的意见反馈ID → feedbacks.feedback_id'
        },
        { transaction }
      )
      await queryInterface.addColumn(
        'customer_service_issues',
        'dispute_id',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          defaultValue: null,
          comment: '聚合引用：关联的售后申诉ID → trade_disputes.trade_dispute_id'
        },
        { transaction }
      )
      await queryInterface.addIndex('customer_service_issues', ['feedback_id'], {
        name: 'idx_cs_issues_feedback_id',
        transaction
      })
      await queryInterface.addIndex('customer_service_issues', ['dispute_id'], {
        name: 'idx_cs_issues_dispute_id',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 逆序回滚：6 → 1

      // 6. 删除聚合引用列与索引
      await queryInterface.removeIndex('customer_service_issues', 'idx_cs_issues_dispute_id', {
        transaction
      })
      await queryInterface.removeIndex('customer_service_issues', 'idx_cs_issues_feedback_id', {
        transaction
      })
      await queryInterface.removeColumn('customer_service_issues', 'dispute_id', { transaction })
      await queryInterface.removeColumn('customer_service_issues', 'feedback_id', { transaction })

      // 5. 恢复 issue_type 枚举（含 trade/feedback）
      await queryInterface.changeColumn(
        'customer_service_issues',
        'issue_type',
        {
          type: Sequelize.ENUM(
            'asset',
            'trade',
            'lottery',
            'item',
            'account',
            'consumption',
            'feedback',
            'other'
          ),
          allowNull: false,
          comment: '工单问题类型（对应业务模块）'
        },
        { transaction }
      )

      // 4. 恢复纠纷专用列
      await queryInterface.addColumn(
        'customer_service_issues',
        'dispute_type',
        {
          type: Sequelize.ENUM(
            'item_not_received',
            'item_mismatch',
            'quality_issue',
            'fraud',
            'other'
          ),
          allowNull: true,
          defaultValue: null,
          comment: '纠纷类型：未收到物品/物品不符/质量问题/欺诈/其他'
        },
        { transaction }
      )
      await queryInterface.addColumn(
        'customer_service_issues',
        'dispute_evidence',
        {
          type: Sequelize.JSON,
          allowNull: true,
          defaultValue: null,
          comment: '纠纷证据（截图URL数组、文字描述等）'
        },
        { transaction }
      )
      await queryInterface.addColumn(
        'customer_service_issues',
        'dispute_deadline',
        {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
          comment: '纠纷处理截止时间（超时自动升级）'
        },
        { transaction }
      )
      await queryInterface.addColumn(
        'customer_service_issues',
        'approval_chain_instance_id',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          defaultValue: null,
          comment: '关联的审批链实例 ID（仲裁流程）'
        },
        { transaction }
      )

      // 2. 删除 trade_dispute 审批链模板与节点
      await queryInterface.sequelize.query(
        `DELETE FROM approval_chain_nodes WHERE template_id IN
          (SELECT template_id FROM approval_chain_templates WHERE template_code = 'trade_dispute_default')`,
        { transaction }
      )
      await queryInterface.sequelize.query(
        `DELETE FROM approval_chain_templates WHERE template_code = 'trade_dispute_default'`,
        { transaction }
      )

      // 1. 删除 trade_disputes 表（含外键/索引随表删除）
      await queryInterface.dropTable('trade_disputes', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
