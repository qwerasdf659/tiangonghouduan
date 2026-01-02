const db = require('../models')

console.log('✅ 模型加载测试')
console.log('ExchangeItem:', !!db.ExchangeItem)
console.log('ExchangeRecord:', !!db.ExchangeRecord)
console.log('Account:', !!db.Account)
console.log('AccountAssetBalance:', !!db.AccountAssetBalance)
console.log('AssetTransaction:', !!db.AssetTransaction)
console.log('LotteryPrize:', !!db.LotteryPrize)
console.log('LotteryDraw:', !!db.LotteryDraw)

console.log(
  '\n总模型数量:',
  Object.keys(db).filter(k => !k.startsWith('_') && k !== 'sequelize' && k !== 'Sequelize').length
)

process.exit(0)
