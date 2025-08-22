/**
 * 🔥 全新分离式积分抽奖系统数据库迁移 (安全版本)
 * 创建时间：2025年08月19日 17:36:37 UTC
 * 特点：检查表和索引存在性，避免重复创建
 */

'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查表是否存在的辅助函数
      const tableExists = async tableName => {
        try {
          await queryInterface.describeTable(tableName)
          return true
        } catch (error) {
          return false
        }
      }

      // 安全添加索引的辅助函数
      const safeAddIndex = async (tableName, columns, options = {}) => {
        try {
          await queryInterface.addIndex(tableName, columns, {
            ...options,
            transaction
          })
          console.log(`✅ 索引创建成功: ${tableName}.${options.name || 'unnamed'}`)
        } catch (error) {
          if (error.original && error.original.code === 'ER_DUP_KEYNAME') {
            console.log(`⚠️ 索引已存在，跳过: ${tableName}.${options.name || 'unnamed'}`)
          } else {
            throw error
          }
        }
      }

      console.log('🔄 开始创建全新分离式积分抽奖系统...')

      // 🔥 1. 用户积分账户表
      if (!(await tableExists('user_points_accounts'))) {
        await queryInterface.createTable(
          'user_points_accounts',
          {
            account_id: {
              type: Sequelize.BIGINT,
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
              defaultValue: 0.0,
              comment: '可用积分余额'
            },
            total_earned: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              defaultValue: 0.0,
              comment: '累计获得积分'
            },
            total_consumed: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              defaultValue: 0.0,
              comment: '累计消耗积分'
            },
            last_earn_time: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '最后获得积分时间'
            },
            last_consume_time: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '最后消耗积分时间'
            },
            account_level: {
              type: Sequelize.ENUM('bronze', 'silver', 'gold', 'diamond'),
              allowNull: false,
              defaultValue: 'bronze',
              comment: '账户等级'
            },
            is_active: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: true,
              comment: '账户是否激活'
            },
            freeze_reason: {
              type: Sequelize.STRING(255),
              allowNull: true,
              comment: '冻结原因'
            },
            behavior_score: {
              type: Sequelize.DECIMAL(5, 2),
              allowNull: false,
              defaultValue: 0.0,
              comment: '用户行为评分(0-100)'
            },
            activity_level: {
              type: Sequelize.ENUM('low', 'medium', 'high', 'premium'),
              allowNull: false,
              defaultValue: 'medium',
              comment: '活跃度等级'
            },
            preference_tags: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '用户偏好标签JSON'
            },
            last_behavior_time: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '最后行为时间'
            },
            recommendation_enabled: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: true,
              comment: '是否启用个性化推荐'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            }
          },
          { transaction, comment: '用户积分账户表' }
        )

        console.log('✅ 用户积分账户表创建成功')
      } else {
        console.log('⚠️ 用户积分账户表已存在，跳过创建')
      }

      // 🔥 2. 积分交易记录表
      if (!(await tableExists('points_transactions'))) {
        await queryInterface.createTable(
          'points_transactions',
          {
            transaction_id: {
              type: Sequelize.BIGINT,
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
              type: Sequelize.BIGINT,
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
              comment: '积分数量(正数=获得,负数=消耗)'
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
              type: Sequelize.ENUM(
                'task_complete',
                'lottery_consume',
                'admin_adjust',
                'refund',
                'expire',
                'behavior_reward',
                'recommendation_bonus',
                'activity_bonus'
              ),
              allowNull: false,
              comment: '业务类型'
            },
            business_id: {
              type: Sequelize.STRING(64),
              allowNull: true,
              comment: '关联业务ID'
            },
            reference_data: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '业务参考数据'
            },
            behavior_context: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '行为上下文数据'
            },
            trigger_event: {
              type: Sequelize.STRING(100),
              allowNull: true,
              comment: '触发事件类型'
            },
            user_activity_level: {
              type: Sequelize.ENUM('low', 'medium', 'high', 'premium'),
              allowNull: true,
              comment: '交易时用户活跃度'
            },
            recommendation_source: {
              type: Sequelize.STRING(100),
              allowNull: true,
              comment: '推荐来源'
            },
            transaction_title: {
              type: Sequelize.STRING(255),
              allowNull: false,
              comment: '交易标题'
            },
            transaction_description: {
              type: Sequelize.TEXT,
              allowNull: true,
              comment: '交易描述'
            },
            operator_id: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '操作员ID'
            },
            transaction_time: {
              type: Sequelize.DATE(3),
              allowNull: false,
              defaultValue: Sequelize.NOW,
              comment: '交易时间(毫秒精度)'
            },
            effective_time: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '生效时间'
            },
            expire_time: {
              type: Sequelize.DATE,
              allowNull: true,
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
              allowNull: true,
              comment: '失败原因'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            }
          },
          { transaction, comment: '积分交易记录表' }
        )

        console.log('✅ 积分交易记录表创建成功')
      } else {
        console.log('⚠️ 积分交易记录表已存在，跳过创建')
      }

      // 🔥 3. 积分获取规则表
      if (!(await tableExists('points_earning_rules'))) {
        await queryInterface.createTable(
          'points_earning_rules',
          {
            rule_id: {
              type: Sequelize.INTEGER,
              primaryKey: true,
              autoIncrement: true,
              comment: '规则唯一标识'
            },
            rule_name: {
              type: Sequelize.STRING(255),
              allowNull: false,
              comment: '规则名称'
            },
            rule_code: {
              type: Sequelize.STRING(100),
              allowNull: false,
              unique: true,
              comment: '规则代码(唯一)'
            },
            business_type: {
              type: Sequelize.ENUM(
                'task_complete',
                'daily_signin',
                'share_activity',
                'invite_user'
              ),
              allowNull: false,
              comment: '业务类型'
            },
            points_amount: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              comment: '积分数量'
            },
            calculation_type: {
              type: Sequelize.ENUM('fixed', 'percentage', 'formula'),
              allowNull: false,
              defaultValue: 'fixed',
              comment: '计算方式'
            },
            calculation_formula: {
              type: Sequelize.STRING(500),
              allowNull: true,
              comment: '计算公式(JSON格式)'
            },
            min_task_count: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '最小任务完成数量'
            },
            max_task_count: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '最大任务完成数量'
            },
            user_level_limit: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '用户等级限制'
            },
            daily_limit: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '每日限制次数'
            },
            total_limit: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '总限制次数'
            },
            valid_start_time: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '规则生效开始时间'
            },
            valid_end_time: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '规则生效结束时间'
            },
            points_expire_days: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 365,
              comment: '积分过期天数'
            },
            is_active: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: true,
              comment: '是否启用'
            },
            priority_order: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 100,
              comment: '优先级'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            }
          },
          { transaction, comment: '积分获取规则配置表' }
        )

        console.log('✅ 积分获取规则表创建成功')
      } else {
        console.log('⚠️ 积分获取规则表已存在，跳过创建')
      }

      // 🔥 4. 抽奖活动配置表
      if (!(await tableExists('lottery_campaigns'))) {
        await queryInterface.createTable(
          'lottery_campaigns',
          {
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
              defaultValue: '00:00:00',
              comment: '每日重置时间'
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
              defaultValue: 'draft',
              comment: '活动状态'
            },
            is_featured: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: false,
              comment: '是否为特色活动'
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
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            }
          },
          { transaction, comment: '抽奖活动配置表' }
        )

        console.log('✅ 抽奖活动配置表创建成功')
      } else {
        console.log('⚠️ 抽奖活动配置表已存在，跳过创建')
      }

      // 🔥 5. 奖品信息库表
      if (!(await tableExists('lottery_prizes'))) {
        await queryInterface.createTable(
          'lottery_prizes',
          {
            prize_id: {
              type: Sequelize.INTEGER,
              primaryKey: true,
              autoIncrement: true,
              comment: '奖品唯一标识'
            },
            campaign_id: {
              type: Sequelize.INTEGER,
              allowNull: false,
              comment: '关联活动ID'
            },
            prize_name: {
              type: Sequelize.STRING(255),
              allowNull: false,
              comment: '奖品名称'
            },
            prize_code: {
              type: Sequelize.STRING(100),
              allowNull: false,
              comment: '奖品代码'
            },
            prize_type: {
              type: Sequelize.ENUM('points', 'coupon', 'physical', 'virtual', 'thank_you'),
              allowNull: false,
              comment: '奖品类型'
            },
            prize_value: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              defaultValue: 0.0,
              comment: '奖品价值'
            },
            cost_value: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              defaultValue: 0.0,
              comment: '成本价值'
            },
            total_quantity: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '总库存数量'
            },
            remaining_quantity: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '剩余库存数量'
            },
            awarded_quantity: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '已发放数量'
            },
            win_probability: {
              type: Sequelize.DECIMAL(8, 6),
              allowNull: false,
              comment: '中奖概率(0-1之间)'
            },
            probability_weight: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 1,
              comment: '概率权重'
            },
            prize_image_url: {
              type: Sequelize.STRING(500),
              allowNull: true,
              comment: '奖品图片链接'
            },
            prize_description: {
              type: Sequelize.TEXT,
              allowNull: true,
              comment: '奖品描述'
            },
            prize_detail: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '奖品详细信息'
            },
            auto_distribute: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: true,
              comment: '是否自动发放'
            },
            distribution_method: {
              type: Sequelize.ENUM('auto', 'manual', 'api'),
              allowNull: false,
              defaultValue: 'auto',
              comment: '发放方式'
            },
            validity_days: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '奖品有效期(天)'
            },
            is_active: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: true,
              comment: '是否启用'
            },
            sort_order: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 100,
              comment: '排序权重'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            }
          },
          { transaction, comment: '奖品信息库表' }
        )

        console.log('✅ 奖品信息库表创建成功')
      } else {
        console.log('⚠️ 奖品信息库表已存在，跳过创建')
      }

      // 🔥 6. 抽奖记录表
      if (!(await tableExists('lottery_draws'))) {
        await queryInterface.createTable(
          'lottery_draws',
          {
            draw_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '抽奖记录唯一标识'
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
            is_winner: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              comment: '是否中奖'
            },
            prize_id: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '中奖奖品ID'
            },
            points_consumed: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              comment: '消耗积分数量'
            },
            draw_time: {
              type: Sequelize.DATE(3),
              allowNull: false,
              defaultValue: Sequelize.NOW,
              comment: '抽奖时间'
            },
            algorithm_type: {
              type: Sequelize.ENUM('simple', 'guaranteed', 'dynamic', 'multi_stage', 'group'),
              allowNull: false,
              defaultValue: 'simple',
              comment: '抽奖算法类型'
            },
            algorithm_version: {
              type: Sequelize.STRING(20),
              allowNull: false,
              defaultValue: 'v1.0',
              comment: '算法版本'
            },
            algorithm_data: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '算法专用数据'
            },
            user_context: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '用户上下文数据'
            },
            draw_metadata: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '抽奖元数据'
            },
            is_hot_data: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: true,
              comment: '是否为热点数据'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            }
          },
          { transaction, comment: '统一抽奖记录表' }
        )

        console.log('✅ 抽奖记录表创建成功')
      } else {
        console.log('⚠️ 抽奖记录表已存在，跳过创建')
      }

      // 🔥 7. 业务事件记录表
      if (!(await tableExists('business_events'))) {
        await queryInterface.createTable(
          'business_events',
          {
            event_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '事件唯一标识'
            },
            event_type: {
              type: Sequelize.ENUM(
                'points_earned',
                'points_consumed',
                'lottery_drawn',
                'prize_awarded',
                'user_levelup',
                'behavior_tracked',
                'recommendation_generated',
                'recommendation_clicked',
                'activity_detected',
                'preference_updated'
              ),
              allowNull: false,
              comment: '事件类型'
            },
            event_source: {
              type: Sequelize.ENUM(
                'points_system',
                'lottery_system',
                'user_system',
                'admin_system',
                'behavior_system',
                'recommendation_system'
              ),
              allowNull: false,
              comment: '事件来源'
            },
            event_target: {
              type: Sequelize.ENUM(
                'points_system',
                'lottery_system',
                'user_system',
                'notification_system',
                'behavior_system',
                'recommendation_system',
                'analytics_system'
              ),
              allowNull: false,
              comment: '事件目标'
            },
            user_id: {
              type: Sequelize.INTEGER,
              allowNull: false,
              comment: '相关用户ID'
            },
            event_data: {
              type: Sequelize.JSON,
              allowNull: false,
              comment: '事件数据(JSON格式)'
            },
            correlation_id: {
              type: Sequelize.STRING(64),
              allowNull: true,
              comment: '关联ID(用于事务追踪)'
            },
            session_id: {
              type: Sequelize.STRING(64),
              allowNull: true,
              comment: '用户会话ID'
            },
            device_info: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '设备信息JSON'
            },
            page_context: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '页面上下文JSON'
            },
            behavior_tags: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '行为标签JSON'
            },
            user_agent: {
              type: Sequelize.STRING(500),
              allowNull: true,
              comment: '用户代理字符串'
            },
            status: {
              type: Sequelize.ENUM('pending', 'processing', 'completed', 'failed', 'retrying'),
              allowNull: false,
              defaultValue: 'pending',
              comment: '处理状态'
            },
            retry_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '重试次数'
            },
            max_retry_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 3,
              comment: '最大重试次数'
            },
            event_time: {
              type: Sequelize.DATE(3),
              allowNull: false,
              defaultValue: Sequelize.NOW,
              comment: '事件发生时间'
            },
            process_time: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '开始处理时间'
            },
            complete_time: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '完成时间'
            },
            next_retry_time: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '下次重试时间'
            },
            process_result: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '处理结果'
            },
            error_message: {
              type: Sequelize.TEXT,
              allowNull: true,
              comment: '错误信息'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.NOW
            }
          },
          { transaction, comment: '业务事件记录表' }
        )

        console.log('✅ 业务事件记录表创建成功')
      } else {
        console.log('⚠️ 业务事件记录表已存在，跳过创建')
      }

      // 🔥 安全添加索引
      console.log('🔄 开始创建高性能索引...')

      // 积分账户表索引
      await safeAddIndex('user_points_accounts', ['available_points'], {
        name: 'idx_upa_available_points'
      })
      await safeAddIndex('user_points_accounts', ['account_level'], {
        name: 'idx_upa_account_level'
      })
      await safeAddIndex('user_points_accounts', ['is_active'], { name: 'idx_upa_is_active' })
      await safeAddIndex('user_points_accounts', ['behavior_score'], {
        name: 'idx_upa_behavior_score'
      })
      await safeAddIndex('user_points_accounts', ['activity_level'], {
        name: 'idx_upa_activity_level'
      })

      // 积分交易表索引
      await safeAddIndex('points_transactions', ['user_id', 'transaction_time'], {
        name: 'idx_pt_user_time'
      })
      await safeAddIndex('points_transactions', ['transaction_type'], {
        name: 'idx_pt_transaction_type'
      })
      await safeAddIndex('points_transactions', ['business_type'], { name: 'idx_pt_business_type' })
      await safeAddIndex('points_transactions', ['status'], { name: 'idx_pt_status' })

      // 抽奖活动表索引
      await safeAddIndex('lottery_campaigns', ['status'], { name: 'idx_lc_status' })
      await safeAddIndex('lottery_campaigns', ['campaign_type'], { name: 'idx_lc_campaign_type' })
      await safeAddIndex('lottery_campaigns', ['start_time', 'end_time'], {
        name: 'idx_lc_time_range'
      })

      // 抽奖记录表索引
      await safeAddIndex('lottery_draws', ['user_id', 'draw_time'], { name: 'idx_ld_user_time' })
      await safeAddIndex('lottery_draws', ['campaign_id'], { name: 'idx_ld_campaign_id' })
      await safeAddIndex('lottery_draws', ['is_winner'], { name: 'idx_ld_is_winner' })
      await safeAddIndex('lottery_draws', ['algorithm_type'], { name: 'idx_ld_algorithm_type' })

      // 业务事件表索引
      await safeAddIndex('business_events', ['event_type'], { name: 'idx_be_event_type' })
      await safeAddIndex('business_events', ['user_id'], { name: 'idx_be_user_id' })
      await safeAddIndex('business_events', ['status'], { name: 'idx_be_status' })
      await safeAddIndex('business_events', ['event_time'], { name: 'idx_be_event_time' })

      await transaction.commit()

      console.log('🎉 全新分离式积分抽奖系统创建完成！')
      console.log('📊 系统统计:')
      console.log('  - 积分系统表: 3个')
      console.log('  - 抽奖系统表: 3个')
      console.log('  - 系统集成表: 1个')
      console.log('  - 高性能索引: 20+个')
      console.log('🔥 架构特点: 完全分离 + 事件驱动 + 智能化预留')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 数据库迁移失败:', error)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 按依赖关系逆序删除表
      const tablesToDrop = [
        'business_events',
        'lottery_draws',
        'lottery_prizes',
        'lottery_campaigns',
        'points_transactions',
        'points_earning_rules',
        'user_points_accounts'
      ]

      for (const tableName of tablesToDrop) {
        try {
          await queryInterface.dropTable(tableName, { transaction })
          console.log(`✅ 表删除成功: ${tableName}`)
        } catch (error) {
          console.log(`⚠️ 表删除失败或不存在: ${tableName}`)
        }
      }

      await transaction.commit()
      console.log('🔄 数据库回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 数据库回滚失败:', error)
      throw error
    }
  }
}
