'use strict'

/**
 * 路线B 合规改造 模块⑤（方案 C+）：插入"业务叙事"字典词条
 *
 * 文件路径：migrations/20260608032704-seed-data-business-narrative-dict.js
 * 创建时间：2026-06-08（决策 17.5 最终版 / 第二十三节）
 *
 * 业务背景：
 * - admin 后台与后端返回的 title/message 中"抽奖/中奖"叙事词，需统一为路线B"回馈/发放"口径。
 * - 采用方案 C+：复用现有 system_dictionaries 表（不新建常量文件），新增 dict_type='business_narrative'
 *   作为业务叙事唯一数据源。前后端展示文字均经 DisplayNameService（带 Redis 缓存）取词，
 *   改名只改字典一行、不发版；技术标识符（lottery_campaign_id/draw_id/API/类型/枚举）全程不动。
 *
 * 本迁移做一件事：向 system_dictionaries 插入 dict_type='business_narrative' 全部词条。
 *
 * down 回滚：删除 dict_type='business_narrative' 的全部行（可逆）。
 *
 * 注：迁移条件用 dict_type 而非写死主键，避免依赖历史自增 ID。
 */

// 业务叙事词条：[dict_code, dict_name(回馈口径), sort_order, remark(原抽奖叫法/用途)]
const NARRATIVE_ENTRIES = [
  ['activity', '回馈活动', 1, '原"抽奖活动"，用于标题/菜单'],
  ['activity_center', '回馈管理中心', 2, '原"抽奖管理中心"，页面标题'],
  ['draw', '回馈', 3, '原"抽奖"（动作），按钮/通用'],
  ['participate', '参与回馈', 4, '原"参与抽奖"，用户抽屉'],
  ['draw_count', '回馈次数', 5, '原"抽奖次数"，图表 legend'],
  ['total_draw', '总回馈次数', 6, '原"总抽奖次数"，看板'],
  ['grant_count', '发放次数', 7, '原"中奖次数"（"中奖"合规风险更高）'],
  ['grant_rate', '发放率', 8, '原"中奖率"，图表'],
  ['record', '回馈记录', 9, '原"抽奖记录"，表格/导出'],
  ['alert', '回馈告警', 10, '原"抽奖告警"，菜单/告警中心'],
  ['intervene', '回馈干预管理', 11, '原"抽奖干预管理"，菜单'],
  ['activity_started', '回馈活动已开始', 12, '原"抽奖活动已开始"，后端通知 title'],
  ['activity_paused', '回馈活动已暂停', 13, '原"抽奖活动已暂停"，后端通知 title'],
  ['activity_ended', '回馈活动已结束', 14, '原"抽奖活动已结束"，后端通知 title'],
  ['activity_saved', '回馈活动已保存', 15, '原"抽奖活动已保存"，后端通知 title'],
  ['cost_points', '回馈消耗积分', 16, '原"抽奖消耗积分"，配置页'],
  ['daily_limit', '每日回馈上限', 17, '原"每日抽奖上限"，配置页']
]

const DICT_TYPE = 'business_narrative'

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const rows = NARRATIVE_ENTRIES.map(([dict_code, dict_name, sort_order, remark]) => ({
      dict_type: DICT_TYPE,
      dict_code,
      dict_name,
      dict_color: null,
      sort_order,
      is_enabled: 1,
      remark,
      version: 1,
      created_at: now,
      updated_at: now
    }))
    await queryInterface.bulkInsert('system_dictionaries', rows)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM system_dictionaries WHERE dict_type = '${DICT_TYPE}'`
    )
  }
}
