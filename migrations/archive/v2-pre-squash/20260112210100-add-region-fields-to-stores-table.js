/**
 * 数据库迁移：门店表行政区划字段升级
 *
 * @description 删除旧的 region 字段，新增标准化的省市区街道字段（code + name 冗余存储）
 * @breaking_change 此迁移会清空 stores 表数据！执行前请确保已备份或准备好批量导入数据
 *
 * 变更内容：
 * 1. 清空 stores 表数据（TRUNCATE）
 * 2. 删除旧的 region 字段（VARCHAR(50) 自由文本）
 * 3. 删除 region 字段的索引
 * 4. 新增 8 个标准化字段：
 *    - province_code/province_name: 省级代码和名称
 *    - city_code/city_name: 市级代码和名称
 *    - district_code/district_name: 区县级代码和名称
 *    - street_code/street_name: 街道级代码和名称
 * 5. 为 *_code 字段创建索引
 *
 * @since 2026-01-12
 * @see docs/省市区级联选择功能设计方案.md
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：升级门店表的行政区划字段
   *
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @param {Object} Sequelize - Sequelize 类
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    // 1. 清空关联表和 stores 表数据（已拍板：旧数据直接删除不导出）
    console.log('⚠️ 暂时禁用外键检查...')
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0;')

    console.log('⚠️ 清空 stores 表及关联表数据...')
    // 清空依赖 stores 的关联表（按依赖顺序）
    await queryInterface.bulkDelete('merchant_operation_logs', {})
    console.log('   - merchant_operation_logs 已清空')
    await queryInterface.bulkDelete('stores', {})
    console.log('   - stores 已清空')

    console.log('✅ 恢复外键检查...')
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1;')
    console.log('✅ stores 表数据已清空')

    // 2. 检查并删除 region 字段的索引
    const [indexes] = await queryInterface.sequelize.query(
      "SHOW INDEX FROM stores WHERE Column_name = 'region'"
    )

    if (indexes.length > 0) {
      const indexName = indexes[0].Key_name
      console.log(`🗑️ 删除索引: ${indexName}`)
      await queryInterface.removeIndex('stores', indexName)
    }

    // 3. 删除旧的 region 字段
    console.log('🗑️ 删除 region 字段...')
    await queryInterface.removeColumn('stores', 'region')
    console.log('✅ region 字段已删除')

    // 4. 新增省级字段
    console.log('📝 新增省级字段...')
    await queryInterface.addColumn('stores', 'province_code', {
      type: Sequelize.STRING(12),
      allowNull: false,
      comment: '省级行政区划代码（必填，用于关联查询）'
    })

    await queryInterface.addColumn('stores', 'province_name', {
      type: Sequelize.STRING(100),
      allowNull: false,
      comment: '省级名称（冗余字段，必填，修改区域时刷新）'
    })

    // 5. 新增市级字段
    console.log('📝 新增市级字段...')
    await queryInterface.addColumn('stores', 'city_code', {
      type: Sequelize.STRING(12),
      allowNull: false,
      comment: '市级行政区划代码（必填，用于关联查询）'
    })

    await queryInterface.addColumn('stores', 'city_name', {
      type: Sequelize.STRING(100),
      allowNull: false,
      comment: '市级名称（冗余字段，必填，修改区域时刷新）'
    })

    // 6. 新增区县级字段
    console.log('📝 新增区县级字段...')
    await queryInterface.addColumn('stores', 'district_code', {
      type: Sequelize.STRING(12),
      allowNull: false,
      comment: '区县级行政区划代码（必填，用于关联查询）'
    })

    await queryInterface.addColumn('stores', 'district_name', {
      type: Sequelize.STRING(100),
      allowNull: false,
      comment: '区县级名称（冗余字段，必填，修改区域时刷新）'
    })

    // 7. 新增街道级字段
    console.log('📝 新增街道级字段...')
    await queryInterface.addColumn('stores', 'street_code', {
      type: Sequelize.STRING(12),
      allowNull: false,
      comment: '街道级行政区划代码（必填，门店必须精确到街道）'
    })

    await queryInterface.addColumn('stores', 'street_name', {
      type: Sequelize.STRING(100),
      allowNull: false,
      comment: '街道级名称（冗余字段，必填，修改区域时刷新）'
    })

    // 8. 创建索引
    console.log('📇 创建索引...')
    await queryInterface.addIndex('stores', ['province_code'], {
      name: 'idx_stores_province_code'
    })

    await queryInterface.addIndex('stores', ['city_code'], {
      name: 'idx_stores_city_code'
    })

    await queryInterface.addIndex('stores', ['district_code'], {
      name: 'idx_stores_district_code'
    })

    await queryInterface.addIndex('stores', ['street_code'], {
      name: 'idx_stores_street_code'
    })

    console.log('✅ stores 表行政区划字段升级完成')
    console.log('⚠️ 提醒：请通过批量导入接口导入新门店数据')
  },

  /**
   * 回滚迁移：恢复旧的 region 字段
   *
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @param {Object} Sequelize - Sequelize 类
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    // 1. 删除新索引
    console.log('🗑️ 删除新索引...')
    await queryInterface.removeIndex('stores', 'idx_stores_province_code')
    await queryInterface.removeIndex('stores', 'idx_stores_city_code')
    await queryInterface.removeIndex('stores', 'idx_stores_district_code')
    await queryInterface.removeIndex('stores', 'idx_stores_street_code')

    // 2. 删除新字段
    console.log('🗑️ 删除新字段...')
    await queryInterface.removeColumn('stores', 'province_code')
    await queryInterface.removeColumn('stores', 'province_name')
    await queryInterface.removeColumn('stores', 'city_code')
    await queryInterface.removeColumn('stores', 'city_name')
    await queryInterface.removeColumn('stores', 'district_code')
    await queryInterface.removeColumn('stores', 'district_name')
    await queryInterface.removeColumn('stores', 'street_code')
    await queryInterface.removeColumn('stores', 'street_name')

    // 3. 恢复旧的 region 字段
    console.log('📝 恢复 region 字段...')
    await queryInterface.addColumn('stores', 'region', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: '所属区域（如：东城区、西城区）'
    })

    // 4. 恢复索引
    await queryInterface.addIndex('stores', ['region'], {
      name: 'stores_region'
    })

    console.log('✅ stores 表已回滚到旧结构')
  }
}
