/**
 * ECharts 按需导入模块
 *
 * @description 仅导入项目实际使用的组件，大幅减少包体积
 * @see https://echarts.apache.org/handbook/zh/basics/import
 *
 * 使用的图表类型：
 * - LineChart (折线图) - dashboard, statistics, analytics, exchange-market
 * - BarChart (柱状图) - analytics, risk-alerts
 * - PieChart (饼图) - dashboard, statistics, analytics, exchange-market, risk-alerts
 *
 * 使用的特殊功能：
 * - echarts.graphic.LinearGradient - 渐变颜色
 */

// ========== 核心模块（必需） ==========
import * as echarts from 'echarts/core'

// ========== 图表类型（按需） ==========
import { LineChart } from 'echarts/charts'
import { BarChart } from 'echarts/charts'
import { PieChart } from 'echarts/charts'

// ========== 组件（按需） ==========
import {
  // 标题组件
  TitleComponent,
  // 提示框组件
  TooltipComponent,
  // 直角坐标系网格组件
  GridComponent,
  // 图例组件
  LegendComponent,
  // 数据集组件
  DatasetComponent,
  // 数据转换组件
  TransformComponent,
  // 标记点组件（可选，用于标记特殊点）
  MarkPointComponent,
  // 标记线组件（可选，用于标记特殊线）
  MarkLineComponent
} from 'echarts/components'

// ========== 渲染器 ==========
import { CanvasRenderer } from 'echarts/renderers'

// ========== 注册组件 ==========
echarts.use([
  // 图表类型
  LineChart,
  BarChart,
  PieChart,

  // 组件
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DatasetComponent,
  TransformComponent,
  MarkPointComponent,
  MarkLineComponent,

  // 渲染器
  CanvasRenderer
])

// ========== 挂载到 window 对象 ==========
// 保持与原全量导入的兼容性
window.echarts = echarts

// ========== 导出 ==========
export { echarts }
export default echarts
