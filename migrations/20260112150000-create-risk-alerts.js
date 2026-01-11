/**
 * 迁移文件：创建风控告警表 (risk_alerts)
 *
 * 业务背景（2026-01-12 商家员工域权限体系升级方案）：
 * - 支持商家域风控功能的告警记录
 * - 记录频次阻断、金额告警、关联告警等风控事件
 * - 供管理员后台查看和复核
 *
 * 表结构设计：
 * - alert_id: 主键
 * - alert_type: 告警类型（frequency_limit/amount_limit/duplicate_user/suspicious_pattern）
 * - severity: 严重程度（low/medium/high/critical）
 * - operator_id: 操作员ID（触发告警的员工）
 * - store_id: 门店ID
 * - target_user_id: 目标用户ID（被录入消费的用户）
 * - related_record_id: 关联消费记录ID
 * - rule_name: 触发的规则名称
 * - rule_threshold: 规则阈值
 * - actual_value: 实际值
 * - alert_message: 告警消息
 * - is_blocked: 是否阻断提交
 * - status: 状态（pending/reviewed/ignored）
 * - reviewed_by: 复核人ID
 * - review_notes: 复核备注
 * - reviewed_at: 复核时间
 * - created_at: 创建时间
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - AC5 风控规则
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：创建风控告警表 (risk_alerts)')

    // =================================================================
    // 步骤1：检查表是否已存在
    // =================================================================
    const [existingTables] = await queryInterface.sequelize.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'risk_alerts'
    `)

    if (existingTables.length > 0) {
      console.log('✅ risk_alerts 表已存在，跳过创建')
      return
    }

    // =================================================================
    // 步骤2：创建 risk_alerts 表
    // =================================================================
    console.log('正在创建 risk_alerts 表...')

    await queryInterface.createTable('risk_alerts', {
      alert_id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        comment: '告警ID（主键）'
      },
      alert_type: {
        type: Sequelize.ENUM(
          'frequency_limit',
          'amount_limit',
          'duplicate_user',
          'suspicious_pattern'
        ),
        allowNull: false,
        comment:
          '告警类型：frequency_limit-频次超限、amount_limit-金额超限、duplicate_user-用户被多店录入、suspicious_pattern-可疑模式'
      },
      severity: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
        allowNull: false,
        defaultValue: 'medium',
        comment: '严重程度：low-低、medium-中、high-高、critical-严重'
      },
      operator_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '操作员ID（触发告警的员工），外键关联 users.user_id',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      store_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '门店ID，外键关联 stores.store_id',
        references: {
          model: 'stores',
          key: 'store_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      target_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '目标用户ID（被录入消费的用户），外键关联 users.user_id',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      related_record_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '关联消费记录ID，外键关联 consumption_records.record_id'
      },
      rule_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '触发的规则名称（如 frequency_limit、single_amount_limit、duplicate_user_check）'
      },
      rule_threshold: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: '规则阈值（如 10次/60秒、5000元/笔、3个门店/10分钟）'
      },
      actual_value: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: '实际值（如 12次/60秒、8000元、5个门店）'
      },
      alert_message: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: '告警消息（人类可读的完整描述）'
      },
      is_blocked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否阻断提交：true-硬阻断（如频次超限）、false-仅告警（如金额告警）'
      },
      status: {
        type: Sequelize.ENUM('pending', 'reviewed', 'ignored'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '状态：pending-待处理、reviewed-已复核、ignored-已忽略'
      },
      reviewed_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '复核人ID，外键关联 users.user_id',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      review_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '复核备注'
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '复核时间，时区：北京时间（GMT+8）'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间，时区：北京时间（GMT+8）'
      }
    })

    console.log('✅ 成功创建 risk_alerts 表')

    // =================================================================
    // 步骤3：创建索引
    // =================================================================
    console.log('正在创建索引...')

    // 按状态+时间查询（管理员查看待处理告警）
    await queryInterface.addIndex('risk_alerts', ['status', 'created_at'], {
      name: 'idx_risk_alerts_status_created'
    })
    console.log('   ✅ idx_risk_alerts_status_created')

    // 按告警类型查询
    await queryInterface.addIndex('risk_alerts', ['alert_type'], {
      name: 'idx_risk_alerts_type'
    })
    console.log('   ✅ idx_risk_alerts_type')

    // 按操作员查询（分析员工风险行为）
    await queryInterface.addIndex('risk_alerts', ['operator_id', 'created_at'], {
      name: 'idx_risk_alerts_operator'
    })
    console.log('   ✅ idx_risk_alerts_operator')

    // 按门店查询（分析门店风险情况）
    await queryInterface.addIndex('risk_alerts', ['store_id', 'created_at'], {
      name: 'idx_risk_alerts_store'
    })
    console.log('   ✅ idx_risk_alerts_store')

    // 按目标用户查询（分析用户被录入情况）
    await queryInterface.addIndex('risk_alerts', ['target_user_id'], {
      name: 'idx_risk_alerts_target_user'
    })
    console.log('   ✅ idx_risk_alerts_target_user')

    // 按严重程度+状态查询（优先处理高风险告警）
    await queryInterface.addIndex('risk_alerts', ['severity', 'status'], {
      name: 'idx_risk_alerts_severity_status'
    })
    console.log('   ✅ idx_risk_alerts_severity_status')

    // =================================================================
    // 步骤4：验证迁移结果
    // =================================================================
    console.log('\n📊 验证迁移结果...')

    const [tableCheck] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'risk_alerts'
    `)
    console.log(`   表创建: ${tableCheck[0].count > 0 ? '✅' : '❌'}`)

    const [indexCheck] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'risk_alerts'
      GROUP BY INDEX_NAME
    `)
    console.log(`   索引数量: ${indexCheck.length}`)
    indexCheck.forEach(idx => {
      console.log(`   - ${idx.INDEX_NAME}`)
    })

    console.log('\n✅ 风控告警表创建迁移完成')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('📝 开始回滚：删除风控告警表 (risk_alerts)')

    // 先删除索引
    console.log('正在删除索引...')
    try {
      await queryInterface.removeIndex('risk_alerts', 'idx_risk_alerts_status_created')
      await queryInterface.removeIndex('risk_alerts', 'idx_risk_alerts_type')
      await queryInterface.removeIndex('risk_alerts', 'idx_risk_alerts_operator')
      await queryInterface.removeIndex('risk_alerts', 'idx_risk_alerts_store')
      await queryInterface.removeIndex('risk_alerts', 'idx_risk_alerts_target_user')
      await queryInterface.removeIndex('risk_alerts', 'idx_risk_alerts_severity_status')
      console.log('✅ 索引删除成功')
    } catch (error) {
      console.log('⚠️ 索引删除时出现警告（可能不存在）:', error.message)
    }

    // 删除表
    console.log('正在删除 risk_alerts 表...')
    await queryInterface.dropTable('risk_alerts')

    console.log('\n✅ 风控告警表回滚完成')
  }
}
