'use strict'

/**
 * 审核链系统 - 创建4张核心表
 *
 * 业务场景：多级审核链（可配置顺序审核 + ContentAuditEngine 升级）
 * 表清单：
 *   1. approval_chain_templates  — 审核链模板（定义审核流程）
 *   2. approval_chain_nodes      — 审核链节点定义（模板内的每个审核步骤）
 *   3. approval_chain_instances  — 审核链实例（每次业务提交创建一条）
 *   4. approval_chain_steps      — 审核链步骤执行记录（实例内每个步骤的状态）
 *
 * @migration 20260310100000
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // ========== 表 1: approval_chain_templates ==========
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS approval_chain_templates (
          template_id        BIGINT       NOT NULL AUTO_INCREMENT COMMENT '模板ID',
          template_code      VARCHAR(50)  NOT NULL                COMMENT '模板编码（如 consumption_default）',
          template_name      VARCHAR(100) NOT NULL                COMMENT '模板名称（如"消费审核-标准链"）',
          auditable_type     VARCHAR(50)  NOT NULL                COMMENT '关联业务类型（consumption/merchant_points/exchange）',
          description        TEXT         NULL                    COMMENT '描述',
          total_nodes        TINYINT      NOT NULL                COMMENT '审核节点数（1-8，不含提交节点）',
          is_active          TINYINT(1)   NOT NULL DEFAULT 1      COMMENT '是否启用',
          priority           INT          NOT NULL DEFAULT 0      COMMENT '优先级（多个模板时按条件匹配优先级，数值越大优先级越高）',
          match_conditions   JSON         NULL                    COMMENT '匹配条件（JSON，如 {"min_amount":200}）',
          created_by         INT          NULL                    COMMENT '创建人',
          created_at         DATETIME     NOT NULL                COMMENT '创建时间',
          updated_at         DATETIME     NOT NULL                COMMENT '更新时间',
          PRIMARY KEY (template_id),
          UNIQUE KEY uk_template_code (template_code),
          INDEX idx_auditable_type_active (auditable_type, is_active),
          CONSTRAINT fk_act_created_by FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核链模板';
      `, { transaction })

      // ========== 表 2: approval_chain_nodes ==========
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS approval_chain_nodes (
          node_id                  BIGINT       NOT NULL AUTO_INCREMENT COMMENT '节点ID',
          template_id              BIGINT       NOT NULL                COMMENT '所属模板',
          step_number              TINYINT      NOT NULL                COMMENT '步骤编号（1=提交位，2-9=审核位）',
          node_name                VARCHAR(100) NOT NULL                COMMENT '节点名称（如"店长初审"）',
          assignee_type            ENUM('role','user','submitter_manager') NOT NULL COMMENT '分配方式',
          assignee_role_id         INT          NULL                    COMMENT '按角色分配时的角色ID',
          assignee_user_id         INT          NULL                    COMMENT '按指定人分配时的用户ID',
          is_final                 TINYINT(1)   NOT NULL                COMMENT '是否终审节点',
          auto_approve_enabled     TINYINT(1)   NOT NULL DEFAULT 0     COMMENT '是否启用自动审批',
          auto_approve_conditions  JSON         NULL                    COMMENT '自动审批条件',
          timeout_hours            INT          NOT NULL DEFAULT 12     COMMENT '超时小时数（默认12小时）',
          timeout_action           ENUM('none','auto_approve','escalate','notify') NOT NULL DEFAULT 'escalate' COMMENT '超时动作',
          escalate_to_node         BIGINT       NULL                    COMMENT '超时升级到的节点',
          sort_order               INT          NOT NULL DEFAULT 0      COMMENT '排序',
          created_at               DATETIME     NOT NULL                COMMENT '创建时间',
          updated_at               DATETIME     NOT NULL                COMMENT '更新时间',
          PRIMARY KEY (node_id),
          INDEX idx_template_step (template_id, step_number),
          INDEX idx_assignee_role (assignee_role_id),
          CONSTRAINT fk_acn_template FOREIGN KEY (template_id) REFERENCES approval_chain_templates(template_id) ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_acn_role FOREIGN KEY (assignee_role_id) REFERENCES roles(role_id) ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT fk_acn_user FOREIGN KEY (assignee_user_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT fk_acn_escalate FOREIGN KEY (escalate_to_node) REFERENCES approval_chain_nodes(node_id) ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核链节点定义';
      `, { transaction })

      // ========== 表 3: approval_chain_instances ==========
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS approval_chain_instances (
          instance_id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '实例ID',
          template_id                BIGINT       NOT NULL                COMMENT '使用的模板',
          auditable_type             VARCHAR(50)  NOT NULL                COMMENT '业务类型',
          auditable_id               BIGINT       NOT NULL                COMMENT '业务记录ID',
          content_review_record_id   BIGINT       NULL                    COMMENT '关联的审核记录',
          current_step               TINYINT      NOT NULL                COMMENT '当前进行到的步骤',
          total_steps                TINYINT      NOT NULL                COMMENT '总步骤数',
          status                     ENUM('in_progress','completed','rejected','cancelled','timeout') NOT NULL COMMENT '整体状态',
          submitted_by               INT          NOT NULL                COMMENT '提交人',
          submitted_at               DATETIME     NOT NULL                COMMENT '提交时间',
          completed_at               DATETIME     NULL                    COMMENT '完成时间',
          final_result               ENUM('approved','rejected') NULL     COMMENT '最终结果',
          final_reason               TEXT         NULL                    COMMENT '最终审批意见',
          business_snapshot          JSON         NULL                    COMMENT '提交时的业务数据快照',
          idempotency_key            VARCHAR(100) NOT NULL                COMMENT '幂等键',
          created_at                 DATETIME     NOT NULL                COMMENT '创建时间',
          updated_at                 DATETIME     NOT NULL                COMMENT '更新时间',
          PRIMARY KEY (instance_id),
          UNIQUE KEY uk_idempotency_key (idempotency_key),
          INDEX idx_auditable (auditable_type, auditable_id),
          INDEX idx_status_step (status, current_step),
          INDEX idx_submitted_by (submitted_by),
          CONSTRAINT fk_aci_template FOREIGN KEY (template_id) REFERENCES approval_chain_templates(template_id) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT fk_aci_review FOREIGN KEY (content_review_record_id) REFERENCES content_review_records(content_review_record_id) ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT fk_aci_submitter FOREIGN KEY (submitted_by) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核链实例';
      `, { transaction })

      // ========== 表 4: approval_chain_steps ==========
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS approval_chain_steps (
          step_id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '步骤ID',
          instance_id          BIGINT       NOT NULL                COMMENT '所属实例',
          node_id              BIGINT       NOT NULL                COMMENT '对应的节点定义',
          step_number          TINYINT      NOT NULL                COMMENT '步骤编号',
          assignee_user_id     INT          NULL                    COMMENT '实际被分配的审核人',
          assignee_role_id     INT          NULL                    COMMENT '分配的角色（角色池模式）',
          status               ENUM('waiting','pending','approved','rejected','skipped','timeout') NOT NULL COMMENT '步骤状态',
          action_reason        TEXT         NULL                    COMMENT '审批意见',
          actioned_by          INT          NULL                    COMMENT '实际操作人',
          actioned_at          DATETIME     NULL                    COMMENT '操作时间',
          is_final             TINYINT(1)   NOT NULL                COMMENT '是否终审步骤',
          timeout_at           DATETIME     NULL                    COMMENT '超时截止时间',
          auto_approved        TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '是否自动审批通过',
          created_at           DATETIME     NOT NULL                COMMENT '创建时间',
          updated_at           DATETIME     NOT NULL                COMMENT '更新时间',
          PRIMARY KEY (step_id),
          INDEX idx_instance_step (instance_id, step_number),
          INDEX idx_assignee_user_status (assignee_user_id, status),
          INDEX idx_assignee_role_status (assignee_role_id, status),
          INDEX idx_timeout (timeout_at),
          CONSTRAINT fk_acs_instance FOREIGN KEY (instance_id) REFERENCES approval_chain_instances(instance_id) ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_acs_node FOREIGN KEY (node_id) REFERENCES approval_chain_nodes(node_id) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT fk_acs_assignee_user FOREIGN KEY (assignee_user_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT fk_acs_assignee_role FOREIGN KEY (assignee_role_id) REFERENCES roles(role_id) ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT fk_acs_actioned_by FOREIGN KEY (actioned_by) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核链步骤执行记录';
      `, { transaction })

      await transaction.commit()
      console.log('✅ 审核链4张表创建成功')
    } catch (err) {
      await transaction.rollback()
      throw err
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS approval_chain_steps', { transaction })
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS approval_chain_instances', { transaction })
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS approval_chain_nodes', { transaction })
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS approval_chain_templates', { transaction })
      await transaction.commit()
      console.log('✅ 审核链4张表已回滚删除')
    } catch (err) {
      await transaction.rollback()
      throw err
    }
  }
}
