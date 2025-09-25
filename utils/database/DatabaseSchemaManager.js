/**
 * 数据库表结构管理器 V4
 * 专门负责表结构检查、修改和索引管理
 * 从UnifiedDatabaseHelper中拆分的表结构管理职责
 * 创建时间：2025年01月21日 北京时间
 */

const { QueryTypes } = require('sequelize')
const { getConnectionManager } = require('./DatabaseConnectionManager')

class DatabaseSchemaManager {
  constructor () {
    this.connectionManager = getConnectionManager()
  }

  /**
   * 获取Sequelize实例
   * @returns {Sequelize} Sequelize实例
   */
  get sequelize () {
    return this.connectionManager.getSequelize()
  }

  /**
   * 检查表是否存在
   * @param {string} tableName 表名
   * @returns {Promise<boolean>} 表是否存在
   */
  async tableExists (tableName) {
    try {
      await this.connectionManager.ensureConnection()
      const result = await this.sequelize.query(
        'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        {
          replacements: [process.env.DB_NAME, tableName],
          type: QueryTypes.SELECT
        }
      )
      return result[0].count > 0
    } catch (error) {
      console.error(`[DatabaseSchemaManager] 检查表存在性失败 (${tableName}):`, error.message)
      return false
    }
  }

  /**
   * 获取表结构
   * @param {string} tableName 表名
   * @returns {Promise<Array>} 表结构信息
   */
  async getTableStructure (tableName) {
    try {
      await this.connectionManager.ensureConnection()
      return await this.sequelize.query(`DESCRIBE ${tableName}`, {
        type: QueryTypes.SELECT
      })
    } catch (error) {
      console.error(`[DatabaseSchemaManager] 获取表结构失败 (${tableName}):`, error.message)
      throw error
    }
  }

  /**
   * 检查列是否存在
   * @param {string} tableName 表名
   * @param {string} columnName 列名
   * @returns {Promise<boolean>} 列是否存在
   */
  async columnExists (tableName, columnName) {
    try {
      const structure = await this.getTableStructure(tableName)
      return structure.some(column => column.Field === columnName)
    } catch (error) {
      console.error(`[DatabaseSchemaManager] 检查列存在性失败 (${tableName}.${columnName}):`, error.message)
      return false
    }
  }

  /**
   * 添加列
   * @param {string} tableName 表名
   * @param {string} columnName 列名
   * @param {string} columnDefinition 列定义
   * @returns {Promise<boolean>} 是否成功
   */
  async addColumn (tableName, columnName, columnDefinition) {
    try {
      await this.connectionManager.ensureConnection()

      // 检查列是否已存在
      const exists = await this.columnExists(tableName, columnName)
      if (exists) {
        console.log(`[DatabaseSchemaManager] 列已存在: ${tableName}.${columnName}`)
        return true
      }

      // 添加列
      await this.sequelize.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
      console.log(`[DatabaseSchemaManager] 成功添加列: ${tableName}.${columnName}`)
      return true
    } catch (error) {
      console.error(`[DatabaseSchemaManager] 添加列失败 (${tableName}.${columnName}):`, error.message)
      return false
    }
  }

  /**
   * 修改列
   * @param {string} tableName 表名
   * @param {string} columnName 列名
   * @param {string} columnDefinition 新列定义
   * @returns {Promise<boolean>} 是否成功
   */
  async modifyColumn (tableName, columnName, columnDefinition) {
    try {
      await this.connectionManager.ensureConnection()
      await this.sequelize.query(`ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} ${columnDefinition}`)
      console.log(`[DatabaseSchemaManager] 成功修改列: ${tableName}.${columnName}`)
      return true
    } catch (error) {
      console.error(`[DatabaseSchemaManager] 修改列失败 (${tableName}.${columnName}):`, error.message)
      return false
    }
  }

  /**
   * 获取表的索引信息
   * @param {string} tableName 表名
   * @returns {Promise<Array>} 索引信息数组
   */
  async getTableIndexes (tableName) {
    try {
      await this.connectionManager.ensureConnection()
      const indexes = await this.sequelize.query(`SHOW INDEX FROM ${tableName}`, {
        type: QueryTypes.SELECT
      })

      // 按索引名分组
      const indexMap = new Map()
      indexes.forEach(index => {
        const keyName = index.Key_name
        if (!indexMap.has(keyName)) {
          indexMap.set(keyName, {
            name: keyName,
            unique: index.Non_unique === 0,
            columns: [],
            type: index.Index_type
          })
        }
        indexMap.get(keyName).columns.push({
          column: index.Column_name,
          sequence: index.Seq_in_index
        })
      })

      return Array.from(indexMap.values())
    } catch (error) {
      console.error(`[DatabaseSchemaManager] 获取索引信息失败 (${tableName}):`, error.message)
      throw error
    }
  }

  /**
   * 检查索引完整性
   * @returns {Promise<Object>} 索引检查结果
   */
  async checkIndexIntegrity () {
    try {
      await this.connectionManager.ensureConnection()

      // 获取所有表名
      const tables = await this.sequelize.query('SHOW TABLES', {
        type: QueryTypes.SELECT
      })

      const missingIndexes = []
      const redundantIndexes = []

      // 定义关键表的必需索引
      const requiredIndexes = {
        users: [
          { columns: ['phone'], unique: true, name: 'idx_users_phone' },
          { columns: ['created_at'], unique: false, name: 'idx_users_created_at' }
        ],
        lottery_draws: [
              { columns: ['user_id'], unique: false, name: 'idx_lottery_draws_user_id' },
              { columns: ['draw_time'], unique: false, name: 'idx_lottery_draws_draw_time' },
              { columns: ['is_winner'], unique: false, name: 'idx_lottery_draws_is_winner' }
            ],
        user_points_accounts: [
          { columns: ['user_id'], unique: true, name: 'idx_user_points_accounts_user_id' },
          { columns: ['updated_at'], unique: false, name: 'idx_user_points_accounts_updated_at' }
        ]
      }

      for (const table of tables) {
        const tableName = Object.values(table)[0]
        const required = requiredIndexes[tableName]

        if (required) {
          const existingIndexes = await this.getTableIndexes(tableName)

          for (const reqIndex of required) {
            const exists = existingIndexes.some(existing =>
              existing.unique === reqIndex.unique &&
              existing.columns.length === reqIndex.columns.length &&
              reqIndex.columns.every(col => existing.columns.some(c => c.column === col))
            )

            if (!exists) {
              missingIndexes.push({
                table: tableName,
                index: reqIndex
              })
            }
          }
        }
      }

      return {
        type: 'indexIntegrityCheck',
        success: missingIndexes.length === 0,
        missingIndexes,
        redundantIndexes,
        totalChecked: tables.length
      }
    } catch (error) {
      console.error('[DatabaseSchemaManager] 索引完整性检查失败:', error.message)
      throw error
    }
  }

  /**
   * 创建缺失的索引
   * @param {Array} missingIndexes 缺失的索引数组
   * @returns {Promise<Object>} 创建结果
   */
  async createMissingIndexes (missingIndexes) {
    const results = {
      created: 0,
      failed: 0,
      details: []
    }

    for (const missing of missingIndexes) {
      try {
        const { table, index } = missing
        const columnList = index.columns.join(', ')
        const uniqueStr = index.unique ? 'UNIQUE' : ''

        await this.sequelize.query(
          `CREATE ${uniqueStr} INDEX ${index.name} ON ${table} (${columnList})`
        )

        results.created++
        results.details.push({
          table,
          index: index.name,
          status: 'created'
        })

        console.log(`[DatabaseSchemaManager] 创建索引成功: ${table}.${index.name}`)
      } catch (error) {
        results.failed++
        results.details.push({
          table: missing.table,
          index: missing.index.name,
          status: 'failed',
          error: error.message
        })

        console.error(`[DatabaseSchemaManager] 创建索引失败: ${missing.table}.${missing.index.name}`, error.message)
      }
    }

    return results
  }

  /**
   * 检查外键约束
   * @returns {Promise<Object>} 外键约束检查结果
   */
  async checkForeignKeyConstraints () {
    try {
      await this.connectionManager.ensureConnection()

      const foreignKeys = await this.sequelize.query(`
        SELECT 
          TABLE_NAME,
          COLUMN_NAME,
          CONSTRAINT_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE 
        WHERE REFERENCED_TABLE_SCHEMA = ? 
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `, {
        replacements: [process.env.DB_NAME],
        type: QueryTypes.SELECT
      })

      // 定义必需的外键约束
      const requiredConstraints = [
        {
          table: 'lottery_draws',
          column: 'user_id',
          referencedTable: 'users',
          referencedColumn: 'id'
        },
        {
          table: 'user_points_accounts',
          column: 'user_id',
          referencedTable: 'users',
          referencedColumn: 'id'
        }
      ]

      const missingConstraints = []

      for (const required of requiredConstraints) {
        const exists = foreignKeys.some(fk =>
          fk.TABLE_NAME === required.table &&
          fk.COLUMN_NAME === required.column &&
          fk.REFERENCED_TABLE_NAME === required.referencedTable &&
          fk.REFERENCED_COLUMN_NAME === required.referencedColumn
        )

        if (!exists) {
          missingConstraints.push(required)
        }
      }

      return {
        type: 'foreignKeyCheck',
        success: missingConstraints.length === 0,
        existingConstraints: foreignKeys.length,
        missingConstraints,
        requiredCount: requiredConstraints.length
      }
    } catch (error) {
      console.error('[DatabaseSchemaManager] 外键约束检查失败:', error.message)
      throw error
    }
  }

  /**
   * 创建缺失的外键约束
   * @param {Array} missingConstraints 缺失的外键约束数组
   * @returns {Promise<Object>} 创建结果
   */
  async createMissingForeignKeys (missingConstraints) {
    const results = {
      created: 0,
      failed: 0,
      details: []
    }

    for (const constraint of missingConstraints) {
      try {
        const constraintName = `fk_${constraint.table}_${constraint.column}`

        await this.sequelize.query(`
          ALTER TABLE ${constraint.table} 
          ADD CONSTRAINT ${constraintName} 
          FOREIGN KEY (${constraint.column}) 
          REFERENCES ${constraint.referencedTable}(${constraint.referencedColumn})
          ON DELETE CASCADE ON UPDATE CASCADE
        `)

        results.created++
        results.details.push({
          table: constraint.table,
          constraint: constraintName,
          status: 'created'
        })

        console.log(`[DatabaseSchemaManager] 创建外键约束成功: ${constraintName}`)
      } catch (error) {
        results.failed++
        results.details.push({
          table: constraint.table,
          constraint: `fk_${constraint.table}_${constraint.column}`,
          status: 'failed',
          error: error.message
        })

        console.error('[DatabaseSchemaManager] 创建外键约束失败:', error.message)
      }
    }

    return results
  }

  /**
   * 检查重复表
   * @returns {Promise<Object>} 重复表检查结果
   */
  async checkDuplicateTables () {
    try {
      await this.connectionManager.ensureConnection()

      const tables = await this.sequelize.query('SHOW TABLES', {
        type: QueryTypes.SELECT
      })

      const tableNames = tables.map(table => Object.values(table)[0])
      const duplicates = []
      const seen = new Set()

      for (const tableName of tableNames) {
        const lowerName = tableName.toLowerCase()
        if (seen.has(lowerName)) {
          duplicates.push(tableName)
        } else {
          seen.add(lowerName)
        }
      }

      return {
        type: 'duplicateTableCheck',
        success: duplicates.length === 0,
        totalTables: tableNames.length,
        duplicates,
        uniqueTables: seen.size
      }
    } catch (error) {
      console.error('[DatabaseSchemaManager] 重复表检查失败:', error.message)
      throw error
    }
  }
}

// 导出单例实例获取函数
let schemaManager = null

function getSchemaManager () {
  if (!schemaManager) {
    schemaManager = new DatabaseSchemaManager()
  }
  return schemaManager
}

module.exports = {
  DatabaseSchemaManager,
  getSchemaManager
}
