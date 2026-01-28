/**
 * 📋 批量操作日志表迁移
 * 创建时间：2026年01月30日 北京时间
 *
 * 业务职责：
 * - 记录所有批量操作的执行状态和结果
 * - 提供幂等性保障（通过唯一幂等键）
 * - 支持操作重试和状态追踪
 *
 * 技术决策来源（文档 6.4 节）：
 * - 采用美团幂等性方案：独立幂等表 + Redis/MySQL 双重校验
 * - 支持"部分成功"模式：单条操作独立事务，逐条处理
 * - 审计链路：通过 batch_log_id 关联到业务表
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：创建 batch_operation_logs 表
   * @param {QueryInterface} queryInterface - Sequelize 查询接口
   * @param {Sequelize} Sequelize - Sequelize 类型定义
   */
  async up(queryInterface, Sequelize) {
    console.log('🆕 开始创建 batch_operation_logs 表...')

    // 检查表是否已存在（幂等迁移）
    const tableExists = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'batch_operation_logs'",
      { type: Sequelize.QueryTypes.SELECT }
    )

    if (tableExists[0].count > 0) {
      console.log('⚠️ batch_operation_logs 表已存在，跳过创建')
      return
    }

    // 创建表结构
    await queryInterface.createTable(
      'batch_operation_logs',
      {
        // ==================== 主键 ====================
        batch_log_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '批量操作日志ID（主键，自增）'
        },

        // ==================== 幂等性控制 ====================
        idempotency_key: {
          type: Sequelize.STRING(128),
          allowNull: false,
          unique: true,
          comment: '幂等键（格式：{operation_type}:{operator_id}:{timestamp}:{hash}）- 防止重复提交'
        },

        // ==================== 操作类型 ====================
        operation_type: {
          type: Sequelize.ENUM(
            'quota_grant_batch', // B6: 批量赠送抽奖次数
            'preset_batch', // B7: 批量设置干预规则
            'redemption_verify_batch', // B8: 批量核销确认
            'campaign_status_batch', // B9: 批量活动状态切换
            'budget_adjust_batch' // B10: 批量预算调整
          ),
          allowNull: false,
          comment:
            '操作类型：quota_grant_batch=批量赠送抽奖次数 | preset_batch=批量设置干预规则 | redemption_verify_batch=批量核销确认 | campaign_status_batch=批量活动状态切换 | budget_adjust_batch=批量预算调整'
        },

        // ==================== 操作状态 ====================
        status: {
          type: Sequelize.ENUM(
            'processing', // 处理中
            'partial_success', // 部分成功
            'completed', // 全部成功
            'failed' // 全部失败
          ),
          allowNull: false,
          defaultValue: 'processing',
          comment: '操作状态：processing=处理中 | partial_success=部分成功 | completed=全部成功 | failed=全部失败'
        },

        // ==================== 统计计数 ====================
        total_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '总操作数量'
        },

        success_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '成功数量'
        },

        fail_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '失败数量'
        },

        // ==================== 操作参数与结果 ====================
        operation_params: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '操作参数JSON（存储原始请求参数，便于重试和审计）'
        },

        result_summary: {
          type: Sequelize.JSON,
          allowNull: true,
          comment:
            '结果摘要JSON（格式：{success_items: [{id, result}], failed_items: [{id, error}]}）'
        },

        // ==================== 操作人 ====================
        operator_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '操作人ID（外键，关联 users.user_id）',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },

        // ==================== 时间戳 ====================
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '创建时间（北京时间）'
        },

        completed_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '完成时间（北京时间）- 操作完成（无论成功/失败）时记录'
        },

        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          comment: '更新时间（北京时间）'
        }
      },
      {
        comment: '批量操作日志表 - 幂等性控制与操作审计（阶段C核心基础设施）',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
      }
    )

    console.log('✅ batch_operation_logs 表创建完成')

    // ==================== 创建索引 ====================
    console.log('📇 开始创建索引...')

    // 索引1: 幂等键唯一索引（已在字段定义中通过 unique: true 创建）
    // 额外添加显式索引以提高查询性能
    await queryInterface.addIndex('batch_operation_logs', ['idempotency_key'], {
      name: 'idx_batch_ops_idempotency_key',
      unique: true,
      comment: '幂等键唯一索引 - 确保同一操作不重复执行'
    })

    // 索引2: 操作人+时间联合索引（查询某用户的操作历史）
    await queryInterface.addIndex('batch_operation_logs', ['operator_id', 'created_at'], {
      name: 'idx_batch_ops_operator_created',
      comment: '操作人+时间索引 - 查询用户操作历史'
    })

    // 索引3: 状态索引（查询处理中/失败的操作用于重试）
    await queryInterface.addIndex('batch_operation_logs', ['status'], {
      name: 'idx_batch_ops_status',
      comment: '状态索引 - 支持按状态筛选（如查询失败任务用于重试）'
    })

    // 索引4: 操作类型+状态联合索引（按类型统计）
    await queryInterface.addIndex('batch_operation_logs', ['operation_type', 'status'], {
      name: 'idx_batch_ops_type_status',
      comment: '操作类型+状态索引 - 支持按类型和状态统计'
    })

    // 索引5: 创建时间索引（支持时间范围查询和清理旧数据）
    await queryInterface.addIndex('batch_operation_logs', ['created_at'], {
      name: 'idx_batch_ops_created_at',
      comment: '创建时间索引 - 支持时间范围查询和历史数据清理'
    })

    console.log('✅ batch_operation_logs 索引创建完成')
  },

  /**
   * 回滚迁移：删除 batch_operation_logs 表
   * @param {QueryInterface} queryInterface - Sequelize 查询接口
   * @param {Sequelize} Sequelize - Sequelize 类型定义
   */
  async down(queryInterface, Sequelize) {
    console.log('🗑️ 开始删除 batch_operation_logs 表...')

    // 检查表是否存在
    const tableExists = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'batch_operation_logs'",
      { type: Sequelize.QueryTypes.SELECT }
    )

    if (tableExists[0].count === 0) {
      console.log('⚠️ batch_operation_logs 表不存在，跳过删除')
      return
    }

    // 删除表（索引会随表一起删除）
    await queryInterface.dropTable('batch_operation_logs')

    console.log('✅ batch_operation_logs 表删除完成')
  }
}

