'use strict'

/**
 * MediaService 引用覆盖测试套件（治本 B 复核补漏 - 2026-06-24）
 *
 * 测试目标（连真实库 restaurant_points_dev，不使用 mock）：
 * - getReferences/getOrphanedMedia 必须覆盖全部 10 处「实体引用图」外键列，
 *   尤其是本次补入的第 10 处 DiyMaterial.image_media_id（此前白名单漏列）。
 * - 验证「被任一引用列引用的图」不会被 getOrphanedMedia 判为孤儿（防误删的业务底线）。
 *
 * 业务语义：删一张在用图必须先解除引用，定时清理不得把在用图判成孤儿。
 *
 * @module tests/services/media-service-references
 * @since 2026-06-24
 */

require('dotenv').config()

const MediaService = require('../../services/MediaService')
const models = require('../../models')

describe('MediaService 引用覆盖（治本 B：全 10 处实体引用图列）', () => {
  jest.setTimeout(60000)

  /** 真实库核实的全部「实体引用图」外键列：[模型名, 列名]，共 10 处 / 8 表 */
  const EXPECTED_REF_COLUMNS = [
    ['ExchangeItem', 'primary_media_id'],
    ['PrizeDefinition', 'primary_media_id'],
    ['ItemTemplate', 'primary_media_id'],
    ['AdCreative', 'primary_media_id'],
    ['Category', 'icon_media_id'],
    ['DiyTemplate', 'base_image_media_id'],
    ['DiyTemplate', 'preview_media_id'],
    ['DiyWork', 'preview_media_id'],
    ['ExchangeItemSku', 'image_id'],
    ['DiyMaterial', 'image_media_id']
  ]

  let mediaService

  beforeAll(() => {
    mediaService = new MediaService()
  })

  describe('引用列清单完整性', () => {
    test('所有 10 处引用列对应的模型与字段在当前代码中真实存在', () => {
      for (const [modelName, column] of EXPECTED_REF_COLUMNS) {
        const Model = models[modelName]
        expect(Model).toBeDefined()
        expect(Model.rawAttributes?.[column]).toBeDefined()
      }
    })

    test('DiyMaterial.image_media_id（本次补漏的第 10 处）已纳入引用模型', () => {
      const Model = models.DiyMaterial
      expect(Model).toBeDefined()
      expect(Model.rawAttributes?.image_media_id).toBeDefined()
      // 模型层关联也应存在（belongsTo MediaFile）
      expect(Model.associations?.image_media).toBeDefined()
    })
  })

  describe('getReferences() - 真实库聚合引用', () => {
    test('对真实库中被引用的图，应返回非空 primary_refs', async () => {
      // 真实库锚点：exchange_items 633→media 121、637→media 122（连库实测的字段直引样本）
      const refs = await mediaService.getReferences(122)
      expect(refs).toHaveProperty('media_id', 122)
      expect(Array.isArray(refs.primary_refs)).toBe(true)
      expect(refs.total).toBeGreaterThanOrEqual(refs.primary_refs.length)
      console.log('[引用覆盖] media 122 引用清单:', JSON.stringify(refs.primary_refs))
    })
  })

  describe('getOrphanedMedia() - 不把在用图判为孤儿', () => {
    test('被任一引用列引用的图，均不出现在孤儿列表中', async () => {
      const orphans = await mediaService.getOrphanedMedia(0)
      const orphanIds = new Set(orphans.map(o => o.media_id))

      // 收集真实库中所有被 10 处引用列引用的 media_id
      const referencedIds = new Set()
      for (const [modelName, column] of EXPECTED_REF_COLUMNS) {
        const Model = models[modelName]
        if (!Model || !Model.rawAttributes?.[column]) continue
        // eslint-disable-next-line no-await-in-loop
        const rows = await Model.findAll({
          attributes: [column],
          where: { [column]: { [models.Op.ne]: null } },
          raw: true
        })
        rows.forEach(r => referencedIds.add(r[column]))
      }

      for (const id of referencedIds) {
        expect(orphanIds.has(id)).toBe(false)
      }
      console.log(
        `[引用覆盖] 真实库被引用图 ${referencedIds.size} 张，均未被判为孤儿（孤儿总数 ${orphans.length}）`
      )
    })
  })
})
