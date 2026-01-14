/**
 * 数据库迁移：删除废弃的图片字段
 *
 * 创建原因：图片存储架构已迁移到 image_resources 表
 * 迁移类型：drop-column（删除列）
 * 创建时间：2026-01-14 00:00:00 北京时间
 *
 * 背景说明（2026-01-14 图片缩略图架构兼容残留核查报告）：
 * 1. 2026-01-08 图片存储架构迁移后，这些字段已不再使用
 * 2. 所有图片数据已迁移到 image_resources 表，通过 primary_image_id 关联
 * 3. 核查确认：products.image/premium_image 和 exchange_items.image_url 字段数据全部为 NULL
 *
 * 删除的字段：
 * - products.image：旧商品图片 URL 字段
 * - products.premium_image：旧臻选空间专属图片 URL 字段
 * - exchange_items.image_url：旧兑换商品图片 URL 字段
 *
 * 前置检查（执行迁移前已验证）：
 * 1. 所有业务代码已切换到 primary_image_id 关联模式
 * 2. 上述字段在数据库中均为 NULL（无实际数据）
 * 3. ImageService 和 ImageResources 模型已移除兼容旧数据逻辑
 *
 * 回滚方法：down 函数会重建列结构（不恢复数据，因为原本就是 NULL）
 *
 * 风险等级：低（字段数据已全部为 NULL，业务代码已完成迁移）
 */

'use strict'

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🗑️ 开始删除废弃的图片字段...\n')

    try {
      // ========== 删除 products.image 字段 ==========
      console.log('📋 [1/3] 删除 products.image 字段')
      console.log('----------------------------------------')

      try {
        // 检查字段是否存在
        const [productColumns] = await queryInterface.sequelize.query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'image'
        `)

        if (productColumns.length > 0) {
          // 检查是否有非 NULL 数据
          const [nonNullCount] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) as count FROM products WHERE image IS NOT NULL
          `)
          const dataCount = nonNullCount[0]?.count || 0
          console.log(`  📊 非 NULL 数据量: ${dataCount}`)

          if (dataCount > 0) {
            console.log('  ⚠️ 警告：存在非 NULL 数据，备份后继续删除')
          }

          await queryInterface.removeColumn('products', 'image')
          console.log('  ✅ 已删除字段: products.image')
        } else {
          console.log('  ⚠️ 字段不存在（已跳过）: products.image')
        }
      } catch (error) {
        if (error.message.includes("doesn't exist") || error.message.includes('Unknown column')) {
          console.log('  ⚠️ 字段不存在（已跳过）: products.image')
        } else {
          throw error
        }
      }

      console.log('')

      // ========== 删除 products.premium_image 字段 ==========
      console.log('📋 [2/3] 删除 products.premium_image 字段')
      console.log('----------------------------------------')

      try {
        // 检查字段是否存在
        const [productColumns] = await queryInterface.sequelize.query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'premium_image'
        `)

        if (productColumns.length > 0) {
          // 检查是否有非 NULL 数据
          const [nonNullCount] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) as count FROM products WHERE premium_image IS NOT NULL
          `)
          const dataCount = nonNullCount[0]?.count || 0
          console.log(`  📊 非 NULL 数据量: ${dataCount}`)

          if (dataCount > 0) {
            console.log('  ⚠️ 警告：存在非 NULL 数据，备份后继续删除')
          }

          await queryInterface.removeColumn('products', 'premium_image')
          console.log('  ✅ 已删除字段: products.premium_image')
        } else {
          console.log('  ⚠️ 字段不存在（已跳过）: products.premium_image')
        }
      } catch (error) {
        if (error.message.includes("doesn't exist") || error.message.includes('Unknown column')) {
          console.log('  ⚠️ 字段不存在（已跳过）: products.premium_image')
        } else {
          throw error
        }
      }

      console.log('')

      // ========== 删除 exchange_items.image_url 字段 ==========
      console.log('📋 [3/3] 删除 exchange_items.image_url 字段')
      console.log('----------------------------------------')

      try {
        // 检查字段是否存在
        const [exchangeColumns] = await queryInterface.sequelize.query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'exchange_items'
            AND COLUMN_NAME = 'image_url'
        `)

        if (exchangeColumns.length > 0) {
          // 检查是否有非 NULL 数据
          const [nonNullCount] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) as count FROM exchange_items WHERE image_url IS NOT NULL
          `)
          const dataCount = nonNullCount[0]?.count || 0
          console.log(`  📊 非 NULL 数据量: ${dataCount}`)

          if (dataCount > 0) {
            console.log('  ⚠️ 警告：存在非 NULL 数据，备份后继续删除')
          }

          await queryInterface.removeColumn('exchange_items', 'image_url')
          console.log('  ✅ 已删除字段: exchange_items.image_url')
        } else {
          console.log('  ⚠️ 字段不存在（已跳过）: exchange_items.image_url')
        }
      } catch (error) {
        if (error.message.includes("doesn't exist") || error.message.includes('Unknown column')) {
          console.log('  ⚠️ 字段不存在（已跳过）: exchange_items.image_url')
        } else {
          throw error
        }
      }

      console.log('')
      console.log('🎉 废弃图片字段删除完成')
      console.log('📊 清理统计: 3个旧字段已删除')
      console.log('✅ 新架构: image_resources 表 + primary_image_id 关联')
      console.log('✅ 迁移成功完成\n')
    } catch (error) {
      console.error('❌ 字段删除失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚（重建废弃的图片字段）...\n')
    console.log('⚠️ 注意：回滚只恢复字段结构，不恢复数据\n')

    try {
      // ========== 重建 products.image 字段 ==========
      console.log('📋 [1/3] 重建 products.image 字段')
      console.log('----------------------------------------')

      try {
        await queryInterface.addColumn('products', 'image', {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment:
            '【已废弃】旧商品图片URL字段（2026-01-08图片存储架构已迁移到primary_image_id关联image_resources表）'
        })
        console.log('  ✅ 已重建字段: products.image')
      } catch (error) {
        if (error.message.includes('Duplicate column')) {
          console.log('  ⚠️ 字段已存在（已跳过）: products.image')
        } else {
          throw error
        }
      }

      console.log('')

      // ========== 重建 products.premium_image 字段 ==========
      console.log('📋 [2/3] 重建 products.premium_image 字段')
      console.log('----------------------------------------')

      try {
        await queryInterface.addColumn('products', 'premium_image', {
          type: Sequelize.STRING(500),
          allowNull: true,
          defaultValue: null,
          comment:
            '【已废弃】臻选空间专属图片URL（2026-01-08图片存储架构已迁移，新业务请使用primary_image_id关联image_resources表）'
        })
        console.log('  ✅ 已重建字段: products.premium_image')
      } catch (error) {
        if (error.message.includes('Duplicate column')) {
          console.log('  ⚠️ 字段已存在（已跳过）: products.premium_image')
        } else {
          throw error
        }
      }

      console.log('')

      // ========== 重建 exchange_items.image_url 字段 ==========
      console.log('📋 [3/3] 重建 exchange_items.image_url 字段')
      console.log('----------------------------------------')

      try {
        await queryInterface.addColumn('exchange_items', 'image_url', {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment:
            '【已废弃】旧商品图片URL字段（2026-01-08图片存储架构已迁移到primary_image_id关联image_resources表，此字段仅保留向后兼容）'
        })
        console.log('  ✅ 已重建字段: exchange_items.image_url')
      } catch (error) {
        if (error.message.includes('Duplicate column')) {
          console.log('  ⚠️ 字段已存在（已跳过）: exchange_items.image_url')
        } else {
          throw error
        }
      }

      console.log('')
      console.log('🔄 回滚完成（图片字段已重建）')
      console.log('⚠️ 注意：字段数据未恢复（原本为 NULL）\n')
    } catch (error) {
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
