'use strict'

/**
 * 数据库迁移：为 product_status 字典添加 inactive 状态映射
 *
 * 问题背景：
 * - ExchangeService.js 中商品状态使用 active/inactive
 * - 字典表中 product_status 只有 active 映射，缺少 inactive
 * - 导致商品状态的中文显示名称无法正确显示
 *
 * 解决方案：
 * - 向 system_dictionaries 表添加 inactive 状态的中文映射
 *
 * @version 4.7.0
 * @date 2026-01-22
 * @description 中文化显示名称系统 - 补充缺失的字典映射
 */

const logger = require('../utils/logger').logger || console

module.exports = {
  /**
   * 执行迁移 - 添加 inactive 商品状态字典映射
   *
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @param {Object} Sequelize - Sequelize 实例
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      logger.info('📝 开始添加 inactive 商品状态字典映射...')

      // 检查 inactive 是否已存在（避免重复插入）
      const [existingRecords] = await queryInterface.sequelize.query(
        `SELECT dict_id FROM system_dictionaries 
         WHERE dict_type = 'product_status' AND dict_code = 'inactive'`,
        { transaction }
      )

      if (existingRecords.length > 0) {
        logger.info('✅ inactive 商品状态字典映射已存在，跳过插入')
        await transaction.commit()
        return
      }

      // 获取当前 product_status 的最大 sort_order
      const [maxSortResult] = await queryInterface.sequelize.query(
        `SELECT MAX(sort_order) as max_sort FROM system_dictionaries 
         WHERE dict_type = 'product_status'`,
        { transaction }
      )
      const nextSortOrder = (maxSortResult[0]?.max_sort || 0) + 1

      // 插入 inactive 状态映射
      await queryInterface.bulkInsert(
        'system_dictionaries',
        [
          {
            dict_type: 'product_status',
            dict_code: 'inactive',
            dict_name: '已下架',
            dict_color: 'bg-secondary',
            sort_order: nextSortOrder,
            is_enabled: true,
            remark: '商品已下架，不再展示',
            version: 1,
            updated_by: null,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      logger.info('✅ 成功添加 inactive 商品状态字典映射')

      // 提交事务
      await transaction.commit()
      logger.info('✅ 迁移完成：product_status.inactive 字典映射已添加')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      logger.error('❌ 迁移失败：', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移 - 删除 inactive 商品状态字典映射
   *
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @param {Object} Sequelize - Sequelize 实例
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      logger.info('🔄 开始回滚 inactive 商品状态字典映射...')

      await queryInterface.bulkDelete(
        'system_dictionaries',
        {
          dict_type: 'product_status',
          dict_code: 'inactive'
        },
        { transaction }
      )

      await transaction.commit()
      logger.info('✅ 回滚完成：product_status.inactive 字典映射已删除')
    } catch (error) {
      await transaction.rollback()
      logger.error('❌ 回滚失败：', error.message)
      throw error
    }
  }
}

