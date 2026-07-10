'use strict'

/**
 * 添加列: diy_materials 展示/渲染/大类 10 个字段（DIY 拍板决议 11.5-A）
 *
 * 创建时间: 2026-07-10（北京时间）
 * 背景（docs/自由定制饰品diy-lite与S1-S5商品体系-对接方案与拍板决议.md 第 11.5-A 节）:
 * - 小程序 diy-lite 设计台需要素材的材质光影档位、寓意/能量/搭配文案、克重、五行属性
 *   等展示字段，以及异形珠几何元数据（管珠/药片的真实尺寸与穿绳方向）。
 * - 素材大类 item_type 区分珠子/配饰/吊坠，支撑前端「饰品/配饰/吊坠」三个素材 Tab
 *  （同一个 GET /diy/templates/:id/beads 接口加 item_type 查询参数过滤，不另开接口）。
 * - 字段命名照采前端提议（符合项目 snake_case 规范），前端零映射。
 *
 * 字段清单（10 列）:
 * - item_type         ENUM(beads/accessories/pendants)  素材大类
 * - material_type     ENUM(crystal/stone/metal/matte)   材质光影档位（前端 Canvas 高光参数）
 * - five_elements     VARCHAR(50)                       五行属性（逗号分隔多值 metal/wood/water/fire/earth）
 * - weight            DECIMAL(6,1)                      单颗净重(g)
 * - meaning           VARCHAR(500)                      寓意文案
 * - energy            VARCHAR(200)                      能量属性文案
 * - pairing           VARCHAR(500)                      搭配建议文案
 * - size_length_mm    DECIMAL(5,1)                      异形珠实物长边(mm)，圆珠为空
 * - size_width_mm     DECIMAL(5,1)                      异形珠实物短边(mm)，圆珠为空
 * - bore_orientation  ENUM(along_length/along_width/none) 穿绳方向
 *
 * 索引: idx_diy_materials_item_type（item_type 查询过滤用，创建前检查避免重复）
 *
 * 回滚: 依次删除索引与 10 列。
 */

/** 新增列定义（与 models/DiyMaterial.js 同步维护） */
const NEW_COLUMNS = Sequelize => ({
  item_type: {
    type: Sequelize.ENUM('beads', 'accessories', 'pendants'),
    allowNull: false,
    defaultValue: 'beads',
    comment: '素材大类：beads珠子 / accessories配饰(隔片佛头流苏) / pendants吊坠'
  },
  material_type: {
    type: Sequelize.ENUM('crystal', 'stone', 'metal', 'matte'),
    allowNull: false,
    defaultValue: 'crystal',
    comment: '材质光影档位（前端立体渲染高光参数）：crystal通透水晶/stone玉石奶体/metal金属镜面/matte哑光'
  },
  five_elements: {
    type: Sequelize.STRING(50),
    allowNull: true,
    comment: '五行属性，逗号分隔多值：metal金/wood木/water水/fire火/earth土（五行雷达图玩法数据源）'
  },
  weight: {
    type: Sequelize.DECIMAL(6, 1),
    allowNull: true,
    comment: '单颗珠子净重(g)，保留1位小数，仅详情展示'
  },
  meaning: {
    type: Sequelize.STRING(500),
    allowNull: true,
    comment: '寓意文案（详情弹窗展示，措辞须符合广告法：用"寓意/象征"，禁功效性表述）'
  },
  energy: {
    type: Sequelize.STRING(200),
    allowNull: true,
    comment: '能量属性文案（如"财富·活力"，软性运营文案）'
  },
  pairing: {
    type: Sequelize.STRING(500),
    allowNull: true,
    comment: '搭配建议文案（如"搭配白水晶提亮"）'
  },
  size_length_mm: {
    type: Sequelize.DECIMAL(5, 1),
    allowNull: true,
    comment: '异形珠实物长边(mm)，如跑环14.5；圆珠为空'
  },
  size_width_mm: {
    type: Sequelize.DECIMAL(5, 1),
    allowNull: true,
    comment: '异形珠实物短边(mm)，如跑环4.5；圆珠为空'
  },
  bore_orientation: {
    type: Sequelize.ENUM('along_length', 'along_width', 'none'),
    allowNull: false,
    defaultValue: 'none',
    comment: '穿绳方向：along_length绳穿长轴(管珠) / along_width绳穿短边(药片) / none圆珠'
  }
})

const INDEX_NAME = 'idx_diy_materials_item_type'

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      const columns = NEW_COLUMNS(Sequelize)
      const table = await queryInterface.describeTable('diy_materials')

      for (const [name, definition] of Object.entries(columns)) {
        if (table[name]) {
          console.log(`⏭️  diy_materials.${name} 已存在，跳过`)
          continue
        }
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.addColumn('diy_materials', name, definition, { transaction })
        console.log(`✅ diy_materials.${name} 已添加`)
      }

      // 创建索引前检查现有索引，避免重复索引
      const [indexes] = await sequelize.query('SHOW INDEX FROM diy_materials', { transaction })
      const hasIndex = indexes.some(idx => idx.Key_name === INDEX_NAME)
      if (!hasIndex) {
        await queryInterface.addIndex('diy_materials', ['item_type'], {
          name: INDEX_NAME,
          transaction
        })
        console.log(`✅ 索引 ${INDEX_NAME} 已创建`)
      } else {
        console.log(`⏭️  索引 ${INDEX_NAME} 已存在，跳过`)
      }

      // 回读验证：确认 10 列全部落库
      const after = await queryInterface.describeTable('diy_materials')
      const missing = Object.keys(columns).filter(name => !after[name])
      if (missing.length > 0) {
        throw new Error(`列添加不完整，缺失: ${missing.join(', ')}`)
      }
      console.log('✅ diy_materials 展示字段 10 列全部就绪')

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      const [indexes] = await sequelize.query('SHOW INDEX FROM diy_materials', { transaction })
      if (indexes.some(idx => idx.Key_name === INDEX_NAME)) {
        await queryInterface.removeIndex('diy_materials', INDEX_NAME, { transaction })
      }

      const columns = Object.keys(NEW_COLUMNS(Sequelize))
      for (const name of columns.reverse()) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.removeColumn('diy_materials', name, { transaction })
      }

      await transaction.commit()
      console.log('⏪ diy_materials 展示字段 10 列已回滚')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
