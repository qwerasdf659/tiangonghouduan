/**
 * 权威Baseline迁移 V2.0.0
 *
 * 生成时间: 2026/1/5 01:44:23
 * 生成方式: 从生产数据库 restaurant_points_dev schema 自动生成
 *
 * 说明：
 * - 基于 2026-01-04 真实数据库 schema 生成
 * - 包含所有 44 张表的完整定义
 * - 包含所有索引、外键约束
 * - 新环境部署：只需执行此 baseline + 之后的增量迁移
 * - 历史迁移（196条）仅作存档，不再用于重放
 *
 * 使用方式：
 * - 新环境：执行 baseline + 增量迁移
 * - 现有环境：跳过 baseline（已包含在历史迁移中）
 *
 * 表清单（44张）：
 * 1. account_asset_balances
 * 2. accounts
 * 3. admin_operation_logs
 * 4. api_idempotency_requests
 * 5. asset_transactions
 * 6. audit_records
 * 7. authentication_sessions
 * 8. chat_messages
 * 9. consumption_records
 * 10. content_review_records
 * 11. customer_service_sessions
 * 12. exchange_items
 * 13. exchange_records
 * 14. feedbacks
 * 15. image_resources
 * 16. item_instance_events
 * 17. item_instances
 * 18. item_template_aliases
 * 19. lottery_campaigns
 * 20. lottery_draw_quota_rules
 * 21. lottery_draws
 * 22. lottery_management_settings
 * 23. lottery_presets
 * 24. lottery_prizes
 * 25. lottery_user_daily_draw_quota
 * 26. market_listings
 * 27. material_asset_types
 * 28. material_conversion_rules
 * 29. merchant_points_reviews
 * 30. popup_banners
 * 31. products
 * 32. redemption_orders
 * 33. role_change_logs
 * 34. roles
 * 35. stores
 * 36. system_announcements
 * 37. system_settings
 * 38. trade_orders
 * 39. trade_records
 * 40. user_hierarchy
 * 41. user_premium_status
 * 42. user_roles
 * 43. users
 * 44. websocket_startup_logs
 */

'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 开始执行Baseline V2.0.0迁移...')
      console.log('   共需创建 44 张表')

      // ==================== 表 1/44: account_asset_balances ====================
      console.log('📦 [1/44] 创建表: account_asset_balances')
      await queryInterface.createTable(
        'account_asset_balances',
        {
          balance_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '余额记录ID（主键，自增）'
          },
          account_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '账户ID（Account ID）：关联 accounts.account_id，外键约束CASCADE更新/RESTRICT删除'
          },
          asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment:
              '资产代码（Asset Code）：如 DIAMOND、red_shard、red_crystal 等；唯一约束：(account_id, asset_code)'
          },
          available_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment:
              '可用余额（Available Amount）：可直接支付、转让、挂牌的余额；业务规则：不可为负数，所有扣减操作必须验证余额充足；单位：整数（BIGINT避免浮点精度问题）'
          },
          frozen_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment:
              '冻结余额（Frozen Amount）：下单冻结、挂牌冻结的余额；业务规则：交易市场购买时冻结买家DIAMOND，挂牌时冻结卖家标的资产；成交后从冻结转为扣减或入账；取消/超时时解冻回到 available_amount；不可为负数'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          },
          campaign_id: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '活动ID（仅 BUDGET_POINTS 需要，其他资产为 NULL）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '账户资产余额表（可用余额 + 冻结余额）'
        }
      )

      // account_asset_balances 索引
      await queryInterface.addIndex('account_asset_balances', ['account_id'], {
        name: 'idx_account_asset_balances_account_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('account_asset_balances', ['asset_code'], {
        name: 'idx_account_asset_balances_asset_code',
        unique: false,
        transaction
      })
      await queryInterface.addIndex(
        'account_asset_balances',
        ['account_id', 'asset_code', 'campaign_id'],
        {
          name: 'uk_account_asset_campaign',
          unique: true,
          transaction
        }
      )

      // ==================== 表 2/44: accounts ====================
      console.log('📦 [2/44] 创建表: accounts')
      await queryInterface.createTable(
        'accounts',
        {
          account_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '账户ID（主键，自增）'
          },
          account_type: {
            type: Sequelize.ENUM('user', 'system'),
            allowNull: false,
            comment:
              '账户类型（Account Type）：user-用户账户（关联真实用户，user_id必填）| system-系统账户（平台运营账户，system_code必填）'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment:
              '用户ID（User ID）：当 account_type=user 时必填且唯一；当 account_type=system 时为NULL；外键关联 users.user_id'
          },
          system_code: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment:
              '系统账户代码（System Code）：当 account_type=system 时必填且唯一；预定义系统账户：SYSTEM_PLATFORM_FEE（平台手续费）、SYSTEM_MINT（系统发放）、SYSTEM_BURN（系统销毁）、SYSTEM_ESCROW（托管/争议）'
          },
          status: {
            type: Sequelize.ENUM('active', 'disabled'),
            allowNull: false,
            defaultValue: 'active',
            comment:
              '账户状态（Account Status）：active-活跃（可正常交易）| disabled-禁用（冻结状态，禁止任何交易）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '账户表（统一用户账户与系统账户）'
        }
      )

      // accounts 索引
      await queryInterface.addIndex('accounts', ['account_type', 'status'], {
        name: 'idx_accounts_type_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('accounts', ['system_code'], {
        name: 'uk_accounts_system_code',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('accounts', ['user_id'], {
        name: 'uk_accounts_user_id',
        unique: true,
        transaction
      })

      // ==================== 表 3/44: admin_operation_logs ====================
      console.log('📦 [3/44] 创建表: admin_operation_logs')
      await queryInterface.createTable(
        'admin_operation_logs',
        {
          log_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '审计日志ID'
          },
          operator_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '操作员ID（管理员user_id）'
          },
          operation_type: {
            type: Sequelize.ENUM(
              'points_adjust',
              'exchange_audit',
              'product_update',
              'product_create',
              'product_delete',
              'user_status_change',
              'prize_config',
              'prize_create',
              'prize_delete',
              'prize_stock_adjust',
              'campaign_config',
              'role_assign',
              'role_change',
              'system_config',
              'session_assign',
              'inventory_operation',
              'inventory_transfer',
              'consumption_audit'
            ),
            allowNull: false,
            comment: '操作类型'
          },
          target_type: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '目标对象类型（User/Product/Prize等）'
          },
          target_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '目标对象ID'
          },
          action: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '操作动作（create/update/delete/approve/reject等）'
          },
          before_data: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '操作前数据（JSON格式）'
          },
          after_data: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '操作后数据（JSON格式）'
          },
          changed_fields: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '变更字段列表'
          },
          reason: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '操作原因/备注'
          },
          ip_address: {
            type: Sequelize.STRING(45),
            allowNull: true,
            comment: 'IP地址（支持IPv4和IPv6）'
          },
          user_agent: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '用户代理字符串'
          },
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '操作时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '操作审计日志表（记录所有敏感操作）'
        }
      )

      // admin_operation_logs 索引
      await queryInterface.addIndex('admin_operation_logs', ['created_at'], {
        name: 'idx_audit_logs_created',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('admin_operation_logs', ['ip_address'], {
        name: 'idx_audit_logs_ip',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('admin_operation_logs', ['operation_type'], {
        name: 'idx_audit_logs_operation_type',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('admin_operation_logs', ['operator_id'], {
        name: 'idx_audit_logs_operator',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('admin_operation_logs', ['target_type', 'target_id'], {
        name: 'idx_audit_logs_target',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('admin_operation_logs', ['idempotency_key'], {
        name: 'uk_admin_operation_logs_idempotency_key',
        unique: true,
        transaction
      })

      // ==================== 表 4/44: api_idempotency_requests ====================
      console.log('📦 [4/44] 创建表: api_idempotency_requests')
      await queryInterface.createTable(
        'api_idempotency_requests',
        {
          request_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '请求记录ID（主键）'
          },
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '幂等键（全局唯一）'
          },
          api_path: {
            type: Sequelize.STRING(200),
            allowNull: false,
            comment: 'API路径'
          },
          http_method: {
            type: Sequelize.STRING(10),
            allowNull: false,
            defaultValue: 'POST',
            comment: 'HTTP方法'
          },
          request_hash: {
            type: Sequelize.STRING(64),
            allowNull: false,
            comment: '请求参数哈希（用于检测参数冲突）'
          },
          request_params: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '请求参数快照'
          },
          user_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '用户ID'
          },
          status: {
            type: Sequelize.ENUM('processing', 'completed', 'failed'),
            allowNull: false,
            defaultValue: 'processing',
            comment: '处理状态'
          },
          business_event_id: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '业务事件ID（如 lottery_session_id）'
          },
          response_snapshot: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '响应结果快照（重试时直接返回）'
          },
          response_code: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '响应业务代码'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '请求创建时间'
          },
          completed_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '请求完成时间'
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '过期时间（24小时后可清理）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: 'API入口幂等表 - 实现重试返回首次结果'
        }
      )

      // api_idempotency_requests 索引
      await queryInterface.addIndex('api_idempotency_requests', ['idempotency_key'], {
        name: 'idempotency_key',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('api_idempotency_requests', ['business_event_id'], {
        name: 'idx_business_event',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('api_idempotency_requests', ['status', 'expires_at'], {
        name: 'idx_status_expires',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('api_idempotency_requests', ['user_id', 'created_at'], {
        name: 'idx_user_created',
        unique: false,
        transaction
      })

      // ==================== 表 5/44: asset_transactions ====================
      console.log('📦 [5/44] 创建表: asset_transactions')
      await queryInterface.createTable(
        'asset_transactions',
        {
          transaction_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '流水ID（主键）'
          },
          asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment:
              '资产代码（Asset Code - 资产类型标识）：DIAMOND-钻石资产, red_shard-碎红水晶, 等'
          },
          delta_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '变动金额（Delta Amount - 资产变动数量，正数表示增加，负数表示扣减，单位：1个资产单位）'
          },
          balance_after: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '变动后余额（Balance After - 本次变动后的资产余额，用于快速查询和对账）'
          },
          business_type: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment:
              '业务类型（Business Type - 业务场景分类）：market_purchase_buyer_debit-市场购买买家扣减, market_purchase_seller_credit-市场购买卖家入账, market_purchase_platform_fee_credit-市场购买平台手续费, exchange_debit-兑换扣减, material_convert_debit-材料转换扣减, material_convert_credit-材料转换入账'
          },
          meta: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              '扩展信息（Meta - JSON格式存储业务扩展信息）：如order_no, item_id, conversion_rule等，用于业务追溯和审计'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间，数据库内部存储UTC）'
          },
          account_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '账户ID（外键：accounts.account_id）'
          },
          balance_before: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '变动前余额（强制必填，对账必需）'
          },
          lottery_session_id: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '抽奖会话ID（仅抽奖业务使用，非抽奖业务可为NULL，用于关联 consume+reward）'
          },
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment:
              '幂等键（每条流水唯一）：抽奖格式 {request_key}:consume/{request_key}:reward，其他格式 {type}_{account}_{ts}_{random}'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment:
            '资产流水表（Asset Transactions）- 记录所有资产变动流水，支持幂等性控制和审计追溯'
        }
      )

      // asset_transactions 索引
      await queryInterface.addIndex(
        'asset_transactions',
        ['account_id', 'asset_code', 'created_at'],
        {
          name: 'idx_account_asset_time',
          unique: false,
          transaction
        }
      )
      await queryInterface.addIndex('asset_transactions', ['asset_code', 'created_at'], {
        name: 'idx_asset_code_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('asset_transactions', ['business_type', 'created_at'], {
        name: 'idx_business_type_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('asset_transactions', ['lottery_session_id'], {
        name: 'idx_lottery_session_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('asset_transactions', ['idempotency_key'], {
        name: 'uk_idempotency_key',
        unique: true,
        transaction
      })

      // ==================== 表 6/44: audit_records ====================
      console.log('📦 [6/44] 创建表: audit_records')
      await queryInterface.createTable(
        'audit_records',
        {
          audit_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '审核记录唯一标识'
          },
          record_id: {
            type: Sequelize.BIGINT,
            allowNull: false
          },
          auditor_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '审核人员ID（平台工作人员）'
          },
          audit_result: {
            type: Sequelize.ENUM('approved', 'rejected'),
            allowNull: false,
            comment: '审核结果（approved-通过，rejected-拒绝）'
          },
          audit_opinion: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '审核意见（拒绝时必填）'
          },
          rejection_reason: {
            type: Sequelize.ENUM(
              'amount_mismatch',
              'invalid_receipt',
              'duplicate_submission',
              'fraud_suspected',
              'merchant_error',
              'other'
            ),
            allowNull: true,
            comment: '拒绝原因分类（拒绝时必填）'
          },
          audit_details: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '审核详细信息JSON（如审核过程中的检查项）'
          },
          audited_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '审核完成时间（北京时间）'
          },
          audit_duration: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '审核耗时（从提交到审核完成的秒数）'
          },
          client_ip: {
            type: Sequelize.STRING(45),
            allowNull: true,
            comment: '审核人员IP地址'
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
          comment: '审核记录表 - 记录平台工作人员对消费记录的审核结果'
        }
      )

      // audit_records 索引
      await queryInterface.addIndex('audit_records', ['audit_result'], {
        name: 'idx_ar_audit_result',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('audit_records', ['audited_at'], {
        name: 'idx_ar_audited_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('audit_records', ['auditor_id'], {
        name: 'idx_ar_auditor_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('audit_records', ['record_id'], {
        name: 'idx_ar_consumption_id',
        unique: false,
        transaction
      })

      // ==================== 表 7/44: authentication_sessions ====================
      console.log('📦 [7/44] 创建表: authentication_sessions')
      await queryInterface.createTable(
        'authentication_sessions',
        {
          user_session_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
          },
          session_token: {
            type: Sequelize.STRING(255),
            allowNull: false,
            comment: '会话令牌（JWT Token的jti）'
          },
          user_type: {
            type: Sequelize.ENUM('user', 'admin'),
            allowNull: false,
            comment: '用户类型'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
          },
          login_ip: {
            type: Sequelize.STRING(45),
            allowNull: true,
            comment: '登录IP'
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: true,
            defaultValue: 1,
            comment: '是否活跃'
          },
          last_activity: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '最后活动时间'
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '过期时间'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '用户会话管理表'
        }
      )

      // authentication_sessions 索引
      await queryInterface.addIndex('authentication_sessions', ['expires_at', 'is_active'], {
        name: 'idx_user_sessions_expires',
        unique: false,
        transaction
      })
      await queryInterface.addIndex(
        'authentication_sessions',
        ['user_type', 'user_id', 'is_active'],
        {
          name: 'idx_user_sessions_user_active',
          unique: false,
          transaction
        }
      )
      await queryInterface.addIndex('authentication_sessions', ['user_id', 'created_at'], {
        name: 'idx_user_sessions_user_created',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('authentication_sessions', ['session_token'], {
        name: 'session_token',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('authentication_sessions', ['last_activity'], {
        name: 'user_sessions_last_activity',
        unique: false,
        transaction
      })

      // ==================== 表 8/44: chat_messages ====================
      console.log('📦 [8/44] 创建表: chat_messages')
      await queryInterface.createTable(
        'chat_messages',
        {
          session_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '会话ID(外键关联customer_sessions)'
          },
          sender_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '发送者ID（系统消息为NULL）'
          },
          sender_type: {
            type: Sequelize.ENUM('user', 'admin'),
            allowNull: false,
            comment: '发送者类型'
          },
          message_source: {
            type: Sequelize.ENUM('user_client', 'admin_client', 'system'),
            allowNull: false,
            comment: '消息来源：user_client=用户端，admin_client=管理员端，system=系统消息'
          },
          content: {
            type: Sequelize.TEXT,
            allowNull: false,
            comment: '消息内容'
          },
          message_type: {
            type: Sequelize.ENUM('text', 'image', 'system'),
            allowNull: true,
            defaultValue: 'text',
            comment: '消息类型'
          },
          status: {
            type: Sequelize.ENUM('sending', 'sent', 'delivered', 'read'),
            allowNull: true,
            defaultValue: 'sent',
            comment: '消息状态'
          },
          reply_to_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '回复的消息ID'
          },
          temp_message_id: {
            type: Sequelize.STRING(64),
            allowNull: true,
            comment: '临时消息ID(前端生成)'
          },
          metadata: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '扩展数据(图片信息等)'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间'
          },
          message_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '消息主键ID'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '聊天消息表'
        }
      )

      // chat_messages 索引
      await queryInterface.addIndex('chat_messages', ['created_at'], {
        name: 'idx_chat_messages_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('chat_messages', ['sender_id'], {
        name: 'idx_chat_messages_sender_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('chat_messages', ['session_id'], {
        name: 'idx_chat_messages_session_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('chat_messages', ['message_source', 'sender_type'], {
        name: 'idx_chat_messages_source_type',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('chat_messages', ['temp_message_id'], {
        name: 'idx_chat_messages_temp_message_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('chat_messages', ['message_id'], {
        name: 'new_message_id',
        unique: true,
        transaction
      })

      // ==================== 表 9/44: consumption_records ====================
      console.log('📦 [9/44] 创建表: consumption_records')
      await queryInterface.createTable(
        'consumption_records',
        {
          record_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '消费记录ID（主键，自增）'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '消费用户ID'
          },
          merchant_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '商家ID（录入人，可为空）'
          },
          consumption_amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            comment: '消费金额（元）'
          },
          points_to_award: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment:
              '预计奖励积分数（单位：分），计算规则：Math.round(consumption_amount)，即1元=1分，四舍五入'
          },
          status: {
            type: Sequelize.ENUM('pending', 'approved', 'rejected', 'expired'),
            allowNull: false,
            defaultValue: 'pending',
            comment: '状态：pending-待审核，approved-已通过，rejected-已拒绝，expired-已过期'
          },
          qr_code: {
            type: Sequelize.STRING(150),
            allowNull: false,
            comment: '用户固定身份码（UUID版本，格式：QR_{user_uuid}_{signature}）'
          },
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          merchant_notes: {
            type: Sequelize.TEXT,
            allowNull: true
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
          },
          admin_notes: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '平台审核备注（审核员填写）'
          },
          reviewed_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '审核员ID（谁审核的？可为空）'
          },
          reviewed_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '审核时间（什么时候审核的？），时区：北京时间（GMT+8）'
          },
          is_deleted: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 0,
            comment: '软删除标记：0=未删除，1=已删除'
          },
          deleted_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '删除时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '用户消费记录表 - 记录用户通过商家扫码提交的消费信息'
        }
      )

      // consumption_records 索引
      await queryInterface.addIndex('consumption_records', ['idempotency_key'], {
        name: 'idx_consumption_business_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('consumption_records', ['is_deleted'], {
        name: 'idx_consumption_is_deleted',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('consumption_records', ['merchant_id', 'created_at'], {
        name: 'idx_merchant_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('consumption_records', ['qr_code'], {
        name: 'idx_qr_code',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('consumption_records', ['reviewed_by', 'reviewed_at'], {
        name: 'idx_reviewed',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('consumption_records', ['status', 'created_at'], {
        name: 'idx_status_created',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('consumption_records', ['user_id', 'status', 'created_at'], {
        name: 'idx_user_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('consumption_records', ['idempotency_key'], {
        name: 'uk_consumption_records_idempotency_key',
        unique: true,
        transaction
      })

      // ==================== 表 10/44: content_review_records ====================
      console.log('📦 [10/44] 创建表: content_review_records')
      await queryInterface.createTable(
        'content_review_records',
        {
          audit_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '审核记录ID'
          },
          auditable_type: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '审核对象类型（exchange/image/feedback等）'
          },
          auditable_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '审核对象ID'
          },
          audit_status: {
            type: Sequelize.ENUM('pending', 'approved', 'rejected', 'cancelled'),
            allowNull: false,
            defaultValue: 'pending',
            comment: '审核状态：pending-待审核，approved-已通过，rejected-已拒绝，cancelled-已取消'
          },
          auditor_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '审核员ID'
          },
          audit_reason: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '审核意见/拒绝原因'
          },
          audit_data: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '审核相关数据（JSON格式，存储业务特定信息）'
          },
          priority: {
            type: Sequelize.ENUM('high', 'medium', 'low'),
            allowNull: false,
            defaultValue: 'medium',
            comment: '审核优先级'
          },
          submitted_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '提交审核时间'
          },
          audited_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '审核完成时间'
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
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // content_review_records 索引
      await queryInterface.addIndex('content_review_records', ['auditable_type', 'auditable_id'], {
        name: 'idx_audit_records_auditable',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('content_review_records', ['auditor_id'], {
        name: 'idx_audit_records_auditor',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('content_review_records', ['created_at'], {
        name: 'idx_audit_records_created',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('content_review_records', ['priority', 'submitted_at'], {
        name: 'idx_audit_records_priority_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('content_review_records', ['audit_status'], {
        name: 'idx_audit_records_status',
        unique: false,
        transaction
      })

      // ==================== 表 11/44: customer_service_sessions ====================
      console.log('📦 [11/44] 创建表: customer_service_sessions')
      await queryInterface.createTable(
        'customer_service_sessions',
        {
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '外键引用（允许NULL）'
          },
          admin_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '分配的管理员ID（基于UUID角色系统验证管理员权限）'
          },
          status: {
            type: Sequelize.ENUM('waiting', 'assigned', 'active', 'closed'),
            allowNull: true,
            defaultValue: 'waiting',
            comment: '会话状态'
          },
          source: {
            type: Sequelize.STRING(32),
            allowNull: true,
            defaultValue: 'mobile',
            comment: '来源渠道'
          },
          priority: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 1,
            comment: '优先级(1-5)'
          },
          last_message_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '最后消息时间'
          },
          closed_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '关闭时间'
          },
          close_reason: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '关闭原因（最长500字符，如：问题已解决、用户未回复、恶意会话等）'
          },
          closed_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '关闭操作人ID（外键关联users表的user_id，记录哪个管理员关闭的会话）'
          },
          satisfaction_score: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '满意度评分(1-5)'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '更新时间'
          },
          session_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '会话主键ID'
          },
          is_active_session: {
            type: Sequelize.BOOLEAN,
            allowNull: true,
            comment: '虚拟列:标识活跃会话(1=活跃,NULL=已关闭),用于部分唯一索引'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '客户聊天会话表'
        }
      )

      // customer_service_sessions 索引
      await queryInterface.addIndex('customer_service_sessions', ['closed_by'], {
        name: 'idx_closed_by',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('customer_service_sessions', ['admin_id'], {
        name: 'idx_customer_sessions_admin_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('customer_service_sessions', ['created_at'], {
        name: 'idx_customer_sessions_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('customer_service_sessions', ['status'], {
        name: 'idx_customer_sessions_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('customer_service_sessions', ['user_id'], {
        name: 'idx_customer_sessions_user_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('customer_service_sessions', ['user_id', 'is_active_session'], {
        name: 'idx_user_active_session',
        unique: true,
        transaction
      })

      // ==================== 表 12/44: exchange_items ====================
      console.log('📦 [12/44] 创建表: exchange_items')
      await queryInterface.createTable(
        'exchange_items',
        {
          item_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '商品唯一标识'
          },
          name: {
            type: Sequelize.STRING(200),
            allowNull: false,
            comment: '商品名称'
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '商品描述'
          },
          image_url: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '商品图片URL'
          },
          cost_price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            comment: '实际成本（人民币）'
          },
          stock: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '库存数量'
          },
          sold_count: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '已售数量'
          },
          category: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '商品分类'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: true,
            defaultValue: 'active',
            comment: '商品状态'
          },
          sort_order: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '排序序号'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间'
          },
          cost_asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '兑换成本资产代码（材料资产支付）'
          },
          cost_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '兑换成本数量（材料资产支付）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '兑换市场商品表'
        }
      )

      // exchange_items 索引
      await queryInterface.addIndex('exchange_items', ['category'], {
        name: 'idx_category',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('exchange_items', ['status'], {
        name: 'idx_status',
        unique: false,
        transaction
      })

      // ==================== 表 13/44: exchange_records ====================
      console.log('📦 [13/44] 创建表: exchange_records')
      await queryInterface.createTable(
        'exchange_records',
        {
          record_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '兑换记录唯一标识'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID'
          },
          item_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '兑换商品ID'
          },
          item_snapshot: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '商品快照（记录兑换时的商品信息：名称、价格、描述等）'
          },
          quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: '兑换数量（默认为1）'
          },
          total_cost: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
            comment: '总成本（管理员可见，= cost_price * quantity）'
          },
          actual_cost: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
            comment: '实际成本'
          },
          order_no: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '订单号'
          },
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          status: {
            type: Sequelize.ENUM('pending', 'completed', 'shipped', 'cancelled'),
            allowNull: true,
            defaultValue: 'pending',
            comment: '订单状态'
          },
          admin_remark: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '管理员备注（管理员操作订单时的备注信息）'
          },
          exchange_time: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '兑换时间（记录实际兑换时刻，北京时间）'
          },
          shipped_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '发货时间'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间'
          },
          pay_asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '实际支付资产代码（材料资产支付）'
          },
          pay_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '实际支付数量（材料资产支付）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '兑换市场记录表'
        }
      )

      // exchange_records 索引
      await queryInterface.addIndex('exchange_records', ['created_at'], {
        name: 'idx_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('exchange_records', ['status'], {
        name: 'idx_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('exchange_records', ['user_id'], {
        name: 'idx_user_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('exchange_records', ['item_id'], {
        name: 'item_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('exchange_records', ['order_no'], {
        name: 'order_no',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('exchange_records', ['idempotency_key'], {
        name: 'uk_exchange_records_idempotency_key',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('exchange_records', ['order_no'], {
        name: 'uk_order_no',
        unique: true,
        transaction
      })

      // ==================== 表 14/44: feedbacks ====================
      console.log('📦 [14/44] 创建表: feedbacks')
      await queryInterface.createTable(
        'feedbacks',
        {
          feedback_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '外键引用（允许NULL）'
          },
          category: {
            type: Sequelize.ENUM('technical', 'feature', 'bug', 'complaint', 'suggestion', 'other'),
            allowNull: false,
            defaultValue: 'other',
            comment: '反馈分类'
          },
          content: {
            type: Sequelize.TEXT,
            allowNull: false,
            comment: '反馈内容'
          },
          attachments: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '附件信息（图片URLs等）'
          },
          status: {
            type: Sequelize.ENUM('pending', 'processing', 'replied', 'closed'),
            allowNull: false,
            defaultValue: 'pending',
            comment: '处理状态'
          },
          priority: {
            type: Sequelize.ENUM('high', 'medium', 'low'),
            allowNull: false,
            defaultValue: 'medium',
            comment: '优先级'
          },
          user_ip: {
            type: Sequelize.STRING(45),
            allowNull: true,
            comment: '用户IP（管理员可见）'
          },
          device_info: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '设备信息（管理员可见）'
          },
          admin_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '处理反馈的管理员ID（基于UUID角色系统验证管理员权限）'
          },
          reply_content: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '回复内容'
          },
          replied_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '回复时间'
          },
          internal_notes: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '内部备注（管理员可见）'
          },
          estimated_response_time: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '预计响应时间'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '更新时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '用户反馈表 - 支持客服反馈功能'
        }
      )

      // feedbacks 索引
      await queryInterface.addIndex('feedbacks', ['admin_id'], {
        name: 'idx_feedbacks_admin_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('feedbacks', ['category', 'priority'], {
        name: 'idx_feedbacks_category_priority',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('feedbacks', ['status', 'created_at'], {
        name: 'idx_feedbacks_status_created',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('feedbacks', ['user_id', 'status'], {
        name: 'idx_feedbacks_user_status',
        unique: false,
        transaction
      })

      // ==================== 表 15/44: image_resources ====================
      console.log('📦 [15/44] 创建表: image_resources')
      await queryInterface.createTable(
        'image_resources',
        {
          image_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
          },
          business_type: {
            // 2026-01-08 修复：移除已废弃的 user_upload_review 枚举值
            type: Sequelize.ENUM('lottery', 'exchange', 'trade', 'uploads'),
            allowNull: false,
            comment: '业务类型：抽奖/兑换/交易/上传'
          },
          category: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '资源分类：prizes/products/items/pending_review等'
          },
          context_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '上下文ID：用户ID/奖品ID/商品ID等'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '关联用户ID（上传用户）'
          },
          file_path: {
            type: Sequelize.STRING(500),
            allowNull: false,
            comment: '文件存储路径'
          },
          thumbnail_paths: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '缩略图路径集合：{small: "", medium: "", large: ""}'
          },
          original_filename: {
            type: Sequelize.STRING(255),
            allowNull: false,
            comment: '原始文件名'
          },
          file_size: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '文件大小（字节）'
          },
          mime_type: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: 'MIME类型'
          },
          status: {
            type: Sequelize.ENUM('active', 'archived', 'deleted'),
            allowNull: false,
            defaultValue: 'active',
            comment: '资源状态'
          },
          review_status: {
            type: Sequelize.ENUM('pending', 'approved', 'rejected', 'reviewing'),
            allowNull: true,
            comment: '审核状态'
          },
          reviewer_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '审核员ID'
          },
          review_reason: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '审核说明'
          },
          reviewed_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '审核时间'
          },
          points_awarded: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '奖励积分数量'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '创建时间'
          },
          upload_id: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '上传记录业务ID（兼容原UploadReview）'
          },
          source_module: {
            type: Sequelize.ENUM('system', 'lottery', 'exchange', 'admin'),
            allowNull: false,
            defaultValue: 'system',
            comment: '来源模块：系统/抽奖/兑换/管理员'
          },
          ip_address: {
            type: Sequelize.STRING(45),
            allowNull: true,
            comment: 'IP地址'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '统一图片资源管理表'
        }
      )

      // image_resources 索引
      await queryInterface.addIndex('image_resources', ['business_type', 'category'], {
        name: 'idx_business_category',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('image_resources', ['context_id', 'category', 'status'], {
        name: 'idx_context_category',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('image_resources', ['created_at', 'status'], {
        name: 'idx_created_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex(
        'image_resources',
        ['review_status', 'business_type', 'created_at'],
        {
          name: 'idx_review_status',
          unique: false,
          transaction
        }
      )
      await queryInterface.addIndex('image_resources', ['user_id', 'business_type', 'status'], {
        name: 'idx_user_business',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('image_resources', ['upload_id'], {
        name: 'upload_id',
        unique: true,
        transaction
      })

      // ==================== 表 16/44: item_instance_events ====================
      console.log('📦 [16/44] 创建表: item_instance_events')
      await queryInterface.createTable(
        'item_instance_events',
        {
          event_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '事件ID（主键）'
          },
          item_instance_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '物品实例ID（关联 item_instances.item_instance_id）'
          },
          event_type: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '事件类型（mint/lock/unlock/transfer/use/expire/destroy）'
          },
          operator_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '操作者用户ID（可为 NULL，系统操作时）'
          },
          operator_type: {
            type: Sequelize.ENUM('user', 'admin', 'system'),
            allowNull: false,
            defaultValue: 'user',
            comment: '操作者类型（user/admin/system）'
          },
          status_before: {
            type: Sequelize.ENUM('available', 'locked', 'transferred', 'used', 'expired'),
            allowNull: true,
            comment: '变更前状态'
          },
          status_after: {
            type: Sequelize.ENUM('available', 'locked', 'transferred', 'used', 'expired'),
            allowNull: true,
            comment: '变更后状态'
          },
          owner_before: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '变更前所有者'
          },
          owner_after: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '变更后所有者'
          },
          business_type: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '业务类型（lottery_reward/market_transfer/redemption_use）'
          },
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '幂等键（业界标准命名）：派生自父级幂等键，用于事件去重'
          },
          meta: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '事件元数据（订单信息/转让原因/核销信息等）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '事件时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '物品实例事件表（记录所有物品变更事件）'
        }
      )

      // item_instance_events 索引
      await queryInterface.addIndex('item_instance_events', ['item_instance_id', 'created_at'], {
        name: 'idx_item_instance_events_instance_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('item_instance_events', ['operator_user_id', 'created_at'], {
        name: 'idx_item_instance_events_operator_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('item_instance_events', ['event_type', 'created_at'], {
        name: 'idx_item_instance_events_type_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('item_instance_events', ['business_type', 'idempotency_key'], {
        name: 'uk_item_instance_events_business_idempotency',
        unique: true,
        transaction
      })
      await queryInterface.addIndex(
        'item_instance_events',
        ['item_instance_id', 'idempotency_key'],
        {
          name: 'uk_item_instance_events_instance_idempotency',
          unique: true,
          transaction
        }
      )

      // ==================== 表 17/44: item_instances ====================
      console.log('📦 [17/44] 创建表: item_instances')
      await queryInterface.createTable(
        'item_instances',
        {
          item_instance_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '物品实例ID（自增主键）'
          },
          owner_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '所有者用户ID（所有权真相，关联 users.user_id）'
          },
          item_type: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '物品类型（如 voucher/product/service/equipment/card）'
          },
          item_template_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '物品模板ID（可选，关联物品模板表或奖品表）'
          },
          status: {
            type: Sequelize.ENUM('available', 'locked', 'transferred', 'used', 'expired'),
            allowNull: false,
            defaultValue: 'available',
            comment:
              '物品状态（available=可用/locked=锁定中/transferred=已转移/used=已使用/expired=已过期）'
          },
          meta: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              '物品元数据（JSON格式，包含：name/description/icon/value/attributes/serial_number等）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间存储）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间存储）'
          },
          locks: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              '锁定记录数组。格式: [{lock_type, lock_id, locked_at, expires_at, auto_release, reason}]。lock_type: trade/redemption/security'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '物品实例表（不可叠加物品所有权真相）'
        }
      )

      // item_instances 索引
      await queryInterface.addIndex('item_instances', ['owner_user_id', 'status', 'created_at'], {
        name: 'idx_item_instances_owner_status_created',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('item_instances', ['owner_user_id'], {
        name: 'idx_item_instances_owner_user_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('item_instances', ['status'], {
        name: 'idx_item_instances_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('item_instances', ['item_type', 'item_template_id'], {
        name: 'idx_item_instances_type_template',
        unique: false,
        transaction
      })

      // ==================== 表 18/44: item_template_aliases ====================
      console.log('📦 [18/44] 创建表: item_template_aliases')
      await queryInterface.createTable(
        'item_template_aliases',
        {
          alias_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '别名ID（主键）'
          },
          template_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '模板代码（关联物品类型）'
          },
          alias_type: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '别名类型（legacy/source/external）'
          },
          alias_value: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '别名值'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '物品模板别名/映射表（用于来源追溯与兼容）'
        }
      )

      // item_template_aliases 索引
      await queryInterface.addIndex('item_template_aliases', ['template_code'], {
        name: 'idx_template_code',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('item_template_aliases', ['alias_type', 'alias_value'], {
        name: 'uk_alias',
        unique: true,
        transaction
      })

      // ==================== 表 19/44: lottery_campaigns ====================
      console.log('📦 [19/44] 创建表: lottery_campaigns')
      await queryInterface.createTable(
        'lottery_campaigns',
        {
          campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '活动唯一标识'
          },
          campaign_name: {
            type: Sequelize.STRING(255),
            allowNull: false,
            comment: '活动名称'
          },
          campaign_code: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '活动代码(唯一)'
          },
          campaign_type: {
            type: Sequelize.ENUM(
              'daily',
              'weekly',
              'event',
              'permanent',
              'pool_basic',
              'pool_advanced',
              'pool_vip',
              'pool_newbie'
            ),
            allowNull: false,
            comment: '活动类型，新增池类型支持'
          },
          cost_per_draw: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            comment: '每次抽奖消耗积分'
          },
          max_draws_per_user_daily: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1
          },
          max_draws_per_user_total: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '每用户总最大抽奖次数'
          },
          total_prize_pool: {
            type: Sequelize.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.0,
            comment: '总奖池价值'
          },
          remaining_prize_pool: {
            type: Sequelize.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.0,
            comment: '剩余奖池价值'
          },
          prize_distribution_config: {
            type: Sequelize.JSON,
            allowNull: false,
            comment: '奖品分布配置'
          },
          start_time: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '活动开始时间'
          },
          end_time: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '活动结束时间'
          },
          daily_reset_time: {
            type: Sequelize.TIME,
            allowNull: false,
            defaultValue: '00:00:00'
          },
          banner_image_url: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '活动横幅图片'
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '活动描述'
          },
          rules_text: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '活动规则说明'
          },
          status: {
            type: Sequelize.ENUM('draft', 'active', 'paused', 'ended', 'cancelled'),
            allowNull: false,
            defaultValue: 'draft'
          },
          budget_mode: {
            type: Sequelize.ENUM('user', 'pool', 'none'),
            allowNull: false,
            defaultValue: 'user',
            comment:
              '预算模式：user=用户预算账户扣减，pool=活动池预算扣减，none=不限制预算（测试用）'
          },
          pool_budget_total: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '活动池总预算（仅 budget_mode=pool 时使用）'
          },
          pool_budget_remaining: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '活动池剩余预算（仅 budget_mode=pool 时使用，实时扣减）'
          },
          allowed_campaign_ids: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '允许使用的用户预算来源活动ID列表（JSON数组，仅 budget_mode=user 时使用）'
          },
          total_participants: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
          },
          total_draws: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
          },
          total_prizes_awarded: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          participation_conditions: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              '参与条件配置（JSON格式，用途：存储活动参与条件规则，如用户积分≥100、用户类型=VIP等，业务场景：管理员在Web后台配置，用户端API自动验证，NULL表示无条件限制所有用户可参与）'
          },
          condition_error_messages: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              '条件不满足时的提示语（JSON格式，用途：存储每个条件对应的用户友好错误提示，业务场景：用户不满足条件时显示具体原因，如"您的积分不足100分，快去消费获取积分吧！"）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '抽奖活动配置表'
        }
      )

      // lottery_campaigns 索引
      await queryInterface.addIndex('lottery_campaigns', ['campaign_code'], {
        name: 'campaign_code',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('lottery_campaigns', ['campaign_type'], {
        name: 'idx_campaign_type',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_campaigns', ['status'], {
        name: 'idx_campaigns_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_campaigns', ['start_time', 'end_time'], {
        name: 'idx_campaigns_time_range',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_campaigns', ['cost_per_draw'], {
        name: 'idx_cost_per_draw',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_campaigns', ['campaign_type'], {
        name: 'idx_lc_pool_type',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_campaigns', ['status'], {
        name: 'idx_lc_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_campaigns', ['status', 'start_time', 'end_time'], {
        name: 'idx_lottery_campaigns_status_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_campaigns', ['start_time', 'end_time'], {
        name: 'idx_time_range',
        unique: false,
        transaction
      })

      // ==================== 表 20/44: lottery_draw_quota_rules ====================
      console.log('📦 [20/44] 创建表: lottery_draw_quota_rules')
      await queryInterface.createTable(
        'lottery_draw_quota_rules',
        {
          rule_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '规则主键ID'
          },
          scope_type: {
            type: Sequelize.ENUM('global', 'campaign', 'role', 'user'),
            allowNull: false,
            comment: '作用域类型：global-全局默认, campaign-活动级, role-角色/人群级, user-用户级'
          },
          scope_id: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment:
              '作用域ID：global固定为"global"，campaign存campaign_id，role存role_uuid，user存user_id'
          },
          window_type: {
            type: Sequelize.ENUM('daily', 'campaign_total'),
            allowNull: false,
            defaultValue: 'daily',
            comment: '统计窗口类型：daily-每日重置, campaign_total-活动期间累计'
          },
          limit_value: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 50,
            comment: '配额上限值：>=0，0代表不限制（仅对global允许0）'
          },
          timezone: {
            type: Sequelize.STRING(10),
            allowNull: false,
            defaultValue: '+08:00',
            comment: '时区：默认北京时间+08:00'
          },
          effective_from: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效开始时间：null表示立即生效'
          },
          effective_to: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效结束时间：null表示永久有效'
          },
          priority: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '优先级：同层级多条命中时决定优先级，数字越大优先级越高'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: '规则状态：active-启用, inactive-停用'
          },
          reason: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '规则说明/备注：记录为什么这么配置，便于审计'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建人ID（管理员user_id）'
          },
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '更新人ID（管理员user_id）'
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
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // lottery_draw_quota_rules 索引
      await queryInterface.addIndex(
        'lottery_draw_quota_rules',
        ['scope_type', 'scope_id', 'status', 'effective_from', 'effective_to'],
        {
          name: 'idx_scope_status_effective',
          unique: false,
          transaction
        }
      )
      await queryInterface.addIndex('lottery_draw_quota_rules', ['window_type', 'status'], {
        name: 'idx_window_status',
        unique: false,
        transaction
      })

      // ==================== 表 21/44: lottery_draws ====================
      console.log('📦 [21/44] 创建表: lottery_draws')
      await queryInterface.createTable(
        'lottery_draws',
        {
          draw_id: {
            type: Sequelize.STRING(50),
            allowNull: false,
            primaryKey: true,
            comment: '抽奖记录唯一标识'
          },
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          batch_draw_id: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '批次抽奖ID（连抽时使用，用于关联同一批次的多次抽奖）'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID'
          },
          campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 2,
            comment: '活动ID'
          },
          prize_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '奖品ID'
          },
          prize_name: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '奖品名称'
          },
          prize_type: {
            type: Sequelize.ENUM(
              'points',
              'coupon',
              'physical',
              'virtual',
              'service',
              'product',
              'special'
            ),
            allowNull: true,
            comment: '奖品类型（已移除empty）'
          },
          prize_value: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '奖品价值'
          },
          reward_tier: {
            type: Sequelize.STRING(32),
            allowNull: false,
            defaultValue: 'mid',
            comment: '奖励档位code（配置驱动，如 low/mid/high 或 tier_1..tier_n）'
          },
          draw_type: {
            type: Sequelize.ENUM('single', 'triple', 'five', 'ten'),
            allowNull: true,
            comment: '抽奖类型：single=单抽，triple=三连抽，five=五连抽，ten=十连抽'
          },
          draw_sequence: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '抽奖序号'
          },
          cost_points: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '消耗积分'
          },
          stop_angle: {
            type: Sequelize.DECIMAL(5, 2),
            allowNull: true,
            comment: '停止角度'
          },
          batch_id: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '批次ID'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          draw_count: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '抽奖次数'
          },
          prize_description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '奖品描述'
          },
          prize_image: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '奖品图片'
          },
          guarantee_triggered: {
            type: Sequelize.BOOLEAN,
            allowNull: true,
            defaultValue: 0,
            comment: '是否触发保底机制'
          },
          remaining_guarantee: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '剩余保底次数'
          },
          draw_config: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '抽奖配置快照'
          },
          result_metadata: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '抽奖结果元数据'
          },
          ip_address: {
            type: Sequelize.STRING(45),
            allowNull: true,
            comment: '用户IP地址'
          },
          lottery_id: {
            type: Sequelize.STRING(36),
            allowNull: true,
            comment: '关联的抽奖活动ID，允许为空用于测试'
          },
          prize_value_points: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '奖品价值积分消耗'
          },
          budget_points_before: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '抽奖前预算积分'
          },
          budget_points_after: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '抽奖后预算积分'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // lottery_draws 索引
      await queryInterface.addIndex('lottery_draws', ['batch_id'], {
        name: 'idx_batch_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['batch_id', 'draw_count'], {
        name: 'idx_batch_integrity',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['created_at'], {
        name: 'idx_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['created_at', 'reward_tier'], {
        name: 'idx_created_reward_tier',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['draw_type'], {
        name: 'idx_draw_type',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['user_id', 'batch_id', 'draw_sequence'], {
        name: 'idx_lottery_batch_query',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['idempotency_key'], {
        name: 'idx_lottery_draw_business_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['batch_draw_id'], {
        name: 'idx_lottery_draws_batch_draw_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['user_id', 'batch_draw_id'], {
        name: 'idx_lottery_draws_user_batch',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['user_id', 'reward_tier', 'created_at'], {
        name: 'idx_lottery_draws_user_reward_created',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['user_id', 'created_at'], {
        name: 'idx_lottery_records_user_created',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['prize_id'], {
        name: 'idx_prize_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['prize_type'], {
        name: 'idx_prize_type',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['campaign_id'], {
        name: 'idx_records_campaign_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['created_at'], {
        name: 'idx_records_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['user_id'], {
        name: 'idx_records_user_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['reward_tier'], {
        name: 'idx_reward_tier',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['user_id', 'campaign_id', 'created_at'], {
        name: 'idx_user_campaign_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['user_id', 'created_at'], {
        name: 'idx_user_created',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['user_id'], {
        name: 'idx_user_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['user_id', 'reward_tier'], {
        name: 'idx_user_reward_tier',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['user_id', 'draw_type', 'created_at'], {
        name: 'idx_user_type_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['draw_type', 'created_at'], {
        name: 'lottery_records_draw_type_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_draws', ['idempotency_key'], {
        name: 'uk_lottery_draws_idempotency_key',
        unique: true,
        transaction
      })

      // ==================== 表 22/44: lottery_management_settings ====================
      console.log('📦 [22/44] 创建表: lottery_management_settings')
      await queryInterface.createTable(
        'lottery_management_settings',
        {
          setting_id: {
            type: Sequelize.STRING(50),
            allowNull: false,
            primaryKey: true,
            comment: '设置记录唯一标识（格式：setting_时间戳_随机码）'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '目标用户ID（设置对哪个用户生效）'
          },
          setting_type: {
            type: Sequelize.ENUM('force_win', 'force_lose', 'probability_adjust', 'user_queue'),
            allowNull: false,
            comment:
              '设置类型：force_win-强制中奖，force_lose-强制不中奖，probability_adjust-概率调整，user_queue-用户专属队列'
          },
          setting_data: {
            type: Sequelize.JSON,
            allowNull: false,
            comment:
              '设置详情（JSON格式）：force_win={prize_id,reason}，force_lose={count,remaining,reason}，probability_adjust={multiplier,reason}，user_queue={queue_type,priority_level,custom_strategy}'
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '过期时间（北京时间，NULL表示永不过期）'
          },
          status: {
            type: Sequelize.ENUM('active', 'expired', 'used', 'cancelled'),
            allowNull: false,
            defaultValue: 'active',
            comment: '设置状态：active-生效中，expired-已过期，used-已使用，cancelled-已取消'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '创建管理员ID（记录是哪个管理员创建的设置，用于审计追溯）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment:
            '抽奖管理设置表：存储管理员的抽奖干预设置（强制中奖、强制不中奖、概率调整、用户专属队列）'
        }
      )

      // lottery_management_settings 索引
      await queryInterface.addIndex('lottery_management_settings', ['created_by', 'created_at'], {
        name: 'idx_created_by',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_management_settings', ['expires_at'], {
        name: 'idx_expires_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_management_settings', ['setting_type', 'status'], {
        name: 'idx_type_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_management_settings', ['user_id', 'status'], {
        name: 'idx_user_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex(
        'lottery_management_settings',
        ['user_id', 'setting_type', 'status'],
        {
          name: 'idx_user_type_status',
          unique: false,
          transaction
        }
      )

      // ==================== 表 23/44: lottery_presets ====================
      console.log('📦 [23/44] 创建表: lottery_presets')
      await queryInterface.createTable(
        'lottery_presets',
        {
          preset_id: {
            type: Sequelize.STRING(50),
            allowNull: false,
            primaryKey: true
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
          },
          prize_id: {
            type: Sequelize.INTEGER,
            allowNull: false
          },
          queue_order: {
            type: Sequelize.INTEGER,
            allowNull: false
          },
          status: {
            type: Sequelize.ENUM('pending', 'used'),
            allowNull: true,
            defaultValue: 'pending'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '抽奖结果预设表（简化版）'
        }
      )

      // lottery_presets 索引
      await queryInterface.addIndex('lottery_presets', ['created_at'], {
        name: 'idx_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_presets', ['created_by'], {
        name: 'idx_created_by',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_presets', ['queue_order'], {
        name: 'idx_queue_order',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_presets', ['user_id', 'status'], {
        name: 'idx_user_status',
        unique: false,
        transaction
      })

      // ==================== 表 24/44: lottery_prizes ====================
      console.log('📦 [24/44] 创建表: lottery_prizes')
      await queryInterface.createTable(
        'lottery_prizes',
        {
          prize_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '奖品ID'
          },
          prize_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '奖品名称（前端显示）'
          },
          prize_type: {
            type: Sequelize.ENUM(
              'points',
              'coupon',
              'physical',
              'virtual',
              'service',
              'product',
              'special'
            ),
            allowNull: false,
            comment: '奖品类型（V4.0语义清理版 - 已移除empty）'
          },
          prize_value: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.0,
            comment: '奖品价值'
          },
          angle: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '转盘角度（Canvas渲染位置，0-315度45度间隔）'
          },
          color: {
            type: Sequelize.STRING(7),
            allowNull: false,
            defaultValue: '#FF6B6B',
            comment: '转盘颜色（前端渲染，十六进制格式）'
          },
          is_activity: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 0,
            comment: '特殊动效标记（差点中奖动画）'
          },
          cost_points: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 100,
            comment: '每次抽奖消耗积分'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: '奖品状态'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 1,
            comment: '关联活动ID'
          },
          prize_description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '奖品描述'
          },
          image_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '奖品图片ID'
          },
          win_probability: {
            type: Sequelize.DECIMAL(8, 6),
            allowNull: false,
            defaultValue: 0.1,
            comment: '中奖概率'
          },
          stock_quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '库存数量'
          },
          max_daily_wins: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '每日最大中奖次数'
          },
          total_win_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '总中奖次数'
          },
          daily_win_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '今日中奖次数'
          },
          sort_order: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 100,
            comment: '排序权重'
          },
          prize_value_points: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '奖品价值积分（统一单位）'
          },
          material_asset_code: {
            type: Sequelize.STRING(32),
            allowNull: true,
            comment: '材料资产代码（如red_shard、red_crystal），NULL表示不发放材料'
          },
          material_amount: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '材料数量（当material_asset_code非空时必须>0）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // lottery_prizes 索引
      await queryInterface.addIndex('lottery_prizes', ['angle'], {
        name: 'idx_angle',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_prizes', ['campaign_id', 'status'], {
        name: 'idx_lp_campaign_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_prizes', ['material_asset_code'], {
        name: 'idx_lp_material_asset_code',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_prizes', ['prize_type'], {
        name: 'idx_prize_type',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_prizes', ['campaign_id'], {
        name: 'idx_prizes_campaign_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_prizes', ['prize_type'], {
        name: 'idx_prizes_type',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_prizes', ['status'], {
        name: 'idx_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_prizes', ['status'], {
        name: 'idx_status_probability',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('lottery_prizes', ['campaign_id', 'sort_order'], {
        name: 'idx_unique_campaign_sort_order',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('lottery_prizes', ['prize_value_points'], {
        name: 'idx_value_points',
        unique: false,
        transaction
      })

      // ==================== 表 25/44: lottery_user_daily_draw_quota ====================
      console.log('📦 [25/44] 创建表: lottery_user_daily_draw_quota')
      await queryInterface.createTable(
        'lottery_user_daily_draw_quota',
        {
          quota_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '配额记录主键ID'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID'
          },
          campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '活动ID'
          },
          quota_date: {
            type: Sequelize.DATEONLY,
            allowNull: false,
            comment: '配额日期：北京时间日期'
          },
          limit_value: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 50,
            comment: '当日上限：来自规则计算结果'
          },
          used_draw_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '已使用抽奖次数'
          },
          bonus_draw_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '当日临时补偿的抽奖次数（客服加次数用）'
          },
          last_draw_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '最后一次抽奖时间'
          },
          matched_rule_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '命中的规则ID（便于审计追溯）'
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
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // lottery_user_daily_draw_quota 索引
      await queryInterface.addIndex(
        'lottery_user_daily_draw_quota',
        ['quota_date', 'campaign_id'],
        {
          name: 'idx_date_campaign',
          unique: false,
          transaction
        }
      )
      await queryInterface.addIndex(
        'lottery_user_daily_draw_quota',
        ['user_id', 'campaign_id', 'quota_date'],
        {
          name: 'idx_user_campaign_date_unique',
          unique: true,
          transaction
        }
      )
      await queryInterface.addIndex('lottery_user_daily_draw_quota', ['user_id'], {
        name: 'idx_user_id',
        unique: false,
        transaction
      })

      // ==================== 表 26/44: market_listings ====================
      console.log('📦 [26/44] 创建表: market_listings')
      await queryInterface.createTable(
        'market_listings',
        {
          listing_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '挂牌ID（主键）'
          },
          listing_kind: {
            type: Sequelize.ENUM('item_instance', 'fungible_asset'),
            allowNull: false,
            comment:
              '挂牌类型（Listing Kind）：item_instance-不可叠加物品实例（如装备、卡牌）| fungible_asset-可叠加资产（如材料、钻石）；业务规则：决定标的资产字段的填充规则'
          },
          seller_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '卖家用户ID（Seller User ID）：挂牌创建者，外键关联 users.user_id'
          },
          offer_item_instance_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '挂牌标的物品实例ID（关联 item_instances.item_instance_id）'
          },
          offer_asset_code: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment:
              '标的资产代码（Offer Asset Code）：当 listing_kind=fungible_asset 时必填，如 red_shard、DIAMOND；业务规则：挂牌时必须冻结卖家该资产的 offer_amount 数量'
          },
          offer_amount: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment:
              '标的资产数量（Offer Amount）：当 listing_kind=fungible_asset 时必填，单位为 offer_asset_code 的最小单位；业务规则：必须 >0，挂牌时冻结该数量'
          },
          price_asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            defaultValue: 'DIAMOND',
            comment:
              '结算资产代码（Price Asset Code）：交易市场结算币种，固定为 DIAMOND；业务规则：前端和后端都强制校验只允许 DIAMOND'
          },
          price_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '挂牌价格（Price Amount）：卖家设定的总价，单位为 price_asset_code（DIAMOND）；业务规则：必须 >0，成交时买家支付该金额（含手续费）'
          },
          seller_offer_frozen: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 0,
            comment:
              '卖家标的是否已冻结（Seller Offer Frozen）：标记卖家标的资产是否已冻结；业务规则：listing_kind=fungible_asset 时必须为 true（挂牌时冻结卖家资产），listing_kind=item_instance 时为 false（物品实例不需要冻结）'
          },
          locked_by_order_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment:
              '锁定订单ID（Locked By Order ID）：记录当前锁定该挂牌的订单ID，外键关联 trade_orders.order_id；业务规则：status=locked 时必填，用于防止并发购买和超时解锁'
          },
          locked_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment:
              '锁定时间（Locked At）：记录挂牌被锁定的北京时间；业务规则：status=locked 时必填，用于超时解锁检查（默认超时时间：15分钟）'
          },
          status: {
            type: Sequelize.ENUM('on_sale', 'locked', 'sold', 'withdrawn'),
            allowNull: false,
            defaultValue: 'on_sale',
            comment:
              '挂牌状态（Status）：on_sale-在售中（可被购买或撤回）| locked-已锁定（订单处理中，不可购买或撤回）| sold-已售出（终态，成交完成）| withdrawn-已撤回（终态，卖家主动下架）；业务规则：on_sale → locked → sold/withdrawn，locked 超时自动回滚为 on_sale'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（Created At）：挂牌创建的北京时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间（Updated At）：挂牌最后更新的北京时间'
          },
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // market_listings 索引
      await queryInterface.addIndex('market_listings', ['created_at'], {
        name: 'idx_market_listings_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('market_listings', ['listing_kind'], {
        name: 'idx_market_listings_listing_kind',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('market_listings', ['locked_at'], {
        name: 'idx_market_listings_locked_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('market_listings', ['locked_by_order_id'], {
        name: 'idx_market_listings_locked_by_order_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('market_listings', ['offer_asset_code'], {
        name: 'idx_market_listings_offer_asset_code',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('market_listings', ['offer_item_instance_id'], {
        name: 'idx_market_listings_offer_item_instance_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('market_listings', ['seller_user_id'], {
        name: 'idx_market_listings_seller_user_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('market_listings', ['status'], {
        name: 'idx_market_listings_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('market_listings', ['idempotency_key'], {
        name: 'uk_market_listings_idempotency_key',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('market_listings', ['seller_user_id', 'idempotency_key'], {
        name: 'uk_market_listings_seller_idempotency',
        unique: true,
        transaction
      })

      // ==================== 表 27/44: material_asset_types ====================
      console.log('📦 [27/44] 创建表: material_asset_types')
      await queryInterface.createTable(
        'material_asset_types',
        {
          material_asset_type_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '材料资产类型ID（主键）'
          },
          asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment:
              '资产代码（Asset Code - 唯一标识）：如 red_shard/red_crystal/orange_shard，必须唯一，与 account_asset_balances.asset_code 关联'
          },
          display_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '展示名称（Display Name - 用户可见名称）：如"红色碎片""红色水晶"'
          },
          group_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment:
              '分组代码（Group Code - 材料分组）：如 red/orange/yellow/green/blue/purple，用于材料逐级转换的层级归类'
          },
          form: {
            type: Sequelize.ENUM('shard', 'crystal'),
            allowNull: false,
            comment: '形态（Form - 碎片/水晶）：shard-碎片（低级形态），crystal-水晶（高级形态）'
          },
          tier: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment:
              '层级（Tier - 材料层级）：数字越大层级越高，如 1-碎片层级，2-水晶层级，用于转换规则校验'
          },
          sort_order: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '排序权重（Sort Order - 展示排序）：数字越小越靠前，用于材料列表展示排序'
          },
          visible_value_points: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment:
              '可见价值锚点（Visible Value Points - 展示口径）：用户可见的材料价值锚点，如 1 red_shard = 10 visible_value_points，用于展示与比较，可选'
          },
          budget_value_points: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment:
              '预算价值锚点（Budget Value Points - 系统口径）：系统内部预算计算口径，用于成本核算与风控，可选'
          },
          is_enabled: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 1,
            comment:
              '是否启用（Is Enabled - 启用状态）：true-启用（可展示可转换），false-禁用（不可展示不可转换）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '创建时间（Created At - 北京时间）：记录创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '更新时间（Updated At - 北京时间）：记录最后更新时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // material_asset_types 索引
      await queryInterface.addIndex('material_asset_types', ['asset_code'], {
        name: 'asset_code',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('material_asset_types', ['group_code'], {
        name: 'idx_material_asset_types_group_code',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('material_asset_types', ['is_enabled'], {
        name: 'idx_material_asset_types_is_enabled',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('material_asset_types', ['asset_code'], {
        name: 'uk_material_asset_types_asset_code',
        unique: true,
        transaction
      })

      // ==================== 表 28/44: material_conversion_rules ====================
      console.log('📦 [28/44] 创建表: material_conversion_rules')
      await queryInterface.createTable(
        'material_conversion_rules',
        {
          rule_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '转换规则ID（主键）'
          },
          from_asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '源资产代码（From Asset Code - 转换源）：如 red_shard，表示从哪种资产转换出去'
          },
          to_asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment:
              '目标资产代码（To Asset Code - 转换目标）：如 DIAMOND/red_crystal，表示转换成哪种资产'
          },
          from_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '源资产数量（From Amount - 转换输入数量）：如 1，表示消耗 1 个源资产（如 1 red_shard）'
          },
          to_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '目标资产数量（To Amount - 转换输出数量）：如 20，表示获得 20 个目标资产（如 20 DIAMOND），比例 = to_amount / from_amount'
          },
          effective_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment:
              '生效时间（Effective At - 版本化关键字段）：规则从此时间开始生效，查询时取当前时间前的最新已启用规则（WHERE effective_at <= NOW() AND is_enabled=true ORDER BY effective_at DESC LIMIT 1），确保历史流水可回放'
          },
          is_enabled: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 1,
            comment:
              '是否启用（Is Enabled - 启用状态）：true-启用（规则生效），false-禁用（规则不生效）'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建人（Created By - 操作记录）：记录规则创建者的 user_id，用于审计'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '创建时间（Created At - 北京时间）：记录规则创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '更新时间（Updated At - 北京时间）：记录规则最后更新时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // material_conversion_rules 索引
      await queryInterface.addIndex(
        'material_conversion_rules',
        ['from_asset_code', 'to_asset_code', 'effective_at'],
        {
          name: 'idx_material_conversion_rules_conversion_path',
          unique: false,
          transaction
        }
      )
      await queryInterface.addIndex('material_conversion_rules', ['is_enabled', 'effective_at'], {
        name: 'idx_material_conversion_rules_enabled_effective',
        unique: false,
        transaction
      })

      // ==================== 表 29/44: merchant_points_reviews ====================
      console.log('📦 [29/44] 创建表: merchant_points_reviews')
      await queryInterface.createTable(
        'merchant_points_reviews',
        {
          review_id: {
            type: Sequelize.STRING(100),
            allowNull: false,
            primaryKey: true,
            comment: '审核单ID（UUID格式）'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID（申请审核的用户）'
          },
          merchant_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '商家ID（扫码审核的商家）'
          },
          points_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '审核积分金额（冻结金额）'
          },
          status: {
            type: Sequelize.ENUM('pending', 'approved', 'rejected', 'expired', 'cancelled'),
            allowNull: false,
            defaultValue: 'pending',
            comment:
              '审核状态：pending=审核中/approved=审核通过/rejected=审核拒绝/expired=审核超时/cancelled=已取消'
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '审核超时时间（超时后需客服处理）'
          },
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '幂等键（防止重复提交审核）'
          },
          qr_code_data: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '二维码数据（扫码时的原始数据）'
          },
          metadata: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '审核元数据（商家信息、扫码时间、处理信息等）'
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
          comment: '商家积分审核表（扫码审核冻结积分）'
        }
      )

      // merchant_points_reviews 索引
      await queryInterface.addIndex('merchant_points_reviews', ['idempotency_key'], {
        name: 'idempotency_key',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('merchant_points_reviews', ['expires_at'], {
        name: 'idx_mpr_expires_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('merchant_points_reviews', ['merchant_id', 'status'], {
        name: 'idx_mpr_merchant_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('merchant_points_reviews', ['status'], {
        name: 'idx_mpr_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('merchant_points_reviews', ['user_id', 'status'], {
        name: 'idx_mpr_user_status',
        unique: false,
        transaction
      })

      // ==================== 表 30/44: popup_banners ====================
      console.log('📦 [30/44] 创建表: popup_banners')
      await queryInterface.createTable(
        'popup_banners',
        {
          banner_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '弹窗Banner主键ID'
          },
          title: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '弹窗标题（便于后台管理识别）'
          },
          image_url: {
            type: Sequelize.STRING(500),
            allowNull: false,
            comment: '弹窗图片URL（Sealos对象存储）'
          },
          link_url: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '点击跳转链接（可选）'
          },
          link_type: {
            type: Sequelize.ENUM('none', 'page', 'miniprogram', 'webview'),
            allowNull: false,
            defaultValue: 'none',
            comment:
              '跳转类型：none-不跳转, page-小程序页面, miniprogram-其他小程序, webview-H5页面'
          },
          position: {
            type: Sequelize.STRING(50),
            allowNull: false,
            defaultValue: 'home',
            comment: '显示位置：home-首页, profile-个人中心等'
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 0,
            comment: '是否启用'
          },
          display_order: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '显示顺序（数字小的优先）'
          },
          start_time: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '开始展示时间（NULL表示立即生效）'
          },
          end_time: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '结束展示时间（NULL表示永不过期）'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建人ID'
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
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // popup_banners 索引
      await queryInterface.addIndex('popup_banners', ['created_by'], {
        name: 'created_by',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('popup_banners', ['display_order'], {
        name: 'idx_popup_banners_display_order',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('popup_banners', ['position', 'is_active'], {
        name: 'idx_popup_banners_position_active',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('popup_banners', ['start_time', 'end_time'], {
        name: 'idx_popup_banners_time_range',
        unique: false,
        transaction
      })

      // ==================== 表 31/44: products ====================
      console.log('📦 [31/44] 创建表: products')
      await queryInterface.createTable(
        'products',
        {
          product_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '商品唯一ID（主键）'
          },
          name: {
            type: Sequelize.STRING(200),
            allowNull: false,
            comment: '商品名称'
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '商品描述'
          },
          category: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '商品分类（前端筛选用）'
          },
          exchange_points: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '兑换所需积分（前端价格显示）'
          },
          stock: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '库存数量（前端实时显示，WebSocket同步）'
          },
          image: {
            type: Sequelize.STRING(255),
            allowNull: true,
            comment: '商品图片URL'
          },
          status: {
            type: Sequelize.ENUM('active', 'offline', 'deleted'),
            allowNull: false,
            defaultValue: 'active',
            comment: '商品状态'
          },
          is_hot: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 0,
            comment: '热门商品标记（前端推荐）'
          },
          sort_order: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '排序权重（前端排序）'
          },
          rating: {
            type: Sequelize.DECIMAL(3, 2),
            allowNull: false,
            defaultValue: 5.0,
            comment: '评分（前端星级显示）'
          },
          sales_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '销量（前端排序用）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          space: {
            type: Sequelize.ENUM('lucky', 'premium', 'both'),
            allowNull: false,
            defaultValue: 'lucky',
            comment: '所属空间：lucky-幸运空间，premium-臻选空间，both-两个空间都有'
          },
          original_price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
            comment: '原价（显示用）'
          },
          discount: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '折扣百分比'
          },
          low_stock_threshold: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 5,
            comment: '低库存预警阈值'
          },
          is_new: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 0,
            comment: '是否新品'
          },
          is_limited: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 0,
            comment: '是否限量商品'
          },
          view_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '浏览次数统计'
          },
          warranty: {
            type: Sequelize.STRING(200),
            allowNull: true,
            comment: '售后说明信息'
          },
          delivery_info: {
            type: Sequelize.STRING(200),
            allowNull: true,
            comment: '配送信息'
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '商品过期时间'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建者用户ID'
          },
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '最后更新者用户ID'
          },
          primary_image_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '主图片ID'
          },
          premium_exchange_points: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '臻选空间专属积分（NULL表示使用exchange_points）'
          },
          premium_stock: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '臻选空间独立库存（NULL表示与幸运空间共享stock）'
          },
          premium_image: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '臻选空间专属图片URL（NULL表示使用image）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // products 索引
      await queryInterface.addIndex('products', ['category'], {
        name: 'idx_category',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['category', 'exchange_points', 'stock'], {
        name: 'idx_category_points_stock',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['exchange_points'], {
        name: 'idx_exchange_points',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['is_hot'], {
        name: 'idx_is_hot',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['created_at'], {
        name: 'idx_products_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['is_new', 'is_hot'], {
        name: 'idx_products_is_new_hot',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['premium_exchange_points'], {
        name: 'idx_products_premium_points',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['premium_stock'], {
        name: 'idx_products_premium_stock',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['space', 'status'], {
        name: 'idx_products_space_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['sales_count'], {
        name: 'idx_sales_count',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['sort_order'], {
        name: 'idx_sort_order',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['status'], {
        name: 'idx_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('products', ['stock'], {
        name: 'idx_stock',
        unique: false,
        transaction
      })

      // ==================== 表 32/44: redemption_orders ====================
      console.log('📦 [32/44] 创建表: redemption_orders')
      await queryInterface.createTable(
        'redemption_orders',
        {
          order_id: {
            type: Sequelize.STRING(36),
            allowNull: false,
            primaryKey: true,
            comment: '订单ID（Order ID）：UUID格式的唯一订单标识符'
          },
          code_hash: {
            type: Sequelize.STRING(64),
            allowNull: false,
            comment:
              '核销码哈希（Code Hash）：12位Base32核销码的SHA-256哈希值（64位hex字符串），用于验证核销码，不存储明文'
          },
          item_instance_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '物品实例ID（Item Instance ID）：关联的物品实例，外键指向 item_instances.item_instance_id'
          },
          redeemer_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment:
              '核销用户ID（Redeemer User ID）：执行核销操作的用户ID，外键指向 users.user_id，核销前为NULL'
          },
          status: {
            type: Sequelize.ENUM('pending', 'fulfilled', 'cancelled', 'expired'),
            allowNull: false,
            defaultValue: 'pending',
            comment:
              '订单状态（Status）：pending-待核销 | fulfilled-已核销 | cancelled-已取消 | expired-已过期'
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '过期时间（Expires At）：核销码过期时间，创建后30天，北京时间'
          },
          fulfilled_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '核销时间（Fulfilled At）：实际核销时间，北京时间'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（Created At）：记录创建时间，北京时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间（Updated At）：记录最后更新时间，北京时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment:
            '兑换订单表（Redemption Orders）：管理核销码生成和核销流程，替代 UserInventory.verification_code'
        }
      )

      // redemption_orders 索引
      await queryInterface.addIndex('redemption_orders', ['code_hash'], {
        name: 'code_hash',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('redemption_orders', ['item_instance_id'], {
        name: 'idx_item_instance',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('redemption_orders', ['redeemer_user_id'], {
        name: 'idx_redeemer',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('redemption_orders', ['item_instance_id', 'status'], {
        name: 'idx_redemption_orders_item_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('redemption_orders', ['status', 'expires_at'], {
        name: 'idx_status_expires',
        unique: false,
        transaction
      })

      // ==================== 表 33/44: role_change_logs ====================
      console.log('📦 [33/44] 创建表: role_change_logs')
      await queryInterface.createTable(
        'role_change_logs',
        {
          log_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '日志ID（主键）'
          },
          target_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '目标用户ID（被操作的用户，如被停用权限的业务员）'
          },
          operator_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '操作人ID（执行操作的用户，如区域负责人或业务经理）'
          },
          operation_type: {
            type: Sequelize.ENUM('activate', 'deactivate', 'role_change', 'batch_deactivate'),
            allowNull: false,
            comment:
              '操作类型：activate-激活权限，deactivate-停用权限，role_change-角色变更，batch_deactivate-批量停用'
          },
          old_role_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '原角色ID（角色变更时记录，如从业务员变为业务经理）'
          },
          new_role_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '新角色ID（角色变更时记录，如从业务员变为业务经理）'
          },
          affected_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: '影响的用户数量（批量操作时记录，如停用1个业务经理及其10个业务员，则为11）'
          },
          reason: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '操作原因（如：离职、调动、违规、权限调整等）'
          },
          ip_address: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '操作IP地址（用于安全审计）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '日志记录时间，时区：北京时间（GMT+8）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '角色权限变更日志表（用于审计和追踪所有权限变更操作）'
        }
      )

      // role_change_logs 索引
      await queryInterface.addIndex('role_change_logs', ['created_at'], {
        name: 'idx_role_log_created',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('role_change_logs', ['operator_user_id'], {
        name: 'idx_role_log_operator',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('role_change_logs', ['target_user_id'], {
        name: 'idx_role_log_target',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('role_change_logs', ['operation_type'], {
        name: 'idx_role_log_type',
        unique: false,
        transaction
      })

      // ==================== 表 34/44: roles ====================
      console.log('📦 [34/44] 创建表: roles')
      await queryInterface.createTable(
        'roles',
        {
          role_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
          },
          role_uuid: {
            type: Sequelize.STRING(36),
            allowNull: false,
            comment: '角色UUID标识（安全不可推测）'
          },
          role_name: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '角色名称（仅内部使用）'
          },
          role_level: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '角色级别（0=普通用户，100=超级管理员）'
          },
          permissions: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '角色权限配置（JSON格式）'
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '角色描述'
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: true,
            defaultValue: 1,
            comment: '角色是否启用'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '角色管理表'
        }
      )

      // roles 索引
      await queryInterface.addIndex('roles', ['role_name'], {
        name: 'role_name',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('roles', ['role_uuid'], {
        name: 'role_uuid',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('roles', ['is_active'], {
        name: 'roles_is_active',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('roles', ['role_level'], {
        name: 'roles_role_level',
        unique: false,
        transaction
      })

      // ==================== 表 35/44: stores ====================
      console.log('📦 [35/44] 创建表: stores')
      await queryInterface.createTable(
        'stores',
        {
          store_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '门店ID（主键）'
          },
          store_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '门店名称（如：某某餐厅XX店）'
          },
          store_code: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '门店编号（唯一标识，如：ST20250101001）'
          },
          store_address: {
            type: Sequelize.STRING(200),
            allowNull: true,
            comment: '门店地址（详细地址）'
          },
          contact_name: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '门店联系人姓名'
          },
          contact_mobile: {
            type: Sequelize.STRING(20),
            allowNull: true,
            comment: '门店联系电话'
          },
          region: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '所属区域（如：东城区、西城区）'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive', 'pending'),
            allowNull: false,
            defaultValue: 'active',
            comment: '门店状态：active-正常营业，inactive-已关闭，pending-待审核'
          },
          assigned_to: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '分配给哪个业务员（外键关联users.user_id）'
          },
          merchant_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '商户ID（关联商家用户，外键关联users.user_id）'
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '备注信息'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（门店信息录入时间），时区：北京时间（GMT+8）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间（最后修改时间），时区：北京时间（GMT+8）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '门店信息表（用于记录合作商家门店，业务员分派依据）'
        }
      )

      // stores 索引
      await queryInterface.addIndex('stores', ['assigned_to'], {
        name: 'idx_stores_assigned_to',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('stores', ['merchant_id'], {
        name: 'idx_stores_merchant_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('stores', ['region'], {
        name: 'idx_stores_region',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('stores', ['status'], {
        name: 'idx_stores_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('stores', ['store_code'], {
        name: 'store_code',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('stores', ['store_code'], {
        name: 'uk_store_code',
        unique: true,
        transaction
      })

      // ==================== 表 36/44: system_announcements ====================
      console.log('📦 [36/44] 创建表: system_announcements')
      await queryInterface.createTable(
        'system_announcements',
        {
          announcement_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
          },
          title: {
            type: Sequelize.STRING(200),
            allowNull: false,
            comment: '公告标题'
          },
          content: {
            type: Sequelize.TEXT,
            allowNull: false,
            comment: '公告内容'
          },
          type: {
            type: Sequelize.ENUM('system', 'activity', 'maintenance', 'notice'),
            allowNull: false,
            defaultValue: 'notice',
            comment: '公告类型：系统/活动/维护/通知'
          },
          priority: {
            type: Sequelize.ENUM('high', 'medium', 'low'),
            allowNull: false,
            defaultValue: 'medium',
            comment: '优先级：高/中/低'
          },
          target_groups: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '目标用户组（管理员可见）'
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 1,
            comment: '是否激活'
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '过期时间'
          },
          admin_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '发布公告的管理员ID（基于UUID角色系统验证管理员权限）'
          },
          internal_notes: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '内部备注（管理员可见）'
          },
          view_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '查看次数'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '更新时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '系统公告表 - 支持首页公告功能'
        }
      )

      // system_announcements 索引
      await queryInterface.addIndex('system_announcements', ['admin_id'], {
        name: 'admin_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('system_announcements', ['created_at'], {
        name: 'idx_announcements_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('system_announcements', ['priority', 'expires_at'], {
        name: 'idx_announcements_priority_expires',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('system_announcements', ['type', 'is_active'], {
        name: 'idx_announcements_type_active',
        unique: false,
        transaction
      })

      // ==================== 表 37/44: system_settings ====================
      console.log('📦 [37/44] 创建表: system_settings')
      await queryInterface.createTable(
        'system_settings',
        {
          setting_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '设置项唯一标识（自增主键）'
          },
          category: {
            type: Sequelize.ENUM('basic', 'points', 'notification', 'security', 'marketplace'),
            allowNull: false,
            comment: '配置分类（仅运营配置）'
          },
          setting_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '配置键名（唯一，如system_name、base_win_rate等）'
          },
          setting_value: {
            type: Sequelize.TEXT,
            allowNull: false,
            comment: '配置值（根据value_type解析）'
          },
          value_type: {
            type: Sequelize.ENUM('string', 'number', 'boolean', 'json'),
            allowNull: false,
            defaultValue: 'string',
            comment: '值类型：string-字符串，number-数字，boolean-布尔值，json-JSON对象'
          },
          description: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '配置描述（说明此配置项的用途）'
          },
          is_visible: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 1,
            comment: '是否在管理后台显示'
          },
          is_readonly: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 0,
            comment: '是否只读（不可通过管理后台修改）'
          },
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '最后更新管理员ID'
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
          comment: '系统设置表：存储系统各模块的配置设置'
        }
      )

      // system_settings 索引
      await queryInterface.addIndex('system_settings', ['category'], {
        name: 'idx_category',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('system_settings', ['category', 'is_visible'], {
        name: 'idx_category_visible',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('system_settings', ['setting_key'], {
        name: 'idx_setting_key',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('system_settings', ['updated_by', 'updated_at'], {
        name: 'idx_updated_by',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('system_settings', ['setting_key'], {
        name: 'setting_key',
        unique: true,
        transaction
      })

      // ==================== 表 38/44: trade_orders ====================
      console.log('📦 [38/44] 创建表: trade_orders')
      await queryInterface.createTable(
        'trade_orders',
        {
          order_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '订单ID（主键）'
          },
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          listing_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '挂牌ID（Listing ID）：关联的市场挂牌，外键关联 market_listings.listing_id'
          },
          buyer_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '买家用户ID（Buyer User ID）：购买方用户，外键关联 users.user_id'
          },
          seller_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '卖家用户ID（Seller User ID）：出售方用户，外键关联 users.user_id'
          },
          asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            defaultValue: 'DIAMOND',
            comment:
              '结算资产代码（Asset Code）：交易市场结算币种，固定为 DIAMOND；业务规则：前端和后端都强制校验只允许 DIAMOND'
          },
          gross_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '买家支付总额（Gross Amount）：买家本次交易支付的总金额，单位为 asset_code（DIAMOND）；业务规则：必须 >0，等于 fee_amount + net_amount'
          },
          fee_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment:
              '平台手续费（Fee Amount）：从成交总额中拆分的平台手续费，单位为 asset_code（DIAMOND）；业务规则：≥0，手续费入系统账户 SYSTEM_PLATFORM_FEE'
          },
          net_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '卖家实收金额（Net Amount）：卖家实际收到的金额，单位为 asset_code（DIAMOND）；业务规则：必须 >0，等于 gross_amount - fee_amount'
          },
          status: {
            type: Sequelize.ENUM('created', 'frozen', 'completed', 'cancelled', 'failed'),
            allowNull: false,
            defaultValue: 'created',
            comment:
              '订单状态（Status）：created-已创建（订单初始状态）| frozen-已冻结（买家资产已冻结，等待结算）| completed-已完成（成交完成，终态）| cancelled-已取消（订单取消，解冻买家资产，终态）| failed-失败（不可恢复错误，终态）；业务规则：created → frozen → completed/cancelled/failed'
          },
          meta: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              '订单元数据（Meta）：保存关键请求参数指纹和扩展信息，用于 409 冲突保护和数据审计；示例：{ product_id, product_name, request_params_hash }'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（Created At）：订单创建的北京时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间（Updated At）：订单最后更新的北京时间'
          },
          completed_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '完成时间（Completed At）：订单完成的北京时间，status=completed 时必填'
          },
          cancelled_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '取消时间（Cancelled At）：订单取消的北京时间，status=cancelled 时必填'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // trade_orders 索引
      await queryInterface.addIndex('trade_orders', ['asset_code', 'status'], {
        name: 'idx_trade_orders_asset_code_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_orders', ['buyer_user_id'], {
        name: 'idx_trade_orders_buyer_user_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_orders', ['created_at'], {
        name: 'idx_trade_orders_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_orders', ['listing_id'], {
        name: 'idx_trade_orders_listing_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_orders', ['seller_user_id'], {
        name: 'idx_trade_orders_seller_user_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_orders', ['status'], {
        name: 'idx_trade_orders_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_orders', ['idempotency_key'], {
        name: 'uk_trade_orders_idempotency_key',
        unique: true,
        transaction
      })

      // ==================== 表 39/44: trade_records ====================
      console.log('📦 [39/44] 创建表: trade_records')
      await queryInterface.createTable(
        'trade_records',
        {
          trade_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
          },
          trade_code: {
            type: Sequelize.STRING(50),
            allowNull: true
          },
          trade_type: {
            type: Sequelize.ENUM(
              'point_transfer',
              'exchange_refund',
              'prize_claim',
              'admin_adjustment',
              'system_reward',
              'inventory_transfer',
              'market_purchase'
            ),
            allowNull: false,
            comment:
              '交易类型：point_transfer-积分转账，exchange_refund-兑换退款，prize_claim-奖品领取，admin_adjustment-管理员调整，system_reward-系统奖励，inventory_transfer-物品转让，market_purchase-市场购买（交易市场DIAMOND结算）'
          },
          from_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '发送方用户ID（系统操作时为null）'
          },
          to_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '接收方用户ID'
          },
          operator_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '操作员ID（管理员操作时使用）'
          },
          points_amount: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '交易积分数量'
          },
          fee_points_amount: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '交易手续积分数量'
          },
          net_points_amount: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '实际到账积分数量（扣除手续积分后）'
          },
          status: {
            type: Sequelize.ENUM(
              'pending',
              'processing',
              'completed',
              'failed',
              'cancelled',
              'refunded'
            ),
            allowNull: false,
            defaultValue: 'pending',
            comment: '交易状态'
          },
          related_id: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '关联记录ID（如兑换记录ID、抽奖记录ID）'
          },
          related_type: {
            type: Sequelize.ENUM('exchange', 'lottery', 'review', 'refund', 'system'),
            allowNull: true,
            comment: '关联记录类型'
          },
          trade_reason: {
            type: Sequelize.STRING(200),
            allowNull: false,
            comment: '交易原因或描述'
          },
          remarks: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '交易备注'
          },
          trade_password_hash: {
            type: Sequelize.STRING(128),
            allowNull: true,
            comment: '交易密码哈希（用户设置时）'
          },
          security_code: {
            type: Sequelize.STRING(10),
            allowNull: true,
            comment: '安全验证码'
          },
          client_ip: {
            type: Sequelize.STRING(45),
            allowNull: true,
            comment: '客户端IP地址'
          },
          device_info: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '设备信息JSON'
          },
          trade_time: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '交易发起时间'
          },
          processed_time: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '交易处理完成时间'
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '交易过期时间'
          },
          version: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: '记录版本（乐观锁）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          item_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment:
              '物品ID（关联user_inventory.inventory_id，仅用于inventory_transfer类型，用于追踪物品转让历史）'
          },
          name: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment:
              '物品名称（Item Name - 仅用于inventory_transfer类型，冗余字段用于快速查询显示；统一使用name字段，与UserInventory保持一致）'
          },
          transfer_note: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '转让备注（仅用于inventory_transfer类型，记录转让原因或说明）'
          },
          asset_code: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment:
              '结算资产代码（Asset Code - 交易结算使用的资产类型）：DIAMOND-钻石资产（交易市场唯一结算币种）；业务规则：仅trade_type=market_purchase时使用，固定为DIAMOND；用途：资产结算类型、多资产扩展预留、对账验证'
          },
          gross_amount: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment:
              '买家支付总金额（Gross Amount - 买家支付的总金额，包含手续费）：使用BIGINT避免浮点精度问题；业务规则：gross_amount = fee_amount + net_amount（对账公式）；用途：买家扣款金额、对账验证、交易金额统计'
          },
          fee_amount: {
            type: Sequelize.BIGINT,
            allowNull: true,
            defaultValue: 0,
            comment:
              '平台手续费金额（Fee Amount - 平台收取的手续费金额）：使用BIGINT避免浮点精度问题；业务规则：按fee_rules配置计算，向上取整；用途：平台收入对账、手续费统计、商家成本分析'
          },
          net_amount: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment:
              '卖家实收金额（Net Amount - 卖家实际收到的金额，扣除手续费后）：使用BIGINT避免浮点精度问题；业务规则：net_amount = gross_amount - fee_amount；用途：卖家入账金额、收益统计、对账验证'
          },
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // trade_records 索引
      await queryInterface.addIndex('trade_records', ['item_id', 'trade_type', 'created_at'], {
        name: 'idx_item_transfer_history',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_records', ['status', 'created_at'], {
        name: 'idx_trade_records_status_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_records', ['operator_id'], {
        name: 'operator_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_records', ['trade_code'], {
        name: 'trade_code',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('trade_records', ['trade_code'], {
        name: 'trade_id',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('trade_records', ['from_user_id', 'created_at'], {
        name: 'trade_records_from_user_id_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_records', ['related_id', 'related_type'], {
        name: 'trade_records_related_id_related_type',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_records', ['to_user_id', 'created_at'], {
        name: 'trade_records_to_user_id_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_records', ['trade_time'], {
        name: 'trade_records_trade_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_records', ['trade_type', 'status'], {
        name: 'trade_records_trade_type_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('trade_records', ['idempotency_key'], {
        name: 'uk_trade_records_idempotency_key',
        unique: true,
        transaction
      })

      // ==================== 表 40/44: user_hierarchy ====================
      console.log('📦 [40/44] 创建表: user_hierarchy')
      await queryInterface.createTable(
        'user_hierarchy',
        {
          hierarchy_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '层级关系ID（主键）'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID（当前用户）'
          },
          superior_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '上级用户ID（NULL表示顶级区域负责人）'
          },
          role_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '当前角色ID（关联roles表）'
          },
          store_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '所属门店ID（仅业务员有值，业务经理和区域负责人为NULL）'
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 1,
            comment: '层级关系是否有效（1=激活，0=已停用）'
          },
          activated_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '激活时间（首次激活或重新激活时记录），时区：北京时间（GMT+8）'
          },
          deactivated_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '停用时间（停用时记录），时区：北京时间（GMT+8）'
          },
          deactivated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '停用操作人ID（谁停用的？外键关联users.user_id）'
          },
          deactivation_reason: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '停用原因（如：离职、调动、违规等）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间，时区：北京时间（GMT+8）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间，时区：北京时间（GMT+8）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '用户层级关系表（简化版：仅保留核心字段和必要索引）'
        }
      )

      // user_hierarchy 索引
      await queryInterface.addIndex('user_hierarchy', ['is_active'], {
        name: 'idx_user_hierarchy_active',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('user_hierarchy', ['superior_user_id'], {
        name: 'idx_user_hierarchy_superior',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('user_hierarchy', ['user_id', 'role_id'], {
        name: 'uk_user_role',
        unique: true,
        transaction
      })

      // ==================== 表 41/44: user_premium_status ====================
      console.log('📦 [41/44] 创建表: user_premium_status')
      await queryInterface.createTable(
        'user_premium_status',
        {
          id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '自增主键（唯一标识，用于数据库内部索引，业务无关）'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID（关联users表，唯一约束确保一个用户只有一条记录，用于查询用户解锁状态）'
          },
          is_unlocked: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 0,
            comment:
              '是否已解锁高级空间（当前状态，TRUE=已解锁且在有效期内，FALSE=未解锁或已过期，用于前端权限判断）'
          },
          unlock_time: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '最近一次解锁时间（北京时间，每次解锁时更新，用于计算过期时间和运营分析）'
          },
          unlock_method: {
            type: Sequelize.ENUM('points', 'exchange', 'vip', 'manual'),
            allowNull: false,
            defaultValue: 'points',
            comment:
              '解锁方式（points=积分解锁100分，exchange=兑换码解锁，vip=VIP会员解锁，manual=管理员手动解锁，扩展性预留字段）'
          },
          total_unlock_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment:
              '累计解锁次数（包括首次解锁和重新解锁，每次解锁+1，用于运营分析用户活跃度和付费意愿）'
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment:
              '过期时间（24小时有效期，unlock_time + 24小时，NULL表示未解锁或已过期，用于判断是否需要重新解锁，查询时WHERE expires_at > NOW()）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（首次解锁时间，永不更新，用于历史追溯和用户分析）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '更新时间（每次解锁时自动更新，MySQL自动维护，用于追踪最后修改时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment:
            '用户高级空间状态表（极简版，无自动续费字段，降低维护成本60%，适合数据量<1000的小项目）'
        }
      )

      // user_premium_status 索引
      await queryInterface.addIndex('user_premium_status', ['expires_at'], {
        name: 'idx_expires_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('user_premium_status', ['is_unlocked'], {
        name: 'idx_is_unlocked',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('user_premium_status', ['user_id'], {
        name: 'idx_user_id',
        unique: true,
        transaction
      })

      // ==================== 表 42/44: user_roles ====================
      console.log('📦 [42/44] 创建表: user_roles')
      await queryInterface.createTable(
        'user_roles',
        {
          user_role_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
          },
          role_id: {
            type: Sequelize.INTEGER,
            allowNull: false
          },
          assigned_at: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          assigned_by: {
            type: Sequelize.INTEGER,
            allowNull: true
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: true,
            defaultValue: 1
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // user_roles 索引
      await queryInterface.addIndex('user_roles', ['is_active'], {
        name: 'idx_is_active',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('user_roles', ['role_id'], {
        name: 'idx_role_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('user_roles', ['user_id'], {
        name: 'idx_user_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('user_roles', ['user_id', 'role_id'], {
        name: 'user_role_unique',
        unique: true,
        transaction
      })

      // ==================== 表 43/44: users ====================
      console.log('📦 [43/44] 创建表: users')
      await queryInterface.createTable(
        'users',
        {
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '用户唯一标识'
          },
          mobile: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '手机号，唯一标识+登录凭证'
          },
          nickname: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '用户昵称'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive', 'banned'),
            allowNull: true,
            defaultValue: 'active',
            comment: '用户状态'
          },
          last_login: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '最后登录时间'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          login_count: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '登录次数统计'
          },
          consecutive_fail_count: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '连续未中奖次数（保底机制核心）'
          },
          history_total_points: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '历史累计总积分（臻选空间解锁条件）'
          },
          user_uuid: {
            type: Sequelize.STRING(36),
            allowNull: false,
            comment: '用户UUID（用于外部标识和QR码，UUIDv4格式）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // users 索引
      await queryInterface.addIndex('users', ['status'], {
        name: 'idx_status',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('users', ['user_uuid'], {
        name: 'idx_users_user_uuid_unique',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('users', ['mobile'], {
        name: 'mobile',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('users', ['history_total_points'], {
        name: 'users_history_total_points',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('users', ['last_login'], {
        name: 'users_last_login',
        unique: false,
        transaction
      })

      // ==================== 表 44/44: websocket_startup_logs ====================
      console.log('📦 [44/44] 创建表: websocket_startup_logs')
      await queryInterface.createTable(
        'websocket_startup_logs',
        {
          log_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            comment: '日志ID（主键）'
          },
          start_time: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '服务启动时间（北京时间）'
          },
          process_id: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '进程ID（process.pid）'
          },
          server_ip: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '服务器IP地址'
          },
          server_hostname: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '服务器主机名'
          },
          status: {
            type: Sequelize.ENUM('running', 'stopped', 'crashed'),
            allowNull: false,
            defaultValue: 'running',
            comment: '服务状态：running-运行中，stopped-正常停止，crashed-异常崩溃'
          },
          stop_time: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '服务停止时间（北京时间）'
          },
          stop_reason: {
            type: Sequelize.STRING(200),
            allowNull: true,
            comment: '停止原因（如：部署、重启、崩溃等）'
          },
          uptime_seconds: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '运行时长（秒），stop_time - start_time'
          },
          peak_connections: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '峰值连接数（服务运行期间的最大连接数）'
          },
          total_messages: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment: '总消息数（服务运行期间的总消息数）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '记录创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '记录更新时间（服务停止时更新）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: 'WebSocket服务启动日志表（记录所有启动/停止事件）'
        }
      )

      // websocket_startup_logs 索引
      await queryInterface.addIndex('websocket_startup_logs', ['created_at'], {
        name: 'idx_created_at',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('websocket_startup_logs', ['process_id'], {
        name: 'idx_process_id',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('websocket_startup_logs', ['start_time'], {
        name: 'idx_start_time',
        unique: false,
        transaction
      })
      await queryInterface.addIndex('websocket_startup_logs', ['status'], {
        name: 'idx_status',
        unique: false,
        transaction
      })

      // ==================== 外键约束 ====================
      console.log('🔗 创建外键约束...')

      // account_asset_balances 外键
      await queryInterface.addConstraint('account_asset_balances', {
        fields: ['account_id'],
        type: 'foreign key',
        name: 'account_asset_balances_ibfk_1',
        references: {
          table: 'accounts',
          field: 'account_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // accounts 外键
      await queryInterface.addConstraint('accounts', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'accounts_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // admin_operation_logs 外键
      await queryInterface.addConstraint('admin_operation_logs', {
        fields: ['operator_id'],
        type: 'foreign key',
        name: 'admin_operation_logs_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // asset_transactions 外键
      await queryInterface.addConstraint('asset_transactions', {
        fields: ['account_id'],
        type: 'foreign key',
        name: 'asset_transactions_account_id_foreign_idx',
        references: {
          table: 'accounts',
          field: 'account_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // audit_records 外键
      await queryInterface.addConstraint('audit_records', {
        fields: ['auditor_id'],
        type: 'foreign key',
        name: 'audit_records_ibfk_2',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // authentication_sessions 外键
      await queryInterface.addConstraint('authentication_sessions', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'authentication_sessions_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // chat_messages 外键
      await queryInterface.addConstraint('chat_messages', {
        fields: ['sender_id'],
        type: 'foreign key',
        name: 'fk_chat_messages_sender_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('chat_messages', {
        fields: ['session_id'],
        type: 'foreign key',
        name: 'fk_chat_messages_session_id',
        references: {
          table: 'customer_service_sessions',
          field: 'session_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // consumption_records 外键
      await queryInterface.addConstraint('consumption_records', {
        fields: ['merchant_id'],
        type: 'foreign key',
        name: 'fk_consumption_records_merchant_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('consumption_records', {
        fields: ['reviewed_by'],
        type: 'foreign key',
        name: 'fk_consumption_records_reviewed_by',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('consumption_records', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_consumption_records_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // content_review_records 外键
      await queryInterface.addConstraint('content_review_records', {
        fields: ['auditor_id'],
        type: 'foreign key',
        name: 'content_review_records_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // customer_service_sessions 外键
      await queryInterface.addConstraint('customer_service_sessions', {
        fields: ['admin_id'],
        type: 'foreign key',
        name: 'fk_customer_sessions_admin_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('customer_service_sessions', {
        fields: ['closed_by'],
        type: 'foreign key',
        name: 'fk_customer_sessions_closed_by',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('customer_service_sessions', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_customer_sessions_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // exchange_records 外键
      await queryInterface.addConstraint('exchange_records', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'exchange_records_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('exchange_records', {
        fields: ['item_id'],
        type: 'foreign key',
        name: 'exchange_records_ibfk_2',
        references: {
          table: 'exchange_items',
          field: 'item_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // feedbacks 外键
      await queryInterface.addConstraint('feedbacks', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'feedbacks_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('feedbacks', {
        fields: ['admin_id'],
        type: 'foreign key',
        name: 'feedbacks_ibfk_2',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // image_resources 外键
      await queryInterface.addConstraint('image_resources', {
        fields: ['reviewer_id'],
        type: 'foreign key',
        name: 'fk_image_resources_reviewer_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('image_resources', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_image_resources_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // item_instance_events 外键
      await queryInterface.addConstraint('item_instance_events', {
        fields: ['item_instance_id'],
        type: 'foreign key',
        name: 'item_instance_events_ibfk_1',
        references: {
          table: 'item_instances',
          field: 'item_instance_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // item_instances 外键
      await queryInterface.addConstraint('item_instances', {
        fields: ['owner_user_id'],
        type: 'foreign key',
        name: 'fk_item_instances_owner_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // lottery_draws 外键
      await queryInterface.addConstraint('lottery_draws', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_lottery_draws_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('lottery_draws', {
        fields: ['campaign_id'],
        type: 'foreign key',
        name: 'fk_lottery_records_campaign',
        references: {
          table: 'lottery_campaigns',
          field: 'campaign_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('lottery_draws', {
        fields: ['prize_id'],
        type: 'foreign key',
        name: 'lottery_draws_ibfk_4',
        references: {
          table: 'lottery_prizes',
          field: 'prize_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // lottery_management_settings 外键
      await queryInterface.addConstraint('lottery_management_settings', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'lottery_management_settings_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('lottery_management_settings', {
        fields: ['created_by'],
        type: 'foreign key',
        name: 'lottery_management_settings_ibfk_2',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // lottery_presets 外键
      await queryInterface.addConstraint('lottery_presets', {
        fields: ['created_by'],
        type: 'foreign key',
        name: 'fk_lottery_presets_created_by',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('lottery_presets', {
        fields: ['prize_id'],
        type: 'foreign key',
        name: 'fk_lottery_presets_prize_id',
        references: {
          table: 'lottery_prizes',
          field: 'prize_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('lottery_presets', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_lottery_presets_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // lottery_prizes 外键
      await queryInterface.addConstraint('lottery_prizes', {
        fields: ['campaign_id'],
        type: 'foreign key',
        name: 'fk_lottery_prizes_campaign',
        references: {
          table: 'lottery_campaigns',
          field: 'campaign_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // market_listings 外键
      await queryInterface.addConstraint('market_listings', {
        fields: ['offer_item_instance_id'],
        type: 'foreign key',
        name: 'fk_market_listings_offer_item_instance_id',
        references: {
          table: 'item_instances',
          field: 'item_instance_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('market_listings', {
        fields: ['seller_user_id'],
        type: 'foreign key',
        name: 'market_listings_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // merchant_points_reviews 外键
      await queryInterface.addConstraint('merchant_points_reviews', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'merchant_points_reviews_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('merchant_points_reviews', {
        fields: ['merchant_id'],
        type: 'foreign key',
        name: 'merchant_points_reviews_ibfk_2',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // popup_banners 外键
      await queryInterface.addConstraint('popup_banners', {
        fields: ['created_by'],
        type: 'foreign key',
        name: 'popup_banners_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // redemption_orders 外键
      await queryInterface.addConstraint('redemption_orders', {
        fields: ['item_instance_id'],
        type: 'foreign key',
        name: 'redemption_orders_ibfk_1',
        references: {
          table: 'item_instances',
          field: 'item_instance_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('redemption_orders', {
        fields: ['redeemer_user_id'],
        type: 'foreign key',
        name: 'redemption_orders_ibfk_2',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // role_change_logs 外键
      await queryInterface.addConstraint('role_change_logs', {
        fields: ['new_role_id'],
        type: 'foreign key',
        name: 'fk_role_log_new_role',
        references: {
          table: 'roles',
          field: 'role_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('role_change_logs', {
        fields: ['old_role_id'],
        type: 'foreign key',
        name: 'fk_role_log_old_role',
        references: {
          table: 'roles',
          field: 'role_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('role_change_logs', {
        fields: ['operator_user_id'],
        type: 'foreign key',
        name: 'fk_role_log_operator',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('role_change_logs', {
        fields: ['target_user_id'],
        type: 'foreign key',
        name: 'fk_role_log_target',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // stores 外键
      await queryInterface.addConstraint('stores', {
        fields: ['assigned_to'],
        type: 'foreign key',
        name: 'fk_store_assigned_to',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('stores', {
        fields: ['merchant_id'],
        type: 'foreign key',
        name: 'fk_store_merchant',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // system_announcements 外键
      await queryInterface.addConstraint('system_announcements', {
        fields: ['admin_id'],
        type: 'foreign key',
        name: 'system_announcements_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // trade_orders 外键
      await queryInterface.addConstraint('trade_orders', {
        fields: ['listing_id'],
        type: 'foreign key',
        name: 'trade_orders_ibfk_1',
        references: {
          table: 'market_listings',
          field: 'listing_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('trade_orders', {
        fields: ['buyer_user_id'],
        type: 'foreign key',
        name: 'trade_orders_ibfk_2',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('trade_orders', {
        fields: ['seller_user_id'],
        type: 'foreign key',
        name: 'trade_orders_ibfk_3',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // trade_records 外键
      await queryInterface.addConstraint('trade_records', {
        fields: ['to_user_id'],
        type: 'foreign key',
        name: 'fk_trade_records_to_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('trade_records', {
        fields: ['from_user_id'],
        type: 'foreign key',
        name: 'trade_records_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('trade_records', {
        fields: ['operator_id'],
        type: 'foreign key',
        name: 'trade_records_ibfk_3',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // user_hierarchy 外键
      await queryInterface.addConstraint('user_hierarchy', {
        fields: ['deactivated_by'],
        type: 'foreign key',
        name: 'fk_user_hierarchy_deactivator',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('user_hierarchy', {
        fields: ['role_id'],
        type: 'foreign key',
        name: 'fk_user_hierarchy_role',
        references: {
          table: 'roles',
          field: 'role_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('user_hierarchy', {
        fields: ['store_id'],
        type: 'foreign key',
        name: 'fk_user_hierarchy_store',
        references: {
          table: 'stores',
          field: 'store_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('user_hierarchy', {
        fields: ['superior_user_id'],
        type: 'foreign key',
        name: 'fk_user_hierarchy_superior',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('user_hierarchy', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_hierarchy_user',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // user_premium_status 外键
      await queryInterface.addConstraint('user_premium_status', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_ups_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      // user_roles 外键
      await queryInterface.addConstraint('user_roles', {
        fields: ['role_id'],
        type: 'foreign key',
        name: 'fk_user_roles_role_id',
        references: {
          table: 'roles',
          field: 'role_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('user_roles', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_roles_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      await transaction.commit()
      console.log('✅ Baseline V2.0.0迁移执行成功！')
      console.log('   共创建 44 张表')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ Baseline迁移执行失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 回滚Baseline V2.0.0迁移...')

      // 按照反向顺序删除表（先删除有外键依赖的表）
      const tables = [
        'websocket_startup_logs',
        'users',
        'user_roles',
        'user_premium_status',
        'user_hierarchy',
        'trade_records',
        'trade_orders',
        'system_settings',
        'system_announcements',
        'stores',
        'roles',
        'role_change_logs',
        'redemption_orders',
        'products',
        'popup_banners',
        'merchant_points_reviews',
        'material_conversion_rules',
        'material_asset_types',
        'market_listings',
        'lottery_user_daily_draw_quota',
        'lottery_prizes',
        'lottery_presets',
        'lottery_management_settings',
        'lottery_draws',
        'lottery_draw_quota_rules',
        'lottery_campaigns',
        'item_template_aliases',
        'item_instances',
        'item_instance_events',
        'image_resources',
        'feedbacks',
        'exchange_records',
        'exchange_items',
        'customer_service_sessions',
        'content_review_records',
        'consumption_records',
        'chat_messages',
        'authentication_sessions',
        'audit_records',
        'asset_transactions',
        'api_idempotency_requests',
        'admin_operation_logs',
        'accounts',
        'account_asset_balances'
      ]

      for (const table of tables) {
        try {
          await queryInterface.dropTable(table, { transaction, cascade: true })
          console.log(`🗑️ 删除表: ${table}`)
        } catch (error) {
          console.warn(`⚠️ 删除表失败: ${table} - ${error.message}`)
        }
      }

      await transaction.commit()
      console.log('✅ Baseline回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
