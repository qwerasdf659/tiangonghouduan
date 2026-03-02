'use strict'

/**
 * 迁移：更新遗留的活动编码为新格式 CAMP{YYYYMMDD}{seq}
 *
 * 业务背景：V4 采用 CampaignCodeGenerator 生成统一格式的活动编码，
 * 旧格式（BASIC_LOTTERY、CAMP_{timestamp}_{random}）不符合新规范
 *
 * @module migrations/update-legacy-campaign-codes
 */
module.exports = {
  async up(queryInterface) {
    // 活动 ID=1: BASIC_LOTTERY → CAMP20250901001（基于该活动的创建时间推算）
    await queryInterface.sequelize.query(
      "UPDATE lottery_campaigns SET campaign_code = 'CAMP20250901001' WHERE campaign_code = 'BASIC_LOTTERY'"
    )
    // 活动 ID=25: CAMP_1769298977641_853LKG → CAMP20250325025
    await queryInterface.sequelize.query(
      "UPDATE lottery_campaigns SET campaign_code = 'CAMP20250325025' WHERE campaign_code = 'CAMP_1769298977641_853LKG'"
    )
    // 活动 ID=26: CAMP_1769299553926_MRXZNB → CAMP20250325026
    await queryInterface.sequelize.query(
      "UPDATE lottery_campaigns SET campaign_code = 'CAMP20250325026' WHERE campaign_code = 'CAMP_1769299553926_MRXZNB'"
    )
    // 活动 ID=27: CAMP_1769347406486_TUS05A → CAMP20250325027
    await queryInterface.sequelize.query(
      "UPDATE lottery_campaigns SET campaign_code = 'CAMP20250325027' WHERE campaign_code = 'CAMP_1769347406486_TUS05A'"
    )
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "UPDATE lottery_campaigns SET campaign_code = 'BASIC_LOTTERY' WHERE campaign_code = 'CAMP20250901001'"
    )
    await queryInterface.sequelize.query(
      "UPDATE lottery_campaigns SET campaign_code = 'CAMP_1769298977641_853LKG' WHERE campaign_code = 'CAMP20250325025'"
    )
    await queryInterface.sequelize.query(
      "UPDATE lottery_campaigns SET campaign_code = 'CAMP_1769299553926_MRXZNB' WHERE campaign_code = 'CAMP20250325026'"
    )
    await queryInterface.sequelize.query(
      "UPDATE lottery_campaigns SET campaign_code = 'CAMP_1769347406486_TUS05A' WHERE campaign_code = 'CAMP20250325027'"
    )
  }
}
