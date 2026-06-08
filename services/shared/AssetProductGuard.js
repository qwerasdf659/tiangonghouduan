/**
 * 价值流向守卫 — AssetProductGuard
 *
 * 文件路径：services/shared/AssetProductGuard.js
 *
 * 职责（合规整改执行清单 §10.11-C / §10.19-B / §10.15 Step 5）：
 * 代币风险总闸门的「代码层硬约束（fail-closed）」。在「上架/定价」与「产出」两侧焊死价值流向，
 * 防止星石获得货币属性、防止可回笼资产回流给用户。
 *
 * 价值排序：实物 ≈ 水晶/碎片系（有实物锚） > 星石（纯点券） > 零价值虚拟道具
 *   ✅ 允许：高价值 → 低价值/同级（销毁方向，资产被消耗）
 *   ❌ 严禁：低价值 → 高价值（套现方向，资产凭空获得价值）
 *
 * 两类守卫：
 * 1. 计价侧 assertPriceAssetAllowed（上架/改价时校验 price/cost 资产）
 *    - 红线①：星石永不得为「有价值商品」计价（杜绝 星石→实物 套现）
 *    - 红线②：实物/券类仅限水晶系计价
 *    - 零价值虚拟道具：star_stone / 水晶系 均可（向下销毁，放行）
 * 2. 产出侧 assertPayoutNotCurrency（兑换/直购/竞价/以物易物的产出校验）
 *    - 任何产出禁为货币型资产（星石/积分/水晶/碎片/源晶/配额，即任何 material_asset_types 资产）
 *    - 禁止借货币中转（不得"实物折算成水晶再花"）
 *
 * 挂载点（统一调用）：
 * - exchange 直购上架（services/exchange/admin/ItemManagementService.createExchangeItem）
 * - 竞价发起（routes/v4/console/bids/management.js 创建 BidProduct）
 * - 以物易物产出（阶段六）
 *
 * @module services/shared/AssetProductGuard
 * @created 2026-06-04（合规整改 阶段二）
 */

'use strict'

const BusinessError = require('../../utils/BusinessError')
const { AssetCode } = require('../../constants/AssetCode')
const { isValuableType, isBiddableType } = require('../../constants/ProductCurrencyWhitelist')

/** 星石资产代码（纯点券，唯一竞价币） */
const STONE = AssetCode.STAR_STONE

/**
 * 判断是否为水晶系资产（碎片/源晶）
 * 命名规范：{颜色}_core_{shard|gem}，如 red_core_shard / red_core_gem
 *
 * @param {string} assetCode - 资产代码
 * @returns {boolean} true=水晶系（有实物锚的有价值侧资产）
 */
function isCrystal(assetCode) {
  return /_core_(shard|gem)$/.test(String(assetCode || ''))
}

/**
 * 判断商品是否"有价值"（实物/券）
 *
 * 判定基准（路线B 合规改造 模块A·第2步）：
 * - 以 item_type 枚举为准（product/voucher 恒为 valuable），通过 ProductCurrencyWhitelist 统一判定。
 * - reference_price_points>0 仅作防御性兜底（fail-closed）：即使将来引入 prop 后参考价异常，
 *   也不会因参考价为 0 而漏判已知的实物/券。
 * - 这样避免了原「item_type 或 参考价>0」二元逻辑在引入 prop 后的歧义。
 *
 * @param {Object} template - item_templates 记录（含 item_type / reference_price_points）
 * @returns {boolean} true=有价值商品（实物/券/有RMB锚）
 */
function isValuable(template) {
  if (!template) return false
  const itemType = template.item_type
  const refPrice = Number(template.reference_price_points || 0)
  // 主判定：item_type 枚举；兜底：参考价>0（防御性 fail-closed）
  return isValuableType(itemType) || refPrice > 0
}

/**
 * 价值流向守卫类（静态工具，无状态）
 *
 * @class AssetProductGuard
 */
class AssetProductGuard {
  /**
   * 计价侧守卫：校验某商品能否用某资产计价（上架/改价时调用，fail-closed）
   *
   * @param {Object} template - 商品对应的 item_templates 记录（可为 null：无模板=纯虚拟道具视角）
   * @param {string} priceAssetCode - 计价/支付资产代码（cost_asset_code 或 price_asset_code）
   * @throws {BusinessError} STONE_BUY_VALUABLE_FORBIDDEN - 星石给有价值商品计价
   * @throws {BusinessError} VALUABLE_NEEDS_CRYSTAL - 有价值商品用非水晶系计价
   * @returns {void} 校验通过无返回，违规抛 BusinessError(400)
   */
  static assertPriceAssetAllowed(template, priceAssetCode) {
    const valuable = isValuable(template)

    // 红线①：星石永不得为"有价值商品"计价（杜绝 星石→实物 套现）
    if (priceAssetCode === STONE && valuable) {
      throw new BusinessError(
        '星石不可用于购买有价值商品（实物/券/有参考价），杜绝套现红线',
        'STONE_BUY_VALUABLE_FORBIDDEN',
        400
      )
    }

    // 红线②：实物/券类仅限水晶系计价
    if (valuable && !isCrystal(priceAssetCode)) {
      throw new BusinessError(
        '实物/券类商品仅限水晶系（碎片/源晶）计价兑换',
        'VALUABLE_NEEDS_CRYSTAL',
        400
      )
    }

    /*
     * 零价值虚拟道具（item_type='prop' 且无参考价）：
     * star_stone / 水晶系 均可（两者买零价值道具都是向下销毁，放行）
     */
  }

  /**
   * 上架白名单守卫：仅允许纯虚拟道具进入道具商城（§2.4 / §10.4-C1）
   *
   * @param {Object} template - 商品对应的 item_templates 记录
   * @throws {BusinessError} PROP_TYPE_FORBIDDEN - 实物/券类禁止作道具上架
   * @throws {BusinessError} PROP_HAS_VALUE - 有人民币参考价禁止作道具上架
   * @returns {void} 校验通过无返回，违规抛 BusinessError(400)
   */
  static assertVirtualPropOnly(template) {
    const forbiddenTypes = ['product', 'voucher']
    if (template && forbiddenTypes.includes(template.item_type)) {
      throw new BusinessError(
        '仅允许纯虚拟道具上架道具商城，实物/券类禁止',
        'PROP_TYPE_FORBIDDEN',
        400
      )
    }
    if (template && Number(template.reference_price_points || 0) > 0) {
      throw new BusinessError('有人民币参考价的物品禁止作为虚拟道具上架', 'PROP_HAS_VALUE', 400)
    }
  }

  /**
   * 竞价标的守卫：仅允许纯虚拟道具（prop）进入竞价（路线B 模块A·第3步，正向白名单断言）
   *
   * 铁律：竞价标的必须 item_type='prop'；product/voucher 一律禁止，防止实物被代币化锚定。
   * 与既有 assertPriceAssetAllowed（星石不买有价值物）+ is_biddable（竞价币白名单）形成三重防护。
   *
   * @param {Object} template - 商品对应的 item_templates 记录
   * @throws {BusinessError} BID_TARGET_FORBIDDEN - 标的非 prop（实物/券或缺失模板）禁止进入竞价
   * @returns {void} 校验通过无返回，违规抛 BusinessError(400)
   */
  static assertBiddableTarget(template) {
    const itemType = template && template.item_type
    if (!isBiddableType(itemType)) {
      throw new BusinessError(
        '竞价标的仅允许纯虚拟道具（prop），实物/券类禁止进入竞价',
        'BID_TARGET_FORBIDDEN',
        400
      )
    }
  }

  /**
   * 产出侧守卫：兑换/直购/竞价/以物易物的产出禁为货币型资产（§10.19-B）
   *
   * 货币型资产 = 任何 material_asset_types 资产（星石/积分/水晶/碎片/源晶/配额）。
   * 产出只能是实物/虚拟道具（终点消耗品），禁止借货币中转。
   *
   * @param {string} payoutAssetCode - 产出标的的资产代码（若产出是实物/道具实例，传 null/undefined 直接放行）
   * @param {Object} models - Sequelize 模型集合（需含 MaterialAssetType）
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - 事务对象
   * @throws {BusinessError} PAYOUT_CURRENCY_FORBIDDEN - 产出为货币型资产
   * @returns {Promise<void>} 校验通过无返回，违规抛 BusinessError(400)
   */
  static async assertPayoutNotCurrency(payoutAssetCode, models, options = {}) {
    // 产出为实物/道具实例（无 asset_code）直接放行
    if (!payoutAssetCode) return

    const MaterialAssetType = models && models.MaterialAssetType
    if (!MaterialAssetType) {
      // 守卫依赖模型，缺失时 fail-closed（合规优先）
      throw new BusinessError(
        '产出侧守卫缺少 MaterialAssetType 模型，拒绝执行',
        'PAYOUT_GUARD_UNAVAILABLE',
        500
      )
    }

    const found = await MaterialAssetType.findOne({
      where: { asset_code: payoutAssetCode },
      attributes: ['asset_code'],
      transaction: options.transaction
    })

    if (found) {
      throw new BusinessError(
        `产出禁止为货币型资产（${payoutAssetCode}）：兑换/直购/竞价/以物易物的产出只能是实物或不可交易虚拟道具`,
        'PAYOUT_CURRENCY_FORBIDDEN',
        400
      )
    }
  }
}

module.exports = AssetProductGuard
module.exports.isCrystal = isCrystal
module.exports.isValuable = isValuable
