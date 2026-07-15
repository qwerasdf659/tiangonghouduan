'use strict'

/**
 * 新增 DIY 饰品材料分组字典（dict_type='diy_material_group'）
 *
 * 背景（DIY饰品定制交付包 拍板 1 / 拍板 16，2026-07-15 定案）：
 * - DIY 饰品材料（实物水晶珠子）与资产系统的「源晶水晶」是两个不同业务域，
 *   DIY 分组不复用、不污染资产字典 asset_group_defs（那套是可交易源晶资产的色系分组）。
 * - DIY 采用自有分组维度，落地载体复用项目现成的 system_dictionaries 通用字典设施
 *   （dict_type + dict_code → dict_name 中文名 + dict_color 色值），零新增表/服务。
 * - 消费方：
 *   1. GET /api/v4/diy/material-groups（MaterialService.getMaterialGroups 经
 *      DisplayNameService 下发 display_name + color_hex，小程序分组 Tab 动态渲染）
 *   2. admin 素材录入页 / 槽位标注器的分组下拉与标签
 *
 * 八组定义（white/pink 为本次新增的 DIY 专属分组，其余六组与 DIY 存量分组码同名但
 * 语义独立，仅归 DIY 域使用）。dict_color 用十六进制色值（与 rarity 字典同格式）。
 *
 * 回滚：down 删除 dict_type='diy_material_group' 的全部字典行。
 */

/** DIY 材料分组字典行（dict_code 即 diy_materials.group_code 的合法取值） */
const DIY_MATERIAL_GROUPS = [
  { dict_code: 'white', dict_name: '白水晶系', dict_color: '#F5F5F5', sort_order: 1 },
  { dict_code: 'pink', dict_name: '粉晶系', dict_color: '#F8BBD0', sort_order: 2 },
  { dict_code: 'purple', dict_name: '紫水晶系', dict_color: '#9C27B0', sort_order: 3 },
  { dict_code: 'yellow', dict_name: '黄水晶系', dict_color: '#FFEB3B', sort_order: 4 },
  { dict_code: 'blue', dict_name: '蓝水晶系', dict_color: '#2196F3', sort_order: 5 },
  { dict_code: 'red', dict_name: '红水晶系', dict_color: '#F44336', sort_order: 6 },
  { dict_code: 'green', dict_name: '绿水晶系', dict_color: '#4CAF50', sort_order: 7 },
  { dict_code: 'orange', dict_name: '橙茶水晶系', dict_color: '#FF9800', sort_order: 8 }
]

module.exports = {
  async up(queryInterface) {
    for (const group of DIY_MATERIAL_GROUPS) {
      /* 幂等插入：命中 uk_type_code(dict_type, dict_code) 时更新名称/色值/排序 */
      await queryInterface.sequelize.query(
        `INSERT INTO system_dictionaries
           (dict_type, dict_code, dict_name, dict_color, sort_order, is_enabled, remark, version, created_at, updated_at)
         VALUES
           ('diy_material_group', :dict_code, :dict_name, :dict_color, :sort_order, 1,
            'DIY饰品材料分组（DIY自有维度，与资产字典 asset_group_defs 解耦，拍板1）', 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           dict_name = VALUES(dict_name),
           dict_color = VALUES(dict_color),
           sort_order = VALUES(sort_order),
           is_enabled = 1,
           updated_at = NOW()`,
        { replacements: group }
      )
    }
    console.log('✅ DIY 材料分组字典已写入（dict_type=diy_material_group，共 8 组）')
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DELETE FROM system_dictionaries WHERE dict_type = 'diy_material_group'"
    )
    console.log('⏪ 已删除 DIY 材料分组字典（dict_type=diy_material_group）')
  }
}
