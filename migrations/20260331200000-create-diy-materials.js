/**
 * 创建 diy_materials 表 — DIY 珠子/宝石素材
 *
 * 对应文档第六章第3节「珠子/宝石素材数据」
 *
 * 字段设计对齐小程序前端需要的数据：
 * - name/display_name: 素材名称（如"巴西黄水晶"）
 * - diameter: 直径(mm)，用于容量校验和槽位匹配
 * - shape: 切割形状（circle/ellipse），用于镶嵌模式槽位匹配
 * - price: 单价（资产单位）
 * - price_asset_code: 定价币种（DIAMOND/POINTS 等）
 * - material_name: 材质名称（展示用，如"黄水晶"）
 * - group_code: 材料分组（对齐 asset_group_defs，如 yellow/blue/red）
 * - stock: 库存（0=售罄，-1=无限）
 * - image_media_id: 素材图片（PNG 透明底）
 * - is_stackable: 可叠加标识（同款可多颗）
 *
 * @migration 20260331200000-create-diy-materials
 */

'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('diy_materials', {
      diy_material_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        comment: '素材ID（主键）'
      },
      material_code: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
        comment: '素材编码（唯一，如 yellow_crystal_10mm）'
      },
      display_name: {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: '素材显示名称（如"巴西黄水晶"）'
      },
      material_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '材质名称（如"黄水晶"），用于分类展示'
      },
      group_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '材料分组编码（对齐 asset_group_defs，如 yellow/blue/red）'
      },
      diameter: {
        type: Sequelize.DECIMAL(5, 1),
        allowNull: false,
        comment: '直径(mm)，用于容量校验和槽位匹配'
      },
      shape: {
        type: Sequelize.ENUM('circle', 'ellipse', 'oval', 'square', 'heart', 'teardrop'),
        allowNull: false,
        defaultValue: 'circle',
        comment: '切割形状，用于镶嵌模式槽位形状匹配'
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '单价（资产单位）'
      },
      price_asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'DIAMOND',
        comment: '定价币种（对齐资产体系，如 DIAMOND/POINTS）'
      },
      stock: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: -1,
        comment: '库存数量（-1=无限，0=售罄）'
      },
      is_stackable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '可叠加标识（同款可多颗）'
      },
      image_media_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '素材图片（PNG 透明底）→ media_files.media_id'
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '所属分类 → categories.category_id'
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序权重（越小越靠前）'
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },
      meta: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '扩展元数据'
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
      comment: 'DIY 珠子/宝石素材表'
    })

    // 索引
    await queryInterface.addIndex('diy_materials', ['group_code'], { name: 'idx_diy_materials_group' })
    await queryInterface.addIndex('diy_materials', ['category_id'], { name: 'idx_diy_materials_category' })
    await queryInterface.addIndex('diy_materials', ['diameter'], { name: 'idx_diy_materials_diameter' })
    await queryInterface.addIndex('diy_materials', ['is_enabled', 'sort_order'], { name: 'idx_diy_materials_enabled_sort' })

    // 插入种子数据（基于现有 material_asset_types 中的水晶数据）
    const now = new Date()
    const materials = [
      // 黄水晶系列
      { material_code: 'yellow_crystal_8mm', display_name: '巴西黄水晶', material_name: '黄水晶', group_code: 'yellow', diameter: 8, shape: 'circle', price: 32, price_asset_code: 'DIAMOND', stock: -1, sort_order: 1 },
      { material_code: 'yellow_crystal_10mm', display_name: '巴西黄水晶', material_name: '黄水晶', group_code: 'yellow', diameter: 10, shape: 'circle', price: 67, price_asset_code: 'DIAMOND', stock: -1, sort_order: 2 },
      { material_code: 'yellow_lemon_8mm', display_name: '透体柠檬黄水晶', material_name: '黄水晶', group_code: 'yellow', diameter: 8, shape: 'circle', price: 6, price_asset_code: 'DIAMOND', stock: -1, sort_order: 3 },
      { material_code: 'yellow_lemon_10mm', display_name: '透体柠檬黄水晶', material_name: '黄水晶', group_code: 'yellow', diameter: 10, shape: 'circle', price: 12, price_asset_code: 'DIAMOND', stock: -1, sort_order: 4 },
      { material_code: 'yellow_lemon_12mm', display_name: '透体柠檬黄水晶', material_name: '黄水晶', group_code: 'yellow', diameter: 12, shape: 'circle', price: 19, price_asset_code: 'DIAMOND', stock: -1, sort_order: 5 },
      { material_code: 'yellow_topaz_8mm', display_name: '黄塔晶', material_name: '黄水晶', group_code: 'yellow', diameter: 8, shape: 'circle', price: 6.5, price_asset_code: 'DIAMOND', stock: -1, sort_order: 6 },

      // 粉水晶系列
      { material_code: 'pink_crystal_8mm', display_name: '粉水晶', material_name: '粉水晶', group_code: 'red', diameter: 8, shape: 'circle', price: 15, price_asset_code: 'DIAMOND', stock: -1, sort_order: 10 },
      { material_code: 'pink_crystal_10mm', display_name: '粉水晶', material_name: '粉水晶', group_code: 'red', diameter: 10, shape: 'circle', price: 28, price_asset_code: 'DIAMOND', stock: -1, sort_order: 11 },
      { material_code: 'pink_crystal_12mm', display_name: '粉水晶', material_name: '粉水晶', group_code: 'red', diameter: 12, shape: 'circle', price: 45, price_asset_code: 'DIAMOND', stock: -1, sort_order: 12 },

      // 茶水晶系列
      { material_code: 'smoky_crystal_8mm', display_name: '茶水晶', material_name: '茶水晶', group_code: 'orange', diameter: 8, shape: 'circle', price: 10, price_asset_code: 'DIAMOND', stock: -1, sort_order: 20 },
      { material_code: 'smoky_crystal_10mm', display_name: '茶水晶', material_name: '茶水晶', group_code: 'orange', diameter: 10, shape: 'circle', price: 22, price_asset_code: 'DIAMOND', stock: -1, sort_order: 21 },

      // 幽灵水晶系列
      { material_code: 'phantom_green_8mm', display_name: '绿幽灵水晶', material_name: '幽灵水晶', group_code: 'green', diameter: 8, shape: 'circle', price: 35, price_asset_code: 'DIAMOND', stock: -1, sort_order: 30 },
      { material_code: 'phantom_green_10mm', display_name: '绿幽灵水晶', material_name: '幽灵水晶', group_code: 'green', diameter: 10, shape: 'circle', price: 58, price_asset_code: 'DIAMOND', stock: -1, sort_order: 31 },

      // 紫水晶系列
      { material_code: 'amethyst_8mm', display_name: '紫水晶', material_name: '紫水晶', group_code: 'purple', diameter: 8, shape: 'circle', price: 25, price_asset_code: 'DIAMOND', stock: -1, sort_order: 40 },
      { material_code: 'amethyst_10mm', display_name: '紫水晶', material_name: '紫水晶', group_code: 'purple', diameter: 10, shape: 'circle', price: 42, price_asset_code: 'DIAMOND', stock: -1, sort_order: 41 },
      { material_code: 'amethyst_12mm', display_name: '紫水晶', material_name: '紫水晶', group_code: 'purple', diameter: 12, shape: 'circle', price: 68, price_asset_code: 'DIAMOND', stock: -1, sort_order: 42 },

      // 蓝水晶系列
      { material_code: 'blue_crystal_8mm', display_name: '海蓝宝', material_name: '蓝水晶', group_code: 'blue', diameter: 8, shape: 'circle', price: 30, price_asset_code: 'DIAMOND', stock: -1, sort_order: 50 },
      { material_code: 'blue_crystal_10mm', display_name: '海蓝宝', material_name: '蓝水晶', group_code: 'blue', diameter: 10, shape: 'circle', price: 55, price_asset_code: 'DIAMOND', stock: -1, sort_order: 51 },

      // 白水晶系列
      { material_code: 'clear_quartz_8mm', display_name: '白水晶', material_name: '白水晶', group_code: 'yellow', diameter: 8, shape: 'circle', price: 8, price_asset_code: 'DIAMOND', stock: -1, sort_order: 60 },
      { material_code: 'clear_quartz_10mm', display_name: '白水晶', material_name: '白水晶', group_code: 'yellow', diameter: 10, shape: 'circle', price: 15, price_asset_code: 'DIAMOND', stock: -1, sort_order: 61 }
    ]

    await queryInterface.bulkInsert('diy_materials', materials.map(m => ({
      ...m,
      is_stackable: true,
      is_enabled: true,
      created_at: now,
      updated_at: now
    })))
  },

  async down(queryInterface) {
    await queryInterface.dropTable('diy_materials')
  }
}
