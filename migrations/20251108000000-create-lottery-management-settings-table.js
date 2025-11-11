/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：创建抽奖管理设置表
 * 迁移类型：create-table（创建新表）
 * 版本号：v4.3.0
 * 创建时间：2025-11-08
 *
 * 变更说明：
 * 1. 创建lottery_management_settings表，用于存储管理员的抽奖干预设置
 * 2. 支持4种设置类型：强制中奖、强制不中奖、概率调整、用户专属队列
 * 3. 支持设置过期机制和状态管理（active/expired/used/cancelled）
 * 4. 创建5个索引以优化查询性能
 *
 * 业务场景：
 * - 管理员为特定用户设置强制中奖指定奖品（活动补偿、VIP特权、测试验证）
 * - 管理员设置用户强制不中奖N次（防刷保护、惩罚措施）
 * - 管理员临时调整用户中奖概率倍数（用户挽留、活跃度激励）
 * - 管理员为用户预设抽奖结果队列（精准运营、VIP体验优化）
 *
 * 依赖关系：
 * - 依赖users表已存在（外键约束）
 *
 * 影响范围：
 * - 创建新表lottery_management_settings
 * - 不影响现有表结构和数据
 */

'use strict'

module.exports = {
  /**
   * 执行迁移（up方向）
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>} Promise对象
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始创建抽奖管理设置表...')

      /*
       * ========================================
       * 第1步：创建lottery_management_settings表
       * ========================================
       * 存储管理员的抽奖干预设置
       */
      console.log('1. 创建lottery_management_settings表...')
      await queryInterface.createTable(
        'lottery_management_settings',
        {
          // 主键：设置唯一标识
          setting_id: {
            type: Sequelize.STRING(50),
            primaryKey: true,
            allowNull: false,
            comment: '设置记录唯一标识（格式：setting_时间戳_随机码）'
          },

          // 目标用户ID：设置对哪个用户生效
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '目标用户ID（设置对哪个用户生效）',
            references: {
              model: 'users',
              key: 'user_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },

          // 设置类型：区分不同的管理设置
          setting_type: {
            type: Sequelize.ENUM(
              'force_win', // 强制中奖（指定用户下次必中某个奖品）
              'force_lose', // 强制不中奖（指定用户接下来N次抽奖不中奖）
              'probability_adjust', // 概率调整（临时调整用户中奖概率倍数）
              'user_queue' // 用户专属队列（预设用户未来抽奖结果序列）
            ),
            allowNull: false,
            comment: '设置类型：force_win-强制中奖，force_lose-强制不中奖，probability_adjust-概率调整，user_queue-用户专属队列'
          },

          // 设置详情：JSON格式存储设置参数
          setting_data: {
            type: Sequelize.JSON,
            allowNull: false,
            comment: '设置详情（JSON格式）：force_win={prize_id,reason}，force_lose={count,remaining,reason}，probability_adjust={multiplier,reason}，user_queue={queue_type,priority_level,custom_strategy}'
          },

          // 过期时间：设置自动失效时间（北京时间GMT+8）
          expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '过期时间（北京时间，NULL表示永不过期）'
          },

          // 设置状态：标识设置当前状态
          status: {
            type: Sequelize.ENUM(
              'active', // 生效中（默认状态，查询时只返回active状态的设置）
              'expired', // 已过期（expires_at到期后自动标记）
              'used', // 已使用（force_win使用后标记，避免重复使用）
              'cancelled' // 已取消（管理员手动取消）
            ),
            allowNull: false,
            defaultValue: 'active',
            comment: '设置状态：active-生效中，expired-已过期，used-已使用，cancelled-已取消'
          },

          // 创建管理员ID：记录是哪个管理员创建的设置（用于审计追溯）
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '创建管理员ID（记录是哪个管理员创建的设置，用于审计追溯）',
            references: {
              model: 'users',
              key: 'user_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },

          // 创建时间：设置创建时间（北京时间GMT+8）
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },

          // 更新时间：设置最后更新时间（北京时间GMT+8）
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          engine: 'InnoDB',
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '抽奖管理设置表：存储管理员的抽奖干预设置（强制中奖、强制不中奖、概率调整、用户专属队列）'
        }
      )

      /*
       * ========================================
       * 第2步：创建索引以优化查询性能
       * ========================================
       * 根据实际业务查询场景创建5个索引
       */
      console.log('2. 创建索引...')

      // 索引1：快速查询用户的active设置（抽奖时查询）- 最高频
      await queryInterface.addIndex(
        'lottery_management_settings',
        ['user_id', 'status'],
        {
          name: 'idx_user_status',
          transaction
        }
      )

      // 索引2：定时任务查询过期设置（清理expired设置）
      await queryInterface.addIndex(
        'lottery_management_settings',
        ['expires_at'],
        {
          name: 'idx_expires_at',
          transaction
        }
      )

      // 索引3：按类型查询active设置（统计功能）
      await queryInterface.addIndex(
        'lottery_management_settings',
        ['setting_type', 'status'],
        {
          name: 'idx_type_status',
          transaction
        }
      )

      // 索引4：审计查询管理员操作记录
      await queryInterface.addIndex(
        'lottery_management_settings',
        ['created_by', 'created_at'],
        {
          name: 'idx_created_by',
          transaction
        }
      )

      // 索引5：复合索引，查询用户特定类型的active设置
      await queryInterface.addIndex(
        'lottery_management_settings',
        ['user_id', 'setting_type', 'status'],
        {
          name: 'idx_user_type_status',
          transaction
        }
      )

      await transaction.commit()
      console.log('✅ lottery_management_settings表创建完成')
      console.log('📊 表结构：')
      console.log('   - 主键：setting_id（字符串格式：setting_时间戳_随机码）')
      console.log('   - 外键：user_id（目标用户）、created_by（创建管理员）')
      console.log('   - 设置类型：force_win、force_lose、probability_adjust、user_queue')
      console.log('   - 状态流转：active → used/expired/cancelled')
      console.log('   - 索引：5个复合索引优化查询性能')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} _Sequelize - Sequelize实例（未使用）
   * @returns {Promise<void>} Promise对象
   */
  async down (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始回滚lottery_management_settings表...')

      // 检查是否有数据
      const [results] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM lottery_management_settings',
        { transaction }
      )

      if (results[0].count > 0) {
        console.warn(`⚠️ 警告：表中存在${results[0].count}条设置记录`)
        console.warn('⚠️ 回滚将删除这些记录')
      }

      // 删除表（索引和外键会自动删除）
      console.log('1. 删除lottery_management_settings表...')
      await queryInterface.dropTable('lottery_management_settings', { transaction })

      await transaction.commit()
      console.log('✅ 回滚完成，lottery_management_settings表已删除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
