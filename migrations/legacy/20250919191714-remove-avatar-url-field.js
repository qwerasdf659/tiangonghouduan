'use strict'

/**
 * 删除头像相关功能的数据库迁移
 *
 * 这个迁移会执行以下操作：
 * 1. 删除 users 表中的 avatar_url 字段
 * 2. 修改 upload_review 表中的 image_type 枚举，移除 'avatar' 选项
 *
 * 创建时间: 2025-09-19 19:17:14
 * 说明: 根据业务需求，移除用户头像功能
 */

module.exports = {
  /**
   * 应用迁移 - 删除头像相关字段和选项
   */
  async up (queryInterface, Sequelize) {
    console.log('🔄 开始删除头像相关功能...')

    try {
      // 1. 删除 users 表中的 avatar_url 字段
      console.log('删除 users.avatar_url 字段...')
      await queryInterface.removeColumn('users', 'avatar_url')
      console.log('✅ 成功删除 users.avatar_url 字段')

      /*
       * 2. 修改 upload_review 表中的 image_type 枚举
       * 先检查表是否存在
       */
      const uploadReviewTableExists = await queryInterface.tableExists('upload_review')

      if (uploadReviewTableExists) {
        console.log('修改 upload_review.image_type 枚举类型...')

        /*
         * 由于MySQL不能直接修改ENUM，需要分步操作
         * 2.1 添加新的临时字段
         */
        await queryInterface.addColumn('upload_review', 'image_type_new', {
          type: Sequelize.ENUM('photo', 'document', 'other'),
          allowNull: false,
          defaultValue: 'photo',
          comment: '图片类型（移除avatar选项）'
        })

        // 2.2 将现有数据迁移到新字段（avatar类型改为other）
        await queryInterface.sequelize.query(`
          UPDATE upload_review
          SET image_type_new = CASE
            WHEN image_type = 'avatar' THEN 'other'
            ELSE image_type
          END
        `)

        // 2.3 删除旧字段
        await queryInterface.removeColumn('upload_review', 'image_type')

        // 2.4 重命名新字段
        await queryInterface.renameColumn('upload_review', 'image_type_new', 'image_type')

        console.log('✅ 成功修改 upload_review.image_type 枚举类型')
      } else {
        console.log('ℹ️ upload_review 表不存在，跳过枚举类型修改')
      }

      console.log('🎉 头像功能删除完成！')
    } catch (error) {
      console.error('❌ 迁移执行失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移 - 恢复头像相关字段和选项
   */
  async down (queryInterface, Sequelize) {
    console.log('🔄 开始回滚头像功能删除...')

    try {
      // 1. 恢复 users 表中的 avatar_url 字段
      console.log('恢复 users.avatar_url 字段...')
      await queryInterface.addColumn('users', 'avatar_url', {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: '头像URL'
      })
      console.log('✅ 成功恢复 users.avatar_url 字段')

      // 2. 恢复 upload_review 表中的 image_type 枚举
      const uploadReviewTableExists = await queryInterface.tableExists('upload_review')

      if (uploadReviewTableExists) {
        console.log('恢复 upload_review.image_type 枚举类型...')

        // 2.1 添加包含avatar的新枚举字段
        await queryInterface.addColumn('upload_review', 'image_type_restored', {
          type: Sequelize.ENUM('avatar', 'photo', 'document', 'other'),
          allowNull: false,
          defaultValue: 'photo',
          comment: '图片类型'
        })

        // 2.2 将现有数据迁移到新字段
        await queryInterface.sequelize.query(`
          UPDATE upload_review 
          SET image_type_restored = image_type
        `)

        // 2.3 删除旧字段
        await queryInterface.removeColumn('upload_review', 'image_type')

        // 2.4 重命名新字段
        await queryInterface.renameColumn('upload_review', 'image_type_restored', 'image_type')

        console.log('✅ 成功恢复 upload_review.image_type 枚举类型')
      }

      console.log('🎉 头像功能回滚完成！')
    } catch (error) {
      console.error('❌ 回滚执行失败:', error.message)
      throw error
    }
  }
}
