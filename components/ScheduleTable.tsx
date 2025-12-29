import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Task, LinkType } from '../types';
import { Plus, Trash, Link as LinkIcon, X, CheckSquare, Square, Download, Upload, ChevronRight, ChevronDown, Table, Lock } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ScheduleTableProps {
  tasks: Task[];
  isReadOnly?: boolean;
  onUpdateTask: (task: Task) => void;
  onAddTask: () => void;
  onDeleteTask: (id: string) => void;
  onReplaceTasks: (tasks: Task[]) => void;
  projectStartDate: Date;
}

// Compact column widths for high-density display
const DEFAULT_WIDTHS = {
  id: 35,
  zone: 50,
  name: 180, 
  start: 85,
  end: 85,
  duration: 45,
  completion: 45,
  type: 65,
  predecessors: 80,
  actions: 35
};

const ScheduleTable: React.FC<ScheduleTableProps> = ({ tasks, isReadOnly, onUpdateTask, onAddTask, onDeleteTask, onReplaceTasks, projectStartDate }) => {
  const [linkModalTaskId, setLinkModalTaskId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Column resizing state
  const [colWidths, setColWidths] = useState(DEFAULT_WIDTHS);
  const resizingRef = useRef<{ key: keyof typeof DEFAULT_WIDTHS, startX: number, startWidth: number } | null>(null);

  // Resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key, startX, startWidth } = resizingRef.current;
      const diff = e.clientX - startX;
      setColWidths(prev => ({
        ...prev,
        [key]: Math.max(30, startWidth + diff)
      }));
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent, key: keyof typeof DEFAULT_WIDTHS) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] };
    document.body.style.cursor = 'col-resize';
  };

  const flattenedTasks = useMemo(() => {
    const result: { task: Task; level: number }[] = [];
    const childrenMap = new Map<string, Task[]>();
    const roots: Task[] = [];

    tasks.forEach(t => {
      if (t.parentId) {
        if (!childrenMap.has(t.parentId)) childrenMap.set(t.parentId, []);
        childrenMap.get(t.parentId)?.push(t);
      } else {
        roots.push(t);
      }
    });

    const traverse = (nodes: Task[], level: number) => {
      nodes.forEach(node => {
        result.push({ task: node, level });
        if (!node.isCollapsed) {
          const children = childrenMap.get(node.id);
          if (children) traverse(children, level + 1);
        }
      });
    };

    traverse(roots, 0);
    return result;
  }, [tasks]);

  const toggleCollapse = (task: Task) => onUpdateTask({ ...task, isCollapsed: !task.isCollapsed });

  const togglePredecessor = (targetTask: Task, predId: string) => {
    if (isReadOnly) return;
    const currentPreds = targetTask.predecessors || [];
    const newPreds = currentPreds.includes(predId) ? currentPreds.filter(id => id !== predId) : [...currentPreds, predId];
    onUpdateTask({ ...targetTask, predecessors: newPreds });
  };

  const editingTask = tasks.find(t => t.id === linkModalTaskId);

  const toLocalYYYYMMDD = (date: Date) => {
    if (!date || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatDateForInput = (offset?: number) => {
    if (offset === undefined || isNaN(offset)) return '';
    const baseDate = new Date(projectStartDate);
    baseDate.setHours(0, 0, 0, 0);
    const targetDate = new Date(baseDate);
    targetDate.setDate(targetDate.getDate() + offset);
    return toLocalYYYYMMDD(targetDate);
  };

  const getDaysFromDateStr = (dateStr: string): number => {
    if (!dateStr) return 0;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return 0;
    const [y, m, d] = parts.map(Number);
    const target = new Date(y, m - 1, d);
    target.setHours(0, 0, 0, 0);
    const start = new Date(projectStartDate);
    start.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - start.getTime()) / (1000 * 3600 * 24));
  };

  // Updated Logic: Changing start date updates the constraint AND calculates new duration
  // based on the EXISTING end date. (Anchors End Date)
  const handleStartChange = (task: Task, dateStr: string) => {
    if (!dateStr || isReadOnly) return;
    const newStartOffset = getDaysFromDateStr(dateStr);
    
    // Calculate current finish offset
    const currentFinishOffset = (task.earlyFinish || 1) - 1;
    
    // New Duration = Fixed End - New Start + 1
    let newDuration = currentFinishOffset - newStartOffset + 1;
    
    // Prevent invalid duration (start after end). Min duration is 1.
    if (newDuration < 1) newDuration = 1;

    onUpdateTask({ 
      ...task, 
      constraintDate: newStartOffset,
      duration: newDuration
    });
  };

  // Updated Logic: Changing end date anchors Start Date and calculates new duration.
  const handleEndChange = (task: Task, dateStr: string) => {
    if (!dateStr || isReadOnly) return;
    const selectedFinishOffset = getDaysFromDateStr(dateStr);
    const currentStartOffset = task.earlyStart || 0;
    
    // New Duration = New End - Fixed Start + 1
    let newDuration = selectedFinishOffset - currentStartOffset + 1;
    
    // Prevent invalid duration
    if (newDuration < 1) newDuration = 1;

    onUpdateTask({ ...task, duration: newDuration });
  };

  const handlePredecessorsTextChange = (task: Task, text: string) => {
    if (isReadOnly) return;
    const preds = text.split(/[,，\s]+/).filter(id => id.trim() !== '');
    onUpdateTask({ ...task, predecessors: preds });
  };

  const handleTypeChange = (task: Task, newType: LinkType) => {
    if (isReadOnly) return;
    let updates: Partial<Task> = { type: newType };
    if (newType === LinkType.Wavy && (task.duration === 0 || !task.duration)) updates.duration = 1;
    onUpdateTask({ ...task, ...updates });
  };

  const handleKeyDown = (e: React.KeyboardEvent, task: Task) => {
    if (isReadOnly) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const idx = flattenedTasks.findIndex(item => item.task.id === task.id);
      if (idx > 0) {
        if (e.shiftKey) {
          const currentParentId = task.parentId;
          if (currentParentId) {
            const parentTask = tasks.find(t => t.id === currentParentId);
            onUpdateTask({ ...task, parentId: parentTask?.parentId });
          }
        } else {
          const potentialParent = flattenedTasks[idx - 1].task;
          if (potentialParent.id !== task.parentId) {
            onUpdateTask({ ...task, parentId: potentialParent.id });
            if (potentialParent.isCollapsed) onUpdateTask({ ...potentialParent, isCollapsed: false });
          }
        }
      }
    }
  };

  const handleDownloadExcel = () => {
    const data = tasks.map(t => ({ 
      "代号": t.id, 
      "工作名称": t.name, 
      "工期": t.duration, 
      "完成率": t.completion || 0,
      "区域": t.zone || "", 
      "类型": t.type, 
      "紧前工作": t.predecessors ? t.predecessors.join(',') : "", 
      "开始时间": formatDateForInput(t.earlyStart), 
      "结束时间": formatDateForInput(t.earlyFinish ? t.earlyFinish - 1 : t.earlyStart) 
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "进度计划");
    XLSX.writeFile(wb, `Schedule_${new Date().getTime()}.xlsx`);
  };

  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = await file.arrayBuffer(); const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      const newTasks: Task[] = jsonData.map((row: any) => ({
        id: String(row["代号"] || Math.random().toString(36).substr(2, 5)),
        name: String(row["工作名称"] || "未命名"),
        duration: parseInt(row["工期"]) || 0,
        completion: parseInt(row["完成率"]) || 0,
        type: (row["类型"] as LinkType) || LinkType.Real,
        zone: String(row["区域"] || ""),
        predecessors: String(row["紧前工作"] || "").split(/[,，\s]+/).filter(s => s !== "")
      }));
      onReplaceTasks(newTasks);
    } catch (err) { alert("导入失败"); } finally { if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  // Apple Numbers style header button
  const headerBtnClass = "flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all text-[12px] font-medium";

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 relative">
      <style>{`
        .custom-scrollbar-thick::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        .custom-scrollbar-thick::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 6px;
          border: 3px solid transparent;
          background-clip: content-box;
        }
        .custom-scrollbar-thick::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
        .dark .custom-scrollbar-thick::-webkit-scrollbar-thumb {
          background: #475569;
        }
        .resizer {
            position: absolute;
            right: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            cursor: col-resize;
            z-index: 10;
        }
        .resizer:hover, .resizing {
            background: #3b82f6;
            opacity: 0.5;
        }
        /* Clean Horizontal Lines Only Style */
        .numbers-header th {
            background-color: #f8fafc;
            color: #64748b;
            font-weight: 600;
            text-align: left;
            font-size: 0.75rem;
            border-bottom: 1px solid #e2e8f0;
            border-right: 1px solid #e2e8f0; /* Added Vertical Border */
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding: 8px 4px; /* Reduced Header Padding */
        }
        .numbers-header th:last-child {
            border-right: none;
        }
        .dark .numbers-header th {
            background-color: #1e293b;
            color: #94a3b8;
            border-bottom: 1px solid #334155;
            border-right: 1px solid #334155; /* Added Vertical Border Dark */
        }
        .dark .numbers-header th:last-child {
            border-right: none;
        }

        .numbers-table td {
            border-bottom: 1px solid #f1f5f9; /* Subtle horizontal line */
            border-right: none; /* No vertical borders in body */
            padding: 0;
        }
        .dark .numbers-table td {
            border-bottom: 1px solid #334155;
        }
        
        /* Override global form styles for table inputs to remove "box" look */
        .numbers-table input, 
        .numbers-table select {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 2px !important; /* Minimal input padding */
            color: inherit !important;
            transition: all 0.2s;
            color-scheme: light; /* Force light picker in light mode for consistency */
        }
        .dark .numbers-table input,
        .dark .numbers-table select {
            color-scheme: dark;
        }
        
        /* Focus state for inputs - Subtle underline or background */
        .numbers-table input:focus, 
        .numbers-table select:focus {
            background: #ffffff !important; /* Force white background in light mode */
            outline: none !important;
            color: #3b82f6 !important; /* Bright blue text on focus for better visibility */
            box-shadow: inset 0 0 0 1px #3b82f6 !important;
        }

        .dark .numbers-table input:focus, 
        .dark .numbers-table select:focus {
            background: #0f172a !important; /* Force dark background in dark mode */
            color: #3b82f6 !important;
            box-shadow: inset 0 0 0 1px #3b82f6 !important;
        }
        
        /* Center content adjustments */
        .numbers-header th:first-child,
        .numbers-table td:first-child input {
            text-align: center;
        }
      `}</style>

      {/* Header Section - Consolidated Title & Actions */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-[#fbfbfd] dark:bg-slate-900 flex items-center justify-between">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                {/* Changed Icon to Table */}
                <Table size={18} className="text-slate-800 dark:text-slate-100" strokeWidth={2} />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white tracking-tight">工作计划表</h3>
            </div>
            
            {/* Vertical Divider */}
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700"></div>
            
            {/* Action Buttons Group */}
            <div className="flex items-center gap-1">
                 {!isReadOnly && (
                    <button onClick={onAddTask} className={headerBtnClass} title="新建工作任务">
                        <Plus size={14} strokeWidth={2} />
                        <span>新建工作</span>
                    </button>
                 )}

                 {!isReadOnly && (
                   <button onClick={() => fileInputRef.current?.click()} className={headerBtnClass} title="从Excel导入">
                      {/* Swapped Icon: Import now uses Download icon */}
                      <Download size={14} strokeWidth={2} />
                      <span>导入表格</span>
                   </button>
                 )}

                 <button onClick={handleDownloadExcel} className={headerBtnClass} title="导出为Excel">
                    {/* Swapped Icon: Export now uses Upload icon */}
                    <Upload size={14} strokeWidth={2} />
                    <span>导出表格</span>
                 </button>
            </div>
        </div>
        
        <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleUploadExcel} />
      </div>

      <div className="flex-1 overflow-auto relative custom-scrollbar-thick bg-white dark:bg-slate-900">
        {isReadOnly && (
            <div className="sticky top-0 right-0 left-0 bg-amber-50 dark:bg-amber-900/50 border-b border-amber-200 dark:border-amber-800 px-3 py-1 text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-2 z-[20]">
                <Lock size={12} /> <span>只读权限：您不拥有此项目且所有者未开放协作权限，更改将不会被保存。</span>
            </div>
        )}
        <table className="w-full text-xs text-left border-collapse table-fixed bg-white dark:bg-slate-900 numbers-table">
          <thead className="sticky top-0 z-10 numbers-header shadow-sm">
            <tr>
              <th style={{ width: colWidths.id }} className="relative">
                  代号
                  <div className="resizer" onMouseDown={(e) => startResize(e, 'id')} />
              </th>
              <th style={{ width: colWidths.zone }} className="relative">
                  区域
                  <div className="resizer" onMouseDown={(e) => startResize(e, 'zone')} />
              </th>
              <th style={{ width: colWidths.name }} className="relative">
                  工作名称
                  <div className="resizer" onMouseDown={(e) => startResize(e, 'name')} />
              </th>
              <th style={{ width: colWidths.start }} className="relative">
                  开始时间
                  <div className="resizer" onMouseDown={(e) => startResize(e, 'start')} />
              </th>
              <th style={{ width: colWidths.end }} className="relative">
                  结束时间
                  <div className="resizer" onMouseDown={(e) => startResize(e, 'end')} />
              </th>
              <th style={{ width: colWidths.duration }} className="relative">
                  工期（d）
                  <div className="resizer" onMouseDown={(e) => startResize(e, 'duration')} />
              </th>
              <th style={{ width: colWidths.completion }} className="relative">
                  完成率
                  <div className="resizer" onMouseDown={(e) => startResize(e, 'completion')} />
              </th>
              <th style={{ width: colWidths.type }} className="relative">
                  类型
                  <div className="resizer" onMouseDown={(e) => startResize(e, 'type')} />
              </th>
              <th style={{ width: colWidths.predecessors }} className="relative">
                  紧前
                  <div className="resizer" onMouseDown={(e) => startResize(e, 'predecessors')} />
              </th>
              <th style={{ width: colWidths.actions }} className="relative">
                  操作
                  <div className="resizer" onMouseDown={(e) => startResize(e, 'actions')} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {flattenedTasks.map(({ task, level }) => {
              const startOffset = task.earlyStart || 0;
              const finishOffset = Math.max(startOffset, (task.earlyFinish || 1) - 1);
              const isSummaryTask = !!task.isSummary;

              return (
                <tr key={task.id} className={`hover:bg-blue-50/30 dark:hover:bg-blue-900/10 group transition-colors ${task.isCritical ? 'bg-red-50/5 dark:bg-red-900/5' : ''} ${isSummaryTask ? 'font-bold bg-slate-50/50 dark:bg-slate-800/50' : ''}`}>
                  <td className="p-0 h-9">
                    <input type="text" value={task.id} disabled={isReadOnly} onChange={(e) => onUpdateTask({ ...task, id: e.target.value })} className="w-full h-full px-0.5 text-center disabled:cursor-not-allowed dark:text-slate-300 font-mono text-[11px]" />
                  </td>
                  <td className="p-0 h-9">
                    <input type="text" value={task.zone || ''} disabled={isReadOnly} onChange={(e) => onUpdateTask({ ...task, zone: e.target.value })} className="w-full h-full px-0.5 text-slate-700 dark:text-slate-300 disabled:cursor-not-allowed text-[11px]" />
                  </td>
                  <td className="p-0 h-9">
                    <div className="flex items-center h-full px-1" style={{ paddingLeft: level * 16 + 2 }}>
                      {isSummaryTask ? (
                        <button onClick={(e) => { e.stopPropagation(); toggleCollapse(task); }} className="mr-0.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                          {task.isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                      ) : <div className="w-4 mr-0.5" />}
                      <input type="text" value={task.name} disabled={isReadOnly} onKeyDown={(e) => handleKeyDown(e, task)} onChange={(e) => onUpdateTask({ ...task, name: e.target.value })} className={`w-full h-full disabled:cursor-not-allowed text-[12px] px-0.5 ${isSummaryTask ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`} />
                    </div>
                  </td>
                  <td className="p-0 h-9">
                    <div 
                      className={`relative w-full h-full flex items-center group/date px-0.5`}
                      onClick={(e) => {
                        const input = e.currentTarget.querySelector('input');
                        if (input && !isSummaryTask && !isReadOnly) {
                          try { (input as any).showPicker(); } catch (err) { input.focus(); }
                        }
                      }}
                    >
                      <input
                        type="date"
                        value={formatDateForInput(startOffset)}
                        onChange={(e) => handleStartChange(task, e.target.value)}
                        disabled={isSummaryTask || isReadOnly}
                        className={`w-full h-full text-[11px] font-mono pointer-events-auto text-slate-600 dark:text-slate-300 ${isSummaryTask || isReadOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </td>
                  <td className="p-0 h-9">
                    <div 
                      className={`relative w-full h-full flex items-center group/date px-0.5`}
                      onClick={(e) => {
                        const input = e.currentTarget.querySelector('input');
                        if (input && !isSummaryTask && !isReadOnly) {
                          try { (input as any).showPicker(); } catch (err) { input.focus(); }
                        }
                      }}
                    >
                      <input
                        type="date"
                        value={formatDateForInput(finishOffset)}
                        onChange={(e) => handleEndChange(task, e.target.value)}
                        disabled={isSummaryTask || isReadOnly}
                        className={`w-full h-full text-[11px] font-mono pointer-events-auto text-slate-600 dark:text-slate-300 ${isSummaryTask || isReadOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </td>
                  <td className="p-0 h-9 text-center text-slate-700 dark:text-slate-300 text-[11px]">
                     <div className="w-full h-full flex items-center justify-center">
                        {task.duration}
                     </div>
                  </td>
                  <td className="p-0 h-9">
                    {!isSummaryTask && (
                      <div className="w-full h-full px-0.5">
                        <input 
                          type="number" 
                          min="0" 
                          max="100" 
                          value={task.completion || 0} 
                          disabled={isReadOnly}
                          onChange={(e) => onUpdateTask({ ...task, completion: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                          className="w-full h-full text-center disabled:cursor-not-allowed dark:text-slate-300 text-[11px]"
                        />
                      </div>
                    )}
                  </td>
                  <td className="p-0 h-9">
                    <div className="w-full h-full flex items-center px-0.5 text-slate-600 dark:text-slate-400">
                      {isSummaryTask ? <span className="text-[10px] italic text-slate-400 pl-1">汇总</span> : (
                        <select value={task.type} disabled={isReadOnly} onChange={(e) => handleTypeChange(task, e.target.value as LinkType)} className="w-full h-full text-[11px] cursor-pointer appearance-none disabled:cursor-not-allowed dark:bg-slate-900 dark:text-slate-300">
                          <option value={LinkType.Real}>实工作</option>
                          <option value={LinkType.Virtual}>虚工作</option>
                          <option value={LinkType.Wavy}>里程碑</option>
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="p-0 h-9 relative group/pred px-0.5">
                    {!isSummaryTask && (
                      <>
                        <input type="text" value={task.predecessors.join(',')} disabled={isReadOnly} onChange={(e) => handlePredecessorsTextChange(task, e.target.value)} className="w-full h-full text-slate-600 dark:text-slate-300 text-[11px] disabled:cursor-not-allowed" />
                        {!isReadOnly && <button onClick={() => setLinkModalTaskId(task.id)} className="opacity-0 group-hover/pred:opacity-100 absolute right-0 top-0 bottom-0 bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 px-1 border-l border-slate-200 dark:border-slate-600 transition-opacity"><LinkIcon size={12} /></button>}
                      </>
                    )}
                  </td>
                  <td className="p-0 h-9 text-center">
                    {!isReadOnly && (
                        <button onClick={() => onDeleteTask(task.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1 opacity-50 hover:opacity-100"><Trash size={14} /></button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {linkModalTaskId && editingTask && (
        <div className="absolute inset-0 z-50 bg-slate-900/10 dark:bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm flex flex-col max-h-[80%] animate-in fade-in zoom-in duration-200">
            <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 rounded-t-lg">
              <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm flex items-center gap-2"><LinkIcon size={14} className="text-blue-500" /> 设置紧前工作</h4>
              <button onClick={() => setLinkModalTaskId(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={16} /></button>
            </div>
            <div className="p-2 flex-1 overflow-y-auto">
              {tasks.filter(t => t.id !== editingTask.id && !t.isSummary).map(t => {
                const isSelected = editingTask.predecessors.includes(t.id);
                return (
                  <div key={t.id} onClick={() => togglePredecessor(editingTask, t.id)} className={`flex items-center gap-2 p-2 rounded cursor-pointer mb-1 border transition-all ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 shadow-sm' : 'hover:bg-slate-50 dark:hover:bg-slate-700 border-transparent text-slate-500 dark:text-slate-400'}`}>
                    {isSelected ? <CheckSquare size={16} className="text-blue-600 dark:text-blue-400" /> : <Square size={16} className="text-slate-300 dark:text-slate-600" />}
                    <div className="flex-1 truncate text-xs font-medium"><span className="bg-slate-200 dark:bg-slate-600 rounded px-1 mr-1 text-[10px] dark:text-slate-200">{t.id}</span>{t.name}</div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-lg flex justify-end">
              <button onClick={() => setLinkModalTaskId(null)} className="bg-blue-600 text-white text-xs px-4 py-2 rounded shadow hover:bg-blue-700 transition font-bold">完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleTable;