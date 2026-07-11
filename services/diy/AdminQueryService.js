/**
 * DIY 管理后台查询服务
 *
 * 职责：管理端作品列表/详情/统计查询
 *
 * @module services/diy/AdminQueryService
 */

'use strict'

const { Op, fn, col, literal } = require('sequelize')
const {
  Account,
  Category,
  DiyMaterial,
  DiyTemplate,
  DiyWork,
  ExchangeRecord,
  MediaFile,
  User
} = require('../../models')
const { deriveCordOccupyMm } = require('./MaterialService')
const DiyWorkService = require('./WorkService')
/* 手围驱动方案共享常量（唯一定义在 TemplateService，与 estimate/confirm 校验同口径） */
const { DEFAULT_ELASTIC_MARGIN_MM, BEADING_SHAPES } = require('./TemplateService')

/**
 * 解析可能为字符串的 JSON 列（raw:true 查询下 MySQL JSON 列可能返回字符串）
 * @param {Object|string|null} value - JSON 列原始值
 * @returns {Object|null} 解析后的对象
 */
function parseJsonColumn(value) {
  if (!value) return null
  return typeof value === 'string' ? JSON.parse(value) : value
}

/** DIY 管理后台查询服务 */
class DiyAdminQueryService {
  /**
   * 管理端获取所有用户作品列表（支持筛选/分页）
   * @param {Object} params - { page, page_size, status, template_id, account_id, keyword }
   * @returns {{rows: DiyWork[], count: number}} 管理端分页作品列表
   */
  static async getAdminWorkList(params = {}) {
    const page = Number(params.page) || 1
    const pageSize = Number(params.page_size) || 20
    const where = {}

    if (params.status) where.status = params.status
    if (params.template_id) where.diy_template_id = Number(params.template_id)
    if (params.account_id) where.account_id = Number(params.account_id)
    if (params.keyword) {
      where[Op.or] = [
        { work_name: { [Op.like]: `%${params.keyword}%` } },
        { work_code: { [Op.like]: `%${params.keyword}%` } }
      ]
    }

    const { rows, count } = await DiyWork.findAndCountAll({
      where,
      include: [
        {
          model: DiyTemplate,
          as: 'template',
          attributes: ['diy_template_id', 'template_code', 'display_name', 'layout']
        },
        {
          model: Account,
          as: 'account',
          attributes: ['account_id', 'user_id'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['user_id', 'nickname', 'mobile']
            }
          ]
        },
        {
          model: MediaFile,
          as: 'preview_media',
          attributes: ['media_id', 'object_key', 'original_name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    })

    return { rows, count }
  }

  /**
   * 管理端获取作品详情
   * @param {number} workId - diy_work_id
   * @returns {DiyWork} 管理端作品详情
   */
  static async getAdminWorkDetail(workId) {
    const work = await DiyWork.findByPk(workId, {
      include: [
        {
          model: DiyTemplate,
          as: 'template',
          attributes: [
            'diy_template_id',
            'template_code',
            'display_name',
            'category_id',
            'layout',
            'bead_rules'
          ],
          include: [
            {
              model: Category,
              as: 'category',
              attributes: ['category_id', 'category_name', 'category_code']
            }
          ]
        },
        {
          model: Account,
          as: 'account',
          attributes: ['account_id', 'user_id'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['user_id', 'nickname', 'mobile']
            }
          ]
        },
        {
          model: MediaFile,
          as: 'preview_media',
          attributes: ['media_id', 'object_key', 'original_name']
        }
      ]
    })

    if (!work) {
      const error = new Error('作品不存在')
      error.statusCode = 404
      throw error
    }

    /*
     * 成品沿绳长度（毫米，手围驱动方案 §11.7-A3）：
     * 与 C 端 beads 接口 cord_occupy_mm / confirm 硬校验同一派生函数计算，
     * 供客服排查"戴不上手"客诉与产线发货前核对成品尺寸；
     * 素材缺物理数据或空设计时为 null（管理端展示"无法计算"）
     */
    const plain = work.toJSON()
    plain.computed_length_mm = await DiyAdminQueryService._computeWorkLengthMm(plain.design_data)
    return plain
  }

  /**
   * 计算作品的成品沿绳长度（毫米）
   *
   * 从 design_data 提取逐颗素材编码 → 查物理尺寸 → deriveCordOccupyMm 逐颗累加。
   * 任一素材缺沿绳尺寸（派生为 null）或素材不存在时返回 null（不编造估算值）。
   *
   * @param {Object} designData - 作品设计数据
   * @returns {Promise<number|null>} 成品长度毫米（1 位小数），无法精确计算时 null
   * @private
   */
  static async _computeWorkLengthMm(designData) {
    const usedCodes = DiyWorkService.extractUsedMaterialCodes(parseJsonColumn(designData))
    if (usedCodes.length === 0) return null

    const materials = await DiyMaterial.findAll({
      where: { material_code: { [Op.in]: [...new Set(usedCodes)] } },
      attributes: [
        'material_code',
        'bore_orientation',
        'diameter',
        'size_length_mm',
        'size_width_mm'
      ],
      raw: true
    })
    const materialMap = new Map(materials.map(m => [m.material_code, m]))

    let totalMm = 0
    for (const code of usedCodes) {
      const material = materialMap.get(code)
      const occupyMm = material ? deriveCordOccupyMm(material) : null
      if (occupyMm === null) return null
      totalMm += occupyMm
    }
    return Math.round(totalMm * 10) / 10
  }

  /**
   * P0 · 数据完备度统计（拍板决议 11.6-4）
   *
   * 服务当前运营录数瓶颈：素材缺图/缺文案/0价、模板缺图/未发布，
   * 全部为 diy_materials / diy_templates 单表 COUNT 聚合（真实统计，非预设值）。
   * 页内卡片点击带筛选参数跳转（缺图 → 素材页 missing_image 过滤），做成运营工作清单。
   *
   * @returns {Object} { materials: {...}, templates: {...} } 完备度计数
   * @private
   */
  static async _getCompletenessStats() {
    // ---- 素材侧完备度 ----
    const materialTotal = await DiyMaterial.count()
    const materialEnabled = await DiyMaterial.count({ where: { is_enabled: true } })
    const missingImage = await DiyMaterial.count({ where: { image_media_id: null } })
    /* 缺文案 = 寓意或五行任一为空（11.5-A 落库后的展示字段完备口径） */
    const missingCopy = await DiyMaterial.count({
      where: { [Op.or]: [{ meaning: null }, { five_elements: null }] }
    })
    const zeroPriceEnabled = await DiyMaterial.count({
      where: { price: 0, is_enabled: true }
    })
    /*
     * 缺物理数据的启用素材数（手围驱动方案 §11.5/§11.7-A1）：
     * 沿绳占用无法派生（管珠缺长边/药片缺短边/圆珠缺直径），
     * 口径与 deriveCordOccupyMm / 素材列表 missing_physical 筛选完全一致
     */
    const missingPhysical = await DiyMaterial.count({
      where: {
        is_enabled: true,
        [Op.or]: [
          { bore_orientation: 'along_length', size_length_mm: null },
          { bore_orientation: 'along_width', size_width_mm: null },
          { bore_orientation: 'none', diameter: null }
        ]
      }
    })

    // ---- 模板侧完备度 ----
    const templateTotal = await DiyTemplate.count()
    const missingPreview = await DiyTemplate.count({ where: { preview_media_id: null } })
    const missingBaseImage = await DiyTemplate.count({ where: { base_image_media_id: null } })
    const draftCount = await DiyTemplate.count({ where: { status: 'draft' } })

    /* published 但无可用素材的模板数（material_group_codes 空=全部允许） */
    const publishedTemplates = await DiyTemplate.findAll({
      where: { status: 'published', is_enabled: true },
      attributes: ['diy_template_id', 'material_group_codes', 'layout', 'sizing_rules'],
      raw: true
    })
    const enabledGroupRows = await DiyMaterial.findAll({
      where: { is_enabled: true },
      attributes: ['group_code'],
      group: ['group_code'],
      raw: true
    })
    const enabledGroups = new Set(enabledGroupRows.map(r => r.group_code))
    const publishedWithoutMaterials = publishedTemplates.filter(t => {
      const groups = parseJsonColumn(t.material_group_codes)
      if (!groups || !Array.isArray(groups) || groups.length === 0) {
        return enabledGroups.size === 0
      }
      return !groups.some(g => enabledGroups.has(g))
    }).length

    /*
     * 已发布串珠模板缺档位毫米数据的数量（手围驱动方案 §11.7-A2 兜底暴露口）：
     * 发布护栏只拦"新发布动作"，对存量 published 模板无效，这里是存量脏数据的唯一可见口。
     * 口径与 TemplateService._assertPublishable 一致：任一档位既无 wrist_size_mm 也无 target_length_mm
     */
    const publishedMissingSizing = publishedTemplates.filter(t => {
      const layout = parseJsonColumn(t.layout)
      if (!BEADING_SHAPES.includes(layout?.shape)) return false
      const sizing = parseJsonColumn(t.sizing_rules)
      const sizeOptions = sizing && Array.isArray(sizing.size_options) ? sizing.size_options : []
      if (sizeOptions.length === 0) return true
      return sizeOptions.some(
        opt =>
          !Number.isFinite(Number(opt.target_length_mm)) &&
          !Number.isFinite(Number(opt.wrist_size_mm))
      )
    }).length

    return {
      materials: {
        total: materialTotal,
        enabled_count: materialEnabled,
        disabled_count: materialTotal - materialEnabled,
        missing_image_count: missingImage,
        missing_copy_count: missingCopy,
        zero_price_enabled_count: zeroPriceEnabled,
        missing_physical_count: missingPhysical
      },
      templates: {
        total: templateTotal,
        missing_preview_count: missingPreview,
        missing_base_image_count: missingBaseImage,
        draft_count: draftCount,
        published_without_materials_count: publishedWithoutMaterials,
        published_missing_sizing_count: publishedMissingSizing
      }
    }
  }

  /**
   * P1 · 经营统计（转化漏斗 / GMV / 履约，拍板决议 11.6-4）
   *
   * - 漏斗：draft → frozen → completed / cancelled 数量与转化率（diy_works.status）
   * - GMV：completed 作品 total_cost.payments 按 asset_code 汇总（日维度），
   *   与 exchange_records(source='diy').pay_amount 交叉校验
   * - 履约：exchange_records(source='diy') 待发货数、缺收货地址数
   *
   * @param {Object} worksByStatus - 作品状态分布 { draft, frozen, completed, cancelled }
   * @returns {Object} { funnel, gmv, fulfillment } 经营统计
   * @private
   */
  static async _getOperationStats(worksByStatus) {
    const draft = worksByStatus.draft || 0
    const frozen = worksByStatus.frozen || 0
    const completed = worksByStatus.completed || 0
    const cancelled = worksByStatus.cancelled || 0
    const totalCreated = draft + frozen + completed + cancelled
    const totalConfirmed = frozen + completed + cancelled

    /**
     * 转化率计算（百分比，2 位小数；分母为 0 时返回 null 表示无数据）
     * 口径：confirm_rate = 已确认(frozen+completed+cancelled) / 全部创建；
     *       complete_rate = completed / 已确认
     * @param {number} num - 分子
     * @param {number} den - 分母
     * @returns {number|null} 百分比数值
     */
    const toRate = (num, den) => (den > 0 ? Math.round((num / den) * 10000) / 100 : null)

    const funnel = {
      draft,
      frozen,
      completed,
      cancelled,
      confirm_rate: toRate(totalConfirmed, totalCreated),
      complete_rate: toRate(completed, totalConfirmed)
    }

    // ---- GMV：completed 作品 total_cost.payments 按 asset_code / 日期汇总 ----
    const completedWorks = await DiyWork.findAll({
      where: { status: 'completed' },
      attributes: ['diy_work_id', 'total_cost', 'completed_at'],
      raw: true
    })

    const byAsset = new Map() // asset_code → 总额
    const byDay = new Map() // 'YYYY-MM-DD|asset_code' → 金额
    for (const work of completedWorks) {
      const totalCost =
        typeof work.total_cost === 'string' ? JSON.parse(work.total_cost) : work.total_cost
      const payments = Array.isArray(totalCost) ? totalCost : totalCost?.payments || []
      /* 日期按北京时间（UTC存储+展示转北京的统一口径） */
      const day = work.completed_at
        ? new Date(work.completed_at)
            .toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
            .replace(/\//g, '-')
        : 'unknown'
      for (const p of payments) {
        const amount = Number(p.amount) || 0
        byAsset.set(p.asset_code, (byAsset.get(p.asset_code) || 0) + amount)
        const dayKey = `${day}|${p.asset_code}`
        byDay.set(dayKey, (byDay.get(dayKey) || 0) + amount)
      }
    }

    /* 交叉校验：exchange_records(source='diy') pay_amount 合计 */
    const exchangeTotal = await ExchangeRecord.sum('pay_amount', { where: { source: 'diy' } })

    const gmv = {
      by_asset: [...byAsset.entries()].map(([asset_code, total_amount]) => ({
        asset_code,
        total_amount
      })),
      daily: [...byDay.entries()]
        .map(([key, amount]) => {
          const [date, asset_code] = key.split('|')
          return { date, asset_code, amount }
        })
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
      exchange_cross_check_total: Number(exchangeTotal) || 0
    }

    // ---- 履约：待发货 / 缺地址 ----
    const pendingShipment = await ExchangeRecord.count({
      where: { source: 'diy', status: 'pending' }
    })
    const missingAddress = await ExchangeRecord.count({
      where: { source: 'diy', status: 'pending', address_snapshot: null }
    })

    const fulfillment = {
      pending_shipment_count: pendingShipment,
      missing_address_count: missingAddress
    }

    return { funnel, gmv, fulfillment }
  }

  /**
   * P2 · 素材热度排行 + 素材库五行分布（拍板决议 11.6-4）
   *
   * - 热度：从 frozen/completed 作品的 total_cost.price_snapshot 聚合
   *   material_code 使用次数与金额贡献 Top20（快照字段已存在，无需解析 design_data）
   * - 五行分布：diy_materials.five_elements 拆逗号统计（运营配货平衡参考）
   *
   * @returns {Object} { material_ranking, five_elements_distribution } 素材热度统计
   * @private
   */
  static async _getMaterialHeatStats() {
    const snapshotWorks = await DiyWork.findAll({
      where: { status: { [Op.in]: ['frozen', 'completed'] } },
      attributes: ['total_cost'],
      raw: true
    })

    const heat = new Map() // material_code → { use_count, total_amount }
    for (const work of snapshotWorks) {
      const totalCost =
        typeof work.total_cost === 'string' ? JSON.parse(work.total_cost) : work.total_cost
      const snapshot = !Array.isArray(totalCost) ? totalCost?.price_snapshot || [] : []
      for (const item of snapshot) {
        const entry = heat.get(item.material_code) || { use_count: 0, total_amount: 0 }
        entry.use_count += 1
        entry.total_amount += Number(item.price) || 0
        heat.set(item.material_code, entry)
      }
    }

    /* 补充素材展示名（material_code → display_name） */
    const codes = [...heat.keys()]
    const materialNames =
      codes.length > 0
        ? await DiyMaterial.findAll({
            where: { material_code: { [Op.in]: codes } },
            attributes: ['material_code', 'display_name'],
            raw: true
          })
        : []
    const nameMap = new Map(materialNames.map(m => [m.material_code, m.display_name]))

    const materialRanking = [...heat.entries()]
      .map(([material_code, entry]) => ({
        material_code,
        display_name: nameMap.get(material_code) || material_code,
        use_count: entry.use_count,
        total_amount: entry.total_amount
      }))
      .sort((a, b) => b.use_count - a.use_count)
      .slice(0, 20)

    // ---- 素材库五行分布（拆逗号多值统计） ----
    const elementRows = await DiyMaterial.findAll({
      where: { is_enabled: true },
      attributes: ['five_elements'],
      raw: true
    })
    const elementCount = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0, unset: 0 }
    for (const row of elementRows) {
      if (!row.five_elements) {
        elementCount.unset += 1
        continue
      }
      for (const el of row.five_elements.split(',')) {
        const key = el.trim()
        if (elementCount[key] !== undefined) elementCount[key] += 1
      }
    }

    return {
      material_ranking: materialRanking,
      five_elements_distribution: elementCount
    }
  }

  /**
   * 手围档位分布 + 长度偏差分布（手围驱动方案 §11.7-B4/B5）
   *
   * - size_distribution：frozen/completed 作品按 design_data.size（label + wrist_size_mm）聚合，
   *   运营配货备料参考（哪个手围段卖得多 → 对应珠径/数量备货）
   * - length_deviation：可测作品的 |成品长度 − 目标周长| 偏差分档计数，
   *   elastic_margin_mm 余量参数是否合理的量化依据（偏差普遍偏大 → 调余量）
   *   目标周长与 confirm 校验同一套规则（档位配置值优先，否则手围+余量）
   *
   * @returns {Object} { size_distribution, length_deviation } 手围统计
   * @private
   */
  static async _getWristSizeStats() {
    const works = await DiyWork.findAll({
      where: { status: { [Op.in]: ['frozen', 'completed'] } },
      attributes: ['diy_work_id', 'design_data', 'diy_template_id'],
      raw: true
    })

    // ---- 手围档位分布（label + wrist_size_mm 分组） ----
    const distributionMap = new Map() // 'label|wrist_size_mm' → count
    let unsetCount = 0
    const perWork = [] // 长度偏差计算的中间集
    const allCodes = new Set()

    for (const row of works) {
      const designData = parseJsonColumn(row.design_data)
      const size = designData?.size || null
      const wristSizeMm = Number(size?.wrist_size_mm)

      if (Number.isFinite(wristSizeMm) && wristSizeMm > 0) {
        const key = `${size.label || '自定义'}|${wristSizeMm}`
        distributionMap.set(key, (distributionMap.get(key) || 0) + 1)
      } else {
        unsetCount += 1
      }

      const codes = DiyWorkService.extractUsedMaterialCodes(designData)
      codes.forEach(code => allCodes.add(code))
      perWork.push({ diy_template_id: row.diy_template_id, wristSizeMm, codes })
    }

    const sizeDistribution = {
      options: [...distributionMap.entries()]
        .map(([key, count]) => {
          const [label, wrist] = key.split('|')
          return { label, wrist_size_mm: Number(wrist), count }
        })
        .sort((a, b) => a.wrist_size_mm - b.wrist_size_mm),
      unset_count: unsetCount
    }

    // ---- 长度偏差分布（批量查素材物理数据 + 模板尺寸规则，禁止 N+1） ----
    const materials =
      allCodes.size > 0
        ? await DiyMaterial.findAll({
            where: { material_code: { [Op.in]: [...allCodes] } },
            attributes: [
              'material_code',
              'bore_orientation',
              'diameter',
              'size_length_mm',
              'size_width_mm'
            ],
            raw: true
          })
        : []
    const materialMap = new Map(materials.map(m => [m.material_code, m]))

    const templateIds = [...new Set(perWork.map(w => Number(w.diy_template_id)))]
    const templates =
      templateIds.length > 0
        ? await DiyTemplate.findAll({
            where: { diy_template_id: { [Op.in]: templateIds } },
            attributes: ['diy_template_id', 'sizing_rules'],
            raw: true
          })
        : []
    const templateSizingMap = new Map(
      templates.map(t => [Number(t.diy_template_id), parseJsonColumn(t.sizing_rules) || {}])
    )

    /* 偏差分档：≤5mm 工艺可吸收 / 5~10mm 需关注 / >10mm 余量参数需复核 / 不可测（缺手围或缺物理数据） */
    const lengthDeviation = { within_5mm: 0, within_10mm: 0, over_10mm: 0, unmeasurable: 0 }
    for (const { diy_template_id, wristSizeMm, codes } of perWork) {
      if (!Number.isFinite(wristSizeMm) || wristSizeMm <= 0 || codes.length === 0) {
        lengthDeviation.unmeasurable += 1
        continue
      }

      /* 档位匹配双字段命中（与 confirm 校验同口径）：手链按手围，项链按目标佩戴长度 */
      const sizing = templateSizingMap.get(Number(diy_template_id)) || {}
      const elasticMarginMm = Number(sizing.elastic_margin_mm) || DEFAULT_ELASTIC_MARGIN_MM
      const matched = Array.isArray(sizing.size_options)
        ? sizing.size_options.find(
            opt =>
              Number(opt.wrist_size_mm) === wristSizeMm ||
              Number(opt.target_length_mm) === wristSizeMm
          )
        : null
      const targetLengthMm =
        matched && Number.isFinite(Number(matched.target_length_mm))
          ? Number(matched.target_length_mm)
          : wristSizeMm + elasticMarginMm

      let currentLengthMm = 0
      let hasMissingSize = false
      for (const code of codes) {
        const material = materialMap.get(code)
        const occupyMm = material ? deriveCordOccupyMm(material) : null
        if (occupyMm === null) {
          hasMissingSize = true
          break
        }
        currentLengthMm += occupyMm
      }
      if (hasMissingSize) {
        lengthDeviation.unmeasurable += 1
        continue
      }

      const deviationMm = Math.abs(currentLengthMm - targetLengthMm)
      if (deviationMm <= 5) lengthDeviation.within_5mm += 1
      else if (deviationMm <= 10) lengthDeviation.within_10mm += 1
      else lengthDeviation.over_10mm += 1
    }

    return { size_distribution: sizeDistribution, length_deviation: lengthDeviation }
  }

  /**
   * 管理端 DIY 数据统计（页内卡片 + 独立数据大屏共用同一套接口，不建独立数据源）
   *
   * 返回结构（拍板决议 11.6-4，P0/P1/P2 三级 + 手围驱动方案 §11.7）：
   * - templates / works / template_ranking：基础统计（原有）
   * - completeness：P0 数据完备度（素材缺图/缺文案/0价/缺物理数据，模板缺图/未发布/缺档位）
   * - funnel / gmv / fulfillment：P1 经营看板（转化漏斗/GMV/履约）
   * - material_ranking / five_elements_distribution：P2 素材热度
   * - size_distribution / length_deviation：手围档位分布 + 长度偏差分布（配货备料/余量调参）
   *
   * @returns {Object} DIY 业务统计数据
   */
  static async getAdminStats() {
    // 模板统计
    const templateTotal = await DiyTemplate.count()
    const templatePublished = await DiyTemplate.count({
      where: { status: 'published', is_enabled: true }
    })

    // 作品统计
    const workTotal = await DiyWork.count()
    const workByStatus = await DiyWork.findAll({
      attributes: ['status', [fn('COUNT', col('diy_work_id')), 'count']],
      group: ['status'],
      raw: true
    })

    // 模板使用排行（按作品数量）
    const templateRanking = await DiyWork.findAll({
      attributes: ['diy_template_id', [fn('COUNT', col('diy_work_id')), 'work_count']],
      include: [
        {
          model: DiyTemplate,
          as: 'template',
          attributes: ['display_name', 'template_code']
        }
      ],
      group: [
        'diy_template_id',
        'template.diy_template_id',
        'template.display_name',
        'template.template_code'
      ],
      order: [[literal('work_count'), 'DESC']],
      limit: 10,
      raw: false
    })

    // 最近 7 天每日新增作品数
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const dailyWorks = await DiyWork.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('diy_work_id')), 'count']
      ],
      where: { created_at: { [require('sequelize').Op.gte]: sevenDaysAgo } },
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true
    })

    const byStatus = workByStatus.reduce((acc, r) => {
      acc[r.status] = Number(r.count)
      return acc
    }, {})

    // P0 完备度 + P1 经营 + P2 素材热度（拍板决议 11.6-4，页内卡片与大屏共用）
    const completeness = await DiyAdminQueryService._getCompletenessStats()
    const { funnel, gmv, fulfillment } = await DiyAdminQueryService._getOperationStats(byStatus)
    const { material_ranking, five_elements_distribution } =
      await DiyAdminQueryService._getMaterialHeatStats()
    // 手围档位分布 + 长度偏差分布（手围驱动方案 §11.7-B4/B5）
    const { size_distribution, length_deviation } = await DiyAdminQueryService._getWristSizeStats()

    return {
      templates: {
        total: templateTotal,
        published: templatePublished
      },
      works: {
        total: workTotal,
        by_status: byStatus,
        daily_trend: dailyWorks.map(d => ({ date: d.date, count: Number(d.count) }))
      },
      template_ranking: templateRanking.map(r => ({
        diy_template_id: r.diy_template_id,
        display_name: r.template?.display_name || '-',
        template_code: r.template?.template_code || '-',
        work_count: Number(r.dataValues?.work_count || r.work_count || 0)
      })),
      completeness,
      funnel,
      gmv,
      fulfillment,
      material_ranking,
      five_elements_distribution,
      size_distribution,
      length_deviation
    }
  }

  /**
   * 管理端获取作品关联的兑换订单
   *
   * 通过 exchange_records.source = 'diy' AND business_id = 'diy_exchange_{workId}' 关联
   *
   * @param {number} workId - diy_work_id
   * @returns {Object|null} 关联的兑换订单（含 address_snapshot、发货信息）
   */
  static async getWorkExchangeRecord(workId) {
    const record = await ExchangeRecord.findOne({
      where: {
        source: 'diy',
        business_id: `diy_exchange_${workId}`
      }
    })

    return record
  }
}

module.exports = DiyAdminQueryService
