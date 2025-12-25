import React, { useRef, useState } from 'react';
import { Project, Task } from '../types';
import { FolderOpen, Plus, Save, Upload, Trash2, Undo, Redo, FileSpreadsheet, CloudUpload, Download, Clipboard, X } from 'lucide-react';
import { parseScheduleFromText } from '../services/geminiService';
import * as XLSX from 'xlsx';

interface ProjectListProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onAddProject: () => void;
  onDeleteProject: (id: string) => void;
  onImportProject: (tasks: Task[], startDate?: number) => void;
  onLoadProject: (project: Project) => void;
  onRenameProject: (id: string, newName: string) => void;
  onSaveProject: () => void;
  onSaveToServer: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isLoading: boolean;
  isSaving: boolean;
  setIsLoading: (loading: boolean) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ 
  projects, 
  activeProjectId, 
  onSelectProject, 
  onAddProject, 
  onDeleteProject,
  onImportProject,
  onLoadProject,
  onRenameProject,
  onSaveProject,
  onSaveToServer,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isLoading,
  isSaving,
  setIsLoading
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteContent, setPasteContent] = useState("");

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      let text = '';
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false, dateNF: 'yyyy-mm-dd' });
        const limitedData = (jsonData as any[]).slice(0, 30);
        text = JSON.stringify(limitedData, null, 2);
      } else {
        const rawText = await file.text();
        text = rawText.substring(0, 5000);
      }
      if (!text || text.trim().length === 0) throw new Error("文件内容为空");
      const result = await parseScheduleFromText(text);
      if (result && result.tasks && result.tasks.length > 0) {
        onImportProject(result.tasks, result.projectStartDate);
      } else { alert("未能识别出有效的工作任务，请检查文件格式。"); }
    } catch (e) {
      alert("导入失败：请检查网络连接或文件内容。AI服务可能暂时繁忙。");
      console.error(e);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleJsonUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const project = JSON.parse(text);
      if (project && Array.isArray(project.tasks)) onLoadProject(project);
      else alert("无效的项目文件：缺少任务数据");
    } catch (e) { console.error(e); alert("文件解析失败"); } finally { if (jsonInputRef.current) jsonInputRef.current.value = ''; }
  };

  const handlePasteImport = async () => {
    if (!pasteContent.trim()) { setShowPasteModal(false); return; }
    setIsLoading(true); setShowPasteModal(false);
    try {
        const result = await parseScheduleFromText(pasteContent);
        if (result && result.tasks && result.tasks.length > 0) onImportProject(result.tasks, result.projectStartDate);
        else alert("无法识别任务数据");
    } catch(e) { console.error(e); alert("识别失败"); } finally { setIsLoading(false); setPasteContent(""); }
  };

  const startEditing = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation(); setEditingId(project.id); setEditName(project.name);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) onRenameProject(editingId, editName.trim());
    setEditingId(null);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative border-r border-slate-200">
      <div className="p-4 bg-slate-100 border-b border-slate-200 space-y-3">
        <div className="flex justify-between items-center pr-6">
          <h2 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">项目管理</h2>
          <div className="flex gap-0.5">
             <button onClick={onUndo} disabled={!canUndo} className="p-1 rounded text-slate-500 hover:bg-white hover:text-blue-600 disabled:opacity-20 transition" title="撤销">
              <Undo size={12} />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className="p-1 rounded text-slate-500 hover:bg-white hover:text-blue-600 disabled:opacity-20 transition" title="重做">
              <Redo size={12} />
            </button>
            <div className="w-px h-3 bg-slate-300 mx-0.5 self-center"></div>
             <button onClick={onSaveToServer} disabled={isSaving} className={`p-1 rounded transition ${isSaving ? 'text-blue-400 animate-pulse' : 'text-slate-500 hover:bg-white hover:text-blue-600'}`} title="保存">
              <Save size={12} />
            </button>
             <button onClick={() => jsonInputRef.current?.click()} className="p-1 rounded text-slate-500 hover:bg-white hover:text-blue-600 transition" title="导入">
              <Upload size={12} />
            </button>
            <input type="file" ref={jsonInputRef} onChange={handleJsonUpload} className="hidden" accept=".json" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onAddProject} className="flex items-center justify-center gap-1 bg-blue-600 text-white p-2 rounded text-[10px] font-bold hover:bg-blue-700 transition shadow-sm uppercase">
            <Plus size={12} /> 新建
          </button>
           <button onClick={() => setShowPasteModal(true)} className="flex items-center justify-center gap-1 bg-indigo-600 text-white p-2 rounded text-[10px] font-bold hover:bg-indigo-700 transition shadow-sm uppercase">
            <Clipboard size={12} /> 粘贴
          </button>
        </div>
        <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-1 bg-white border border-slate-300 text-slate-700 p-1.5 rounded text-[10px] hover:bg-slate-50 transition shadow-sm font-bold uppercase">
            <FileSpreadsheet size={12} /> 上传 EXCEL
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx,.xls,.csv,.txt" />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {projects.length === 0 && (
          <div className="text-center text-slate-400 text-xs mt-10">暂无项目</div>
        )}
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            className={`group flex items-center justify-between p-3 mb-2 rounded cursor-pointer border transition-all select-none ${
              activeProjectId === project.id ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-transparent hover:border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 overflow-hidden flex-1">
              <FolderOpen size={14} className={`shrink-0 ${activeProjectId === project.id ? "text-blue-500" : "text-slate-400"}`} />
              <div className="flex flex-col truncate flex-1">
                {editingId === project.id ? (
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={saveEdit} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} onClick={(e) => e.stopPropagation()} autoFocus className="text-xs font-medium border border-blue-400 rounded px-1 py-0.5 outline-none w-full" />
                ) : (
                  <span className={`text-xs font-bold truncate ${activeProjectId === project.id ? 'text-blue-900' : 'text-slate-700'}`} onDoubleClick={(e) => startEditing(e, project)}>
                    {project.name}
                  </span>
                )}
                <span className="text-[9px] text-slate-400">
                  {new Date(project.lastModified).toLocaleDateString()}
                </span>
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 p-1 transition-opacity">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      
      {showPasteModal && (
        <div className="absolute inset-0 z-50 bg-slate-900/10 backdrop-blur-[2px] flex items-center justify-center p-4">
           <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full h-full max-h-[300px] flex flex-col animate-in fade-in zoom-in duration-200">
              <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 rounded-t-lg">
                  <h4 className="font-bold text-slate-700 flex items-center gap-2 text-[11px] uppercase tracking-wider">
                      <Clipboard size={14} className="text-indigo-600"/> 粘贴 Excel 数据
                  </h4>
                  <button onClick={() => setShowPasteModal(false)} className="text-slate-400 hover:text-slate-600 transition"><X size={16}/></button>
              </div>
              <div className="flex-1 p-2 flex flex-col">
                  <textarea className="flex-1 w-full border border-slate-300 rounded p-2 text-[10px] font-mono resize-none focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="此处粘贴 Excel 复制的内容..." value={pasteContent} onChange={e => setPasteContent(e.target.value)} autoFocus />
              </div>
              <div className="p-3 border-t bg-slate-50 rounded-b-lg flex justify-end gap-2">
                 {/* Fix: Changed () => handlePasteImport to handlePasteImport to ensure proper execution */}
                 <button onClick={handlePasteImport} disabled={!pasteContent.trim()} className="bg-indigo-600 text-white px-4 py-1.5 rounded text-[10px] font-bold hover:bg-indigo-700 shadow-sm transition uppercase disabled:opacity-50">
                    识别生成
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ProjectList;