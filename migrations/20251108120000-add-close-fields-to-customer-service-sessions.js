/**
 * 数据库迁移：为customer_service_sessions表添加关闭会话相关字段
 *
 * 业务需求（Business Requirement）:
 * - 记录会话关闭原因（close_reason）- 支持服务质量分析和KPI统计
 * - 记录关闭操作人（closed_by）- 支持责任追溯和审计需求
 *
 * 修复问题（Fix Issue）:
 * - 🔴 当前代码尝试写入close_reason和closed_by，但字段不存在导致数据100%丢失
 * - 🔴 无法统计关闭原因分布（问题已解决 vs 恶意会话 vs 重复会话）
 * - 🔴 无法追溯是哪个管理员关闭的会话
 *
 * 迁移内容（Migration Content）:
 * 1. 添加close_reason字段（VARCHAR(500)）- 存储关闭原因描述
 * 2. 添加closed_by字段（INT）- 存储关闭操作的管理员user_id
 * 3. 创建closed_by索引 - 优化按关闭人查询性能
 *
 * 技术说明（Technical Notes）:
 * - 使用snake_case命名（符合项目规范）
 * - 字段允许NULL（历史数据兼容性 - 但新关闭操作必须填写）
 * - 添加详细中文注释（提升可维护性）
 *
 * 创建时间：2025-11-08 12:00:00
 * 版本号：v4.1.0
 * 相关文档：docs/管理员关闭聊天会话实施方案.md
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加字段和索引
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize构造函数
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始迁移：为customer_service_sessions表添加关闭相关字段')

      // 1️⃣ 检查字段是否已存在（防止重复执行）
      const tableDescription = await queryInterface.describeTable('customer_service_sessions')

      // 2️⃣ 添加close_reason字段（如果不存在）
      if (!tableDescription.close_reason) {
        console.log('➕ 添加字段：close_reason (VARCHAR(500))')
        await queryInterface.addColumn(
          'customer_service_sessions',
          'close_reason',
          {
            type: Sequelize.STRING(500),
            allowNull: true, // 允许NULL（历史数据兼容）
            comment: '关闭原因（最长500字符，如：问题已解决、用户未回复、恶意会话等）',
            after: 'closed_at' // 插入到closed_at字段后面
          },
          { transaction }
        )
        console.log('✅ close_reason字段添加成功')
      } else {
        console.log('⏭️  字段已存在：close_reason')
      }

      // 3️⃣ 添加closed_by字段（如果不存在）
      if (!tableDescription.closed_by) {
        console.log('➕ 添加字段：closed_by (INT)')
        await queryInterface.addColumn(
          'customer_service_sessions',
          'closed_by',
          {
            type: Sequelize.INTEGER,
            allowNull: true, // 允许NULL（历史数据兼容）
            comment: '关闭操作人ID（外键关联users表的user_id，记录哪个管理员关闭的会话）',
            after: 'close_reason' // 插入到close_reason字段后面
          },
          { transaction }
        )
        console.log('✅ closed_by字段添加成功')
      } else {
        console.log('⏭️  字段已存在：closed_by')
      }

      // 4️⃣ 创建closed_by索引（优化按关闭人查询性能）
      const indexes = await queryInterface.showIndex('customer_service_sessions')
      const indexExists = indexes.some(index => index.name === 'idx_closed_by')

      if (!indexExists) {
        console.log('➕ 创建索引：idx_closed_by')
        await queryInterface.addIndex(
          'customer_service_sessions',
          ['closed_by'],
          {
            name: 'idx_closed_by',
            transaction
          }
        )
        console.log('✅ 索引创建成功')
      } else {
        console.log('⏭️  索引已存在：idx_closed_by')
      }

      // 5️⃣ 提交事务
      await transaction.commit()
      console.log('✅ 迁移成功：customer_service_sessions表字段添加完成')
      console.log('📊 新增字段：close_reason (VARCHAR 500), closed_by (INT)')
      console.log('📊 新增索引：idx_closed_by')
    } catch (error) {
      // 6️⃣ 回滚事务
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除字段和索引
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize构造函数
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚：删除customer_service_sessions表的关闭相关字段')

      // 1️⃣ 删除索引
      const indexes = await queryInterface.showIndex('customer_service_sessions')
      const indexExists = indexes.some(index => index.name === 'idx_closed_by')

      if (indexExists) {
        console.log('🗑️  删除索引：idx_closed_by')
        await queryInterface.removeIndex('customer_service_sessions', 'idx_closed_by', { transaction })
        console.log('✅ 索引删除成功')
      }

      // 2️⃣ 检查字段是否存在
      const tableDescription = await queryInterface.describeTable('customer_service_sessions')

      // 3️⃣ 删除closed_by字段
      if (tableDescription.closed_by) {
        console.log('🗑️  删除字段：closed_by')
        await queryInterface.removeColumn('customer_service_sessions', 'closed_by', { transaction })
        console.log('✅ closed_by字段删除成功')
      }

      // 4️⃣ 删除close_reason字段
      if (tableDescription.close_reason) {
        console.log('🗑️  删除字段：close_reason')
        await queryInterface.removeColumn('customer_service_sessions', 'close_reason', { transaction })
        console.log('✅ close_reason字段删除成功')
      }

      // 5️⃣ 提交事务
      await transaction.commit()
      console.log('✅ 回滚成功：字段和索引已删除')
    } catch (error) {
      // 6️⃣ 回滚事务
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
