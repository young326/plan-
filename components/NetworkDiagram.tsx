import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { Task, LinkType, Annotation } from '../types';
import { ZoomIn, ZoomOut, Download, Type, BoxSelect, Settings, Calendar, MousePointer2, Layers, Flag, AlertTriangle, Star, CheckCircle, Edit3, X, Undo, Redo, Save, Image as ImageIcon, FileText, Code, FileCode, Globe, MoveVertical, ArrowDownUp, Share2, ChevronUp, ChevronDown, ListTree, Link as LinkIcon, Hash, FileJson, Clock, Move, Maximize2, Minimize2 } from 'lucide-react';
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
  zoneOrder?: string[];
  onZoneOrderChange?: (newOrder: string[]) => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
}

const STYLES = {
  gridColor: '#94a3b8', 
  gridOpacity: 0.2,
  zoneBg: '#f8fafc',
  zoneBorder: '#cbd5e1',
  taskHeight: 110, 
  nodeRadius: 6,
  criticalColor: '#ef4444',
  normalColor: '#1e293b',
  virtualColor: '#64748b',
  floatColor: '#94a3b8',
  summaryColor: '#0f172a',
  fontFamily: '"Microsoft YaHei", sans-serif',
};

const TITLE_HEIGHT = 80;
const HEADER_HEIGHT = 60;

const ZONE_COLORS = [
  '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#4f46e5', '#ea580c', '#65a30d', '#be185d'
];

type TimeScaleMode = 'day' | 'month' | 'year';

const NetworkDiagram: React.FC<NetworkDiagramProps> = ({ 
  tasks, 
  onUpdateTasks,
  onUpdateAnalysis,
  projectStartDate,
  projectName,
  zoneOrder,
  onZoneOrderChange,
  isFocusMode,
  onToggleFocusMode
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [editingTask, setEditingTask] = useState<(Task & { successorsText?: string }) | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [timeScaleMode, setTimeScaleMode] = useState<TimeScaleMode>('day');
  const [zoomTransform, setZoomTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);

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
    } else {
        sortedZones.sort();
    }
    
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
  }, [tasks, zoneOrder]);

  const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const formatYYMMDD = d3.timeFormat("%y/%m/%d");

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

  const drawIntoSelection = (
    svg: d3.Selection<any, any, any, any>, 
    xScale: d3.ScaleTime<number, number>, 
    width: number, 
    height: number, 
    yOffset: number = 0,
    overrideMode?: TimeScaleMode
  ) => {
      svg.selectAll("*").remove();
      const currentMode = overrideMode || timeScaleMode;
      const contentHeight = Math.max(height, processedData.totalRows * STYLES.taskHeight + TITLE_HEIGHT + HEADER_HEIGHT + 100);
      
      const defs = svg.append("defs");
      const addMarker = (id: string, color: string, w=6, h=3) => {
         defs.append("marker").attr("id", id).attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", w).attr("markerHeight", h).attr("orient", "auto")
          .append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", color);
      };
      addMarker("arrow-critical", STYLES.criticalColor);
      addMarker("arrow-normal", "#000000");
      addMarker("arrow-virtual", STYLES.virtualColor, 12, 6);
      addMarker("arrow-summary", STYLES.summaryColor);
      processedData.zoneMeta.forEach((zone, i) => addMarker(`arrow-zone-${i}`, zone.color, 8, 4));

      const staticLayer = svg.append("g").attr("class", "static-layer");
      staticLayer.append("rect").attr("width", width).attr("height", TITLE_HEIGHT).attr("fill", "#ffffff");
      staticLayer.append("text").attr("x", width / 2).attr("y", 40).attr("text-anchor", "middle").attr("font-size", "22px").attr("font-weight", "bold").attr("fill", "#1e293b").text(projectName || "工程网络计划");
      staticLayer.append("rect").attr("x", 0).attr("y", TITLE_HEIGHT).attr("width", width).attr("height", HEADER_HEIGHT).attr("fill", "#f1f5f9").attr("stroke", "#cbd5e1").attr("stroke-width", 0.5);

      let xAxisTicks: Date[];
      let labelFormat: (d: Date) => string;
      switch(currentMode) {
        case 'year': xAxisTicks = xScale.ticks(d3.timeYear); labelFormat = d3.timeFormat("%Y年"); break;
        case 'month': xAxisTicks = xScale.ticks(d3.timeMonth); labelFormat = d3.timeFormat("%Y-%m"); break;
        default: xAxisTicks = xScale.ticks(width / 120); labelFormat = formatYYMMDD;
      }

      const ticksGroup = staticLayer.append("g").attr("transform", `translate(0, ${TITLE_HEIGHT})`);
      xAxisTicks.forEach(tick => {
          const xPos = xScale(tick);
          if (xPos < 0 || xPos > width) return;
          ticksGroup.append("line").attr("x1", xPos).attr("x2", xPos).attr("y1", 0).attr("y2", HEADER_HEIGHT).attr("stroke", "#94a3b8").attr("stroke-width", 0.5);
          ticksGroup.append("text").attr("x", xPos + 5).attr("y", HEADER_HEIGHT / 2).attr("dominant-baseline", "middle").attr("font-size", "10px").attr("fill", "#475569").text(labelFormat(tick));
      });

      const contentRoot = svg.append("g").attr("transform", `translate(0, ${TITLE_HEIGHT + HEADER_HEIGHT + yOffset})`);
      const bgGroup = contentRoot.append("g");
      const gridGroup = contentRoot.append("g");
      const zoneGroup = contentRoot.append("g");
      const linkGroup = contentRoot.append("g");
      const textGroup = contentRoot.append("g");
      const nodeGroup = contentRoot.append("g"); 
      const milestoneNodeGroup = contentRoot.append("g");

      xAxisTicks.forEach(tick => {
        const xPos = xScale(tick);
        gridGroup.append("line").attr("x1", xPos).attr("x2", xPos).attr("y1", -HEADER_HEIGHT).attr("y2", contentHeight).attr("stroke", STYLES.gridColor).attr("stroke-width", 1).attr("stroke-opacity", STYLES.gridOpacity).attr("stroke-dasharray", "4,4");
      });

      const rowHeight = STYLES.taskHeight;
      processedData.zoneMeta.forEach((zone, i) => {
        const yPos = zone.startRow * rowHeight; const h = zone.rowCount * rowHeight;
        bgGroup.append("rect").attr("x", 0).attr("y", yPos).attr("width", width).attr("height", h).attr("fill", (i % 2 === 0) ? '#ffffff' : '#f8fafc');
        const zoneLabel = zoneGroup.append("g").attr("transform", `translate(0, ${yPos})`);
        zoneLabel.append("rect").attr("width", 120).attr("height", h).attr("fill", (i % 2 === 0) ? '#ffffff' : '#f8fafc').attr("stroke", STYLES.zoneBorder);
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
        
        if (task.type === LinkType.Wavy) {
            milestonePositions.add(`${Math.round(endX)},${Math.round(y)}`);
            milestonePositions.add(`${Math.round(startX)},${Math.round(y)}`);
        } else {
            finishNodePositions.add(`${Math.round(endX)},${Math.round(y)}`);
        }
      });

      processedData.tasks.forEach(item => {
        const task = item.task;
        const startX = xScale(addDays(projectStartDate, task.earlyStart || 0));
        const endX = xScale(addDays(projectStartDate, task.earlyFinish || 0));
        const y = (item.globalRowIndex * rowHeight) + (rowHeight * 0.55);
        const r = STYLES.nodeRadius;

        taskStartPos.set(task.id, { x: startX, y });
        taskFinishPos.set(task.id, { x: endX, y });

        const isMilestone = task.type === LinkType.Wavy;
        const zoneIndex = processedData.zoneMeta.findIndex(z => z.name === task.zone);
        const color = task.isCritical ? STYLES.criticalColor : (task.type === LinkType.Virtual ? STYLES.virtualColor : (zoneIndex >= 0 ? processedData.zoneMeta[zoneIndex].color : STYLES.normalColor));

        if (isMilestone) {
          const diamondGroup = milestoneNodeGroup.append("g").attr("transform", `translate(${endX}, ${y})`).attr("cursor", "pointer").on("click", () => handleOpenEdit(task));
          diamondGroup.append("path").attr("d", d3.symbol().type(d3.symbolDiamond).size(120)()).attr("fill", "#fff").attr("stroke", STYLES.criticalColor).attr("stroke-width", 2);
          textGroup.append("text").attr("x", endX).attr("y", y - 22).attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold").attr("fill", STYLES.criticalColor).text(task.name);
          const finishDateStr = formatYYMMDD(addDays(projectStartDate, (task.earlyFinish || 1) - 1));
          textGroup.append("text").attr("x", endX).attr("y", y + 15).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", STYLES.floatColor).text(finishDateStr);
        } else {
          if (task.duration > 0 || task.type !== LinkType.Virtual) {
              linkGroup.append("line").attr("x1", startX + r).attr("y1", y).attr("x2", endX - r).attr("y2", y).attr("stroke", color).attr("stroke-width", 1.8).attr("marker-end", task.isCritical ? "url(#arrow-critical)" : `url(#arrow-zone-${zoneIndex})`).attr("cursor", "pointer").on("click", () => handleOpenEdit(task));
              
              if (task.type === LinkType.Real && task.duration > 0) {
                 textGroup.append("text")
                  .attr("x", (startX + endX) / 2)
                  .attr("y", y + 12) 
                  .attr("text-anchor", "middle")
                  .attr("font-size", "10px")
                  .attr("font-weight", "600")
                  .attr("fill", color)
                  .text(`${task.duration}d`);
              }
          }
          
          const startKey = `${Math.round(startX)},${Math.round(y)}`;
          const endKey = `${Math.round(endX)},${Math.round(y)}`;
          const hideStartNode = milestonePositions.has(startKey) || finishNodePositions.has(startKey);

          if (!hideStartNode) {
             nodeGroup.append("circle").attr("cx", startX).attr("cy", y).attr("r", r).attr("fill", "#fff").attr("stroke", "#000").attr("stroke-width", 1);
             const startDateStr = formatYYMMDD(addDays(projectStartDate, task.earlyStart || 0));
             textGroup.append("text").attr("x", startX).attr("y", y + 15).attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "#64748b").text(startDateStr);
          }
          
          if (!milestonePositions.has(endKey)) {
             nodeGroup.append("circle").attr("cx", endX).attr("cy", y).attr("r", r).attr("fill", "#fff").attr("stroke", "#000").attr("stroke-width", 1);
             const endDateStr = formatYYMMDD(addDays(projectStartDate, (task.earlyFinish || 1) - 1));
             textGroup.append("text").attr("x", endX).attr("y", y + 15).attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "#64748b").text(endDateStr);
          }
          
          const arrowLength = Math.abs(endX - startX);
          const textWidth = Math.max(arrowLength, 60); 
          const fo = textGroup.append("foreignObject")
            .attr("x", (startX + endX) / 2 - textWidth / 2)
            .attr("y", y - 48) 
            .attr("width", textWidth)
            .attr("height", 45)
            .style("overflow", "visible")
            .attr("cursor", "pointer")
            .on("click", () => handleOpenEdit(task));
            
          fo.append("xhtml:div")
            .style("width", "100%")
            .style("height", "100%")
            .style("display", "flex")
            .style("align-items", "flex-end")
            .style("justify-content", "center")
            .style("text-align", "center")
            .style("font-size", "11px")
            .style("font-weight", "500")
            .style("color", color)
            .style("line-height", "1.1")
            .style("word-break", "break-all")
            .style("background", "transparent")
            .style("padding", "0 1px") 
            .text(task.name);
        }
      });

      processedData.tasks.forEach(item => {
        const task = item.task;
        const currentStart = taskStartPos.get(task.id);
        if (!currentStart) return;
        task.predecessors.forEach(predId => {
          const predFinish = taskFinishPos.get(predId);
          if (!predFinish) return;
          const startX = currentStart.x; const endXPred = predFinish.x; const yPred = predFinish.y; const yCurrent = currentStart.y; const r = STYLES.nodeRadius;
          
          if (startX > endXPred + 2) {
             const wavyPath = getWavyPath(endXPred + r, startX - r, yPred);
             if (wavyPath) linkGroup.append("path").attr("d", wavyPath).attr("fill", "none").attr("stroke", STYLES.floatColor).attr("stroke-width", 1.5).attr("stroke-opacity", 0.6);
          }
          
          if (Math.abs(yPred - yCurrent) > 5) {
             const posKey = `${Math.round(startX)},${Math.round(yPred)}`;
             if (!milestonePositions.has(posKey) && !finishNodePositions.has(posKey)) {
                nodeGroup.append("circle").attr("cx", startX).attr("cy", yPred).attr("r", r).attr("fill", "#fff").attr("stroke", "#000").attr("stroke-width", 0.8).attr("stroke-opacity", 0.5);
             }
             const vY1 = yPred + (yCurrent > yPred ? r : -r); const vY2 = yCurrent + (yCurrent > yPred ? -r : r);
             linkGroup.append("line").attr("x1", startX).attr("y1", vY1).attr("x2", startX).attr("y2", vY2).attr("stroke", STYLES.virtualColor).attr("stroke-width", 1).attr("stroke-dasharray", "4,3").attr("marker-end", "url(#arrow-virtual)").attr("stroke-opacity", 0.7);
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
      if (t.id === editingTask.id) {
        const { successorsText, ...coreTask } = editingTask;
        return coreTask;
      }
      const currentPreds = new Set(t.predecessors);
      const isNowSuccessor = newSuccessors.includes(t.id);
      if (isNowSuccessor) currentPreds.add(editingTask.id);
      else currentPreds.delete(editingTask.id);
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

  const generateDrawioXml = (xScale: d3.ScaleTime<number, number>, width: number, height: number): string => {
      let cellId = 2;
      const getNextId = () => (cellId++).toString();
      const contentHeight = Math.max(height, processedData.totalRows * STYLES.taskHeight + TITLE_HEIGHT + HEADER_HEIGHT + 100);

      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="IntelliPlan" version="21.0.0" type="device">
  <diagram id="diagram_1" name="工程网络计划">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${contentHeight}" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />`;

      xml += `<mxCell id="${getNextId()}" value="${projectName || "工程网络计划"}" style="text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=none;fillColor=none;fontSize=22;fontStyle=1;" vertex="1" parent="1">
        <mxGeometry x="${width / 2 - 200}" y="20" width="400" height="40" as="geometry" />
      </mxCell>`;

      let xAxisTicks: Date[];
      let labelFormat: (d: Date) => string;
      switch(timeScaleMode) {
        case 'year': xAxisTicks = xScale.ticks(d3.timeYear); labelFormat = d3.timeFormat("%Y年"); break;
        case 'month': xAxisTicks = xScale.ticks(d3.timeMonth); labelFormat = d3.timeFormat("%Y-%m"); break;
        default: xAxisTicks = xScale.ticks(width / 120); labelFormat = formatYYMMDD;
      }

      xAxisTicks.forEach(tick => {
          const x = xScale(tick);
          if (x < 0 || x > width) return;
          xml += `<mxCell id="${getNextId()}" value="${labelFormat(tick)}" style="text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=none;fillColor=none;fontSize=10;fontColor=#94a3b8;" vertex="1" parent="1">
            <mxGeometry x="${x - 40}" y="${TITLE_HEIGHT + 20}" width="80" height="20" as="geometry" />
          </mxCell>`;
          xml += `<mxCell id="${getNextId()}" value="" style="line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingLeft=3;spacingRight=3;strokeColor=#cbd5e1;direction=south;opacity=20;dashed=1;" vertex="1" parent="1">
            <mxGeometry x="${x}" y="${TITLE_HEIGHT}" width="10" height="${contentHeight}" as="geometry" />
          </mxCell>`;
      });

      const rowHeight = STYLES.taskHeight;
      processedData.zoneMeta.forEach((zone, i) => {
          const y = zone.startRow * rowHeight + HEADER_HEIGHT + TITLE_HEIGHT;
          const h = zone.rowCount * rowHeight;
          const bgColor = (i % 2 === 0) ? '#ffffff' : '#f8fafc';
          xml += `<mxCell id="${getNextId()}" value="" style="rounded=0;whiteSpace=wrap;html=1;fillColor=${bgColor};strokeColor=#cbd5e1;opacity=50;" vertex="1" parent="1">
            <mxGeometry x="0" y="${y}" width="${width}" height="${h}" as="geometry" />
          </mxCell>`;
          xml += `<mxCell id="${getNextId()}" value="${zone.name}" style="text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=#cbd5e1;fillColor=${bgColor};fontStyle=1;fontColor=${zone.color};" vertex="1" parent="1">
            <mxGeometry x="0" y="${y}" width="120" height="${h}" as="geometry" />
          </mxCell>`;
      });

      const nodeCoordSet = new Map<string, { x: number, y: number, isMilestone: boolean }>();

      processedData.tasks.forEach(item => {
          const task = item.task;
          const startX = xScale(addDays(projectStartDate, task.earlyStart || 0));
          const endX = xScale(addDays(projectStartDate, task.earlyFinish || 0));
          const y = (item.globalRowIndex * rowHeight) + HEADER_HEIGHT + TITLE_HEIGHT + (rowHeight * 0.55);
          
          const startKey = `${Math.round(startX)},${Math.round(y)}`;
          const endKey = `${Math.round(endX)},${Math.round(y)}`;
          
          if (!nodeCoordSet.has(startKey)) nodeCoordSet.set(startKey, { x: startX, y, isMilestone: false });
          if (!nodeCoordSet.has(endKey)) nodeCoordSet.set(endKey, { x: endX, y, isMilestone: task.type === LinkType.Wavy });
          else if (task.type === LinkType.Wavy) nodeCoordSet.get(endKey)!.isMilestone = true;

          const zoneIndex = processedData.zoneMeta.findIndex(z => z.name === task.zone);
          const color = task.isCritical ? STYLES.criticalColor : (zoneIndex >= 0 ? processedData.zoneMeta[zoneIndex].color : STYLES.normalColor);

          xml += `<mxCell id="${getNextId()}" value="" style="endArrow=block;endFill=1;html=1;strokeColor=${color};strokeWidth=1.8;verticalAlign=bottom;curved=0;" edge="1" parent="1">
            <mxGeometry width="50" height="50" relative="1" as="geometry">
              <mxPoint x="${startX}" y="${y}" as="sourcePoint" />
              <mxPoint x="${endX}" y="${y}" as="targetPoint" />
            </mxGeometry>
          </mxCell>`;
          
          task.predecessors.forEach(predId => {
              const predT = processedData.rawTasks.get(predId);
              const predGlobal = processedData.tasks.find(t => t.task.id === predId);
              if (!predT || !predGlobal) return;
              const endXPred = xScale(addDays(projectStartDate, predT.earlyFinish || 0));
              const yPred = (predGlobal.globalRowIndex * rowHeight) + HEADER_HEIGHT + TITLE_HEIGHT + (rowHeight * 0.55);

              if (startX > endXPred + 2) {
                  const midX = (endXPred + startX) / 2;
                  xml += `<mxCell id="${getNextId()}" value="" style="endArrow=none;html=1;strokeColor=#94a3b8;strokeWidth=1.2;curved=1;dashed=0;" edge="1" parent="1">
                    <mxGeometry width="50" height="50" relative="1" as="geometry">
                      <mxPoint x="${endXPred}" y="${yPred}" as="sourcePoint" />
                      <mxPoint x="${startX}" y="${yPred}" as="targetPoint" />
                      <Array as="points">
                        <mxPoint x="${(endXPred + midX) / 2}" y="${yPred - 6}" />
                        <mxPoint x="${midX}" y="${yPred + 6}" />
                        <mxPoint x="${(midX + startX) / 2}" y="${yPred - 6}" />
                      </Array>
                    </mxGeometry>
                  </mxCell>`;
              }
              if (Math.abs(yPred - y) > 5) {
                  xml += `<mxCell id="${getNextId()}" value="" style="endArrow=block;endFill=1;html=1;strokeColor=#64748b;strokeWidth=1.2;dashed=1;endSize=8;" edge="1" parent="1">
                    <mxGeometry width="50" height="50" relative="1" as="geometry">
                      <mxPoint x="${startX}" y="${yPred}" as="sourcePoint" />
                      <mxPoint x="${startX}" y="${y}" as="targetPoint" />
                    </mxGeometry>
                  </mxCell>`;
                  const interKey = `${Math.round(startX)},${Math.round(yPred)}`;
                  if (!nodeCoordSet.has(interKey)) nodeCoordSet.set(interKey, { x: startX, y: yPred, isMilestone: false });
              }
          });
      });

      nodeCoordSet.forEach((coord, key) => {
          const id = getNextId();
          if (coord.isMilestone) {
              xml += `<mxCell id="${id}" value="" style="rhombus;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#ef4444;strokeWidth=2;" vertex="1" parent="1">
                <mxGeometry x="${coord.x - 8}" y="${coord.y - 8}" width="16" height="16" as="geometry" />
              </mxCell>`;
          } else {
              xml += `<mxCell id="${id}" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1;" vertex="1" parent="1">
                <mxGeometry x="${coord.x - 6}" y="${coord.y - 6}" width="12" height="12" as="geometry" />
              </mxCell>`;
          }
      });

      processedData.tasks.forEach(item => {
          const task = item.task;
          const startX = xScale(addDays(projectStartDate, task.earlyStart || 0));
          const endX = xScale(addDays(projectStartDate, task.earlyFinish || 0));
          const y = (item.globalRowIndex * rowHeight) + HEADER_HEIGHT + TITLE_HEIGHT + (rowHeight * 0.55);
          const zoneIndex = processedData.zoneMeta.findIndex(z => z.name === task.zone);
          const color = task.isCritical ? STYLES.criticalColor : (zoneIndex >= 0 ? processedData.zoneMeta[zoneIndex].color : STYLES.normalColor);

          const startDateStr = formatYYMMDD(addDays(projectStartDate, task.earlyStart || 0));
          const endDateStr = formatYYMMDD(addDays(projectStartDate, (task.earlyFinish || 1) - 1));
          
          if (task.type !== LinkType.Wavy) {
              xml += `<mxCell id="${getNextId()}" value="${startDateStr}" style="text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=none;fillColor=none;fontSize=9;fontColor=#64748b;" vertex="1" parent="1">
                <mxGeometry x="${startX - 40}" y="${y + 10}" width="80" height="20" as="geometry" />
              </mxCell>`;
          }
          xml += `<mxCell id="${getNextId()}" value="${endDateStr}" style="text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=none;fillColor=none;fontSize=9;fontColor=#64748b;" vertex="1" parent="1">
            <mxGeometry x="${endX - 40}" y="${y + 10}" width="80" height="20" as="geometry" />
          </mxCell>`;

          xml += `<mxCell id="${getNextId()}" value="${task.name}" style="text;html=1;align=center;verticalAlign=bottom;resizable=0;points=[];strokeColor=none;fillColor=none;fontSize=11;whiteSpace=wrap;overflow=hidden;fontColor=${color};" vertex="1" parent="1">
            <mxGeometry x="${(startX + endX) / 2 - 60}" y="${y - 18}" width="120" height="16" as="geometry" />
          </mxCell>`;
          
          if (task.type === LinkType.Real && task.duration > 0) {
             xml += `<mxCell id="${getNextId()}" value="${task.duration}d" style="text;html=1;align=center;verticalAlign=top;resizable=0;points=[];strokeColor=none;fillColor=none;fontSize=10;fontColor=${color};fontStyle=1;" vertex="1" parent="1">
                <mxGeometry x="${(startX + endX) / 2 - 20}" y="${y + 1}" width="40" height="14" as="geometry" />
              </Alert>`;
          }
      });

      xml += `\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>`;
      return xml;
  };

  const handleExport = async (type: 'pdf' | 'png' | 'svg' | 'drawio') => {
      setShowExportMenu(false);
      const fileName = `${projectName || 'network-plan'}-${new Date().getTime()}`;
      
      const totalDays = processedData.projectDuration + 15;
      const totalMonths = totalDays / 30;
      const baseWidthPerMonth = 120; 
      const fullWidth = Math.max(dimensions.width, 150 + totalMonths * baseWidthPerMonth);
      const fullHeight = Math.max(dimensions.height, TITLE_HEIGHT + HEADER_HEIGHT + processedData.totalRows * STYLES.taskHeight + 100);
      
      const exSc = d3.scaleTime()
        .domain([projectStartDate, addDays(projectStartDate, totalDays)])
        .range([150, fullWidth - 50]);

      if (type === 'drawio') {
          const xmlContent = generateDrawioXml(exSc, fullWidth, fullHeight);
          const blob = new Blob([xmlContent], { type: "text/xml" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = url; link.download = `${fileName}.drawio`; link.click();
          return;
      }

      try {
        const hDiv = document.createElement('div'); hDiv.style.position = 'absolute'; hDiv.style.top = '-9999px'; hDiv.style.left = '-9999px'; hDiv.style.width = `${fullWidth}px`; hDiv.style.height = `${fullHeight}px`; document.body.appendChild(hDiv);
        const tSvg = d3.select(hDiv).append("svg").attr("width", fullWidth).attr("height", fullHeight).attr("xmlns", "http://www.w3.org/2000/svg");
        
        drawIntoSelection(tSvg, exSc, fullWidth, fullHeight, 0, 'month');

        if (type === 'png' || type === 'pdf') {
            const canvas = await html2canvas(hDiv, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
            const imgData = canvas.toDataURL('image/png');
            if (type === 'png') { const link = document.createElement('a'); link.download = `${fileName}.png`; link.href = imgData; link.click(); } 
            else { const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] }); pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height); pdf.save(`${fileName}.pdf`); }
        } else if (type === 'svg') {
             const svgNode = tSvg.node() as SVGSVGElement;
             const svgData = new XMLSerializer().serializeToString(svgNode);
             const blob = new Blob([svgData], { type: "image/svg+xml" });
             const url = URL.createObjectURL(blob);
             const link = document.createElement('a'); link.href = url; link.download = `${fileName}.svg`; link.click();
        }
        document.body.removeChild(hDiv);
      } catch (e) { console.error(e); alert("导出失败"); }
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || dimensions.width === 0) return;
    const svg = d3.select(svgRef.current);
    let initialViewWidth = Math.max(dimensions.width - 50, 1000);
    if (timeScaleMode === 'month') initialViewWidth = initialViewWidth / 5;
    else if (timeScaleMode === 'year') initialViewWidth = initialViewWidth / 15;
    const initialXScale = d3.scaleTime().domain([projectStartDate, addDays(projectStartDate, processedData.projectDuration + 15)]).range([150, initialViewWidth]);
    drawIntoSelection(svg, initialXScale, dimensions.width, dimensions.height, zoomTransform.y);
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.05, 15]).on("zoom", (event) => {
        const transform = event.transform;
        setZoomTransform(transform);
        const newXScale = transform.rescaleX(initialXScale);
        drawIntoSelection(svg, newXScale, dimensions.width, dimensions.height, transform.y);
    });
    svg.call(zoom);
  }, [processedData, projectStartDate, dimensions, projectName, timeScaleMode]);

  const uniqueZones = useMemo(() => Array.from(new Set(tasks.map(t => t.zone || '默认区域'))), [tasks]);

  return (
    <div className="h-full flex flex-col bg-slate-50 relative border-l border-slate-200">
      <div className="h-10 border-b border-slate-200 bg-white flex items-center px-4 gap-3 shadow-sm z-[20] shrink-0">
        <div className="flex items-center gap-2 text-slate-700"><Layers size={16} className="text-cyan-600"/><span className="font-bold text-sm">时标网络计划</span></div>
        <div className="h-4 w-px bg-slate-200 mx-1"></div>
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          {(['day', 'month', 'year'] as TimeScaleMode[]).map(mode => (
            <button key={mode} onClick={() => setTimeScaleMode(mode)} className={`px-3 py-1 text-[10px] font-bold uppercase transition-all rounded-md ${timeScaleMode === mode ? 'bg-white text-cyan-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{mode === 'day' ? '日' : mode === 'month' ? '月' : '年'}</button>
          ))}
        </div>
        <div className="h-4 w-px bg-slate-200 mx-1"></div>
        <button onClick={() => setShowZoneModal(true)} className="p-1 flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 transition font-bold" title="调整区域显示顺序">
           <ArrowDownUp size={14} /> 区域管理
        </button>
        
        <div className="flex-1"></div>
        
        <div className="flex items-center gap-2">
            <button 
                onClick={onToggleFocusMode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all border ${
                    isFocusMode 
                    ? 'bg-blue-50 border-blue-200 text-blue-600' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                title={isFocusMode ? "还原面板布局" : "全屏专注模式"}
            >
                {isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                {isFocusMode ? "还原布局" : "专注模式"}
            </button>
            
            <div className="h-4 w-px bg-slate-200 mx-1"></div>

            <div className="relative">
                <button 
                    onClick={() => setShowExportMenu(!showExportMenu)} 
                    className="p-1 flex items-center gap-1.5 text-xs bg-cyan-600 text-white px-3 py-1.5 rounded hover:bg-cyan-700 shadow-sm transition font-bold"
                >
                    <Share2 size={14} /> 导出图纸
                </button>
                {showExportMenu && (
                    <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 shadow-2xl rounded-lg overflow-hidden z-[50] w-52 flex flex-col">
                        <button onClick={() => handleExport('png')} className="px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors text-left w-full">图片 (PNG)</button>
                        <button onClick={() => handleExport('pdf')} className="px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors text-left w-full">文档 (PDF)</button>
                        <button onClick={() => handleExport('svg')} className="px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors text-left w-full">矢量图 (SVG)</button>
                        <button onClick={() => handleExport('drawio')} className="px-4 py-3 text-xs text-emerald-700 font-bold hover:bg-emerald-50 flex items-center gap-3 transition-colors border-t border-slate-100 text-left w-full"><FileJson size={14} /> draw.io (XML)</button>
                    </div>
                )}
            </div>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden relative bg-slate-50 cursor-grab active:cursor-grabbing">
        <svg ref={svgRef} className="w-full h-full block"></svg>
        <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur-sm p-2 rounded-lg border border-slate-200 text-[10px] text-slate-400 pointer-events-none">滚轮缩放，按住拖动平移 | 标尺常驻置顶</div>
      </div>

      {showZoneModal && (
          <div className="absolute inset-0 z-[60] bg-slate-900/20 backdrop-blur-[1px] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-sm flex flex-col animate-in fade-in zoom-in duration-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
                      <div className="flex items-center gap-2">
                        <ArrowDownUp size={18} className="text-blue-600" />
                        <h4 className="font-bold text-slate-700 text-sm">区域显示顺序调整</h4>
                      </div>
                      <button onClick={() => setShowZoneModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>
                  <div className="p-4 flex-1 overflow-y-auto max-h-[60vh] space-y-2">
                      {processedData.sortedZones.map((z, idx) => (
                          <div key={z} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg group hover:border-blue-300 shadow-sm transition-all">
                              <div className="flex items-center gap-3">
                                  <div className="p-1.5 bg-slate-100 rounded text-slate-400 group-hover:text-blue-400"><Move size={14}/></div>
                                  <span className="text-sm font-bold text-slate-700">{z}</span>
                              </div>
                              <div className="flex gap-1">
                                  <button onClick={() => moveZone(idx, 'up')} disabled={idx === 0} className="p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 rounded disabled:opacity-20 transition-colors"><ChevronUp size={16}/></button>
                                  <button onClick={() => moveZone(idx, 'down')} disabled={idx === processedData.sortedZones.length - 1} className="p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 rounded disabled:opacity-20 transition-colors"><ChevronDown size={16}/></button>
                              </div>
                          </div>
                      ))}
                  </div>
                  <div className="p-4 border-t bg-slate-50 flex justify-end">
                      <button onClick={() => setShowZoneModal(false)} className="bg-blue-600 text-white px-8 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md transition-all active:scale-95">确定并应用</button>
                  </div>
              </div>
          </div>
      )}

      {editingTask && (
        <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl flex flex-col animate-in fade-in zoom-in duration-300">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Edit3 size={20}/></div>
                   <div>
                     <h4 className="font-bold text-slate-800 text-lg leading-tight">编辑工作属性</h4>
                     <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Engineering Property Editor</p>
                   </div>
                </div>
                <button onClick={() => setEditingTask(null)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-full transition-all"><X size={20}/></button>
             </div>
             <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto max-h-[75vh]">
                <div className="col-span-2 grid grid-cols-4 gap-4">
                   <div className="col-span-1">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1.5"><Hash size={12}/> 工作代号</label>
                      <input className="w-full border-2 border-slate-100 rounded-lg p-2.5 text-sm bg-slate-50 text-slate-400 font-mono" value={editingTask.id} disabled />
                   </div>
                   <div className="col-span-3">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1.5"><Flag size={12}/> 工作名称</label>
                      <input className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm font-semibold focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all" value={editingTask.name} onChange={e => setEditingTask({...editingTask, name: e.target.value})} placeholder="输入任务名称..." />
                   </div>
                </div>
                <div className="col-span-2 grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                   <div>
                     <label className="flex items-center gap-1.5 text-xs font-bold text-blue-600 mb-1.5"><Calendar size={12}/> 开始日期</label>
                     <input type="date" className="w-full border-2 border-blue-200 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-all" value={addDays(projectStartDate, editingTask.earlyStart || 0).toISOString().split('T')[0]} 
                      onChange={e => { 
                        const target = new Date(e.target.value); 
                        const start = new Date(projectStartDate); 
                        start.setHours(0,0,0,0); 
                        const days = Math.round((target.getTime() - start.getTime()) / 86400000); 
                        const curFinish = editingTask.earlyFinish || (days + editingTask.duration); 
                        setEditingTask({ ...editingTask, constraintDate: days, earlyStart: days, duration: Math.max(0, curFinish - days) }); 
                      }} />
                   </div>
                   <div>
                     <label className="flex items-center gap-1.5 text-xs font-bold text-blue-600 mb-1.5"><Calendar size={12}/> 完成日期</label>
                     <input type="date" className="w-full border-2 border-blue-200 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-all" value={addDays(projectStartDate, (editingTask.earlyFinish || 1) - 1).toISOString().split('T')[0]} 
                      onChange={e => { 
                        const target = new Date(e.target.value); 
                        const start = new Date(projectStartDate); 
                        start.setHours(0,0,0,0); 
                        const finish = Math.round((target.getTime() - start.getTime()) / 86400000) + 1; 
                        const curStart = editingTask.earlyStart || 0; 
                        setEditingTask({ ...editingTask, duration: Math.max(0, finish - curStart), earlyFinish: finish }); 
                      }} />
                   </div>
                   <div>
                     <label className="flex items-center gap-1.5 text-xs font-bold text-slate-400 mb-1.5"><Hash size={12}/> 工期 (自动计算)</label>
                     <input type="number" min="0" className="w-full border-2 border-slate-100 rounded-lg p-2.5 text-sm outline-none bg-slate-50 text-slate-500" value={editingTask.duration} readOnly />
                   </div>
                </div>
                <div className="space-y-4">
                   <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1.5"><Layers size={12}/> 分配区域</label>
                      <input className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-all" value={editingTask.zone || ''} onChange={e => setEditingTask({...editingTask, zone: e.target.value})} list="zone-list" placeholder="选择或输入区域..." />
                      <datalist id="zone-list">{uniqueZones.map(z => <option key={z} value={z} />)}</datalist>
                   </div>
                   <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1.5"><MoveVertical size={12}/> 指定泳道 (Lane)</label>
                      <input type="number" placeholder="自动排列" className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-all" value={editingTask.manualLane ?? ''} onChange={e => setEditingTask({...editingTask, manualLane: e.target.value === '' ? undefined : parseInt(e.target.value)})} />
                   </div>
                </div>
                <div className="space-y-4">
                   <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1.5"><BoxSelect size={12}/> 工作性质</label>
                      <select className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-all appearance-none bg-no-repeat bg-[right_0.5rem_center]" value={editingTask.type} onChange={e => setEditingTask({...editingTask, type: e.target.value as LinkType})}><option value={LinkType.Real}>实工作 (Normal Task)</option><option value={LinkType.Virtual}>虚工作 (Dummy Task)</option><option value={LinkType.Wavy}>里程碑 (Milestone)</option></select>
                   </div>
                   <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1.5"><ListTree size={12}/> 所属父节点ID</label>
                      <input className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-all" value={editingTask.parentId || ''} onChange={e => setEditingTask({...editingTask, parentId: e.target.value || undefined})} placeholder="层级汇总关联ID" />
                   </div>
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-4">
                   <div className="bg-blue-50/30 p-4 rounded-xl border border-blue-100">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-blue-700 mb-2"><LinkIcon size={12}/> 紧前工作 (Predecessors)</label>
                      <input className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-all bg-white" value={editingTask.predecessors.join(',')} onChange={e => setEditingTask({...editingTask, predecessors: e.target.value.split(/[,，\s]+/).filter(x => x.trim() !== '')})} placeholder="输入ID, 以逗号分隔" />
                   </div>
                   <div className="bg-purple-50/30 p-4 rounded-xl border border-purple-100">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-purple-700 mb-2"><LinkIcon size={12}/> 紧后工作 (Successors)</label>
                      <input className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-all bg-white" value={editingTask.successorsText || ''} onChange={e => setEditingTask({...editingTask, successorsText: e.target.value})} placeholder="输入ID, 以逗号分隔" />
                   </div>
                </div>
                <div className="col-span-2">
                   <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1.5"><FileText size={12}/> 备注与详细说明</label>
                   <textarea className="w-full border-2 border-slate-200 rounded-lg p-3 text-sm h-24 resize-none outline-none focus:border-blue-500 transition-all" value={editingTask.description || ''} onChange={e => setEditingTask({...editingTask, description: e.target.value})} placeholder="关于本工作的说明..." />
                </div>
             </div>
             <div className="p-4 border-t bg-slate-50 rounded-b-xl flex justify-end gap-3"><button onClick={() => setEditingTask(null)} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-lg transition-all">取消</button><button onClick={handleSaveEdit} className="bg-blue-600 text-white px-10 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2 active:scale-95"><Save size={18} /> 应用更新</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkDiagram;