'use strict'

/**
 * 物品模板别名/映射表迁移
 * 职责: 用于来源追溯与兼容（未来对接外部券系统/发码平台时使用）
 *
 * 文档依据: /docs/统一资产域架构设计方案.md
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. 创建 item_template_aliases 表
    await queryInterface.createTable(
      'item_template_aliases',
      {
        // 主键
        alias_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '别名ID（主键）'
        },

        // 模板代码（关联 item_instances.item_type 或未来的 item_templates.template_code）
        template_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '模板代码（关联物品类型）'
        },

        // 别名类型
        alias_type: {
          type: Sequelize.STRING(20),
          allowNull: false,
          comment: '别名类型（legacy=历史编码/source=来源系统/external=外部系统）'
        },

        // 别名值
        alias_value: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '别名值（PRIZE_123/PRODUCT_456/外部系统ID）'
        },

        // 时间戳
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '创建时间'
        }
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '物品模板别名/映射表（用于来源追溯与兼容）'
      }
    )

    // 2. 创建唯一索引（别名类型 + 别名值）
    await queryInterface.addIndex('item_template_aliases', ['alias_type', 'alias_value'], {
      unique: true,
      name: 'uk_alias'
    })

    // 3. 创建模板代码索引
    await queryInterface.addIndex('item_template_aliases', ['template_code'], {
      name: 'idx_template_code'
    })

    console.log('✅ item_template_aliases 表创建成功')
  },

  async down(queryInterface, Sequelize) {
    // 回滚：删除表
    await queryInterface.dropTable('item_template_aliases')
    console.log('✅ item_template_aliases 表已删除')
  }
}
