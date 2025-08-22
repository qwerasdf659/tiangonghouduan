/**
 * 🔥 社交抽奖和任务系统数据库迁移 v3.0
 * 创建时间：2025年08月22日 11:38 UTC
 * 功能：社交抽奖 + 任务系统 + VIP增强 + 多池系统扩展
 * 架构：基于现有V3架构，新增核心功能表
 */

'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 开始创建社交抽奖和任务系统表...')

      // 1. 社交抽奖系统核心表
      console.log('📊 创建社交抽奖核心表...')

      // 社交抽奖活动表
      await queryInterface.createTable('social_lottery_campaigns', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '社交抽奖活动ID'
        },
        campaign_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '活动唯一标识符'
        },
        title: {
          type: Sequelize.STRING(200),
          allowNull: false,
          comment: '活动标题'
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '活动描述'
        },
        social_type: {
          type: Sequelize.ENUM('group', 'team', 'invite', 'share', 'collaborate'),
          allowNull: false,
          comment: '社交类型：组队/团队/邀请/分享/协作'
        },
        min_participants: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 2,
          comment: '最少参与人数'
        },
        max_participants: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 10,
          comment: '最多参与人数'
        },
        entry_cost: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '参与消耗积分'
        },
        reward_pool: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '奖励池总积分'
        },
        sharing_bonus: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '分享奖励积分'
        },
        invitation_bonus: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '邀请奖励积分'
        },
        team_bonus_multiplier: {
          type: Sequelize.DECIMAL(3, 2),
          allowNull: false,
          defaultValue: 1.0,
          comment: '团队奖励倍数'
        },
        status: {
          type: Sequelize.ENUM('draft', 'active', 'paused', 'completed', 'cancelled'),
          allowNull: false,
          defaultValue: 'draft',
          comment: '活动状态'
        },
        start_time: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: '开始时间'
        },
        end_time: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: '结束时间'
        },
        config: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '活动配置参数'
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
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '社交抽奖活动表'
      })

      // 社交抽奖组队表
      await queryInterface.createTable('social_lottery_teams', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '组队ID'
        },
        team_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '队伍唯一标识符'
        },
        campaign_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '所属活动ID'
        },
        leader_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '队长用户ID'
        },
        team_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '队伍名称'
        },
        current_members: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
          comment: '当前成员数'
        },
        max_members: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 5,
          comment: '最大成员数'
        },
        is_public: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否公开队伍'
        },
        invite_code: {
          type: Sequelize.STRING(20),
          allowNull: true,
          unique: true,
          comment: '邀请码'
        },
        team_status: {
          type: Sequelize.ENUM('forming', 'ready', 'playing', 'completed', 'disbanded'),
          allowNull: false,
          defaultValue: 'forming',
          comment: '队伍状态'
        },
        total_points_invested: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '团队总投入积分'
        },
        total_rewards_earned: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '团队总获得奖励'
        },
        config: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '队伍配置参数'
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
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '社交抽奖组队表'
      })

      // 社交抽奖队员表
      await queryInterface.createTable('social_lottery_members', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '成员记录ID'
        },
        team_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '队伍ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        role: {
          type: Sequelize.ENUM('leader', 'member', 'invited'),
          allowNull: false,
          defaultValue: 'member',
          comment: '角色：队长/成员/邀请中'
        },
        join_time: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '加入时间'
        },
        invite_source: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '邀请来源'
        },
        points_contributed: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '贡献积分'
        },
        rewards_received: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '获得奖励'
        },
        member_status: {
          type: Sequelize.ENUM('active', 'inactive', 'left', 'kicked'),
          allowNull: false,
          defaultValue: 'active',
          comment: '成员状态'
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
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '社交抽奖队员表'
      })

      // 2. 任务系统核心表
      console.log('📋 创建任务系统核心表...')

      // 任务模板表
      await queryInterface.createTable('task_templates', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '任务模板ID'
        },
        template_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '模板唯一标识符'
        },
        title: {
          type: Sequelize.STRING(200),
          allowNull: false,
          comment: '任务标题'
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '任务描述'
        },
        category: {
          type: Sequelize.ENUM('daily', 'weekly', 'monthly', 'special', 'achievement', 'social'),
          allowNull: false,
          comment: '任务分类'
        },
        task_type: {
          type: Sequelize.ENUM('lottery', 'points', 'social', 'collection', 'achievement', 'custom'),
          allowNull: false,
          comment: '任务类型'
        },
        difficulty: {
          type: Sequelize.ENUM('easy', 'medium', 'hard', 'epic'),
          allowNull: false,
          defaultValue: 'easy',
          comment: '任务难度'
        },
        target_value: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '目标数值'
        },
        reward_points: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '奖励积分'
        },
        reward_items: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '奖励物品列表'
        },
        prerequisites: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '前置条件'
        },
        auto_assign: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否自动分配'
        },
        is_repeatable: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否可重复'
        },
        repeat_interval: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '重复间隔（小时）'
        },
        priority: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '优先级'
        },
        config: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '任务配置参数'
        },
        status: {
          type: Sequelize.ENUM('active', 'inactive', 'archived'),
          allowNull: false,
          defaultValue: 'active',
          comment: '模板状态'
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
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '任务模板表'
      })

      // 用户任务表
      await queryInterface.createTable('user_tasks', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '用户任务ID'
        },
        task_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '任务唯一标识符'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        template_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '任务模板ID'
        },
        title: {
          type: Sequelize.STRING(200),
          allowNull: false,
          comment: '任务标题'
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '任务描述'
        },
        target_value: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '目标数值'
        },
        current_progress: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '当前进度'
        },
        completion_percentage: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 0.0,
          comment: '完成百分比'
        },
        task_status: {
          type: Sequelize.ENUM('pending', 'active', 'completed', 'failed', 'expired', 'cancelled'),
          allowNull: false,
          defaultValue: 'pending',
          comment: '任务状态'
        },
        assigned_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '分配时间'
        },
        started_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '开始时间'
        },
        completed_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '完成时间'
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '过期时间'
        },
        reward_claimed: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否已领取奖励'
        },
        reward_claimed_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '奖励领取时间'
        },
        metadata: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '任务元数据'
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
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '用户任务表'
      })

      // 任务进度记录表
      await queryInterface.createTable('task_progress_logs', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '进度记录ID'
        },
        task_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '任务ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        action_type: {
          type: Sequelize.ENUM('progress', 'bonus', 'penalty', 'reset', 'complete'),
          allowNull: false,
          comment: '操作类型'
        },
        progress_before: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '操作前进度'
        },
        progress_after: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '操作后进度'
        },
        change_amount: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '变化量'
        },
        trigger_source: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: '触发来源'
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '变化描述'
        },
        metadata: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '相关元数据'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '记录时间'
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '任务进度记录表'
      })

      // 3. VIP系统增强表
      console.log('👑 创建VIP系统增强表...')

      // VIP权益使用记录表
      await queryInterface.createTable('vip_benefit_usage', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '权益使用记录ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        vip_level: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: 'VIP等级'
        },
        benefit_type: {
          type: Sequelize.ENUM('discount', 'bonus_points', 'exclusive_lottery', 'priority_support', 'special_gift'),
          allowNull: false,
          comment: '权益类型'
        },
        benefit_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '权益名称'
        },
        usage_context: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: '使用场景'
        },
        original_value: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: '原始价值'
        },
        discounted_value: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: '折扣后价值'
        },
        savings_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: '节省金额'
        },
        usage_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
          comment: '使用次数'
        },
        related_order_id: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '关联订单ID'
        },
        metadata: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '使用详情元数据'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '使用时间'
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: 'VIP权益使用记录表'
      })

      // 4. 多池系统增强表
      console.log('🎱 创建多池系统增强表...')

      // 抽奖池配置表
      await queryInterface.createTable('lottery_pool_configs', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '池配置ID'
        },
        pool_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '池唯一标识符'
        },
        pool_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '池名称'
        },
        pool_type: {
          type: Sequelize.ENUM('standard', 'premium', 'vip', 'special', 'limited'),
          allowNull: false,
          comment: '池类型'
        },
        access_requirements: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '准入要求配置'
        },
        cost_multiplier: {
          type: Sequelize.DECIMAL(3, 2),
          allowNull: false,
          defaultValue: 1.0,
          comment: '消耗倍数'
        },
        reward_multiplier: {
          type: Sequelize.DECIMAL(3, 2),
          allowNull: false,
          defaultValue: 1.0,
          comment: '奖励倍数'
        },
        priority_weight: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 100,
          comment: '优先级权重'
        },
        daily_limit: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '每日抽取限制'
        },
        total_limit: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '总抽取限制'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否激活'
        },
        config: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '池详细配置'
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
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '抽奖池配置表'
      })

      // 用户池访问记录表
      await queryInterface.createTable('user_pool_access', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '访问记录ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        pool_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '池ID'
        },
        access_date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
          comment: '访问日期'
        },
        daily_draws: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '当日抽取次数'
        },
        total_draws: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '总抽取次数'
        },
        total_spent: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '总消耗积分'
        },
        total_rewards: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '总获得奖励'
        },
        last_draw_time: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '最后抽取时间'
        },
        access_level: {
          type: Sequelize.ENUM('basic', 'premium', 'vip', 'unlimited'),
          allowNull: false,
          defaultValue: 'basic',
          comment: '访问等级'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '首次访问时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          comment: '更新时间'
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '用户池访问记录表'
      })

      // 5. 创建必要的索引
      console.log('🔍 创建数据库索引...')

      // 社交抽奖系统索引
      await queryInterface.addIndex('social_lottery_campaigns', ['campaign_id'], {
        name: 'idx_social_campaigns_id',
        transaction
      })
      await queryInterface.addIndex('social_lottery_campaigns', ['social_type', 'status'], {
        name: 'idx_social_campaigns_type_status',
        transaction
      })
      await queryInterface.addIndex('social_lottery_campaigns', ['start_time', 'end_time'], {
        name: 'idx_social_campaigns_time',
        transaction
      })

      await queryInterface.addIndex('social_lottery_teams', ['team_id'], {
        name: 'idx_social_teams_id',
        transaction
      })
      await queryInterface.addIndex('social_lottery_teams', ['campaign_id', 'team_status'], {
        name: 'idx_social_teams_campaign_status',
        transaction
      })
      await queryInterface.addIndex('social_lottery_teams', ['leader_id'], {
        name: 'idx_social_teams_leader',
        transaction
      })
      await queryInterface.addIndex('social_lottery_teams', ['invite_code'], {
        name: 'idx_social_teams_invite',
        transaction
      })

      await queryInterface.addIndex('social_lottery_members', ['team_id', 'user_id'], {
        name: 'idx_social_members_team_user',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('social_lottery_members', ['user_id', 'member_status'], {
        name: 'idx_social_members_user_status',
        transaction
      })

      // 任务系统索引
      await queryInterface.addIndex('task_templates', ['template_id'], {
        name: 'idx_task_templates_id',
        transaction
      })
      await queryInterface.addIndex('task_templates', ['category', 'task_type'], {
        name: 'idx_task_templates_category_type',
        transaction
      })
      await queryInterface.addIndex('task_templates', ['status', 'auto_assign'], {
        name: 'idx_task_templates_status_assign',
        transaction
      })

      await queryInterface.addIndex('user_tasks', ['task_id'], {
        name: 'idx_user_tasks_id',
        transaction
      })
      await queryInterface.addIndex('user_tasks', ['user_id', 'task_status'], {
        name: 'idx_user_tasks_user_status',
        transaction
      })
      await queryInterface.addIndex('user_tasks', ['template_id'], {
        name: 'idx_user_tasks_template',
        transaction
      })
      await queryInterface.addIndex('user_tasks', ['expires_at'], {
        name: 'idx_user_tasks_expires',
        transaction
      })

      await queryInterface.addIndex('task_progress_logs', ['task_id', 'created_at'], {
        name: 'idx_task_progress_task_time',
        transaction
      })
      await queryInterface.addIndex('task_progress_logs', ['user_id', 'action_type'], {
        name: 'idx_task_progress_user_action',
        transaction
      })

      // VIP系统索引
      await queryInterface.addIndex('vip_benefit_usage', ['user_id', 'benefit_type'], {
        name: 'idx_vip_benefit_user_type',
        transaction
      })
      await queryInterface.addIndex('vip_benefit_usage', ['vip_level', 'created_at'], {
        name: 'idx_vip_benefit_level_time',
        transaction
      })

      // 多池系统索引
      await queryInterface.addIndex('lottery_pool_configs', ['pool_id'], {
        name: 'idx_pool_configs_id',
        transaction
      })
      await queryInterface.addIndex('lottery_pool_configs', ['pool_type', 'is_active'], {
        name: 'idx_pool_configs_type_active',
        transaction
      })

      await queryInterface.addIndex('user_pool_access', ['user_id', 'pool_id', 'access_date'], {
        name: 'idx_user_pool_access_unique',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('user_pool_access', ['pool_id', 'access_date'], {
        name: 'idx_user_pool_access_pool_date',
        transaction
      })

      console.log('✅ 所有社交抽奖和任务系统表创建完成！')

      await transaction.commit()
      console.log('🎉 数据库迁移成功完成！')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 数据库迁移失败:', error)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚社交抽奖和任务系统表...')

      // 删除表（按依赖关系逆序）
      await queryInterface.dropTable('user_pool_access', { transaction })
      await queryInterface.dropTable('lottery_pool_configs', { transaction })
      await queryInterface.dropTable('vip_benefit_usage', { transaction })
      await queryInterface.dropTable('task_progress_logs', { transaction })
      await queryInterface.dropTable('user_tasks', { transaction })
      await queryInterface.dropTable('task_templates', { transaction })
      await queryInterface.dropTable('social_lottery_members', { transaction })
      await queryInterface.dropTable('social_lottery_teams', { transaction })
      await queryInterface.dropTable('social_lottery_campaigns', { transaction })

      await transaction.commit()
      console.log('✅ 回滚完成！')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error)
      throw error
    }
  }
}
