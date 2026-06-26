"use client";

import React, { useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

interface TimelineCluster {
  id: string;
  label: string;
  start: string; // ISO date
  end: string;   // ISO date
  articleCount: number;
}

interface TimelineProps {
  clusters: TimelineCluster[];
  onSelectCluster: (id: string) => void;
  selectedClusterId?: string;
  timeWindowDays: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomShape = (props: any) => {
  const { cx, cy, payload } = props;
  
  const startX = cx; // Recharts automatically maps the X position to cx!
  
  if (startX === undefined) return null;

  // Fixed width for all pills (no longer based on duration)
  const fixedWidth = 180;
  const width = Math.min(fixedWidth, payload.plottingWidth * 0.8);
  
  const height = payload.articleCount >= 10 ? 32 : payload.articleCount >= 5 ? 28 : 24;
  const yPos = cy - (height / 2);
  
  const bgClass = payload.articleCount >= 10 ? "bg-[#4338ca] text-white shadow-md border-[#3730a3]" : 
                  payload.articleCount >= 5 ? "bg-[#6D5EF6] text-white shadow-sm border-[#5b4ee6]" : 
                  payload.articleCount >= 3 ? "bg-[#a59cf8] text-white border-[#8b7df9]" : 
                  "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-[#E5E7EB] dark:border-slate-700 shadow-sm";
                  
  const isSelected = payload.isSelected;
  const ringClass = isSelected ? "ring-2 ring-offset-2 ring-[#6D5EF6] dark:ring-offset-slate-900 shadow-[0_8px_16px_-4px_rgb(109,94,246,0.3)] !scale-105" : "hover:scale-[1.02] hover:shadow-md transition-all";
  
  return (
    <foreignObject x={startX} y={yPos} width={width + 10} height={height + 10} className={isSelected ? 'z-50' : 'z-10'} style={{ overflow: 'visible' }}>
      <button 
        title={`${payload.label} (${payload.articleCount} articles)`}
        onClick={(e) => { e.stopPropagation(); payload.onSelectCluster(payload.id); }}
        className={`rounded-full flex items-center px-3 cursor-pointer border ${bgClass} ${ringClass}`}
        style={{ width: `${width}px`, height: `${height}px` }}
      >
         <span className="flex-1 min-w-0 text-left truncate text-[11px] font-bold tracking-tight">
            {payload.label}
         </span>
         <span className={`ml-2 flex-shrink-0 text-[9px] font-semibold flex items-center gap-1 ${payload.articleCount >= 3 ? 'opacity-80' : 'opacity-60 text-slate-500'}`}>
            <span className="w-1 h-1 rounded-full bg-current" />
            {payload.articleCount}
         </span>
      </button>
    </foreignObject>
  );
};

export default function Timeline({
  clusters,
  onSelectCluster,
  selectedClusterId,
  timeWindowDays,
}: TimelineProps) {
  
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = React.useState(1000);

  React.useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setChartWidth(Math.max(1000, containerRef.current.clientWidth));
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // 1. Filter clusters
  const filteredClusters = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeWindowDays);
    return clusters.filter((c) => new Date(c.start) >= cutoff);
  }, [clusters, timeWindowDays]);

  // 2. Generate plotting data with collision-free lanes
  const { plotData, maxLanes, timeDomain } = useMemo(() => {
    const now = new Date().getTime();
    const start = now - timeWindowDays * 24 * 60 * 60 * 1000;
    const timeRangeMs = now - start;

    const sorted = [...filteredClusters].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    const packedLanes: TimelineCluster[][] = [];
    // The fixed pill width is 180px. On a typical 1000px wide screen, this is 18%.
    const minDurationMs = timeRangeMs * 0.18; 
    const bufferMs = timeRangeMs * 0.02; 

    sorted.forEach((cluster) => {
      const clusterStart = new Date(cluster.start).getTime();
      
      let laneIndex = 0;
      let placed = false;

      while (!placed) {
        if (laneIndex >= packedLanes.length) {
          packedLanes.push([cluster]);
          placed = true;
        } else {
          const currentLane = packedLanes[laneIndex];
          const lastInLane = currentLane[currentLane.length - 1];
          const lastStart = new Date(lastInLane.start).getTime();
          const lastEnd = new Date(lastInLane.end).getTime();
          
          const lastVisualEnd = Math.max(lastEnd, lastStart + minDurationMs);

          if (lastVisualEnd + bufferMs <= clusterStart) {
            currentLane.push(cluster);
            placed = true;
          } else {
            laneIndex++;
          }
        }
      }
    });

    const plottingWidth = Math.max(chartWidth - 40, 100); 
    const paddingMsLeft = timeRangeMs * 0.05;
    
    // We want at least R pixels of space on the right so the final pills aren't clipped.
    // minWidth is up to 220px, so we need R to be around 240px.
    const R = Math.min(240, plottingWidth * 0.5); 
    
    // Exact mathematical formula to guarantee R pixels of space:
    const requiredRightPaddingMs = (R * (timeRangeMs + paddingMsLeft)) / Math.max(1, plottingWidth - R);
    
    const paddingMsRight = Math.max(timeRangeMs * 0.05, requiredRightPaddingMs);
    const totalDomainMs = timeRangeMs + paddingMsLeft + paddingMsRight;

    const data = packedLanes.flatMap((lane, laneIdx) => {
      return lane.map(c => {
        const clusterStart = new Date(c.start).getTime();
        const clusterEnd = new Date(c.end).getTime();
        return {
          ...c,
          startMs: clusterStart,
          endMs: clusterEnd,
          laneIdx: laneIdx,
          totalDomainMs,
          plottingWidth,
          isSelected: c.id === selectedClusterId,
          onSelectCluster
        };
      });
    });

    return { plotData: data, maxLanes: packedLanes.length, timeDomain: [start - paddingMsLeft, now + paddingMsRight] };
  }, [filteredClusters, timeWindowDays, selectedClusterId, onSelectCluster, chartWidth]);

  // Axis formatters
  const xAxisFormatter = (tickItem: number) => {
    const date = new Date(tickItem);
    const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    const dateOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

    // For 24H and 3D views, show time on the bottom axis
    if (timeWindowDays <= 3) return date.toLocaleTimeString([], timeOpts);
    // For 7D and 14D views, show date on the bottom axis
    return date.toLocaleDateString([], dateOpts);
  };

  // Top header date range string
  const headerDateRange = useMemo(() => {
    const startDate = new Date(timeDomain[0]);
    const endDate = new Date(timeDomain[1]);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    
    if (timeWindowDays <= 1) {
       return startDate.toLocaleDateString([], opts);
    }
    return `${startDate.toLocaleDateString([], opts)} — ${endDate.toLocaleDateString([], opts)}`;
  }, [timeDomain, timeWindowDays]);

  if (filteredClusters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-dashed border-[#E5E7EB] dark:border-slate-800 rounded-[16px] bg-white dark:bg-slate-900 shadow-sm min-h-[400px]">
        <p className="text-slate-500 dark:text-slate-400 font-medium mb-2">No news clusters found in this period</p>
        <p className="text-[13px] text-slate-400 dark:text-slate-500">Try changing the time filter or refreshing the feed.</p>
      </div>
    );
  }

  // Calculate dynamic height based on number of lanes (46px per lane + padding)
  const chartHeight = Math.max(400, maxLanes * 46 + 60);

  // Calculate plotting area width (chartWidth - left margin 20 - right margin 20)

  return (
    <div className="w-full bg-white dark:bg-slate-900 rounded-[16px] border border-[#E5E7EB] dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full">
      
      {/* Top Header with Date Range & Legend */}
      <div className="h-12 border-b border-[#E5E7EB] dark:border-slate-800 flex items-center justify-between px-6 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-4">
             <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">News Timeline</span>
             <div className="hidden sm:flex items-center gap-3 ml-2 border-l border-slate-200 dark:border-slate-700 pl-4">
                <div className="flex items-center gap-1.5">
                   <div className="w-2.5 h-2.5 rounded-full border-2 border-[#a59cf8] bg-[#a59cf8]/20 dark:bg-[#a59cf8]/10"></div>
                   <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Low Activity</span>
                </div>
                <div className="flex items-center gap-1.5">
                   <div className="w-2.5 h-2.5 rounded-full bg-[#6D5EF6] shadow-sm"></div>
                   <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">High Impact</span>
                </div>
             </div>
          </div>
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 tracking-wider bg-white dark:bg-slate-800 px-3 py-1.5 rounded-md shadow-sm border border-slate-200 dark:border-slate-700">
             {headerDateRange}
          </span>
      </div>

      <div className="relative flex-1 overflow-x-auto overflow-y-auto custom-scrollbar" ref={containerRef}>
        <div className="pr-8 pl-4 pb-2 pt-6" style={{ height: chartHeight, width: chartWidth }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={true} horizontal={true} stroke="#cbd5e1" opacity={0.6} />
              
              {/* X Axis (Time) at the top */}
              <XAxis 
                type="number" 
                dataKey="startMs" 
                domain={timeDomain} 
                tickFormatter={xAxisFormatter}
                tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }}
                tickCount={8}
                orientation="top"
              />

              {/* Y Axis (Hidden, just for layout) */}
              <YAxis 
                type="number" 
                dataKey="laneIdx" 
                domain={[-0.5, maxLanes - 0.5]} 
                reversed={true} // So lane 0 is at top
                hide={true} 
              />

              <Scatter data={plotData} shape={<CustomShape />} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

