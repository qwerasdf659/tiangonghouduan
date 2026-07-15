'use strict'

/**
 * 下线 per-user 暗箱抽奖干预表 lottery_management_settings（合规改造 2026-06-04）
 *
 * 业务背景（详见 docs/抽奖管理干预接入缺口诊断.md §十六）：
 * - force_win（强制中奖）/ force_lose（强制不中）属于"伪装成抽奖结果的暗箱操纵"，踩合规红线
 *   （《反不正当竞争法》第十条禁止虚构/内定中奖；《规范促销行为暂行规定》要求公示概率、后台=公示一致）
 * - probability_adjust（per-user 概率调整）写入后全程无人消费，是死代码 + 合规暗箱
 * - user_queue（用户专属队列）同属"按 user_id 预设结果"，当前 0 使用
 * - 个人发奖统一改走 cs_compensate（客服明示补偿，用户可见 + 审计留痕，合规且已实现）
 * - 群体调赔率改走"按成长等级的公示分级概率"（B 线）
 *
 * 数据现状（连真实库 restaurant_points_dev 核实）：
 * - force_win 669 + force_lose 1 + probability_adjust 3149 条，全部为 used/expired/cancelled，0 条 active
 * - 无任何外键引用本表（KEY_COLUMN_USAGE 确认）
 * - 对线上零影响（_checkOverride 硬性要求 status='active'，全表无 active 行）
 *
 * P5 拍板=硬删清零：未上线 + 全部非 active + 不兼容旧接口，直接 DROP TABLE
 * down 提供完整回滚（按真实库 SHOW CREATE TABLE 原样重建，含全部索引与外键，但不恢复历史死数据）
 */

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      // 1. 防御性校验：确认无 active 记录（若存在 active，说明有未迁移的在用干预，需先人工处理）
      const [activeRows] = await sequelize.query(
        "SELECT COUNT(*) AS cnt FROM lottery_management_settings WHERE status = 'active'",
        { transaction }
      )
      const activeCount = parseInt(activeRows[0].cnt, 10)
      if (activeCount > 0) {
        throw new Error(
          `lottery_management_settings 存在 ${activeCount} 条 active 记录，` +
            '为避免误删在用干预，迁移中止。请先人工核实并迁移后再执行。'
        )
      }

      // 2. 硬删全部死数据（P5）后直接下线整表（ENUM 随表一并移除）
      await queryInterface.dropTable('lottery_management_settings', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      // 完整回滚：按真实库原结构重建表（含 ENUM、索引、外键），但不恢复历史死数据
      await queryInterface.createTable(
        'lottery_management_settings',
        {
          lottery_management_setting_id: {
            type: Sequelize.STRING(50),
            primaryKey: true,
            allowNull: false,
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
            comment: '设置详情（JSON格式）'
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
            comment: '创建管理员ID（用于审计追溯）'
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
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          },
          lottery_campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '关联的抽奖活动ID（NULL=全局干预，非NULL=仅对指定活动生效）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '抽奖管理设置表（已于 2026-06-04 合规下线，此为回滚重建结构）'
        }
      )

      // 重建索引
      await queryInterface.addIndex('lottery_management_settings', ['user_id', 'status'], {
        name: 'idx_user_status',
        transaction
      })
      await queryInterface.addIndex('lottery_management_settings', ['expires_at'], {
        name: 'idx_expires_at',
        transaction
      })
      await queryInterface.addIndex('lottery_management_settings', ['setting_type', 'status'], {
        name: 'idx_type_status',
        transaction
      })
      await queryInterface.addIndex('lottery_management_settings', ['created_by', 'created_at'], {
        name: 'idx_created_by',
        transaction
      })
      await queryInterface.addIndex(
        'lottery_management_settings',
        ['user_id', 'setting_type', 'status'],
        { name: 'idx_user_type_status', transaction }
      )
      await queryInterface.addIndex(
        'lottery_management_settings',
        ['lottery_campaign_id', 'user_id', 'status'],
        { name: 'idx_campaign_user_status', transaction }
      )

      // 重建外键约束
      await queryInterface.addConstraint('lottery_management_settings', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'lottery_management_settings_ibfk_1',
        references: { table: 'users', field: 'user_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('lottery_management_settings', {
        fields: ['created_by'],
        type: 'foreign key',
        name: 'lottery_management_settings_ibfk_2',
        references: { table: 'users', field: 'user_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })
      await queryInterface.addConstraint('lottery_management_settings', {
        fields: ['lottery_campaign_id'],
        type: 'foreign key',
        name: 'lottery_management_settings_lottery_campaign_id_foreign_idx',
        references: { table: 'lottery_campaigns', field: 'lottery_campaign_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
