'use strict'

/**
 * 迁移：审核链分级升级（会签 + 门店/区域隔离 + 越级/超时留痕 + 会签子记录表）
 *
 * 背景（2026-06-20 分级审核链升级方案，已连真实库 restaurant_points_dev 核对）：
 *   1. 节点定义 approval_chain_nodes 缺会签配置字段 → 加 approve_mode / required_approvals
 *   2. 步骤执行 approval_chain_steps 缺门店冗余 / 会签计数 / 越级留痕字段
 *   3. 缺"一步多人审批"的会签子记录表 → 新建 approval_chain_step_actions
 *
 * 变更说明（按 up 执行顺序）：
 *   ① approval_chain_nodes 加 approve_mode(single/countersign) + required_approvals
 *   ② approval_chain_steps 加 store_id / approve_mode / required_approvals / approved_count /
 *      is_escalated / original_assignee_role_id / escalated_from_user_id
 *   ③ 新建 approval_chain_step_actions（会签子记录，一步多人审批，DB 唯一约束防重复投票）
 *
 * 存量兼容：现有 in_progress 实例的 step 默认 approve_mode='single'/required_approvals=1/
 *   approved_count=0，老单签逻辑等价不变（字段默认值已保证，无需额外回填）。
 *
 * 全字段 snake_case；外键 DB 层强约束（ON DELETE RESTRICT）；charset utf8mb4_unicode_ci。
 * 幂等：加列前用 describeTable 判断是否已存在，重复执行安全。
 *
 * @version 1.0.0
 * @date 2026-06-20
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      const nodeCols = await queryInterface.describeTable('approval_chain_nodes')
      const stepCols = await queryInterface.describeTable('approval_chain_steps')

      // ========== ① approval_chain_nodes：会签配置 ==========
      if (!nodeCols.approve_mode) {
        await queryInterface.addColumn(
          'approval_chain_nodes',
          'approve_mode',
          {
            type: Sequelize.ENUM('single', 'countersign'),
            allowNull: false,
            defaultValue: 'single',
            comment: '审批模式：single=单签（一人通过即推进），countersign=会签（需 N 人通过）'
          },
          { transaction }
        )
      }
      if (!nodeCols.required_approvals) {
        await queryInterface.addColumn(
          'approval_chain_nodes',
          'required_approvals',
          {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: '会签需通过人数（single 恒为 1；countersign 为需凑够的 approve 人数）'
          },
          { transaction }
        )
      }

      // ========== ② approval_chain_steps：门店冗余 + 会签计数 + 越级留痕 ==========
      if (!stepCols.store_id) {
        await queryInterface.addColumn(
          'approval_chain_steps',
          'store_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '该步所属门店（来源 consumption_records.store_id），门店隔离校验与统计免回查'
          },
          { transaction }
        )
      }
      if (!stepCols.approve_mode) {
        await queryInterface.addColumn(
          'approval_chain_steps',
          'approve_mode',
          {
            type: Sequelize.ENUM('single', 'countersign'),
            allowNull: false,
            defaultValue: 'single',
            comment: '审批模式（实例化时从节点固化）：single=单签，countersign=会签'
          },
          { transaction }
        )
      }
      if (!stepCols.required_approvals) {
        await queryInterface.addColumn(
          'approval_chain_steps',
          'required_approvals',
          {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: '会签需通过人数（实例化时从节点固化，single 恒为 1）'
          },
          { transaction }
        )
      }
      if (!stepCols.approved_count) {
        await queryInterface.addColumn(
          'approval_chain_steps',
          'approved_count',
          {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '会签已通过人数（凑够 required_approvals 才推进）'
          },
          { transaction }
        )
      }
      if (!stepCols.is_escalated) {
        await queryInterface.addColumn(
          'approval_chain_steps',
          'is_escalated',
          {
            type: Sequelize.TINYINT,
            allowNull: false,
            defaultValue: 0,
            comment: '是否越级/超时升级代审（1=该步由上级越级或超时转交代审）'
          },
          { transaction }
        )
      }
      if (!stepCols.original_assignee_role_id) {
        await queryInterface.addColumn(
          'approval_chain_steps',
          'original_assignee_role_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '越级时原应审角色ID（留痕，记录本应由谁审）'
          },
          { transaction }
        )
      }
      if (!stepCols.escalated_from_user_id) {
        await queryInterface.addColumn(
          'approval_chain_steps',
          'escalated_from_user_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '由谁超时/越级转交而来（留痕，记录原审核人）'
          },
          { transaction }
        )
      }

      // store_id 查询索引（门店隔离校验与统计）
      const stepIndexes = await queryInterface.showIndex('approval_chain_steps', { transaction })
      const hasStoreIdx = stepIndexes.some(i => i.name === 'idx_acs_store_status')
      if (!hasStoreIdx) {
        await queryInterface.addIndex('approval_chain_steps', {
          fields: ['store_id', 'status'],
          name: 'idx_acs_store_status',
          transaction
        })
      }

      // ========== ③ 新建会签子记录表 approval_chain_step_actions ==========
      const tables = await queryInterface.showAllTables({ transaction })
      const hasActionsTable = tables
        .map(t => (typeof t === 'string' ? t : t.tableName))
        .includes('approval_chain_step_actions')
      if (!hasActionsTable) {
        await queryInterface.createTable(
          'approval_chain_step_actions',
          {
            step_action_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '会签子记录主键ID'
            },
            step_id: {
              type: Sequelize.BIGINT,
              allowNull: false,
              references: { model: 'approval_chain_steps', key: 'step_id' },
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE',
              comment: '所属审核步骤ID（外键 → approval_chain_steps.step_id，DB层强约束）'
            },
            actioned_by: {
              type: Sequelize.INTEGER,
              allowNull: false,
              comment: '审核操作人 user_id'
            },
            action: {
              type: Sequelize.ENUM('approve', 'reject'),
              allowNull: false,
              comment: '审核动作：approve=通过，reject=拒绝'
            },
            action_reason: {
              type: Sequelize.TEXT,
              allowNull: true,
              comment: '审批意见'
            },
            is_escalated: {
              type: Sequelize.TINYINT,
              allowNull: false,
              defaultValue: 0,
              comment: '该条审批是否为越级/超时代审'
            },
            actioned_at: {
              type: Sequelize.DATE,
              allowNull: false,
              comment: '审核时间（北京时间）'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '创建时间'
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '更新时间'
            }
          },
          {
            transaction,
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            comment: '审核链会签子记录表（一步多人审批，DB唯一约束防重复投票）'
          }
        )

        // 唯一约束：同一人对同一步只能投一次（DB 层幂等兜底）
        await queryInterface.addIndex('approval_chain_step_actions', {
          fields: ['step_id', 'actioned_by'],
          unique: true,
          name: 'uk_step_actor',
          transaction
        })
        // 按步骤聚合查询索引
        await queryInterface.addIndex('approval_chain_step_actions', {
          fields: ['step_id'],
          name: 'idx_acsa_step',
          transaction
        })
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // ③ 删除会签子记录表（先删，因有外键指向 steps）
      await queryInterface.dropTable('approval_chain_step_actions', { transaction })

      // ② 回滚 approval_chain_steps 新增列与索引
      await queryInterface
        .removeIndex('approval_chain_steps', 'idx_acs_store_status', { transaction })
        .catch(() => {})
      for (const col of [
        'store_id',
        'approve_mode',
        'required_approvals',
        'approved_count',
        'is_escalated',
        'original_assignee_role_id',
        'escalated_from_user_id'
      ]) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.removeColumn('approval_chain_steps', col, { transaction }).catch(() => {})
      }

      // ① 回滚 approval_chain_nodes 新增列
      await queryInterface
        .removeColumn('approval_chain_nodes', 'required_approvals', { transaction })
        .catch(() => {})
      await queryInterface
        .removeColumn('approval_chain_nodes', 'approve_mode', { transaction })
        .catch(() => {})

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
