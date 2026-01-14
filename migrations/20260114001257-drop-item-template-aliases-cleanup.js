'use strict'

/**
 * 迁移双轨兼容残留清理 - 删除 item_template_aliases 表
 *
 * 清理背景：
 * - 该表在 2025-12-28 创建，用于物品模板别名管理
 * - 经检查，表中 0 条记录，代码中无任何调用
 * - 根据 2026-01-13 清理方案决策4：彻底删除
 *
 * 决策依据：
 * - 用户拍板：当前表中 0 条记录，无历史数据
 * - 代码中无任何调用（全局搜索 0 结果）
 * - 直接 DROP TABLE，不可逆
 *
 * @version 4.6.0
 * @date 2026-01-14
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 删除 item_template_aliases 表
    // 注意：此操作不可逆，执行前已确认表中无数据
    await queryInterface.dropTable('item_template_aliases')

    console.log('✅ 已删除 item_template_aliases 表（迁移双轨兼容残留清理）')
  },

  async down(queryInterface, Sequelize) {
    // 回滚：重新创建 item_template_aliases 表
    // 注意：由于决策为不可逆删除，此 down 方法仅用于紧急回滚场景
    await queryInterface.createTable('item_template_aliases', {
      alias_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '别名记录主键'
      },
      template_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '关联的物品模板ID'
      },
      alias_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '别名名称'
      },
      alias_type: {
        type: Sequelize.ENUM('display', 'search', 'legacy'),
        allowNull: false,
        defaultValue: 'display',
        comment: '别名类型'
      },
      is_primary: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否为主要别名'
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
    })

    // 添加索引
    await queryInterface.addIndex('item_template_aliases', ['template_id'], {
      name: 'idx_template_id'
    })
    await queryInterface.addIndex('item_template_aliases', ['alias_name'], {
      name: 'idx_alias_name'
    })
    await queryInterface.addIndex('item_template_aliases', ['template_id', 'is_primary'], {
      name: 'idx_template_primary'
    })

    console.log('⚠️ 已恢复 item_template_aliases 表（紧急回滚）')
  }
}
