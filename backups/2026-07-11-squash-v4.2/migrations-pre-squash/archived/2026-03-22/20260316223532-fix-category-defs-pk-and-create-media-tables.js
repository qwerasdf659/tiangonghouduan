'use strict'

/**
 * 图片资源管理架构重构迁移（方案 D+ 增强版）
 *
 * 本迁移包含三大变更：
 * 1. 修正 category_defs 主键为整数自增（消除唯一 VARCHAR PK 技术债务）
 * 2. 创建 media_files 表（纯存储层）
 * 3. 创建 media_attachments 表（多态关联层）
 *
 * 设计为幂等执行：每步操作前先检查状态，避免重复执行报错
 *
 * @version 1.1.0
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

async function indexExists(queryInterface, table, indexName) {
  const [indexes] = await queryInterface.sequelize.query(
    `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${indexName}'`
  )
  return indexes.length > 0
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // ========================================
    // 第一部分：修正 category_defs 主键为整数
    // ========================================

    // 1.1 添加 category_def_id 列
    if (!(await columnExists(queryInterface, 'category_defs', 'category_def_id'))) {
      await queryInterface.addColumn('category_defs', 'category_def_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '类目定义ID（整数自增主键）'
      })

      const [categories] = await queryInterface.sequelize.query(
        'SELECT category_code FROM category_defs ORDER BY sort_order ASC, created_at ASC'
      )
      for (let i = 0; i < categories.length; i++) {
        await queryInterface.sequelize.query(
          'UPDATE category_defs SET category_def_id = ? WHERE category_code = ?',
          { replacements: [i + 1, categories[i].category_code] }
        )
      }
      console.log('  ✅ category_def_id 列已添加并赋值')
    } else {
      console.log('  ⏭️ category_def_id 列已存在，跳过')
    }

    // 1.2 为引用表添加新的整数 FK 列
    if (!(await columnExists(queryInterface, 'exchange_items', 'category_def_id'))) {
      await queryInterface.addColumn('exchange_items', 'category_def_id', {
        type: Sequelize.INTEGER, allowNull: true,
        comment: '商品分类ID，FK→category_defs.category_def_id'
      })
      await queryInterface.sequelize.query(
        `UPDATE exchange_items ei
         INNER JOIN category_defs cd ON ei.category = cd.category_code
         SET ei.category_def_id = cd.category_def_id`
      )
      console.log('  ✅ exchange_items.category_def_id 已添加并回填')
    }

    if (!(await columnExists(queryInterface, 'item_templates', 'category_def_id'))) {
      await queryInterface.addColumn('item_templates', 'category_def_id', {
        type: Sequelize.INTEGER, allowNull: true,
        comment: '类目定义ID，FK→category_defs.category_def_id'
      })
      await queryInterface.sequelize.query(
        `UPDATE item_templates it
         INNER JOIN category_defs cd ON it.category_code = cd.category_code
         SET it.category_def_id = cd.category_def_id`
      )
      console.log('  ✅ item_templates.category_def_id 已添加并回填')
    }

    if (!(await columnExists(queryInterface, 'market_listings', 'offer_category_def_id'))) {
      await queryInterface.addColumn('market_listings', 'offer_category_def_id', {
        type: Sequelize.INTEGER, allowNull: true,
        comment: '挂牌物品类目ID，FK→category_defs.category_def_id'
      })
      await queryInterface.sequelize.query(
        `UPDATE market_listings ml
         INNER JOIN category_defs cd ON ml.offer_item_category_code = cd.category_code
         SET ml.offer_category_def_id = cd.category_def_id
         WHERE ml.offer_item_category_code IS NOT NULL`
      )
      console.log('  ✅ market_listings.offer_category_def_id 已添加并回填')
    }

    // 确保回填数据完整（仅在旧列仍存在时执行）
    if (await columnExists(queryInterface, 'exchange_items', 'category')) {
      await queryInterface.sequelize.query(
        `UPDATE exchange_items ei
         INNER JOIN category_defs cd ON ei.category = cd.category_code
         SET ei.category_def_id = cd.category_def_id
         WHERE ei.category_def_id IS NULL AND ei.category IS NOT NULL`
      )
    }
    if (await columnExists(queryInterface, 'item_templates', 'category_code')) {
      await queryInterface.sequelize.query(
        `UPDATE item_templates it
         INNER JOIN category_defs cd ON it.category_code = cd.category_code
         SET it.category_def_id = cd.category_def_id
         WHERE it.category_def_id IS NULL AND it.category_code IS NOT NULL`
      )
    }

    // 1.3 处理 category_defs 自引用 FK（phase0 新增的两级分类）
    if (await constraintExists(queryInterface, 'category_defs', 'fk_category_parent')) {
      await queryInterface.removeConstraint('category_defs', 'fk_category_parent')
      console.log('  ✅ 已移除 fk_category_parent 约束')
    }

    if (!(await columnExists(queryInterface, 'category_defs', 'parent_category_def_id'))) {
      await queryInterface.addColumn('category_defs', 'parent_category_def_id', {
        type: Sequelize.INTEGER, allowNull: true, defaultValue: null,
        comment: '父分类ID，NULL 表示一级分类。FK → category_defs.category_def_id'
      })
      await queryInterface.sequelize.query(
        `UPDATE category_defs c1
         INNER JOIN category_defs c2 ON c1.parent_code = c2.category_code
         SET c1.parent_category_def_id = c2.category_def_id
         WHERE c1.parent_code IS NOT NULL`
      )
      console.log('  ✅ parent_category_def_id 已添加并回填')
    }

    if (await indexExists(queryInterface, 'category_defs', 'idx_category_parent_code')) {
      await queryInterface.removeIndex('category_defs', 'idx_category_parent_code')
    }
    if (await columnExists(queryInterface, 'category_defs', 'parent_code')) {
      await queryInterface.removeColumn('category_defs', 'parent_code')
      console.log('  ✅ 已移除 parent_code 列')
    }

    // 1.4 删除旧 FK 约束
    if (await constraintExists(queryInterface, 'exchange_items', 'fk_exchange_items_category')) {
      await queryInterface.removeConstraint('exchange_items', 'fk_exchange_items_category')
    }
    if (await constraintExists(queryInterface, 'item_templates', 'item_templates_ibfk_1')) {
      await queryInterface.removeConstraint('item_templates', 'item_templates_ibfk_1')
    }
    if (await constraintExists(queryInterface, 'market_listings', 'market_listings_offer_item_category_code_foreign_idx')) {
      await queryInterface.removeConstraint('market_listings', 'market_listings_offer_item_category_code_foreign_idx')
    }
    console.log('  ✅ 旧 FK 约束已清理')

    // 1.5 删除旧 VARCHAR FK 列
    if (await columnExists(queryInterface, 'exchange_items', 'category')) {
      await queryInterface.removeColumn('exchange_items', 'category')
    }
    if (await columnExists(queryInterface, 'item_templates', 'category_code')) {
      await queryInterface.removeColumn('item_templates', 'category_code')
    }
    if (await columnExists(queryInterface, 'market_listings', 'offer_item_category_code')) {
      await queryInterface.removeColumn('market_listings', 'offer_item_category_code')
    }
    console.log('  ✅ 旧 VARCHAR FK 列已删除')

    // 1.6 修改 category_defs 主键
    // 检查当前 PK 是否仍是 category_code
    const [pkInfo] = await queryInterface.sequelize.query(
      `SHOW KEYS FROM category_defs WHERE Key_name = 'PRIMARY'`
    )
    const currentPk = pkInfo[0]?.Column_name

    if (currentPk === 'category_code') {
      await queryInterface.sequelize.query('ALTER TABLE category_defs DROP PRIMARY KEY')
      await queryInterface.sequelize.query(
        `ALTER TABLE category_defs
         MODIFY COLUMN category_def_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
         AUTO_INCREMENT = 10`
      )
      console.log('  ✅ 主键已从 category_code 切换为 category_def_id')
    } else {
      console.log('  ⏭️ 主键已是 category_def_id，跳过')
    }

    // category_code 降级为 UNIQUE KEY
    if (!(await indexExists(queryInterface, 'category_defs', 'uk_category_code'))) {
      await queryInterface.addIndex('category_defs', ['category_code'], {
        unique: true, name: 'uk_category_code'
      })
    }

    // 1.7 创建新的整数 FK 约束
    if (!(await constraintExists(queryInterface, 'exchange_items', 'fk_exchange_items_category_def'))) {
      await queryInterface.addConstraint('exchange_items', {
        fields: ['category_def_id'], type: 'foreign key',
        name: 'fk_exchange_items_category_def',
        references: { table: 'category_defs', field: 'category_def_id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL'
      })
    }
    if (!(await constraintExists(queryInterface, 'item_templates', 'fk_item_templates_category_def'))) {
      await queryInterface.addConstraint('item_templates', {
        fields: ['category_def_id'], type: 'foreign key',
        name: 'fk_item_templates_category_def',
        references: { table: 'category_defs', field: 'category_def_id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL'
      })
    }
    if (!(await constraintExists(queryInterface, 'market_listings', 'fk_market_listings_offer_category_def'))) {
      await queryInterface.addConstraint('market_listings', {
        fields: ['offer_category_def_id'], type: 'foreign key',
        name: 'fk_market_listings_offer_category_def',
        references: { table: 'category_defs', field: 'category_def_id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL'
      })
    }
    if (!(await constraintExists(queryInterface, 'category_defs', 'fk_category_parent_def'))) {
      await queryInterface.addConstraint('category_defs', {
        fields: ['parent_category_def_id'], type: 'foreign key',
        name: 'fk_category_parent_def',
        references: { table: 'category_defs', field: 'category_def_id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL'
      })
    }
    console.log('  ✅ 新 FK 约束已创建')

    // ========================================
    // 第二部分：创建 media_files 表
    // ========================================
    if (!(await tableExists(queryInterface, 'media_files'))) {
      await queryInterface.createTable('media_files', {
        media_id: {
          type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true,
          comment: '媒体文件ID（主键）'
        },
        object_key: {
          type: Sequelize.STRING(500), allowNull: false,
          comment: '原图 Sealos object key'
        },
        thumbnail_keys: {
          type: Sequelize.JSON, defaultValue: null,
          comment: '缩略图 keys: {small, medium, large}'
        },
        original_name: {
          type: Sequelize.STRING(255), defaultValue: null,
          comment: '原始文件名'
        },
        file_size: {
          type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0,
          comment: '文件大小(bytes)'
        },
        mime_type: {
          type: Sequelize.STRING(100), allowNull: false,
          comment: 'MIME 类型'
        },
        width: {
          type: Sequelize.INTEGER.UNSIGNED, defaultValue: null,
          comment: '图片宽度(px)'
        },
        height: {
          type: Sequelize.INTEGER.UNSIGNED, defaultValue: null,
          comment: '图片高度(px)'
        },
        content_hash: {
          type: Sequelize.CHAR(64), defaultValue: null,
          comment: 'SHA-256 内容哈希(建议去重)'
        },
        folder: {
          type: Sequelize.STRING(100), allowNull: false,
          comment: '存储文件夹(products/materials/categories/...)'
        },
        tags: {
          type: Sequelize.JSON, defaultValue: null,
          comment: '标签: ["奖品","活动A","2026春季"]'
        },
        uploaded_by: {
          type: Sequelize.INTEGER.UNSIGNED, defaultValue: null,
          comment: '上传用户 ID'
        },
        status: {
          type: Sequelize.ENUM('active', 'archived', 'trashed'),
          allowNull: false, defaultValue: 'active',
          comment: '状态: active=正常, archived=归档, trashed=回收站'
        },
        trashed_at: {
          type: Sequelize.DATE, defaultValue: null,
          comment: '移入回收站时间'
        },
        created_at: {
          type: Sequelize.DATE, allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE, allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      }, {
        charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci',
        comment: '媒体文件表（纯存储层 - 独立媒体服务方案 D+ 增强版）'
      })

      await queryInterface.addIndex('media_files', ['object_key'], { unique: true, name: 'uk_object_key' })
      await queryInterface.addIndex('media_files', ['content_hash'], { name: 'idx_content_hash' })
      await queryInterface.addIndex('media_files', ['folder', 'status'], { name: 'idx_folder_status' })
      await queryInterface.addIndex('media_files', ['uploaded_by', 'created_at'], { name: 'idx_uploaded_by' })
      await queryInterface.addIndex('media_files', ['status', 'trashed_at'], { name: 'idx_status_trashed' })
      console.log('  ✅ media_files 表已创建')
    } else {
      console.log('  ⏭️ media_files 表已存在，跳过')
    }

    // ========================================
    // 第三部分：创建 media_attachments 表
    // ========================================
    if (!(await tableExists(queryInterface, 'media_attachments'))) {
      await queryInterface.createTable('media_attachments', {
        attachment_id: {
          type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true,
          comment: '关联记录ID（主键）'
        },
        media_id: {
          type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
          comment: '关联的媒体文件ID',
          references: { model: 'media_files', key: 'media_id' },
          onDelete: 'CASCADE', onUpdate: 'CASCADE'
        },
        attachable_type: {
          type: Sequelize.STRING(50), allowNull: false,
          comment: '业务实体类型(lottery_prize/exchange_item/ad_creative/...)'
        },
        attachable_id: {
          type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
          comment: '业务实体 ID'
        },
        role: {
          type: Sequelize.STRING(30), allowNull: false, defaultValue: 'primary',
          comment: '用途(primary/icon/banner/background/gallery)'
        },
        sort_order: {
          type: Sequelize.INTEGER, allowNull: false, defaultValue: 0,
          comment: '排序顺序'
        },
        meta: {
          type: Sequelize.JSON, defaultValue: null,
          comment: '关联元数据(alt_text/crop_rect等)'
        },
        created_at: {
          type: Sequelize.DATE, allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, {
        charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci',
        comment: '媒体关联表（多态关联 - 独立媒体服务方案 D+ 增强版）'
      })

      await queryInterface.addIndex('media_attachments', ['attachable_type', 'attachable_id', 'role'], { name: 'idx_attachable' })
      await queryInterface.addIndex('media_attachments', ['media_id'], { name: 'idx_media' })
      console.log('  ✅ media_attachments 表已创建')
    } else {
      console.log('  ⏭️ media_attachments 表已存在，跳过')
    }

    // ========================================
    // 第四部分：给高频业务表添加 primary_media_id 冗余缓存
    // ========================================
    const mediaIdCol = {
      type: Sequelize.BIGINT.UNSIGNED, allowNull: true,
      comment: '主图片媒体ID（冗余缓存）：由 MediaService 自动维护',
      references: { model: 'media_files', key: 'media_id' },
      onUpdate: 'CASCADE', onDelete: 'SET NULL'
    }

    for (const table of ['exchange_items', 'lottery_prizes', 'item_templates', 'ad_creatives']) {
      if (!(await columnExists(queryInterface, table, 'primary_media_id'))) {
        await queryInterface.addColumn(table, 'primary_media_id', mediaIdCol)
        console.log(`  ✅ ${table}.primary_media_id 已添加`)
      }
    }

    console.log('✅ 迁移完成：category_defs PK 修正 + media_files/media_attachments 表创建')
  },

  async down(queryInterface, Sequelize) {
    // 逆序回滚（简化版，省略幂等检查）

    // 4. 删除 primary_media_id 冗余列
    for (const table of ['ad_creatives', 'item_templates', 'lottery_prizes', 'exchange_items']) {
      if (await columnExists(queryInterface, table, 'primary_media_id')) {
        await queryInterface.removeColumn(table, 'primary_media_id')
      }
    }

    // 3. 删除 media_attachments
    if (await tableExists(queryInterface, 'media_attachments')) {
      await queryInterface.dropTable('media_attachments')
    }

    // 2. 删除 media_files
    if (await tableExists(queryInterface, 'media_files')) {
      await queryInterface.dropTable('media_files')
    }

    // 1. 恢复 category_defs VARCHAR PK（完整回滚）
    if (await constraintExists(queryInterface, 'category_defs', 'fk_category_parent_def')) {
      await queryInterface.removeConstraint('category_defs', 'fk_category_parent_def')
    }
    if (await constraintExists(queryInterface, 'market_listings', 'fk_market_listings_offer_category_def')) {
      await queryInterface.removeConstraint('market_listings', 'fk_market_listings_offer_category_def')
    }
    if (await constraintExists(queryInterface, 'item_templates', 'fk_item_templates_category_def')) {
      await queryInterface.removeConstraint('item_templates', 'fk_item_templates_category_def')
    }
    if (await constraintExists(queryInterface, 'exchange_items', 'fk_exchange_items_category_def')) {
      await queryInterface.removeConstraint('exchange_items', 'fk_exchange_items_category_def')
    }

    // 恢复旧 VARCHAR FK 列并回填
    await queryInterface.addColumn('exchange_items', 'category', { type: Sequelize.STRING(50), allowNull: true })
    await queryInterface.addColumn('item_templates', 'category_code', { type: Sequelize.STRING(50), allowNull: true })
    await queryInterface.addColumn('market_listings', 'offer_item_category_code', { type: Sequelize.STRING(50), allowNull: true })

    await queryInterface.sequelize.query(
      `UPDATE exchange_items ei INNER JOIN category_defs cd ON ei.category_def_id = cd.category_def_id SET ei.category = cd.category_code`
    )
    await queryInterface.sequelize.query(
      `UPDATE item_templates it INNER JOIN category_defs cd ON it.category_def_id = cd.category_def_id SET it.category_code = cd.category_code`
    )
    await queryInterface.sequelize.query(
      `UPDATE market_listings ml INNER JOIN category_defs cd ON ml.offer_category_def_id = cd.category_def_id
       SET ml.offer_item_category_code = cd.category_code WHERE ml.offer_category_def_id IS NOT NULL`
    )

    // 删除新整数 FK 列
    if (await columnExists(queryInterface, 'market_listings', 'offer_category_def_id')) {
      await queryInterface.removeColumn('market_listings', 'offer_category_def_id')
    }
    if (await columnExists(queryInterface, 'item_templates', 'category_def_id')) {
      await queryInterface.removeColumn('item_templates', 'category_def_id')
    }
    if (await columnExists(queryInterface, 'exchange_items', 'category_def_id')) {
      await queryInterface.removeColumn('exchange_items', 'category_def_id')
    }

    // 恢复 parent_code 列
    await queryInterface.addColumn('category_defs', 'parent_code', {
      type: Sequelize.STRING(50), allowNull: true, defaultValue: null,
      comment: '父分类代码，NULL 表示一级分类'
    })
    if (await columnExists(queryInterface, 'category_defs', 'parent_category_def_id')) {
      await queryInterface.sequelize.query(
        `UPDATE category_defs c1 INNER JOIN category_defs c2 ON c1.parent_category_def_id = c2.category_def_id
         SET c1.parent_code = c2.category_code WHERE c1.parent_category_def_id IS NOT NULL`
      )
      await queryInterface.removeColumn('category_defs', 'parent_category_def_id')
    }

    // 恢复 category_defs VARCHAR PK
    if (await indexExists(queryInterface, 'category_defs', 'uk_category_code')) {
      await queryInterface.removeIndex('category_defs', 'uk_category_code')
    }
    await queryInterface.sequelize.query('ALTER TABLE category_defs DROP PRIMARY KEY')
    await queryInterface.sequelize.query(
      'ALTER TABLE category_defs MODIFY COLUMN category_def_id INT NULL, ADD PRIMARY KEY (category_code)'
    )
    await queryInterface.removeColumn('category_defs', 'category_def_id')

    // 恢复旧 FK 约束
    await queryInterface.addConstraint('exchange_items', {
      fields: ['category'], type: 'foreign key', name: 'fk_exchange_items_category',
      references: { table: 'category_defs', field: 'category_code' }
    })
    await queryInterface.addConstraint('item_templates', {
      fields: ['category_code'], type: 'foreign key', name: 'item_templates_ibfk_1',
      references: { table: 'category_defs', field: 'category_code' }
    })
    await queryInterface.addConstraint('market_listings', {
      fields: ['offer_item_category_code'], type: 'foreign key',
      name: 'market_listings_offer_item_category_code_foreign_idx',
      references: { table: 'category_defs', field: 'category_code' }
    })
    await queryInterface.addConstraint('category_defs', {
      fields: ['parent_code'], type: 'foreign key', name: 'fk_category_parent',
      references: { table: 'category_defs', field: 'category_code' },
      onUpdate: 'CASCADE', onDelete: 'SET NULL'
    })
    await queryInterface.addIndex('category_defs', ['parent_code'], { name: 'idx_category_parent_code' })

    console.log('✅ 回滚完成')
  }
}
