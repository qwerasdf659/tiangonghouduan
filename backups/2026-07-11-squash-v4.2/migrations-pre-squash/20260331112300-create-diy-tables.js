'use strict'

/**
 * DIY 饰品设计引擎 — 数据库迁移
 *
 * 新建两张表：
 * - diy_templates: DIY 款式模板表
 * - diy_works:     DIY 用户作品表
 *
 * 同时向 categories 插入 DIY 饰品顶级分类 + 4 个二级分类
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('diy_templates', {
      diy_template_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'DIY款式模板ID（自增主键）'
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '款式名称'
      },
      type: {
        type: Sequelize.STRING(30),
        allowNull: false,
        comment: '款式类型标识（bracelet/necklace/ring/pendant）'
      },
      description: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: '款式描述'
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '所属品类ID',
        references: { model: 'categories', key: 'category_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      layout: {
        type: Sequelize.JSON,
        allowNull: false,
        comment: '排列形状参数 { shape, params }'
      },
      bead_size_constraints: {
        type: Sequelize.JSON,
        allowNull: false,
        comment: '珠子尺寸约束 { allowed_sizes, default_size }'
      },
      allowed_materials: {
        type: Sequelize.JSON,
        allowNull: false,
        comment: '可用材料白名单 { mode, asset_codes[] }'
      },
      pricing_rule: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '价格计算规则'
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序权重'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'DIY款式模板表'
    })

    await queryInterface.addIndex('diy_templates', ['category_id'], { name: 'idx_diy_templates_category' })
    await queryInterface.addIndex('diy_templates', ['type'], { name: 'idx_diy_templates_type' })
    await queryInterface.addIndex('diy_templates', ['is_active', 'sort_order'], { name: 'idx_diy_templates_active_sort' })

    await queryInterface.createTable('diy_works', {
      diy_work_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'DIY作品ID（自增主键）'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '用户ID',
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      diy_template_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: '款式模板ID',
        references: { model: 'diy_templates', key: 'diy_template_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: '我的设计',
        comment: '作品名称'
      },
      beads: {
        type: Sequelize.JSON,
        allowNull: false,
        comment: '珠子排列数据'
      },
      status: {
        type: Sequelize.ENUM('draft', 'saved', 'ordered'),
        allowNull: false,
        defaultValue: 'draft',
        comment: '作品状态'
      },
      preview_image_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: '预览图URL'
      },
      total_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: '总价（下单时冻结）'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'DIY用户作品表'
    })

    await queryInterface.addIndex('diy_works', ['user_id', 'status'], { name: 'idx_diy_works_user_status' })
    await queryInterface.addIndex('diy_works', ['diy_template_id'], { name: 'idx_diy_works_template' })
    await queryInterface.addIndex('diy_works', ['user_id', 'updated_at'], { name: 'idx_diy_works_user_updated' })

    // 插入 DIY 饰品分类数据
    const [existingDiy] = await queryInterface.sequelize.query(
      "SELECT category_id FROM categories WHERE category_code = 'DIY_JEWELRY' LIMIT 1"
    )
    if (existingDiy.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO categories (category_code, category_name, description, parent_category_id, level, sort_order, is_enabled, created_at, updated_at)
         VALUES ('DIY_JEWELRY', 'DIY饰品', 'DIY饰品设计引擎', NULL, 1, 100, 1, NOW(), NOW())`
      )
      const [[parentRow]] = await queryInterface.sequelize.query(
        "SELECT category_id FROM categories WHERE category_code = 'DIY_JEWELRY' LIMIT 1"
      )
      const parentId = parentRow.category_id
      const subs = [
        ['DIY_BRACELET', '手链', 'DIY手链设计', 1],
        ['DIY_NECKLACE', '项链', 'DIY项链设计', 2],
        ['DIY_RING', '戒指', 'DIY戒指设计', 3],
        ['DIY_PENDANT', '吊坠', 'DIY吊坠设计', 4]
      ]
      for (const [code, catName, desc, sort] of subs) {
        await queryInterface.sequelize.query(
          `INSERT INTO categories (category_code, category_name, description, parent_category_id, level, sort_order, is_enabled, created_at, updated_at)
           VALUES ('${code}', '${catName}', '${desc}', ${parentId}, 2, ${sort}, 1, NOW(), NOW())`
        )
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DELETE FROM categories WHERE category_code IN ('DIY_BRACELET','DIY_NECKLACE','DIY_RING','DIY_PENDANT')"
    )
    await queryInterface.sequelize.query("DELETE FROM categories WHERE category_code = 'DIY_JEWELRY'")
    await queryInterface.dropTable('diy_works')
    await queryInterface.dropTable('diy_templates')
  }
}
