<script lang="ts">
  import { Chart, Svg, Spline, Tooltip, TooltipItem, Highlight } from 'layerchart';
  import { format } from 'date-fns';
  import { scaleTime } from 'd3-scale';
  import BarChartVData from '$lib/components/charts/BarChartVData.json';
</script>

<div class="min-h-[15vh]">
  <Chart {BarChartVData} x="date" xScale={scaleTime()} y="value" tooltip>
    <Svg>
      <Spline class="stroke-1 stroke-primary" />
    </Svg>
  </Chart>
</div>
