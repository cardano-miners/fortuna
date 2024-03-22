<script lang="ts">
  import AreaChart from '$lib/components/charts/AreaChart.svelte';
  import BarChartV from '$lib/components/charts/BarChartV.svelte';
  import ArcSegments from '$lib/components/charts/ArcSegments.svelte';

  // Dummy data for the charts
  // each one represents what information I'm expecting from the blockchain api or a websocket (for live data :D)
  // this will lead into less code into the application if the API response is the same as the data structure
  // it also could be great if the amount of each data is respected on answer so we can have a better date-time representation
  // (if the dummy.json has 3 objects, the api should give 3 objects)
  import AreaChartData from '$lib/components/charts/AreaChartData.json';
  import BarChartVData from '$lib/components/charts/BarChartVData.json';

  // curve style for the area chart, those are the ones that can be imported  https://d3js.org/d3-shape/curve
  // { curveBasis, curveBasisClosed, curveBasisOpen, curveBundle, curveCardinal, curveCardinalClosed,
  //   curveCardinalOpen, curveCatmullRom, curveCatmullRomClosed, curveCatmullRomOpen, curveLinear, curveLinearClosed,
  //   curveMonotoneX, curveMonotoneY, curveNatural, curveStep, curveStepAfter, curveStepBefore}

  import { curveStep, curveLinear, curveBasis, curveCardinal } from 'd3-shape';
  import LatestBlocks from '$lib/components/LatestBlocks.svelte';

  // todo graphics:
  // donut type for hashrate distribution (pools mining)
  // epoch information like solana.fm / card with https://daisyui.com/components/progress/
</script>

<div class="mt-4">
  <div><LatestBlocks /></div>
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 grid-flow-dense">
    <div class="col-span-4">
      <BarChartV data={BarChartVData} title="Mined Tuna History" />
    </div>
    <div>
      <AreaChart
        data={AreaChartData}
        title="Total Hash Rate (TH/s)"
        curveType={curveStep}
        placementx="top"
        placementy="right"
        lineClass="stroke-primary stroke-2"
        areaClass="fill-primary/10"
        yValue="value"
        xValue="x"
        hasPoints={true}
        isHighlighted={true} />
    </div>
    <div>
      <AreaChart
        data={AreaChartData}
        title="Another Chart"
        curveType={curveLinear}
        placementx="bottom"
        placementy="right"
        lineClass="stroke-accent stroke-2"
        areaClass="fill-accent/10"
        yValue="value"
        xValue="x"
        hasPoints={true}
        isHighlighted={true} />
    </div>
    <div>
      <AreaChart
        data={AreaChartData}
        title="yeah another graph"
        curveType={curveCardinal}
        placementx="bottom"
        placementy="left"
        lineClass="stroke-secondary stroke-2"
        areaClass="fill-secondary/10"
        yValue="value"
        xValue="x"
        hasPoints={false}
        isHighlighted={false} />
    </div>
    <div>
      <AreaChart
        data={AreaChartData}
        title="yeah another graph 3"
        curveType={curveBasis}
        placementx="bottom"
        placementy="left"
        lineClass="stroke-warning stroke-2"
        areaClass="fill-warning/10"
        yValue="value"
        xValue="x"
        hasPoints={false}
        isHighlighted={false} />
    </div>
    <div>
      <ArcSegments value={8} segments={100} title="Block Difficult" />
    </div>
  </div>
</div>
