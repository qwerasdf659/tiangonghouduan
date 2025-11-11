/**
 * 添加feedbacks表性能优化索引
 *
 * @description 为feedbacks表添加缺失的性能索引，提升"获取我的反馈列表"API查询性能
 * @issue 数据库中缺失模型定义的索引，导致查询性能低下
 * @related_api GET /api/v4/system/feedback/my
 * @version 4.0.0
 * @date 2025-11-09 20:20:00 北京时间
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始为feedbacks表添加性能索引...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查索引是否已存在（避免重复创建）
      const [existingIndexes] = await queryInterface.sequelize.query(
        'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'feedbacks\'',
        { transaction }
      )

      const indexNames = existingIndexes.map(idx => idx.INDEX_NAME)

      // 1. 添加核心查询索引：user_id + status（支持"获取我的反馈列表"API）
      if (!indexNames.includes('idx_feedbacks_user_status')) {
        console.log('  📋 创建索引: idx_feedbacks_user_status (user_id, status)')
        await queryInterface.addIndex(
          'feedbacks',
          ['user_id', 'status'],
          {
            name: 'idx_feedbacks_user_status',
            transaction
          }
        )
        console.log('  ✅ 索引idx_feedbacks_user_status创建成功')
      } else {
        console.log('  ⏭️  索引idx_feedbacks_user_status已存在，跳过')
      }

      // 2. 添加分类+优先级索引（支持管理员按分类和优先级筛选）
      if (!indexNames.includes('idx_feedbacks_category_priority')) {
        console.log('  📋 创建索引: idx_feedbacks_category_priority (category, priority)')
        await queryInterface.addIndex(
          'feedbacks',
          ['category', 'priority'],
          {
            name: 'idx_feedbacks_category_priority',
            transaction
          }
        )
        console.log('  ✅ 索引idx_feedbacks_category_priority创建成功')
      } else {
        console.log('  ⏭️  索引idx_feedbacks_category_priority已存在，跳过')
      }

      // 3. 添加状态+创建时间索引（支持按状态和时间排序查询）
      if (!indexNames.includes('idx_feedbacks_status_created')) {
        console.log('  📋 创建索引: idx_feedbacks_status_created (status, created_at)')
        await queryInterface.addIndex(
          'feedbacks',
          ['status', 'created_at'],
          {
            name: 'idx_feedbacks_status_created',
            transaction
          }
        )
        console.log('  ✅ 索引idx_feedbacks_status_created创建成功')
      } else {
        console.log('  ⏭️  索引idx_feedbacks_status_created已存在，跳过')
      }

      // 4. 添加管理员ID索引（支持按管理员查询已处理反馈）
      if (!indexNames.includes('idx_feedbacks_admin_id')) {
        console.log('  📋 创建索引: idx_feedbacks_admin_id (admin_id)')
        await queryInterface.addIndex(
          'feedbacks',
          ['admin_id'],
          {
            name: 'idx_feedbacks_admin_id',
            transaction
          }
        )
        console.log('  ✅ 索引idx_feedbacks_admin_id创建成功')
      } else {
        console.log('  ⏭️  索引idx_feedbacks_admin_id已存在，跳过')
      }

      await transaction.commit()

      console.log('✅ feedbacks表性能索引添加完成')
      console.log('')
      console.log('📊 性能提升预期:')
      console.log('   - 用户查询个人反馈列表: 提升80%+（使用idx_feedbacks_user_status）')
      console.log('   - 管理员按分类筛选: 提升60%+（使用idx_feedbacks_category_priority）')
      console.log('   - 按状态和时间查询: 提升70%+（使用idx_feedbacks_status_created）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 添加索引失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🗑️  开始删除feedbacks表性能索引...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 按照创建的逆序删除索引
      const indexesToDrop = [
        'idx_feedbacks_admin_id',
        'idx_feedbacks_status_created',
        'idx_feedbacks_category_priority',
        'idx_feedbacks_user_status'
      ]

      for (const indexName of indexesToDrop) {
        try {
          console.log(`  🗑️  删除索引: ${indexName}`)
          await queryInterface.removeIndex('feedbacks', indexName, { transaction })
          console.log(`  ✅ 索引${indexName}删除成功`)
        } catch (error) {
          if (error.message.includes('check that column/key exists')) {
            console.log(`  ⏭️  索引${indexName}不存在，跳过`)
          } else {
            throw error
          }
        }
      }

      await transaction.commit()
      console.log('✅ feedbacks表性能索引删除完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 删除索引失败:', error.message)
      throw error
    }
  }
}
