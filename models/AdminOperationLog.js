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
 *
 * 设计模式：
 * - 不可修改：审计日志只能创建，不能修改或删除
 * - 完整记录：记录操作前后的完整数据
 * - 多维索引：支持按操作员、操作类型、目标对象等多维度查询
 *
 * 创建时间：2025-10-12
 * 最后更新：2025-10-12（添加与AuditRecord的详细区分说明）
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const AdminOperationLog = sequelize.define(
    'AdminOperationLog',
    {
      // 主键
      log_id: {
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

      // 操作类型
      operation_type: {
        type: DataTypes.ENUM(
          'points_adjust', // 积分调整（手动增加/减少积分）
          'exchange_audit', // 兑换审核（审核通过/拒绝）
          'product_update', // 商品修改（修改商品配置）
          'product_create', // 商品创建
          'product_delete', // 商品删除
          'user_status_change', // 用户状态变更（冻结/解冻）
          'prize_config', // 奖品配置（修改奖品配置）
          'prize_create', // 奖品创建
          'prize_delete', // 奖品删除
          'prize_stock_adjust', // 奖品库存调整（补充库存）
          'campaign_config', // 活动配置（修改活动配置）
          'role_assign', // 角色分配（给用户分配角色）
          'role_change', // 角色变更（修改用户角色）
          'system_config', // 系统配置修改
          'session_assign', // 客服会话分配（分配/取消/转移）
          'inventory_operation', // 库存操作（使用/核销/上架/下架）
          'inventory_transfer', // 物品转让（用户间物品转让）
          'consumption_audit' // 消费审核（审核通过/拒绝）
        ),
        allowNull: false,
        comment: '操作类型'
      },

      // 目标对象信息
      target_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '目标对象类型（User/Product/Prize/ExchangeRecord等）'
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
        allowNull: true,
        comment: '幂等键（业界标准命名），用于关联业务操作（如兑换单号、交易单号等）'
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
   * @returns {string} 操作类型的中文描述（积分调整/兑换审核/商品修改等）
   */
  AdminOperationLog.prototype.getOperationTypeDescription = function () {
    const typeMap = {
      points_adjust: '积分调整',
      exchange_audit: '兑换审核',
      product_update: '商品修改',
      product_create: '商品创建',
      product_delete: '商品删除',
      user_status_change: '用户状态变更',
      prize_config: '奖品配置',
      prize_create: '奖品创建',
      prize_delete: '奖品删除',
      prize_stock_adjust: '奖品库存调整',
      campaign_config: '活动配置',
      role_assign: '角色分配',
      role_change: '角色变更',
      system_config: '系统配置',
      session_assign: '客服会话分配',
      inventory_operation: '库存操作',
      inventory_transfer: '物品转让',
      consumption_audit: '消费审核'
    }
    return typeMap[this.operation_type] || '未知操作'
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
   * @param {Object} beforeObj - 变更前的对象数据
   * @param {Object} afterObj - 变更后的对象数据
   * @param {Array<string>|null} fieldList - 需要比较的字段列表，null则比较所有字段
   * @returns {Array<Object>} 变更字段数组 [{field, old_value, new_value}, ...]
   */
  AdminOperationLog.compareObjects = function (beforeObj, afterObj, fieldList = null) {
    const changedFields = []

    // 如果指定了字段列表，只比较这些字段；否则比较所有字段
    const fieldsToCompare = fieldList || Object.keys(afterObj)

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
