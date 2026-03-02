'use strict'

/**
 * Phase 3：广告基础版（广告主自助 + 固定包天 + 审核）
 *
 * 新建 4 张表：
 * 1. ad_slots — 广告位配置（popup / carousel 两种类型）
 * 2. ad_campaigns — 广告投放计划
 * 3. ad_creatives — 广告素材（图片 + 审核）
 * 4. ad_billing_records — 广告计费流水
 *
 * 新增 15 条字典数据（4 组 dict_type）
 * displayNameHelper 注册 4 个新常量
 *
 * @see docs/广告系统升级方案.md 第十四节 14.3
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ============================================================
       * 1. ad_slots — 广告位配置表
       * ============================================================ */
      await queryInterface.createTable(
        'ad_slots',
        {
          ad_slot_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '广告位主键'
          },
          slot_key: {
            type: Sequelize.STRING(50),
            allowNull: false,
            unique: true,
            comment: '广告位标识（如 home_popup），全局唯一'
          },
          slot_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '广告位名称（如「首页弹窗位」）'
          },
          slot_type: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '广告位类型：popup / carousel'
          },
          position: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '页面位置：home / lottery / profile'
          },
          max_display_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 3,
            comment: '该位每次最多展示广告数'
          },
          daily_price_diamond: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '固定包天日价（钻石）'
          },
          min_bid_diamond: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 50,
            comment: '竞价最低日出价（拍板决策4：高门槛50钻石）'
          },
          min_budget_diamond: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 500,
            comment: '竞价最低总预算（拍板决策4：500钻石）'
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否开放投放'
          },
          description: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '广告位描述'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW')
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW')
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '广告位配置表 — Phase 3 广告主自助投放',
          transaction
        }
      )

      /* ============================================================
       * 2. ad_campaigns — 广告投放计划表
       * ============================================================ */
      await queryInterface.createTable(
        'ad_campaigns',
        {
          ad_campaign_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '广告计划主键'
          },
          business_id: {
            type: Sequelize.STRING(100),
            allowNull: false,
            unique: true,
            comment: '幂等键（复用 IdempotencyService）'
          },
          advertiser_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '广告主用户 ID'
          },
          ad_slot_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_slots', key: 'ad_slot_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '投放广告位 ID'
          },
          campaign_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '广告计划名称'
          },
          billing_mode: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '计费模式：fixed_daily（固定包天）/ bidding（竞价排名）'
          },
          status: {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'draft',
            comment: '状态：draft / pending_review / approved / active / paused / completed / rejected / cancelled'
          },
          daily_bid_diamond: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '竞价日出价（仅 bidding 模式）'
          },
          budget_total_diamond: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '总预算钻石（仅 bidding 模式）'
          },
          budget_spent_diamond: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '已消耗钻石'
          },
          fixed_days: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '固定包天天数（仅 fixed_daily 模式）'
          },
          fixed_total_diamond: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '固定包天总价 = daily_price × days'
          },
          targeting_rules: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '定向规则 JSON（Phase 5 启用）：{ match_all: [...], match_any: [...] }'
          },
          priority: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 50,
            comment: '展示优先级（广告范围 1~99，拍板决策6）'
          },
          start_date: {
            type: Sequelize.DATEONLY,
            allowNull: true,
            comment: '投放开始日期'
          },
          end_date: {
            type: Sequelize.DATEONLY,
            allowNull: true,
            comment: '投放结束日期'
          },
          review_note: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '审核备注'
          },
          reviewed_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: '审核管理员 ID'
          },
          reviewed_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '审核时间'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW')
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW')
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '广告投放计划表 — Phase 3 广告主自助投放',
          transaction
        }
      )

      await queryInterface.addIndex('ad_campaigns', ['advertiser_user_id'], {
        name: 'idx_ac_advertiser',
        transaction
      })
      await queryInterface.addIndex('ad_campaigns', ['ad_slot_id'], {
        name: 'idx_ac_slot',
        transaction
      })
      await queryInterface.addIndex('ad_campaigns', ['status'], {
        name: 'idx_ac_status',
        transaction
      })
      await queryInterface.addIndex('ad_campaigns', ['billing_mode', 'status'], {
        name: 'idx_ac_billing_status',
        transaction
      })

      /* ============================================================
       * 3. ad_creatives — 广告素材表
       * ============================================================ */
      await queryInterface.createTable(
        'ad_creatives',
        {
          ad_creative_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '广告素材主键'
          },
          ad_campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_campaigns', key: 'ad_campaign_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '所属广告计划 ID'
          },
          title: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '素材标题'
          },
          image_url: {
            type: Sequelize.STRING(500),
            allowNull: false,
            comment: '图片对象 key（Sealos 对象存储）'
          },
          image_width: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            comment: '原图宽度 px'
          },
          image_height: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            comment: '原图高度 px'
          },
          link_url: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '跳转链接'
          },
          link_type: {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'none',
            comment: '跳转类型：none / page / miniprogram / webview'
          },
          review_status: {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'pending',
            comment: '审核状态：pending / approved / rejected'
          },
          review_note: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '审核备注'
          },
          reviewed_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: '审核管理员 ID'
          },
          reviewed_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '审核时间'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW')
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW')
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '广告素材表 — Phase 3 素材审核',
          transaction
        }
      )

      await queryInterface.addIndex('ad_creatives', ['ad_campaign_id'], {
        name: 'idx_acr_campaign',
        transaction
      })
      await queryInterface.addIndex('ad_creatives', ['review_status'], {
        name: 'idx_acr_review',
        transaction
      })

      /* ============================================================
       * 4. ad_billing_records — 广告计费流水表
       * ============================================================ */
      await queryInterface.createTable(
        'ad_billing_records',
        {
          ad_billing_record_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '计费流水主键（BIGINT 预留大数据量）'
          },
          business_id: {
            type: Sequelize.STRING(100),
            allowNull: false,
            unique: true,
            comment: '幂等键（防重复扣费）'
          },
          ad_campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_campaigns', key: 'ad_campaign_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '关联广告计划 ID'
          },
          advertiser_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '广告主用户 ID'
          },
          billing_date: {
            type: Sequelize.DATEONLY,
            allowNull: false,
            comment: '计费日期'
          },
          amount_diamond: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '钻石金额'
          },
          billing_type: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '计费类型：freeze / deduct / refund / daily_deduct'
          },
          asset_transaction_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '关联 asset_transactions 流水 ID'
          },
          remark: {
            type: Sequelize.STRING(200),
            allowNull: true,
            comment: '备注'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW')
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '广告计费流水表 — Phase 3 钻石冻结/扣款/退款',
          transaction
        }
      )

      await queryInterface.addIndex('ad_billing_records', ['ad_campaign_id'], {
        name: 'idx_abr_campaign',
        transaction
      })
      await queryInterface.addIndex('ad_billing_records', ['billing_date'], {
        name: 'idx_abr_date',
        transaction
      })
      await queryInterface.addIndex('ad_billing_records', ['billing_type'], {
        name: 'idx_abr_type',
        transaction
      })

      /* ============================================================
       * 5. 初始广告位数据（4 条，拍板决策2/3）
       * ============================================================ */
      await queryInterface.bulkInsert(
        'ad_slots',
        [
          {
            slot_key: 'home_popup',
            slot_name: '首页弹窗位',
            slot_type: 'popup',
            position: 'home',
            max_display_count: 3,
            daily_price_diamond: 100,
            min_bid_diamond: 50,
            min_budget_diamond: 500,
            is_active: true,
            description: '小程序首页弹窗广告位，最多3个广告轮流展示',
            created_at: Sequelize.fn('NOW'),
            updated_at: Sequelize.fn('NOW')
          },
          {
            slot_key: 'home_carousel',
            slot_name: '首页轮播位',
            slot_type: 'carousel',
            position: 'home',
            max_display_count: 5,
            daily_price_diamond: 60,
            min_bid_diamond: 50,
            min_budget_diamond: 500,
            is_active: true,
            description: '小程序首页轮播图广告位，混排在运营轮播图之后',
            created_at: Sequelize.fn('NOW'),
            updated_at: Sequelize.fn('NOW')
          },
          {
            slot_key: 'lottery_popup',
            slot_name: '抽奖页弹窗位',
            slot_type: 'popup',
            position: 'lottery',
            max_display_count: 2,
            daily_price_diamond: 80,
            min_bid_diamond: 50,
            min_budget_diamond: 500,
            is_active: true,
            description: '抽奖页面弹窗广告位',
            created_at: Sequelize.fn('NOW'),
            updated_at: Sequelize.fn('NOW')
          },
          {
            slot_key: 'profile_popup',
            slot_name: '个人中心弹窗位',
            slot_type: 'popup',
            position: 'profile',
            max_display_count: 1,
            daily_price_diamond: 50,
            min_bid_diamond: 50,
            min_budget_diamond: 500,
            is_active: true,
            description: '个人中心页面弹窗广告位',
            created_at: Sequelize.fn('NOW'),
            updated_at: Sequelize.fn('NOW')
          }
        ],
        { transaction }
      )

      /* ============================================================
       * 6. 字典数据（15 条新增，4 组 dict_type）
       * ============================================================ */
      const now = Sequelize.fn('NOW')
      await queryInterface.bulkInsert(
        'system_dictionaries',
        [
          // ad_campaign_status（8 条）
          { dict_type: 'ad_campaign_status', dict_code: 'draft', dict_name: '草稿', dict_color: 'bg-gray-500', sort_order: 1, is_enabled: true, created_at: now, updated_at: now },
          { dict_type: 'ad_campaign_status', dict_code: 'pending_review', dict_name: '待审核', dict_color: 'bg-yellow-500', sort_order: 2, is_enabled: true, created_at: now, updated_at: now },
          { dict_type: 'ad_campaign_status', dict_code: 'approved', dict_name: '审核通过', dict_color: 'bg-green-500', sort_order: 3, is_enabled: true, created_at: now, updated_at: now },
          { dict_type: 'ad_campaign_status', dict_code: 'active', dict_name: '投放中', dict_color: 'bg-blue-500', sort_order: 4, is_enabled: true, created_at: now, updated_at: now },
          { dict_type: 'ad_campaign_status', dict_code: 'paused', dict_name: '已暂停', dict_color: 'bg-orange-500', sort_order: 5, is_enabled: true, created_at: now, updated_at: now },
          { dict_type: 'ad_campaign_status', dict_code: 'completed', dict_name: '已完成', dict_color: 'bg-teal-500', sort_order: 6, is_enabled: true, created_at: now, updated_at: now },
          { dict_type: 'ad_campaign_status', dict_code: 'rejected', dict_name: '已拒绝', dict_color: 'bg-red-500', sort_order: 7, is_enabled: true, created_at: now, updated_at: now },
          { dict_type: 'ad_campaign_status', dict_code: 'cancelled', dict_name: '已取消', dict_color: 'bg-gray-400', sort_order: 8, is_enabled: true, created_at: now, updated_at: now },

          // ad_billing_mode（2 条）
          { dict_type: 'ad_billing_mode', dict_code: 'fixed_daily', dict_name: '固定包天', dict_color: 'bg-blue-500', sort_order: 1, is_enabled: true, created_at: now, updated_at: now },
          { dict_type: 'ad_billing_mode', dict_code: 'bidding', dict_name: '竞价排名', dict_color: 'bg-purple-500', sort_order: 2, is_enabled: true, created_at: now, updated_at: now },

          // ad_review_status（3 条）
          { dict_type: 'ad_review_status', dict_code: 'pending', dict_name: '待审核', dict_color: 'bg-yellow-500', sort_order: 1, is_enabled: true, created_at: now, updated_at: now },
          { dict_type: 'ad_review_status', dict_code: 'approved', dict_name: '已通过', dict_color: 'bg-green-500', sort_order: 2, is_enabled: true, created_at: now, updated_at: now },
          { dict_type: 'ad_review_status', dict_code: 'rejected', dict_name: '已拒绝', dict_color: 'bg-red-500', sort_order: 3, is_enabled: true, created_at: now, updated_at: now },

          // ad_slot_type（2 条）
          { dict_type: 'ad_slot_type', dict_code: 'popup', dict_name: '弹窗广告位', dict_color: 'bg-indigo-500', sort_order: 1, is_enabled: true, created_at: now, updated_at: now },
          { dict_type: 'ad_slot_type', dict_code: 'carousel', dict_name: '轮播图广告位', dict_color: 'bg-cyan-500', sort_order: 2, is_enabled: true, created_at: now, updated_at: now }
        ],
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('system_dictionaries', {
      dict_type: ['ad_campaign_status', 'ad_billing_mode', 'ad_review_status', 'ad_slot_type']
    })
    await queryInterface.dropTable('ad_billing_records')
    await queryInterface.dropTable('ad_creatives')
    await queryInterface.dropTable('ad_campaigns')
    await queryInterface.dropTable('ad_slots')
  }
}
