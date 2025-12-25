import React, { useState, useRef, useMemo } from 'react';
import { Task, LinkType } from '../types';
import { Plus, Trash, AlertCircle, Link as LinkIcon, X, CheckSquare, Square, Folder, CornerDownRight, FileSpreadsheet, Download, Upload, ChevronRight, ChevronDown, CalendarDays } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ScheduleTableProps {
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
  onAddTask: () => void;
  onDeleteTask: (id: string) => void;
  onReplaceTasks: (tasks: Task[]) => void;
  projectStartDate: Date;
}

const ScheduleTable: React.FC<ScheduleTableProps> = ({ tasks, onUpdateTask, onAddTask, onDeleteTask, onReplaceTasks, projectStartDate }) => {
  const [linkModalTaskId, setLinkModalTaskId] = useState<string | null>(null);
  const [isWpsModalOpen, setIsWpsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // 修改开始时间：更新约束日期，并联动重新计算工期（保持结束日期尽量不变或合法）
  const handleStartChange = (task: Task, dateStr: string) => {
    if (!dateStr) return;
    const newStartOffset = getDaysFromDateStr(dateStr);
    const currentFinishOffset = (task.earlyFinish || 1) - 1;
    const newDuration = Math.max(0, currentFinishOffset - newStartOffset + 1);
    onUpdateTask({ 
      ...task, 
      constraintDate: newStartOffset,
      duration: newDuration 
    });
  };

  // 修改结束时间：联动重新计算工期（保持开始时间不变）
  const handleEndChange = (task: Task, dateStr: string) => {
    if (!dateStr) return;
    const selectedFinishOffset = getDaysFromDateStr(dateStr);
    const currentStartOffset = task.earlyStart || 0;
    const newDuration = Math.max(0, selectedFinishOffset - currentStartOffset + 1);
    onUpdateTask({ ...task, duration: newDuration });
  };

  const handlePredecessorsTextChange = (task: Task, text: string) => {
    const preds = text.split(/[,，\s]+/).filter(id => id.trim() !== '');
    onUpdateTask({ ...task, predecessors: preds });
  };

  const handleTypeChange = (task: Task, newType: LinkType) => {
    let updates: Partial<Task> = { type: newType };
    if (newType === LinkType.Wavy && (task.duration === 0 || !task.duration)) updates.duration = 1;
    onUpdateTask({ ...task, ...updates });
  };

  const handleKeyDown = (e: React.KeyboardEvent, task: Task) => {
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
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = await file.arrayBuffer(); const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      const newTasks: Task[] = jsonData.map((row: any) => ({
        id: String(row["代号"] || Math.random().toString(36).substr(2, 5)),
        name: String(row["工作名称"] || "未命名"),
        duration: parseInt(row["工期"]) || 0,
        type: (row["类型"] as LinkType) || LinkType.Real,
        zone: String(row["区域"] || ""),
        predecessors: String(row["紧前工作"] || "").split(/[,，\s]+/).filter(s => s !== "")
      }));
      onReplaceTasks(newTasks);
    } catch (err) { alert("导入失败"); } finally { if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  return (
    <div className="h-full flex flex-col bg-white relative">
      <div className="flex items-center justify-between p-2 bg-slate-100 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-700 text-sm">工程进度计划表</h3>
          <div className="h-4 w-px bg-slate-300 mx-1"></div>
          <button onClick={() => setIsWpsModalOpen(true)} className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded hover:bg-emerald-100 transition-colors">
            <FileSpreadsheet size={12} /> Excel 导入/导出
          </button>
        </div>
        <button onClick={onAddTask} className="flex items-center gap-1 text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 shadow-sm">
          <Plus size={12} /> 新建工作
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs text-left border-collapse min-w-[850px] border border-slate-200 table-fixed">
          <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm text-slate-700 font-bold uppercase tracking-tight">
            <tr>
              <th className="p-1 border border-slate-300 w-12 text-center bg-slate-100">代号</th>
              <th className="p-1 border border-slate-300 w-20 bg-slate-100">区域</th>
              <th className="p-1 border border-slate-300 w-48 bg-slate-100">工作名称</th>
              <th className="p-1 border border-slate-300 w-36 bg-slate-100 text-blue-600">开始时间</th>
              <th className="p-1 border border-slate-300 w-36 bg-slate-100 text-emerald-600">结束时间</th>
              <th className="p-1 border border-slate-300 w-14 text-center bg-slate-100">工期</th>
              <th className="p-1 border border-slate-300 w-16 bg-slate-100">类型</th>
              <th className="p-1 border border-slate-300 w-24 bg-slate-100">紧前</th>
              <th className="p-1 border border-slate-300 w-10 text-center bg-slate-100">操作</th>
            </tr>
          </thead>
          <tbody>
            {flattenedTasks.map(({ task, level }) => {
              const startOffset = task.earlyStart || 0;
              const finishOffset = Math.max(startOffset, (task.earlyFinish || 1) - 1);
              const isSummaryTask = !!task.isSummary;

              return (
                <tr key={task.id} className={`hover:bg-blue-50/20 group transition-colors ${task.isCritical ? 'bg-red-50/10' : 'bg-white'} ${isSummaryTask ? 'font-semibold bg-slate-50' : ''}`}>
                  <td className="p-0 border border-slate-300 h-8">
                    <input type="text" value={task.id} onChange={(e) => onUpdateTask({ ...task, id: e.target.value })} className="w-full h-full bg-transparent px-1 text-center outline-none focus:bg-white focus:ring-1 focus:ring-blue-400" />
                  </td>
                  <td className="p-0 border border-slate-300 h-8">
                    <input type="text" value={task.zone || ''} onChange={(e) => onUpdateTask({ ...task, zone: e.target.value })} className="w-full h-full bg-transparent px-1 outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 text-slate-600" />
                  </td>
                  <td className="p-0 border border-slate-300 h-8">
                    <div className="flex items-center h-full" style={{ paddingLeft: level * 16 + 4 }}>
                      {isSummaryTask ? (
                        <button onClick={(e) => { e.stopPropagation(); toggleCollapse(task); }} className="mr-1 text-slate-500 hover:text-blue-600">
                          {task.isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                      ) : <div className="w-3.5 mr-1" />}
                      <input type="text" value={task.name} onKeyDown={(e) => handleKeyDown(e, task)} onChange={(e) => onUpdateTask({ ...task, name: e.target.value })} className={`w-full h-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 ${isSummaryTask ? 'text-slate-800' : 'text-slate-700'}`} />
                    </div>
                  </td>
                  {/* 开始时间编辑单元格 */}
                  <td className="p-0 border border-slate-300 h-8">
                    <div 
                      className={`relative w-full h-full flex items-center group/date ${isSummaryTask ? '' : 'cursor-pointer hover:bg-blue-50/50'}`}
                      onClick={(e) => {
                        const input = e.currentTarget.querySelector('input');
                        if (input && !isSummaryTask) {
                          try { (input as any).showPicker(); } catch (err) { input.focus(); }
                        }
                      }}
                    >
                      <input
                        type="date"
                        value={formatDateForInput(startOffset)}
                        onChange={(e) => handleStartChange(task, e.target.value)}
                        disabled={isSummaryTask}
                        className={`w-full h-full bg-transparent pl-2 pr-6 outline-none focus:ring-1 focus:ring-blue-400 text-xs font-mono border-none pointer-events-auto ${isSummaryTask ? 'cursor-not-allowed opacity-50 bg-slate-50' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {!isSummaryTask && (
                        <CalendarDays size={12} className="absolute right-1.5 text-slate-300 group-hover/date:text-blue-500 pointer-events-none transition-colors" />
                      )}
                    </div>
                  </td>
                  {/* 结束时间编辑单元格 */}
                  <td className="p-0 border border-slate-300 h-8">
                    <div 
                      className={`relative w-full h-full flex items-center group/date ${isSummaryTask ? '' : 'cursor-pointer hover:bg-emerald-50/50'}`}
                      onClick={(e) => {
                        const input = e.currentTarget.querySelector('input');
                        if (input && !isSummaryTask) {
                          try { (input as any).showPicker(); } catch (err) { input.focus(); }
                        }
                      }}
                    >
                      <input
                        type="date"
                        value={formatDateForInput(finishOffset)}
                        onChange={(e) => handleEndChange(task, e.target.value)}
                        disabled={isSummaryTask}
                        className={`w-full h-full bg-transparent pl-2 pr-6 outline-none focus:ring-1 focus:ring-emerald-400 text-xs font-mono border-none pointer-events-auto ${isSummaryTask ? 'cursor-not-allowed opacity-50 bg-slate-50' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {!isSummaryTask && (
                        <CalendarDays size={12} className="absolute right-1.5 text-slate-300 group-hover/date:text-emerald-500 pointer-events-none transition-colors" />
                      )}
                    </div>
                  </td>
                  <td className="p-0 border border-slate-300 h-8 text-center font-bold text-slate-600 bg-slate-50">
                    {task.duration}
                  </td>
                  <td className="p-0 border border-slate-300 h-8">
                    <div className="w-full h-full flex items-center px-1 text-slate-500">
                      {isSummaryTask ? "汇总" : (
                        <select value={task.type} onChange={(e) => handleTypeChange(task, e.target.value as LinkType)} className="w-full h-full bg-transparent text-xs outline-none cursor-pointer border-none appearance-none focus:ring-1 focus:ring-blue-400">
                          <option value={LinkType.Real}>实工作</option>
                          <option value={LinkType.Virtual}>虚工作</option>
                          <option value={LinkType.Wavy}>里程碑</option>
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="p-0 border border-slate-300 h-8 relative group/pred">
                    {!isSummaryTask && (
                      <>
                        <input type="text" value={task.predecessors.join(',')} onChange={(e) => handlePredecessorsTextChange(task, e.target.value)} className="w-full h-full bg-transparent px-1 outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 text-slate-600 text-[11px]" />
                        <button onClick={() => setLinkModalTaskId(task.id)} className="opacity-0 group-hover/pred:opacity-100 absolute right-0 top-0 bottom-0 bg-slate-100 hover:bg-blue-100 text-slate-400 hover:text-blue-600 px-1 border-l border-slate-200"><LinkIcon size={12} /></button>
                      </>
                    )}
                  </td>
                  <td className="p-0 border border-slate-300 h-8 text-center bg-white">
                    <button onClick={() => onDeleteTask(task.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash size={13} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {isWpsModalOpen && (
        <div className="absolute inset-0 z-50 bg-slate-900/10 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-md flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 rounded-t-lg">
              <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2">Excel 交互</h4>
              <button onClick={() => setIsWpsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <button onClick={handleDownloadExcel} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 font-bold transition">导出为 Excel (.xlsx)</button>
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition group">
                <Upload size={24} className="text-slate-400 group-hover:text-emerald-500 mb-2" />
                <p className="text-sm font-bold text-slate-600">点击上传 Excel 文件导入</p>
                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleUploadExcel} />
              </div>
            </div>
          </div>
        </div>
      )}

      {linkModalTaskId && editingTask && (
        <div className="absolute inset-0 z-50 bg-slate-900/10 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-sm flex flex-col max-h-[80%] animate-in fade-in zoom-in duration-200">
            <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-lg">
              <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><LinkIcon size={14} className="text-blue-500" /> 设置紧前工作</h4>
              <button onClick={() => setLinkModalTaskId(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-2 flex-1 overflow-y-auto">
              {tasks.filter(t => t.id !== editingTask.id && !t.isSummary).map(t => {
                const isSelected = editingTask.predecessors.includes(t.id);
                return (
                  <div key={t.id} onClick={() => togglePredecessor(editingTask, t.id)} className={`flex items-center gap-2 p-2 rounded cursor-pointer mb-1 border transition-all ${isSelected ? 'bg-blue-50 border-blue-200 shadow-sm' : 'hover:bg-slate-50 border-transparent text-slate-500'}`}>
                    {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-slate-300" />}
                    <div className="flex-1 truncate text-xs font-medium"><span className="bg-slate-200 rounded px-1 mr-1 text-[10px]">{t.id}</span>{t.name}</div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 border-t bg-slate-50 rounded-b-lg flex justify-end">
              <button onClick={() => setLinkModalTaskId(null)} className="bg-blue-600 text-white text-xs px-4 py-2 rounded shadow hover:bg-blue-700 transition font-bold">完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleTable;