'use strict'

/**
 * 数据库迁移：创建 lottery_alerts 抽奖告警表
 *
 * @description 创建抽奖系统专用的告警表，独立于商家风控的 risk_alerts 表
 *              用于运营监控、异常检测、系统健康状态监控
 *
 * @date 2026-01-29
 * @author 后端开发
 *
 * 设计决策（来源：需求文档 决策6）：
 * - 独立于商家风控的 risk_alerts 表（字段重叠度 < 20%）
 * - 专用于抽奖系统，包含 campaign_id、阈值偏差等专用字段
 * - 职责分离，便于独立演进
 *
 * 告警类型：
 * - win_rate: 中奖率异常
 * - budget: 预算告警
 * - inventory: 库存告警
 * - user: 用户异常
 * - system: 系统告警
 *
 * 告警状态流转：
 * - active: 待处理（新告警默认状态）
 * - acknowledged: 已确认（运营已知晓）
 * - resolved: 已解决（问题已处理）
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🆕 开始创建 lottery_alerts 表...')

    // 检查表是否已存在
    const tableExists = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'lottery_alerts'",
      { type: Sequelize.QueryTypes.SELECT }
    )

    if (tableExists[0].count > 0) {
      console.log('⚠️ lottery_alerts 表已存在，跳过创建')
      return
    }

    // 创建表
    await queryInterface.createTable('lottery_alerts', {
      // ==================== 主键 ====================
      alert_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '告警ID（主键，自增）'
      },

      // ==================== 业务关联 ====================
      campaign_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '关联的抽奖活动ID（外键）',
        references: {
          model: 'lottery_campaigns',
          key: 'campaign_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },

      // ==================== 告警基础信息 ====================
      alert_type: {
        type: Sequelize.ENUM('win_rate', 'budget', 'inventory', 'user', 'system'),
        allowNull: false,
        comment: '告警类型：win_rate=中奖率异常 | budget=预算告警 | inventory=库存告警 | user=用户异常 | system=系统告警'
      },

      severity: {
        type: Sequelize.ENUM('info', 'warning', 'danger'),
        allowNull: false,
        comment: '告警严重程度：info=提示 | warning=警告 | danger=严重'
      },

      status: {
        type: Sequelize.ENUM('active', 'acknowledged', 'resolved'),
        allowNull: false,
        defaultValue: 'active',
        comment: '告警状态：active=待处理 | acknowledged=已确认 | resolved=已解决'
      },

      // ==================== 告警详情 ====================
      rule_code: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: '规则代码（如 RULE_001、WIN_RATE_HIGH）'
      },

      threshold_value: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: true,
        comment: '阈值（规则定义的期望值）'
      },

      actual_value: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: true,
        comment: '实际值（触发告警时的实际数值）'
      },

      message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '告警消息（人类可读的描述）'
      },

      // ==================== 处理信息 ====================
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '解决时间（北京时间）'
      },

      resolved_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '处理人ID（外键，关联 users.user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },

      resolve_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '处理备注'
      },

      // ==================== 时间戳 ====================
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间（北京时间）'
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: '更新时间（北京时间）'
      }
    }, {
      comment: '抽奖系统告警表 - 运营监控专用（独立于商家风控的 risk_alerts）',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    })

    console.log('✅ lottery_alerts 表创建完成')

    // 创建索引
    console.log('📇 创建索引...')

    // 索引1：按活动和状态查询告警
    await queryInterface.addIndex('lottery_alerts', ['campaign_id', 'status'], {
      name: 'idx_campaign_status',
      comment: '按活动和状态查询告警'
    })
    console.log('  ✅ idx_campaign_status')

    // 索引2：按状态和时间查询告警
    await queryInterface.addIndex('lottery_alerts', ['status', 'created_at'], {
      name: 'idx_status_created',
      comment: '按状态和时间查询告警'
    })
    console.log('  ✅ idx_status_created')

    // 索引3：按告警类型查询
    await queryInterface.addIndex('lottery_alerts', ['alert_type'], {
      name: 'idx_alert_type',
      comment: '按告警类型查询'
    })
    console.log('  ✅ idx_alert_type')

    // 索引4：按严重程度查询
    await queryInterface.addIndex('lottery_alerts', ['severity'], {
      name: 'idx_severity',
      comment: '按严重程度查询'
    })
    console.log('  ✅ idx_severity')

    console.log('🎉 lottery_alerts 表迁移完成')
  },

  async down(queryInterface, Sequelize) {
    console.log('🗑️ 开始回滚 lottery_alerts 表...')

    // 检查表是否存在
    const tableExists = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'lottery_alerts'",
      { type: Sequelize.QueryTypes.SELECT }
    )

    if (tableExists[0].count === 0) {
      console.log('⚠️ lottery_alerts 表不存在，跳过删除')
      return
    }

    // 删除表（会自动删除索引）
    await queryInterface.dropTable('lottery_alerts')
    console.log('✅ lottery_alerts 表已删除')
  }
}

