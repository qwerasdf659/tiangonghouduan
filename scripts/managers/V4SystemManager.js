/**
 * V4系统管理器
 * 负责系统级管理任务，包括Mock数据清理、V3兼容代码清理、数据库清理等
 * 创建时间：2025年01月21日 北京时间
 */

const fs = require('fs')
const path = require('path')

class V4SystemManager {
  constructor () {
    this.logger = {
      info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
      warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
      error: (msg, data) => console.error(`[ERROR] ${msg}`, data || '')
    }
    this.sequelize = null
  }

  /**
   * 初始化数据库连接
   */
  async initDatabase () {
    if (this.sequelize) return this.sequelize

    try {
      require('dotenv').config()
      const { Sequelize } = require('sequelize')

      this.sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
          host: process.env.DB_HOST,
          port: process.env.DB_PORT,
          dialect: 'mysql',
          logging: false
        }
      )

      await this.sequelize.authenticate()
      this.logger.info('✅ 数据库连接成功')
      return this.sequelize
    } catch (error) {
      this.logger.error('❌ 数据库连接失败:', error.message)
      throw error
    }
  }

  /**
   * 清理指定的抽奖活动及相关数据
   * @param {Array<number>} campaignIds 需要删除的活动ID数组
   * @returns {Object} 清理结果
   */
  async cleanupLotteryCampaigns (campaignIds = []) {
    let transaction = null

    try {
      this.logger.info('🧹 开始清理指定的抽奖活动数据...')
      this.logger.info(`📋 将删除活动ID: ${campaignIds.join(', ')}`)

      await this.initDatabase()
      transaction = await this.sequelize.transaction()

      const cleanupResults = {
        timestamp: new Date().toISOString(),
        campaignIds,
        deletedCounts: {},
        errors: [],
        success: true
      }

      // 1. 删除关联的抽奖记录 (lottery_records)
      this.logger.info('🗑️ 删除相关抽奖记录...')
      const [lotteryRecordsResult] = await this.sequelize.query(
        'DELETE FROM lottery_records WHERE campaign_id IN (?)',
        { replacements: [campaignIds], transaction }
      )
      cleanupResults.deletedCounts.lotteryRecords = lotteryRecordsResult.affectedRows
      this.logger.info(`✅ 删除了 ${lotteryRecordsResult.affectedRows} 条抽奖记录`)

      // 2. 删除关联的抽奖绘制记录 (lottery_draws)
      this.logger.info('🗑️ 删除相关抽奖绘制记录...')
      const [lotteryDrawsResult] = await this.sequelize.query(
        'DELETE FROM lottery_draws WHERE campaign_id IN (?)',
        { replacements: [campaignIds], transaction }
      )
      cleanupResults.deletedCounts.lotteryDraws = lotteryDrawsResult.affectedRows
      this.logger.info(`✅ 删除了 ${lotteryDrawsResult.affectedRows} 条抽奖绘制记录`)

      // 3. 删除关联的用户特定奖品队列 (user_specific_prize_queues) - 使用正确的字段名
      this.logger.info('🗑️ 删除相关用户特定奖品队列...')
      const [prizeQueuesResult] = await this.sequelize.query(
        'DELETE FROM user_specific_prize_queues WHERE campaign_id IN (?)',
        { replacements: [campaignIds], transaction }
      )
      cleanupResults.deletedCounts.prizeQueues = prizeQueuesResult.affectedRows
      this.logger.info(`✅ 删除了 ${prizeQueuesResult.affectedRows} 条用户特定奖品队列记录`)

      // 4. 删除关联的抽奖奖品 (lottery_prizes)
      this.logger.info('🗑️ 删除相关奖品配置...')
      const [prizesResult] = await this.sequelize.query(
        'DELETE FROM lottery_prizes WHERE campaign_id IN (?)',
        { replacements: [campaignIds], transaction }
      )
      cleanupResults.deletedCounts.prizes = prizesResult.affectedRows
      this.logger.info(`✅ 删除了 ${prizesResult.affectedRows} 个奖品配置`)

      // 5. 删除统一决策记录 (unified_decision_records)
      this.logger.info('🗑️ 删除相关统一决策记录...')
      const [decisionResult] = await this.sequelize.query(
        'DELETE FROM unified_decision_records WHERE campaign_id IN (?)',
        { replacements: [campaignIds], transaction }
      )
      cleanupResults.deletedCounts.decisionRecords = decisionResult.affectedRows
      this.logger.info(`✅ 删除了 ${decisionResult.affectedRows} 条统一决策记录`)

      // 6. 保底记录不需要删除（lottery_pity是按用户管理的，不按活动）
      this.logger.info('ℹ️ 跳过保底记录（lottery_pity表是按用户管理，不按活动管理）')
      cleanupResults.deletedCounts.pity = 0

      // 7. 最后删除抽奖活动本身 (lottery_campaigns)
      this.logger.info('🗑️ 删除抽奖活动配置...')
      const [campaignsResult] = await this.sequelize.query(
        'DELETE FROM lottery_campaigns WHERE campaign_id IN (?)',
        { replacements: [campaignIds], transaction }
      )
      cleanupResults.deletedCounts.campaigns = campaignsResult.affectedRows
      this.logger.info(`✅ 删除了 ${campaignsResult.affectedRows} 个抽奖活动`)

      // 提交事务
      await transaction.commit()
      this.logger.info('🎉 所有数据删除完成！事务已提交。')

      // 验证删除结果
      this.logger.info('🔍 验证删除结果...')
      const [remainingCampaigns] = await this.sequelize.query(
        'SELECT campaign_id, campaign_name FROM lottery_campaigns ORDER BY campaign_id'
      )
      cleanupResults.remainingCampaigns = remainingCampaigns

      this.logger.info('📊 剩余抽奖活动:')
      remainingCampaigns.forEach(row => {
        this.logger.info(`  ID: ${row.campaign_id}, 名称: ${row.campaign_name}`)
      })

      return cleanupResults
    } catch (error) {
      if (transaction) {
        await transaction.rollback()
        this.logger.error('❌ 删除过程出错，事务已回滚')
      }
      this.logger.error('详细错误:', error.message)

      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        campaignIds
      }
    }
  }

  /**
   * 检查和清理Mock数据
   * @returns {Object} 检查结果
   */
  async checkAndCleanMockData () {
    try {
      this.logger.info('开始检查Mock数据...')

      const mockPatterns = [
        /mock.*data/i,
        /test.*data/i,
        /fake.*data/i,
        /// 已清理：占位数据/i,
        /sample.*data/i
      ]

      const excludeDirs = ['node_modules', '.git', 'reports', 'logs', 'uploads']
      const mockFiles = []
      // 初始化Mock数据数组
      const mockData = []

      // 递归搜索Mock数据文件和代码
      const searchMockData = dir => {
        const items = fs.readdirSync(dir)

        for (const item of items) {
          const fullPath = path.join(dir, item)
          const relativePath = path.relative(process.cwd(), fullPath)

          // 跳过排除的目录
          if (excludeDirs.some(excludeDir => relativePath.startsWith(excludeDir))) {
            continue
          }

          if (fs.statSync(fullPath).isDirectory()) {
            searchMockData(fullPath)
          } else if (item.endsWith('.js') || item.endsWith('.json')) {
            // 检查文件名是否包含mock相关关键词
            if (mockPatterns.some(pattern => pattern.test(item))) {
              mockFiles.push(relativePath)
            }

            // 检查文件内容是否包含mock数据
            try {
              const content = fs.readFileSync(fullPath, 'utf8')
              const mockDataMatches = content.match(
                /(?:mock|fake|dummy|test).*(?:data|user|phone)/gi
              )
              if (mockDataMatches && mockDataMatches.length > 0) {
                mockData.push({
                  file: relativePath,
                  matches: mockDataMatches.slice(0, 3) // 只显示前3个匹配
                })
              }
            } catch (err) {
              // 忽略读取错误
            }
          }
        }
      }

      searchMockData(process.cwd())

      const result = {
        success: true,
        mockFiles,
        mockDataCount: mockData.length,
        details: mockData,
        summary: `发现${mockFiles.length}个Mock文件，${mockData.length}个包含Mock数据的文件`
      }

      // 如果发现了Mock数据，标记为需要清理
      if (mockFiles.length > 0 || mockData.length > 0) {
        result.needsCleanup = true
        this.logger.warn('发现Mock数据需要清理：', {
          mockFiles: mockFiles.length,
          mockDataFiles: mockData.length
        })
      } else {
        result.needsCleanup = false
        this.logger.info('✅ 未发现Mock数据，检查通过')
      }

      return result
    } catch (error) {
      this.logger.error('Mock数据检查失败:', error.message)
      return {
        success: false,
        error: error.message,
        needsCleanup: false
      }
    }
  }

  /**
   * 清理V3兼容代码
   * @returns {Object} 清理结果
   */
  async cleanV3CompatibilityCode () {
    try {
      this.logger.info('开始清理V3兼容代码...')

      const v3Patterns = [/v3/i, /version.*3/i, /legacy/i, /deprecated/i, /old.*version/i]

      const excludeDirs = ['node_modules', '.git', 'reports', 'logs']
      const v3Files = []

      // 递归搜索V3相关文件
      const searchV3Code = dir => {
        const items = fs.readdirSync(dir)

        for (const item of items) {
          const fullPath = path.join(dir, item)
          const relativePath = path.relative(process.cwd(), fullPath)

          // 跳过排除的目录
          if (excludeDirs.some(excludeDir => relativePath.startsWith(excludeDir))) {
            continue
          }

          if (fs.statSync(fullPath).isDirectory()) {
            searchV3Code(fullPath)
          } else if (item.endsWith('.js') || item.endsWith('.json') || item.endsWith('.md')) {
            // 检查文件名或内容是否包含V3相关关键词
            if (v3Patterns.some(pattern => pattern.test(item))) {
              v3Files.push(relativePath)
            }
          }
        }
      }

      searchV3Code(process.cwd())

      if (v3Files.length > 0) {
        this.logger.warn(`发现${v3Files.length}个V3相关文件需要处理:`)
        v3Files.forEach(file => this.logger.warn(`  - ${file}`))
      } else {
        this.logger.info('✅ 未发现V3兼容代码')
      }

      return {
        success: true,
        v3Files,
        cleanedCount: 0, // 暂时不自动删除，只是报告
        needsCleanup: v3Files.length > 0
      }
    } catch (error) {
      this.logger.error('V3代码清理失败:', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 系统健康检查
   * @returns {Object} 健康检查结果
   */
  async systemHealthCheck () {
    try {
      const checks = {
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      }

      // 检查关键目录是否存在
      const requiredDirs = ['models', 'routes', 'services', 'tests']
      checks.directories = {}

      for (const dir of requiredDirs) {
        checks.directories[dir] = fs.existsSync(dir)
      }

      // 检查环境变量
      const requiredEnvVars = ['NODE_ENV', 'DB_HOST', 'DB_NAME']
      checks.environment = {}

      for (const envVar of requiredEnvVars) {
        checks.environment[envVar] = !!process.env[envVar]
      }

      return {
        success: true,
        timestamp: new Date().toISOString(),
        checks
      }
    } catch (error) {
      this.logger.error('系统健康检查失败:', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }
}

module.exports = V4SystemManager
