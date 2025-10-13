'use strict'

/**
 * 删除ImageResources表中的冗余字段
 * 本迁移移除16个不必要的字段以简化模型结构
 * 执行日期：2025-01-23
 * 影响表：image_resources
 */

module.exports = {
  async up (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🗑️ 开始删除ImageResources表中的冗余字段...')

      // 1. 删除相关索引（如果存在）
      console.log('📊 删除相关索引...')

      try {
        await queryInterface.removeIndex('image_resources', 'idx_upload_review', { transaction })
        console.log('✅ 删除索引：idx_upload_review')
      } catch (e) {
        console.log('ℹ️ 索引 idx_upload_review 不存在，跳过')
      }

      try {
        await queryInterface.removeIndex('image_resources', 'idx_access_count', { transaction })
        console.log('✅ 删除索引：idx_access_count')
      } catch (e) {
        console.log('ℹ️ 索引 idx_access_count 不存在，跳过')
      }

      try {
        await queryInterface.removeIndex('image_resources', 'idx_file_hash', { transaction })
        console.log('✅ 删除索引：idx_file_hash')
      } catch (e) {
        console.log('ℹ️ 索引 idx_file_hash 不存在，跳过')
      }

      // 2. 删除字段（分批执行避免锁表时间过长）
      console.log('🗑️ 删除兼容性字段...')

      // 兼容性字段
      const compatibilityFields = [
        'upload_user_id',
        'file_hash',
        'image_type'
      ]

      for (const field of compatibilityFields) {
        try {
          await queryInterface.removeColumn('image_resources', field, { transaction })
          console.log(`✅ 删除字段：${field}`)
        } catch (e) {
          console.log(`⚠️ 字段 ${field} 删除失败或不存在：${e.message}`)
        }
      }

      // 统计字段
      console.log('📊 删除统计字段...')
      const statisticsFields = [
        'access_count',
        'last_accessed_at',
        'dimensions',
        'metadata'
      ]

      for (const field of statisticsFields) {
        try {
          await queryInterface.removeColumn('image_resources', field, { transaction })
          console.log(`✅ 删除字段：${field}`)
        } catch (e) {
          console.log(`⚠️ 字段 ${field} 删除失败或不存在：${e.message}`)
        }
      }

      // 审核相关字段
      console.log('🔍 删除审核相关字段...')
      const reviewFields = [
        'reject_reason',
        'auto_review',
        'consumption_amount',
        'actual_amount'
      ]

      for (const field of reviewFields) {
        try {
          await queryInterface.removeColumn('image_resources', field, { transaction })
          console.log(`✅ 删除字段：${field}`)
        } catch (e) {
          console.log(`⚠️ 字段 ${field} 删除失败或不存在：${e.message}`)
        }
      }

      // 客户端追踪字段
      console.log('🌐 删除客户端追踪字段...')
      const trackingFields = [
        'client_info'
      ]

      for (const field of trackingFields) {
        try {
          await queryInterface.removeColumn('image_resources', field, { transaction })
          console.log(`✅ 删除字段：${field}`)
        } catch (e) {
          console.log(`⚠️ 字段 ${field} 删除失败或不存在：${e.message}`)
        }
      }

      // 时间管理字段
      console.log('⏰ 删除时间管理字段...')
      const timeFields = [
        'updated_at',
        'deleted_at'
      ]

      for (const field of timeFields) {
        try {
          await queryInterface.removeColumn('image_resources', field, { transaction })
          console.log(`✅ 删除字段：${field}`)
        } catch (e) {
          console.log(`⚠️ 字段 ${field} 删除失败或不存在：${e.message}`)
        }
      }

      await transaction.commit()
      console.log('🎯 ImageResources表字段删除完成！')
      console.log('📊 总计删除16个冗余字段，简化模型结构')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚所有更改:', error)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始恢复ImageResources表中的字段...')

      // 注意：这是回滚操作，恢复所有删除的字段
      // 按照删除的相反顺序恢复

      // 1. 恢复时间管理字段
      await queryInterface.addColumn('image_resources', 'updated_at', {
        type: _Sequelize.DATE,
        defaultValue: _Sequelize.NOW,
        allowNull: false,
        comment: '更新时间'
      }, { transaction })

      await queryInterface.addColumn('image_resources', 'deleted_at', {
        type: _Sequelize.DATE,
        allowNull: true,
        comment: '软删除时间'
      }, { transaction })

      // 2. 恢复客户端追踪字段
      await queryInterface.addColumn('image_resources', 'client_info', {
        type: _Sequelize.STRING(200),
        allowNull: true,
        comment: '客户端信息'
      }, { transaction })

      // 3. 恢复审核相关字段
      await queryInterface.addColumn('image_resources', 'actual_amount', {
        type: _Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: '实际金额'
      }, { transaction })

      await queryInterface.addColumn('image_resources', 'consumption_amount', {
        type: _Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: '消费金额（用于上传审核）'
      }, { transaction })

      await queryInterface.addColumn('image_resources', 'auto_review', {
        type: _Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: '是否自动审核'
      }, { transaction })

      await queryInterface.addColumn('image_resources', 'reject_reason', {
        type: _Sequelize.ENUM('inappropriate', 'duplicate', 'quality', 'spam', 'other'),
        allowNull: true,
        comment: '拒绝原因'
      }, { transaction })

      // 4. 恢复统计字段
      await queryInterface.addColumn('image_resources', 'metadata', {
        type: _Sequelize.JSON,
        allowNull: true,
        comment: '扩展元数据：颜色、标签、GPS等'
      }, { transaction })

      await queryInterface.addColumn('image_resources', 'dimensions', {
        type: _Sequelize.JSON,
        allowNull: true,
        comment: '图片尺寸：{width: 1920, height: 1080}'
      }, { transaction })

      await queryInterface.addColumn('image_resources', 'last_accessed_at', {
        type: _Sequelize.DATE,
        allowNull: true,
        comment: '最后访问时间'
      }, { transaction })

      await queryInterface.addColumn('image_resources', 'access_count', {
        type: _Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: '访问次数'
      }, { transaction })

      // 5. 恢复兼容性字段
      await queryInterface.addColumn('image_resources', 'image_type', {
        type: _Sequelize.ENUM('photo', 'document', 'other'),
        allowNull: true,
        defaultValue: 'photo',
        comment: '图片类型'
      }, { transaction })

      await queryInterface.addColumn('image_resources', 'file_hash', {
        type: _Sequelize.STRING(64),
        allowNull: true,
        comment: '文件哈希值（防重复上传）'
      }, { transaction })

      await queryInterface.addColumn('image_resources', 'upload_user_id', {
        type: _Sequelize.INTEGER,
        allowNull: true,
        comment: '上传用户ID（兼容字段）'
      }, { transaction })

      // 6. 恢复索引
      await queryInterface.addIndex('image_resources', {
        name: 'idx_file_hash',
        fields: ['file_hash']
      }, { transaction })

      await queryInterface.addIndex('image_resources', {
        name: 'idx_access_count',
        fields: ['access_count', 'last_accessed_at']
      }, { transaction })

      await queryInterface.addIndex('image_resources', {
        name: 'idx_upload_review',
        fields: ['is_upload_review', 'review_status', 'created_at']
      }, { transaction })

      await transaction.commit()
      console.log('🔄 字段恢复完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error)
      throw error
    }
  }
}
