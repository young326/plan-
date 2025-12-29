
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Task, LinkType, Annotation } from '../types';
import { ZoomIn, ZoomOut, Download, Type, BoxSelect, Settings, Calendar, MousePointer2, Layers, Flag, AlertTriangle, Star, CheckCircle, Edit3, X, Undo, Redo, Save, Image as ImageIcon, FileText, Code, FileCode, Globe, MoveVertical, ArrowDownUp, Share2, ChevronUp, ChevronDown, ListTree, Link as LinkIcon, Hash, FileJson, Clock, Move, Maximize2, Minimize2, Info, Printer, Copy, Trash2, Percent, Search, Disc, Palette } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface NetworkDiagramProps {
  tasks: Task[];
  annotations?: Annotation[]; 
  onUpdateTasks?: (tasks: Task[]) => void;
  onUpdateAnnotations?: (annotations: UpdateAnnotations) => void;
  onUpdateAnalysis: (criticalPath: string[], duration: number) => void;
  projectStartDate: Date;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  projectName?: string;
  zoneOrder?: string[];
  onZoneOrderChange?: (newOrder: string[]) => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  onExportJson?: () => void;
  isDarkMode?: boolean;
}

type UpdateAnnotations = (annotations: Annotation[]) => void;

const getStyles = (isDark: boolean) => ({
  gridColor: isDark ? '#475569' : '#94a3b8', 
  gridOpacity: 0.2,
  zoneBg: isDark ? '#1e293b' : '#f8fafc',
  zoneBgAlt: isDark ? '#0f172a' : '#ffffff',
  zoneBorder: isDark ? '#334155' : '#cbd5e1',
  taskHeight: 80,
  nodeRadius: 5, 
  criticalColor: isDark ? '#f87171' : '#ef4444', // Red-400 for dark (Deeper than 300), Red-500 for light
  normalColor: isDark ? '#60a5fa' : '#2563eb',   // Blue-400 for dark (Deeper than 300), Blue-600 for light
  virtualColor: isDark ? '#94a3b8' : '#000000',  // Slate-400 for dark
  floatColor: isDark ? '#94a3b8' : '#000000',
  summaryColor: isDark ? '#cbd5e1' : '#0f172a',
  selectionColor: '#3b82f6',
  highlightColor: '#f59e0b',
  progressColor: isDark ? '#10b981' : '#10b981', 
  progressBg: isDark ? '#334155' : '#e2e8f0',
  fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
  textColor: isDark ? '#e2e8f0' : '#1e293b', // Slate-200 for dark (Softer white)
  textColorSecondary: isDark ? '#94a3b8' : '#64748b', // Slate-400 for dark (Less glaring)
  textColorMuted: isDark ? '#64748b' : '#94a3b8',
  headerBg: isDark ? '#1e293b' : '#f1f5f9',
  headerStroke: isDark ? '#334155' : '#cbd5e1',
  titleBg: isDark ? '#0f172a' : '#ffffff',
});

const TITLE_HEIGHT = 80;
const HEADER_HEIGHT = 60;

const ZONE_COLORS = [
  '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#4f46e5', '#ea580c', '#65a30d', '#be185d'
];

const CUSTOM_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', 
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b'
];

type TimeScaleMode = 'day' | 'month' | 'year';

export const NetworkDiagram: React.FC<NetworkDiagramProps> = ({ 
  tasks, 
  onUpdateTasks,
  onUpdateAnalysis,
  projectStartDate,
  projectName,
  zoneOrder,
  onZoneOrderChange,
  isFocusMode,
  onToggleFocusMode,
  onExportJson,
  isDarkMode = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [editingTask, setEditingTask] = useState<(Task & { successorsText?: string }) | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [timeScaleMode, setTimeScaleMode] = useState<TimeScaleMode>('day');
  const [zoomTransform, setZoomTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, taskId: string } | null>(null);
  const [draggingInfo, setDraggingInfo] = useState<{ taskId: string, isStart: boolean, date: string } | null>(null);
  
  // New state for progress rings
  const [showProgressRings, setShowProgressRings] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const processedData = useMemo(() => {
    const _tasks = tasks; 
    const taskMap = new Map(_tasks.map(t => [t.id, t]));
    const projectDuration = Math.max(..._tasks.map(t => t.earlyFinish || 0), 0);
    const criticalPathIds = _tasks.filter(t => t.isCritical).map(t => t.id);

    setTimeout(() => onUpdateAnalysis(criticalPathIds, projectDuration), 0);

    const zones: string[] = Array.from<string>(new Set(_tasks.map(t => (t.zone || '默认区域').trim())));
    const sortedZones = [...zones];
    
    if (zoneOrder && zoneOrder.length > 0) {
        sortedZones.sort((a, b) => {
            const idxA = zoneOrder.indexOf(a);
            const idxB = zoneOrder.indexOf(b);
            if (idxA === -1 && idxB === -1) return a.localeCompare(b);
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });
    } else { sortedZones.sort(); }
    
    const layoutData: { task: Task; laneIndex: number; globalRowIndex: number; zone: string }[] = [];
    let currentGlobalRow = 0;
    const zoneMeta: { name: string; startRow: number; rowCount: number; endRow: number; color: string }[] = [];
    const taskLaneMap = new Map<string, number>();

    sortedZones.forEach((zone, index) => {
      const zoneTasks = _tasks.filter(t => (t.zone || '默认区域') === zone);
      zoneTasks.sort((a, b) => (a.earlyStart || 0) - (b.earlyStart || 0) || (b.duration - a.duration) || a.id.localeCompare(b.id));
      const lanes: number[] = [];
      const zoneStartRow = currentGlobalRow;
      zoneTasks.forEach(task => {
        let assignedLane = -1;
        if (task.manualLane !== undefined && task.manualLane >= 0) {
             assignedLane = task.manualLane;
             while(lanes.length <= assignedLane) lanes.push(-Infinity);
        } else {
             const directPred = task.predecessors
                  .map(pid => taskMap.get(pid))
                  .find(p => p && (p.zone || '默认区域') === zone && Math.abs((p.earlyFinish || 0) - (task.earlyStart || 0)) < 0.01);
             if (directPred) {
                 const predLane = taskLaneMap.get(directPred.id);
                 if (predLane !== undefined && (lanes[predLane] || 0) <= (task.earlyStart || 0) + 0.1) assignedLane = predLane;
             }
             if (assignedLane === -1) {
                 for (let i = 0; i < lanes.length; i++) {
                     if ((lanes[i] || 0) <= (task.earlyStart || 0) + 0.1) { assignedLane = i; break; }
                 }
             }
             if (assignedLane === -1) { assignedLane = lanes.length; lanes.push(-Infinity); }
        }
        lanes[assignedLane] = Math.max(lanes[assignedLane] || -Infinity, task.earlyFinish || 0);
        taskLaneMap.set(task.id, assignedLane);
        layoutData.push({ task, laneIndex: assignedLane, globalRowIndex: zoneStartRow + assignedLane, zone });
      });
      const rowCount = Math.max(lanes.length, 1);
      currentGlobalRow += rowCount;
      zoneMeta.push({ name: zone, startRow: zoneStartRow, rowCount, endRow: zoneStartRow + rowCount, color: ZONE_COLORS[index % ZONE_COLORS.length] });
    });
    return { tasks: layoutData, projectDuration, zoneMeta, totalRows: currentGlobalRow, rawTasks: taskMap, sortedZones };
  }, [tasks, zoneOrder, onUpdateAnalysis]);

  const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const formatYYMMDD = d3.timeFormat("%y/%m/%d");

  const toLocalYYYYMMDD = (date: Date) => {
    if (!date || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getWavyPath = (x1: number, x2: number, y: number) => {
    const width = x2 - x1;
    if (width <= 2) return ""; 
    const step = 6; const amplitude = 3;
    let path = `M ${x1} ${y}`;
    let currentX = x1; let up = true;
    while (currentX < x2) {
      const nextX = Math.min(currentX + step, x2);
      const cpX = (currentX + nextX) / 2;
      const cpY = y + (up ? -amplitude : amplitude);
      path += ` Q ${cpX} ${cpY}, ${nextX} ${y}`;
      currentX = nextX; up = !up;
    }
    return path;
  };

  const handleTaskContextMenu = (event: any, task: Task) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY, taskId: task.id });
  };

  const handleCopyTask = (taskId: string) => {
      setContextMenu(null);
      const original = tasks.find(t => t.id === taskId);
      if (!original || !onUpdateTasks) return;
      const newId = (Math.max(...tasks.map(t => parseInt(t.id) || 0), 0) + 1).toString();
      const newTask: Task = { ...original, id: newId, name: `${original.name} (复制)`, predecessors: [...original.predecessors], constraintDate: original.earlyStart };
      onUpdateTasks([...tasks, newTask]);
  };

  const handleDeleteTask = (taskId: string) => {
      setContextMenu(null);
      if (onUpdateTasks) {
          onUpdateTasks(tasks.filter(t => t.id !== taskId).map(t => ({ ...t, predecessors: t.predecessors.filter(pid => pid !== taskId) })));
      }
  };

  const drawProgressRing = (
    selection: d3.Selection<SVGGElement, any, any, any>,
    cx: number,
    cy: number,
    radius: number,
    progress: number,
    styles: any
  ) => {
    const arc = d3.arc<any>()
      .innerRadius(radius + 1)
      .outerRadius(radius + 3)
      .startAngle(0);

    selection.append("path")
      .attr("transform", `translate(${cx}, ${cy})`)
      .attr("d", arc({ endAngle: 2 * Math.PI }) as string)
      .attr("fill", styles.progressBg);

    selection.append("path")
      .attr("transform", `translate(${cx}, ${cy})`)
      .attr("d", arc({ endAngle: (progress / 100) * 2 * Math.PI }) as string)
      .attr("fill", styles.progressColor);
  };

  const drawIntoSelection = (
    svg: d3.Selection<any, any, any, any>, xScale: d3.ScaleTime<number, number>, width: number, height: number, yOffset: number = 0, overrideMode?: TimeScaleMode,
    forcedStyles?: any
  ) => {
      const styles = forcedStyles || getStyles(isDarkMode);
      svg.selectAll("*").remove();
      const currentMode = overrideMode || timeScaleMode;
      const contentHeight = Math.max(height, processedData.totalRows * styles.taskHeight + TITLE_HEIGHT + HEADER_HEIGHT + 100);
      
      svg.attr("text-rendering", "geometricPrecision")
         .attr("shape-rendering", "geometricPrecision");

      const defs = svg.append("defs");
      
      const addMarker = (id: string, color: string, w=10, h=5) => {
         defs.append("marker").attr("id", id).attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", w).attr("markerHeight", h).attr("orient", "auto")
          .append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", color);
      };
      addMarker("arrow-critical", styles.criticalColor, 10, 5);
      addMarker("arrow-normal", styles.normalColor, 10, 5);
      addMarker("arrow-completed", styles.progressColor, 10, 5);
      addMarker("arrow-virtual", styles.virtualColor, 10, 5);
      addMarker("arrow-summary", styles.summaryColor, 10, 5);
      addMarker("arrow-selection", styles.selectionColor, 16, 8);
      
      const filter = defs.append("filter").attr("id", "selection-glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
      filter.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "4").attr("result", "blur");
      filter.append("feComponentTransfer").append("feFuncA").attr("type", "linear").attr("slope", "0.6");
      const feMerge = filter.append("feMerge");
      feMerge.append("feMergeNode").attr("in", "blur");
      feMerge.append("feMergeNode").attr("in", "SourceGraphic");

      const staticLayer = svg.append("g").attr("class", "static-layer");
      staticLayer.append("rect").attr("width", width).attr("height", TITLE_HEIGHT).attr("fill", styles.titleBg).on("click", () => setEditingTask(null));
      staticLayer.append("text").attr("x", width / 2).attr("y", 40).attr("text-anchor", "middle").attr("font-size", "22px").attr("font-weight", "bold").attr("fill", styles.textColor).text(projectName || "工程网络计划");
      
      // Draw Legend
      const legendData = [
        { label: "关键工作", color: styles.criticalColor, type: "line" },
        { label: "普通工作", color: styles.normalColor, type: "line" },
        { label: "已完成", color: styles.progressColor, type: "line" },
        { label: "里程碑", color: styles.criticalColor, type: "diamond" },
        { label: "虚工作", color: styles.virtualColor, type: "dashed" },
        { label: "自由时差", color: styles.floatColor, type: "wavy" }
      ];
      
      const legendItemWidth = 80;
      const legendTotalWidth = legendData.length * legendItemWidth;
      const legendStartX = (width - legendTotalWidth) / 2;
      const legendY = 68;

      const legendG = staticLayer.append("g").attr("transform", `translate(${legendStartX}, ${legendY})`);
      
      legendData.forEach((item, i) => {
        const g = legendG.append("g").attr("transform", `translate(${i * legendItemWidth}, 0)`);
        if (item.type === "line" || item.type === "dashed") {
            g.append("line")
             .attr("x1", 0).attr("y1", 0).attr("x2", 20).attr("y2", 0)
             .attr("stroke", item.color).attr("stroke-width", 2)
             .attr("stroke-dasharray", item.type === "dashed" ? "4,2" : "none");
        } else if (item.type === "diamond") {
            g.append("path")
             .attr("d", d3.symbol().type(d3.symbolDiamond).size(60)())
             .attr("fill", "none").attr("stroke", item.color).attr("stroke-width", 2)
             .attr("transform", "translate(10, 0)");
        } else if (item.type === "wavy") {
             const path = getWavyPath(0, 20, 0);
             g.append("path")
              .attr("d", path)
              .attr("fill", "none")
              .attr("stroke", item.color)
              .attr("stroke-width", 1.5);
        }
        g.append("text")
         .attr("x", 26).attr("y", 1)
         .attr("dominant-baseline", "middle")
         .attr("font-size", "10px")
         .attr("fill", styles.textColorSecondary)
         .attr("font-weight", "bold")
         .text(item.label);
      });

      staticLayer.append("rect").attr("x", 0).attr("y", TITLE_HEIGHT).attr("width", width).attr("height", HEADER_HEIGHT).attr("fill", styles.headerBg).attr("stroke", styles.headerStroke).attr("stroke-width", 0.5);

      let xAxisTicks: Date[];
      let labelFormat: (d: Date) => string;
      switch(currentMode) {
        case 'year': xAxisTicks = xScale.ticks(d3.timeYear); labelFormat = d3.timeFormat("%Y年"); break;
        case 'month': xAxisTicks = xScale.ticks(d3.timeMonth); labelFormat = d3.timeFormat("%y/%m"); break;
        default: xAxisTicks = xScale.ticks(width / 120); labelFormat = formatYYMMDD;
      }

      const ticksGroup = staticLayer.append("g").attr("transform", `translate(0, ${TITLE_HEIGHT})`);
      xAxisTicks.forEach(tick => {
          const xPos = xScale(tick);
          if (xPos < 0 || xPos > width) return;
          ticksGroup.append("line").attr("x1", xPos).attr("x2", xPos).attr("y1", 0).attr("y2", HEADER_HEIGHT).attr("stroke", styles.headerStroke).attr("stroke-width", 0.5);
          ticksGroup.append("text").attr("x", xPos + 5).attr("y", HEADER_HEIGHT / 2).attr("dominant-baseline", "middle").attr("font-size", "10px").attr("fill", styles.textColorSecondary).text(labelFormat(tick));
      });

      const contentRoot = svg.append("g").attr("transform", `translate(0, ${TITLE_HEIGHT + HEADER_HEIGHT + yOffset})`);
      const bgGroup = contentRoot.append("g");
      const gridGroup = contentRoot.append("g");
      const zoneGroup = contentRoot.append("g");
      const linkGroup = contentRoot.append("g");
      const textGroup = contentRoot.append("g");
      const nodeGroup = contentRoot.append("g"); 
      const progressGroup = contentRoot.append("g");
      const milestoneNodeGroup = contentRoot.append("g");

      bgGroup.append("rect").attr("width", width).attr("height", contentHeight).attr("fill", "transparent").on("click", () => { setEditingTask(null); setContextMenu(null); });
      xAxisTicks.forEach(tick => {
        const xPos = xScale(tick);
        gridGroup.append("line").attr("x1", xPos).attr("x2", xPos).attr("y1", -HEADER_HEIGHT).attr("y2", contentHeight).attr("stroke", styles.gridColor).attr("stroke-width", 1).attr("stroke-opacity", styles.gridOpacity).attr("stroke-dasharray", "4,4");
      });

      const rowHeight = styles.taskHeight;
      processedData.zoneMeta.forEach((zone, i) => {
        const yPos = zone.startRow * rowHeight; const h = zone.rowCount * rowHeight;
        bgGroup.append("rect").attr("x", 0).attr("y", yPos).attr("width", width).attr("height", h).attr("fill", (i % 2 === 0) ? styles.zoneBgAlt : styles.zoneBg);
        const zoneLabel = zoneGroup.append("g").attr("transform", `translate(0, ${yPos})`);
        zoneLabel.append("rect").attr("width", 120).attr("height", h).attr("fill", (i % 2 === 0) ? styles.zoneBgAlt : styles.zoneBg).attr("stroke", styles.zoneBorder);
        zoneLabel.append("text").attr("x", 60).attr("y", h/2).attr("text-anchor", "middle").attr("dominant-baseline", "middle").attr("font-weight", "bold").attr("font-size", "14px").attr("fill", zone.color).text(zone.name);
      });

      const taskStartPos = new Map<string, { x: number, y: number }>();
      const taskFinishPos = new Map<string, { x: number, y: number }>();
      const milestonePositions = new Set<string>();
      const finishNodePositions = new Set<string>(); 

      processedData.tasks.forEach(item => {
        const task = item.task;
        const endX = xScale(addDays(projectStartDate, task.earlyFinish || 0));
        const startX = xScale(addDays(projectStartDate, task.earlyStart || 0));
        const y = (item.globalRowIndex * rowHeight) + (rowHeight * 0.55);
        if (task.type === LinkType.Wavy) { milestonePositions.add(`${Math.round(endX)},${Math.round(y)}`); milestonePositions.add(`${Math.round(startX)},${Math.round(y)}`); }
        else { finishNodePositions.add(`${Math.round(endX)},${Math.round(y)}`); }
      });

      const dragNode = d3.drag<any, any>()
        .on("start", function(event, d: any) { 
           d3.select(this).attr("stroke-width", 6).attr("stroke", styles.selectionColor).style("filter", "url(#selection-glow)");
           const newDate = toLocalYYYYMMDD(addDays(projectStartDate, d.isStart ? d.task.earlyStart : (d.task.earlyFinish - 1)));
           setDraggingInfo({ taskId: d.task.id, isStart: d.isStart, date: newDate });
        })
        .on("drag", function(event, d: any) {
           const newX = event.x;
           const newDate = xScale.invert(newX);
           const baseDate = new Date(projectStartDate);
           baseDate.setHours(0,0,0,0);
           const diffDays = Math.round((newDate.getTime() - baseDate.getTime()) / (1000 * 3600 * 24));
           const { task, isStart } = d;
           
           setDraggingInfo({ taskId: task.id, isStart, date: toLocalYYYYMMDD(addDays(baseDate, diffDays)) });

           if (onUpdateTasks) {
             const newFullTasks = [...tasks];
             const updatedTasksMap = new Map<string, Task>();
             
             let mainTask = { ...task };
             const oldStart = mainTask.earlyStart || 0;
             const oldFinish = (mainTask.earlyFinish || 1) - 1;

             if (isStart) {
                mainTask.constraintDate = diffDays;
                mainTask.duration = Math.max(0, oldFinish - diffDays + 1);
             } else {
                mainTask.duration = Math.max(0, diffDays - oldStart + 1);
             }
             updatedTasksMap.set(mainTask.id, mainTask);

             if (isStart) {
                mainTask.predecessors.forEach(pid => {
                  const p = newFullTasks.find(t => t.id === pid);
                  if (p && Math.abs(((p.earlyFinish || 1) - 1) - oldStart) < 0.001) {
                    const updatedP = { ...p, duration: Math.max(0, diffDays - (p.earlyStart || 0)) };
                    updatedTasksMap.set(pid, updatedP);
                  }
                });
             } else {
                newFullTasks.forEach(t => {
                   if (t.predecessors.includes(task.id) && Math.abs((t.earlyStart || 0) - oldFinish) < 0.001) {
                      const tOldFinish = (t.earlyFinish || 1) - 1;
                      const updatedT = { ...t, constraintDate: diffDays, duration: Math.max(0, tOldFinish - diffDays + 1) };
                      updatedTasksMap.set(t.id, updatedT);
                   }
                });
             }

             const finalTasks = newFullTasks.map(t => updatedTasksMap.has(t.id) ? updatedTasksMap.get(t.id)! : t);
             onUpdateTasks(finalTasks);
           }
        })
        .on("end", function() { 
           d3.select(this).attr("stroke-width", 1).attr("stroke", isDarkMode ? "#ffffff" : "#000000").style("filter", "none");
           setDraggingInfo(null);
        });

      processedData.tasks.forEach(item => {
        const task = item.task;
        const startX = xScale(addDays(projectStartDate, task.earlyStart || 0));
        const endX = xScale(addDays(projectStartDate, task.earlyFinish || 0));
        const y = (item.globalRowIndex * rowHeight) + (rowHeight * 0.55);
        const r = styles.nodeRadius;
        taskStartPos.set(task.id, { x: startX, y });
        taskFinishPos.set(task.id, { x: endX, y });
        
        const isSelected = editingTask?.id === task.id;
        const isHovered = hoveredTaskId === task.id;
        const isMilestone = task.type === LinkType.Wavy;
        const isVirtual = task.type === LinkType.Virtual;
        const isCompleted = task.completion === 100 && !isVirtual;

        // Determine base color with custom override priority
        let color = task.color || styles.normalColor;
        
        if (isCompleted) {
          color = styles.progressColor;
        } else if (task.isCritical || isMilestone) {
          color = styles.criticalColor;
        } else if (isVirtual) {
          color = styles.virtualColor;
        }

        // Selection/Hover override everything
        if (isSelected) color = styles.selectionColor;
        else if (isHovered) color = styles.highlightColor;

        // Dynamic marker handling for custom colors
        if (task.color) {
            const markerId = `arrow-${task.color.replace('#', '')}`;
            if (defs.select(`#${markerId}`).empty()) {
                addMarker(markerId, task.color);
            }
        }

        if (isMilestone) {
          const diamondGroup = milestoneNodeGroup.append("g").attr("transform", `translate(${endX}, ${y})`).attr("cursor", "pointer").on("click", (e) => { e.stopPropagation(); handleOpenEdit(task); }).on("mouseenter", () => setHoveredTaskId(task.id)).on("mouseleave", () => setHoveredTaskId(null)).on("contextmenu", (e) => handleTaskContextMenu(e, task));
          diamondGroup.append("path").attr("transform", isSelected ? "scale(1.4)" : "scale(1)").attr("d", d3.symbol().type(d3.symbolDiamond).size(100)()).attr("fill", isSelected ? styles.selectionColor : "#fff").attr("stroke", color).attr("stroke-width", isSelected ? 3 : 2).style("filter", isSelected ? "url(#selection-glow)" : "none");
          
          if (task.completion && task.completion > 0 && !isVirtual && showProgressRings) {
              drawProgressRing(diamondGroup, 0, 0, r + 4, task.completion, styles);
          }

          textGroup.append("text").attr("x", endX).attr("y", y - 28).attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", isSelected || isCompleted ? "600" : "400").attr("fill", color).text(task.name);
          const finishDateStr = formatYYMMDD(addDays(projectStartDate, (task.earlyFinish || 1) - 1));
          textGroup.append("text").attr("x", endX).attr("y", y + 22).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", isSelected ? color : styles.floatColor).text(finishDateStr);
          diamondGroup.datum({ task, isStart: false }).call(dragNode as any);
        } else {
          if (task.duration > 0 || !isVirtual) {
              let markerEnd;
              if (isSelected) markerEnd = "url(#arrow-selection)";
              else if (isCompleted) markerEnd = "url(#arrow-completed)";
              else if (task.isCritical) markerEnd = "url(#arrow-critical)";
              else if (isVirtual) markerEnd = "url(#arrow-virtual)";
              else if (task.color) markerEnd = `url(#arrow-${task.color.replace('#', '')})`;
              else markerEnd = "url(#arrow-normal)";

              linkGroup.append("line")
                .attr("x1", startX + r)
                .attr("y1", y)
                .attr("x2", endX - r)
                .attr("y2", y)
                .attr("stroke", color)
                .attr("stroke-width", isVirtual 
                  ? (isSelected || isHovered ? 1.8 : 0.9) 
                  : (isSelected || isHovered ? 2.2 : 1.2))
                .attr("stroke-dasharray", isVirtual ? "4,3" : "none")
                .attr("marker-end", markerEnd)
                .attr("cursor", "pointer")
                .style("filter", isSelected ? "url(#selection-glow)" : "none")
                .on("click", (e) => { e.stopPropagation(); handleOpenEdit(task); })
                .on("mouseenter", () => setHoveredTaskId(task.id))
                .on("mouseleave", () => setHoveredTaskId(null))
                .on("contextmenu", (e) => handleTaskContextMenu(e, task));
              
              if (task.completion && task.completion > 0 && task.completion < 100 && !isVirtual) {
                const totalLineLength = (endX - r) - (startX + r);
                const progressLength = totalLineLength * (task.completion / 100);
                if (progressLength > 0) {
                  linkGroup.append("line")
                    .attr("x1", startX + r)
                    .attr("y1", y)
                    .attr("x2", startX + r + progressLength)
                    .attr("y2", y)
                    .attr("stroke", styles.progressColor)
                    .attr("stroke-width", isSelected || isHovered ? 3.2 : 2.0) 
                    .attr("stroke-linecap", "butt")
                    .attr("pointer-events", "none");
                }
              }

              if (task.type === LinkType.Real && task.duration > 0) {
                 textGroup.append("text").attr("x", (startX + endX) / 2).attr("y", y + 10).attr("text-anchor", "middle").attr("font-size", "10px").attr("font-weight", "400").attr("fill", color).text(`${task.duration}d`);
              }
          }
          const startKey = `${Math.round(startX)},${Math.round(y)}`;
          const endKey = `${Math.round(endX)},${Math.round(y)}`;
          const hideStartNode = milestonePositions.has(startKey) || finishNodePositions.has(startKey) || isVirtual;
          
          const isShort = (endX - startX) < 45;
          const startDateStr = formatYYMMDD(addDays(projectStartDate, task.earlyStart || 0));
          const endDateStr = formatYYMMDD(addDays(projectStartDate, (task.earlyFinish || 1) - 1));

          if (!hideStartNode) {
             nodeGroup.append("circle").datum({ task, isStart: true }).attr("cx", startX).attr("cy", y).attr("r", isSelected ? r+2 : r).attr("fill", isSelected ? styles.selectionColor : (isDarkMode ? "#000" : "#fff")).attr("stroke", isSelected ? styles.selectionColor : (isDarkMode ? "#fff" : "#000")).attr("stroke-width", isSelected ? 2 : 1).attr("cursor", "ew-resize").call(dragNode as any);
             
             textGroup.append("text")
               .attr("x", isShort ? startX - 6 : startX)
               .attr("y", y + 22)
               .attr("text-anchor", isShort ? "end" : "middle")
               .attr("font-size", 9)
               .attr("fill", isSelected ? color : styles.textColorSecondary)
               .text(startDateStr);
          }
          const hideEndNode = milestonePositions.has(endKey) || isVirtual;
          if (!hideEndNode) {
             nodeGroup.append("circle").datum({ task, isStart: false }).attr("cx", endX).attr("cy", y).attr("r", isSelected ? r+2 : r).attr("fill", isSelected ? styles.selectionColor : (isDarkMode ? "#000" : "#fff")).attr("stroke", isSelected ? styles.selectionColor : (isDarkMode ? "#fff" : "#000")).attr("stroke-width", isSelected ? 2 : 1).attr("cursor", "ew-resize").call(dragNode as any);
             
             if (task.completion && task.completion > 0 && !isVirtual && showProgressRings) {
                drawProgressRing(progressGroup, endX, y, isSelected ? r+2 : r, task.completion, styles);
             }

             textGroup.append("text")
               .attr("x", isShort ? endX + 6 : endX)
               .attr("y", y + 22)
               .attr("text-anchor", isShort ? "start" : "middle")
               .attr("font-size", 9)
               .attr("fill", isSelected ? color : styles.textColorSecondary)
               .text(endDateStr);
          }
          const arrowLength = Math.abs(endX - startX);
          const textWidth = Math.max(arrowLength, 60); 
          const fo = textGroup.append("foreignObject").attr("x", (startX + endX) / 2 - textWidth / 2).attr("y", y - 52).attr("width", textWidth).attr("height", 45).style("overflow", "visible").attr("cursor", "pointer").on("click", (e) => { e.stopPropagation(); handleOpenEdit(task); }).on("mouseenter", () => setHoveredTaskId(task.id)).on("mouseleave", () => setHoveredTaskId(null)).on("contextmenu", (e) => handleTaskContextMenu(e, task));
          fo.append("xhtml:div").style("width", "100%").style("height", "100%").style("display", "flex").style("align-items", "flex-end").style("justify-content", "center").style("text-align", "center").style("font-size", isSelected || isCompleted ? "12px" : "11px").style("font-weight", isSelected || isCompleted ? "600" : "400").style("color", color).style("line-height", "1.1").style("word-break", "break-all").style("background", "transparent").style("padding", "0 1px").text(task.name);
        }
      });

      processedData.tasks.forEach(item => {
        const task = item.task;
        const currentStart = taskStartPos.get(task.id);
        if (!currentStart) return;
        task.predecessors.forEach(predId => {
          const predFinish = taskFinishPos.get(predId);
          if (!predFinish) return;
          const startX = currentStart.x; const endXPred = predFinish.x; const yPred = predFinish.y; const yCurrent = currentStart.y; const r = styles.nodeRadius;
          const isSelected = editingTask?.id === task.id || editingTask?.id === predId;
          const isHovered = hoveredTaskId === task.id || hoveredTaskId === predId;
          
          const isTaskCritical = task.isCritical;
          const isTaskCompleted = task.completion === 100;
          let linkColor = styles.floatColor;
          if (isTaskCompleted) linkColor = styles.progressColor;
          else if (isTaskCritical) linkColor = styles.criticalColor;
          
          if (isSelected) linkColor = styles.selectionColor;
          else if (isHovered) linkColor = styles.highlightColor;
          
          if (startX > endXPred + 2) {
             const wavyPath = getWavyPath(endXPred + r, startX, yPred);
             if (wavyPath) {
               linkGroup.append("path")
                 .attr("d", wavyPath)
                 .attr("fill", "none")
                 .attr("stroke", linkColor)
                 .attr("stroke-width", 1) 
                 .attr("stroke-opacity", isSelected || isHovered ? 1 : 0.8)
                 .attr("stroke-dasharray", "none");
             }
          }
          
          if (Math.abs(yPred - yCurrent) > 5) {
             const direction = (yCurrent > yPred ? 1 : -1);
             const vY1 = yPred; 
             const vY2 = yCurrent - (direction * r);
             linkGroup.append("line").attr("x1", startX).attr("y1", vY1).attr("x2", startX).attr("y2", vY2).attr("stroke", isSelected ? styles.selectionColor : styles.virtualColor).attr("stroke-width", isSelected ? 1.5 : 0.9).attr("stroke-dasharray", "4,3").attr("marker-end", isSelected ? "url(#arrow-selection)" : "url(#arrow-virtual)").attr("stroke-opacity", isSelected || isHovered ? 1 : 0.7);
          }
        });
      });
      return contentRoot;
  };

  const handleOpenEdit = (task: Task) => {
    const successors = tasks.filter(t => t.predecessors.includes(task.id)).map(t => t.id).join(',');
    setEditingTask({ ...task, successorsText: successors });
  };

  const handleSaveEdit = () => {
    if (!editingTask || !onUpdateTasks) return;
    const newSuccessors = (editingTask.successorsText || '').split(/[,，\s]+/).filter(x => x.trim() !== '');
    const updatedAllTasks = tasks.map(t => {
      if (t.id === editingTask.id) { const { successorsText, ...coreTask } = editingTask; return coreTask; }
      const currentPreds = new Set(t.predecessors);
      const isNowSuccessor = newSuccessors.includes(t.id);
      if (isNowSuccessor) currentPreds.add(editingTask.id); else currentPreds.delete(editingTask.id);
      return { ...t, predecessors: Array.from(currentPreds) };
    });
    onUpdateTasks(updatedAllTasks);
    setEditingTask(null);
  };

  const moveZone = (index: number, direction: 'up' | 'down') => {
      if (!onZoneOrderChange) return;
      const newOrder = [...processedData.sortedZones];
      const target = index + (direction === 'up' ? -1 : 1);
      if (target >= 0 && target < newOrder.length) { 
        [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]]; 
        onZoneOrderChange(newOrder); 
      }
  };

  const handleManualZoom = useCallback((direction: 'in' | 'out' | 'reset') => {
      if (!svgRef.current || !zoomRef.current) return;
      const svg = d3.select(svgRef.current);
      if (direction === 'reset') {
        svg.transition().duration(500).call(zoomRef.current.transform, d3.zoomIdentity);
      } else {
        const factor = direction === 'in' ? 1.5 : 0.6;
        svg.transition().duration(300).call(zoomRef.current.scaleBy, factor);
      }
  }, []);

  const generateDrawioXml = (xScale: d3.ScaleTime<number, number>, width: number, height: number): string => {
      let cellId = 2; const getNextId = () => (cellId++).toString();
      const styles = getStyles(false); // Drawio export always uses light styles for compatibility
      const rowHeight = styles.taskHeight;
      const totalContentHeight = processedData.totalRows * rowHeight + HEADER_HEIGHT + TITLE_HEIGHT;
      const contentHeight = Math.max(height, totalContentHeight + 100);
      
      let xml = `<?xml version="1.0" encoding="UTF-8"?><mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="IntelliPlan" version="21.0.0" type="device"><diagram id="diagram_1" name="工程网络计划"><mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${contentHeight}" math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" />`;
      
      // 1. Title
      xml += `<mxCell id="${getNextId()}" value="${projectName || "工程网络计划"}" style="text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=none;fillColor=none;fontSize=22;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="${width / 2 - 200}" y="20" width="400" height="40" as="geometry" /></mxCell>`;
      
      // 2. Zones (Background) - Rendered FIRST to be at the bottom layer
      processedData.zoneMeta.forEach((zone, i) => {
          const y = zone.startRow * rowHeight + HEADER_HEIGHT + TITLE_HEIGHT; 
          const h = zone.rowCount * rowHeight; 
          const bgColor = (i % 2 === 0) ? '#ffffff' : '#f8fafc';
          // Zone Background
          xml += `<mxCell id="${getNextId()}" value="" style="rounded=0;whiteSpace=wrap;html=1;fillColor=${bgColor};strokeColor=#cbd5e1;opacity=50;" vertex="1" parent="1"><mxGeometry x="0" y="${y}" width="${width}" height="${h}" as="geometry" /></mxCell>`;
          // Zone Label
          xml += `<mxCell id="${getNextId()}" value="${zone.name}" style="text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=#cbd5e1;fillColor=${bgColor};fontStyle=1;fontColor=${zone.color};" vertex="1" parent="1"><mxGeometry x="0" y="${y}" width="120" height="${h}" as="geometry" /></mxCell>`;
      });

      // 3. Time Axis (Ticks & Lines) - Rendered SECOND to be above zones
      let xAxisTicks: Date[]; let labelFormat: (d: Date) => string;
      switch(timeScaleMode) {
        case 'year': xAxisTicks = xScale.ticks(d3.timeYear); labelFormat = d3.timeFormat("%Y年"); break;
        case 'month': xAxisTicks = xScale.ticks(d3.timeMonth); labelFormat = d3.timeFormat("%y/%m"); break;
        default: xAxisTicks = xScale.ticks(width / 120); labelFormat = formatYYMMDD;
      }
      
      xAxisTicks.forEach((tick, i) => {
          const x = xScale(tick); if (x < 0 || x > width) return;
          const yOffset = 0; 

          // Time Label
          xml += `<mxCell id="${getNextId()}" value="${labelFormat(tick)}" style="text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=none;fillColor=none;fontSize=10;fontColor=#64748b;" vertex="1" parent="1"><mxGeometry x="${x - 40}" y="${TITLE_HEIGHT + 20 + yOffset}" width="80" height="20" as="geometry" /></mxCell>`;
          
          // Vertical Grid Line
          // Start: TITLE_HEIGHT + 40 (Below time label)
          // End: totalContentHeight (Bottom of last zone)
          const lineStartY = TITLE_HEIGHT + 40;
          const lineEndY = totalContentHeight;
          
          // Using edge for reliable rendering. strokeWidth=1 is standard "minimal" visible.
          // dashed=1, dashPattern=1 4 gives dotted appearance.
          xml += `<mxCell id="${getNextId()}" value="" style="endArrow=none;html=1;strokeColor=#94a3b8;strokeWidth=1;dashed=1;dashPattern=1 4;" edge="1" parent="1"><mxGeometry width="50" height="50" relative="1" as="geometry"><mxPoint x="${x}" y="${lineStartY}" as="sourcePoint" /><mxPoint x="${x}" y="${lineEndY}" as="targetPoint" /></mxGeometry></mxCell>`;
      });

      // 4. Tasks - Rendered LAST to be on top
      const nodeCoordSet = new Map<string, { x: number, y: number, isMilestone: boolean }>();
      const realTaskEndPoints = new Set<string>();

      processedData.tasks.forEach(item => {
          const task = item.task; 
          const startX = xScale(addDays(projectStartDate, task.earlyStart || 0)); 
          const endX = xScale(addDays(projectStartDate, task.earlyFinish || 0)); 
          const y = (item.globalRowIndex * rowHeight) + HEADER_HEIGHT + TITLE_HEIGHT + (rowHeight * 0.55);
          const startKey = `${Math.round(startX)},${Math.round(y)}`; 
          const endKey = `${Math.round(endX)},${Math.round(y)}`;
          const isVirtual = task.type === LinkType.Virtual;
          const isReal = task.type === LinkType.Real;
          
          if (isReal) {
              realTaskEndPoints.add(endKey);
          }

          if (!nodeCoordSet.has(startKey) && !isVirtual) nodeCoordSet.set(startKey, { x: startX, y, isMilestone: false });
          if (!nodeCoordSet.has(endKey) && !isVirtual) nodeCoordSet.set(endKey, { x: endX, y, isMilestone: task.type === LinkType.Wavy });
          else if (task.type === LinkType.Wavy) nodeCoordSet.get(endKey)!.isMilestone = true;
          
          const isCompleted = task.completion === 100 && !isVirtual;
          const color = isCompleted ? styles.progressColor : (task.isCritical || task.type === LinkType.Wavy ? styles.criticalColor : styles.normalColor);
          const nodeRad = styles.nodeRadius; 
          
          if (task.type !== LinkType.Wavy) {
              xml += `<mxCell id="${getNextId()}" value="" style="endArrow=block;endFill=1;html=1;strokeColor=${color};strokeWidth=1.1;verticalAlign=bottom;curved=0;endSize=3.0;dashed=${isVirtual ? 1 : 0};" edge="1" parent="1"><mxGeometry width="50" height="50" relative="1" as="geometry"><mxPoint x="${startX + nodeRad}" y="${y}" as="sourcePoint" /><mxPoint x="${endX - nodeRad}" y="${y}" as="targetPoint" /></mxGeometry></mxCell>`;
          }
          
          task.predecessors.forEach(predId => {
              const predT = processedData.rawTasks.get(predId); const predGlobal = processedData.tasks.find(t => t.task.id === predId);
              if (!predT || !predGlobal) return;
              const endXPred = xScale(addDays(projectStartDate, predT.earlyFinish || 0)); const yPred = (predGlobal.globalRowIndex * rowHeight) + HEADER_HEIGHT + TITLE_HEIGHT + (rowHeight * 0.55);
              if (startX > endXPred + 2) {
                  const x1 = endXPred + nodeRad;
                  const x2 = startX;
                  const amp = 3.2;  
                  const freqStep = 2.5; 
                  
                  xml += `<mxCell id="${getNextId()}" value="" style="endArrow=none;html=1;strokeColor=#000000;strokeWidth=1.1;curved=1;dashed=0;" edge="1" parent="1">`;
                  xml += `<mxGeometry width="50" height="50" relative="1" as="geometry"><mxPoint x="${x1}" y="${yPred}" as="sourcePoint" /><mxPoint x="${x2}" y="${yPred}" as="targetPoint" />`;
                  
                  let pointsXml = '<Array as="points">';
                  let curX = x1 + freqStep;
                  let phase = 1; 
                  while (curX < x2 - 1.5) {
                      let curY = yPred;
                      if (phase === 1) curY = yPred - amp;
                      else if (phase === 3) curY = yPred + amp;
                      
                      pointsXml += `<mxPoint x="${curX}" y="${curY}" />`;
                      curX += freqStep;
                      phase = (phase % 4) + 1;
                  }
                  pointsXml += '</Array>';
                  xml += `${pointsXml}</mxGeometry></mxCell>`;
              }
              if (Math.abs(yPred - y) > 5) {
                  const direction = (y > yPred) ? 1 : -1;
                  xml += `<mxCell id="${getNextId()}" value="" style="endArrow=block;html=1;strokeColor=#000000;strokeWidth=1.1;dashed=1;endSize=3.0;" edge="1" parent="1"><mxGeometry width="50" height="50" relative="1" as="geometry"><mxPoint x="${startX}" y="${yPred}" as="sourcePoint" /><mxPoint x="${startX}" y="${y - (direction * nodeRad)}" as="targetPoint" /></mxGeometry></mxCell>`;
              }
          });
      });
      nodeCoordSet.forEach((coord, key) => {
          const id = getNextId();
          const color = coord.isMilestone ? styles.criticalColor : "#000000";
          if (coord.isMilestone) { 
              xml += `<mxCell id="${id}" value="" style="rhombus;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${color};strokeWidth=1.5;" vertex="1" parent="1"><mxGeometry x="${coord.x - 6}" y="${coord.y - 6}" width="12" height="12" as="geometry" /></mxCell>`; 
          }
          else { 
              xml += `<mxCell id="${id}" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1;" vertex="1" parent="1"><mxGeometry x="${coord.x - 5}" y="${coord.y - 5}" width="10" height="10" as="geometry" /></mxCell>`; 
          }
      });
      processedData.tasks.forEach(item => {
          const task = item.task; 
          const startX = xScale(addDays(projectStartDate, task.earlyStart || 0)); 
          const endX = xScale(addDays(projectStartDate, task.earlyFinish || 0)); 
          const y = (item.globalRowIndex * rowHeight) + HEADER_HEIGHT + TITLE_HEIGHT + (rowHeight * 0.55);
          const startKey = `${Math.round(startX)},${Math.round(y)}`;
          const isVirtual = task.type === LinkType.Virtual;
          const isReal = task.type === LinkType.Real;
          const isCompleted = task.completion === 100 && !isVirtual;
          const color = isCompleted ? styles.progressColor : (task.isCritical || task.type === LinkType.Wavy ? styles.criticalColor : styles.normalColor);
          const startDateStr = formatYYMMDD(addDays(projectStartDate, task.earlyStart || 0)); 
          const endDateStr = formatYYMMDD(addDays(projectStartDate, (task.earlyFinish || 1) - 1));
          
          const isShort = (endX - startX) < 45;

          const hideStartDate = (isReal && realTaskEndPoints.has(startKey)) || isVirtual || task.type === LinkType.Wavy;

          if (!hideStartDate) { 
              xml += `<mxCell id="${getNextId()}" value="${startDateStr}" style="text;html=1;align=${isShort ? 'right' : 'center'};verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=none;fillColor=none;fontSize=9;fontColor=#64748b;" vertex="1" parent="1"><mxGeometry x="${isShort ? startX - 46 : startX - 40}" y="${y + 11}" width="80" height="20" as="geometry" /></mxCell>`; 
          }
          xml += `<mxCell id="${getNextId()}" value="${endDateStr}" style="text;html=1;align=${isShort ? 'left' : 'center'};verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=none;fillColor=none;fontSize=9;fontColor=#64748b;" vertex="1" parent="1"><mxGeometry x="${isShort ? endX + 6 : endX - 40}" y="${y + 11}" width="80" height="20" as="geometry" /></mxCell>`;
          
          const taskWidth = Math.max(Math.abs(endX - startX) - 10, 60);
          const taskX = (startX + endX) / 2 - taskWidth / 2;
          
          xml += `<mxCell id="${getNextId()}" value="${task.name}" style="text;html=1;align=center;verticalAlign=bottom;resizable=0;points=[];strokeColor=none;fillColor=none;fontSize=11;whiteSpace=wrap;overflow=hidden;fontColor=${color};fontStyle=0;" vertex="1" parent="1"><mxGeometry x="${taskX}" y="${y - 32}" width="${taskWidth}" height="30" as="geometry" /></mxCell>`;
          
          if (task.type === LinkType.Real && task.duration > 0) { 
              xml += `<mxCell id="${getNextId()}" value="${task.duration}d" style="text;html=1;align=center;verticalAlign=top;resizable=0;points=[];strokeColor=none;fillColor=none;fontSize=10;fontColor=${color};fontStyle=0;" vertex="1" parent="1"><mxGeometry x="${(startX + endX) / 2 - 20}" y="${y - 6}" width="40" height="14" as="geometry" /></mxCell>`; 
          }
      });
      xml += `\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>`; return xml;
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || dimensions.width === 0) return;
    const svg = d3.select(svgRef.current);
    const styles = getStyles(isDarkMode);
    
    let initialViewWidth = Math.max(dimensions.width - 50, 1000);
    if (timeScaleMode === 'month') initialViewWidth = initialViewWidth * 2;
    else if (timeScaleMode === 'year') initialViewWidth = initialViewWidth * 5;
    
    const initialXScale = d3.scaleTime().domain([projectStartDate, addDays(projectStartDate, processedData.projectDuration + 15)]).range([150, initialViewWidth]);
    
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        const transform = event.transform;
        setZoomTransform(transform);
        const newXScale = transform.rescaleX(initialXScale);
        drawIntoSelection(svg, newXScale, dimensions.width, dimensions.height, transform.y);
      });
    
    zoomRef.current = zoom;
    svg.call(zoom);
    
    const currentXScale = zoomTransform.rescaleX(initialXScale);
    drawIntoSelection(svg, currentXScale, dimensions.width, dimensions.height, zoomTransform.y);
    
  }, [processedData, projectStartDate, dimensions, projectName, timeScaleMode, editingTask, hoveredTaskId, isDarkMode, showProgressRings]);

  const uniqueZones = useMemo(() => Array.from(new Set(tasks.map(t => t.zone || '默认区域'))), [tasks]);
  const getDaysFromDateStr = (dateStr: string): number => {
    if (!dateStr) return 0; const parts = dateStr.split('-'); if (parts.length !== 3) return 0;
    const [y, m, d] = parts.map(Number); const target = new Date(y, m - 1, d); target.setHours(0, 0, 0, 0);
    const start = new Date(projectStartDate); start.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - start.getTime()) / (1000 * 3600 * 24));
  };

  const handleExport = async (type: 'png' | 'pdf' | 'svg' | 'drawio' | 'json' | 'print') => {
    setShowExportMenu(false);

    if (type === 'json') {
      if (onExportJson) onExportJson();
      return;
    }
    
    const fileName = `${projectName || 'network_diagram'}_${new Date().toISOString().split('T')[0]}`;

    if (type === 'print') {
        window.print();
        return;
    }

    if (type === 'drawio') {
        const exportWidth = Math.max(dimensions.width, 1500); 
        const exportXScale = d3.scaleTime()
          .domain([projectStartDate, addDays(projectStartDate, processedData.projectDuration + 15)])
          .range([150, exportWidth]);
        
        const xml = generateDrawioXml(exportXScale, exportWidth, dimensions.height);
        const blob = new Blob([xml], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.drawio`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
    }

    if (type === 'svg') {
        if (!svgRef.current) return;
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgRef.current);
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
    }

    // PDF & PNG
    if (!containerRef.current) return;
    
    try {
        const canvas = await html2canvas(containerRef.current, {
            scale: 2,
            useCORS: true,
            backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc',
            logging: false
        });

        if (type === 'png') {
            const url = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else if (type === 'pdf') {
            const imgData = canvas.toDataURL('image/png');
            // Calculate PDF size based on canvas size to fit
            const pdf = new jsPDF({
                orientation: canvas.width > canvas.height ? 'l' : 'p',
                unit: 'px',
                format: [canvas.width, canvas.height] 
            });
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save(`${fileName}.pdf`);
        }
    } catch (err) {
        console.error("Export failed:", err);
        alert("导出失败，请重试");
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 relative border-l border-slate-200 dark:border-slate-800 transition-colors duration-300">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-[#fbfbfd] dark:bg-slate-900 flex items-center justify-between z-[20]">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <Layers size={18} className="text-slate-800 dark:text-slate-100" strokeWidth={2} />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white tracking-tight">网络计划</h3>
            </div>
            
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700"></div>
            
            <div className="flex items-center gap-1">
                 {/* Time Scale */}
                 <div className="flex bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 mr-1">
                    {(['day', 'month', 'year'] as TimeScaleMode[]).map(mode => (
                        <button key={mode} onClick={() => setTimeScaleMode(mode)} className={`px-2.5 py-1 text-[10px] font-bold uppercase transition-all rounded-md ${timeScaleMode === mode ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>{mode === 'day' ? '日' : mode === 'month' ? '月' : '年'}</button>
                    ))}
                 </div>
                 
                 {/* Zoom Controls */}
                 <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 mr-1">
                   <button onClick={() => handleManualZoom('in')} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded transition-all text-slate-600 dark:text-slate-400" title="放大"><ZoomIn size={14}/></button>
                   <button onClick={() => handleManualZoom('out')} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded transition-all text-slate-600 dark:text-slate-400" title="缩小"><ZoomOut size={14}/></button>
                   <button onClick={() => handleManualZoom('reset')} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded transition-all text-slate-600 dark:text-slate-400" title="重置视图"><Search size={14}/></button>
                </div>

                {/* Zone Manager */}
                <button onClick={() => setShowZoneModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all text-[12px] font-medium" title="调整区域显示顺序">
                    <ArrowDownUp size={14} /> <span className="hidden sm:inline">区域</span>
                </button>
                
                {/* Progress Rings */}
                <button 
                    onClick={() => setShowProgressRings(!showProgressRings)} 
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-[12px] font-medium ${showProgressRings ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
                    title={showProgressRings ? "点击隐藏进度环" : "点击显示进度环"}
                >
                    <Disc size={14} /> <span className="hidden sm:inline">进度</span>
                </button>
            </div>
        </div>
        
        <div className="flex items-center gap-2">
            <button onClick={onToggleFocusMode} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-[12px] font-medium border ${isFocusMode ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400' : 'bg-transparent border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`} title={isFocusMode ? "还原面板布局" : "全屏专注模式"}>
                {isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                <span className="hidden sm:inline">{isFocusMode ? "还原" : "专注"}</span>
            </button>
            
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700"></div>

            <div className="relative">
                <button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm transition-all text-[12px] font-medium">
                    <Share2 size={14} /> 
                    <span>导出</span>
                </button>
                {showExportMenu && (
                    <div className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-lg overflow-hidden z-[50] w-52 flex flex-col">
                        <button onClick={() => handleExport('png')} className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors text-left w-full"><ImageIcon size={14} /> 图片 (PNG) - 高清</button>
                        <button onClick={() => handleExport('pdf')} className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors text-left w-full"><FileText size={14} /> 文档 (PDF) - 高清</button>
                        <button onClick={() => handleExport('svg')} className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors text-left w-full"><Globe size={14} /> 矢量图 (SVG)</button>
                        <button onClick={() => handleExport('drawio')} className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors text-left w-full"><FileJson size={14} /> draw.io (XML)</button>
                        <button onClick={() => handleExport('json')} className="px-4 py-3 text-xs text-blue-700 dark:text-blue-400 font-bold hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-3 transition-colors border-t border-slate-100 dark:border-slate-700 text-left w-full"><FileCode size={14} /> 项目数据 (JSON)</button>
                        <button onClick={() => handleExport('print')} className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors border-t border-slate-100 dark:border-slate-700 text-left w-full"><Printer size={14} /> 打印图纸 (Print)</button>
                    </div>
                )}
            </div>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden relative bg-slate-50 dark:bg-slate-900 cursor-grab architecture:cursor-grabbing transition-colors duration-300" onClick={() => { setEditingTask(null); setContextMenu(null); }}>
        <svg ref={svgRef} className="w-full h-full block" onClick={(e) => e.stopPropagation()}></svg>
        
        {draggingInfo && (
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[150%] bg-blue-600 text-white px-4 py-2 rounded-xl shadow-2xl font-black text-xs animate-in fade-in zoom-in pointer-events-none flex items-center gap-2 border border-blue-400">
              <Calendar size={14} />
              <span>{draggingInfo.isStart ? '开始' : '结束'}: {draggingInfo.date}</span>
           </div>
        )}

        <div className="absolute bottom-4 left-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] text-slate-400 dark:text-slate-500 pointer-events-none flex items-center gap-2"><Info size={12} /><span>滚轮缩放 | 拖拽节点改日期 | 右键快速操作 | 100%完成显示绿色</span></div>
        {contextMenu && (
            <div className="fixed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg py-1 z-[100] min-w-[140px] animate-in fade-in zoom-in duration-100 origin-top-left" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { const t = tasks.find(t => t.id === contextMenu.taskId); if (t) handleOpenEdit(t); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2.5 transition-colors"><Edit3 size={14} className="text-blue-500" /> 编辑属性</button>
                <button onClick={() => handleCopyTask(contextMenu.taskId)} className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2.5 transition-colors"><Copy size={14} className="text-emerald-500" /> 复制任务</button>
                <div className="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2"></div>
                <button onClick={() => handleDeleteTask(contextMenu.taskId)} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2.5 transition-colors"><Trash2 size={16} /> 删除任务</button>
            </div>
        )}
      </div>
      {showZoneModal && (
          <div className="absolute inset-0 z-[60] bg-slate-900/20 backdrop-blur-[1px] flex items-center justify-center p-4" onClick={() => setShowZoneModal(false)}>
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-sm flex flex-col animate-in fade-in zoom-in duration-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/80 dark:bg-slate-900/80"><div className="flex items-center gap-2"><ArrowDownUp size={18} className="text-blue-600 dark:text-blue-400" /><h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">区域显示顺序调整</h4></div><button onClick={() => setShowZoneModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={20}/></button></div>
                  <div className="p-4 flex-1 overflow-y-auto max-h-[60vh] space-y-2">
                      {processedData.sortedZones.map((z, idx) => (
                          <div key={z} className="flex items-center justify-between p-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg group hover:border-blue-300 dark:hover:border-blue-500 shadow-sm transition-all"><div className="flex items-center gap-3"><div className="p-1.5 bg-slate-100 dark:bg-slate-600 rounded text-slate-400 dark:text-slate-300 group-hover:text-blue-400"><Move size={14}/></div><span className="text-sm font-bold text-slate-700 dark:text-slate-200">{z}</span></div><div className="flex gap-1"><button onClick={() => moveZone(idx, 'up')} disabled={idx === 0} className="p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/50 dark:hover:text-blue-400 rounded disabled:opacity-20 transition-colors"><ChevronUp size={16}/></button><button onClick={() => moveZone(idx, 'down')} disabled={idx === processedData.sortedZones.length - 1} className="p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/50 dark:hover:text-blue-400 rounded disabled:opacity-20 transition-colors"><ChevronDown size={16}/></button></div></div>
                      ))}
                  </div>
                  <div className="p-4 border-t bg-slate-50 dark:bg-slate-900 flex justify-end"><button onClick={() => setShowZoneModal(false)} className="bg-blue-600 text-white px-8 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md transition-all active:scale-95">确定并应用</button></div>
              </div>
          </div>
      )}
      {editingTask && (
        <div className="absolute inset-0 z-[120] flex justify-end pointer-events-none" onClick={() => setEditingTask(null)}>
          <div className="bg-white dark:bg-slate-800 shadow-2xl border-l border-slate-200 dark:border-slate-700 w-full max-w-lg h-full flex flex-col relative animate-in slide-in-from-right duration-300 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
             <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50"><div className="flex items-center gap-3"><div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg text-blue-600 dark:text-blue-400"><Edit3 size={20}/></div><div><h4 className="font-bold text-slate-800 dark:text-white text-lg leading-tight">工作属性</h4><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-semibold">Engineering Property Editor</p></div></div><button onClick={() => setEditingTask(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all"><X size={20}/></button></div>
             <div className="p-6 flex-1 overflow-y-auto space-y-6 custom-scrollbar pb-24">
                <div className="grid grid-cols-4 gap-4"><div className="col-span-1"><label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5"><Hash size={12}/> 工作代号</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 font-mono" value={editingTask.id} disabled /></div><div className="col-span-3"><label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5"><Flag size={12}/> 工作名称</label><input className="w-full border-2 border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm font-semibold focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all dark:bg-slate-700 dark:text-white" value={editingTask.name} onChange={e => setEditingTask({...editingTask, name: e.target.value})} placeholder="输入任务名称..." /></div></div>
                <div className="bg-emerald-50/50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800 space-y-3">
                   <style>{`
                     /* Webkit (Chrome, Safari, Edge) */
                     .slider-thumb-custom::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        appearance: none;
                        width: 18px; /* Slightly larger for better touch target */
                        height: 18px;
                        background: #10b981; 
                        cursor: pointer;
                        border-radius: 50%;
                        border: 3px solid white; /* Thicker border for pro look */
                        box-shadow: 0 2px 5px rgba(0,0,0,0.15);
                        transition: all 0.15s ease;
                     }
                     .slider-thumb-custom::-webkit-slider-thumb:hover {
                        transform: scale(1.15);
                        box-shadow: 0 3px 8px rgba(16, 185, 129, 0.3); /* Green glow */
                     }
                     
                     /* Firefox */
                     .slider-thumb-custom::-moz-range-thumb {
                        width: 18px;
                        height: 18px;
                        background: #10b981;
                        cursor: pointer;
                        border-radius: 50%;
                        border: 3px solid white;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.15);
                        transition: all 0.15s ease;
                     }
                     .slider-thumb-custom::-moz-range-thumb:hover {
                        transform: scale(1.15);
                        box-shadow: 0 3px 8px rgba(16, 185, 129, 0.3);
                     }
                   `}</style>
                   <div className="flex justify-between items-center">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400"><Percent size={14}/> 当前完成情况 (进度)</label>
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded shadow-sm">{editingTask.completion || 0}%</span>
                   </div>
                   <div className="relative w-full h-4 flex items-center">
                       <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          step="5"
                          value={editingTask.completion || 0} 
                          onChange={e => setEditingTask({...editingTask, completion: parseInt(e.target.value)})}
                          style={{
                            background: `linear-gradient(to right, #10b981 0%, #10b981 ${editingTask.completion || 0}%, ${isDarkMode ? '#334155' : '#e2e8f0'} ${editingTask.completion || 0}%, ${isDarkMode ? '#334155' : '#e2e8f0'} 100%)`
                          }}
                          className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-thumb-custom focus:outline-none"
                       />
                   </div>
                </div>
                <div className="grid grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                   <div><label className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 mb-1.5"><Calendar size={12}/> 开始日期</label><input type="date" className="w-full border-2 border-blue-200 dark:border-blue-800 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-all cursor-pointer dark:bg-slate-700 dark:text-white" value={toLocalYYYYMMDD(addDays(projectStartDate, editingTask.earlyStart || 0))} onChange={e => { if (!e.target.value) return; const days = getDaysFromDateStr(e.target.value); const finishOffset = (editingTask.earlyFinish || 1) - 1; setEditingTask({ ...editingTask, constraintDate: days, duration: Math.max(0, finishOffset - days + 1), earlyStart: days, earlyFinish: finishOffset + 1 }); }} /></div>
                   <div><label className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1.5"><Calendar size={12}/> 完成日期</label><input type="date" className="w-full border-2 border-emerald-200 dark:border-emerald-800 rounded-lg p-2.5 text-sm focus:border-emerald-500 outline-none transition-all cursor-pointer dark:bg-slate-700 dark:text-white" value={toLocalYYYYMMDD(addDays(projectStartDate, (editingTask.earlyFinish || 1) - 1))} onChange={e => { if (!e.target.value) return; const finishOffset = getDaysFromDateStr(e.target.value); setEditingTask({ ...editingTask, duration: Math.max(0, finishOffset - (editingTask.earlyStart || 0) + 1), earlyFinish: finishOffset + 1 }); }} /></div>
                   <div><label className="flex items-center gap-1.5 text-xs font-bold text-slate-400 mb-1.5"><Hash size={12}/> 工期 (天)</label><input type="number" min="0" className="w-full border-2 border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-all font-bold dark:bg-slate-700 dark:text-white" value={editingTask.duration} onChange={e => { const d = parseInt(e.target.value) || 0; setEditingTask({...editingTask, duration: d, earlyFinish: (editingTask.earlyStart || 0) + d}); }} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div><label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5"><Layers size={12}/> 分配区域</label><input className="w-full border-2 border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-all dark:bg-slate-700 dark:text-white" value={editingTask.zone || ''} onChange={e => setEditingTask({...editingTask, zone: e.target.value})} list="zone-list" placeholder="选择或输入区域..." /><datalist id="zone-list">{uniqueZones.map(z => <option key={z} value={z} />)}</datalist></div>
                   
                   {/* Color Picker Implementation */}
                   <div>
                       <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5"><Palette size={12}/> 颜色标记 (对攻组)</label>
                       <div className="flex gap-2 items-center w-full overflow-x-auto pb-1 custom-scrollbar">
                           <button 
                             onClick={() => setEditingTask({...editingTask, color: undefined})} 
                             className={`w-6 h-6 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center transition-all ${!editingTask.color ? 'ring-2 ring-blue-500 scale-110' : 'hover:scale-105'}`}
                             title="默认"
                           >
                              <X size={10} className="text-slate-400" />
                           </button>
                           {CUSTOM_COLORS.map(c => (
                               <button 
                                 key={c}
                                 onClick={() => setEditingTask({...editingTask, color: c})}
                                 style={{ backgroundColor: c }}
                                 className={`shrink-0 w-6 h-6 rounded-full border border-black/5 dark:border-white/10 transition-all ${editingTask.color === c ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 ring-blue-500 scale-110' : 'hover:scale-105'}`}
                               />
                           ))}
                       </div>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div><label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5"><BoxSelect size={12}/> 工作性质</label><select className="w-full border-2 border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-all appearance-none bg-no-repeat bg-[right_0.5rem_center] dark:bg-slate-700 dark:text-white" value={editingTask.type} onChange={e => setEditingTask({...editingTask, type: e.target.value as LinkType})}><option value={LinkType.Real}>实工作 (Normal Task)</option><option value={LinkType.Virtual}>虚工作 (Dummy Task)</option><option value={LinkType.Wavy}>里程碑 (Milestone)</option></select></div>
                   <div><label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5"><ListTree size={12}/> 所属父节点ID</label><input className="w-full border-2 border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-all dark:bg-slate-700 dark:text-white" value={editingTask.parentId || ''} onChange={e => setEditingTask({...editingTask, parentId: e.target.value || undefined})} placeholder="层级汇总关联ID" /></div>
                </div>
                <div className="space-y-4">
                   <div className="bg-blue-50/30 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800"><label className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-400 mb-2"><LinkIcon size={12}/> 紧前工作 (Predecessors)</label><input className="w-full border-2 border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-700 dark:text-white" value={editingTask.predecessors.join(',')} onChange={e => setEditingTask({...editingTask, predecessors: e.target.value.split(/[,，\s]+/).filter(x => x.trim() !== '')})} placeholder="输入ID, 以逗号分隔" /></div>
                   <div className="bg-purple-50/30 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-100 dark:border-purple-800"><label className="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-400 mb-2"><LinkIcon size={12}/> 紧后工作 (Successors)</label><input className="w-full border-2 border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-700 dark:text-white" value={editingTask.successorsText || ''} onChange={e => setEditingTask({...editingTask, successorsText: e.target.value})} placeholder="输入ID, 以逗号分隔" /></div>
                </div>
                <div><label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5"><FileText size={12}/> 备注与详细说明</label><textarea className="w-full border-2 border-slate-200 dark:border-slate-600 rounded-lg p-3 text-sm h-32 resize-none outline-none focus:border-blue-500 transition-all dark:bg-slate-700 dark:text-white" value={editingTask.description || ''} onChange={e => setEditingTask({...editingTask, description: e.target.value})} placeholder="关于本工作的说明..." /></div>
             </div>
             <div className="p-4 border-t bg-slate-50 dark:bg-slate-900 flex justify-start pr-24 gap-3">
                <button onClick={() => setEditingTask(null)} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg transition-all">取消</button>
                <button onClick={handleSaveEdit} className="bg-blue-600 text-white px-10 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-none transition-all flex items-center gap-2 active:scale-95">
                   <Save size={18} /> 应用更新
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
