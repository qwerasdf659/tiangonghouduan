/**
 * 第2阶段数据库变更迁移文件（P2优先级）
 *
 * 包含任务：
 * - DB-3: 新增表（精简版）- 智能提醒规则表、报表模板表
 * - DB-4: 表字段扩展 - 操作日志增强、用户行为轨迹字段
 *
 * 业务场景：
 * 1. 智能提醒系统（4.1）：支持自定义提醒规则，定时检测并推送提醒
 * 2. 自定义报表（4.2）：支持报表模板CRUD，动态生成报表
 * 3. 操作日志增强（4.3）：扩展日志字段支持回滚，高风险操作标记
 * 4. 用户行为轨迹（4.4）：记录用户关键行为，支持轨迹聚合分析
 *
 * 创建时间：2026年01月31日
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始执行第2阶段数据库变更迁移...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================
      // 第1部分：创建智能提醒规则表 (reminder_rules)
      // ========================================
      console.log('\n📦 第1部分：创建智能提醒规则表 (reminder_rules)...')

      await queryInterface.createTable(
        'reminder_rules',
        {
          // 主键
          rule_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '提醒规则ID'
          },

          // 规则基础信息
          rule_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            unique: true,
            comment: '规则编码（唯一标识，如 pending_audit_24h）'
          },
          rule_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '规则名称（中文，如"待审核超24小时提醒"）'
          },
          rule_description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '规则描述'
          },

          // 规则类型和条件
          rule_type: {
            type: Sequelize.ENUM(
              'pending_timeout', // 待处理超时
              'stock_low', // 库存不足
              'budget_alert', // 预算告警
              'activity_status', // 活动状态变更
              'anomaly_detect', // 异常检测
              'scheduled', // 定时提醒
              'custom' // 自定义规则
            ),
            allowNull: false,
            comment: '规则类型'
          },
          trigger_condition: {
            type: Sequelize.JSON,
            allowNull: false,
            comment:
              '触发条件配置（JSON格式，如 {"threshold": 24, "unit": "hours", "target_status": "pending"}）'
          },
          target_entity: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '目标实体类型（如 consumption_record, lottery_campaign, exchange_record）'
          },

          // 通知配置
          notification_channels: {
            type: Sequelize.JSON,
            allowNull: false,
            defaultValue: '["admin_broadcast"]',
            comment: '通知渠道配置（数组，如 ["admin_broadcast", "websocket", "wechat"]）'
          },
          notification_template: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '通知模板（支持变量占位符，如 "有{count}条{entity}待处理超过{threshold}{unit}"）'
          },
          notification_priority: {
            type: Sequelize.ENUM('low', 'medium', 'high', 'urgent'),
            allowNull: false,
            defaultValue: 'medium',
            comment: '通知优先级'
          },

          // 调度配置
          check_interval_minutes: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 60,
            comment: '检测间隔（分钟）'
          },
          last_check_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '上次检测时间'
          },
          next_check_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '下次检测时间'
          },

          // 状态控制
          is_enabled: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否启用'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建者ID',
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '最后更新者ID',
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },

          // 时间戳
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '智能提醒规则表（运营后台提醒管理）'
        }
      )

      // ========================================
      // 第2部分：创建提醒历史表 (reminder_history)
      // ========================================
      console.log('\n📦 第2部分：创建提醒历史表 (reminder_history)...')

      await queryInterface.createTable(
        'reminder_history',
        {
          // 主键
          history_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '提醒历史ID'
          },

          // 关联规则
          rule_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '关联的规则ID',
            references: { model: 'reminder_rules', key: 'rule_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },

          // 触发信息
          trigger_time: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '触发时间'
          },
          trigger_data: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '触发时的数据快照（如匹配的记录数、具体ID列表等）'
          },
          matched_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '匹配的记录数量'
          },

          // 通知结果
          notification_status: {
            type: Sequelize.ENUM('pending', 'sent', 'failed', 'skipped'),
            allowNull: false,
            defaultValue: 'pending',
            comment: '通知状态'
          },
          notification_result: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '通知结果详情（包含各渠道发送结果）'
          },
          sent_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '通知发送时间'
          },
          error_message: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '错误信息（发送失败时记录）'
          },

          // 处理状态
          is_acknowledged: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否已确认（用于去重和追踪）'
          },
          acknowledged_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '确认者ID',
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          acknowledged_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '确认时间'
          },

          // 时间戳
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '提醒历史记录表（存储每次提醒的触发和通知结果）'
        }
      )

      // ========================================
      // 第3部分：创建报表模板表 (report_templates)
      // ========================================
      console.log('\n📦 第3部分：创建报表模板表 (report_templates)...')

      await queryInterface.createTable(
        'report_templates',
        {
          // 主键
          template_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '报表模板ID'
          },

          // 模板基础信息
          template_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            unique: true,
            comment: '模板编码（唯一标识，如 daily_lottery_summary）'
          },
          template_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '模板名称（中文）'
          },
          template_description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '模板描述'
          },

          // 模板类型和分类
          template_type: {
            type: Sequelize.ENUM(
              'lottery', // 抽奖报表
              'consumption', // 消费报表
              'user', // 用户报表
              'inventory', // 库存报表
              'financial', // 财务报表
              'operational', // 运营报表
              'custom' // 自定义报表
            ),
            allowNull: false,
            comment: '模板类型'
          },
          category: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '报表分类（用于前端分组显示）'
          },

          // 报表配置
          data_source_config: {
            type: Sequelize.JSON,
            allowNull: false,
            comment:
              '数据源配置（定义查询的表、字段、关联关系，如 {"tables": ["lottery_draws", "users"], "joins": [...]}）'
          },
          columns_config: {
            type: Sequelize.JSON,
            allowNull: false,
            comment:
              '列配置（定义显示的列、排序、格式化，如 [{"field": "user_id", "label": "用户ID", "type": "number"}]）'
          },
          filters_config: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              '筛选条件配置（定义可用的筛选项，如 [{"field": "created_at", "type": "date_range"}]）'
          },
          aggregation_config: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '聚合配置（定义统计和汇总方式，如 {"group_by": ["date"], "sum": ["amount"]}）'
          },
          chart_config: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              '图表配置（定义可视化图表，如 {"type": "line", "x_axis": "date", "y_axis": "count"}）'
          },

          // 导出配置
          export_formats: {
            type: Sequelize.JSON,
            allowNull: false,
            defaultValue: '["excel", "csv"]',
            comment: '支持的导出格式（数组，如 ["excel", "csv", "pdf"]）'
          },
          default_export_format: {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'excel',
            comment: '默认导出格式'
          },

          // 调度配置（用于定时推送）
          schedule_config: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              '定时调度配置（如 {"enabled": true, "cron": "0 8 * * *", "recipients": [1, 2, 3]}）'
          },
          last_generated_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '上次生成时间'
          },

          // 状态控制
          is_enabled: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否启用'
          },
          is_system: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否系统内置模板（内置模板不可删除）'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建者ID',
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '最后更新者ID',
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },

          // 时间戳
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '报表模板表（自定义报表配置管理）'
        }
      )

      // ========================================
      // 第4部分：创建用户行为轨迹表 (user_behavior_tracks)
      // ========================================
      console.log('\n📦 第4部分：创建用户行为轨迹表 (user_behavior_tracks)...')

      await queryInterface.createTable(
        'user_behavior_tracks',
        {
          // 主键
          track_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '轨迹记录ID'
          },

          // 用户信息
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID',
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },

          // 行为信息
          behavior_type: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '行为类型（如 login, lottery_draw, consumption, exchange, purchase）'
          },
          behavior_action: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '行为动作（如 create, submit, complete, cancel）'
          },
          behavior_target: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '行为目标类型（如 lottery_campaign, product, item_instance）'
          },
          behavior_target_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '行为目标ID'
          },

          // 行为详情
          behavior_data: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '行为详情数据（如抽奖结果、消费金额、兑换商品等）'
          },
          behavior_result: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '行为结果（如 success, failed, pending）'
          },

          // 会话和设备信息
          session_id: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '会话ID（用于关联同一会话内的行为）'
          },
          device_info: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '设备信息（如 {"platform": "wechat", "device": "iPhone"}）'
          },
          ip_address: {
            type: Sequelize.STRING(45),
            allowNull: true,
            comment: 'IP地址'
          },

          // 时间信息
          behavior_time: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '行为发生时间'
          },

          // 时间戳
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '用户行为轨迹表（记录用户关键行为，用于轨迹分析）'
        }
      )

      // ========================================
      // 第5部分：扩展操作日志表 (admin_operation_logs)
      // ========================================
      console.log('\n📦 第5部分：扩展操作日志表字段（回滚支持、高风险标记）...')

      // 添加 is_reversible 字段（是否可回滚）
      await queryInterface.addColumn(
        'admin_operation_logs',
        'is_reversible',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否可回滚（部分操作支持一键回滚）'
        },
        { transaction }
      )

      // 添加 reversal_data 字段（回滚所需数据）
      await queryInterface.addColumn(
        'admin_operation_logs',
        'reversal_data',
        {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '回滚所需数据（用于执行回滚操作的完整数据）'
        },
        { transaction }
      )

      // 添加 is_reversed 字段（是否已回滚）
      await queryInterface.addColumn(
        'admin_operation_logs',
        'is_reversed',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否已回滚'
        },
        { transaction }
      )

      // 添加 reversed_at 字段（回滚时间）
      await queryInterface.addColumn(
        'admin_operation_logs',
        'reversed_at',
        {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '回滚执行时间'
        },
        { transaction }
      )

      // 添加 reversed_by 字段（回滚操作者）
      await queryInterface.addColumn(
        'admin_operation_logs',
        'reversed_by',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '回滚操作者ID'
        },
        { transaction }
      )

      // 添加 risk_level 字段（风险等级）
      await queryInterface.addColumn(
        'admin_operation_logs',
        'risk_level',
        {
          type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
          allowNull: false,
          defaultValue: 'low',
          comment: '操作风险等级'
        },
        { transaction }
      )

      // 添加 requires_approval 字段（是否需要审批）
      await queryInterface.addColumn(
        'admin_operation_logs',
        'requires_approval',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否需要二次审批（高风险操作）'
        },
        { transaction }
      )

      // 添加 approval_status 字段（审批状态）
      await queryInterface.addColumn(
        'admin_operation_logs',
        'approval_status',
        {
          type: Sequelize.ENUM('not_required', 'pending', 'approved', 'rejected'),
          allowNull: false,
          defaultValue: 'not_required',
          comment: '审批状态'
        },
        { transaction }
      )

      // ========================================
      // 第6部分：创建索引
      // ========================================
      console.log('\n📦 第6部分：创建索引...')

      // reminder_rules 索引
      await queryInterface.addIndex('reminder_rules', ['rule_code'], {
        name: 'idx_reminder_rules_code',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('reminder_rules', ['rule_type'], {
        name: 'idx_reminder_rules_type',
        transaction
      })
      await queryInterface.addIndex('reminder_rules', ['is_enabled'], {
        name: 'idx_reminder_rules_enabled',
        transaction
      })
      await queryInterface.addIndex('reminder_rules', ['next_check_at'], {
        name: 'idx_reminder_rules_next_check',
        transaction
      })

      // reminder_history 索引
      await queryInterface.addIndex('reminder_history', ['rule_id'], {
        name: 'idx_reminder_history_rule',
        transaction
      })
      await queryInterface.addIndex('reminder_history', ['trigger_time'], {
        name: 'idx_reminder_history_trigger_time',
        transaction
      })
      await queryInterface.addIndex('reminder_history', ['notification_status'], {
        name: 'idx_reminder_history_status',
        transaction
      })
      await queryInterface.addIndex('reminder_history', ['created_at'], {
        name: 'idx_reminder_history_created',
        transaction
      })

      // report_templates 索引
      await queryInterface.addIndex('report_templates', ['template_code'], {
        name: 'idx_report_templates_code',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('report_templates', ['template_type'], {
        name: 'idx_report_templates_type',
        transaction
      })
      await queryInterface.addIndex('report_templates', ['is_enabled'], {
        name: 'idx_report_templates_enabled',
        transaction
      })
      await queryInterface.addIndex('report_templates', ['is_system'], {
        name: 'idx_report_templates_system',
        transaction
      })

      // user_behavior_tracks 索引
      await queryInterface.addIndex('user_behavior_tracks', ['user_id'], {
        name: 'idx_behavior_tracks_user',
        transaction
      })
      await queryInterface.addIndex('user_behavior_tracks', ['behavior_type'], {
        name: 'idx_behavior_tracks_type',
        transaction
      })
      await queryInterface.addIndex('user_behavior_tracks', ['behavior_time'], {
        name: 'idx_behavior_tracks_time',
        transaction
      })
      await queryInterface.addIndex('user_behavior_tracks', ['user_id', 'behavior_type'], {
        name: 'idx_behavior_tracks_user_type',
        transaction
      })
      await queryInterface.addIndex('user_behavior_tracks', ['session_id'], {
        name: 'idx_behavior_tracks_session',
        transaction
      })

      // admin_operation_logs 新增字段索引
      await queryInterface.addIndex('admin_operation_logs', ['is_reversible'], {
        name: 'idx_audit_logs_reversible',
        transaction
      })
      await queryInterface.addIndex('admin_operation_logs', ['risk_level'], {
        name: 'idx_audit_logs_risk_level',
        transaction
      })
      await queryInterface.addIndex('admin_operation_logs', ['approval_status'], {
        name: 'idx_audit_logs_approval_status',
        transaction
      })

      console.log('  ✅ 索引创建完成')

      // ========================================
      // 第7部分：插入初始数据（系统内置提醒规则和报表模板）
      // ========================================
      console.log('\n📦 第7部分：插入系统内置数据...')

      // 插入默认提醒规则
      await queryInterface.bulkInsert(
        'reminder_rules',
        [
          {
            rule_code: 'pending_consumption_24h',
            rule_name: '消费待审核超24小时提醒',
            rule_description: '检测待审核消费记录超过24小时未处理，通知管理员及时审核',
            rule_type: 'pending_timeout',
            trigger_condition: JSON.stringify({
              threshold: 24,
              unit: 'hours',
              target_status: 'pending'
            }),
            target_entity: 'consumption_record',
            notification_channels: JSON.stringify(['admin_broadcast', 'websocket']),
            notification_template:
              '有{count}条消费记录待审核超过24小时，请及时处理',
            notification_priority: 'high',
            check_interval_minutes: 60,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            rule_code: 'pending_exchange_12h',
            rule_name: '兑换待审核超12小时提醒',
            rule_description: '检测待审核兑换申请超过12小时未处理，通知管理员',
            rule_type: 'pending_timeout',
            trigger_condition: JSON.stringify({
              threshold: 12,
              unit: 'hours',
              target_status: 'pending'
            }),
            target_entity: 'exchange_record',
            notification_channels: JSON.stringify(['admin_broadcast']),
            notification_template:
              '有{count}条兑换申请待审核超过12小时',
            notification_priority: 'medium',
            check_interval_minutes: 30,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            rule_code: 'daily_budget_alert',
            rule_name: '每日预算消耗告警',
            rule_description: '当活动每日预算消耗超过80%时发出告警',
            rule_type: 'budget_alert',
            trigger_condition: JSON.stringify({
              threshold_percentage: 80,
              check_field: 'daily_budget_used'
            }),
            target_entity: 'lottery_campaign',
            notification_channels: JSON.stringify(['admin_broadcast', 'websocket']),
            notification_template:
              '活动【{campaign_name}】今日预算已消耗{percentage}%，请关注',
            notification_priority: 'high',
            check_interval_minutes: 15,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      // 插入默认报表模板
      await queryInterface.bulkInsert(
        'report_templates',
        [
          {
            template_code: 'daily_lottery_summary',
            template_name: '每日抽奖汇总报表',
            template_description: '统计每日抽奖次数、中奖情况、预算消耗等关键指标',
            template_type: 'lottery',
            category: '运营报表',
            data_source_config: JSON.stringify({
              tables: ['lottery_draws', 'lottery_campaigns'],
              primary: 'lottery_draws',
              joins: [
                {
                  table: 'lottery_campaigns',
                  on: 'lottery_draws.campaign_id = lottery_campaigns.campaign_id'
                }
              ]
            }),
            columns_config: JSON.stringify([
              { field: 'draw_date', label: '日期', type: 'date' },
              { field: 'total_draws', label: '抽奖次数', type: 'number' },
              { field: 'win_count', label: '中奖次数', type: 'number' },
              { field: 'win_rate', label: '中奖率', type: 'percentage' },
              { field: 'budget_used', label: '预算消耗', type: 'currency' }
            ]),
            filters_config: JSON.stringify([
              { field: 'created_at', type: 'date_range', label: '日期范围' },
              { field: 'campaign_id', type: 'select', label: '活动' }
            ]),
            aggregation_config: JSON.stringify({
              group_by: ['DATE(created_at)'],
              count: ['draw_id'],
              sum: ['budget_used']
            }),
            export_formats: JSON.stringify(['excel', 'csv']),
            default_export_format: 'excel',
            is_enabled: true,
            is_system: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            template_code: 'user_activity_report',
            template_name: '用户活跃度报表',
            template_description: '统计用户登录、抽奖、消费等活跃行为',
            template_type: 'user',
            category: '用户分析',
            data_source_config: JSON.stringify({
              tables: ['users', 'lottery_draws', 'consumption_records'],
              primary: 'users'
            }),
            columns_config: JSON.stringify([
              { field: 'user_id', label: '用户ID', type: 'number' },
              { field: 'nickname', label: '昵称', type: 'string' },
              { field: 'login_count', label: '登录次数', type: 'number' },
              { field: 'draw_count', label: '抽奖次数', type: 'number' },
              { field: 'consumption_count', label: '消费次数', type: 'number' },
              { field: 'last_active_at', label: '最后活跃', type: 'datetime' }
            ]),
            filters_config: JSON.stringify([
              { field: 'created_at', type: 'date_range', label: '注册日期' },
              { field: 'status', type: 'select', label: '用户状态' }
            ]),
            export_formats: JSON.stringify(['excel', 'csv']),
            default_export_format: 'excel',
            is_enabled: true,
            is_system: true,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      console.log('  ✅ 初始数据插入完成')

      // ========================================
      // 提交事务
      // ========================================
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 第2阶段数据库变更迁移执行成功！')
      console.log('='.repeat(60))
      console.log('\n📊 创建摘要:')
      console.log('  - 新增表: 4（reminder_rules, reminder_history, report_templates, user_behavior_tracks）')
      console.log('  - 扩展字段: 8（admin_operation_logs 表增加回滚和风险相关字段）')
      console.log('  - 新增索引: 17')
      console.log('  - 初始提醒规则: 3')
      console.log('  - 初始报表模板: 2')
      console.log('')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败:', error.message)
      console.error(error.stack)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚第2阶段数据库变更迁移...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除 admin_operation_logs 新增的列（逆序删除）
      const columnsToRemove = [
        'approval_status',
        'requires_approval',
        'risk_level',
        'reversed_by',
        'reversed_at',
        'is_reversed',
        'reversal_data',
        'is_reversible'
      ]

      for (const column of columnsToRemove) {
        try {
          // eslint-disable-next-line no-await-in-loop -- 顺序删除列
          await queryInterface.removeColumn('admin_operation_logs', column, { transaction })
        } catch (err) {
          console.log(`  ⚠️ 列 ${column} 可能不存在，跳过`)
        }
      }

      // 删除新增的表（按依赖关系逆序删除）
      await queryInterface.dropTable('user_behavior_tracks', { transaction })
      await queryInterface.dropTable('reminder_history', { transaction })
      await queryInterface.dropTable('report_templates', { transaction })
      await queryInterface.dropTable('reminder_rules', { transaction })

      await transaction.commit()
      console.log('✅ 第2阶段数据库变更迁移回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
