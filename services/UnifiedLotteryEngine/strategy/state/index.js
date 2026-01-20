'use strict'

/**
 * 状态管理器模块入口
 *
 * 导出体验状态管理器和全局状态管理器
 *
 * @module services/UnifiedLotteryEngine/strategy/state
 */

const ExperienceStateManager = require('./ExperienceStateManager')
const GlobalStateManager = require('./GlobalStateManager')

module.exports = {
  ExperienceStateManager,
  GlobalStateManager
}
