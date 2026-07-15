'use strict'

/**
 * 数据迁移: diy_templates.sizing_rules 回填手围/目标周长毫米字段（手围驱动定制方案）
 *
 * 创建时间: 2026-07-11（北京时间）
 * 背景（docs/diy-lite手围驱动定制方案-前端需求（对接后端与管理端）.md §11.1 / §十五 Q7 决议）:
 * - diy-lite 升级为「手围驱动全联动」定制，尺寸档位需要数值型毫米字段
 *   （wrist_size_mm 手围 / target_length_mm 目标成品周长 / elastic_margin_mm 弹力余量）；
 * - sizing_rules 为 JSON 列，本迁移只做数据回填，无任何 DDL；
 * - 数值采用 Q7 决议的行业默认值（成品内周长 = 手围 + 1.5cm 余量），
 *   上线前运营可通过模板管理页「尺寸档位」编辑区随时调整，免发版。
 *
 * 回填内容（按 label 匹配，已有值不覆盖，可重复执行）:
 * - 手链模板 #1（circle，档位 S/M/L）: wrist_size_mm 140/155/175 + target_length_mm 155/170/190
 * - 项链模板 #2（ellipse，档位 S/M/L）: 仅 target_length_mm 380/450/550
 *   （项链无"手围"概念，档位即佩戴长度，与 display 文案 38/45/55cm 一致）
 * - 两模板均写入模板级 elastic_margin_mm = 15
 *
 * 回滚: 剔除本迁移新增的 wrist_size_mm / target_length_mm / elastic_margin_mm 键，恢复原结构。
 */

/** 按模板 ID + 档位 label 的毫米数值映射（Q7 决议默认值，运营核对供应链工艺后可在管理端调整） */
const SIZING_BACKFILL_BY_TEMPLATE = {
  1: {
    // 手链（DIY_BRACELET）：手围 + 目标周长
    S: { wrist_size_mm: 140, target_length_mm: 155 },
    M: { wrist_size_mm: 155, target_length_mm: 170 },
    L: { wrist_size_mm: 175, target_length_mm: 190 }
  },
  2: {
    // 项链（DIY_NECKLACE）：无手围概念，仅目标佩戴长度（对齐 display 38/45/55cm）
    S: { target_length_mm: 380 },
    M: { target_length_mm: 450 },
    L: { target_length_mm: 550 }
  }
}

/** 模板级弹力/工艺余量默认值（毫米，Q7 决议） */
const ELASTIC_MARGIN_MM = 15

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      const templateIds = Object.keys(SIZING_BACKFILL_BY_TEMPLATE)
      const [rows] = await sequelize.query(
        `SELECT diy_template_id, sizing_rules FROM diy_templates
         WHERE diy_template_id IN (${templateIds.join(',')}) AND sizing_rules IS NOT NULL`,
        { transaction }
      )

      if (rows.length === 0) {
        console.log('✅ 目标串珠模板不存在或无 sizing_rules，跳过回填')
        await transaction.commit()
        return
      }

      for (const row of rows) {
        const backfillMap = SIZING_BACKFILL_BY_TEMPLATE[row.diy_template_id]
        const sizing =
          typeof row.sizing_rules === 'string' ? JSON.parse(row.sizing_rules) : row.sizing_rules

        /* 模板级弹力余量（已有值不覆盖，保证迁移可重复执行） */
        sizing.elastic_margin_mm = sizing.elastic_margin_mm ?? ELASTIC_MARGIN_MM

        /* 逐档回填毫米字段（按 label 匹配，未知档位保持原样） */
        sizing.size_options = (sizing.size_options || []).map(option => {
          const backfill = backfillMap[option.label]
          if (!backfill) return option
          return {
            ...option,
            ...(backfill.wrist_size_mm !== undefined
              ? { wrist_size_mm: option.wrist_size_mm ?? backfill.wrist_size_mm }
              : {}),
            target_length_mm: option.target_length_mm ?? backfill.target_length_mm
          }
        })

        // eslint-disable-next-line no-await-in-loop -- 事务内顺序写，模板数固定为 2
        await sequelize.query(
          'UPDATE diy_templates SET sizing_rules = ? WHERE diy_template_id = ?',
          { replacements: [JSON.stringify(sizing), row.diy_template_id], transaction }
        )
        console.log(
          `✅ 模板 #${row.diy_template_id} sizing_rules 已回填毫米字段（余量 ${sizing.elastic_margin_mm}mm）`
        )
      }

      /* 回读验证：每个已回填模板的所有档位必须能取到 target_length_mm 数值 */
      const [verifyRows] = await sequelize.query(
        `SELECT diy_template_id, sizing_rules FROM diy_templates
         WHERE diy_template_id IN (${templateIds.join(',')}) AND sizing_rules IS NOT NULL`,
        { transaction }
      )
      for (const row of verifyRows) {
        const sizing =
          typeof row.sizing_rules === 'string' ? JSON.parse(row.sizing_rules) : row.sizing_rules
        const incomplete = (sizing.size_options || []).filter(
          opt => !Number.isFinite(Number(opt.target_length_mm))
        )
        if (incomplete.length > 0) {
          throw new Error(
            `模板 #${row.diy_template_id} 回填后仍有档位缺 target_length_mm: ${incomplete
              .map(opt => opt.label)
              .join(', ')}`
          )
        }
      }
      console.log(`✅ 回填完成并通过验证，共处理 ${rows.length} 个串珠模板`)

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      const templateIds = Object.keys(SIZING_BACKFILL_BY_TEMPLATE)
      const [rows] = await sequelize.query(
        `SELECT diy_template_id, sizing_rules FROM diy_templates
         WHERE diy_template_id IN (${templateIds.join(',')}) AND sizing_rules IS NOT NULL`,
        { transaction }
      )

      for (const row of rows) {
        const sizing =
          typeof row.sizing_rules === 'string' ? JSON.parse(row.sizing_rules) : row.sizing_rules

        delete sizing.elastic_margin_mm
        sizing.size_options = (sizing.size_options || []).map(option => {
          const { wrist_size_mm, target_length_mm, ...rest } = option
          void wrist_size_mm
          void target_length_mm
          return rest
        })

        // eslint-disable-next-line no-await-in-loop -- 事务内顺序写，模板数固定为 2
        await sequelize.query(
          'UPDATE diy_templates SET sizing_rules = ? WHERE diy_template_id = ?',
          { replacements: [JSON.stringify(sizing), row.diy_template_id], transaction }
        )
        console.log(`⏪ 模板 #${row.diy_template_id} sizing_rules 已剔除手围毫米字段`)
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
