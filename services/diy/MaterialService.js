/**
 * DIY 素材管理服务
 *
 * 职责：珠子/素材 CRUD（管理端 + 用户端查询）
 *
 * @module services/diy/MaterialService
 */

'use strict'

const { Op, fn, col } = require('sequelize')
const logger = require('../../utils/logger').logger
const OrderNoGenerator = require('../../utils/OrderNoGenerator')
const { AssetCode } = require('../../constants/AssetCode')
const { Category, DiyMaterial, DiyTemplate, MediaFile } = require('../../models')
const TransactionManager = require('../../utils/TransactionManager')
const DisplayNameService = require('../DisplayNameService')

/**
 * DIY 材料分组字典类型（system_dictionaries.dict_type）
 *
 * 拍板 1（2026-07-15 定案）：DIY 材料分组是 DIY 自有维度，展示名/色值从
 * system_dictionaries（dict_type='diy_material_group'）取，与资产字典
 * asset_group_defs（源晶/市场交易域）完全解耦，不做任何 join。
 */
const DIY_MATERIAL_GROUP_DICT_TYPE = 'diy_material_group'

/**
 * 计算单颗素材的沿绳占用长度（毫米）— 手围驱动方案唯一派生口径
 *
 * 派生规则（唯一事实来源是 bore_orientation + 实物尺寸字段，刻意不落库避免双份事实）：
 * - along_length（管珠，绳穿长轴）→ size_length_mm
 * - along_width（药片，绳穿短边）→ size_width_mm
 * - none（圆珠）→ diameter
 * 所需尺寸缺失时返回 null（前端展示"信息完善中"且不计入长度累加；
 * confirm 硬校验遇 null 抛 DIY_MATERIAL_SIZE_MISSING）
 *
 * 复用方：toUserMaterialJSON（beads 接口下发）、WorkService 确认校验、
 * AdminQueryService 成品长度/长度偏差统计 —— 三处必须同口径，只此一个实现。
 *
 * @param {Object} plain - 素材 plain 对象（含 bore_orientation/diameter/size_length_mm/size_width_mm）
 * @returns {number|null} 沿绳占用毫米数（缺数据返回 null）
 */
function deriveCordOccupyMm(plain) {
  if (plain.bore_orientation === 'along_length') {
    return plain.size_length_mm !== null && plain.size_length_mm !== undefined
      ? Number(plain.size_length_mm)
      : null
  }
  if (plain.bore_orientation === 'along_width') {
    return plain.size_width_mm !== null && plain.size_width_mm !== undefined
      ? Number(plain.size_width_mm)
      : null
  }
  return plain.diameter !== null && plain.diameter !== undefined ? Number(plain.diameter) : null
}

/**
 * 用户端素材序列化（数据最小化 + 库存掩码，拍板决议 11.5-D）
 *
 * - image_media 用 MediaFile.toSafeJSON() 输出（隐藏 object_key/uploaded_by/thumbnail_keys，
 *   补齐 public_url + thumbnails.w375/w750/w1080 衍生图 URL）
 * - stock 掩码（拍板 ③）：-1=无限 / 0=售罄 原样，正数一律压成 1（不暴露精确库存）
 * - cord_occupy_mm 为派生字段（手围驱动方案 Q3 决议）：前端直接累加即为已排长度，
 *   不在前端按形状分支推算
 * - 只输出小程序渲染/展示需要的字段，不下发 meta/is_stackable 等后台字段
 *
 * @param {DiyMaterial} material - 素材模型实例（含 image_media 关联）
 * @returns {Object} 用户端安全的素材数据
 */
function toUserMaterialJSON(material) {
  const plain = material.get({ plain: true })
  return {
    diy_material_id: plain.diy_material_id,
    material_code: plain.material_code,
    display_name: plain.display_name,
    material_name: plain.material_name,
    group_code: plain.group_code,
    diameter: plain.diameter,
    shape: plain.shape,
    /* 素材大类（饰品/配饰/吊坠 Tab）与材质光影档位（渲染高光参数）为两个独立业务概念 */
    item_type: plain.item_type,
    material_type: plain.material_type,
    five_elements: plain.five_elements,
    weight: plain.weight,
    meaning: plain.meaning,
    energy: plain.energy,
    pairing: plain.pairing,
    size_length_mm: plain.size_length_mm,
    size_width_mm: plain.size_width_mm,
    bore_orientation: plain.bore_orientation,
    /* 单颗沿绳占用毫米（后端预计算派生，前端累加即为已排长度；null=物理数据不完整） */
    cord_occupy_mm: deriveCordOccupyMm(plain),
    price: plain.price,
    price_asset_code: plain.price_asset_code,
    stock: plain.stock > 0 ? 1 : plain.stock,
    image_media: material.image_media ? material.image_media.toSafeJSON() : null,
    sort_order: plain.sort_order,
    is_enabled: plain.is_enabled
  }
}

/**
 * 素材价格护栏（拍板决议 11.8-⑥）：0 价素材禁止启用
 *
 * 从机制上杜绝「price=0 且 is_enabled=1」的事故（真机填槽后费用显示"0 星石"），
 * createMaterial / updateMaterial 共用，按落库后的最终状态校验。
 *
 * @param {number} finalPrice - 落库后的最终价格
 * @param {boolean} finalEnabled - 落库后的最终启用状态
 * @returns {void}
 */
function assertPriceGuard(finalPrice, finalEnabled) {
  if (Number(finalPrice) === 0 && finalEnabled === true) {
    const error = new Error('0 价素材禁止启用，请先定价（价格护栏，拍板决议 11.8-⑥）')
    error.statusCode = 400
    throw error
  }
}

/** DIY 素材管理服务 */
class DiyMaterialService {
  /**
   * 管理端获取材料列表（分页/筛选）
   *
   * 完备度快捷筛选（拍板决议 11.6-4 P0，配合完备度卡片做成运营工作清单）：
   * - missing_image=true       缺图素材（image_media_id IS NULL）
   * - missing_copy=true        缺文案素材（meaning 或 five_elements 为空）
   * - zero_price_enabled=true  0 价且启用素材（价格护栏兜底排查）
   * - missing_physical=true    缺物理数据素材（沿绳占用无法派生，手围驱动方案 §11.5）
   *
   * @param {Object} params - { page, page_size, group_code, category_id, item_type, keyword,
   *   is_enabled, missing_image, missing_copy, zero_price_enabled, missing_physical }
   * @returns {{rows: DiyMaterial[], count: number}} 分页材料列表
   */
  static async getAdminMaterialList(params = {}) {
    const page = Number(params.page) || 1
    const pageSize = Number(params.page_size) || 50
    const where = {}

    if (params.group_code) where.group_code = params.group_code
    if (params.category_id) where.category_id = Number(params.category_id)
    if (params.item_type) where.item_type = params.item_type
    if (params.is_enabled !== undefined && params.is_enabled !== '') {
      where.is_enabled =
        params.is_enabled === 'true' || params.is_enabled === true || params.is_enabled === 1
    }
    // 完备度快捷筛选（P0 运营工作清单）
    if (params.missing_image === 'true' || params.missing_image === true) {
      where.image_media_id = null
    }
    if (params.missing_copy === 'true' || params.missing_copy === true) {
      /* 用 Op.and 承载，避免与 keyword 的 Op.or 相互覆盖 */
      where[Op.and] = where[Op.and] || []
      where[Op.and].push({ [Op.or]: [{ meaning: null }, { five_elements: null }] })
    }
    if (params.zero_price_enabled === 'true' || params.zero_price_enabled === true) {
      where.price = 0
      where.is_enabled = true
    }
    /*
     * 缺物理数据筛选（手围驱动方案 §11.5）：沿绳占用无法派生的素材
     * 口径与 deriveCordOccupyMm 一致：管珠缺长边 / 药片缺短边 / 圆珠缺直径
     */
    if (params.missing_physical === 'true' || params.missing_physical === true) {
      where[Op.and] = where[Op.and] || []
      where[Op.and].push({
        [Op.or]: [
          { bore_orientation: 'along_length', size_length_mm: null },
          { bore_orientation: 'along_width', size_width_mm: null },
          { bore_orientation: 'none', diameter: null }
        ]
      })
    }
    if (params.keyword) {
      where[Op.or] = [
        { display_name: { [Op.like]: `%${params.keyword}%` } },
        { material_name: { [Op.like]: `%${params.keyword}%` } },
        { material_code: { [Op.like]: `%${params.keyword}%` } }
      ]
    }

    return DiyMaterial.findAndCountAll({
      where,
      include: [
        { model: MediaFile, as: 'image_media', required: false },
        {
          model: Category,
          as: 'category',
          attributes: ['category_id', 'category_name', 'category_code'],
          required: false
        }
      ],
      order: [
        ['group_code', 'ASC'],
        ['sort_order', 'ASC'],
        ['diy_material_id', 'ASC']
      ],
      limit: pageSize,
      offset: (page - 1) * pageSize
    })
  }

  /**
   * 管理端获取材料详情
   * @param {number} materialId - 材料 ID
   * @returns {Object} 材料详情
   */
  static async getAdminMaterialDetail(materialId) {
    const material = await DiyMaterial.findByPk(materialId, {
      include: [
        { model: MediaFile, as: 'image_media', required: false },
        {
          model: Category,
          as: 'category',
          attributes: ['category_id', 'category_name', 'category_code'],
          required: false
        }
      ]
    })

    if (!material) {
      const error = new Error('材料不存在')
      error.statusCode = 404
      throw error
    }
    return material
  }

  /**
   * 创建材料
   * @param {Object} data - 材料数据
   * @param {Object} options - { transaction }
   * @returns {Object} 新建的材料
   */
  static async createMaterial(data, options = {}) {
    /* 强制校验：珠子素材图片是前端渲染的必要素材 */
    if (!data.image_media_id) {
      const error = new Error(
        '请上传珠子素材图片（image_media_id），图片是小程序设计器渲染的必要素材'
      )
      error.statusCode = 400
      throw error
    }

    // material_code 采用「先创建再回填」模式，与 TemplateService/WorkService 统一
    return TransactionManager.execute(async transaction => {
      // 安全校验：price_asset_code 不允许设为 points 或 budget_points（文档决策 4）
      const assetCode = data.price_asset_code || AssetCode.STAR_STONE
      const forbidden = ['points', 'budget_points']
      if (forbidden.includes(assetCode)) {
        const error = new Error(
          `price_asset_code 不允许设为 ${assetCode}，DIY 支付仅限星石和源晶体系`
        )
        error.statusCode = 400
        throw error
      }

      // 强制整数定价校验（文档决策 A：管理后台和后端各加一条整数校验）
      if (data.price !== undefined && data.price !== null) {
        const price = Number(data.price)
        if (!Number.isFinite(price) || price < 0) {
          const error = new Error('价格必须为非负数')
          error.statusCode = 400
          throw error
        }
        if (price % 1 !== 0) {
          const error = new Error(`价格必须为整数（当前值 ${price}），强制整数定价策略`)
          error.statusCode = 400
          throw error
        }
      }

      // 价格护栏（拍板 ⑥）：0 价素材禁止启用（按最终落库状态校验）
      assertPriceGuard(data.price || 0, data.is_enabled ?? true)

      const material = await DiyMaterial.create(
        {
          material_code: 'DM_TEMP',
          display_name: data.display_name,
          material_name: data.material_name || null,
          group_code: data.group_code || 'default',
          diameter: data.diameter || null,
          /* 默认取 ENUM 合法值 circle（历史 bug：'round' 不在 ENUM 内，不传 shape 会写库失败） */
          shape: data.shape || 'circle',
          item_type: data.item_type || 'beads',
          material_type: data.material_type || 'crystal',
          five_elements: data.five_elements || null,
          weight: data.weight ?? null,
          meaning: data.meaning || null,
          energy: data.energy || null,
          pairing: data.pairing || null,
          size_length_mm: data.size_length_mm ?? null,
          size_width_mm: data.size_width_mm ?? null,
          bore_orientation: data.bore_orientation || 'none',
          price: data.price || 0,
          price_asset_code: assetCode,
          stock: data.stock ?? -1,
          is_stackable: data.is_stackable ?? true,
          image_media_id: data.image_media_id || null,
          category_id: data.category_id || null,
          sort_order: data.sort_order || 0,
          is_enabled: data.is_enabled ?? true,
          meta: data.meta || null
        },
        { transaction }
      )

      const materialCode = OrderNoGenerator.generate(
        'DM',
        material.diy_material_id,
        material.created_at
      )
      await material.update({ material_code: materialCode }, { transaction })

      logger.info('[DIYService] 创建材料', {
        diy_material_id: material.diy_material_id,
        material_code: materialCode,
        display_name: data.display_name
      })

      return material
    }, options)
  }

  /**
   * 更新材料
   * @param {number} materialId - 材料 ID
   * @param {Object} data - 更新数据
   * @param {Object} options - { transaction }
   * @returns {Object} 更新后的材料
   */
  static async updateMaterial(materialId, data, options = {}) {
    return TransactionManager.execute(async transaction => {
      const material = await DiyMaterial.findByPk(materialId, { transaction })
      if (!material) {
        const error = new Error('材料不存在')
        error.statusCode = 404
        throw error
      }

      const allowedFields = [
        'display_name',
        'material_name',
        'group_code',
        'diameter',
        'shape',
        'item_type',
        'material_type',
        'five_elements',
        'weight',
        'meaning',
        'energy',
        'pairing',
        'size_length_mm',
        'size_width_mm',
        'bore_orientation',
        'price',
        'price_asset_code',
        'stock',
        'is_stackable',
        'image_media_id',
        'category_id',
        'sort_order',
        'is_enabled',
        'meta'
      ]
      const updates = {}
      for (const f of allowedFields) {
        if (data[f] !== undefined) updates[f] = data[f]
      }

      // 安全校验：price_asset_code 不允许设为 points 或 budget_points（文档决策 4）
      if (updates.price_asset_code) {
        const forbidden = ['points', 'budget_points']
        if (forbidden.includes(updates.price_asset_code)) {
          const error = new Error(
            `price_asset_code 不允许设为 ${updates.price_asset_code}，DIY 支付仅限星石和源晶体系`
          )
          error.statusCode = 400
          throw error
        }
      }

      // 强制整数定价校验（文档决策 A：管理后台和后端各加一条整数校验）
      if (updates.price !== undefined && updates.price !== null) {
        const price = Number(updates.price)
        if (!Number.isFinite(price) || price < 0) {
          const error = new Error('价格必须为非负数')
          error.statusCode = 400
          throw error
        }
        if (price % 1 !== 0) {
          const error = new Error(`价格必须为整数（当前值 ${price}），强制整数定价策略`)
          error.statusCode = 400
          throw error
        }
      }

      // 价格护栏（拍板 ⑥）：0 价素材禁止启用（按更新后的最终状态校验）
      const finalPrice = updates.price !== undefined ? updates.price : material.price
      const finalEnabled =
        updates.is_enabled !== undefined
          ? Boolean(updates.is_enabled)
          : Boolean(material.is_enabled)
      assertPriceGuard(finalPrice, finalEnabled)

      await material.update(updates, { transaction })

      logger.info('[DIYService] 更新材料', {
        diy_material_id: materialId,
        fields: Object.keys(updates)
      })

      return material.reload({
        include: [
          { model: MediaFile, as: 'image_media', required: false },
          {
            model: Category,
            as: 'category',
            attributes: ['category_id', 'category_name', 'category_code'],
            required: false
          }
        ],
        transaction
      })
    }, options)
  }

  /**
   * 删除材料
   * @param {number} materialId - 材料 ID
   * @param {Object} options - { transaction }
   * @returns {void}
   */
  static async deleteMaterial(materialId, options = {}) {
    return TransactionManager.execute(async transaction => {
      const material = await DiyMaterial.findByPk(materialId, { transaction })
      if (!material) {
        const error = new Error('材料不存在')
        error.statusCode = 404
        throw error
      }
      await material.destroy({ transaction })
      logger.info('[DIYService] 删除材料', {
        diy_material_id: materialId,
        display_name: material.display_name
      })
    }, options)
  }

  /**
   * 用户端：获取模板可用材料列表
   * 根据模板的 material_group_codes 和 category_id 筛选
   * 支持按 slot_id 的槽位级三种约束过滤（allowed_diameters / allowed_group_codes /
   * allowed_shapes，拍板 15：三者同款 Op.in 写法，槽位精细化约束齐全）
   * 支持按 item_type 素材大类过滤（饰品/配饰/吊坠 Tab，拍板决议 11.3-9：同一接口不另开）
   *
   * 输出经 toUserMaterialJSON 收敛（数据最小化 + 库存掩码，拍板决议 11.5-D）
   *
   * @param {number} templateId - 模板 ID
   * @param {Object} params - { group_code, diameter, keyword, slot_id, item_type }
   * @returns {Object[]} 用户可见的材料列表（安全序列化后的普通对象）
   */
  static async getUserMaterials(templateId, params = {}) {
    const template = await DiyTemplate.findByPk(templateId)
    if (!template) {
      const error = new Error('模板不存在')
      error.statusCode = 404
      throw error
    }

    const where = { is_enabled: true }

    // 按模板允许的 group_codes 筛选
    const allowedGroups = template.material_group_codes
    if (allowedGroups && allowedGroups.length > 0) {
      where.group_code = { [Op.in]: allowedGroups }
    }

    /*
     * 按槽位级约束过滤（拍板 15）：运营在槽位标注器给某个镶口配置的
     * 直径 / 分组 / 形状约束，beads 接口按槽位下发时全部生效
     */
    if (params.slot_id && template.layout?.slot_definitions) {
      const slot = template.layout.slot_definitions.find(s => s.slot_id === params.slot_id)
      if (slot?.allowed_diameters?.length > 0) {
        where.diameter = { [Op.in]: slot.allowed_diameters }
      }
      if (slot?.allowed_group_codes?.length > 0) {
        where.group_code = { [Op.in]: slot.allowed_group_codes }
      }
      if (slot?.allowed_shapes?.length > 0) {
        where.shape = { [Op.in]: slot.allowed_shapes }
      }
    }

    // 额外筛选条件
    if (params.group_code) where.group_code = params.group_code
    if (params.diameter) where.diameter = Number(params.diameter)
    if (params.item_type) where.item_type = params.item_type
    if (params.keyword) {
      where[Op.or] = [
        { display_name: { [Op.like]: `%${params.keyword}%` } },
        { material_name: { [Op.like]: `%${params.keyword}%` } }
      ]
    }

    const materials = await DiyMaterial.findAll({
      where,
      include: [{ model: MediaFile, as: 'image_media', required: false }],
      order: [
        ['group_code', 'ASC'],
        ['sort_order', 'ASC']
      ],
      limit: 200
    })

    /* 用户端数据最小化 + 库存掩码（拍板决议 11.5-D / 11.8-③） */
    return materials.map(toUserMaterialJSON)
  }

  /**
   * 获取材料分组列表（用于小程序分组 Tab 动态渲染）
   *
   * 拍板 16（2026-07-15 定案）：分组的中文名 + 色值由后端下发，小程序不做本地
   * label 映射。展示字段经 DisplayNameService 从 system_dictionaries
   * （dict_type='diy_material_group'，Redis 缓存命中无 N+1）批量取，
   * 与资产字典 asset_group_defs 解耦。字典缺行时降级：display_name 回退裸
   * group_code、color_hex 为 null（暴露问题由运营补字典，不做隐藏兜底）。
   *
   * @returns {Promise<Object[]>} 分组列表
   *   [{ group_code, count, display_name, color_hex }]
   */
  static async getMaterialGroups() {
    const groups = await DiyMaterial.findAll({
      attributes: ['group_code', [fn('COUNT', col('diy_material_id')), 'count']],
      where: { is_enabled: true },
      group: ['group_code'],
      order: [['group_code', 'ASC']],
      raw: true
    })

    /* 批量取中文名 + 色值（DisplayNameService.batchGet 入参 {type, code}，返回 Map） */
    const items = groups.map(g => ({
      type: DIY_MATERIAL_GROUP_DICT_TYPE,
      code: g.group_code
    }))
    const names = await DisplayNameService.batchGet(items)

    return groups.map(g => {
      const hit = names.get(`${DIY_MATERIAL_GROUP_DICT_TYPE}:${g.group_code}`)
      return {
        group_code: g.group_code,
        count: Number(g.count),
        display_name: hit?.name || g.group_code,
        color_hex: hit?.color || null
      }
    })
  }
}

module.exports = DiyMaterialService
/* 沿绳占用派生函数（WorkService 确认校验 / AdminQueryService 统计复用，保证三处同口径） */
module.exports.deriveCordOccupyMm = deriveCordOccupyMm
