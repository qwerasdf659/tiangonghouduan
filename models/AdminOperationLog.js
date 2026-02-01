/**
 * 餐厅积分抽奖系统 V4.0 - 管理员操作日志模型（AdminOperationLog）
 *
 * ⚠️⚠️⚠️ 重要区分说明 ⚠️⚠️⚠️
 * 本模型是 AdminOperationLog（管理员操作日志），不是 ContentReviewRecord（内容审核记录）
 *
 * 📋 AdminOperationLog vs ContentReviewRecord 核心区别：
 *
 * ✅ AdminOperationLog（本模型）：管理员操作日志 - 追溯管理员操作历史
 *    - 概念：记录"谁在什么时候做了什么操作"的日志
 *    - 特点：只增不改，永久保存，用于安全审计和责任追溯
 *    - 数据状态：不可修改、不可删除（immutable）
 *    - 业务流程：无状态变化，写入后就是最终状态
 *    - 典型字段：operator_id（操作员）、operation_type（操作类型）、before_data/after_data（前后数据对比）
 *    - 表名：admin_operation_logs，主键：log_id
 *
 * ❌ ContentReviewRecord（另一个模型）：内容审核记录 - 管理业务审核流程
 *    - 概念：记录"需要人工审核的业务内容"的审核状态
 *    - 特点：有状态流转，可修改状态（pending→approved/rejected）
 *    - 数据状态：可修改审核状态和审核意见
 *    - 业务流程：pending（待审核）→ approved/rejected（已审核）
 *    - 典型字段：auditor_id（审核员）、audit_status（审核状态）、audit_reason（审核意见）
 *    - 表名：content_review_records，主键：audit_id
 *
 * 📌 记忆口诀：
 * - AdminOperationLog = 管理员操作日志 = 追溯历史 = 只增不改 = 谁做了什么
 * - ContentReviewRecord = 内容审核记录 = 流程管理 = 状态流转 = 待审核→已审核
 *
 * 功能说明：
 * - 记录所有敏感操作的审计日志
 * - 追溯管理员操作历史
 * - 支持操作前后数据对比
 * - 记录IP地址、用户代理等安全信息
 *
 * 业务场景：
 * - 积分调整审计（谁修改了用户积分）
 * - 兑换审核审计（谁审核通过/拒绝了兑换申请）
 * - 商品配置审计（谁修改了商品配置）
 * - 用户状态变更审计（谁冻结/解冻了用户）
 * - 奖品配置审计（谁修改了奖品配置）
 * - 抽奖管理审计（强制中奖、概率调整等 - V4.5.0新增）
 *
 * 设计模式：
 * - 不可修改：审计日志只能创建，不能修改或删除
 * - 完整记录：记录操作前后的完整数据
 * - 多维索引：支持按操作员、操作类型、目标对象等多维度查询
 *
 * ENUM来源：
 * - 统一枚举定义文件：constants/AuditOperationTypes.js
 * - 确保模型、服务、迁移文件引用同一来源
 *
 * 创建时间：2025-10-12
 * 最后更新：2026-01-08（V4.5.0 审计统一入口整合 - 使用统一枚举定义）
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')
const { DB_ENUM_VALUES, getOperationTypeDescription } = require('../constants/AuditOperationTypes')

module.exports = sequelize => {
  const AdminOperationLog = sequelize.define(
    'AdminOperationLog',
    {
      // 主键
      admin_operation_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '审计日志ID'
      },

      // 操作员信息
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '操作员ID（管理员user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT' // 不允许删除有审计日志的用户
      },

      // 操作类型（来源：constants/AuditOperationTypes.js 统一枚举定义）
      operation_type: {
        type: DataTypes.ENUM(...DB_ENUM_VALUES),
        allowNull: false,
        comment: '操作类型（V4.5.0统一枚举定义 - 详见 constants/AuditOperationTypes.js）'
      },

      // 目标对象信息
      target_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '目标对象类型（统一snake_case资源码，如 user/account_asset_balance/item_instance）'
      },
      target_type_raw: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '原始 target_type 值（P0-5用于审计追溯，保存PascalCase/历史遗留名等原始输入值）'
      },
      target_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '目标对象ID'
      },

      // 操作动作
      action: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '操作动作（create/update/delete/approve/reject/freeze/unfreeze）'
      },

      // 操作前后数据
      before_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '操作前数据（JSON格式，完整记录变更前的状态）'
      },
      after_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '操作后数据（JSON格式，完整记录变更后的状态）'
      },

      // 变更字段
      changed_fields: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '变更字段列表（仅包含实际变更的字段，格式: [{field: "field_name", old_value: ..., new_value: ...}]）'
      },

      // 操作原因
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '操作原因/备注'
      },

      // 安全信息
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IP地址（支持IPv4和IPv6）'
      },
      user_agent: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '用户代理字符串（浏览器信息）'
      },

      // 幂等键（业界标准形态 - 2026-01-02）
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '幂等键（业界标准命名 - 必填），用于关联业务操作（如兑换单号、交易单号等）'
      },

      // ========== P2阶段新增字段（2026-01-31 回滚支持和风险标记） ==========

      // 回滚相关字段
      is_reversible: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否可回滚（部分操作支持一键回滚）'
      },
      reversal_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '回滚所需数据（用于执行回滚操作的完整数据）'
      },
      is_reversed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否已回滚'
      },
      reversed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '回滚执行时间'
      },
      reversed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '回滚操作者ID'
      },

      // 风险和审批相关字段
      risk_level: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
        allowNull: false,
        defaultValue: 'low',
        comment: '操作风险等级'
      },
      requires_approval: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否需要二次审批（高风险操作）'
      },
      approval_status: {
        type: DataTypes.ENUM('not_required', 'pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'not_required',
        comment: '审批状态'
      },

      // ========== P2阶段补充字段（2026-02-01 影响评估和回滚时限） ==========

      /**
       * 影响用户数
       * @type {number|null}
       * 用于评估操作影响范围，如批量操作时记录影响的用户数量
       */
      affected_users: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: '影响用户数（用于评估操作影响范围）'
      },

      /**
       * 影响金额/积分数
       * @type {number|null}
       * 单位：分，用于评估财务影响
       */
      affected_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: 0,
        comment: '影响金额/积分数（分为单位，用于评估财务影响）'
      },

      /**
       * 回滚截止时间
       * @type {Date|null}
       * 超过此时间后即使 is_reversible 为 true 也不可回滚
       */
      rollback_deadline: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '回滚截止时间（超时后不可回滚，与 is_reversible 配合使用）'
      },

      // 时间字段
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '操作时间',
        /**
         * 获取北京时间格式的操作时间
         * @returns {string} 北京时间格式的日期字符串（YYYY年MM月DD日 HH:mm:ss）
         */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        }
      }
    },
    {
      sequelize,
      modelName: 'AdminOperationLog',
      tableName: 'admin_operation_logs',
      timestamps: false, // 只有created_at，没有updated_at（审计日志不可修改）
      underscored: true,
      comment: '操作审计日志表（记录所有敏感操作）',

      indexes: [
        {
          name: 'idx_audit_logs_operator',
          fields: ['operator_id'],
          comment: '操作员索引'
        },
        {
          name: 'idx_audit_logs_operation_type',
          fields: ['operation_type'],
          comment: '操作类型索引'
        },
        {
          name: 'idx_audit_logs_target',
          fields: ['target_type', 'target_id'],
          comment: '目标对象索引'
        },
        {
          name: 'idx_audit_logs_created',
          fields: ['created_at'],
          comment: '创建时间索引'
        },
        {
          name: 'idx_audit_logs_idempotency_key',
          fields: ['idempotency_key'],
          comment: '幂等键索引（业界标准形态）'
        },
        {
          name: 'idx_audit_logs_ip',
          fields: ['ip_address'],
          comment: 'IP地址索引'
        }
      ],

      hooks: {
        beforeCreate: record => {
          record.created_at = BeijingTimeHelper.createDatabaseTime()
        }
      }
    }
  )

  /**
   * 实例方法
   */

  /**
   * 获取操作类型描述
   *
   * @description 使用统一枚举定义获取操作类型的中文描述
   * @returns {string} 操作类型的中文描述（积分调整/兑换审核/商品修改等）
   *
   * 来源：constants/AuditOperationTypes.js - OPERATION_TYPE_DESCRIPTIONS
   */
  AdminOperationLog.prototype.getOperationTypeDescription = function () {
    // 使用统一枚举定义的描述映射（单一真相源）
    return getOperationTypeDescription(this.operation_type)
  }

  /**
   * 获取操作动作描述
   * @returns {string} 操作动作的中文描述（创建/修改/删除/审核通过等）
   */
  AdminOperationLog.prototype.getActionDescription = function () {
    const actionMap = {
      create: '创建',
      update: '修改',
      delete: '删除',
      approve: '审核通过',
      reject: '审核拒绝',
      freeze: '冻结',
      unfreeze: '解冻',
      assign: '分配',
      remove: '移除'
    }
    return actionMap[this.action] || this.action
  }

  /**
   * 格式化变更字段（用于展示）
   * @returns {string} 格式化后的变更字段描述（field: old_value → new_value）
   */
  AdminOperationLog.prototype.formatChangedFields = function () {
    if (!this.changed_fields || this.changed_fields.length === 0) {
      return '无变更'
    }

    return this.changed_fields
      .map(change => {
        return `${change.field}: ${JSON.stringify(change.old_value)} → ${JSON.stringify(change.new_value)}`
      })
      .join('; ')
  }

  /**
   * 获取完整的审计描述
   * @returns {string} 完整的审计日志描述（操作类型 - 操作动作: 目标对象 (变更内容)）
   */
  AdminOperationLog.prototype.getFullDescription = function () {
    const operationType = this.getOperationTypeDescription()
    const action = this.getActionDescription()
    const changes = this.formatChangedFields()

    return `${operationType} - ${action}: ${this.target_type}#${this.target_id} (${changes})`
  }

  /**
   * 关联关系定义
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  AdminOperationLog.associate = function (models) {
    // 关联操作员（用户）
    AdminOperationLog.belongsTo(models.User, {
      foreignKey: 'operator_id',
      as: 'operator',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  }

  /**
   * 类方法：比较两个对象并生成changed_fields
   *
   * 空值安全：支持 beforeObj/afterObj 为 null/undefined 的场景
   *
   * @param {Object|null} beforeObj - 变更前的对象数据（可为null）
   * @param {Object|null} afterObj - 变更后的对象数据（可为null）
   * @param {Array<string>|null} fieldList - 需要比较的字段列表，null则比较所有字段
   * @returns {Array<Object>} 变更字段数组 [{field, old_value, new_value}, ...]
   */
  AdminOperationLog.compareObjects = function (beforeObj, afterObj, fieldList = null) {
    const changedFields = []

    // P0修复：空值安全保护 - 当两个对象都为空时返回空数组
    if (!beforeObj && !afterObj) {
      return changedFields
    }

    // 确定要比较的字段列表（优先级：显式指定 > afterObj的字段 > beforeObj的字段）
    let fieldsToCompare
    if (fieldList) {
      fieldsToCompare = fieldList
    } else if (afterObj && typeof afterObj === 'object') {
      fieldsToCompare = Object.keys(afterObj)
    } else if (beforeObj && typeof beforeObj === 'object') {
      fieldsToCompare = Object.keys(beforeObj)
    } else {
      // 两个都不是有效对象，返回空数组
      return changedFields
    }

    fieldsToCompare.forEach(field => {
      const oldValue = beforeObj ? beforeObj[field] : null
      const newValue = afterObj ? afterObj[field] : null

      // 深度比较（处理JSON字段）
      const oldStr = JSON.stringify(oldValue)
      const newStr = JSON.stringify(newValue)

      if (oldStr !== newStr) {
        changedFields.push({
          field,
          old_value: oldValue,
          new_value: newValue
        })
      }
    })

    return changedFields
  }

  return AdminOperationLog
}
