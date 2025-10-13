/**
 * 基准迁移 V1.0.0 - 显式手写版本
 *
 * ⚠️ 生产环境标准：永不使用 sequelize.sync()
 * ✅ 所有表结构都是明确的 queryInterface 调用
 *
 * 生成时间: 2025/10/14 02:40:09
 * 模型数量: 21
 *
 * 包含内容:
 * - 21 个业务表的完整定义
 * - 所有字段定义（类型、约束、默认值）
 * - 所有索引定义
 * - 完整的 down() 回滚方法
 * - 初始角色数据
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始执行显式基准迁移...')
    console.log('='.repeat(60))

    try {
    // ==================== User ====================
      console.log('📋 创建表: users')
      await queryInterface.createTable('users', {
        user_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
          comment: '用户唯一标识'
        },
        mobile: {
          type: Sequelize.STRING(20),
          allowNull: false,
          unique: true,
          comment: '手机号，唯一标识+登录凭证'
        },
        consecutive_fail_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '连续未中奖次数（保底机制核心）'
        },
        history_total_points: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '历史累计总积分（臻选空间解锁条件）'
        },
        nickname: {
          type: Sequelize.STRING(50),
          comment: '用户昵称'
        },
        status: {
          type: Sequelize.ENUM('active', 'inactive', 'banned'),
          defaultValue: 'active',
          comment: '用户状态'
        },
        last_login: {
          type: Sequelize.DATE,
          comment: '最后登录时间'
        },
        login_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '登录次数统计'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // User - 索引
      await queryInterface.addIndex('users', ['mobile'], {
        name: 'users_mobile', unique: true
      })
      await queryInterface.addIndex('users', ['status'], {
        name: 'users_status'
      })
      await queryInterface.addIndex('users', ['history_total_points'], {
        name: 'users_history_total_points'
      })
      await queryInterface.addIndex('users', ['last_login'], {
        name: 'users_last_login'
      })

      // ==================== Role ====================
      console.log('📋 创建表: roles')
      await queryInterface.createTable('roles', {
        role_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键ID'
        },
        role_uuid: {
          type: Sequelize.STRING(36),
          allowNull: false,
          unique: true,
          defaultValue: () => uuidv4(),
          comment: '角色UUID标识（安全不可推测）'
        },
        role_name: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
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
          defaultValue: Sequelize.NOW,
          comment: '角色权限配置（JSON格式）'
        },
        description: {
          type: Sequelize.TEXT,
          comment: '角色描述'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          comment: '角色是否启用'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // Role - 索引
      await queryInterface.addIndex('roles', ['role_uuid'], {
        name: 'roles_role_uuid', unique: true
      })
      await queryInterface.addIndex('roles', ['role_name'], {
        name: 'roles_role_name', unique: true
      })
      await queryInterface.addIndex('roles', ['role_level'], {
        name: 'roles_role_level'
      })
      await queryInterface.addIndex('roles', ['is_active'], {
        name: 'roles_is_active'
      })

      // ==================== UserRole ====================
      console.log('📋 创建表: user_roles')
      await queryInterface.createTable('user_roles', {
        user_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          unique: true,
          comment: '用户ID'
        },
        role_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          unique: true,
          comment: '角色ID'
        },
        assigned_at: {
          type: Sequelize.DATE,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '角色分配时间'
        },
        assigned_by: {
          type: Sequelize.INTEGER,
          comment: '角色分配者ID'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          comment: '角色是否激活'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // UserRole - 索引
      await queryInterface.addIndex('user_roles', ['user_id', 'role_id'], {
        name: 'user_roles_user_id_role_id', unique: true
      })
      await queryInterface.addIndex('user_roles', ['user_id'], {
        name: 'user_roles_user_id'
      })
      await queryInterface.addIndex('user_roles', ['role_id'], {
        name: 'user_roles_role_id'
      })
      await queryInterface.addIndex('user_roles', ['is_active'], {
        name: 'user_roles_is_active'
      })

      // ==================== UserSession ====================
      console.log('📋 创建表: user_sessions')
      await queryInterface.createTable('user_sessions', {
        user_session_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键ID'
        },
        session_token: {
          type: Sequelize.STRING(255),
          allowNull: false,
          unique: true,
          comment: '会话令牌（JWT Token的jti）'
        },
        user_type: {
          type: Sequelize.ENUM('user', 'admin'),
          allowNull: false,
          comment: '用户类型'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        login_ip: {
          type: Sequelize.STRING(45),
          comment: '登录IP'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          comment: '是否活跃'
        },
        last_activity: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '最后活动时间'
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: '过期时间'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // UserSession - 索引
      await queryInterface.addIndex('user_sessions', ['session_token'], {
        name: 'user_sessions_session_token', unique: true
      })
      await queryInterface.addIndex('user_sessions', ['user_type', 'user_id', 'is_active'], {
        name: 'user_sessions_user_type_user_id_is_active'
      })
      await queryInterface.addIndex('user_sessions', ['expires_at', 'is_active'], {
        name: 'user_sessions_expires_at_is_active'
      })
      await queryInterface.addIndex('user_sessions', ['last_activity'], {
        name: 'user_sessions_last_activity'
      })

      // ==================== UserPointsAccount ====================
      console.log('📋 创建表: user_points_accounts')
      await queryInterface.createTable('user_points_accounts', {
        account_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '账户唯一标识'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          comment: '关联用户ID'
        },
        available_points: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
          comment: '可用积分余额'
        },
        total_earned: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
          comment: '累计获得积分'
        },
        total_consumed: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
          comment: '累计消耗积分'
        },
        last_earn_time: {
          type: Sequelize.DATE,
          comment: '最后获得积分时间'
        },
        last_consume_time: {
          type: Sequelize.DATE,
          comment: '最后消耗积分时间'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '账户是否激活'
        },
        freeze_reason: {
          type: Sequelize.STRING(255),
          comment: '冻结原因'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // UserPointsAccount - 索引
      await queryInterface.addIndex('user_points_accounts', ['user_id'], {
        name: 'unique_user_points_account', unique: true
      })
      await queryInterface.addIndex('user_points_accounts', ['available_points'], {
        name: 'idx_upa_available_points'
      })
      await queryInterface.addIndex('user_points_accounts', ['is_active'], {
        name: 'idx_upa_is_active'
      })

      // ==================== PointsTransaction ====================
      console.log('📋 创建表: points_transactions')
      await queryInterface.createTable('points_transactions', {
        transaction_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '交易唯一标识'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        account_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '积分账户ID'
        },
        transaction_type: {
          type: Sequelize.ENUM('earn', 'consume', 'expire', 'refund'),
          allowNull: false,
          comment: '交易类型'
        },
        points_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          comment: '积分数量(统一存储正数，类型由transaction_type区分)'
        },
        points_balance_before: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          comment: '交易前余额'
        },
        points_balance_after: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          comment: '交易后余额'
        },
        business_type: {
          type: Sequelize.ENUM('task_complete', 'lottery_consume', 'admin_adjust', 'refund', 'expire', 'behavior_reward', 'recommendation_bonus', 'activity_bonus'),
          allowNull: false,
          comment: '业务类型'
        },
        source_type: {
          type: Sequelize.ENUM('system', 'user', 'admin', 'api', 'batch'),
          defaultValue: 'system',
          comment: '积分来源类型'
        },
        business_id: {
          type: Sequelize.STRING(64),
          comment: '关联业务ID'
        },
        reference_data: {
          type: Sequelize.JSON,
          comment: '业务参考数据'
        },
        behavior_context: {
          type: Sequelize.JSON,
          comment: '行为上下文数据'
        },
        trigger_event: {
          type: Sequelize.STRING(100),
          comment: '触发事件类型'
        },
        recommendation_source: {
          type: Sequelize.STRING(100),
          comment: '推荐来源'
        },
        transaction_title: {
          type: Sequelize.STRING(255),
          allowNull: false,
          comment: '交易标题'
        },
        transaction_description: {
          type: Sequelize.TEXT,
          comment: '交易描述'
        },
        operator_id: {
          type: Sequelize.INTEGER,
          comment: '操作员ID'
        },
        transaction_time: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '交易时间(毫秒精度)'
        },
        effective_time: {
          type: Sequelize.DATE,
          comment: '生效时间'
        },
        expire_time: {
          type: Sequelize.DATE,
          comment: '过期时间'
        },
        status: {
          type: Sequelize.ENUM('pending', 'completed', 'failed', 'cancelled'),
          allowNull: false,
          defaultValue: 'completed',
          comment: '交易状态'
        },
        failure_reason: {
          type: Sequelize.TEXT,
          comment: '失败原因'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // PointsTransaction - 索引
      await queryInterface.addIndex('points_transactions', ['user_id', 'transaction_time'], {
        name: 'idx_pt_user_time'
      })
      await queryInterface.addIndex('points_transactions', ['transaction_type'], {
        name: 'idx_pt_transaction_type'
      })
      await queryInterface.addIndex('points_transactions', ['business_type'], {
        name: 'idx_pt_business_type'
      })
      await queryInterface.addIndex('points_transactions', ['status'], {
        name: 'idx_pt_status'
      })
      await queryInterface.addIndex('points_transactions', ['transaction_time'], {
        name: 'idx_pt_transaction_time'
      })
      await queryInterface.addIndex('points_transactions', ['account_id'], {
        name: 'idx_pt_account_id'
      })

      // ==================== LotteryCampaign ====================
      console.log('📋 创建表: lottery_campaigns')
      await queryInterface.createTable('lottery_campaigns', {
        campaign_id: {
          type: Sequelize.INTEGER,
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
          unique: true,
          comment: '活动代码(唯一)'
        },
        campaign_type: {
          type: Sequelize.ENUM('daily', 'weekly', 'event', 'permanent'),
          allowNull: false,
          comment: '活动类型'
        },
        cost_per_draw: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          comment: '每次抽奖消耗积分'
        },
        max_draws_per_user_daily: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
          comment: '每用户每日最大抽奖次数'
        },
        max_draws_per_user_total: {
          type: Sequelize.INTEGER,
          comment: '每用户总最大抽奖次数'
        },
        total_prize_pool: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0,
          comment: '总奖池价值'
        },
        remaining_prize_pool: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0,
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
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: '00:00:00',
          comment: '每日重置时间'
        },
        banner_image_url: {
          type: Sequelize.STRING(500),
          comment: '活动横幅图片'
        },
        description: {
          type: Sequelize.TEXT,
          comment: '活动描述'
        },
        rules_text: {
          type: Sequelize.TEXT,
          comment: '活动规则说明'
        },
        status: {
          type: Sequelize.ENUM('draft', 'active', 'paused', 'completed'),
          allowNull: false,
          defaultValue: 'draft',
          comment: '活动状态'
        },
        total_participants: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '总参与人数'
        },
        total_draws: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '总抽奖次数'
        },
        total_prizes_awarded: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '总中奖次数'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // LotteryCampaign - 索引
      await queryInterface.addIndex('lottery_campaigns', ['campaign_code'], {
        name: 'unique_campaign_code', unique: true
      })
      await queryInterface.addIndex('lottery_campaigns', ['status'], {
        name: 'idx_lc_status'
      })
      await queryInterface.addIndex('lottery_campaigns', ['campaign_type'], {
        name: 'idx_lc_campaign_type'
      })
      await queryInterface.addIndex('lottery_campaigns', ['start_time', 'end_time'], {
        name: 'idx_lc_time_range'
      })

      // ==================== LotteryPrize ====================
      console.log('📋 创建表: lottery_prizes')
      await queryInterface.createTable('lottery_prizes', {
        prize_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '奖品唯一标识'
        },
        campaign_id: {
          type: Sequelize.INTEGER,
          comment: '关联的抽奖活动ID'
        },
        prize_name: {
          type: Sequelize.STRING(255),
          allowNull: false,
          comment: '奖品名称'
        },
        prize_type: {
          type: Sequelize.ENUM('points', 'physical', 'virtual', 'coupon', 'service'),
          allowNull: false,
          defaultValue: 'points',
          comment: '奖品类型：积分/实物/虚拟/优惠券/服务'
        },
        prize_value: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
          comment: '奖品价值（积分数或金额）'
        },
        angle: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '转盘角度位置'
        },
        color: {
          type: Sequelize.STRING(7),
          allowNull: false,
          defaultValue: '#FF6B6B',
          comment: '奖品颜色代码'
        },
        probability: {
          type: Sequelize.DECIMAL(6, 4),
          allowNull: false,
          defaultValue: 0,
          comment: '中奖概率'
        },
        is_activity: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否为活动奖品'
        },
        cost_points: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 100,
          comment: '抽奖消耗积分'
        },
        prize_description: {
          type: Sequelize.TEXT,
          comment: '奖品描述信息'
        },
        image_id: {
          type: Sequelize.INTEGER,
          comment: '关联的奖品图片ID'
        },
        win_probability: {
          type: Sequelize.DECIMAL(8, 6),
          allowNull: false,
          defaultValue: 0.1,
          comment: '中奖概率（0-1之间）'
        },
        stock_quantity: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '库存数量（0表示无限）'
        },
        max_daily_wins: {
          type: Sequelize.INTEGER,
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
          comment: '显示排序'
        },
        status: {
          type: Sequelize.ENUM('active', 'inactive', 'out_of_stock', 'expired'),
          allowNull: false,
          defaultValue: 'active',
          comment: '奖品状态'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime()
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime()
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // LotteryPrize - 索引
      await queryInterface.addIndex('lottery_prizes', ['campaign_id', 'status'], {
        name: 'idx_lp_campaign_status'
      })
      await queryInterface.addIndex('lottery_prizes', ['prize_type', 'status'], {
        name: 'idx_lp_type_status'
      })
      await queryInterface.addIndex('lottery_prizes', ['win_probability'], {
        name: 'idx_lp_probability'
      })
      await queryInterface.addIndex('lottery_prizes', ['sort_order'], {
        name: 'idx_lp_sort'
      })

      // ==================== LotteryDraw ====================
      console.log('📋 创建表: lottery_draws')
      await queryInterface.createTable('lottery_draws', {
        draw_id: {
          type: Sequelize.STRING(50),
          primaryKey: true,
          comment: '抽奖记录唯一ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '参与抽奖的用户ID'
        },
        campaign_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 2,
          comment: '关联的抽奖活动ID'
        },
        lottery_id: {
          type: Sequelize.STRING(36),
          comment: '抽奖标识ID'
        },
        prize_id: {
          type: Sequelize.INTEGER,
          comment: '获得的奖品ID'
        },
        prize_name: {
          type: Sequelize.STRING(100),
          comment: '奖品名称'
        },
        prize_type: {
          type: Sequelize.ENUM('points', 'product', 'coupon', 'special'),
          comment: '奖品类型'
        },
        prize_value: {
          type: Sequelize.INTEGER,
          comment: '奖品价值'
        },
        prize_description: {
          type: Sequelize.TEXT,
          comment: '奖品详细描述'
        },
        prize_image: {
          type: Sequelize.STRING(500),
          comment: '奖品图片URL'
        },
        draw_type: {
          type: Sequelize.ENUM('single', 'triple', 'five', 'ten'),
          comment: '抽奖类型'
        },
        draw_sequence: {
          type: Sequelize.INTEGER,
          comment: '抽奖序号'
        },
        draw_count: {
          type: Sequelize.INTEGER,
          comment: '本次抽奖包含的次数'
        },
        batch_id: {
          type: Sequelize.STRING(50),
          comment: '批次ID'
        },
        is_winner: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否中奖（获得有价值奖品）'
        },
        guarantee_triggered: {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          comment: '是否触发保底'
        },
        remaining_guarantee: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '抽奖后剩余的保底次数'
        },
        cost_points: {
          type: Sequelize.INTEGER,
          comment: '消耗积分'
        },
        stop_angle: {
          type: Sequelize.DECIMAL(5, 2),
          comment: '转盘停止角度'
        },
        draw_config: {
          type: Sequelize.JSON,
          comment: '抽奖配置参数'
        },
        result_metadata: {
          type: Sequelize.JSON,
          comment: '抽奖结果元数据'
        },
        ip_address: {
          type: Sequelize.STRING(45),
          comment: '用户IP地址'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '抽奖时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '记录更新时间'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // LotteryDraw - 索引
      await queryInterface.addIndex('lottery_draws', ['user_id'], {
        name: 'idx_user_id'
      })
      await queryInterface.addIndex('lottery_draws', ['prize_id'], {
        name: 'idx_prize_id'
      })
      await queryInterface.addIndex('lottery_draws', ['prize_type'], {
        name: 'idx_prize_type'
      })
      await queryInterface.addIndex('lottery_draws', ['draw_type'], {
        name: 'idx_draw_type'
      })
      await queryInterface.addIndex('lottery_draws', ['batch_id'], {
        name: 'idx_batch_id'
      })
      await queryInterface.addIndex('lottery_draws', ['created_at'], {
        name: 'idx_created_at'
      })
      await queryInterface.addIndex('lottery_draws', ['user_id', 'created_at'], {
        name: 'idx_user_created'
      })
      await queryInterface.addIndex('lottery_draws', ['campaign_id', 'is_winner'], {
        name: 'idx_campaign_result'
      })
      await queryInterface.addIndex('lottery_draws', ['is_winner', 'created_at'], {
        name: 'idx_result_time'
      })

      // ==================== LotteryPreset ====================
      console.log('📋 创建表: lottery_presets')
      await queryInterface.createTable('lottery_presets', {
        preset_id: {
          type: Sequelize.STRING(50),
          primaryKey: true,
          defaultValue: () => `preset_${BeijingTimeHelper.generateIdTimestamp()}_${Math.random().toString(36).substr(2, 6)}`,
          comment: '预设记录唯一标识'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '预设奖品的目标用户ID'
        },
        prize_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '预设的奖品ID'
        },
        queue_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '抽奖顺序（1为第一次抽奖，2为第二次抽奖，以此类推）'
        },
        status: {
          type: Sequelize.ENUM('pending', 'used'),
          allowNull: false,
          defaultValue: 'pending',
          comment: '预设状态：pending-等待使用，used-已使用'
        },
        created_by: {
          type: Sequelize.INTEGER,
          comment: '创建预设的管理员ID'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '创建时间'
        }
      })

      // LotteryPreset - 索引
      await queryInterface.addIndex('lottery_presets', ['user_id', 'status'], {
        name: 'idx_user_status'
      })
      await queryInterface.addIndex('lottery_presets', ['queue_order'], {
        name: 'idx_queue_order'
      })
      await queryInterface.addIndex('lottery_presets', ['created_by'], {
        name: 'idx_created_by'
      })
      await queryInterface.addIndex('lottery_presets', ['created_at'], {
        name: 'idx_created_at'
      })

      // ==================== Product ====================
      console.log('📋 创建表: products')
      await queryInterface.createTable('products', {
        product_id: {
          type: Sequelize.INTEGER,
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
          comment: '商品描述'
        },
        image: {
          type: Sequelize.STRING(500),
          comment: '商品图片URL'
        },
        primary_image_id: {
          type: Sequelize.INTEGER,
          comment: '商品主图片ID（关联image_resources表，用于多图片管理中的主图指定）'
        },
        category: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: '优惠券',
          comment: '商品分类'
        },
        space: {
          type: Sequelize.ENUM('lucky', 'premium', 'both'),
          allowNull: false,
          defaultValue: 'lucky',
          comment: '所属空间：lucky-幸运空间，premium-臻选空间，both-两个空间都有'
        },
        exchange_points: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '兑换所需积分'
        },
        stock: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '库存数量'
        },
        original_price: {
          type: Sequelize.DECIMAL(10, 2),
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
        status: {
          type: Sequelize.ENUM('active', 'offline', 'deleted'),
          allowNull: false,
          defaultValue: 'active',
          comment: '商品状态'
        },
        is_hot: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否热门商品'
        },
        is_new: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否新品'
        },
        is_limited: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否限量商品'
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '排序权重'
        },
        sales_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '销量统计'
        },
        view_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '浏览次数'
        },
        rating: {
          type: Sequelize.DECIMAL(3, 2),
          comment: '评分'
        },
        warranty: {
          type: Sequelize.STRING(200),
          comment: '售后说明'
        },
        delivery_info: {
          type: Sequelize.STRING(200),
          comment: '配送信息'
        },
        expires_at: {
          type: Sequelize.DATE,
          comment: '过期时间（限时商品）'
        },
        created_by: {
          type: Sequelize.INTEGER,
          comment: '创建者用户ID'
        },
        updated_by: {
          type: Sequelize.INTEGER,
          comment: '最后更新者用户ID'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // Product - 索引
      await queryInterface.addIndex('products', ['space', 'status'], {
        name: 'idx_products_space_status'
      })
      await queryInterface.addIndex('products', ['category'], {
        name: 'idx_products_category'
      })
      await queryInterface.addIndex('products', ['stock'], {
        name: 'idx_products_stock'
      })
      await queryInterface.addIndex('products', ['sort_order'], {
        name: 'idx_products_sort_order'
      })

      // ==================== UserInventory ====================
      console.log('📋 创建表: user_inventory')
      await queryInterface.createTable('user_inventory', {
        inventory_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '物品名称'
        },
        description: {
          type: Sequelize.TEXT,
          comment: '物品描述'
        },
        type: {
          type: Sequelize.ENUM('voucher', 'product', 'service'),
          allowNull: false,
          comment: '物品类型：优惠券/实物商品/服务'
        },
        value: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '物品价值（积分等价值）'
        },
        status: {
          type: Sequelize.ENUM('available', 'pending', 'used', 'expired', 'transferred'),
          allowNull: false,
          defaultValue: 'available',
          comment: '物品状态'
        },
        source_type: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '获得来源：抽奖中奖/兑换获得/系统赠送等'
        },
        source_id: {
          type: Sequelize.STRING(32),
          comment: '来源记录ID'
        },
        acquired_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '获得时间'
        },
        expires_at: {
          type: Sequelize.DATE,
          comment: '过期时间（可选）'
        },
        used_at: {
          type: Sequelize.DATE,
          comment: '使用时间'
        },
        verification_code: {
          type: Sequelize.STRING(32),
          unique: true,
          comment: '核销码'
        },
        verification_expires_at: {
          type: Sequelize.DATE,
          comment: '核销码过期时间'
        },
        transfer_to_user_id: {
          type: Sequelize.INTEGER,
          comment: '转让给的用户ID'
        },
        transfer_at: {
          type: Sequelize.DATE,
          comment: '转让时间'
        },
        icon: {
          type: Sequelize.STRING(10),
          comment: '显示图标'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // UserInventory - 索引
      await queryInterface.addIndex('user_inventory', ['user_id', 'status'], {
        name: 'user_inventory_user_id_status'
      })
      await queryInterface.addIndex('user_inventory', ['type'], {
        name: 'user_inventory_type'
      })
      await queryInterface.addIndex('user_inventory', ['expires_at'], {
        name: 'user_inventory_expires_at'
      })
      await queryInterface.addIndex('user_inventory', ['verification_code'], {
        name: 'user_inventory_verification_code', unique: true
      })
      await queryInterface.addIndex('user_inventory', ['source_type', 'source_id'], {
        name: 'user_inventory_source_type_source_id'
      })

      // ==================== TradeRecord ====================
      console.log('📋 创建表: trade_records')
      await queryInterface.createTable('trade_records', {
        trade_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键ID'
        },
        trade_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '交易记录业务ID（如tr_1722249322）'
        },
        trade_type: {
          type: Sequelize.ENUM('point_transfer', 'exchange_refund', 'prize_claim', 'admin_adjustment', 'system_reward'),
          allowNull: false,
          comment: '交易类型'
        },
        from_user_id: {
          type: Sequelize.INTEGER,
          comment: '发送方用户ID（系统操作时为null）'
        },
        to_user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '接收方用户ID'
        },
        operator_id: {
          type: Sequelize.INTEGER,
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
          type: Sequelize.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'),
          allowNull: false,
          defaultValue: 'pending',
          comment: '交易状态'
        },
        related_id: {
          type: Sequelize.STRING(50),
          comment: '关联记录ID（如兑换记录ID、抽奖记录ID）'
        },
        related_type: {
          type: Sequelize.ENUM('exchange', 'lottery', 'review', 'refund', 'system'),
          comment: '关联记录类型'
        },
        trade_reason: {
          type: Sequelize.STRING(200),
          allowNull: false,
          comment: '交易原因或描述'
        },
        remarks: {
          type: Sequelize.TEXT,
          comment: '交易备注'
        },
        trade_password_hash: {
          type: Sequelize.STRING(128),
          comment: '交易密码哈希（用户设置时）'
        },
        security_code: {
          type: Sequelize.STRING(10),
          comment: '安全验证码'
        },
        client_ip: {
          type: Sequelize.STRING(45),
          comment: '客户端IP地址'
        },
        device_info: {
          type: Sequelize.JSON,
          comment: '设备信息JSON'
        },
        trade_time: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '交易发起时间'
        },
        processed_time: {
          type: Sequelize.DATE,
          comment: '交易处理完成时间'
        },
        expires_at: {
          type: Sequelize.DATE,
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
        }
      })

      // TradeRecord - 索引
      await queryInterface.addIndex('trade_records', ['trade_id'], {
        name: 'trade_records_trade_id', unique: true
      })
      await queryInterface.addIndex('trade_records', ['from_user_id', 'created_at'], {
        name: 'trade_records_from_user_id_created_at'
      })
      await queryInterface.addIndex('trade_records', ['to_user_id', 'created_at'], {
        name: 'trade_records_to_user_id_created_at'
      })
      await queryInterface.addIndex('trade_records', ['trade_type', 'status'], {
        name: 'trade_records_trade_type_status'
      })
      await queryInterface.addIndex('trade_records', ['related_id', 'related_type'], {
        name: 'trade_records_related_id_related_type'
      })
      await queryInterface.addIndex('trade_records', ['trade_time'], {
        name: 'trade_records_trade_time'
      })

      // ==================== CustomerSession ====================
      console.log('📋 创建表: customer_sessions')
      await queryInterface.createTable('customer_sessions', {
        session_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        admin_id: {
          type: Sequelize.INTEGER,
          comment: '分配的管理员ID（基于UUID角色系统验证管理员权限）'
        },
        status: {
          type: Sequelize.ENUM('waiting', 'assigned', 'active', 'closed'),
          defaultValue: 'waiting',
          comment: '会话状态'
        },
        source: {
          type: Sequelize.STRING(32),
          defaultValue: 'mobile',
          comment: '来源渠道'
        },
        priority: {
          type: Sequelize.INTEGER,
          defaultValue: 1,
          comment: '优先级(1-5)'
        },
        last_message_at: {
          type: Sequelize.DATE,
          comment: '最后消息时间'
        },
        closed_at: {
          type: Sequelize.DATE,
          comment: '关闭时间'
        },
        satisfaction_score: {
          type: Sequelize.INTEGER,
          comment: '满意度评分(1-5)'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // CustomerSession - 索引
      await queryInterface.addIndex('customer_sessions', ['session_id'], {
        name: 'customer_sessions_session_id', unique: true
      })
      await queryInterface.addIndex('customer_sessions', ['user_id'], {
        name: 'customer_sessions_user_id'
      })
      await queryInterface.addIndex('customer_sessions', ['admin_id'], {
        name: 'customer_sessions_admin_id'
      })
      await queryInterface.addIndex('customer_sessions', ['status'], {
        name: 'customer_sessions_status'
      })
      await queryInterface.addIndex('customer_sessions', ['created_at'], {
        name: 'customer_sessions_created_at'
      })

      // ==================== ChatMessage ====================
      console.log('📋 创建表: chat_messages')
      await queryInterface.createTable('chat_messages', {
        message_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键ID'
        },
        session_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '会话ID(外键关联customer_sessions)'
        },
        sender_id: {
          type: Sequelize.INTEGER,
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
          defaultValue: 'text',
          comment: '消息类型'
        },
        status: {
          type: Sequelize.ENUM('sending', 'sent', 'delivered', 'read'),
          defaultValue: 'sent',
          comment: '消息状态'
        },
        reply_to_id: {
          type: Sequelize.INTEGER,
          comment: '回复的消息ID'
        },
        temp_message_id: {
          type: Sequelize.STRING(64),
          comment: '临时消息ID(前端生成)'
        },
        metadata: {
          type: Sequelize.JSON,
          comment: '扩展数据(图片信息等)'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // ChatMessage - 索引
      await queryInterface.addIndex('chat_messages', ['message_id'], {
        name: 'chat_messages_message_id', unique: true
      })
      await queryInterface.addIndex('chat_messages', ['session_id'], {
        name: 'chat_messages_session_id'
      })
      await queryInterface.addIndex('chat_messages', ['sender_id'], {
        name: 'chat_messages_sender_id'
      })
      await queryInterface.addIndex('chat_messages', ['created_at'], {
        name: 'chat_messages_created_at'
      })
      await queryInterface.addIndex('chat_messages', ['temp_message_id'], {
        name: 'chat_messages_temp_message_id'
      })
      await queryInterface.addIndex('chat_messages', ['message_source', 'sender_type'], {
        name: 'chat_messages_message_source_sender_type'
      })

      // ==================== SystemAnnouncement ====================
      console.log('📋 创建表: system_announcements')
      await queryInterface.createTable('system_announcements', {
        announcement_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键ID'
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
          comment: '目标用户组（管理员可见）'
        },
        internal_notes: {
          type: Sequelize.TEXT,
          comment: '内部备注（管理员可见）'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否激活'
        },
        expires_at: {
          type: Sequelize.DATE,
          comment: '过期时间'
        },
        admin_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '创建管理员ID（基于UUID角色系统验证管理员权限）'
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
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '更新时间'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // SystemAnnouncement - 索引
      await queryInterface.addIndex('system_announcements', ['type', 'is_active'], {
        name: 'idx_announcements_type_active'
      })
      await queryInterface.addIndex('system_announcements', ['priority', 'expires_at'], {
        name: 'idx_announcements_priority_expires'
      })
      await queryInterface.addIndex('system_announcements', ['created_at'], {
        name: 'idx_announcements_created_at'
      })

      // ==================== Feedback ====================
      console.log('📋 创建表: feedbacks')
      await queryInterface.createTable('feedbacks', {
        feedback_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
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
          comment: '用户IP（管理员可见）'
        },
        device_info: {
          type: Sequelize.JSON,
          comment: '设备信息（管理员可见）'
        },
        internal_notes: {
          type: Sequelize.TEXT,
          comment: '内部备注（管理员可见）'
        },
        admin_id: {
          type: Sequelize.INTEGER,
          comment: '处理管理员ID（基于UUID角色系统验证管理员权限）'
        },
        reply_content: {
          type: Sequelize.TEXT,
          comment: '回复内容'
        },
        replied_at: {
          type: Sequelize.DATE,
          comment: '回复时间'
        },
        estimated_response_time: {
          type: Sequelize.STRING(50),
          comment: '预计响应时间'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '更新时间'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // Feedback - 索引
      await queryInterface.addIndex('feedbacks', ['user_id', 'status'], {
        name: 'idx_feedbacks_user_status'
      })
      await queryInterface.addIndex('feedbacks', ['category', 'priority'], {
        name: 'idx_feedbacks_category_priority'
      })
      await queryInterface.addIndex('feedbacks', ['status', 'created_at'], {
        name: 'idx_feedbacks_status_created'
      })
      await queryInterface.addIndex('feedbacks', ['admin_id'], {
        name: 'idx_feedbacks_admin_id'
      })

      // ==================== ImageResources ====================
      console.log('📋 创建表: image_resources')
      await queryInterface.createTable('image_resources', {
        image_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键ID'
        },
        business_type: {
          type: Sequelize.ENUM('lottery', 'exchange', 'trade', 'uploads', 'user_upload_review'),
          allowNull: false,
          comment: '业务类型：抽奖/兑换/交易/上传/用户上传审核'
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
          comment: '关联用户ID（上传用户）'
        },
        file_path: {
          type: Sequelize.STRING(500),
          allowNull: false,
          comment: '文件存储路径'
        },
        thumbnail_paths: {
          type: Sequelize.JSON,
          defaultValue: Sequelize.NOW,
          comment: '缩略图路径集合：{small: "path", medium: "path", large: "path"}'
        },
        original_filename: {
          type: Sequelize.STRING(255),
          allowNull: false,
          comment: '原始文件名'
        },
        upload_id: {
          type: Sequelize.STRING(50),
          comment: '上传批次ID（用于追踪和管理上传任务、支持垃圾清理）'
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
          comment: '审核状态'
        },
        reviewer_id: {
          type: Sequelize.INTEGER,
          comment: '审核员ID'
        },
        review_reason: {
          type: Sequelize.TEXT,
          comment: '审核说明'
        },
        reviewed_at: {
          type: Sequelize.DATE,
          comment: '审核时间'
        },
        points_awarded: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '奖励积分数量'
        },
        is_upload_review: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否为上传审核资源'
        },
        source_module: {
          type: Sequelize.ENUM('system', 'lottery', 'exchange', 'user_upload', 'admin'),
          allowNull: false,
          defaultValue: 'system',
          comment: '来源模块'
        },
        ip_address: {
          type: Sequelize.STRING(45),
          comment: 'IP地址'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '创建时间'
        }
      })

      // ImageResources - 索引
      await queryInterface.addIndex('image_resources', ['business_type', 'user_id', 'created_at'], {
        name: 'idx_business_type_user'
      })
      await queryInterface.addIndex('image_resources', ['review_status', 'business_type', 'created_at'], {
        name: 'idx_review_status_business'
      })
      await queryInterface.addIndex('image_resources', ['business_type', 'category'], {
        name: 'idx_business_category'
      })
      await queryInterface.addIndex('image_resources', ['user_id', 'business_type', 'status'], {
        name: 'idx_user_business'
      })
      await queryInterface.addIndex('image_resources', ['context_id', 'category', 'status'], {
        name: 'idx_context_category'
      })
      await queryInterface.addIndex('image_resources', ['created_at', 'status'], {
        name: 'idx_created_status'
      })

      // ==================== ExchangeRecords ====================
      console.log('📋 创建表: exchange_records')
      await queryInterface.createTable('exchange_records', {
        exchange_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        product_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '商品ID'
        },
        product_snapshot: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '商品信息快照JSON'
        },
        quantity: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
          comment: '兑换数量'
        },
        total_points: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '总消耗积分'
        },
        exchange_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '兑换码（用户凭证）'
        },
        status: {
          type: Sequelize.ENUM('pending', 'distributed', 'used', 'expired', 'cancelled'),
          allowNull: false,
          defaultValue: 'distributed',
          comment: '兑换状态：pending-待处理，distributed-已分发，used-已使用，expired-已过期，cancelled-已取消'
        },
        space: {
          type: Sequelize.ENUM('lucky', 'premium'),
          allowNull: false,
          comment: '兑换空间'
        },
        exchange_time: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '兑换时间'
        },
        expires_at: {
          type: Sequelize.DATE,
          comment: '兑换码过期时间'
        },
        used_at: {
          type: Sequelize.DATE,
          comment: '使用时间'
        },
        client_info: {
          type: Sequelize.STRING(200),
          comment: '客户端信息'
        },
        usage_info: {
          type: Sequelize.JSON,
          comment: '使用说明JSON'
        },
        notes: {
          type: Sequelize.TEXT,
          comment: '备注信息'
        },
        requires_audit: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否需要审核（大额交易自动标记）'
        },
        audit_status: {
          type: Sequelize.ENUM('not_required', 'pending', 'approved', 'rejected'),
          allowNull: false,
          defaultValue: 'not_required',
          comment: '审核状态：not_required-无需审核，pending-待审核，approved-审核通过，rejected-审核拒绝'
        },
        auditor_id: {
          type: Sequelize.INTEGER,
          comment: '审核员ID'
        },
        audit_reason: {
          type: Sequelize.TEXT,
          comment: '审核意见/拒绝原因'
        },
        audited_at: {
          type: Sequelize.DATE,
          comment: '审核时间'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime()
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime()
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      })

      // ExchangeRecords - 索引
      await queryInterface.addIndex('exchange_records', ['user_id'], {
        name: 'idx_exchange_records_user_id'
      })
      await queryInterface.addIndex('exchange_records', ['product_id'], {
        name: 'idx_exchange_records_product_id'
      })
      await queryInterface.addIndex('exchange_records', ['exchange_code'], {
        name: 'idx_exchange_records_exchange_code', unique: true
      })
      await queryInterface.addIndex('exchange_records', ['status'], {
        name: 'idx_exchange_records_status'
      })
      await queryInterface.addIndex('exchange_records', ['space'], {
        name: 'idx_exchange_records_space'
      })
      await queryInterface.addIndex('exchange_records', ['exchange_time'], {
        name: 'idx_exchange_records_exchange_time'
      })

      // ==================== AuditRecord ====================
      console.log('📋 创建表: audit_records')
      await queryInterface.createTable('audit_records', {
        audit_id: {
          type: Sequelize.INTEGER,
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
          type: Sequelize.INTEGER,
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
          comment: '审核员ID'
        },
        audit_reason: {
          type: Sequelize.TEXT,
          comment: '审核意见/拒绝原因'
        },
        audit_data: {
          type: Sequelize.JSON,
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
          comment: '审核完成时间'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '更新时间'
        }
      })

      // AuditRecord - 索引
      await queryInterface.addIndex('audit_records', ['auditable_type', 'auditable_id'], {
        name: 'idx_audit_records_auditable'
      })
      await queryInterface.addIndex('audit_records', ['audit_status'], {
        name: 'idx_audit_records_status'
      })
      await queryInterface.addIndex('audit_records', ['auditor_id'], {
        name: 'idx_audit_records_auditor'
      })
      await queryInterface.addIndex('audit_records', ['priority', 'submitted_at'], {
        name: 'idx_audit_records_priority_time'
      })
      await queryInterface.addIndex('audit_records', ['created_at'], {
        name: 'idx_audit_records_created'
      })

      // ==================== AuditLog ====================
      console.log('📋 创建表: audit_logs')
      await queryInterface.createTable('audit_logs', {
        log_id: {
          type: Sequelize.INTEGER,
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
          type: Sequelize.ENUM('points_adjust', 'exchange_audit', 'product_update', 'product_create', 'product_delete', 'user_status_change', 'prize_config', 'prize_create', 'prize_delete', 'campaign_config', 'role_assign', 'system_config'),
          allowNull: false,
          comment: '操作类型'
        },
        target_type: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '目标对象类型（User/Product/Prize/ExchangeRecords等）'
        },
        target_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '目标对象ID'
        },
        action: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '操作动作（create/update/delete/approve/reject/freeze/unfreeze）'
        },
        before_data: {
          type: Sequelize.JSON,
          comment: '操作前数据（JSON格式，完整记录变更前的状态）'
        },
        after_data: {
          type: Sequelize.JSON,
          comment: '操作后数据（JSON格式，完整记录变更后的状态）'
        },
        changed_fields: {
          type: Sequelize.JSON,
          comment: '变更字段列表（仅包含实际变更的字段，格式: [{field: "field_name", old_value: ..., new_value: ...}]）'
        },
        reason: {
          type: Sequelize.TEXT,
          comment: '操作原因/备注'
        },
        ip_address: {
          type: Sequelize.STRING(45),
          comment: 'IP地址（支持IPv4和IPv6）'
        },
        user_agent: {
          type: Sequelize.STRING(500),
          comment: '用户代理字符串（浏览器信息）'
        },
        business_id: {
          type: Sequelize.STRING(100),
          comment: '业务关联ID（如兑换单号、交易单号等）'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
          comment: '操作时间'
        }
      })

      // AuditLog - 索引
      await queryInterface.addIndex('audit_logs', ['operator_id'], {
        name: 'idx_audit_logs_operator'
      })
      await queryInterface.addIndex('audit_logs', ['operation_type'], {
        name: 'idx_audit_logs_operation_type'
      })
      await queryInterface.addIndex('audit_logs', ['target_type', 'target_id'], {
        name: 'idx_audit_logs_target'
      })
      await queryInterface.addIndex('audit_logs', ['created_at'], {
        name: 'idx_audit_logs_created'
      })
      await queryInterface.addIndex('audit_logs', ['business_id'], {
        name: 'idx_audit_logs_business_id'
      })
      await queryInterface.addIndex('audit_logs', ['ip_address'], {
        name: 'idx_audit_logs_ip'
      })

      // ==================== 初始数据 ====================
      console.log('📊 插入初始角色数据...')

      const { v4: uuidv4 } = require('uuid')

      await queryInterface.bulkInsert('roles', [
        {
          role_uuid: uuidv4(),
          role_name: '超级管理员',
          role_level: 100,
          permissions: JSON.stringify({ all: true }),
          description: '系统最高权限',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          role_uuid: uuidv4(),
          role_name: '管理员',
          role_level: 50,
          permissions: JSON.stringify({ manage_users: true }),
          description: '普通管理员',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          role_uuid: uuidv4(),
          role_name: '普通用户',
          role_level: 0,
          permissions: JSON.stringify({ lottery: true }),
          description: '普通用户',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ])

      console.log('✅ 初始数据插入完成')

      // 验证表数量
      const tables = await queryInterface.showAllTables()
      console.log(`✅ 创建了 ${tables.length} 个表`)

      console.log('='.repeat(60))
      console.log('🎉 基准迁移执行成功！')
      console.log('='.repeat(60))
    } catch (error) {
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚基准迁移...')

    // 按照外键依赖顺序删除表（逆序）
    const tablesToDrop = [
      'audit_logs',
      'audit_records',
      'exchange_records',
      'image_resources',
      'feedbacks',
      'system_announcements',
      'chat_messages',
      'customer_sessions',
      'trade_records',
      'user_inventory',
      'products',
      'lottery_presets',
      'lottery_draws',
      'lottery_prizes',
      'lottery_campaigns',
      'points_transactions',
      'user_points_accounts',
      'user_sessions',
      'user_roles',
      'roles',
      'users'
    ]

    for (const table of tablesToDrop) {
      await queryInterface.dropTable(table)
      console.log(`✅ 删除表: ${table}`)
    }

    console.log('✅ 回滚完成')
  }
}
