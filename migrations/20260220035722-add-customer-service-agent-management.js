'use strict'

/**
 * 迁移：创建客服座席管理和用户分配表
 *
 * 业务背景：
 * - 现有客服系统仅通过 customer_service_sessions.admin_id 关联客服，缺少座席管理能力
 * - 需要支持：客服座席注册/配置、用户持久分配、工作负载管理
 *
 * 新增表：
 * 1. customer_service_agents — 客服座席表（谁是客服、最大并发、状态、优先级）
 * 2. customer_service_user_assignments — 用户-客服分配表（用户绑定到指定客服）
 *
 * 设计决策：
 * - customer_service_agents.user_id UNIQUE：一个用户只能注册为一个客服座席
 * - customer_service_user_assignments 允许同一用户被多次分配（历史记录），但 active 状态唯一
 * - 外键约束使用 RESTRICT 保护关键业务数据
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /* ========== 1. 创建 customer_service_agents 表 ========== */

    const agentTableExists = await queryInterface.describeTable('customer_service_agents').catch(() => null)
    if (!agentTableExists) {
      await queryInterface.createTable('customer_service_agents', {
        customer_service_agent_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '客服座席主键ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: 'users', key: 'user_id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
          comment: '关联用户ID（一个用户只能注册为一个客服座席）'
        },
        display_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '客服显示名称（在客服工作台和用户端展示）'
        },
        max_concurrent_sessions: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 10,
          comment: '最大并发会话数（超过此数不再自动分配新会话）'
        },
        current_session_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '当前活跃会话数（反规范化字段，由业务逻辑维护）'
        },
        status: {
          type: Sequelize.ENUM('active', 'inactive', 'on_break'),
          allowNull: false,
          defaultValue: 'active',
          comment: '座席状态：active=在岗可分配、inactive=离线/停用、on_break=暂时休息'
        },
        specialty: {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment: '擅长领域标签（JSON数组字符串，如 ["售前咨询","技术支持","投诉处理"]）'
        },
        priority: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '分配优先级（数值越大越优先被分配）'
        },
        total_sessions_handled: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '累计处理会话总数'
        },
        average_satisfaction_score: {
          type: Sequelize.DECIMAL(3, 2),
          allowNull: false,
          defaultValue: 0.00,
          get() {
            const val = this.getDataValue('average_satisfaction_score')
            return val === null ? 0 : parseFloat(val)
          },
          comment: '平均满意度评分（1.00-5.00）'
        },
        is_auto_assign_enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否参与自动分配（false 则只能手动分配会话给该客服）'
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
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          comment: '更新时间'
        }
      }, {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '客服座席管理表（记录哪些用户是客服、配置、状态）'
      })

      /* 索引：座席状态 + 优先级（自动分配查询） */
      await queryInterface.addIndex('customer_service_agents', ['status', 'priority'], {
        name: 'idx_cs_agents_status_priority'
      })

      /* 索引：自动分配筛选 */
      await queryInterface.addIndex('customer_service_agents', ['is_auto_assign_enabled', 'status'], {
        name: 'idx_cs_agents_auto_assign'
      })

      console.log('✅ customer_service_agents 表创建成功')
    } else {
      console.log('⏭️  customer_service_agents 表已存在，跳过')
    }

    /* ========== 2. 创建 customer_service_user_assignments 表 ========== */

    const assignTableExists = await queryInterface.describeTable('customer_service_user_assignments').catch(() => null)
    if (!assignTableExists) {
      await queryInterface.createTable('customer_service_user_assignments', {
        customer_service_user_assignment_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '分配记录主键ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'user_id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
          comment: '被分配的用户ID（客户）'
        },
        agent_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'customer_service_agents', key: 'customer_service_agent_id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
          comment: '分配到的客服座席ID'
        },
        assigned_by: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'user_id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
          comment: '执行分配操作的管理员ID'
        },
        status: {
          type: Sequelize.ENUM('active', 'expired', 'transferred'),
          allowNull: false,
          defaultValue: 'active',
          comment: '分配状态：active=生效中、expired=已过期、transferred=已转移'
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '分配备注说明'
        },
        expired_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '过期时间（null 表示永不过期）'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '创建时间（即分配时间）'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          comment: '更新时间'
        }
      }, {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '客服用户分配表（记录用户被分配给哪个客服）'
      })

      /* 唯一约束：同一用户同时只能有一条 active 分配 */
      await queryInterface.addIndex('customer_service_user_assignments', ['user_id', 'status'], {
        name: 'uk_cs_user_assign_active',
        unique: true,
        where: { status: 'active' }
      })

      /* 索引：按客服座席查分配 */
      await queryInterface.addIndex('customer_service_user_assignments', ['agent_id', 'status'], {
        name: 'idx_cs_user_assign_agent'
      })

      /* 索引：按分配状态查询 */
      await queryInterface.addIndex('customer_service_user_assignments', ['status'], {
        name: 'idx_cs_user_assign_status'
      })

      console.log('✅ customer_service_user_assignments 表创建成功')
    } else {
      console.log('⏭️  customer_service_user_assignments 表已存在，跳过')
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('customer_service_user_assignments')
    console.log('✅ customer_service_user_assignments 表已删除')

    await queryInterface.dropTable('customer_service_agents')
    console.log('✅ customer_service_agents 表已删除')
  }
}
