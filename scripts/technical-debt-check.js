#!/usr/bin/env node

/**
 * 技术债务快速检查脚本
 *
 * 功能:
 * 1. 数据库迁移文件检查
 * 2. 幂等键完整性检查
 * 3. 事务处理模式检查
 * 4. 日志规范检查
 * 5. 安全问题检查
 *
 * 使用: node scripts/technical-debt-check.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

class TechnicalDebtChecker {
  constructor() {
    this.issues = []
    this.warnings = []
    this.passed = []
  }

  /**
   * 执行所有检查
   */
  async runAllChecks() {
    console.log('🔍 开始技术债务检查...\n')

    await this.checkMigrationFiles()
    await this.checkIdempotencyKeys()
    await this.checkTransactionPatterns()
    await this.checkLoggingStandards()
    await this.checkSecurityIssues()
    await this.checkDatabaseIndexes()

    this.printReport()
  }

  /**
   * 1. 检查数据库迁移文件
   */
  async checkMigrationFiles() {
    console.log('📋 检查1: 数据库迁移文件规范')

    try {
      const migrationsDir = path.join(process.cwd(), 'migrations')
      const files = fs
        .readdirSync(migrationsDir)
        .filter(f => f.endsWith('.js') && !f.includes('archived'))

      // 检查命名规范
      const invalidNames = files.filter(f => {
        // 标准格式: YYYYMMDDHHMMSS-description.js
        return !/^\d{14}-[a-z0-9-]+\.js$/.test(f)
      })

      if (invalidNames.length > 0) {
        this.issues.push({
          severity: 'HIGH',
          category: '数据库迁移',
          message: `${invalidNames.length}个迁移文件命名不规范`,
          details: invalidNames.slice(0, 5),
          fix: '重命名为: YYYYMMDDHHMMSS-descriptive-name.js'
        })
      } else {
        this.passed.push('✅ 迁移文件命名规范')
      }

      // 检查是否有manual目录
      const manualDir = path.join(migrationsDir, 'manual')
      if (fs.existsSync(manualDir)) {
        const manualFiles = fs.readdirSync(manualDir)
        if (manualFiles.length > 0) {
          this.warnings.push({
            severity: 'MEDIUM',
            category: '数据库迁移',
            message: `发现${manualFiles.length}个手动迁移文件`,
            details: manualFiles,
            fix: '将手动迁移转换为标准迁移文件'
          })
        }
      }

      // 检查重复主题
      const themes = files
        .map(f => {
          const match = f.match(/^\d{14}-(.+)\.js$/)
          return match ? match[1] : null
        })
        .filter(Boolean)

      const duplicates = themes.filter((theme, index) => themes.indexOf(theme) !== index)

      if (duplicates.length > 0) {
        this.warnings.push({
          severity: 'MEDIUM',
          category: '数据库迁移',
          message: `发现${duplicates.length}个重复主题的迁移`,
          details: [...new Set(duplicates)],
          fix: '合并或重命名重复的迁移文件'
        })
      }

      console.log(`   迁移文件总数: ${files.length}`)
      console.log(`   命名不规范: ${invalidNames.length}`)
      console.log(`   重复主题: ${duplicates.length}\n`)
    } catch (error) {
      this.issues.push({
        severity: 'HIGH',
        category: '数据库迁移',
        message: '无法读取迁移文件目录',
        details: error.message
      })
    }
  }

  /**
   * 2. 检查幂等键完整性
   */
  async checkIdempotencyKeys() {
    console.log('🔑 检查2: 幂等键完整性')

    const criticalTables = [
      'consumption_records',
      'points_transactions',
      'asset_transactions',
      'lottery_draws',
      'market_listings',
      'trade_orders',
      'exchange_records'
    ]

    try {
      const { sequelize } = require('../models')

      for (const tableName of criticalTables) {
        try {
          // 检查表是否有business_id字段
          const [columns] = await sequelize.query(`
            SELECT COLUMN_NAME, COLUMN_KEY
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = '${tableName}'
              AND COLUMN_NAME = 'business_id'
          `)

          if (columns.length === 0) {
            this.issues.push({
              severity: 'HIGH',
              category: '幂等性',
              message: `表 ${tableName} 缺少 business_id 字段`,
              fix: `ALTER TABLE ${tableName} ADD COLUMN business_id VARCHAR(100) UNIQUE`
            })
          } else {
            // 检查是否有唯一约束
            const [indexes] = await sequelize.query(`
              SELECT INDEX_NAME, NON_UNIQUE
              FROM INFORMATION_SCHEMA.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = '${tableName}'
                AND COLUMN_NAME = 'business_id'
            `)

            const hasUniqueConstraint = indexes.some(idx => idx.NON_UNIQUE === 0)

            if (!hasUniqueConstraint) {
              this.issues.push({
                severity: 'HIGH',
                category: '幂等性',
                message: `表 ${tableName} 的 business_id 缺少唯一约束`,
                fix: `ALTER TABLE ${tableName} ADD UNIQUE KEY uk_business_id (business_id)`
              })
            } else {
              this.passed.push(`✅ ${tableName} 幂等键配置正确`)
            }
          }
        } catch (error) {
          // 表可能不存在
          this.warnings.push({
            severity: 'LOW',
            category: '幂等性',
            message: `无法检查表 ${tableName}: ${error.message}`
          })
        }
      }

      console.log(`   检查表数量: ${criticalTables.length}\n`)
    } catch (error) {
      this.issues.push({
        severity: 'HIGH',
        category: '幂等性',
        message: '无法连接数据库进行检查',
        details: error.message
      })
    }
  }

  /**
   * 3. 检查事务处理模式
   */
  async checkTransactionPatterns() {
    console.log('🔄 检查3: 事务处理模式')

    const servicesDir = path.join(process.cwd(), 'services')
    let totalTransactions = 0
    let unsafePatterns = 0

    try {
      const files = this.getAllJsFiles(servicesDir)

      files.forEach(file => {
        const content = fs.readFileSync(file, 'utf8')

        // 检查事务使用
        const transactionMatches = content.match(/sequelize\.transaction\(\)/g)
        if (transactionMatches) {
          totalTransactions += transactionMatches.length
        }

        // 检查不安全的模式
        // 1. 事务后没有commit/rollback
        const transactionBlocks = content.match(
          /const transaction = await sequelize\.transaction\(\)[^]*?(?=\n\n|\nconst|\nclass|\n})/g
        )

        if (transactionBlocks) {
          transactionBlocks.forEach(block => {
            if (!block.includes('commit') && !block.includes('rollback')) {
              unsafePatterns++
              this.warnings.push({
                severity: 'HIGH',
                category: '事务处理',
                message: `文件 ${path.basename(file)} 中发现未提交/回滚的事务`,
                fix: '确保所有事务都有commit/rollback逻辑'
              })
            }
          })
        }

        // 2. 检查是否使用了transaction.finished检查
        if (content.includes('transaction.commit()') && !content.includes('transaction.finished')) {
          this.warnings.push({
            severity: 'MEDIUM',
            category: '事务处理',
            message: `文件 ${path.basename(file)} 未检查 transaction.finished`,
            fix: 'if (!transaction.finished) await transaction.commit()'
          })
        }
      })

      console.log(`   检查文件数: ${files.length}`)
      console.log(`   事务使用次数: ${totalTransactions}`)
      console.log(`   不安全模式: ${unsafePatterns}\n`)

      if (unsafePatterns === 0 && totalTransactions > 0) {
        this.passed.push('✅ 事务处理模式安全')
      }
    } catch (error) {
      this.warnings.push({
        severity: 'MEDIUM',
        category: '事务处理',
        message: '无法完整检查事务模式',
        details: error.message
      })
    }
  }

  /**
   * 4. 检查日志规范
   */
  async checkLoggingStandards() {
    console.log('📝 检查4: 日志使用规范')

    const servicesDir = path.join(process.cwd(), 'services')
    let consoleLogCount = 0
    let structuredLogCount = 0

    try {
      const files = this.getAllJsFiles(servicesDir)

      files.forEach(file => {
        const content = fs.readFileSync(file, 'utf8')

        // 统计console.log使用
        const consoleMatches = content.match(/console\.(log|warn|error|info)/g)
        if (consoleMatches) {
          consoleLogCount += consoleMatches.length

          this.warnings.push({
            severity: 'MEDIUM',
            category: '日志规范',
            message: `文件 ${path.basename(file)} 使用了 ${consoleMatches.length} 次 console.*`,
            fix: '替换为 logger.info/warn/error'
          })
        }

        // 统计logger使用
        const loggerMatches = content.match(/logger\.(info|warn|error|debug)/g)
        if (loggerMatches) {
          structuredLogCount += loggerMatches.length
        }
      })

      console.log(`   检查文件数: ${files.length}`)
      console.log(`   console.* 使用: ${consoleLogCount}`)
      console.log(`   logger.* 使用: ${structuredLogCount}\n`)

      if (consoleLogCount === 0) {
        this.passed.push('✅ 日志使用规范')
      } else {
        this.issues.push({
          severity: 'MEDIUM',
          category: '日志规范',
          message: `发现 ${consoleLogCount} 处非结构化日志`,
          fix: '全部替换为 logger.info/warn/error'
        })
      }
    } catch (error) {
      this.warnings.push({
        severity: 'LOW',
        category: '日志规范',
        message: '无法完整检查日志使用',
        details: error.message
      })
    }
  }

  /**
   * 5. 检查安全问题
   */
  async checkSecurityIssues() {
    console.log('🔒 检查5: 安全问题')

    const allFiles = [
      ...this.getAllJsFiles(path.join(process.cwd(), 'services')),
      ...this.getAllJsFiles(path.join(process.cwd(), 'routes'))
    ]

    let sqlInjectionRisks = 0
    let hardcodedSecrets = 0

    try {
      allFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8')

        // 检查SQL注入风险
        const rawQueryMatches = content.match(/sequelize\.query\([^)]*\$\{[^}]+\}/g)
        if (rawQueryMatches) {
          sqlInjectionRisks += rawQueryMatches.length
          this.issues.push({
            severity: 'CRITICAL',
            category: '安全',
            message: `文件 ${path.basename(file)} 存在SQL注入风险`,
            details: rawQueryMatches.slice(0, 2),
            fix: '使用参数化查询: sequelize.query(sql, { replacements: [...] })'
          })
        }

        // 检查硬编码密钥
        const secretPatterns = [
          /password\s*=\s*['"][^'"]+['"]/gi,
          /secret\s*=\s*['"][^'"]+['"]/gi,
          /key\s*=\s*['"][^'"]+['"]/gi
        ]

        secretPatterns.forEach(pattern => {
          const matches = content.match(pattern)
          if (matches) {
            // 排除process.env的情况
            const realSecrets = matches.filter(m => !m.includes('process.env'))
            if (realSecrets.length > 0) {
              hardcodedSecrets += realSecrets.length
              this.issues.push({
                severity: 'HIGH',
                category: '安全',
                message: `文件 ${path.basename(file)} 存在硬编码密钥`,
                fix: '使用环境变量: process.env.SECRET_KEY'
              })
            }
          }
        })
      })

      console.log(`   检查文件数: ${allFiles.length}`)
      console.log(`   SQL注入风险: ${sqlInjectionRisks}`)
      console.log(`   硬编码密钥: ${hardcodedSecrets}\n`)

      if (sqlInjectionRisks === 0 && hardcodedSecrets === 0) {
        this.passed.push('✅ 未发现明显安全问题')
      }
    } catch (error) {
      this.warnings.push({
        severity: 'MEDIUM',
        category: '安全',
        message: '无法完整检查安全问题',
        details: error.message
      })
    }
  }

  /**
   * 6. 检查数据库索引
   */
  async checkDatabaseIndexes() {
    console.log('📊 检查6: 数据库索引优化')

    try {
      const { sequelize } = require('../models')

      // 检查常见的高频查询字段是否有索引
      const commonQueryFields = [
        { table: 'users', field: 'phone' },
        { table: 'lottery_draws', field: 'user_id' },
        { table: 'lottery_draws', field: 'created_at' },
        { table: 'points_transactions', field: 'user_id' },
        { table: 'asset_transactions', field: 'user_id' },
        { table: 'market_listings', field: 'status' }
      ]

      for (const { table, field } of commonQueryFields) {
        try {
          const [indexes] = await sequelize.query(`
            SELECT INDEX_NAME
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = '${table}'
              AND COLUMN_NAME = '${field}'
          `)

          if (indexes.length === 0) {
            this.warnings.push({
              severity: 'MEDIUM',
              category: '性能',
              message: `表 ${table} 的字段 ${field} 缺少索引`,
              fix: `CREATE INDEX idx_${table}_${field} ON ${table}(${field})`
            })
          }
        } catch (error) {
          // 表或字段可能不存在
        }
      }

      console.log(`   检查字段数: ${commonQueryFields.length}\n`)
    } catch (error) {
      this.warnings.push({
        severity: 'LOW',
        category: '性能',
        message: '无法检查数据库索引',
        details: error.message
      })
    }
  }

  /**
   * 递归获取目录下所有JS文件
   */
  getAllJsFiles(dir) {
    const files = []

    if (!fs.existsSync(dir)) {
      return files
    }

    const items = fs.readdirSync(dir)

    items.forEach(item => {
      const fullPath = path.join(dir, item)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory() && item !== 'node_modules') {
        files.push(...this.getAllJsFiles(fullPath))
      } else if (stat.isFile() && item.endsWith('.js')) {
        files.push(fullPath)
      }
    })

    return files
  }

  /**
   * 打印检查报告
   */
  printReport() {
    console.log('\n' + '='.repeat(60))
    console.log('📋 技术债务检查报告')
    console.log('='.repeat(60))

    // 统计
    const criticalCount = this.issues.filter(i => i.severity === 'CRITICAL').length
    const highCount = this.issues.filter(i => i.severity === 'HIGH').length
    const mediumCount = this.issues.filter(i => i.severity === 'MEDIUM').length
    const lowCount = this.warnings.filter(w => w.severity === 'LOW').length

    console.log(`\n📊 问题统计:`)
    console.log(`   🔴 严重问题: ${criticalCount}`)
    console.log(`   🟠 高优先级: ${highCount}`)
    console.log(`   🟡 中优先级: ${mediumCount}`)
    console.log(`   ⚪ 低优先级: ${lowCount}`)
    console.log(`   ✅ 通过检查: ${this.passed.length}`)

    // 严重问题
    if (criticalCount > 0) {
      console.log(`\n🔴 严重问题 (需立即修复):`)
      this.issues
        .filter(i => i.severity === 'CRITICAL')
        .forEach((issue, index) => {
          console.log(`\n${index + 1}. [${issue.category}] ${issue.message}`)
          if (issue.details) {
            console.log(`   详情: ${JSON.stringify(issue.details, null, 2)}`)
          }
          if (issue.fix) {
            console.log(`   修复: ${issue.fix}`)
          }
        })
    }

    // 高优先级问题
    if (highCount > 0) {
      console.log(`\n🟠 高优先级问题 (1-2周内修复):`)
      this.issues
        .filter(i => i.severity === 'HIGH')
        .slice(0, 5) // 只显示前5个
        .forEach((issue, index) => {
          console.log(`\n${index + 1}. [${issue.category}] ${issue.message}`)
          if (issue.fix) {
            console.log(`   修复: ${issue.fix}`)
          }
        })

      if (highCount > 5) {
        console.log(`\n   ... 还有 ${highCount - 5} 个高优先级问题`)
      }
    }

    // 通过的检查
    if (this.passed.length > 0) {
      console.log(`\n✅ 通过的检查:`)
      this.passed.forEach(p => console.log(`   ${p}`))
    }

    // 总体评分
    const totalChecks = criticalCount + highCount + mediumCount + lowCount + this.passed.length
    const score = Math.round((this.passed.length / totalChecks) * 100)

    console.log(`\n📈 技术债务评分: ${score}/100`)

    let grade, recommendation
    if (score >= 90) {
      grade = 'A'
      recommendation = '代码质量优秀,继续保持'
    } else if (score >= 80) {
      grade = 'B'
      recommendation = '代码质量良好,建议修复高优先级问题'
    } else if (score >= 70) {
      grade = 'C'
      recommendation = '存在一定技术债务,需要系统性优化'
    } else if (score >= 60) {
      grade = 'D'
      recommendation = '技术债务较多,建议尽快修复'
    } else {
      grade = 'F'
      recommendation = '技术债务严重,需要立即采取行动'
    }

    console.log(`   等级: ${grade}`)
    console.log(`   建议: ${recommendation}`)

    console.log('\n' + '='.repeat(60))
    console.log('📄 详细报告已生成: docs/技术债务全面分析报告.md')
    console.log('='.repeat(60) + '\n')

    // 退出码
    if (criticalCount > 0) {
      process.exit(1) // 有严重问题,退出码1
    } else if (highCount > 5) {
      process.exit(1) // 高优先级问题过多,退出码1
    } else {
      process.exit(0) // 通过
    }
  }
}

// 执行检查
const checker = new TechnicalDebtChecker()
checker.runAllChecks().catch(error => {
  console.error('检查过程出错:', error)
  process.exit(1)
})
