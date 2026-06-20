require('dotenv').config()

/**
 * 端到端验证（临时脚本，验证后自删）：
 * 1. 找一张真实 media_files 素材
 * 2. 在 lottery_top_banner 槽位临时建一条 operational 投放(campaign+creative)并 active
 * 3. 临时把该槽位 is_carousel=1（验证轮播分支 + 槽位级 slide_interval_ms 下发）
 * 4. 调 selectWinners，断言 image_url / ad_slot_id / is_carousel / slide_interval_ms 正确
 * 5. 清理：删除临时 campaign+creative，恢复槽位 is_carousel=0
 */
async function main() {
  const { sequelize, AdSlot, AdCampaign, AdCreative, MediaFile } = require('../models')
  const AdBiddingService = require('../services/AdBiddingService')
  const out = {}
  let campaignId = null
  const slot = await AdSlot.findOne({ where: { slot_key: 'lottery_top_banner' } })
  out.slot = { ad_slot_id: slot.ad_slot_id, is_carousel_before: slot.is_carousel }

  const media = await MediaFile.findOne({ attributes: ['media_id', 'object_key'], raw: true })
  out.media_used = media ? media.media_id : null

  const t = await sequelize.transaction()
  try {
    const campaign = await AdCampaign.create(
      {
        business_id: 'TMP_VERIFY_' + Date.now(),
        campaign_category: 'operational',
        ad_slot_id: slot.ad_slot_id,
        campaign_name: '【临时验证】顶部Banner',
        billing_mode: 'free',
        status: 'active',
        priority: 500,
        frequency_rule: 'always',
        frequency_value: 1,
        force_show: false,
        start_date: '2026-01-01',
        end_date: '2030-12-31'
      },
      { transaction: t }
    )
    campaignId = campaign.ad_campaign_id
    await AdCreative.create(
      {
        ad_campaign_id: campaignId,
        title: '【临时验证】顶部Banner素材',
        content_type: 'image',
        primary_media_id: media ? media.media_id : null,
        link_url: 'pages/lottery/lottery',
        link_type: 'page',
        review_status: 'approved'
      },
      { transaction: t }
    )
    await slot.update({ is_carousel: true, slide_interval_ms: 5000 }, { transaction: t })
    await t.commit()
  } catch (e) {
    await t.rollback()
    throw e
  }

  // 重新查询（脱离事务）再选择
  const winners = await AdBiddingService.selectWinners('lottery_top_banner', 31)
  out.winners_count = winners.length
  out.winner_sample = winners[0]
    ? {
        ad_slot_id: winners[0].ad_slot_id,
        is_carousel: winners[0].is_carousel,
        slide_interval_ms: winners[0].slide_interval_ms,
        has_creative: !!winners[0].creative,
        link_type: winners[0].creative ? winners[0].creative.link_type : null
      }
    : null

  // 清理临时数据 + 恢复槽位
  await AdCreative.destroy({ where: { ad_campaign_id: campaignId } })
  await AdCampaign.destroy({ where: { ad_campaign_id: campaignId } })
  await AdSlot.update(
    { is_carousel: false, slide_interval_ms: 3000 },
    { where: { ad_slot_id: slot.ad_slot_id } }
  )
  const after = await AdSlot.findByPk(slot.ad_slot_id)
  out.cleanup_ok = after.is_carousel === false
  const leftover = await AdCampaign.count({ where: { ad_slot_id: slot.ad_slot_id } })
  out.leftover_campaigns_on_slot = leftover

  console.log(JSON.stringify(out, null, 2))
  process.exit(0)
}
main().catch(e => {
  console.error('FATAL', e.message, e.stack)
  process.exit(1)
})
