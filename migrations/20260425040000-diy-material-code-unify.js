/**
 * DIY 材料编码统一 — 编码规则统一方案 D14-A
 *
 * 业务背景：
 * - material_code 存在两套格式：语义化命名（yellow_crystal_8mm）和自动生成（DMMNQ8ZVDZB6I0）
 * - 语义化命名不走 OrderNoGenerator，使用 Math.random() 而非 crypto
 * - 需要统一为 DM{YYMMDD}{6位序列}{2位hex} 格式（16 位定长）
 *
 * 迁移内容：
 * 1. 回填所有非 DM 格式的 material_code 为 OrderNoGenerator 生成的 16 位编码
 * 2. 同步更新 diy_works.design_data 中引用的旧 material_code
 *
 * @module migrations/20260425040000-diy-material-code-unify
 */

'use strict'

const crypto = require('crypto')

/**
 * 复刻 OrderNoGenerator.generate 逻辑（迁移脚本不依赖业务代码）
 * @param {string} bizCode - 业务前缀
 * @param {number} recordId - 记录 ID
 * @param {Date} createdAt - 创建时间
 * @returns {string} 16 位编码
 */
function generateCode(bizCode, recordId, createdAt) {
  const d = new Date(createdAt)
  const s = d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })
  const local = new Date(s)
  const yy = String(local.getFullYear()).slice(2)
  const mm = String(local.getMonth() + 1).padStart(2, '0')
  const dd = String(local.getDate()).padStart(2, '0')
  const datePart = `${yy}${mm}${dd}`
  const seqPart = String(recordId % 1_000_000).padStart(6, '0')
  const randomPart = crypto.randomBytes(1).toString('hex').toUpperCase()
  return `${bizCode.toUpperCase()}${datePart}${seqPart}${randomPart}`
}

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🔧 [迁移] DIY 材料编码统一（D14-A）— 开始执行...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================
      // 第1步：查询所有需要回填的材料
      // ========================================
      const [materials] = await queryInterface.sequelize.query(
        `SELECT diy_material_id, material_code, created_at
         FROM diy_materials
         ORDER BY diy_material_id`,
        { transaction }
      )

      console.log(`  📊 材料总数: ${materials.length}`)

      // 构建旧编码 → 新编码映射表
      const codeMapping = {}
      let updateCount = 0

      for (const mat of materials) {
        const oldCode = mat.material_code
        const newCode = generateCode('DM', mat.diy_material_id, mat.created_at)

        // 已经是正确的 16 位 DM 格式则跳过
        if (/^DM\d{6}\d{6}[0-9A-F]{2}$/.test(oldCode) && oldCode.length === 16) {
          console.log(`  ⏭️  ${oldCode} 已是标准格式，跳过`)
          continue
        }

        codeMapping[oldCode] = newCode

        await queryInterface.sequelize.query(
          `UPDATE diy_materials SET material_code = :newCode WHERE diy_material_id = :id`,
          { replacements: { newCode, id: mat.diy_material_id }, transaction }
        )
        updateCount++
        console.log(`  ✅ ${oldCode} → ${newCode}`)
      }

      console.log(`  📊 材料编码回填: ${updateCount} 条`)

      // ========================================
      // 第2步：更新 diy_works.design_data 中的旧引用
      // ========================================
      const [works] = await queryInterface.sequelize.query(
        `SELECT diy_work_id, design_data FROM diy_works WHERE design_data IS NOT NULL`,
        { transaction }
      )

      let workUpdateCount = 0
      for (const work of works) {
        const dd = typeof work.design_data === 'string'
          ? JSON.parse(work.design_data)
          : work.design_data

        if (!dd || !dd.beads || !Array.isArray(dd.beads)) continue

        let changed = false
        for (const bead of dd.beads) {
          if (bead.material_code && codeMapping[bead.material_code]) {
            bead.material_code = codeMapping[bead.material_code]
            changed = true
          }
        }

        if (changed) {
          await queryInterface.sequelize.query(
            `UPDATE diy_works SET design_data = :designData WHERE diy_work_id = :id`,
            {
              replacements: { designData: JSON.stringify(dd), id: work.diy_work_id },
              transaction
            }
          )
          workUpdateCount++
        }
      }

      console.log(`  📊 作品 design_data 更新: ${workUpdateCount} 条`)

      await transaction.commit()
      console.log('✅ [迁移] DIY 材料编码统一 — 完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [迁移] DIY 材料编码统一 — 失败，已回滚:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('⚠️  [回滚] DIY 材料编码统一 — 此迁移为数据回填，回滚需要手动恢复旧编码')
    console.log('⚠️  旧编码已在迁移日志中记录，可通过日志手动恢复')
  }
}
