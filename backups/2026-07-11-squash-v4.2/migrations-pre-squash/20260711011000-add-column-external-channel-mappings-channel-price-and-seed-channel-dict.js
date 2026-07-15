'use strict'

/**
 * S5 分销映射增强（拍板 #24/#26，2026-07-11 拍板执行）
 *
 * 1. 加列 external_channel_mappings.channel_price DECIMAL(10,2) NULL
 *    - 拍板 #26：各渠道可独立加价（存渠道价），NULL=默认取我方价
 *    - 一对一映射（#28）下映射行即渠道 listing，渠道价挂映射行，零新表
 *    - 单位：人民币元（外部平台计价口径，与我方材料资产计价正交）
 *
 * 2. 种子 system_dictionaries 新增 dict_type='distribution_channel'
 *    - 拍板 #24：渠道做成字典可扩展，加渠道零 DDL（管理台字典页可维护）
 *    - 初始渠道：taobao 淘宝 / douyin 抖音（拍板定稿两个）+ jd 京东 / pdd 拼多多（预置停用）
 *
 * 回滚：删列 + 删字典行。
 */

const DICT_TYPE = 'distribution_channel'

/** 初始渠道字典行（拍板 #24：taobao/douyin 启用，jd/pdd 预置停用备将来一键启用） */
const CHANNEL_DICT_ROWS = [
  { dict_code: 'taobao', dict_name: '淘宝', sort_order: 1, is_enabled: 1 },
  { dict_code: 'douyin', dict_name: '抖音', sort_order: 2, is_enabled: 1 },
  { dict_code: 'jd', dict_name: '京东', sort_order: 3, is_enabled: 0 },
  { dict_code: 'pdd', dict_name: '拼多多', sort_order: 4, is_enabled: 0 }
]

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. 加渠道价列（幂等：已存在则跳过）
    const table = await queryInterface.describeTable('external_channel_mappings')
    if (!table.channel_price) {
      await queryInterface.addColumn('external_channel_mappings', 'channel_price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: '渠道独立售价(人民币元,NULL=默认取我方价,拍板#26)'
      })
    }

    // 2. 种子渠道字典（幂等：按 dict_type+dict_code 查重后插入）
    const now = new Date()
    for (const row of CHANNEL_DICT_ROWS) {
      const [existing] = await queryInterface.sequelize.query(
        'SELECT system_dictionary_id FROM system_dictionaries WHERE dict_type = :type AND dict_code = :code',
        { replacements: { type: DICT_TYPE, code: row.dict_code } }
      )
      if (existing.length === 0) {
        await queryInterface.bulkInsert('system_dictionaries', [
          {
            dict_type: DICT_TYPE,
            dict_code: row.dict_code,
            dict_name: row.dict_name,
            dict_color: null,
            sort_order: row.sort_order,
            is_enabled: row.is_enabled,
            remark: 'S5 分销渠道（拍板 #24 字典化，加渠道零 DDL）',
            version: 1,
            created_at: now,
            updated_at: now
          }
        ])
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DELETE FROM system_dictionaries WHERE dict_type = :type',
      { replacements: { type: DICT_TYPE } }
    )
    const table = await queryInterface.describeTable('external_channel_mappings')
    if (table.channel_price) {
      await queryInterface.removeColumn('external_channel_mappings', 'channel_price')
    }
  }
}
