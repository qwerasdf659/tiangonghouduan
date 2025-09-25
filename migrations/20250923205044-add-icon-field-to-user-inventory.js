/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 * 添加 icon 字段到 user_inventory 表
 *
 * 业务价值：
 * - 提升用户体验的视觉识别效率
 * - 支持物品分类的图标化展示
 * - 增强界面美观度和专业感
 *
 * 创建时间：2025年01月21日
 * 使用 Claude Sonnet 4 模型
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始添加 icon 字段到 user_inventory 表...')

    try {
      // 检查字段是否已存在
      const tableDescription = await queryInterface.describeTable('user_inventory')

      if (tableDescription.icon) {
        console.log('⚠️ icon 字段已存在，跳过添加')
        return
      }

      // 添加 icon 字段
      await queryInterface.addColumn('user_inventory', 'icon', {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: '显示图标（用于UI展示的emoji或图标标识）',
        after: 'description' // 放在 description 字段后面
      })

      console.log('✅ 成功添加 icon 字段到 user_inventory 表')

      // 为已存在的记录设置默认图标
      await queryInterface.sequelize.query(`
        UPDATE user_inventory 
        SET icon = CASE 
          WHEN type = 'voucher' THEN '🎫'
          WHEN type = 'product' THEN '🎁'  
          WHEN type = 'service' THEN '🔧'
          ELSE '📦'
        END 
        WHERE icon IS NULL
      `)

      console.log('✅ 为已存在记录设置了默认图标')
    } catch (error) {
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚 icon 字段...')

    try {
      // 检查字段是否存在
      const tableDescription = await queryInterface.describeTable('user_inventory')

      if (!tableDescription.icon) {
        console.log('⚠️ icon 字段不存在，跳过删除')
        return
      }

      // 删除 icon 字段
      await queryInterface.removeColumn('user_inventory', 'icon')

      console.log('✅ 成功删除 icon 字段')
    } catch (error) {
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
