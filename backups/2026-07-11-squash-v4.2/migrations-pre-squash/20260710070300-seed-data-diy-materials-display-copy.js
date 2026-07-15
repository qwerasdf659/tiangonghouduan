'use strict'

/**
 * 初始化数据: diy_materials 展示文案种子（DIY 拍板决议 11.5-F / 11.8-⑤）
 *
 * 创建时间: 2026-07-10（北京时间）
 * 背景（docs/自由定制饰品diy-lite与S1-S5商品体系-对接方案与拍板决议.md 第 11.5-F 节）:
 * - 拍板 ⑤：以小程序前端离线演示时期的样例文案口径为底稿（内容冷启动通用范式
 *  「种子数据 + CMS 可改」），按材质名称（material_name）维度写入现有素材的
 *   meaning / energy / pairing / five_elements / material_type / weight 新字段。
 * - ⚠️ 合规要求：文案措辞已按广告法审过——统一使用「寓意/象征/传统文化中被称为」
 *   等表述，不含「改善/增强/招来」等功效性动词。运营须在管理台逐颗确认修订（遗留
 *   运营输入之一：文案审核责任人待指定）。
 * - 幂等与非破坏性：仅填充值为 NULL 的字段（weight 同理），不覆盖运营已录入的数据。
 *
 * 克重口径: 单颗净重(g) = 密度 2.65g/cm³ × 球体积（按 diameter 计算），保留 1 位小数
 *          （与前端演示 estimateWeight 公式一致，仅作参考展示值）。
 *
 * 回滚: 将本迁移覆盖的文案字段清回 NULL（无法区分运营后续修订，回滚按材质名整批清除）。
 */

/**
 * 材质文案底稿（键 = diy_materials.material_name）
 *
 * five_elements 按传统五行颜色学通行口径：黄→土 / 粉紫→火 / 茶蓝→水 / 绿→木 / 白→金
 */
const COPY_BY_MATERIAL_NAME = {
  黄水晶: {
    material_type: 'crystal',
    five_elements: 'earth',
    meaning: '传统文化中被称为「财富之石」，象征财富与丰盛',
    energy: '财富·丰盛',
    pairing: '搭配白水晶，色泽明快更显通透'
  },
  粉水晶: {
    material_type: 'crystal',
    five_elements: 'fire',
    meaning: '象征温柔与美好情感，寓意人缘和睦',
    energy: '温柔·人缘',
    pairing: '搭配紫水晶，粉紫渐变柔美浪漫'
  },
  茶水晶: {
    material_type: 'crystal',
    five_elements: 'water',
    meaning: '寓意沉稳踏实，象征安定从容',
    energy: '沉稳·安定',
    pairing: '搭配黄水晶，暖色系组合复古耐看'
  },
  幽灵水晶: {
    material_type: 'crystal',
    five_elements: 'wood',
    meaning: '传统文化中寓意事业兴旺，象征生机盎然',
    energy: '事业·生机',
    pairing: '搭配白水晶，绿白相间清新自然'
  },
  紫水晶: {
    material_type: 'crystal',
    five_elements: 'fire',
    meaning: '象征智慧与灵感，寓意浪漫高贵',
    energy: '智慧·灵感',
    pairing: '搭配粉水晶，粉紫配色浪漫优雅'
  },
  蓝水晶: {
    material_type: 'crystal',
    five_elements: 'water',
    meaning: '象征勇气与平静，寓意心境开阔如海',
    energy: '平静·勇气',
    pairing: '搭配白水晶，海洋色系清爽宜人'
  },
  白水晶: {
    material_type: 'crystal',
    five_elements: 'metal',
    meaning: '被誉为「水晶之王」，象征纯净与专注',
    energy: '纯净·专注',
    pairing: '百搭基础款，可衬托任意主珠色彩'
  }
}

/** 文案字段清单（回滚时按此清除） */
const COPY_FIELDS = ['five_elements', 'meaning', 'energy', 'pairing']

/**
 * 按直径估算单颗净重(g)：密度 2.65g/cm³ × (4/3)π(d/2)³（d 单位 mm → cm）
 * @param {number} diameterMm - 珠子直径(mm)
 * @returns {number} 估算克重，保留 1 位小数
 */
function estimateWeight(diameterMm) {
  const radiusCm = diameterMm / 20
  const volumeCm3 = (4 / 3) * Math.PI * Math.pow(radiusCm, 3)
  return Math.round(2.65 * volumeCm3 * 10) / 10
}

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      // 前置校验：11.5-A 的新列必须已存在
      const table = await queryInterface.describeTable('diy_materials')
      const required = ['material_type', 'five_elements', 'weight', 'meaning', 'energy', 'pairing']
      const missing = required.filter(f => !table[f])
      if (missing.length > 0) {
        throw new Error(`缺少列 ${missing.join(', ')}，请先执行 11.5-A 加列迁移`)
      }

      let updatedCount = 0

      // 按材质名批量写入文案（仅填 NULL，不覆盖运营修订）
      for (const [materialName, copy] of Object.entries(COPY_BY_MATERIAL_NAME)) {
        // eslint-disable-next-line no-await-in-loop
        const [result] = await sequelize.query(
          `UPDATE diy_materials SET
             material_type = IF(material_type = 'crystal', ?, material_type),
             five_elements = COALESCE(five_elements, ?),
             meaning       = COALESCE(meaning, ?),
             energy        = COALESCE(energy, ?),
             pairing       = COALESCE(pairing, ?)
           WHERE material_name = ?`,
          {
            replacements: [
              copy.material_type,
              copy.five_elements,
              copy.meaning,
              copy.energy,
              copy.pairing,
              materialName
            ],
            transaction
          }
        )
        updatedCount += result.affectedRows || 0
      }

      /*
       * #27「绿宝石01」的 material_name 为脏值「水晶·」，按 display_name 单独匹配。
       * 其定价问题（price=0 且启用）由 11.5-B 价格护栏在服务层阻断，此处只补文案。
       */
      await sequelize.query(
        `UPDATE diy_materials SET
           five_elements = COALESCE(five_elements, 'wood'),
           meaning       = COALESCE(meaning, '象征生机与希望，寓意欣欣向荣'),
           energy        = COALESCE(energy, '生机·希望'),
           pairing       = COALESCE(pairing, '搭配白水晶或金属隔片，更显灵动')
         WHERE display_name LIKE '绿宝石%'`,
        { transaction }
      )

      // 圆珠克重估算（仅填 NULL；异形珠 diameter 语义不同，只处理 shape=circle）
      const [beads] = await sequelize.query(
        "SELECT diy_material_id, diameter FROM diy_materials WHERE weight IS NULL AND shape = 'circle' AND diameter IS NOT NULL",
        { transaction }
      )
      for (const bead of beads) {
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query('UPDATE diy_materials SET weight = ? WHERE diy_material_id = ?', {
          replacements: [estimateWeight(Number(bead.diameter)), bead.diy_material_id],
          transaction
        })
      }

      // 回读验证：输出文案覆盖率（真实统计，非预设值）
      const [stats] = await sequelize.query(
        `SELECT COUNT(*) AS total,
                SUM(meaning IS NOT NULL) AS with_meaning,
                SUM(five_elements IS NOT NULL) AS with_five_elements,
                SUM(weight IS NOT NULL) AS with_weight
           FROM diy_materials`,
        { transaction }
      )
      console.log(
        `✅ 文案种子完成：素材 ${stats[0].total} 颗，含寓意 ${stats[0].with_meaning} / 五行 ${stats[0].with_five_elements} / 克重 ${stats[0].with_weight}（本次更新 ${updatedCount} 行）`
      )

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
      const names = Object.keys(COPY_BY_MATERIAL_NAME)
      await sequelize.query(
        `UPDATE diy_materials SET ${COPY_FIELDS.map(f => `${f} = NULL`).join(', ')}, weight = NULL
          WHERE material_name IN (?) OR display_name LIKE '绿宝石%'`,
        { replacements: [names], transaction }
      )
      await transaction.commit()
      console.log('⏪ diy_materials 文案种子已清除')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
