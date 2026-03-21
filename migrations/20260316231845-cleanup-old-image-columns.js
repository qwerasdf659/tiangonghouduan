'use strict'

/**
 * Phase 4: 清理旧图片相关列与旧图片资源表
 *
 * 本迁移在 media_files/media_attachments 体系就绪后，删除已废弃的旧图片字段：
 * 1. 删除引用旧图片资源表的外键列（primary_image_id, image_resource_id, image_id）
 * 2. 删除直接存储 object key/URL 的 VARCHAR 列（image_url, icon_url, banner_image_url 等）
 * 3. 删除旧图片资源表
 *
 * 设计为幂等执行：每步操作前先检查，避免重复执行报错。
 * 注意：不删除 users.avatar_url 和 merchants.logo_url（决策9）。
 *
 * @version 1.0.0
 * @date 2026-03-16
 */

async function columnExists(queryInterface, table, column) {
  const [cols] = await queryInterface.sequelize.query(
    `SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`
  )
  return cols.length > 0
}

async function tableExists(queryInterface, table) {
  const [tables] = await queryInterface.sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'`
  )
  return tables.length > 0
}

async function constraintExists(queryInterface, table, constraintName) {
  const [constraints] = await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'
     AND CONSTRAINT_NAME = '${constraintName}'`
  )
  return constraints.length > 0
}

/** 动态获取引用旧图片资源表的所有外键约束名 */
async function getImageResourceFkConstraints(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT TABLE_NAME, CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND REFERENCED_TABLE_NAME = 'image_resources'
     ORDER BY TABLE_NAME`
  )
  return rows
}

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('[cleanup-old-image-columns] 开始清理旧图片列与旧图片资源表...')

    // ========================================
    // 第一部分：删除引用旧图片资源表的外键约束和列
    // 必须先删外键再删列，否则 MySQL 报错
    // ========================================

    const fkToDrop = [
      { table: 'exchange_items', column: 'primary_image_id', constraint: 'fk_exchange_items_primary_image' },
      { table: 'lottery_prizes', column: 'image_resource_id', constraint: 'fk_lottery_prizes_image' },
      { table: 'item_templates', column: 'image_resource_id', constraint: 'item_templates_image_resource_id_foreign_idx' },
      { table: 'exchange_item_skus', column: 'image_id', constraint: null } // 约束名可能为 exchange_item_skus_ibfk_2 等，动态查询
    ]

    for (const { table, column, constraint } of fkToDrop) {
      if (!(await columnExists(queryInterface, table, column))) {
        console.log(`  ⏭️ ${table}.${column} 不存在，跳过`)
        continue
      }

      let constraintName = constraint
      if (!constraintName) {
        const [refs] = await queryInterface.sequelize.query(
          `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'
             AND COLUMN_NAME = '${column}' AND REFERENCED_TABLE_NAME IS NOT NULL`
        )
        constraintName = refs[0]?.CONSTRAINT_NAME
      }

      if (constraintName && (await constraintExists(queryInterface, table, constraintName))) {
        await queryInterface.removeConstraint(table, constraintName)
        console.log(`  ✅ 已移除约束 ${table}.${constraintName}`)
      }

      await queryInterface.removeColumn(table, column)
      console.log(`  ✅ 已删除列 ${table}.${column}`)
    }

    // ========================================
    // 第二部分：删除无外键的旧图片 URL 列
    // ========================================

    const urlColumnsToDrop = [
      { table: 'ad_creatives', columns: ['image_url', 'image_width', 'image_height'] },
      { table: 'category_defs', columns: ['icon_url'] },
      { table: 'material_asset_types', columns: ['icon_url'] },
      { table: 'lottery_campaigns', columns: ['banner_image_url', 'background_image_url'] }
    ]

    for (const { table, columns } of urlColumnsToDrop) {
      for (const column of columns) {
        if (await columnExists(queryInterface, table, column)) {
          await queryInterface.removeColumn(table, column)
          console.log(`  ✅ 已删除列 ${table}.${column}`)
        } else {
          console.log(`  ⏭️ ${table}.${column} 不存在，跳过`)
        }
      }
    }

    // ========================================
    // 第三部分：删除旧图片资源表
    // 需先删除所有引用该表的外键（含该表自身被引用，以及该表指向 users 的用户外键）
    // ========================================

    if (await tableExists(queryInterface, 'image_resources')) {
      // 再次检查是否有遗漏的外键引用该表
      const refs = await getImageResourceFkConstraints(queryInterface)
      for (const r of refs) {
        if (await constraintExists(queryInterface, r.TABLE_NAME, r.CONSTRAINT_NAME)) {
          await queryInterface.removeConstraint(r.TABLE_NAME, r.CONSTRAINT_NAME)
          console.log(`  ✅ 已移除引用旧图片资源表的约束 ${r.TABLE_NAME}.${r.CONSTRAINT_NAME}`)
        }
      }

      // 旧图片资源表自身有指向 users 的外键，删除表时 MySQL 会一并删除
      await queryInterface.dropTable('image_resources')
      console.log('  ✅ 已删除旧图片资源表')
    } else {
      console.log('  ⏭️ 旧图片资源表不存在，跳过')
    }

    console.log('[cleanup-old-image-columns] 迁移完成')
  },

  async down(queryInterface, Sequelize) {
    console.log('[cleanup-old-image-columns] 回滚：恢复旧图片列（无数据恢复，项目未上线）')

    // ========================================
    // 1. 重建旧图片资源表
    // ========================================
    if (!(await tableExists(queryInterface, 'image_resources'))) {
      await queryInterface.sequelize.query(`
        CREATE TABLE \`image_resources\` (
          \`image_resource_id\` int NOT NULL AUTO_INCREMENT,
          \`business_type\` enum('lottery','exchange','trade','uploads') COLLATE utf8mb4_unicode_ci NOT NULL,
          \`category\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
          \`context_id\` int NOT NULL,
          \`upload_id\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
          \`file_path\` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
          \`thumbnail_paths\` json DEFAULT NULL,
          \`mime_type\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
          \`file_size\` int unsigned DEFAULT NULL,
          \`status\` enum('pending','active','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
          \`user_id\` int DEFAULT NULL,
          \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`image_resource_id\`),
          UNIQUE KEY \`upload_id\` (\`upload_id\`),
          KEY \`idx_business_category\` (\`business_type\`,\`category\`),
          KEY \`idx_user_business\` (\`user_id\`,\`business_type\`,\`status\`),
          CONSTRAINT \`fk_image_resources_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
      console.log('  ✅ 已重建旧图片资源表')
    }

    // ========================================
    // 2. 恢复各表的旧列（无数据恢复）
    // ========================================

    const restorations = [
      { table: 'exchange_items', column: 'primary_image_id', def: { type: Sequelize.INTEGER, allowNull: true } },
      { table: 'lottery_prizes', column: 'image_resource_id', def: { type: Sequelize.INTEGER, allowNull: true } },
      { table: 'item_templates', column: 'image_resource_id', def: { type: Sequelize.INTEGER, allowNull: true } },
      { table: 'exchange_item_skus', column: 'image_id', def: { type: Sequelize.INTEGER, allowNull: true } },
      { table: 'ad_creatives', column: 'image_url', def: { type: Sequelize.STRING(500), allowNull: true } },
      { table: 'ad_creatives', column: 'image_width', def: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true } },
      { table: 'ad_creatives', column: 'image_height', def: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true } },
      { table: 'category_defs', column: 'icon_url', def: { type: Sequelize.STRING(500), allowNull: true } },
      { table: 'material_asset_types', column: 'icon_url', def: { type: Sequelize.STRING(500), allowNull: true } },
      { table: 'lottery_campaigns', column: 'banner_image_url', def: { type: Sequelize.STRING(500), allowNull: true } },
      { table: 'lottery_campaigns', column: 'background_image_url', def: { type: Sequelize.STRING(500), allowNull: true } }
    ]

    for (const { table, column, def } of restorations) {
      if (!(await columnExists(queryInterface, table, column))) {
        await queryInterface.addColumn(table, column, def)
        console.log(`  ✅ 已恢复列 ${table}.${column}`)
      }
    }

    // 恢复 FK 约束（仅对引用旧图片资源表的列）
    const fkRestore = [
      { table: 'exchange_items', column: 'primary_image_id', name: 'fk_exchange_items_primary_image' },
      { table: 'lottery_prizes', column: 'image_resource_id', name: 'fk_lottery_prizes_image' },
      { table: 'item_templates', column: 'image_resource_id', name: 'item_templates_image_resource_id_foreign_idx' },
      { table: 'exchange_item_skus', column: 'image_id', name: 'exchange_item_skus_image_id_foreign_idx' }
    ]

    for (const { table, column, name } of fkRestore) {
      if (await columnExists(queryInterface, table, column) && !(await constraintExists(queryInterface, table, name))) {
        try {
          await queryInterface.addConstraint(table, {
            fields: [column],
            type: 'foreign key',
            name,
            references: { table: 'image_resources', field: 'image_resource_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          })
          console.log(`  ✅ 已恢复 FK ${table}.${name}`)
        } catch (e) {
          console.warn(`  ⚠️ 恢复 FK ${table}.${name} 失败（可能约束名不同）:`, e.message)
        }
      }
    }

    console.log('[cleanup-old-image-columns] 回滚完成')
  }
}
