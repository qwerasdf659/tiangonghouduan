'use strict'

/**
 * 迁移：更新 image_resources 表的 file_path 格式
 *
 * @description 架构决策（2026-01-07）
 *   - file_path 仅存储对象 key（如 prizes/xxx.jpg），不存储完整路径或本地路径
 *   - 移除以 "/" 开头的本地路径前缀
 *   - 标记不存在的测试数据为 deleted 状态
 *
 * @version 1.0.0
 * @date 2026-01-08
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. 查询当前所有以 "/" 开头的 file_path 记录
    const [rows] = await queryInterface.sequelize.query(
      'SELECT image_id, file_path FROM image_resources WHERE file_path LIKE "/%"'
    )

    console.log(`找到 ${rows.length} 条以 "/" 开头的 file_path 记录需要更新`)

    // 2. 更新 file_path：移除开头的 "/"
    if (rows.length > 0) {
      await queryInterface.sequelize.query(
        'UPDATE image_resources SET file_path = SUBSTRING(file_path, 2) WHERE file_path LIKE "/%"'
      )
      console.log(`已更新 ${rows.length} 条记录的 file_path 格式`)
    }

    // 3. 将虚拟测试数据（file_size = 1024，source_module = 'system'）标记为 deleted
    const [affected] = await queryInterface.sequelize.query(
      `UPDATE image_resources 
       SET status = 'deleted' 
       WHERE source_module = 'system' 
         AND file_size = 1024 
         AND status = 'active'`
    )
    console.log('已将系统测试数据标记为 deleted 状态')
  },

  async down(queryInterface, Sequelize) {
    // 1. 恢复 file_path 格式：添加 "/" 前缀（仅针对 prizes 等特定目录）
    await queryInterface.sequelize.query(
      `UPDATE image_resources 
       SET file_path = CONCAT('/', file_path) 
       WHERE file_path NOT LIKE '/%' 
         AND file_path NOT LIKE 'http%'`
    )

    // 2. 恢复系统测试数据状态
    await queryInterface.sequelize.query(
      `UPDATE image_resources 
       SET status = 'active' 
       WHERE source_module = 'system' 
         AND file_size = 1024 
         AND status = 'deleted'`
    )
  }
}
