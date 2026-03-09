// 输出一个完整的 sanitized prize 对象，看前端实际收到的 JSON 结构
require('dotenv').config()
const LotteryQueryService = require('./services/lottery/QueryService')
const DataSanitizer = require('./services/DataSanitizer')

;(async () => {
  const { prizes } = await LotteryQueryService.getCampaignWithPrizes('CAMP20250901001')
  const sanitized = DataSanitizer.sanitizePrizes(prizes, 'public')

  // 输出第一个（钻石）和最后一个（积分）的完整结构
  console.log('=== DIAMOND (idx 0) full structure ===')
  console.log(JSON.stringify(sanitized[0], null, 2))
  console.log('\n=== POINTS (idx 11) full structure ===')
  console.log(JSON.stringify(sanitized[11], null, 2))

  // 对比两者的 key 差异
  const dKeys = Object.keys(sanitized[0]).sort()
  const _pKeys = Object.keys(sanitized[11]).sort()
  const diff = dKeys.filter(
    k => JSON.stringify(sanitized[0][k]) !== JSON.stringify(sanitized[11][k])
  )
  console.log('\n=== Fields that differ between DIAMOND and POINTS ===')
  diff.forEach(k => {
    console.log(
      `  ${k}: DIAMOND=${JSON.stringify(sanitized[0][k])} | POINTS=${JSON.stringify(sanitized[11][k])}`
    )
  })

  process.exit(0)
})().catch(e => {
  console.error(e.message)
  process.exit(1)
})
