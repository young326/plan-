import React, { useRef, useState } from 'react';
import { Project, Task, User, ProjectVisibility } from '../types';
import { FolderOpen, Plus, Save, Upload, Trash2, Undo, Redo, FileSpreadsheet, Clipboard, X, Shield, Lock, Eye, Users } from 'lucide-react';
import { parseScheduleFromText } from '../services/geminiService';
import * as XLSX from 'xlsx';

interface ProjectListProps {
  projects: Project[];
  currentUser: User;
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onAddProject: () => void;
  onDeleteProject: (id: string) => void;
  onImportProject: (tasks: Task[], startDate?: number) => void;
  onLoadProject: (project: Project) => void;
  onRenameProject: (id: string, newName: string) => void;
  onUpdateVisibility: (id: string, visibility: ProjectVisibility) => void;
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
  currentUser,
  activeProjectId, 
  onSelectProject, 
  onAddProject, 
  onDeleteProject,
  onImportProject,
  onLoadProject,
  onRenameProject,
  onUpdateVisibility,
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
    e.stopPropagation(); 
    if (currentUser.role !== 'admin' && project.ownerId !== currentUser.id) return;
    setEditingId(project.id); 
    setEditName(project.name);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) onRenameProject(editingId, editName.trim());
    setEditingId(null);
  };

  const getVisibilityIcon = (v: ProjectVisibility) => {
    switch(v) {
      // Fix: Removed 'title' prop from Lucide components as it is not part of LucideProps. Tooltips are handled by the parent button's title.
      case 'private': return <Lock size={10} />;
      case 'public-read': return <Eye size={10} />;
      case 'public-edit': return <Users size={10} />;
    }
  };

  const toggleVisibility = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (currentUser.role !== 'admin' && project.ownerId !== currentUser.id) return;
    
    const cycle: ProjectVisibility[] = ['private', 'public-read', 'public-edit'];
    const currentIdx = cycle.indexOf(project.visibility);
    const nextVisibility = cycle[(currentIdx + 1) % cycle.length];
    onUpdateVisibility(project.id, nextVisibility);
  };

  return (
    <div className="h-full flex flex-col bg-transparent relative">
      {/* Header section with light glass effect */}
      <div className="p-5 bg-white/10 border-b border-white/20 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">工程枢纽中心</h2>
          <div className="flex gap-1">
             <button onClick={onUndo} disabled={!canUndo} className="p-1.5 rounded-lg text-slate-600 hover:bg-white/40 disabled:opacity-20 transition" title="撤销">
              <Undo size={14} />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className="p-1.5 rounded-lg text-slate-600 hover:bg-white/40 disabled:opacity-20 transition" title="重做">
              <Redo size={14} />
            </button>
            <div className="w-px h-4 bg-slate-400/20 mx-1 self-center"></div>
             <button onClick={onSaveToServer} disabled={isSaving} className={`p-1.5 rounded-lg transition ${isSaving ? 'text-blue-500 animate-pulse' : 'text-slate-600 hover:bg-white/40 hover:text-blue-600'}`} title="保存到云端">
              <Save size={14} />
            </button>
             <button onClick={() => jsonInputRef.current?.click()} className="p-1.5 rounded-lg text-slate-600 hover:bg-white/40 hover:text-blue-600 transition" title="导入项目">
              <Upload size={14} />
            </button>
            <input type="file" ref={jsonInputRef} onChange={handleJsonUpload} className="hidden" accept=".json" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onAddProject} className="liquid-button flex items-center justify-center gap-2 bg-slate-900 text-white p-2.5 rounded-xl text-[10px] font-black hover:bg-slate-800 transition shadow-lg uppercase tracking-wider">
            <Plus size={14} /> 新建项目
          </button>
           <button onClick={() => setShowPasteModal(true)} className="liquid-button flex items-center justify-center gap-2 bg-indigo-600 text-white p-2.5 rounded-xl text-[10px] font-black hover:bg-indigo-700 transition shadow-lg uppercase tracking-wider">
            <Clipboard size={14} /> 粘贴导入
          </button>
        </div>
        <button onClick={() => fileInputRef.current?.click()} className="liquid-button w-full flex items-center justify-center gap-2 bg-white/40 border border-white/60 text-slate-900 p-2 rounded-xl text-[10px] hover:bg-white/60 transition shadow-sm font-black uppercase tracking-wider">
            <FileSpreadsheet size={14} /> Excel 智能审计导入
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx,.xls,.csv,.txt" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {projects.length === 0 && (
          <div className="text-center text-slate-500 text-xs mt-10 font-bold opacity-50">暂无可查看的项目卡片</div>
        )}
        {projects.map((project) => {
          const isOwner = project.ownerId === currentUser.id;
          const isAdmin = currentUser.role === 'admin';
          const canManage = isOwner || isAdmin;

          return (
            <div
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              className={`group glass-card flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all select-none border-white/50 ${
                activeProjectId === project.id ? 'ring-2 ring-blue-500/50 bg-white/50 shadow-xl scale-[1.02]' : 'hover:scale-[1.01]'
              }`}
            >
              <div className="flex items-center gap-4 overflow-hidden flex-1">
                <div className="relative">
                    <div className={`p-2.5 rounded-xl ${activeProjectId === project.id ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" : "bg-white/40 text-slate-500"}`}>
                        <FolderOpen size={18} />
                    </div>
                    {isOwner && <div className="absolute -top-1 -right-1 bg-emerald-500 w-3 h-3 rounded-full border-2 border-white shadow-sm"></div>}
                </div>
                <div className="flex flex-col truncate flex-1">
                  {editingId === project.id ? (
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={saveEdit} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} onClick={(e) => e.stopPropagation()} autoFocus className="text-xs font-black border-2 border-blue-400 rounded-lg px-2 py-1 outline-none w-full bg-white/80" />
                  ) : (
                    <div className="flex items-center gap-2 overflow-hidden">
                        <span className={`text-xs font-black truncate ${activeProjectId === project.id ? 'text-slate-900' : 'text-slate-700'}`} onDoubleClick={(e) => startEditing(e, project)}>
                            {project.name}
                        </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[9px] text-slate-500 font-bold">
                    <span className="flex items-center gap-1 bg-white/30 px-2 py-0.5 rounded-full border border-white/40">
                        {isOwner ? '我的' : (project.ownerName || '匿名')}
                    </span>
                    <button 
                        onClick={(e) => toggleVisibility(e, project)}
                        // Fix: Moved the tooltip title to the button element as Lucide icon components do not support a 'title' prop in LucideProps.
                        title={project.visibility === 'private' ? '仅自己可见' : project.visibility === 'public-read' ? '全员只读' : '全员可编辑'}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/40 transition-all ${canManage ? 'hover:bg-blue-500 hover:text-white' : ''}`}
                    >
                        {getVisibilityIcon(project.visibility)}
                        <span className="capitalize">{project.visibility.split('-').pop()}</span>
                    </button>
                  </div>
                </div>
              </div>
              {canManage && (
                <button onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }} className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 hover:bg-white/60 rounded-xl transition-all">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      
      {showPasteModal && (
        <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
           <div className="glass-panel rounded-3xl shadow-2xl border-white/50 w-full h-full max-h-[350px] flex flex-col animate-in fade-in zoom-in duration-300">
              <div className="p-5 border-b border-white/20 flex justify-between items-center bg-white/20">
                  <h4 className="font-black text-slate-800 flex items-center gap-3 text-xs uppercase tracking-[0.2em]">
                      <Clipboard size={18} className="text-indigo-600"/> 粘贴 EXCEL 原始数据
                  </h4>
                  <button onClick={() => setShowPasteModal(false)} className="p-2 hover:bg-white/40 rounded-full transition-colors"><X size={20}/></button>
              </div>
              <div className="flex-1 p-4 flex flex-col">
                  <textarea className="flex-1 w-full bg-white/40 border-2 border-white/60 rounded-2xl p-4 text-[11px] font-mono resize-none focus:border-indigo-500 outline-none transition-all placeholder:text-slate-500" placeholder="在此粘贴 Excel 表格数据，AI 将自动分析其逻辑结构..." value={pasteContent} onChange={e => setPasteContent(e.target.value)} autoFocus />
              </div>
              <div className="p-5 border-t border-white/20 bg-white/10 rounded-b-3xl flex justify-end gap-3">
                 <button onClick={handlePasteImport} disabled={!pasteContent.trim()} className="liquid-button bg-indigo-600 text-white px-8 py-3 rounded-2xl text-[11px] font-black hover:bg-indigo-700 shadow-xl shadow-indigo-500/20 transition uppercase disabled:opacity-50">
                    立即识别并生成图纸
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ProjectList;