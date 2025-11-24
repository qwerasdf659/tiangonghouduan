/**
 * 配置冲突检测脚本
 * 
 * 功能：检测数据库配置和代码配置是否存在重复定义
 * 用途：防止配置管理混乱，确保配置职责清晰
 * 
 * 创建时间：2025年11月23日
 */

const models = require('../models')
const businessConfig = require('../config/business.config')

/**
 * 配置冲突检测器
 */
class ConfigConflictDetector {
  /**
   * 从代码配置中提取所有配置键
   */
  extractCodeConfigKeys (config, prefix = '') {
    const keys = []
    
    Object.entries(config).forEach(([key, value]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key
      
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        // 递归处理嵌套对象
        keys.push(...this.extractCodeConfigKeys(value, fullKey))
      } else {
        keys.push(fullKey)
      }
    })
    
    return keys
  }
  
  /**
   * 检测配置冲突
   */
  async detect () {
    try {
      console.log('🔍 开始检测配置冲突...\n')
      
      // 1. 获取数据库配置
      const dbSettings = await models.SystemSettings.findAll()
      const dbKeys = dbSettings.map(s => s.setting_key)
      
      console.log(`📊 数据库配置: ${dbKeys.length}个`)
      console.log(`   分类: ${[...new Set(dbSettings.map(s => s.category))].join(', ')}\n`)
      
      // 2. 获取代码配置
      const codeKeys = this.extractCodeConfigKeys(businessConfig)
      
      console.log(`📊 代码配置: ${codeKeys.length}个`)
      console.log(`   主要: lottery, points等\n`)
      
      // 3. 检测重复定义
      const conflicts = []
      dbKeys.forEach(dbKey => {
        // 检查是否在代码配置中存在相似键名
        const similarCodeKeys = codeKeys.filter(codeKey => 
          codeKey.toLowerCase().includes(dbKey.toLowerCase()) ||
          dbKey.toLowerCase().includes(codeKey.toLowerCase())
        )
        
        if (similarCodeKeys.length > 0) {
          conflicts.push({
            db_key: dbKey,
            code_keys: similarCodeKeys,
            category: dbSettings.find(s => s.setting_key === dbKey).category
          })
        }
      })
      
      // 4. 输出结果
      if (conflicts.length > 0) {
        console.log('⚠️ 发现可能的配置冲突:\n')
        conflicts.forEach(conflict => {
          console.log(`  - 数据库: ${conflict.db_key} (${conflict.category})`)
          console.log(`    代码中相似: ${conflict.code_keys.join(', ')}`)
          console.log('')
        })
        
        console.log('💡 建议:')
        console.log('  - 运营配置 → 保留在数据库')
        console.log('  - 技术配置 → 移至代码文件')
        console.log('  - 算法参数 → 禁止放数据库\n')
        
        return { conflicts, count: conflicts.length }
      } else {
        console.log('✅ 未发现配置冲突\n')
        return { conflicts: [], count: 0 }
      }
    } catch (error) {
      console.error('❌ 检测失败:', error.message)
      throw error
    }
  }
}

// 执行检测
(async () => {
  try {
    const detector = new ConfigConflictDetector()
    const result = await detector.detect()
    
    await models.sequelize.close()
    
    // 如果有严重冲突，退出码1
    process.exit(result.count > 5 ? 1 : 0)
  } catch (error) {
    console.error('执行失败:', error)
    process.exit(1)
  }
})()

