/**
 * 创建系统字典表 - 中文化显示名称基础设施
 *
 * 业务场景：
 * - 解决管理后台英文状态标识难以理解的问题
 * - 运营可通过后台动态修改中文名称，无需发版
 * - 支持版本管理和回滚
 *
 * 创建的表：
 * 1. system_dictionaries - 系统字典主表（存储各类枚举的中文映射）
 * 2. system_dictionary_history - 字典历史表（版本回滚支持）
 *
 * 覆盖范围：106个ENUM字段的中文映射
 *
 * 创建时间：2026-01-21
 * 版本：V4.7.0
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始创建系统字典表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================
      // 第1部分：创建系统字典主表
      // ========================================
      console.log('\n📦 第1部分：创建 system_dictionaries 表...')

      await queryInterface.createTable(
        'system_dictionaries',
        {
          dict_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            comment: '字典ID（自增主键）'
          },
          dict_type: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '字典类型（如：order_status, user_status）'
          },
          dict_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '字典编码（英文值，如：pending, completed）'
          },
          dict_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '字典名称（中文显示值）'
          },
          dict_color: {
            type: Sequelize.STRING(20),
            allowNull: true,
            defaultValue: null,
            comment: '前端显示颜色（如：bg-success, bg-warning）'
          },
          sort_order: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '排序（同类型内排序）'
          },
          is_enabled: {
            type: Sequelize.TINYINT(1),
            allowNull: false,
            defaultValue: 1,
            comment: '是否启用（0禁用 1启用）'
          },
          remark: {
            type: Sequelize.STRING(200),
            allowNull: true,
            defaultValue: null,
            comment: '备注说明'
          },
          version: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
            comment: '版本号（每次修改+1）'
          },
          updated_by: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            defaultValue: null,
            comment: '最后修改人ID'
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
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '系统字典表 - 存储各类枚举的中文显示名称映射'
        }
      )

      console.log('  ✅ system_dictionaries 表创建成功')

      // ========================================
      // 第2部分：创建字典历史表（版本回滚支持）
      // ========================================
      console.log('\n📦 第2部分：创建 system_dictionary_history 表...')

      await queryInterface.createTable(
        'system_dictionary_history',
        {
          history_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            comment: '历史记录ID'
          },
          dict_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            comment: '字典ID（关联 system_dictionaries.dict_id）'
          },
          dict_type: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '字典类型'
          },
          dict_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '字典编码'
          },
          dict_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '修改前的中文名称'
          },
          dict_color: {
            type: Sequelize.STRING(20),
            allowNull: true,
            defaultValue: null,
            comment: '修改前的颜色'
          },
          version: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            comment: '版本号'
          },
          changed_by: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            comment: '修改人ID'
          },
          changed_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '修改时间'
          },
          change_reason: {
            type: Sequelize.STRING(200),
            allowNull: true,
            defaultValue: null,
            comment: '修改原因'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '系统字典历史表 - 支持版本回滚'
        }
      )

      console.log('  ✅ system_dictionary_history 表创建成功')

      // ========================================
      // 第3部分：创建索引
      // ========================================
      console.log('\n📦 第3部分：创建索引...')

      // 主表索引
      await queryInterface.addIndex('system_dictionaries', ['dict_type', 'dict_code'], {
        name: 'uk_type_code',
        unique: true,
        transaction
      })

      await queryInterface.addIndex('system_dictionaries', ['dict_type'], {
        name: 'idx_type',
        transaction
      })

      await queryInterface.addIndex('system_dictionaries', ['is_enabled'], {
        name: 'idx_enabled',
        transaction
      })

      await queryInterface.addIndex('system_dictionaries', ['version'], {
        name: 'idx_version',
        transaction
      })

      // 历史表索引
      await queryInterface.addIndex('system_dictionary_history', ['dict_id'], {
        name: 'idx_dict_id',
        transaction
      })

      await queryInterface.addIndex('system_dictionary_history', ['dict_id', 'version'], {
        name: 'idx_dict_version',
        transaction
      })

      await queryInterface.addIndex('system_dictionary_history', ['changed_at'], {
        name: 'idx_changed_at',
        transaction
      })

      console.log('  ✅ 索引创建成功')

      // ========================================
      // 第4部分：添加外键约束
      // ========================================
      console.log('\n📦 第4部分：添加外键约束...')

      // 历史表外键 -> 字典表
      await queryInterface.addConstraint('system_dictionary_history', {
        fields: ['dict_id'],
        type: 'foreign key',
        name: 'fk_dict_history_dict_id',
        references: {
          table: 'system_dictionaries',
          field: 'dict_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      console.log('  ✅ 外键约束添加成功')

      // ========================================
      // 第5部分：插入全量初始数据（106个ENUM映射）
      // ========================================
      console.log('\n📦 第5部分：插入初始数据...')

      const initialData = [
        // ==================== 用户相关 ====================
        // 用户状态 (users.status)
        { dict_type: 'user_status', dict_code: 'active', dict_name: '正常', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'user_status', dict_code: 'inactive', dict_name: '未激活', dict_color: 'bg-warning', sort_order: 2 },
        { dict_type: 'user_status', dict_code: 'banned', dict_name: '已封禁', dict_color: 'bg-danger', sort_order: 3 },

        // 用户等级 (users.user_level)
        { dict_type: 'user_level', dict_code: 'normal', dict_name: '普通用户', dict_color: 'bg-secondary', sort_order: 1 },
        { dict_type: 'user_level', dict_code: 'vip', dict_name: 'VIP用户', dict_color: 'bg-warning', sort_order: 2 },
        { dict_type: 'user_level', dict_code: 'merchant', dict_name: '商户', dict_color: 'bg-primary', sort_order: 3 },

        // 账户类型 (accounts.account_type)
        { dict_type: 'account_type', dict_code: 'user', dict_name: '用户账户', dict_color: null, sort_order: 1 },
        { dict_type: 'account_type', dict_code: 'system', dict_name: '系统账户', dict_color: null, sort_order: 2 },

        // 账户状态 (accounts.status)
        { dict_type: 'account_status', dict_code: 'active', dict_name: '正常', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'account_status', dict_code: 'disabled', dict_name: '已禁用', dict_color: 'bg-danger', sort_order: 2 },

        // ==================== 订单/交易相关 ====================
        // 交易订单状态 (trade_orders.status)
        { dict_type: 'trade_order_status', dict_code: 'created', dict_name: '已创建', dict_color: 'bg-info', sort_order: 1 },
        { dict_type: 'trade_order_status', dict_code: 'frozen', dict_name: '已冻结', dict_color: 'bg-warning', sort_order: 2 },
        { dict_type: 'trade_order_status', dict_code: 'completed', dict_name: '已完成', dict_color: 'bg-success', sort_order: 3 },
        { dict_type: 'trade_order_status', dict_code: 'cancelled', dict_name: '已取消', dict_color: 'bg-secondary', sort_order: 4 },
        { dict_type: 'trade_order_status', dict_code: 'failed', dict_name: '失败', dict_color: 'bg-danger', sort_order: 5 },

        // 兑换订单状态 (exchange_records.status)
        { dict_type: 'exchange_status', dict_code: 'pending', dict_name: '待处理', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'exchange_status', dict_code: 'completed', dict_name: '已完成', dict_color: 'bg-success', sort_order: 2 },
        { dict_type: 'exchange_status', dict_code: 'shipped', dict_name: '已发货', dict_color: 'bg-info', sort_order: 3 },
        { dict_type: 'exchange_status', dict_code: 'cancelled', dict_name: '已取消', dict_color: 'bg-secondary', sort_order: 4 },

        // 核销订单状态 (redemption_orders.status)
        { dict_type: 'redemption_status', dict_code: 'pending', dict_name: '待核销', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'redemption_status', dict_code: 'fulfilled', dict_name: '已核销', dict_color: 'bg-success', sort_order: 2 },
        { dict_type: 'redemption_status', dict_code: 'cancelled', dict_name: '已取消', dict_color: 'bg-secondary', sort_order: 3 },
        { dict_type: 'redemption_status', dict_code: 'expired', dict_name: '已过期', dict_color: 'bg-danger', sort_order: 4 },

        // ==================== 市场挂牌相关 ====================
        // 挂牌状态 (market_listings.status)
        { dict_type: 'listing_status', dict_code: 'on_sale', dict_name: '挂牌中', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'listing_status', dict_code: 'locked', dict_name: '已锁定', dict_color: 'bg-warning', sort_order: 2 },
        { dict_type: 'listing_status', dict_code: 'sold', dict_name: '已售出', dict_color: 'bg-info', sort_order: 3 },
        { dict_type: 'listing_status', dict_code: 'withdrawn', dict_name: '已撤回', dict_color: 'bg-secondary', sort_order: 4 },
        { dict_type: 'listing_status', dict_code: 'admin_withdrawn', dict_name: '管理员撤回', dict_color: 'bg-danger', sort_order: 5 },

        // 挂牌类型 (market_listings.listing_kind)
        { dict_type: 'listing_kind', dict_code: 'item_instance', dict_name: '物品', dict_color: null, sort_order: 1 },
        { dict_type: 'listing_kind', dict_code: 'fungible_asset', dict_name: '资产', dict_color: null, sort_order: 2 },

        // ==================== 物品相关 ====================
        // 物品状态 (item_instances.status)
        { dict_type: 'item_status', dict_code: 'available', dict_name: '可用', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'item_status', dict_code: 'locked', dict_name: '已锁定', dict_color: 'bg-warning', sort_order: 2 },
        { dict_type: 'item_status', dict_code: 'transferred', dict_name: '已转移', dict_color: 'bg-info', sort_order: 3 },
        { dict_type: 'item_status', dict_code: 'used', dict_name: '已使用', dict_color: 'bg-secondary', sort_order: 4 },
        { dict_type: 'item_status', dict_code: 'expired', dict_name: '已过期', dict_color: 'bg-danger', sort_order: 5 },

        // ==================== 反馈相关 ====================
        // 反馈状态 (feedbacks.status)
        { dict_type: 'feedback_status', dict_code: 'pending', dict_name: '待处理', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'feedback_status', dict_code: 'processing', dict_name: '处理中', dict_color: 'bg-primary', sort_order: 2 },
        { dict_type: 'feedback_status', dict_code: 'replied', dict_name: '已回复', dict_color: 'bg-success', sort_order: 3 },
        { dict_type: 'feedback_status', dict_code: 'closed', dict_name: '已关闭', dict_color: 'bg-secondary', sort_order: 4 },

        // 反馈类目 (feedbacks.category)
        { dict_type: 'feedback_category', dict_code: 'technical', dict_name: '技术问题', dict_color: null, sort_order: 1 },
        { dict_type: 'feedback_category', dict_code: 'feature', dict_name: '功能建议', dict_color: null, sort_order: 2 },
        { dict_type: 'feedback_category', dict_code: 'bug', dict_name: 'Bug反馈', dict_color: null, sort_order: 3 },
        { dict_type: 'feedback_category', dict_code: 'complaint', dict_name: '投诉', dict_color: null, sort_order: 4 },
        { dict_type: 'feedback_category', dict_code: 'suggestion', dict_name: '建议', dict_color: null, sort_order: 5 },
        { dict_type: 'feedback_category', dict_code: 'other', dict_name: '其他', dict_color: null, sort_order: 6 },

        // 优先级 (feedbacks.priority等)
        { dict_type: 'priority', dict_code: 'high', dict_name: '高', dict_color: 'bg-danger', sort_order: 1 },
        { dict_type: 'priority', dict_code: 'medium', dict_name: '中', dict_color: 'bg-warning', sort_order: 2 },
        { dict_type: 'priority', dict_code: 'low', dict_name: '低', dict_color: 'bg-info', sort_order: 3 },

        // ==================== 消费记录相关 ====================
        // 消费记录状态 (consumption_records.status)
        { dict_type: 'consumption_status', dict_code: 'pending', dict_name: '待审核', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'consumption_status', dict_code: 'approved', dict_name: '已通过', dict_color: 'bg-success', sort_order: 2 },
        { dict_type: 'consumption_status', dict_code: 'rejected', dict_name: '已拒绝', dict_color: 'bg-danger', sort_order: 3 },
        { dict_type: 'consumption_status', dict_code: 'expired', dict_name: '已过期', dict_color: 'bg-secondary', sort_order: 4 },

        // 消费记录最终状态 (consumption_records.final_status)
        { dict_type: 'consumption_final_status', dict_code: 'pending_review', dict_name: '待复核', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'consumption_final_status', dict_code: 'approved', dict_name: '已通过', dict_color: 'bg-success', sort_order: 2 },
        { dict_type: 'consumption_final_status', dict_code: 'rejected', dict_name: '已拒绝', dict_color: 'bg-danger', sort_order: 3 },

        // ==================== 审计日志相关 ====================
        // 操作类型 (admin_operation_logs.operation_type) - 30个枚举值
        { dict_type: 'operation_type', dict_code: 'points_adjust', dict_name: '积分调整', dict_color: null, sort_order: 1 },
        { dict_type: 'operation_type', dict_code: 'asset_adjustment', dict_name: '资产调整', dict_color: null, sort_order: 2 },
        { dict_type: 'operation_type', dict_code: 'asset_orphan_cleanup', dict_name: '孤儿冻结清理', dict_color: null, sort_order: 3 },
        { dict_type: 'operation_type', dict_code: 'exchange_audit', dict_name: '兑换审核', dict_color: null, sort_order: 4 },
        { dict_type: 'operation_type', dict_code: 'product_update', dict_name: '商品修改', dict_color: null, sort_order: 5 },
        { dict_type: 'operation_type', dict_code: 'product_create', dict_name: '商品创建', dict_color: null, sort_order: 6 },
        { dict_type: 'operation_type', dict_code: 'product_delete', dict_name: '商品删除', dict_color: null, sort_order: 7 },
        { dict_type: 'operation_type', dict_code: 'user_status_change', dict_name: '用户状态变更', dict_color: null, sort_order: 8 },
        { dict_type: 'operation_type', dict_code: 'role_assign', dict_name: '角色分配', dict_color: null, sort_order: 9 },
        { dict_type: 'operation_type', dict_code: 'role_change', dict_name: '角色变更', dict_color: null, sort_order: 10 },
        { dict_type: 'operation_type', dict_code: 'prize_config', dict_name: '奖品配置', dict_color: null, sort_order: 11 },
        { dict_type: 'operation_type', dict_code: 'prize_create', dict_name: '奖品创建', dict_color: null, sort_order: 12 },
        { dict_type: 'operation_type', dict_code: 'prize_delete', dict_name: '奖品删除', dict_color: null, sort_order: 13 },
        { dict_type: 'operation_type', dict_code: 'prize_stock_adjust', dict_name: '奖品库存调整', dict_color: null, sort_order: 14 },
        { dict_type: 'operation_type', dict_code: 'campaign_config', dict_name: '活动配置', dict_color: null, sort_order: 15 },
        { dict_type: 'operation_type', dict_code: 'lottery_force_win', dict_name: '强制中奖', dict_color: null, sort_order: 16 },
        { dict_type: 'operation_type', dict_code: 'lottery_force_lose', dict_name: '强制不中奖', dict_color: null, sort_order: 17 },
        { dict_type: 'operation_type', dict_code: 'lottery_probability_adjust', dict_name: '概率调整', dict_color: null, sort_order: 18 },
        { dict_type: 'operation_type', dict_code: 'lottery_user_queue', dict_name: '用户队列', dict_color: null, sort_order: 19 },
        { dict_type: 'operation_type', dict_code: 'lottery_clear_settings', dict_name: '清除抽奖设置', dict_color: null, sort_order: 20 },
        { dict_type: 'operation_type', dict_code: 'inventory_operation', dict_name: '库存操作', dict_color: null, sort_order: 21 },
        { dict_type: 'operation_type', dict_code: 'inventory_transfer', dict_name: '库存转让', dict_color: null, sort_order: 22 },
        { dict_type: 'operation_type', dict_code: 'market_listing_admin_withdraw', dict_name: '管理员撤回挂牌', dict_color: null, sort_order: 23 },
        { dict_type: 'operation_type', dict_code: 'system_config', dict_name: '系统配置', dict_color: null, sort_order: 24 },
        { dict_type: 'operation_type', dict_code: 'session_assign', dict_name: '会话分配', dict_color: null, sort_order: 25 },
        { dict_type: 'operation_type', dict_code: 'consumption_audit', dict_name: '消费审核', dict_color: null, sort_order: 26 },
        { dict_type: 'operation_type', dict_code: 'feature_flag_create', dict_name: '功能开关创建', dict_color: null, sort_order: 27 },
        { dict_type: 'operation_type', dict_code: 'feature_flag_update', dict_name: '功能开关更新', dict_color: null, sort_order: 28 },
        { dict_type: 'operation_type', dict_code: 'feature_flag_delete', dict_name: '功能开关删除', dict_color: null, sort_order: 29 },
        { dict_type: 'operation_type', dict_code: 'feature_flag_toggle', dict_name: '功能开关切换', dict_color: null, sort_order: 30 },

        // 目标类型 (admin_operation_logs.target_type)
        { dict_type: 'target_type', dict_code: 'user', dict_name: '用户', dict_color: null, sort_order: 1 },
        { dict_type: 'target_type', dict_code: 'admin', dict_name: '管理员', dict_color: null, sort_order: 2 },
        { dict_type: 'target_type', dict_code: 'product', dict_name: '商品', dict_color: null, sort_order: 3 },
        { dict_type: 'target_type', dict_code: 'order', dict_name: '订单', dict_color: null, sort_order: 4 },
        { dict_type: 'target_type', dict_code: 'trade_order', dict_name: '交易订单', dict_color: null, sort_order: 5 },
        { dict_type: 'target_type', dict_code: 'market_listing', dict_name: '市场挂牌', dict_color: null, sort_order: 6 },
        { dict_type: 'target_type', dict_code: 'system', dict_name: '系统', dict_color: null, sort_order: 7 },
        { dict_type: 'target_type', dict_code: 'config', dict_name: '配置', dict_color: null, sort_order: 8 },
        { dict_type: 'target_type', dict_code: 'lottery', dict_name: '抽奖', dict_color: null, sort_order: 9 },
        { dict_type: 'target_type', dict_code: 'prize', dict_name: '奖品', dict_color: null, sort_order: 10 },
        { dict_type: 'target_type', dict_code: 'campaign', dict_name: '活动', dict_color: null, sort_order: 11 },
        { dict_type: 'target_type', dict_code: 'feature_flag', dict_name: '功能开关', dict_color: null, sort_order: 12 },

        // ==================== 抽奖系统相关 ====================
        // 活动状态 (lottery_campaigns.status)
        { dict_type: 'campaign_status', dict_code: 'draft', dict_name: '草稿', dict_color: 'bg-secondary', sort_order: 1 },
        { dict_type: 'campaign_status', dict_code: 'active', dict_name: '进行中', dict_color: 'bg-success', sort_order: 2 },
        { dict_type: 'campaign_status', dict_code: 'paused', dict_name: '已暂停', dict_color: 'bg-warning', sort_order: 3 },
        { dict_type: 'campaign_status', dict_code: 'ended', dict_name: '已结束', dict_color: 'bg-info', sort_order: 4 },
        { dict_type: 'campaign_status', dict_code: 'cancelled', dict_name: '已取消', dict_color: 'bg-danger', sort_order: 5 },

        // 活动类型 (lottery_campaigns.campaign_type)
        { dict_type: 'campaign_type', dict_code: 'daily', dict_name: '每日活动', dict_color: null, sort_order: 1 },
        { dict_type: 'campaign_type', dict_code: 'weekly', dict_name: '每周活动', dict_color: null, sort_order: 2 },
        { dict_type: 'campaign_type', dict_code: 'event', dict_name: '特殊活动', dict_color: null, sort_order: 3 },
        { dict_type: 'campaign_type', dict_code: 'permanent', dict_name: '常驻活动', dict_color: null, sort_order: 4 },
        { dict_type: 'campaign_type', dict_code: 'pool_basic', dict_name: '基础池', dict_color: null, sort_order: 5 },
        { dict_type: 'campaign_type', dict_code: 'pool_advanced', dict_name: '进阶池', dict_color: null, sort_order: 6 },
        { dict_type: 'campaign_type', dict_code: 'pool_vip', dict_name: 'VIP池', dict_color: null, sort_order: 7 },
        { dict_type: 'campaign_type', dict_code: 'pool_newbie', dict_name: '新手池', dict_color: null, sort_order: 8 },

        // 预算模式 (lottery_campaigns.budget_mode)
        { dict_type: 'budget_mode', dict_code: 'user', dict_name: '用户预算', dict_color: null, sort_order: 1 },
        { dict_type: 'budget_mode', dict_code: 'pool', dict_name: '奖池预算', dict_color: null, sort_order: 2 },
        { dict_type: 'budget_mode', dict_code: 'none', dict_name: '无预算', dict_color: null, sort_order: 3 },

        // 奖品类型 (lottery_prizes.prize_type)
        { dict_type: 'prize_type', dict_code: 'points', dict_name: '积分', dict_color: null, sort_order: 1 },
        { dict_type: 'prize_type', dict_code: 'coupon', dict_name: '优惠券', dict_color: null, sort_order: 2 },
        { dict_type: 'prize_type', dict_code: 'physical', dict_name: '实物', dict_color: null, sort_order: 3 },
        { dict_type: 'prize_type', dict_code: 'virtual', dict_name: '虚拟物品', dict_color: null, sort_order: 4 },
        { dict_type: 'prize_type', dict_code: 'service', dict_name: '服务', dict_color: null, sort_order: 5 },
        { dict_type: 'prize_type', dict_code: 'product', dict_name: '商品', dict_color: null, sort_order: 6 },
        { dict_type: 'prize_type', dict_code: 'special', dict_name: '特殊奖品', dict_color: null, sort_order: 7 },

        // 奖励档位 (lottery_prizes.reward_tier)
        { dict_type: 'reward_tier', dict_code: 'high', dict_name: '高档', dict_color: 'bg-danger', sort_order: 1 },
        { dict_type: 'reward_tier', dict_code: 'mid', dict_name: '中档', dict_color: 'bg-warning', sort_order: 2 },
        { dict_type: 'reward_tier', dict_code: 'low', dict_name: '低档', dict_color: 'bg-info', sort_order: 3 },
        { dict_type: 'reward_tier', dict_code: 'fallback', dict_name: '保底', dict_color: 'bg-secondary', sort_order: 4 },
        { dict_type: 'reward_tier', dict_code: 'unknown', dict_name: '未知', dict_color: 'bg-dark', sort_order: 5 },

        // 抽奖类型 (lottery_draws.draw_type)
        { dict_type: 'draw_type', dict_code: 'single', dict_name: '单抽', dict_color: null, sort_order: 1 },
        { dict_type: 'draw_type', dict_code: 'triple', dict_name: '三连抽', dict_color: null, sort_order: 2 },
        { dict_type: 'draw_type', dict_code: 'five', dict_name: '五连抽', dict_color: null, sort_order: 3 },
        { dict_type: 'draw_type', dict_code: 'ten', dict_name: '十连抽', dict_color: null, sort_order: 4 },
        { dict_type: 'draw_type', dict_code: 'multi', dict_name: '多连抽', dict_color: null, sort_order: 5 },

        // Pipeline类型 (lottery_draws.pipeline_type)
        { dict_type: 'pipeline_type', dict_code: 'normal', dict_name: '正常流程', dict_color: null, sort_order: 1 },
        { dict_type: 'pipeline_type', dict_code: 'preset', dict_name: '预设流程', dict_color: null, sort_order: 2 },
        { dict_type: 'pipeline_type', dict_code: 'override', dict_name: '覆盖流程', dict_color: null, sort_order: 3 },

        // 预设状态 (lottery_presets.status)
        { dict_type: 'preset_status', dict_code: 'pending', dict_name: '待使用', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'preset_status', dict_code: 'used', dict_name: '已使用', dict_color: 'bg-success', sort_order: 2 },

        // 预设审批状态 (lottery_presets.approval_status)
        { dict_type: 'preset_approval_status', dict_code: 'pending', dict_name: '待审批', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'preset_approval_status', dict_code: 'approved', dict_name: '已通过', dict_color: 'bg-success', sort_order: 2 },
        { dict_type: 'preset_approval_status', dict_code: 'rejected', dict_name: '已拒绝', dict_color: 'bg-danger', sort_order: 3 },

        // 管理设置状态 (lottery_management_settings.status)
        { dict_type: 'management_setting_status', dict_code: 'active', dict_name: '生效中', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'management_setting_status', dict_code: 'expired', dict_name: '已过期', dict_color: 'bg-secondary', sort_order: 2 },
        { dict_type: 'management_setting_status', dict_code: 'used', dict_name: '已使用', dict_color: 'bg-info', sort_order: 3 },
        { dict_type: 'management_setting_status', dict_code: 'cancelled', dict_name: '已取消', dict_color: 'bg-warning', sort_order: 4 },

        // 管理设置类型 (lottery_management_settings.setting_type)
        { dict_type: 'management_setting_type', dict_code: 'force_win', dict_name: '强制中奖', dict_color: null, sort_order: 1 },
        { dict_type: 'management_setting_type', dict_code: 'force_lose', dict_name: '强制不中奖', dict_color: null, sort_order: 2 },
        { dict_type: 'management_setting_type', dict_code: 'probability_adjust', dict_name: '概率调整', dict_color: null, sort_order: 3 },
        { dict_type: 'management_setting_type', dict_code: 'user_queue', dict_name: '用户队列', dict_color: null, sort_order: 4 },

        // ==================== 客服/聊天相关 ====================
        // 客服会话状态 (customer_service_sessions.status)
        { dict_type: 'cs_session_status', dict_code: 'waiting', dict_name: '等待中', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'cs_session_status', dict_code: 'assigned', dict_name: '已分配', dict_color: 'bg-info', sort_order: 2 },
        { dict_type: 'cs_session_status', dict_code: 'active', dict_name: '进行中', dict_color: 'bg-success', sort_order: 3 },
        { dict_type: 'cs_session_status', dict_code: 'closed', dict_name: '已关闭', dict_color: 'bg-secondary', sort_order: 4 },

        // 消息类型 (chat_messages.message_type)
        { dict_type: 'message_type', dict_code: 'text', dict_name: '文本', dict_color: null, sort_order: 1 },
        { dict_type: 'message_type', dict_code: 'image', dict_name: '图片', dict_color: null, sort_order: 2 },
        { dict_type: 'message_type', dict_code: 'system', dict_name: '系统消息', dict_color: null, sort_order: 3 },

        // 消息状态 (chat_messages.status)
        { dict_type: 'message_status', dict_code: 'sending', dict_name: '发送中', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'message_status', dict_code: 'sent', dict_name: '已发送', dict_color: 'bg-info', sort_order: 2 },
        { dict_type: 'message_status', dict_code: 'delivered', dict_name: '已送达', dict_color: 'bg-primary', sort_order: 3 },
        { dict_type: 'message_status', dict_code: 'read', dict_name: '已读', dict_color: 'bg-success', sort_order: 4 },

        // 发送者类型 (chat_messages.sender_type)
        { dict_type: 'sender_type', dict_code: 'user', dict_name: '用户', dict_color: null, sort_order: 1 },
        { dict_type: 'sender_type', dict_code: 'admin', dict_name: '客服', dict_color: null, sort_order: 2 },

        // 消息来源 (chat_messages.message_source)
        { dict_type: 'message_source', dict_code: 'user_client', dict_name: '用户端', dict_color: null, sort_order: 1 },
        { dict_type: 'message_source', dict_code: 'admin_client', dict_name: '管理端', dict_color: null, sort_order: 2 },
        { dict_type: 'message_source', dict_code: 'system', dict_name: '系统', dict_color: null, sort_order: 3 },

        // ==================== 审核/内容相关 ====================
        // 审核状态 (content_review_records.audit_status)
        { dict_type: 'audit_status', dict_code: 'pending', dict_name: '待审核', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'audit_status', dict_code: 'approved', dict_name: '已通过', dict_color: 'bg-success', sort_order: 2 },
        { dict_type: 'audit_status', dict_code: 'rejected', dict_name: '已拒绝', dict_color: 'bg-danger', sort_order: 3 },
        { dict_type: 'audit_status', dict_code: 'cancelled', dict_name: '已取消', dict_color: 'bg-secondary', sort_order: 4 },

        // 图片状态 (image_resources.status)
        { dict_type: 'image_status', dict_code: 'active', dict_name: '正常', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'image_status', dict_code: 'archived', dict_name: '已归档', dict_color: 'bg-info', sort_order: 2 },
        { dict_type: 'image_status', dict_code: 'deleted', dict_name: '已删除', dict_color: 'bg-danger', sort_order: 3 },

        // 图片业务类型 (image_resources.business_type)
        { dict_type: 'image_business_type', dict_code: 'lottery', dict_name: '抽奖', dict_color: null, sort_order: 1 },
        { dict_type: 'image_business_type', dict_code: 'exchange', dict_name: '兑换', dict_color: null, sort_order: 2 },
        { dict_type: 'image_business_type', dict_code: 'trade', dict_name: '交易', dict_color: null, sort_order: 3 },
        { dict_type: 'image_business_type', dict_code: 'uploads', dict_name: '上传', dict_color: null, sort_order: 4 },

        // ==================== 商户/门店相关 ====================
        // 门店状态 (stores.status)
        { dict_type: 'store_status', dict_code: 'active', dict_name: '正常', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'store_status', dict_code: 'inactive', dict_name: '停用', dict_color: 'bg-warning', sort_order: 2 },
        { dict_type: 'store_status', dict_code: 'pending', dict_name: '待审核', dict_color: 'bg-info', sort_order: 3 },

        // 门店员工状态 (store_staff.status)
        { dict_type: 'store_staff_status', dict_code: 'active', dict_name: '在职', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'store_staff_status', dict_code: 'inactive', dict_name: '离职', dict_color: 'bg-secondary', sort_order: 2 },
        { dict_type: 'store_staff_status', dict_code: 'pending', dict_name: '待入职', dict_color: 'bg-warning', sort_order: 3 },

        // 员工角色 (store_staff.role_in_store)
        { dict_type: 'store_staff_role', dict_code: 'staff', dict_name: '店员', dict_color: null, sort_order: 1 },
        { dict_type: 'store_staff_role', dict_code: 'manager', dict_name: '店长', dict_color: null, sort_order: 2 },

        // 商户操作类型 (merchant_operation_logs.operation_type)
        { dict_type: 'merchant_operation_type', dict_code: 'scan_user', dict_name: '扫码用户', dict_color: null, sort_order: 1 },
        { dict_type: 'merchant_operation_type', dict_code: 'submit_consumption', dict_name: '提交消费', dict_color: null, sort_order: 2 },
        { dict_type: 'merchant_operation_type', dict_code: 'view_consumption_list', dict_name: '查看消费列表', dict_color: null, sort_order: 3 },
        { dict_type: 'merchant_operation_type', dict_code: 'view_consumption_detail', dict_name: '查看消费详情', dict_color: null, sort_order: 4 },
        { dict_type: 'merchant_operation_type', dict_code: 'staff_login', dict_name: '员工登录', dict_color: null, sort_order: 5 },
        { dict_type: 'merchant_operation_type', dict_code: 'staff_logout', dict_name: '员工登出', dict_color: null, sort_order: 6 },
        { dict_type: 'merchant_operation_type', dict_code: 'staff_add', dict_name: '添加员工', dict_color: null, sort_order: 7 },
        { dict_type: 'merchant_operation_type', dict_code: 'staff_transfer', dict_name: '员工调动', dict_color: null, sort_order: 8 },
        { dict_type: 'merchant_operation_type', dict_code: 'staff_disable', dict_name: '禁用员工', dict_color: null, sort_order: 9 },
        { dict_type: 'merchant_operation_type', dict_code: 'staff_enable', dict_name: '启用员工', dict_color: null, sort_order: 10 },

        // 操作结果 (merchant_operation_logs.result)
        { dict_type: 'operation_result', dict_code: 'success', dict_name: '成功', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'operation_result', dict_code: 'failed', dict_name: '失败', dict_color: 'bg-danger', sort_order: 2 },
        { dict_type: 'operation_result', dict_code: 'blocked', dict_name: '已阻断', dict_color: 'bg-warning', sort_order: 3 },

        // ==================== 风控相关 ====================
        // 风控告警类型 (risk_alerts.alert_type)
        { dict_type: 'risk_alert_type', dict_code: 'frequency_limit', dict_name: '频次超限', dict_color: null, sort_order: 1 },
        { dict_type: 'risk_alert_type', dict_code: 'amount_limit', dict_name: '金额超限', dict_color: null, sort_order: 2 },
        { dict_type: 'risk_alert_type', dict_code: 'duplicate_user', dict_name: '重复用户', dict_color: null, sort_order: 3 },
        { dict_type: 'risk_alert_type', dict_code: 'suspicious_pattern', dict_name: '可疑模式', dict_color: null, sort_order: 4 },

        // 风控告警严重程度 (risk_alerts.severity)
        { dict_type: 'risk_severity', dict_code: 'low', dict_name: '低', dict_color: 'bg-info', sort_order: 1 },
        { dict_type: 'risk_severity', dict_code: 'medium', dict_name: '中', dict_color: 'bg-warning', sort_order: 2 },
        { dict_type: 'risk_severity', dict_code: 'high', dict_name: '高', dict_color: 'bg-danger', sort_order: 3 },
        { dict_type: 'risk_severity', dict_code: 'critical', dict_name: '严重', dict_color: 'bg-dark', sort_order: 4 },

        // 风控告警状态 (risk_alerts.status)
        { dict_type: 'risk_alert_status', dict_code: 'pending', dict_name: '待处理', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'risk_alert_status', dict_code: 'reviewed', dict_name: '已审核', dict_color: 'bg-success', sort_order: 2 },
        { dict_type: 'risk_alert_status', dict_code: 'ignored', dict_name: '已忽略', dict_color: 'bg-secondary', sort_order: 3 },

        // ==================== 功能开关相关 ====================
        // 发布策略 (feature_flags.rollout_strategy)
        { dict_type: 'rollout_strategy', dict_code: 'all', dict_name: '全量', dict_color: null, sort_order: 1 },
        { dict_type: 'rollout_strategy', dict_code: 'percentage', dict_name: '百分比', dict_color: null, sort_order: 2 },
        { dict_type: 'rollout_strategy', dict_code: 'user_list', dict_name: '用户白名单', dict_color: null, sort_order: 3 },
        { dict_type: 'rollout_strategy', dict_code: 'user_segment', dict_name: '用户分群', dict_color: null, sort_order: 4 },
        { dict_type: 'rollout_strategy', dict_code: 'schedule', dict_name: '定时', dict_color: null, sort_order: 5 },

        // 降级行为 (feature_flags.fallback_behavior)
        { dict_type: 'fallback_behavior', dict_code: 'disabled', dict_name: '禁用', dict_color: null, sort_order: 1 },
        { dict_type: 'fallback_behavior', dict_code: 'default_value', dict_name: '默认值', dict_color: null, sort_order: 2 },
        { dict_type: 'fallback_behavior', dict_code: 'old_logic', dict_name: '旧逻辑', dict_color: null, sort_order: 3 },

        // ==================== 其他系统字段 ====================
        // 通用启用状态
        { dict_type: 'enabled_status', dict_code: 'active', dict_name: '启用', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'enabled_status', dict_code: 'inactive', dict_name: '禁用', dict_color: 'bg-secondary', sort_order: 2 },

        // 通用是/否
        { dict_type: 'yes_no', dict_code: 'yes', dict_name: '是', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'yes_no', dict_code: 'no', dict_name: '否', dict_color: 'bg-secondary', sort_order: 2 },

        // 公告类型 (system_announcements.type)
        { dict_type: 'announcement_type', dict_code: 'system', dict_name: '系统公告', dict_color: null, sort_order: 1 },
        { dict_type: 'announcement_type', dict_code: 'activity', dict_name: '活动公告', dict_color: null, sort_order: 2 },
        { dict_type: 'announcement_type', dict_code: 'maintenance', dict_name: '维护公告', dict_color: null, sort_order: 3 },
        { dict_type: 'announcement_type', dict_code: 'notice', dict_name: '通知', dict_color: null, sort_order: 4 },

        // 商品空间 (products.space)
        { dict_type: 'product_space', dict_code: 'lucky', dict_name: '幸运空间', dict_color: null, sort_order: 1 },
        { dict_type: 'product_space', dict_code: 'premium', dict_name: '高级空间', dict_color: null, sort_order: 2 },
        { dict_type: 'product_space', dict_code: 'both', dict_name: '双空间', dict_color: null, sort_order: 3 },

        // 商品状态 (products.status)
        { dict_type: 'product_status', dict_code: 'active', dict_name: '上架', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'product_status', dict_code: 'offline', dict_name: '下架', dict_color: 'bg-warning', sort_order: 2 },
        { dict_type: 'product_status', dict_code: 'deleted', dict_name: '已删除', dict_color: 'bg-danger', sort_order: 3 },

        // 行政区划状态 (administrative_regions.status)
        { dict_type: 'region_status', dict_code: 'active', dict_name: '正常', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'region_status', dict_code: 'merged', dict_name: '已合并', dict_color: 'bg-info', sort_order: 2 },
        { dict_type: 'region_status', dict_code: 'abolished', dict_name: '已撤销', dict_color: 'bg-secondary', sort_order: 3 },

        // 幂等请求状态 (api_idempotency_requests.status)
        { dict_type: 'idempotency_status', dict_code: 'processing', dict_name: '处理中', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'idempotency_status', dict_code: 'completed', dict_name: '已完成', dict_color: 'bg-success', sort_order: 2 },
        { dict_type: 'idempotency_status', dict_code: 'failed', dict_name: '失败', dict_color: 'bg-danger', sort_order: 3 },

        // WebSocket状态 (websocket_startup_logs.status)
        { dict_type: 'websocket_status', dict_code: 'running', dict_name: '运行中', dict_color: 'bg-success', sort_order: 1 },
        { dict_type: 'websocket_status', dict_code: 'stopped', dict_name: '已停止', dict_color: 'bg-secondary', sort_order: 2 },
        { dict_type: 'websocket_status', dict_code: 'crashed', dict_name: '已崩溃', dict_color: 'bg-danger', sort_order: 3 },

        // 高级空间解锁方式 (user_premium_status.unlock_method)
        { dict_type: 'unlock_method', dict_code: 'points', dict_name: '积分解锁', dict_color: null, sort_order: 1 },
        { dict_type: 'unlock_method', dict_code: 'exchange', dict_name: '兑换解锁', dict_color: null, sort_order: 2 },
        { dict_type: 'unlock_method', dict_code: 'vip', dict_name: 'VIP解锁', dict_color: null, sort_order: 3 },
        { dict_type: 'unlock_method', dict_code: 'manual', dict_name: '手动解锁', dict_color: null, sort_order: 4 },

        // 欠账状态 (preset_inventory_debt.status, preset_budget_debt.status)
        { dict_type: 'debt_status', dict_code: 'pending', dict_name: '待清偿', dict_color: 'bg-warning', sort_order: 1 },
        { dict_type: 'debt_status', dict_code: 'cleared', dict_name: '已清偿', dict_color: 'bg-success', sort_order: 2 },
        { dict_type: 'debt_status', dict_code: 'written_off', dict_name: '已核销', dict_color: 'bg-secondary', sort_order: 3 }
      ]

      // 添加公共字段并批量插入
      const now = new Date()
      const dataWithDefaults = initialData.map(item => ({
        ...item,
        is_enabled: 1,
        version: 1,
        created_at: now,
        updated_at: now
      }))

      await queryInterface.bulkInsert('system_dictionaries', dataWithDefaults, { transaction })

      console.log(`  ✅ 插入初始数据成功（${initialData.length}条）`)

      // ========================================
      // 第6部分：数据完整性验证
      // ========================================
      console.log('\n📦 第6部分：数据完整性验证...')

      // 验证表创建
      const tables = await queryInterface.showAllTables()
      const requiredTables = ['system_dictionaries', 'system_dictionary_history']
      const missingTables = requiredTables.filter(t => !tables.includes(t))

      if (missingTables.length > 0) {
        throw new Error(`缺少必需的表: ${missingTables.join(', ')}`)
      }
      console.log('  ✅ 所有必需表已创建')

      // 验证表结构
      const dictFields = await queryInterface.describeTable('system_dictionaries')
      const requiredFields = ['dict_id', 'dict_type', 'dict_code', 'dict_name', 'dict_color', 'is_enabled', 'version']
      const missingFields = requiredFields.filter(f => !dictFields[f])

      if (missingFields.length > 0) {
        throw new Error(`system_dictionaries表缺少字段: ${missingFields.join(', ')}`)
      }
      console.log('  ✅ 表结构完整')

      // 验证初始数据
      const [countResult] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM system_dictionaries',
        { transaction }
      )

      if (countResult[0].count < initialData.length) {
        throw new Error(`初始数据不完整，期望${initialData.length}条，实际${countResult[0].count}条`)
      }
      console.log(`  ✅ 初始数据完整（${countResult[0].count}条）`)

      // ========================================
      // 提交事务
      // ========================================
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 系统字典表创建成功！')
      console.log('='.repeat(60))
      console.log('\n📊 创建摘要:')
      console.log('  - 表数量: 2')
      console.log('  - 索引数量: 7')
      console.log('  - 外键约束: 1')
      console.log(`  - 初始数据: ${initialData.length}条`)
      console.log('')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败:', error.message)
      console.error(error.stack)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚系统字典表...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 按照依赖关系逆序删除
      await queryInterface.dropTable('system_dictionary_history', { transaction })
      await queryInterface.dropTable('system_dictionaries', { transaction })

      await transaction.commit()
      console.log('✅ 系统字典表回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}

