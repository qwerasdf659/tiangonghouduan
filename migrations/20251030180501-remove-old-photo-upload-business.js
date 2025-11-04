/**
 * 数据库迁移：删除旧的拍照上传业务逻辑相关字段
 *
 * @description 清理image_resources表中与旧拍照上传审核业务相关的字段和数据
 * @created 2025-10-30 18:05 北京时间
 * @author AI Assistant (Claude 4 Sonnet)
 *
 * 变更内容：
 * 1. 删除 is_upload_review 字段
 * 2. 修改 source_module 枚举，移除 'user_upload' 值
 * 3. 删除 source_module='user_upload' 的旧数据
 *
 * ⚠️ 注意：此操作不可逆，执行前请确保已备份数据库！
 */

'use strict'

module.exports = {
  /**
   * 升级操作：清理旧的拍照上传业务数据
   */
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始清理旧的拍照上传业务逻辑...')

      // 1️⃣ 删除 source_module='user_upload' 的旧数据（如果不需要保留）
      console.log('📊 检查 source_module=user_upload 的数据数量...')
      const [oldDataCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM image_resources WHERE source_module=\'user_upload\'',
        { transaction }
      )
      console.log(`📋 发现 ${oldDataCount[0].count} 条旧数据`)

      if (oldDataCount[0].count > 0) {
        console.log('🗑️ 删除 source_module=user_upload 的旧数据...')
        await queryInterface.sequelize.query(
          'DELETE FROM image_resources WHERE source_module=\'user_upload\'',
          { transaction }
        )
        console.log(`✅ 已删除 ${oldDataCount[0].count} 条旧数据`)
      }

      // 2️⃣ 删除 is_upload_review 字段（如果存在）
      console.log('🔄 检查 is_upload_review 字段是否存在...')
      const [columns] = await queryInterface.sequelize.query(
        'SHOW COLUMNS FROM image_resources LIKE \'is_upload_review\'',
        { transaction }
      )

      if (columns.length > 0) {
        console.log('🗑️ 删除 is_upload_review 字段...')
        await queryInterface.removeColumn('image_resources', 'is_upload_review', { transaction })
        console.log('✅ is_upload_review 字段已删除')
      } else {
        console.log('ℹ️ is_upload_review 字段不存在，跳过删除')
      }

      // 3️⃣ 修改 source_module 枚举，移除 'user_upload' 值
      console.log('🔄 修改 source_module 枚举值...')
      await queryInterface.sequelize.query(
        `
        ALTER TABLE image_resources 
        MODIFY COLUMN source_module 
        ENUM('system', 'lottery', 'exchange', 'admin') 
        NOT NULL DEFAULT 'system' 
        COMMENT '来源模块：系统/抽奖/兑换/管理员'
        `,
        { transaction }
      )
      console.log('✅ source_module 枚举已更新（已移除 \'user_upload\'）')

      // 4️⃣ 提交事务
      await transaction.commit()
      console.log('✅ 旧拍照上传业务逻辑清理完成！')
      console.log('📊 清理总结：')
      console.log(`   - 删除旧数据：${oldDataCount[0].count} 条`)
      console.log('   - 删除字段：is_upload_review')
      console.log('   - 更新枚举：source_module（移除 \'user_upload\'）')
    } catch (error) {
      // 5️⃣ 出错回滚
      await transaction.rollback()
      console.error('❌ 清理失败，已回滚所有操作:', error.message)
      throw error
    }
  },

  /**
   * 降级操作：恢复旧的拍照上传业务字段（不恢复数据）
   */
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始恢复旧的拍照上传业务字段...')

      // 1️⃣ 恢复 source_module 枚举
      console.log('🔄 恢复 source_module 枚举（添加回 \'user_upload\'）...')
      await queryInterface.sequelize.query(
        `
        ALTER TABLE image_resources 
        MODIFY COLUMN source_module 
        ENUM('system', 'lottery', 'exchange', 'user_upload', 'admin') 
        NOT NULL DEFAULT 'system' 
        COMMENT '来源模块'
        `,
        { transaction }
      )
      console.log('✅ source_module 枚举已恢复（添加回 \'user_upload\'）')

      // 2️⃣ 恢复 is_upload_review 字段
      console.log('🔄 恢复 is_upload_review 字段...')
      await queryInterface.addColumn(
        'image_resources',
        'is_upload_review',
        {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          allowNull: false,
          comment: '是否为上传审核资源'
        },
        { transaction }
      )
      console.log('✅ is_upload_review 字段已恢复')

      // 3️⃣ 提交事务
      await transaction.commit()
      console.log('✅ 字段恢复完成！')
      console.log('⚠️ 注意：旧数据未恢复，如需恢复数据请从备份中还原')
    } catch (error) {
      // 4️⃣ 出错回滚
      await transaction.rollback()
      console.error('❌ 恢复失败，已回滚所有操作:', error.message)
      throw error
    }
  }
}
