// 测试缓存命中场景：第一次写入缓存，第二次从缓存读取，验证 materialAssetType 是否保留
require('dotenv').config()
const LotteryQueryService = require('./services/lottery/QueryService')
const DataSanitizer = require('./services/DataSanitizer')

;(async () => {
  // 第一次：强制刷新，写入缓存
  console.log('=== PASS 1: DB query + cache write ===')
  await LotteryQueryService.getCampaignWithPrizes('CAMP20250901001', { refresh: true })
  console.log('Cache written.\n')

  // 第二次：从缓存读取
  console.log('=== PASS 2: Cache hit ===')
  const { prizes } = await LotteryQueryService.getCampaignWithPrizes('CAMP20250901001')

  console.log('Raw cached prizes:')
  prizes.forEach((p, i) => {
    console.log(
      JSON.stringify({
        idx: i,
        name: p.prize_name,
        has_materialAssetType: p.materialAssetType != null,
        mat_icon_url: p.materialAssetType ? p.materialAssetType.icon_url : 'MISSING',
        has_image: p.image != null
      })
    )
  })

  // 用 public 脱敏（和前端一样）
  console.log('\nSanitized (public) from cache:')
  const sanitized = DataSanitizer.sanitizePrizes(prizes, 'public')
  sanitized.forEach((p, i) => {
    console.log(
      JSON.stringify({
        idx: i,
        name: p.prize_name,
        image_url: p.image ? p.image.url : 'NULL',
        image_source: p.image ? p.image.source : 'NULL'
      })
    )
  })

  process.exit(0)
})().catch(e => {
  console.error('Error:', e.message, e.stack)
  process.exit(1)
})
