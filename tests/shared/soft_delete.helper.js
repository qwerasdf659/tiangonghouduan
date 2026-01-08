/**
 * 软删除功能通用测试套件
 *
 * **业务场景**: 提供可复用的软删除测试逻辑,避免在每个业务模块重复编写相同测试
 * **技术特性**: 支持Sequelize的paranoid模式,验证deleted_at字段
 * **使用方式**: 在业务测试中导入并调用测试方法
 *
 * 创建时间: 2025-11-14
 * 适用范围: 所有实现软删除功能的模型
 */

/**
 * 软删除通用测试工具类
 */
class SoftDeleteTestSuite {
  /**
   * 测试模型是否正确实现软删除功能
   *
   * @param {Object} Model - Sequelize模型类
   * @param {Object} testData - 用于创建测试记录的数据
   * @param {string} primaryKey - 主键字段名,默认'id'
   * @returns {Promise<Object>} 被软删除的记录
   *
   * @example
   * // 🔴 P0-1修复：使用 global.testData 获取动态 user_id
   * const deletedRecord = await SoftDeleteTestSuite.testSoftDelete(
   *   UserPointsLog,
   *   { user_id: global.testData.testUser.user_id, amount: 100, type: 'earn' },
   *   'log_id'
   * )
   */
  static async testSoftDelete(Model, testData, primaryKey = 'id') {
    // 1. 创建测试记录
    const record = await Model.create(testData)
    expect(record).toBeDefined()
    const recordId = record[primaryKey]
    console.log(`✅ 创建测试记录: ${Model.name}[${primaryKey}=${recordId}]`)

    // 2. 执行软删除
    await record.destroy()
    console.log(`🗑️ 执行软删除: ${Model.name}[${primaryKey}=${recordId}]`)

    // 3. 验证deleted_at已设置
    const deletedRecord = await Model.findByPk(recordId, {
      paranoid: false // 查询包含软删除的记录
    })
    expect(deletedRecord).toBeDefined()
    expect(deletedRecord.deleted_at).not.toBeNull()
    console.log(`✅ deleted_at已设置: ${deletedRecord.deleted_at}`)

    // 4. 验证正常查询查不到(paranoid模式默认过滤软删除记录)
    const normalQuery = await Model.findByPk(recordId)
    expect(normalQuery).toBeNull()
    console.log('✅ 正常查询已过滤软删除记录')

    return deletedRecord
  }

  /**
   * 测试软删除恢复功能
   *
   * @param {Object} Model - Sequelize模型类
   * @param {number|string} recordId - 记录主键ID
   * @param {string} primaryKey - 主键字段名,默认'id'
   * @returns {Promise<Object>} 恢复后的记录
   *
   * @example
   * const restoredRecord = await SoftDeleteTestSuite.testRestore(
   *   UserPointsLog,
   *   logId,
   *   'log_id'
   * )
   */
  static async testRestore(Model, recordId, primaryKey = 'id') {
    // 1. 查找被软删除的记录
    const deletedRecord = await Model.findByPk(recordId, {
      paranoid: false
    })
    expect(deletedRecord).toBeDefined()
    expect(deletedRecord.deleted_at).not.toBeNull()
    console.log(`✅ 找到软删除记录: ${Model.name}[${primaryKey}=${recordId}]`)

    // 2. 执行恢复
    await deletedRecord.restore()
    console.log(`♻️ 执行恢复: ${Model.name}[${primaryKey}=${recordId}]`)

    // 3. 验证deleted_at已清空
    await deletedRecord.reload()
    expect(deletedRecord.deleted_at).toBeNull()
    console.log('✅ deleted_at已清空')

    // 4. 验证正常查询可以查到
    const restoredRecord = await Model.findByPk(recordId)
    expect(restoredRecord).toBeDefined()
    expect(restoredRecord[primaryKey]).toBe(recordId)
    console.log('✅ 正常查询可以查到恢复的记录')

    return restoredRecord
  }

  /**
   * 测试软删除不影响其他记录
   *
   * @param {Object} Model - Sequelize模型类
   * @param {Array} testDataList - 多条测试数据
   * @param {number} deleteIndex - 要删除的记录索引
   * @param {string} primaryKey - 主键字段名
   * @returns {Promise<void>} 无返回值
   */
  static async testSoftDeleteIsolation(Model, testDataList, deleteIndex, primaryKey = 'id') {
    // 1. 批量创建测试记录
    const records = await Model.bulkCreate(testDataList)
    expect(records.length).toBe(testDataList.length)
    console.log(`✅ 创建${records.length}条测试记录`)

    // 2. 软删除指定记录
    const targetRecord = records[deleteIndex]
    await targetRecord.destroy()
    console.log(`🗑️ 软删除第${deleteIndex + 1}条记录`)

    // 3. 验证其他记录仍然存在
    const remainingRecords = await Model.findAll({
      where: {
        [primaryKey]: records.map(r => r[primaryKey])
      }
    })
    expect(remainingRecords.length).toBe(testDataList.length - 1)
    console.log(`✅ 其他${remainingRecords.length}条记录不受影响`)

    // 4. 清理测试数据
    await Model.destroy({
      where: {
        [primaryKey]: records.map(r => r[primaryKey])
      },
      force: true // 物理删除
    })
    console.log('🧹 清理测试数据')
  }

  /**
   * 测试批量软删除功能
   *
   * @param {Object} Model - Sequelize模型类
   * @param {Array} testDataList - 多条测试数据
   * @param {string} primaryKey - 主键字段名
   * @returns {Promise<number>} 被删除的记录数
   */
  static async testBulkSoftDelete(Model, testDataList, primaryKey = 'id') {
    // 1. 批量创建测试记录
    const records = await Model.bulkCreate(testDataList)
    const ids = records.map(r => r[primaryKey])
    console.log(`✅ 创建${records.length}条测试记录`)

    // 2. 批量软删除
    const deletedCount = await Model.destroy({
      where: {
        [primaryKey]: ids
      }
    })
    expect(deletedCount).toBe(testDataList.length)
    console.log(`🗑️ 批量软删除${deletedCount}条记录`)

    // 3. 验证所有记录都被软删除
    const remainingRecords = await Model.findAll({
      where: {
        [primaryKey]: ids
      }
    })
    expect(remainingRecords.length).toBe(0)
    console.log('✅ 正常查询查不到任何记录')

    // 4. 验证deleted_at都已设置
    const deletedRecords = await Model.findAll({
      where: {
        [primaryKey]: ids
      },
      paranoid: false
    })
    expect(deletedRecords.length).toBe(testDataList.length)
    deletedRecords.forEach(record => {
      expect(record.deleted_at).not.toBeNull()
    })
    console.log('✅ 所有记录的deleted_at都已设置')

    // 5. 清理测试数据
    await Model.destroy({
      where: {
        [primaryKey]: ids
      },
      force: true
    })

    return deletedCount
  }
}

/**
 * 软删除测试辅助函数
 */
class SoftDeleteHelpers {
  /**
   * 创建软删除测试数据
   *
   * @param {Object} baseData - 基础数据
   * @param {number} count - 创建数量
   * @returns {Array} 测试数据数组
   */
  static createTestData(baseData, count = 3) {
    return Array.from({ length: count }, (_, index) => ({
      ...baseData,
      // 添加索引以区分不同记录
      _test_index: index
    }))
  }

  /**
   * 验证软删除模型配置
   *
   * @param {Object} Model - Sequelize模型类
   * @returns {Object} 配置验证结果
   */
  static validateModelConfig(Model) {
    const options = Model.options
    const result = {
      hasParanoid: options.paranoid === true,
      hasDeletedAt: options.deletedAt !== undefined,
      deletedAtField: options.deletedAt || 'deleted_at',
      isValid: false
    }

    result.isValid = result.hasParanoid && result.hasDeletedAt

    if (!result.isValid) {
      console.warn(`⚠️ ${Model.name}模型未正确配置软删除:`, result)
    }

    return result
  }
}

// 导出测试工具类
module.exports = {
  SoftDeleteTestSuite,
  SoftDeleteHelpers
}
