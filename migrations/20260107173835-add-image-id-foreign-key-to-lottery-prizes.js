'use strict'

/**
 * 迁移：为 lottery_prizes 表的 image_id 添加外键约束
 *
 * @description 架构决策（2026-01-07）
 *   - lottery_prizes.image_id 关联 image_resources.image_id
 *   - 统一图片管理，奖品图片通过 image_resources 表存储
 *
 * @version 1.0.0
 * @date 2026-01-08
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. 检查外键是否已存在
    const [fks] = await queryInterface.sequelize.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
       WHERE TABLE_SCHEMA = '${process.env.DB_NAME || 'restaurant_points_dev'}' 
       AND TABLE_NAME = 'lottery_prizes' 
       AND COLUMN_NAME = 'image_id'
       AND REFERENCED_TABLE_NAME IS NOT NULL`
    )

    if (fks.length > 0) {
      console.log('image_id 外键已存在，跳过创建')
      return
    }

    // 2. 添加外键约束
    await queryInterface.addConstraint('lottery_prizes', {
      fields: ['image_id'],
      type: 'foreign key',
      name: 'fk_lottery_prizes_image',
      references: {
        table: 'image_resources',
        field: 'image_id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    })

    console.log('已添加外键约束 fk_lottery_prizes_image')

    // 3. 添加索引（如果不存在）
    const [indexes] = await queryInterface.sequelize.query(
      `SHOW INDEX FROM lottery_prizes WHERE Column_name = 'image_id'`
    )

    if (indexes.length === 0) {
      await queryInterface.addIndex('lottery_prizes', ['image_id'], {
        name: 'idx_lottery_prizes_image_id'
      })
      console.log('已添加索引 idx_lottery_prizes_image_id')
    } else {
      console.log('image_id 索引已存在，跳过创建')
    }
  },

  async down(queryInterface, Sequelize) {
    // 移除外键约束
    await queryInterface.removeConstraint('lottery_prizes', 'fk_lottery_prizes_image').catch(e => {
      console.log('外键约束不存在，跳过删除:', e.message)
    })

    // 移除索引
    await queryInterface.removeIndex('lottery_prizes', 'idx_lottery_prizes_image_id').catch(e => {
      console.log('索引不存在，跳过删除:', e.message)
    })

    console.log('已移除 image_id 外键约束和索引')
  }
}
