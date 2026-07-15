/**
 * DIY 模块共享常量
 *
 * @file admin/src/modules/diy/constants.js
 * @description DIY 素材分组、形状、素材大类等三页共用常量（素材管理页/槽位标注器/模板管理页），
 *   消除各页面重复定义。分组为 DIY 自有分组维度（拍板 1），与资产字典 asset_group_defs 解耦，
 *   权威字典源为后端 system_dictionaries（dict_type='diy_material_group'），此处为管理端展示常量。
 */

/**
 * DIY 素材分组标签（group_code → 中文名）
 * 八组顺序与后端字典 sort_order 一致：白/粉/紫/黄/蓝/红/绿/橙茶
 */
export const DIY_GROUP_LABELS = {
  white: '白水晶系',
  pink: '粉晶系',
  purple: '紫水晶系',
  yellow: '黄水晶系',
  blue: '蓝水晶系',
  red: '红水晶系',
  green: '绿水晶系',
  orange: '橙茶水晶系'
}

/** DIY 素材分组下拉/多选选项（顺序同 DIY_GROUP_LABELS） */
export const DIY_GROUP_OPTIONS = Object.entries(DIY_GROUP_LABELS).map(([value, label]) => ({
  value,
  label
}))
