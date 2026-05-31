import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart, ScatterChart, FunnelChart, SankeyChart, HeatmapChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, GridComponent, LegendComponent, DatasetComponent, TransformComponent, MarkPointComponent, MarkLineComponent, VisualMapComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
echarts.use([LineChart,BarChart,PieChart,ScatterChart,FunnelChart,SankeyChart,HeatmapChart,TitleComponent,TooltipComponent,GridComponent,LegendComponent,DatasetComponent,TransformComponent,MarkPointComponent,MarkLineComponent,VisualMapComponent,SVGRenderer])
const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 300, height: 150 })
try {
  chart.setOption({
    xAxis: { type: 'category', data: ['a','b','c'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [1,2,3] }, { type: 'line', data: [3,2,1] }]
  })
  const svg = chart.renderToSVGString()
  console.log('RENDER OK, svg length:', svg.length, '| has rect(bar):', svg.includes('<rect'))
} catch (e) {
  console.log('RENDER ERROR:', e.message)
}
