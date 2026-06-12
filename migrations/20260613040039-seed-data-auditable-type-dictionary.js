'use strict'

/**
 * 业务审核类型字典（auditable_type）
 *
 * 创建时间: 2026-06-13 北京时间
 * 创建原因（审批管理页"业务类型显示英文 trade_dispute"问题·方案A 后端中文化）:
 * - 审核链 auditable_type 存的是英文业务码（trade_dispute/consumption/merchant_points），
 *   技术标识用英文 snake_case 正确；但下发给前端展示时需经字典转中文，避免英文码裸露给运营/用户。
 * - 本字典为唯一数据源：审核链下发接口通过 displayNameHelper.attachDisplayNames 输出
 *   auditable_type_display（中文），小程序 + web 管理后台直接读中文字段，前端零维护。
 *
 * 取值来源: 直连真实库 restaurant_points_dev 实测，当前 approval_chain_templates/instances 的
 *           auditable_type 去重仅 3 种：consumption / merchant_points / trade_dispute。
 * 字符集: 随表 utf8mb4_unicode_ci。
 * 回滚: 删除 dict_type='auditable_type' 的全部字典行。
 */

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const rows = [
      {
        dict_type: 'auditable_type',
        dict_code: 'consumption',
        dict_name: '消费审核',
        dict_color: 'bg-info',
        sort_order: 1,
        is_enabled: 1,
        version: 1,
        remark: '商家扫码录入的消费记录审核',
        created_at: now,
        updated_at: now
      },
      {
        dict_type: 'auditable_type',
        dict_code: 'merchant_points',
        dict_name: '商家积分审核',
        dict_color: 'bg-warning',
        sort_order: 2,
        is_enabled: 1,
        version: 1,
        remark: '商家积分申请审核',
        created_at: now,
        updated_at: now
      },
      {
        dict_type: 'auditable_type',
        dict_code: 'trade_dispute',
        dict_name: '交易纠纷',
        dict_color: 'bg-danger',
        sort_order: 3,
        is_enabled: 1,
        version: 1,
        remark: '交易纠纷仲裁审核',
        created_at: now,
        updated_at: now
      }
    ]

    const transaction = await queryInterface.sequelize.transaction()
    try {
      for (const row of rows) {
        const [found] = await queryInterface.sequelize.query(
          'SELECT system_dictionary_id FROM system_dictionaries WHERE dict_type = :dt AND dict_code = :dc LIMIT 1',
          { replacements: { dt: row.dict_type, dc: row.dict_code }, transaction }
        )
        if (!found.length) {
          await queryInterface.bulkInsert('system_dictionaries', [row], { transaction })
        }
      }
      await transaction.commit()
    } catch (e) {
      await transaction.rollback()
      throw e
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DELETE FROM system_dictionaries WHERE dict_type = 'auditable_type'"
    )
  }
}
