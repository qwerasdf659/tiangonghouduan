'use strict'

/**
 * 迁移文件：创建抽奖次数配额控制表
 *
 * 业务场景：
 * - 实现抽奖次数配额的四维度控制（全局/活动/角色/用户）
 * - 提供强一致扣减机制，解决并发窗口期问题
 * - 支持连抽场景的原子性扣减（10连抽一次扣减10次）
 *
 * 创建表：
 * 1. lottery_draw_quota_rules - 配额规则表（规则层）
 * 2. lottery_user_daily_draw_quota - 用户每日抽奖配额表（强一致扣减层）
 *
 * 创建时间：2025-12-23
 * 作者：系统架构设计
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ============================================================
      // 表1：lottery_draw_quota_rules - 抽奖次数配额规则表
      // 作用：统一事实源，实现四维度（全局/活动/角色/用户）配额规则管理
      // ============================================================
      await queryInterface.createTable(
        'lottery_draw_quota_rules',
        {
          // 主键ID
          rule_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '规则主键ID'
          },

          // 作用域类型：global-全局, campaign-活动, role-角色/人群, user-用户
          scope_type: {
            type: Sequelize.ENUM('global', 'campaign', 'role', 'user'),
            allowNull: false,
            comment: '作用域类型：global-全局默认, campaign-活动级, role-角色/人群级, user-用户级'
          },

          // 作用域ID：global固定为"global"，campaign存campaign_id，role存role_uuid，user存user_id
          scope_id: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment:
              '作用域ID：global固定为"global"，campaign存campaign_id，role存role_uuid，user存user_id'
          },

          // 统计窗口类型：daily-每日, campaign_total-活动总计
          window_type: {
            type: Sequelize.ENUM('daily', 'campaign_total'),
            allowNull: false,
            defaultValue: 'daily',
            comment: '统计窗口类型：daily-每日重置, campaign_total-活动期间累计'
          },

          // 配额上限值：>=0，0代表不限制（仅对global允许0）
          limit_value: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 50,
            comment: '配额上限值：>=0，0代表不限制（仅对global允许0）'
          },

          // 时区：默认北京时间+08:00
          timezone: {
            type: Sequelize.STRING(10),
            allowNull: false,
            defaultValue: '+08:00',
            comment: '时区：默认北京时间+08:00'
          },

          // 生效开始时间：允许null表示立即生效
          effective_from: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效开始时间：null表示立即生效'
          },

          // 生效结束时间：允许null表示永久有效
          effective_to: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效结束时间：null表示永久有效'
          },

          // 优先级：同层级多条命中时决定优先级，数字越大优先级越高
          priority: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '优先级：同层级多条命中时决定优先级，数字越大优先级越高'
          },

          // 规则状态：active-启用, inactive-停用
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: '规则状态：active-启用, inactive-停用'
          },

          // 规则说明/备注：审计用
          reason: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '规则说明/备注：记录为什么这么配置，便于审计'
          },

          // 创建人ID
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建人ID（管理员user_id）'
          },

          // 更新人ID
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '更新人ID（管理员user_id）'
          },

          // 创建时间
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },

          // 更新时间
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间'
          }
        },
        { transaction }
      )

      // 创建索引：scope_type + scope_id + status + effective_from + effective_to
      await queryInterface.addIndex(
        'lottery_draw_quota_rules',
        ['scope_type', 'scope_id', 'status', 'effective_from', 'effective_to'],
        {
          name: 'idx_scope_status_effective',
          transaction
        }
      )

      // 创建索引：window_type + status
      await queryInterface.addIndex('lottery_draw_quota_rules', ['window_type', 'status'], {
        name: 'idx_window_status',
        transaction
      })

      console.log('✅ 表 lottery_draw_quota_rules 创建成功')

      // ============================================================
      // 表2：lottery_user_daily_draw_quota - 用户每日抽奖配额表
      // 作用：强一致扣减层，原子操作避免并发窗口期问题
      // ============================================================
      await queryInterface.createTable(
        'lottery_user_daily_draw_quota',
        {
          // 配额记录ID
          quota_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '配额记录主键ID'
          },

          // 用户ID
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID'
          },

          // 活动ID
          campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '活动ID'
          },

          // 配额日期：北京时间日期，如 "2025-12-24"
          quota_date: {
            type: Sequelize.DATEONLY,
            allowNull: false,
            comment: '配额日期：北京时间日期'
          },

          // 当日上限：来自规则计算结果
          limit_value: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 50,
            comment: '当日上限：来自规则计算结果'
          },

          // 已使用抽奖次数
          used_draw_count: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
            comment: '已使用抽奖次数'
          },

          // 当日临时补偿的抽奖次数
          bonus_draw_count: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
            comment: '当日临时补偿的抽奖次数（客服加次数用）'
          },

          // 最后一次抽奖时间
          last_draw_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '最后一次抽奖时间'
          },

          // 命中的规则ID
          matched_rule_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '命中的规则ID（便于审计追溯）'
          },

          // 创建时间
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },

          // 更新时间
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间'
          }
        },
        { transaction }
      )

      // 创建唯一索引：user_id + campaign_id + quota_date（联合唯一）
      await queryInterface.addIndex(
        'lottery_user_daily_draw_quota',
        ['user_id', 'campaign_id', 'quota_date'],
        {
          name: 'idx_user_campaign_date_unique',
          unique: true,
          transaction
        }
      )

      // 创建索引：quota_date + campaign_id（用于批量清理/统计）
      await queryInterface.addIndex(
        'lottery_user_daily_draw_quota',
        ['quota_date', 'campaign_id'],
        {
          name: 'idx_date_campaign',
          transaction
        }
      )

      // 创建索引：user_id（用于用户查询）
      await queryInterface.addIndex('lottery_user_daily_draw_quota', ['user_id'], {
        name: 'idx_user_id',
        transaction
      })

      console.log('✅ 表 lottery_user_daily_draw_quota 创建成功')

      // ============================================================
      // 初始化数据：插入全局默认规则
      // ============================================================
      await queryInterface.bulkInsert(
        'lottery_draw_quota_rules',
        [
          {
            scope_type: 'global',
            scope_id: 'global',
            window_type: 'daily',
            limit_value: 50,
            timezone: '+08:00',
            effective_from: null,
            effective_to: null,
            priority: 0,
            status: 'active',
            reason: '全局默认规则：每日抽奖上限50次（与活动表max_draws_per_user_daily对齐）',
            created_by: null,
            updated_by: null,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      console.log('✅ 初始化全局默认规则完成')

      await transaction.commit()
      console.log('✅ 迁移完成：创建抽奖次数配额控制表')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除 lottery_user_daily_draw_quota 表
      await queryInterface.dropTable('lottery_user_daily_draw_quota', { transaction })
      console.log('✅ 表 lottery_user_daily_draw_quota 删除成功')

      // 删除 lottery_draw_quota_rules 表
      await queryInterface.dropTable('lottery_draw_quota_rules', { transaction })
      console.log('✅ 表 lottery_draw_quota_rules 删除成功')

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
