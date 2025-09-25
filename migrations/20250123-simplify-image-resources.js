'use strict'

module.exports = {
  async up (queryInterface, _Sequelize) {
    // 只移除真正过度设计的字段，保留有价值的缩略图功能

    // 1. 移除多层存储架构字段（过度设计）
    await queryInterface.removeColumn('image_resources', 'storage_layer')

    // 2. 移除CDN URL字段（改用file_path生成URL）
    await queryInterface.removeColumn('image_resources', 'cdn_url')

    // 注意：保留 thumbnail_paths 字段，因为缩略图功能有实际业务价值

    // 3. 移除对应的索引
    try {
      await queryInterface.removeIndex('image_resources', 'idx_storage_layer')
    } catch (error) {
      console.log('索引 idx_storage_layer 不存在或已删除')
    }

    console.log('✅ ImageResources表优化完成，移除过度设计字段但保留缩略图功能')
  },

  async down (queryInterface, Sequelize) {
    // 回滚操作：重新添加字段

    // 1. 重新添加多层存储架构字段
    await queryInterface.addColumn('image_resources', 'storage_layer', {
      type: Sequelize.ENUM('hot', 'standard', 'archive'),
      defaultValue: 'hot',
      allowNull: false,
      comment: '存储层级：热存储/标准存储/归档存储'
    })

    // 2. 重新添加CDN URL字段
    await queryInterface.addColumn('image_resources', 'cdn_url', {
      type: Sequelize.STRING(500),
      allowNull: false,
      comment: 'CDN访问URL',
      defaultValue: '' // 临时默认值
    })

    // 3. 重新创建索引
    await queryInterface.addIndex('image_resources', {
      name: 'idx_storage_layer',
      fields: ['storage_layer', 'created_at']
    })

    console.log('✅ ImageResources表回滚完成，恢复了所有字段')
  }
}
