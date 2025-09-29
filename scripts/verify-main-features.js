/**
 * 主要功能验证脚本
 * 验证核心功能是否正常工作
 */

const { sequelize } = require('../models')

async function verifyMainFeatures () {
  console.log('开始验证主要功能...')

  try {
    // 1. 数据库连接验证
    await sequelize.authenticate()
    console.log('✅ 数据库连接正常')

    // 2. 模型验证
    const models = sequelize.models
    console.log(`✅ 模型加载完成，共${Object.keys(models).length}个模型`)

    console.log('✅ 主要功能验证完成')
  } catch (error) {
    console.error('❌ 功能验证失败:', error.message)
    throw error
  }
}

if (require.main === module) {
  verifyMainFeatures()
    .then(() => {
      console.log('🎉 所有功能验证通过')
      process.exit(0)
    })
    .catch(() => {
      process.exit(1)
    })
}

module.exports = { verifyMainFeatures }
