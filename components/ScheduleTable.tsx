import React, { useState, useRef, useMemo } from 'react';
import { Task, LinkType } from '../types';
import { Plus, Trash, AlertCircle, Link as LinkIcon, X, CheckSquare, Square, Folder, CornerDownRight, FileSpreadsheet, Download, Upload, ChevronRight, ChevronDown } from 'lucide-react';
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

  const formatDateForInput = (offset?: number) => {
    if (offset === undefined) return '';
    const start = new Date(projectStartDate);
    start.setHours(0,0,0,0);
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  };

  const getDaysFromDateStr = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const start = new Date(projectStartDate);
    start.setHours(0,0,0,0);
    return Math.round((target.getTime() - start.getTime()) / (1000 * 3600 * 24));
  };

  const handleStartChange = (task: Task, dateStr: string) => {
    if (!dateStr) {
      const { constraintDate, ...rest } = task;
      onUpdateTask(rest);
      return;
    }
    const newStart = getDaysFromDateStr(dateStr);
    const currentFinish = task.earlyFinish || (newStart + task.duration);
    const newDuration = Math.max(0, currentFinish - newStart);
    onUpdateTask({ ...task, constraintDate: newStart, duration: newDuration });
  };

  const handleEndChange = (task: Task, dateStr: string) => {
    if (!dateStr) return;
    const selectedFinishOffset = getDaysFromDateStr(dateStr) + 1;
    const currentStart = task.earlyStart || 0;
    const newDuration = Math.max(0, selectedFinishOffset - currentStart);
    onUpdateTask({ ...task, duration: newDuration });
  };

  const handlePredecessorsTextChange = (task: Task, text: string) => {
    const preds = text.split(/[,，\s]+/).filter(id => id.trim() !== '');
    onUpdateTask({ ...task, predecessors: preds });
  };

  const handleTypeChange = (task: Task, newType: LinkType) => {
    let updates: Partial<Task> = { type: newType };
    if (newType === LinkType.Wavy) updates.duration = 1;
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

  const typeMap: Record<string, string> = { [LinkType.Real]: "实工作", [LinkType.Virtual]: "虚工作", [LinkType.Wavy]: "里程碑" };
  const reverseTypeMap: Record<string, LinkType> = { "实工作": LinkType.Real, "虚工作": LinkType.Virtual, "里程碑": LinkType.Wavy };

  const handleDownloadExcel = () => {
     const data = tasks.map(t => ({ "代号": t.id, "工作名称": t.name, "工期": t.duration, "区域": t.zone || "", "类型": typeMap[t.type] || "实工作", "紧前工作": t.predecessors ? t.predecessors.join(',') : "", "备注": t.description || "", "父工作ID": t.parentId || "", "开始时间(参考)": formatDateForInput(t.earlyStart), "结束时间(参考)": formatDateForInput(t.earlyFinish ? t.earlyFinish - 1 : t.earlyStart) }));
     const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "进度计划"); XLSX.writeFile(wb, `Schedule_${new Date().toLocaleDateString().replace(/\//g,'-')}.xlsx`);
  };

  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return;
      try {
          const data = await file.arrayBuffer(); const workbook = XLSX.read(data); const firstSheetName = workbook.SheetNames[0]; const worksheet = workbook.Sheets[firstSheetName]; const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
          if (!Array.isArray(jsonData) || jsonData.length === 0) { alert("文件内容为空或格式不正确"); return; }
          const findVal = (row: any, candidates: string[]): string => { const keys = Object.keys(row); for (const candidate of candidates) { const found = keys.find(k => k.trim().toLowerCase() === candidate.toLowerCase()); if (found) return String(row[found] || ""); } return ""; };
          const newTasks: Task[] = jsonData.map((row: any) => {
              const id = findVal(row, ["代号", "ID", "Code"]) || Math.random().toString(36).substr(2, 5);
              const name = findVal(row, ["工作名称", "名称", "Name"]) || "未命名";
              let duration = parseInt(findVal(row, ["工期", "Duration"])) || 0;
              const zone = findVal(row, ["区域", "分区", "Zone"]);
              const parentId = findVal(row, ["父工作ID", "ParentID"]);
              let typeStr = findVal(row, ["类型", "Type"]);
              const type = reverseTypeMap[typeStr] || LinkType.Real;
              const predsRaw = findVal(row, ["紧前工作", "Predecessors"]);
              const predecessors = predsRaw.split(/[,，\s]+/).filter((s: string) => s.trim() !== "");
              const desc = findVal(row, ["备注", "Description"]);
              return { id, name, duration, type, zone, predecessors, description: desc, parentId: parentId || undefined };
          });
          onReplaceTasks(newTasks); setIsWpsModalOpen(false); alert(`成功导入 ${newTasks.length} 项工作任务`);
      } catch (err) { console.error(err); alert("导入失败"); } finally { if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  return (
    <div className="h-full flex flex-col bg-white relative">
      <div className="flex items-center justify-between p-2 bg-slate-100 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-700 text-sm">工程进度计划表</h3>
            <div className="h-4 w-px bg-slate-300 mx-1"></div>
            <button onClick={() => setIsWpsModalOpen(true)} className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded hover:bg-emerald-100 transition-colors">
                <FileSpreadsheet size={12} /> WPS 表格编辑
            </button>
        </div>
        <button onClick={onAddTask} className="flex items-center gap-1 text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700">
          <Plus size={12} /> 新建工作
        </button>
      </div>
      
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs text-left border-collapse min-w-[750px] border border-slate-200 table-fixed">
          <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm text-slate-700">
            <tr>
              <th className="p-1 border border-slate-300 font-semibold w-12 text-center bg-slate-100">代号</th>
              <th className="p-1 border border-slate-300 font-semibold w-20 bg-slate-100">区域</th>
              <th className="p-1 border border-slate-300 font-semibold w-48 bg-slate-100">工作名称</th>
              <th className="p-1 border border-slate-300 font-semibold w-24 bg-slate-100 text-blue-600">开始时间</th>
              <th className="p-1 border border-slate-300 font-semibold w-24 bg-slate-100 text-blue-600">结束时间</th>
              <th className="p-1 border border-slate-300 font-semibold w-12 text-center bg-slate-100">工期</th>
              <th className="p-1 border border-slate-300 font-semibold w-16 bg-slate-100">类型</th>
              <th className="p-1 border border-slate-300 font-semibold w-24 bg-slate-100">紧前</th>
              <th className="p-1 border border-slate-300 font-semibold w-10 text-center bg-slate-100">操作</th>
            </tr>
          </thead>
          <tbody>
            {flattenedTasks.map(({ task, level }) => {
              const displayEndOffset = (task.earlyFinish || 0) > (task.earlyStart || 0) ? (task.earlyFinish || 0) - 1 : (task.earlyFinish || 0);
              const isSummary = task.isSummary; 
              return (
              <tr key={task.id} className={`hover:bg-blue-50/30 group ${task.isCritical ? 'bg-red-50/10' : 'bg-white'} ${isSummary ? 'font-semibold bg-slate-50' : ''}`}>
                <td className="p-0 border border-slate-300 h-8">
                  <input type="text" value={task.id} onChange={(e) => onUpdateTask({ ...task, id: e.target.value })} className="w-full h-full bg-transparent px-1 text-center outline-none focus:bg-blue-50" />
                </td>
                <td className="p-0 border border-slate-300 h-8">
                  <input type="text" value={task.zone || ''} onChange={(e) => onUpdateTask({ ...task, zone: e.target.value })} className="w-full h-full bg-transparent px-1 outline-none focus:bg-blue-50 text-slate-600" />
                </td>
                <td className="p-0 border border-slate-300 h-8">
                  <div className="flex items-center h-full" style={{ paddingLeft: level * 16 + 4 }}>
                    {isSummary ? (
                        <button onClick={(e) => { e.stopPropagation(); toggleCollapse(task); }} className="mr-1 text-slate-500 hover:text-blue-600">
                            {task.isCollapsed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}
                        </button>
                    ) : <div className="w-3.5 mr-1" /> }
                    <input type="text" value={task.name} onKeyDown={(e) => handleKeyDown(e, task)} onChange={(e) => onUpdateTask({ ...task, name: e.target.value })} className={`w-full h-full bg-transparent outline-none focus:bg-blue-50 ${isSummary ? 'text-slate-800' : 'text-slate-700'}`} />
                  </div>
                </td>
                <td className="p-0 border border-slate-300 h-8">
                  <input type="date" value={formatDateForInput(task.earlyStart)} onChange={(e) => handleStartChange(task, e.target.value)} disabled={!!isSummary} className="w-full h-full bg-white px-1 outline-none focus:ring-1 focus:ring-blue-500 text-xs font-mono border-none" />
                </td>
                <td className="p-0 border border-slate-300 h-8">
                  <input type="date" value={formatDateForInput(displayEndOffset)} onChange={(e) => handleEndChange(task, e.target.value)} disabled={!!isSummary} className="w-full h-full bg-white px-1 outline-none focus:ring-1 focus:ring-blue-500 text-xs font-mono border-none" />
                </td>
                <td className="p-0 border border-slate-300 h-8">
                  <input type="number" min="0" value={task.duration} onChange={(e) => onUpdateTask({ ...task, duration: parseInt(e.target.value) || 0 })} className="w-full h-full bg-slate-50 px-1 text-center outline-none focus:bg-blue-50 text-slate-600" disabled={!!isSummary} />
                </td>
                <td className="p-0 border border-slate-300 h-8">
                   <div className="w-full h-full flex items-center px-1 text-slate-500">
                      {isSummary ? "汇总" : (
                         <select value={task.type} onChange={(e) => handleTypeChange(task, e.target.value as LinkType)} className="w-full h-full bg-transparent text-xs outline-none cursor-pointer border-none appearance-none">
                            <option value={LinkType.Real}>实工作</option>
                            <option value={LinkType.Virtual}>虚工作</option>
                            <option value={LinkType.Wavy}>里程碑</option>
                        </select>
                      )}
                   </div>
                </td>
                <td className="p-0 border border-slate-300 h-8 relative group/pred">
                   {!isSummary && (
                       <>
                           <input type="text" value={task.predecessors.join(',')} onChange={(e) => handlePredecessorsTextChange(task, e.target.value)} className="w-full h-full bg-transparent px-1 outline-none focus:bg-blue-50 text-slate-600 text-[11px]" />
                           <button onClick={() => setLinkModalTaskId(task.id)} className="opacity-0 group-hover/pred:opacity-100 absolute right-0 top-0 bottom-0 bg-slate-100 hover:bg-blue-100 text-slate-400 hover:text-blue-600 px-1 border-l border-slate-200"><LinkIcon size={12} /></button>
                       </>
                   )}
                </td>
                <td className="p-0 border border-slate-300 h-8 text-center bg-white">
                  <button onClick={() => onDeleteTask(task.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash size={13} /></button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {isWpsModalOpen && (
          <div className="absolute inset-0 z-50 bg-slate-900/10 backdrop-blur-[2px] flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-md flex flex-col animate-in fade-in zoom-in duration-200">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 rounded-t-lg">
                      <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><FileSpreadsheet size={18} className="text-emerald-600"/> 在 WPS / Excel 中编辑</h4>
                      <button onClick={() => setIsWpsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
                  </div>
                  <div className="p-6 space-y-6">
                      <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                          <div className="flex-1">
                              <h5 className="text-sm font-bold text-slate-700 mb-1">下载进度计划表</h5>
                              <button onClick={handleDownloadExcel} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded text-xs hover:bg-slate-50 hover:text-blue-600 transition shadow-sm"><Download size={14}/> 下载文件</button>
                          </div>
                      </div>
                      <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                          <div className="flex-1">
                              <h5 className="text-sm font-bold text-slate-700 mb-1">上传修改后的文件</h5>
                              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition group">
                                  <Upload size={24} className="text-slate-400 group-hover:text-emerald-500 mb-1"/>
                                  <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleUploadExcel} />
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {linkModalTaskId && editingTask && (
        <div className="absolute inset-0 z-50 bg-slate-900/10 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-sm flex flex-col max-h-[80%] animate-in fade-in zoom-in duration-200">
            <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-lg">
              <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><LinkIcon size={14} className="text-blue-500"/> 设置紧前工作</h4>
              <button onClick={() => setLinkModalTaskId(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-2 flex-1 overflow-y-auto">
              {tasks.filter(t => t.id !== editingTask.id && !t.isSummary).map(t => {
                 const isSelected = editingTask.predecessors.includes(t.id);
                 return (
                   <div key={t.id} onClick={() => togglePredecessor(editingTask, t.id)} className={`flex items-center gap-2 p-2 rounded cursor-pointer mb-1 border transition-all ${isSelected ? 'bg-blue-50 border-blue-200 shadow-sm' : 'hover:bg-slate-50 border-transparent text-slate-500'}`}>
                     {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-slate-300" />}
                     <div className="flex-1 overflow-hidden"><div className="font-medium text-xs truncate"><span className="inline-block bg-slate-200 rounded px-1.5 py-0.5 mr-1.5 text-[10px] text-slate-600 font-mono">{t.id}</span>{t.name}</div></div>
                   </div>
                 );
              })}
            </div>
            <div className="p-3 border-t border-slate-100 flex justify-end bg-slate-50/50 rounded-b-lg">
              <button onClick={() => setLinkModalTaskId(null)} className="bg-blue-600 text-white text-xs px-4 py-2 rounded shadow hover:bg-blue-700 transition-colors font-medium">完成设置</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleTable;
