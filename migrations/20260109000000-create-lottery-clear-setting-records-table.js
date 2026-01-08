'use strict'

/**
 * 创建抽奖清除设置记录表（lottery_clear_setting_records）
 *
 * 业务场景：为 lottery_clear_settings 审计日志提供业务主键
 * - 解决 AdminLotteryService.clearUserSettings 审计时 target_id: null 导致关键操作被阻断的问题
 * - 符合审计统一入口整合方案（2026-01-08）决策9：无业务主键的关键操作新增业务记录表
 *
 * 表结构说明：
 * - record_id：主键，作为审计日志的 target_id
 * - user_id：被清除设置的用户ID
 * - admin_id：执行清除的管理员ID
 * - setting_type：清除的设置类型（all/force_win/force_lose/probability/queue）
 * - cleared_count：清除的记录数量
 * - idempotency_key：幂等键（唯一约束）
 *
 * 创建时间：2026-01-09
 * 关联文档：审计统一入口整合方案-2026-01-08.md
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  /**
   * 执行迁移：创建 lottery_clear_setting_records 表
   *
   * @param {QueryInterface} queryInterface - Sequelize QueryInterface
   * @param {Sequelize} Sequelize - Sequelize 模块
   * @returns {Promise<void>} 无返回值
   */
  async up(queryInterface, Sequelize) {
    // 1. 检查表是否已存在
    const tableExists = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as cnt FROM information_schema.tables 
       WHERE table_schema = DATABASE() AND table_name = 'lottery_clear_setting_records'`,
      { type: Sequelize.QueryTypes.SELECT }
    )

    if (tableExists[0].cnt > 0) {
      console.log('✅ lottery_clear_setting_records 表已存在，跳过创建')
      return
    }

    // 2. 创建表
    await queryInterface.createTable(
      'lottery_clear_setting_records',
      {
        // 主键：清除记录ID（作为审计日志 target_id）
        record_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '清除记录ID（作为审计日志 target_id）'
        },

        // 被清除设置的用户ID
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '被清除设置的用户ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },

        // 执行清除的管理员ID
        admin_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '执行清除的管理员ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },

        // 清除的设置类型
        setting_type: {
          type: Sequelize.STRING(50),
          allowNull: true,
          defaultValue: 'all',
          comment:
            '清除的设置类型：all=全部/force_win=强制中奖/force_lose=强制不中奖/probability=概率调整/queue=用户队列'
        },

        // 清除的记录数量
        cleared_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '本次清除的设置记录数量'
        },

        // 清除原因
        reason: {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment: '清除原因（管理员备注）'
        },

        // 幂等键（唯一约束）
        idempotency_key: {
          type: Sequelize.STRING(100),
          allowNull: false,
          unique: true,
          comment: '幂等键（格式：lottery_clear_{user_id}_{setting_type}_{admin_id}_{timestamp}）'
        },

        // 元数据
        metadata: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '额外元数据（IP地址、用户代理、清除前的设置快照等）'
        },

        // 创建时间
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '创建时间'
        }
      },
      {
        comment: '抽奖清除设置记录表（为审计日志提供业务主键）'
      }
    )

    // 3. 创建索引
    await queryInterface.addIndex('lottery_clear_setting_records', ['user_id'], {
      name: 'idx_clear_records_user_id',
      comment: '按用户查询清除历史'
    })

    await queryInterface.addIndex('lottery_clear_setting_records', ['admin_id'], {
      name: 'idx_clear_records_admin_id',
      comment: '按管理员查询操作记录'
    })

    await queryInterface.addIndex('lottery_clear_setting_records', ['created_at'], {
      name: 'idx_clear_records_created_at',
      comment: '按时间查询清除记录'
    })

    console.log('✅ lottery_clear_setting_records 表创建成功')
  },

  /**
   * 回滚迁移：删除 lottery_clear_setting_records 表
   *
   * @param {QueryInterface} queryInterface - Sequelize QueryInterface
   * @param {Sequelize} _Sequelize - Sequelize 模块（未使用）
   * @returns {Promise<void>} 无返回值
   */
  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('lottery_clear_setting_records')
    console.log('✅ lottery_clear_setting_records 表已删除')
  }
}
