
import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { Task, LinkType, Annotation } from '../types';
import { ZoomIn, ZoomOut, Download, Type, BoxSelect, Settings, Calendar, MousePointer2, Layers, Flag, AlertTriangle, Star, CheckCircle, Edit3, X, Undo, Redo, Save, Image as ImageIcon, FileText, Code, FileCode, Globe, MoveVertical, ArrowDownUp } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface NetworkDiagramProps {
  tasks: Task[];
  annotations?: Annotation[]; 
  onUpdateTasks?: (tasks: Task[]) => void;
  onUpdateAnnotations?: (annotations: Annotation[]) => void;
  onUpdateAnalysis: (criticalPath: string[], duration: number) => void;
  projectStartDate: Date;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  projectName?: string;
}

type ViewMode = 'day' | 'month' | 'year';

const STYLES = {
  gridColor: '#94a3b8', 
  gridOpacity: 0.2,
  zoneBg: '#f8fafc',
  zoneBorder: '#cbd5e1',
  taskHeight: 80, 
  nodeRadius: 6,
  criticalColor: '#ef4444',
  normalColor: '#1e293b',
  virtualColor: '#64748b',
  floatColor: '#94a3b8',
  fontFamily: '"Microsoft YaHei", sans-serif',
};

const TITLE_HEIGHT = 80;
const HEADER_HEIGHT = 60;

// Custom palette for zones
const ZONE_COLORS = [
  '#2563eb', // Blue
  '#059669', // Emerald
  '#d97706', // Amber
  '#7c3aed', // Violet
  '#db2777', // Pink
  '#0891b2', // Cyan
  '#4f46e5', // Indigo
  '#ea580c', // Orange
  '#65a30d', // Lime
  '#be185d', // Rose
];

const NetworkDiagram: React.FC<NetworkDiagramProps> = ({ 
  tasks, 
  annotations = [], 
  onUpdateTasks,
  onUpdateAnnotations,
  onUpdateAnalysis,
  projectStartDate,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  projectName
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'text' | 'flag' | 'alert' | 'star' | 'check'>('select');
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Process Data with Manual Lane Support
  const processedData = useMemo(() => {
    const _tasks = tasks; 
    const taskMap = new Map(_tasks.map(t => [t.id, t]));

    const projectDuration = Math.max(..._tasks.map(t => t.earlyFinish || 0), 0);
    const criticalPathIds = _tasks.filter(t => t.isCritical).map(t => t.id);

    setTimeout(() => onUpdateAnalysis(criticalPathIds, projectDuration), 0);

    const zones: string[] = Array.from<string>(new Set(_tasks.map(t => t.zone || '默认区域'))).sort();
    
    const layoutData: { task: Task; laneIndex: number; globalRowIndex: number; zone: string }[] = [];
    let currentGlobalRow = 0;
    const zoneMeta: { name: string; startRow: number; rowCount: number; endRow: number; color: string }[] = [];
    
    const taskLaneMap = new Map<string, number>();

    zones.forEach((zone, index) => {
      const zoneTasks = _tasks.filter(t => (t.zone || '默认区域') === zone);
      // Sort priority: Early Start -> ID
      zoneTasks.sort((a, b) => (a.earlyStart || 0) - (b.earlyStart || 0) || a.id.localeCompare(b.id));

      // Array to track the finish time of the last task in each lane
      const lanes: number[] = [];
      const zoneStartRow = currentGlobalRow;

      zoneTasks.forEach(task => {
        let assignedLane = -1;
        
        // 1. Check for Manual Lane assignment
        if (task.manualLane !== undefined && task.manualLane >= 0) {
             assignedLane = task.manualLane;
             // Ensure lanes array is big enough
             while(lanes.length <= assignedLane) lanes.push(-Infinity);
        } else {
             // 2. Automatic Layout
             
             // Try to align with predecessor in same zone
             const directPred = task.predecessors
                  .map(pid => taskMap.get(pid))
                  .find(p => p && (p.zone || '默认区域') === zone && Math.abs((p.earlyFinish || 0) - (task.earlyStart || 0)) < 0.01);
             
             if (directPred) {
                 const predLane = taskLaneMap.get(directPred.id);
                 // Check if the predecessor's lane is free
                 if (predLane !== undefined && (lanes[predLane] || 0) <= (task.earlyStart || 0) + 0.1) {
                     assignedLane = predLane;
                 }
             }

             // If not found or blocked, find first available lane
             if (assignedLane === -1) {
                 for (let i = 0; i < lanes.length; i++) {
                     if ((lanes[i] || 0) <= (task.earlyStart || 0) + 0.1) {
                         assignedLane = i;
                         break;
                     }
                 }
             }

             // New Lane
             if (assignedLane === -1) {
                 assignedLane = lanes.length;
                 lanes.push(-Infinity);
             }
        }
        
        // Update the lane's finish time. 
        // Note: For manual tasks, we allow overlap, so we take max(existing, new).
        lanes[assignedLane] = Math.max(lanes[assignedLane] || -Infinity, task.earlyFinish || 0);
        
        taskLaneMap.set(task.id, assignedLane);
        layoutData.push({
          task,
          laneIndex: assignedLane,
          globalRowIndex: zoneStartRow + assignedLane,
          zone
        });
      });

      // Calculate row count based on content
      // Ensure at least enough rows for the lanes, plus some minimum for text visibility
      const charsPerLine = 8;
      const estimatedLines = Math.ceil(zone.length / charsPerLine);
      const minTextHeight = estimatedLines * 20 + 20; 
      const minRowsForText = Math.ceil(minTextHeight / STYLES.taskHeight);

      const rowCount = Math.max(lanes.length, minRowsForText, 1);
      
      currentGlobalRow += rowCount;
      zoneMeta.push({ 
        name: zone, 
        startRow: zoneStartRow, 
        rowCount, 
        endRow: zoneStartRow + rowCount,
        color: ZONE_COLORS[index % ZONE_COLORS.length]
      });
    });

    return { tasks: layoutData, projectDuration, zoneMeta, totalRows: currentGlobalRow, rawTasks: taskMap };
  }, [tasks]);

  const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const formatDateStr = (days: number) => {
    const d = addDays(projectStartDate, days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const parseDateStr = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const start = new Date(projectStartDate);
    start.setHours(0,0,0,0);
    date.setHours(0,0,0,0);
    const diffTime = date.getTime() - start.getTime();
    return Math.round(diffTime / (1000 * 3600 * 24));
  };

  // Helper for Wavy Line (Free Float)
  const getWavyPath = (x1: number, y: number, x2: number) => {
    const width = x2 - x1;
    const step = 6;
    const amplitude = 3;
    if (width < step) return `M ${x1} ${y} L ${x2} ${y}`;
    
    let path = `M ${x1} ${y}`;
    let currentX = x1;
    let i = 0;
    while (currentX < x2) {
        const nextX = Math.min(x2, currentX + step);
        const midX = (currentX + nextX) / 2;
        const cpY = y + (i % 2 === 0 ? -amplitude : amplitude);
        path += ` Q ${midX} ${cpY}, ${nextX} ${y}`;
        currentX = nextX;
        i++;
    }
    return path;
  };

  // Reusable Drawing Function
  const drawIntoSelection = (
      svg: d3.Selection<any, any, any, any>, 
      currentXScale: d3.ScaleTime<number, number>,
      width: number,
      height: number,
      isExport: boolean
  ) => {
      // Clear previous
      svg.selectAll("*").remove();
      
      const contentHeight = Math.max(height, processedData.totalRows * STYLES.taskHeight + TITLE_HEIGHT + HEADER_HEIGHT + 100);

      // Defs: Markers
      const defs = svg.append("defs");
      
      // Critical Arrow (Red)
      defs.append("marker").attr("id", "arrow-critical").attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 6).attr("markerHeight", 3).attr("orient", "auto")
        .append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", STYLES.criticalColor);

      // Dependency Arrow
      defs.append("marker").attr("id", "arrow-dependency").attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 6).attr("markerHeight", 4).attr("orient", "auto")
        .append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", "#64748b");

      // Legend Normal Arrow
      defs.append("marker").attr("id", "arrow-legend-normal").attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 6).attr("markerHeight", 3).attr("orient", "auto")
        .append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", "#000000");

      // Zone Markers
      processedData.zoneMeta.forEach((zone, i) => {
        defs.append("marker").attr("id", `arrow-zone-${i}`).attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 8).attr("markerHeight", 4).attr("orient", "auto")
          .append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", zone.color);
      });

      // 1. Static Layer: Background & Title
      const staticGroup = svg.append("g").attr("class", "static-layer");
      
      // Title Block
      const titleGroup = staticGroup.append("g").attr("class", "title-group");
      titleGroup.append("rect").attr("width", Math.max(width, 1000)).attr("height", TITLE_HEIGHT).attr("fill", "#ffffff");

      // Title Text
      titleGroup.append("text").attr("x", width / 2).attr("y", 30).attr("text-anchor", "middle").attr("font-size", "18px").attr("font-weight", "bold").attr("fill", "#1e293b")
        .text(projectName || "工程网络计划");

      // Legend
      const legendY = 55;
      const legendCenter = width / 2;
      
      const drawLegendItem = (x: number, label: string, color: string, dashed = false, type: 'line'|'diamond'|'wavy' = 'line') => {
          const g = titleGroup.append("g").attr("transform", `translate(${x}, ${legendY})`);
          if (type === 'line') {
              g.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 30).attr("y2", 0)
               .attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", dashed ? "5,5" : "none")
               .attr("marker-end", dashed ? "url(#arrow-dependency)" : (color === STYLES.criticalColor ? "url(#arrow-critical)" : "url(#arrow-legend-normal)"));
          } else if (type === 'diamond') {
               g.append("path").attr("d", d3.symbol().type(d3.symbolDiamond).size(60)())
                .attr("transform", "translate(15,0)").attr("fill", "#fff").attr("stroke", color);
          } else if (type === 'wavy') {
               g.append("path").attr("d", "M 0 0 Q 5 -3 10 0 T 20 0 T 30 0")
                .attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.5);
          }
          g.append("text").attr("x", 35).attr("y", 4).text(label).attr("font-size", "11px").attr("fill", "#475569");
      }
      
      drawLegendItem(legendCenter - 220, "关键工作", STYLES.criticalColor);
      drawLegendItem(legendCenter - 90, "普通工作", "#000000");
      drawLegendItem(legendCenter + 40, "虚工作", "#64748b", true);
      drawLegendItem(legendCenter + 150, "里程碑", STYLES.criticalColor, false, 'diamond');
      drawLegendItem(legendCenter + 240, "自由时差", STYLES.floatColor, false, 'wavy');

      // 2. Scrollable Content Layer (Everything shifted by TITLE_HEIGHT)
      const contentRoot = svg.append("g").attr("transform", `translate(0, ${TITLE_HEIGHT})`);
      
      // Layers
      const bgGroup = contentRoot.append("g").attr("class", "bg-layer");
      const gridGroup = contentRoot.append("g").attr("class", "grid-layer");
      const zoneGroup = contentRoot.append("g").attr("class", "zone-layer");
      const linkGroup = contentRoot.append("g").attr("class", "link-layer");
      const nodeGroup = contentRoot.append("g").attr("class", "node-layer");
      const textGroup = contentRoot.append("g").attr("class", "text-layer");
      const annotationGroup = contentRoot.append("g").attr("class", "annotation-layer");

      // Draw Grid
      const xAxisTicks = currentXScale.ticks(width / 100);
      gridGroup.selectAll(".v-grid")
        .data(xAxisTicks).enter().append("line")
        .attr("x1", d => currentXScale(d)).attr("x2", d => currentXScale(d))
        .attr("y1", 0).attr("y2", contentHeight)
        .attr("stroke", STYLES.gridColor).attr("stroke-width", 1).attr("stroke-opacity", STYLES.gridOpacity)
        .attr("stroke-dasharray", "4,4");

      // Time Ruler Backgrounds (Relative to contentRoot y=0)
      gridGroup.append("rect").attr("x", 0).attr("y", 0).attr("width", width * 5).attr("height", 20).attr("fill", "#f1f5f9").attr("stroke", "#e2e8f0");
      gridGroup.append("rect").attr("x", 0).attr("y", 20).attr("width", width * 5).attr("height", 20).attr("fill", "#fff").attr("stroke", "#e2e8f0");
      gridGroup.append("rect").attr("x", 0).attr("y", 40).attr("width", width * 5).attr("height", 20).attr("fill", "#f8fafc").attr("stroke", "#e2e8f0");

      const tickFormatYear = d3.timeFormat("%Y年");
      const tickFormatMonth = d3.timeFormat("%m月");
      const tickFormatDay = d3.timeFormat("%d");
      const domain = currentXScale.domain();
      const days = d3.timeDay.range(domain[0], domain[1], 1);
      const months = d3.timeMonth.range(domain[0], domain[1], 1);
      const years = d3.timeYear.range(domain[0], domain[1], 1);

      // Draw Years/Months/Days
      gridGroup.selectAll(".tick-year").data(years).enter().append("text")
        .attr("x", d => Math.max(120, currentXScale(d))).attr("y", 14)
        .attr("text-anchor", "start").attr("font-size", 10).attr("fill", "#64748b").attr("font-weight", "bold").text(d => tickFormatYear(d));
      
      gridGroup.selectAll(".tick-month").data(months).enter().append("text")
        .attr("x", d => { const x = currentXScale(d); return x < 120 ? -1000 : x + 5; }).attr("y", 34)
        .attr("text-anchor", "start").attr("font-size", 10).attr("fill", "#475569").text(d => tickFormatMonth(d));
      gridGroup.selectAll(".sep-month").data(months).enter().append("line")
        .attr("x1", d => currentXScale(d)).attr("x2", d => currentXScale(d)).attr("y1", 20).attr("y2", 40).attr("stroke", "#e2e8f0");

      const daysWidth = currentXScale(addDays(domain[0], 1)) - currentXScale(domain[0]);
      if (daysWidth > 15) {
        gridGroup.selectAll(".tick-day").data(days).enter().append("text")
          .attr("x", d => currentXScale(d) + daysWidth/2).attr("y", 54)
          .attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "#94a3b8").text(d => tickFormatDay(d));
        gridGroup.selectAll(".sep-day").data(days).enter().append("line")
          .attr("x1", d => currentXScale(d)).attr("x2", d => currentXScale(d)).attr("y1", 40).attr("y2", 60).attr("stroke", "#f1f5f9");
      }

      // Draw Zones
      const rowHeight = STYLES.taskHeight;
      processedData.zoneMeta.forEach((zone, i) => {
        const yPos = zone.startRow * rowHeight + HEADER_HEIGHT; 
        const h = zone.rowCount * rowHeight;
        const bgColor = (i % 2 === 0) ? '#ffffff' : '#f8fafc';

        bgGroup.append("rect").attr("x", 0).attr("y", yPos).attr("width", width * 5).attr("height", h).attr("fill", bgColor).attr("stroke", "none");
        gridGroup.append("line").attr("x1", 0).attr("x2", width * 5).attr("y1", yPos + h).attr("y2", yPos + h).attr("stroke", STYLES.zoneBorder).attr("stroke-width", 1).attr("stroke-dasharray", "5,5");

        const zoneLabelGroup = zoneGroup.append("g").attr("transform", `translate(0, ${yPos})`);
        zoneLabelGroup.append("rect").attr("width", 120).attr("height", h).attr("fill", bgColor).attr("stroke", STYLES.zoneBorder);
        zoneLabelGroup.append("rect").attr("width", 5).attr("height", h).attr("fill", zone.color);
        zoneLabelGroup.append("foreignObject").attr("x", 5).attr("y", 0).attr("width", 115).attr("height", h)
          .append("xhtml:div").style("height", "100%").style("width", "100%").style("display", "flex").style("align-items", "center").style("justify-content", "center").style("text-align", "center").style("font-weight", "bold").style("font-size", "14px").style("color", zone.color).style("word-wrap", "break-word").style("padding", "0 2px").style("line-height", "1.1")
          .text(zone.name);
      });

      // Task & Node Logic
      const taskCoords = new Map<string, { startX: number, endX: number, y: number, task: Task, isMilestone: boolean }>();
      processedData.tasks.forEach(item => {
        const isMilestone = item.task.type === LinkType.Wavy;
        const startDate = addDays(projectStartDate, item.task.earlyStart || 0);
        const endDate = addDays(projectStartDate, item.task.earlyFinish || 0);
        let startX = currentXScale(startDate);
        const endX = currentXScale(endDate);
        const y = (item.globalRowIndex * rowHeight) + HEADER_HEIGHT + (rowHeight * 0.75); 
        if (isMilestone) startX = endX;
        taskCoords.set(item.task.id, { startX, endX, y, task: item.task, isMilestone });
      });

      const uniqueNodes = new Map<string, {x: number, y: number, dayIndex: number, type: 'circle' | 'diamond', task?: Task}>();
      const getNodeKey = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;

      // Draw Tasks
      processedData.tasks.forEach(item => {
        const coords = taskCoords.get(item.task.id);
        if (!coords) return;
        const { startX, endX, y, task, isMilestone } = coords;
        const isCritical = item.task.isCritical;
        const zoneIndex = processedData.zoneMeta.findIndex(z => z.name === task.zone);
        const zoneColor = zoneIndex >= 0 ? processedData.zoneMeta[zoneIndex].color : STYLES.normalColor;
        const color = isCritical ? STYLES.criticalColor : zoneColor;
        const r = STYLES.nodeRadius;

        if (isMilestone) {
             const foX = startX - 60;
             const fo = textGroup.append("foreignObject").attr("x", foX).attr("y", y - 60).attr("width", 120).attr("height", 50).style("overflow", "visible").style("pointer-events", "none");
             fo.append("xhtml:div").style("display", "flex").style("flex-direction", "column").style("justify-content", "flex-end").style("align-items", "center").style("height", "100%").style("text-align", "center").style("font-size", "11px").style("color", color).style("pointer-events", "all")
               .html(`<span class="cursor-pointer hover:scale-105 transition-all select-none px-1 break-words w-full">${task.name}</span>`)
               .on("click", () => !isExport && setEditingTask(task));
        } else {
             const arrowStartX = startX + r;
             const arrowEndX = endX - r;
             
             // Marker
             const markerUrl = isCritical ? "url(#arrow-critical)" : `url(#arrow-zone-${zoneIndex})`;
             const isVirtual = task.type === LinkType.Virtual;

             // Line
             const line = linkGroup.append("line").attr("x1", arrowStartX).attr("y1", y).attr("x2", arrowEndX).attr("y2", y)
               .attr("stroke", color).attr("stroke-width", isVirtual ? 1 : (isCritical ? 2 : 1.5))
               .attr("marker-end", markerUrl).attr("cursor", isExport ? "default" : "grab");
             if (isVirtual) line.attr("stroke-dasharray", "5,5");

             // Draw Free Float (Wavy Line)
             // Only if task has free float > 0 and it's not a virtual task (usually virtual doesn't have float, but just in case)
             // and not milestone
             if (task.freeFloat && task.freeFloat > 0 && !isVirtual) {
                 const floatPixelWidth = currentXScale(addDays(projectStartDate, task.freeFloat)) - currentXScale(projectStartDate);
                 if (floatPixelWidth > 5) {
                    const waveStartX = endX + r;
                    const waveEndX = waveStartX + floatPixelWidth;
                    const wavyPath = getWavyPath(waveStartX, y, waveEndX);
                    
                    // Wavy Line
                    linkGroup.append("path")
                       .attr("d", wavyPath)
                       .attr("fill", "none")
                       .attr("stroke", STYLES.floatColor)
                       .attr("stroke-width", 1.5)
                       .attr("class", "float-wavy-line");
                    
                    // End Cap
                    linkGroup.append("line")
                       .attr("x1", waveEndX).attr("y1", y - 6).attr("x2", waveEndX).attr("y2", y + 6)
                       .attr("stroke", STYLES.floatColor).attr("stroke-width", 1.5);
                 }
             }

             // Interactive Drag only if not export
             if (!isExport) {
                line.on("click", () => setEditingTask(task));
                // Drag Logic
                const dragArrow = d3.drag<SVGLineElement, unknown>()
                   .on("start", function(event) { 
                      d3.select(this).attr("stroke-width", 4).attr("cursor", "grabbing");
                      (this as any)._initialX = event.x; (this as any)._initialY = event.y;
                   })
                   .on("drag", function(event) {
                      const dx = event.x - (this as any)._initialX;
                      const dy = event.y - (this as any)._initialY;
                      d3.select(this).attr("x1", arrowStartX + dx).attr("x2", arrowEndX + dx).attr("y1", y + dy).attr("y2", y + dy);
                   })
                   .on("end", function(event) {
                      const dx = event.x - (this as any)._initialX;
                      const dy = event.y - (this as any)._initialY;
                      
                      // Horizontal Drag: Change Duration
                      if (Math.abs(dx) > 20 && Math.abs(dy) < 30) {
                           const timeSpan = currentXScale.invert(arrowStartX + dx).getTime() - currentXScale.invert(arrowStartX).getTime();
                           const diffDays = Math.round(timeSpan / (1000 * 3600 * 24));
                           if (diffDays !== 0 && onUpdateTasks) {
                               onUpdateTasks(tasks.map(t => t.id === task.id ? { ...t, duration: Math.max(1, task.duration + diffDays) } : t));
                           }
                      }
                      // Vertical Drag: Change Lane/Zone
                      else if (Math.abs(dy) > 30) {
                           const newY = y + dy;
                           const newRow = Math.floor((newY - HEADER_HEIGHT) / STYLES.taskHeight);
                           
                           // Find which zone this row is in
                           const targetZone = processedData.zoneMeta.find(z => newRow >= z.startRow && newRow < z.endRow);
                           if (targetZone) {
                               const newLane = newRow - targetZone.startRow;
                               if (onUpdateTasks) {
                                   onUpdateTasks(tasks.map(t => t.id === task.id ? { ...t, zone: targetZone.name, manualLane: newLane } : t));
                               }
                           }
                      }

                      // Reset visual
                      d3.select(this).attr("stroke-width", isCritical ? 2 : 1.5).attr("cursor", "grab").attr("x1", arrowStartX).attr("x2", arrowEndX).attr("y1", y).attr("y2", y);
                   });
                line.call(dragArrow);
             }

             // Task Name
             const taskVisualWidth = Math.max(0, arrowEndX - arrowStartX);
             const foWidth = Math.max(40, taskVisualWidth); 
             const foX = arrowStartX;
             const fo = textGroup.append("foreignObject").attr("x", foX).attr("y", y - 60).attr("width", foWidth).attr("height", 55).style("overflow", "visible").style("pointer-events", "none");
             fo.append("xhtml:div").style("display", "flex").style("flex-direction", "column").style("justify-content", "flex-end").style("align-items", "center").style("height", "100%").style("text-align", "center").style("font-size", "11px").style("color", color).style("pointer-events", "all").style("padding-bottom", "2px")
               .html(`<span class="cursor-pointer hover:font-bold hover:scale-105 transition-all select-none px-1 break-words w-full">${task.name}</span>`)
               .on("click", () => !isExport && setEditingTask(task));
             
             // Duration
             textGroup.append("text").attr("x", (startX + endX)/2).attr("y", y + 14).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#64748b").text(task.duration + "d").attr("cursor", isExport?"default":"pointer").on("click", () => !isExport && setEditingTask(task));
        }

        const startKey = getNodeKey(startX, y);
        const endKey = getNodeKey(endX, y);
        if (isMilestone) {
            uniqueNodes.set(endKey, { x: endX, y, dayIndex: task.earlyFinish || 0, type: 'diamond', task: task });
        } else {
            if (!uniqueNodes.has(startKey)) uniqueNodes.set(startKey, { x: startX, y, dayIndex: task.earlyStart || 0, type: 'circle' });
            if (!uniqueNodes.has(endKey)) uniqueNodes.set(endKey, { x: endX, y, dayIndex: task.earlyFinish || 0, type: 'circle' });
        }
      });

      // Draw Dependencies
      processedData.tasks.forEach(item => {
        const task = item.task;
        const coords = taskCoords.get(task.id);
        if(!coords) return;
        const { startX: cX, y: cY } = coords;
        const r = STYLES.nodeRadius;

        task.predecessors.forEach(pid => {
          const pred = taskCoords.get(pid);
          if (pred) {
            const { endX: pX, y: pY } = pred;
            const gapDays = Math.round((task.earlyStart || 0) - (processedData.rawTasks.get(pid)?.earlyFinish || 0));
            let vY1 = pY; let vY2 = cY;
            if (cY > pY) { vY1 += r; vY2 -= r; } else if (cY < pY) { vY1 -= r; vY2 += r; }
            
            if (gapDays > 0) {
              const midX = cX; 
              const width = midX - pX;
              let pathData = `M ${pX + r} ${pY}`;
              const waveSegmentWidth = 10;
              const numSegments = Math.floor(width / waveSegmentWidth);
              for (let i = 0; i < numSegments; i++) pathData += ` q 2.5 -4 5 0 t 5 0`; 
              if ((pX + r + numSegments * waveSegmentWidth) < midX) pathData += ` L ${midX} ${pY}`;

              linkGroup.append("path").attr("d", pathData).attr("fill", "none").attr("stroke", "#64748b").attr("stroke-width", 1);
              linkGroup.append("line").attr("x1", midX).attr("y1", pY + (cY > pY ? r : -r)).attr("x2", cX).attr("y2", vY2).attr("stroke", "#64748b").attr("stroke-dasharray", "3,3").attr("marker-end", "url(#arrow-dependency)");
              
              const turnKey = getNodeKey(midX, pY);
              if (!uniqueNodes.has(turnKey)) uniqueNodes.set(turnKey, { x: midX, y: pY, dayIndex: task.earlyStart || 0, type: 'circle' });
            } else {
               if (Math.abs(pY - cY) > r * 2) {
                   linkGroup.append("line").attr("x1", pX).attr("y1", vY1).attr("x2", pX).attr("y2", vY2).attr("stroke", "#64748b").attr("stroke-width", 1).attr("stroke-dasharray", "3,3").attr("marker-end", "url(#arrow-dependency)");
               }
            }
          }
        });
      });

      // Draw Nodes
      uniqueNodes.forEach((node) => {
        if (node.type === 'diamond') {
             nodeGroup.append("path").attr("transform", `translate(${node.x}, ${node.y})`).attr("d", d3.symbol().type(d3.symbolDiamond).size(100)()).attr("fill", "#ffffff").attr("stroke", STYLES.criticalColor);
        } else {
             nodeGroup.append("circle").attr("cx", node.x).attr("cy", node.y).attr("r", STYLES.nodeRadius).attr("fill", "#fff").attr("stroke", "#000");
        }
        const displayDayIndex = node.dayIndex > 0 ? node.dayIndex - 1 : 0;
        const dateStr = d3.timeFormat("%m-%d")(addDays(projectStartDate, displayDayIndex));
        nodeGroup.append("text").attr("x", node.x).attr("y", node.y + 18).attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "#64748b").text(dateStr);
      });

      // Annotations
      annotationGroup.selectAll("*").remove();
      const safeAnnotations = Array.isArray(annotations) ? annotations : [];
      safeAnnotations.forEach(ann => {
        const g = annotationGroup.append("g").attr("transform", `translate(${ann.x}, ${ann.y})`);
        if (!isExport) {
            g.attr("cursor", "move");
            const dragAnn = d3.drag<SVGGElement, unknown>().on("drag", function(e) { d3.select(this).attr("transform", `translate(${e.x}, ${e.y})`); }).on("end", function(e) { onUpdateAnnotations && onUpdateAnnotations(safeAnnotations.map(a => a.id === ann.id ? { ...a, x: e.x, y: e.y } : a)); });
            g.call(dragAnn);
        }
        if (ann.type === 'text') {
            g.append("text").text(ann.content).attr("font-size", 14).attr("fill", "#333");
            if(!isExport) g.append("rect").attr("x", -5).attr("y", -15).attr("width", ann.content.length * 10 + 10).attr("height", 20).attr("fill", "transparent").on("dblclick", () => setEditingAnnotationId(ann.id));
        } else {
          g.append("circle").attr("r", 15).attr("fill", "yellow").attr("stroke", "orange");
          g.append("text").text(ann.content === 'flag' ? '🚩' : ann.content === 'star' ? '⭐' : '⚠️').attr("text-anchor", "middle").attr("dy", 5);
        }
        if(!isExport) g.on("contextmenu", (e) => { e.preventDefault(); onUpdateAnnotations && onUpdateAnnotations(safeAnnotations.filter(a => a.id !== ann.id)); });
      });

      return contentRoot;
  };

  const generateDrawioContent = () => {
     // Draw.io export logic (Simplified for length)
     return ''; // Placeholder
  };

  const handleExport = async (type: 'pdf' | 'png' | 'svg' | 'drawio' | 'html') => {
    setShowExportMenu(false);
    const fileName = `network-plan-${new Date().getTime()}`;

    // Common full-size parameters
    const totalDays = processedData.projectDuration + 10;
    const pxPerDay = 50; // High resolution for export
    const fullWidth = Math.max(dimensions.width, 120 + totalDays * pxPerDay + 100);
    const fullHeight = Math.max(dimensions.height, TITLE_HEIGHT + HEADER_HEIGHT + processedData.totalRows * STYLES.taskHeight + 100);

    try {
        if (type === 'drawio') {
             alert("Draw.io export not fully implemented in this update.");
             return;
        }

        // For PNG, PDF, SVG, HTML: Render a full-size chart into a hidden SVG
        const hiddenDiv = document.createElement('div');
        hiddenDiv.style.position = 'absolute'; hiddenDiv.style.top = '-9999px'; hiddenDiv.style.left = '-9999px';
        hiddenDiv.style.width = `${fullWidth}px`; hiddenDiv.style.height = `${fullHeight}px`;
        document.body.appendChild(hiddenDiv);

        const tempSvg = d3.select(hiddenDiv).append("svg")
            .attr("width", fullWidth)
            .attr("height", fullHeight)
            .attr("xmlns", "http://www.w3.org/2000/svg");

        const exportScale = d3.scaleTime()
            .domain([projectStartDate, addDays(projectStartDate, totalDays)])
            .range([120, fullWidth - 50]);

        drawIntoSelection(tempSvg, exportScale, fullWidth, fullHeight, true);

        if (type === 'png' || type === 'pdf') {
            const canvas = await html2canvas(hiddenDiv, { scale: 2, backgroundColor: '#ffffff', width: fullWidth, height: fullHeight });
            const imgData = canvas.toDataURL('image/png');
            if (type === 'png') {
                const link = document.createElement('a'); link.download = `${fileName}.png`; link.href = imgData;
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
            } else {
                const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
                pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
                pdf.save(`${fileName}.pdf`);
            }
        } else if (type === 'svg') {
             const svgNode = tempSvg.node();
             if(svgNode) {
                 const svgData = new XMLSerializer().serializeToString(svgNode);
                 const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
                 const url = URL.createObjectURL(blob);
                 const link = document.createElement('a'); link.href = url; link.download = `${fileName}.svg`;
                 document.body.appendChild(link); link.click(); document.body.removeChild(link);
             }
        } else if (type === 'html') {
             const svgNode = tempSvg.node();
             if(svgNode) {
                 const svgData = new XMLSerializer().serializeToString(svgNode);
                 const htmlContent = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${fileName}</title><style>body{margin:20px;font-family:sans-serif;background:#f8fafc;display:flex;justify-content:center;}.container{background:white;padding:20px;border-radius:8px;box-shadow:0 4px 6px -1px rgb(0 0 0/0.1);overflow:auto;max-width:100%;}</style></head><body><div class="container"><h1>${projectName||'工程网络计划'}</h1>${svgData}</div></body></html>`;
                 const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
                 const url = URL.createObjectURL(blob);
                 const link = document.createElement('a'); link.href = url; link.download = `${fileName}.html`;
                 document.body.appendChild(link); link.click(); document.body.removeChild(link);
             }
        }
        document.body.removeChild(hiddenDiv);
    } catch (e) {
        console.error("Export failed", e);
        alert("导出失败，请重试");
    }
  };

  // Main Effect
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || dimensions.width === 0) return;

    const width = dimensions.width;
    const height = dimensions.height;
    
    const svg = d3.select(svgRef.current);
    const initialXScale = d3.scaleTime()
      .domain([projectStartDate, addDays(projectStartDate, processedData.projectDuration + 15)])
      .range([120, width - 50]);

    // Initial Draw
    const contentGroup = drawIntoSelection(svg, initialXScale, width, height, false);

    // Zoom setup
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on("zoom", (event) => {
        const newXScale = event.transform.rescaleX(initialXScale);
        drawIntoSelection(svg, newXScale, width, height, false);
        const yOffset = event.transform.y;
        svg.select(".grid-layer").attr("transform", `translate(0, ${yOffset})`);
        svg.select(".bg-layer").attr("transform", `translate(0, ${yOffset})`);
        svg.select(".zone-layer").attr("transform", `translate(0, ${yOffset})`);
        svg.select(".link-layer").attr("transform", `translate(0, ${yOffset})`);
        svg.select(".node-layer").attr("transform", `translate(0, ${yOffset})`);
        svg.select(".text-layer").attr("transform", `translate(0, ${yOffset})`);
        svg.select(".annotation-layer").attr("transform", `translate(0, ${yOffset})`);
        svg.select(".static-layer").attr("transform", `translate(0, ${yOffset})`);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;
    svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0));

    svg.on("click", (event) => {
      if (activeTool !== 'select' && onUpdateAnnotations) {
         const [x, y] = d3.pointer(event);
         const transform = d3.zoomTransform(svg.node()!);
         const newAnn: Annotation = {
           id: crypto.randomUUID(), type: activeTool === 'text' ? 'text' : 'icon',
           content: activeTool === 'text' ? '双击编辑' : activeTool,
           x: (x - transform.x) / transform.k, y: (y - transform.y) / transform.k 
         };
         onUpdateAnnotations([...(Array.isArray(annotations) ? annotations : []), newAnn]);
         setActiveTool('select');
      }
    });

  }, [processedData, projectStartDate, viewMode, dimensions, annotations, activeTool, editingAnnotationId, projectName]);

  useEffect(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    let k = 1;
    if (viewMode === 'month') k = 0.5;
    if (viewMode === 'year') k = 0.1;
    svg.transition().duration(500).call(zoomBehaviorRef.current.transform, d3.zoomIdentity.scale(k));
  }, [viewMode]);

  return (
    <div className="h-full flex flex-col bg-slate-50 relative border-l border-slate-200">
      <div className="h-10 border-b border-slate-200 bg-white flex items-center px-4 gap-3 shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-2 text-slate-700">
          <Layers size={16} className="text-cyan-600"/>
          <span className="font-bold text-sm">时标网络计划</span>
        </div>
        <div className="h-4 w-px bg-slate-300 mx-2"></div>
        <div className="flex bg-slate-100 rounded p-0.5 border border-slate-200">
          {(['year', 'month', 'day'] as ViewMode[]).map(m => (
            <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1 text-xs rounded transition-all ${viewMode === m ? 'bg-white text-cyan-700 shadow-sm font-bold ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
              {{year: '年', month: '月', day: '日'}[m]}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-slate-300 mx-2"></div>
        <div className="flex gap-1">
           <button onClick={() => setActiveTool('text')} className={`p-1.5 rounded ${activeTool === 'text' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`} title="插入文本"><Type size={14}/></button>
           <button onClick={() => setActiveTool('flag')} className={`p-1.5 rounded ${activeTool === 'flag' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`} title="插入旗帜"><Flag size={14}/></button>
           <button onClick={() => setActiveTool('alert')} className={`p-1.5 rounded ${activeTool === 'alert' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`} title="插入警告"><AlertTriangle size={14}/></button>
           <button onClick={() => setActiveTool('star')} className={`p-1.5 rounded ${activeTool === 'star' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`} title="插入标记"><Star size={14}/></button>
        </div>
        <div className="flex-1"></div>
        
        <div className="relative">
            <button 
                onClick={() => setShowExportMenu(!showExportMenu)} 
                className="p-1 flex items-center gap-1 text-xs bg-cyan-600 text-white px-3 py-1 rounded hover:bg-cyan-700 shadow-sm transition"
            >
              <Download size={14}/> 导出
            </button>
            
            {showExportMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)}></div>
                    <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 shadow-xl rounded-md overflow-hidden z-50 w-44 flex flex-col animate-in fade-in zoom-in-95 duration-100">
                        <button onClick={() => handleExport('png')} className="text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-cyan-600 flex items-center gap-2 transition-colors border-b border-slate-50">
                            <ImageIcon size={14} className="text-purple-500"/> 
                            <span>图片 (PNG)</span>
                        </button>
                        <button onClick={() => handleExport('pdf')} className="text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-cyan-600 flex items-center gap-2 transition-colors border-b border-slate-50">
                            <FileText size={14} className="text-red-500"/> 
                            <span>文档 (PDF)</span>
                        </button>
                         <button onClick={() => handleExport('svg')} className="text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-cyan-600 flex items-center gap-2 transition-colors border-b border-slate-50">
                            <Code size={14} className="text-orange-500"/> 
                            <span>矢量图 (SVG)</span>
                        </button>
                         <button onClick={() => handleExport('html')} className="text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-cyan-600 flex items-center gap-2 transition-colors">
                            <Globe size={14} className="text-emerald-500"/> 
                            <span>网页 (HTML)</span>
                        </button>
                    </div>
                </>
            )}
        </div>
      </div>

      <div ref={containerRef} className={`flex-1 overflow-hidden relative bg-slate-50 ${activeTool === 'select' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}>
        <svg ref={svgRef} className="w-full h-full block"></svg>
        <div ref={tooltipRef} className="absolute pointer-events-none bg-white/95 p-3 rounded shadow-xl border border-slate-200 z-50 opacity-0 transition-opacity duration-150 text-sm min-w-[180px] backdrop-blur text-left" style={{ top: 0, left: 0 }} />
      </div>

      {editingTask && (
        <div className="absolute inset-0 z-50 bg-slate-900/20 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-lg flex flex-col animate-in fade-in zoom-in duration-200">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
                <h4 className="font-bold text-slate-700 flex items-center gap-2 text-lg"><Edit3 size={18} className="text-blue-600"/> 编辑工作属性</h4>
                <button onClick={() => setEditingTask(null)} className="text-slate-400 hover:text-slate-600 transition"><X size={20}/></button>
             </div>
             <div className="p-5 grid gap-4 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-4 gap-4">
                   <div className="col-span-1">
                      <label className="block text-xs font-bold text-slate-500 mb-1">代号</label>
                      <input className="w-full border border-slate-300 rounded p-2 text-sm bg-slate-100 text-slate-500 cursor-not-allowed" value={editingTask.id} disabled title="代号不可修改" />
                   </div>
                   <div className="col-span-3">
                      <label className="block text-xs font-bold text-slate-500 mb-1">工作名称</label>
                      <input className="w-full border border-slate-300 rounded p-2 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none" 
                        value={editingTask.name} 
                        onChange={e => setEditingTask({...editingTask, name: e.target.value})} 
                        placeholder="请输入工作名称"
                      />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-md border border-slate-200">
                   <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">开始日期 (约束)</label>
                     <input type="date" className="w-full border border-slate-300 rounded p-1.5 text-sm" 
                       value={formatDateStr(editingTask.earlyStart || 0)} 
                       onChange={e => {
                         const days = parseDateStr(e.target.value);
                         setEditingTask({...editingTask, constraintDate: days});
                       }} 
                     />
                     <div className="text-[10px] text-slate-400 mt-1">设置此项将限制最早开始时间</div>
                   </div>
                   <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">完成日期 (自动调整工期)</label>
                     <input type="date" className="w-full border border-slate-300 rounded p-1.5 text-sm" 
                       value={formatDateStr(editingTask.earlyFinish || 0)} 
                       onChange={e => {
                         const endDays = parseDateStr(e.target.value);
                         const duration = Math.max(0, endDays - (editingTask.earlyStart || 0));
                         setEditingTask({...editingTask, duration});
                       }} 
                     />
                     <div className="text-[10px] text-slate-400 mt-1">修改完成日期会改变工期</div>
                   </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                   <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">工期 (天)</label>
                     <input type="number" className="w-full border border-slate-300 rounded p-2 text-sm" value={editingTask.duration} onChange={e => setEditingTask({...editingTask, duration: parseInt(e.target.value)||0})} />
                   </div>
                   <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">区域</label>
                     <input className="w-full border border-slate-300 rounded p-2 text-sm" value={editingTask.zone||''} onChange={e => setEditingTask({...editingTask, zone: e.target.value})} list="zones" />
                     <datalist id="zones">
                       {processedData.zoneMeta.map(z => <option key={z.name} value={z.name} />)}
                     </datalist>
                   </div>
                   <div>
                       <label className="block text-xs font-bold text-slate-500 mb-1">类型</label>
                       <select className="w-full border border-slate-300 rounded p-2 text-sm bg-white" value={editingTask.type} onChange={e => setEditingTask({...editingTask, type: e.target.value as LinkType})}>
                           <option value={LinkType.Real}>实工作</option>
                           <option value={LinkType.Virtual}>虚工作 (等待/缓冲)</option>
                           <option value={LinkType.Wavy}>里程碑</option>
                       </select>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">紧前工作</label>
                        <input className="w-full border border-slate-300 rounded p-2 text-sm" value={editingTask.predecessors.join(',')} onChange={e => setEditingTask({...editingTask, predecessors: e.target.value.split(',').filter(x=>x)})} />
                    </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                            <MoveVertical size={12}/> 泳道序号 (手动)
                        </label>
                        <input 
                            type="number"
                            min="0"
                            className="w-full border border-slate-300 rounded p-2 text-sm" 
                            value={editingTask.manualLane ?? ''} 
                            onChange={e => setEditingTask({...editingTask, manualLane: e.target.value === '' ? undefined : parseInt(e.target.value)})}
                            placeholder="自动 (0, 1, 2...)"
                            title="指定工作在所属区域中的垂直行号，0为第一行"
                        />
                        <div className="text-[10px] text-slate-400 mt-1">留空自动排布，0代表第一行</div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">备注/描述</label>
                    <textarea className="w-full border border-slate-300 rounded p-2 text-sm h-20 resize-none focus:ring-2 focus:ring-blue-500 outline-none" 
                      value={editingTask.description || ''} 
                      onChange={e => setEditingTask({...editingTask, description: e.target.value})} 
                      placeholder="输入工作备注或详细描述..."
                    />
                </div>
             </div>
             <div className="p-4 border-t bg-slate-50 rounded-b-lg flex justify-end gap-2">
                <button onClick={() => setEditingTask(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded transition">取消</button>
                <button onClick={() => { onUpdateTasks && onUpdateTasks(tasks.map(t => t.id === editingTask.id ? editingTask : t)); setEditingTask(null); }} className="bg-blue-600 text-white px-6 py-2 rounded text-sm hover:bg-blue-700 shadow-md transition font-medium flex items-center gap-2">
                  <Save size={16} /> 保存修改
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkDiagram;
