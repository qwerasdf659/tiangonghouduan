'use strict'

/**
 * 添加列: ad_campaigns.announcement_type（公告类型，仅 announcement 槽位的 system 类计划使用）
 *
 * 创建时间: 2026-06-11 北京时间
 * 创建原因（议题2·拍板组合，已确认）:
 * - campaign_category（commercial/operational/system）是"内部运营分类"（决定计费/审核流程），
 *   不是面向用户展示的"公告类型"。小程序公告条需要的是"系统/活动/维护/通知"这类用户可读类型。
 * - 后端字典 system_dictionaries.announcement_type 已存在 4 个取值
 *   （system=系统公告 / activity=活动公告 / maintenance=维护公告 / notice=通知），无需新增字典数据。
 *   缺的只是：① ad_campaigns 没有存"公告类型"的列；② ad-delivery 接口没把它下发。
 * - 本列补齐"建列"这一环。取值合法性由 Service 层查字典校验（拍板项1方案C：字典为唯一数据源，
 *   不在模型/库层再写一份枚举常量或 CHECK，避免"字典+常量"双枚举技术债）。
 *
 * 字段语义: 仅 campaign_category='system' 且投放到 announcement 槽位时有业务含义；
 *           commercial/operational 及非公告计划该列恒为 NULL。
 * 字符集: 随表 utf8mb4_unicode_ci。
 * 回滚: 删除该列。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('ad_campaigns', 'announcement_type', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment:
        '公告类型(仅announcement槽位用，值对齐字典announcement_type：system=系统公告/activity=活动公告/maintenance=维护公告/notice=通知；NULL=非公告)'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('ad_campaigns', 'announcement_type')
  }
}
