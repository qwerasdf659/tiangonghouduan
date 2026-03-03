'use strict'

/**
 * 创建 user_ratio_overrides 表：用户级消费比例覆盖
 *
 * 业务场景：
 * - 管理员可为特定用户设置个性化的消费比例（积分比例/预算比例/配额比例）
 * - 支持有效期控制（临时活动覆盖到期自动恢复为全局默认值）
 * - 三个消费比例均支持全局+个人两层配置
 *
 * 优先级：个人覆盖 > 全局默认（system_settings）
 *
 * @see docs/钻石配额配置修复与优化方案.md §11
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_ratio_overrides', {
      user_ratio_override_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '覆盖记录主键'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '目标用户ID',
        references: { model: 'users', key: 'user_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      },
      ratio_key: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '比例类型：points_award_ratio / budget_allocation_ratio / diamond_quota_ratio'
      },
      ratio_value: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        comment: '覆盖比例值（如 2.0 表示消费金额×2.0）'
      },
      reason: {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: '覆盖原因（如：双11活动奖励、投诉补偿、VIP关怀）'
      },
      effective_start: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '生效开始时间（NULL=立即生效）'
      },
      effective_end: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '生效结束时间（NULL=永久生效）'
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '操作管理员ID',
        references: { model: 'users', key: 'user_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: '用户消费比例覆盖表（三个消费比例均支持全局+个人两层配置）'
    })

    // 唯一约束：同一用户同一比例类型只能有一条覆盖记录
    await queryInterface.addIndex('user_ratio_overrides', {
      fields: ['user_id', 'ratio_key'],
      unique: true,
      name: 'uk_user_ratio'
    })

    // 按用户查询索引
    await queryInterface.addIndex('user_ratio_overrides', {
      fields: ['user_id'],
      name: 'idx_user_ratio_user_id'
    })

    // 按有效期查询索引（用于过期清理/统计）
    await queryInterface.addIndex('user_ratio_overrides', {
      fields: ['effective_end'],
      name: 'idx_user_ratio_effective_end'
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_ratio_overrides')
  }
}
