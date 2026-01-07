'use strict'

/**
 * 迁移：为 exchange_items 表添加 primary_image_id 字段
 *
 * @description 架构决策（2026-01-07）
 *   - exchange_items 改用 primary_image_id 关联 image_resources 表
 *   - 弃用 image_url 字段（保留用于兼容过渡，后续迁移删除）
 *   - 图片通过 image_resources 统一管理
 *
 * @version 1.0.0
 * @date 2026-01-08
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. 检查 primary_image_id 字段是否已存在
    const [columns] = await queryInterface.sequelize.query('DESCRIBE exchange_items')
    const hasColumn = columns.some(col => col.Field === 'primary_image_id')

    if (hasColumn) {
      console.log('primary_image_id 字段已存在，跳过创建')
      return
    }

    // 2. 添加 primary_image_id 字段（外键关联 image_resources）
    // 注意：image_resources.image_id 是 INT 类型，这里必须使用 INTEGER 保持一致
    await queryInterface.addColumn('exchange_items', 'primary_image_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: '主图片ID，关联 image_resources.image_id',
      after: 'image_url' // 放在 image_url 字段后面
    })

    console.log('已添加 primary_image_id 字段到 exchange_items 表')

    // 3. 添加外键约束
    await queryInterface.addConstraint('exchange_items', {
      fields: ['primary_image_id'],
      type: 'foreign key',
      name: 'fk_exchange_items_primary_image',
      references: {
        table: 'image_resources',
        field: 'image_id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    })

    console.log('已添加外键约束 fk_exchange_items_primary_image')

    // 4. 添加索引
    await queryInterface.addIndex('exchange_items', ['primary_image_id'], {
      name: 'idx_exchange_items_primary_image_id'
    })

    console.log('已添加索引 idx_exchange_items_primary_image_id')
  },

  async down(queryInterface, Sequelize) {
    // 1. 移除外键约束
    await queryInterface
      .removeConstraint('exchange_items', 'fk_exchange_items_primary_image')
      .catch(e => {
        console.log('外键约束不存在，跳过删除:', e.message)
      })

    // 2. 移除索引
    await queryInterface
      .removeIndex('exchange_items', 'idx_exchange_items_primary_image_id')
      .catch(e => {
        console.log('索引不存在，跳过删除:', e.message)
      })

    // 3. 移除字段
    await queryInterface.removeColumn('exchange_items', 'primary_image_id')

    console.log('已移除 primary_image_id 字段')
  }
}
