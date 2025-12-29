import React, { useRef, useState } from 'react';
import { Project, Task, User, ProjectVisibility } from '../types';
import { FolderOpen, Plus, Save, Upload, Trash2, Undo, Redo, Lock, Eye, Users, Download, Briefcase, Cloud, MoreHorizontal, Search } from 'lucide-react';

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
  onExportProject: () => void;
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
  onExportProject,
  onSaveToServer,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isLoading,
  isSaving,
  setIsLoading
}) => {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
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

  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Refined button styles: No background box, flat look
  const actionBtnClass = "flex flex-col items-center justify-center py-2 px-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-all group";
  const actionIconSize = 20;
  const actionIconStroke = 1.5;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      {/* Header Section - Added stronger bottom border */}
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-4">
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
                <Briefcase size={18} className="text-slate-900 dark:text-slate-100" strokeWidth={2} />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">项目列表</h2>
            </div>
            
            <div className="flex items-center gap-1">
                <button 
                  onClick={onUndo} 
                  disabled={!canUndo} 
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-30" 
                  title="撤销"
                >
                  <Undo size={16} />
                </button>
                <button 
                  onClick={onRedo} 
                  disabled={!canRedo} 
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-30" 
                  title="重做"
                >
                  <Redo size={16} />
                </button>
            </div>
        </div>
        
        {/* Unified Action Grid - Flat Style */}
        <div className="grid grid-cols-4 gap-1">
            <button onClick={onAddProject} className={actionBtnClass} title="新建项目">
                <Plus size={actionIconSize} strokeWidth={actionIconStroke} className="mb-1" />
                <span className="text-[11px] font-medium">新建</span>
            </button>

            <button onClick={onSaveToServer} disabled={isSaving} className={`${actionBtnClass} ${isSaving ? 'opacity-70' : ''}`} title="保存云端">
                 {isSaving ? <span className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full mb-1"></span> : <Cloud size={actionIconSize} strokeWidth={actionIconStroke} className="mb-1" />}
                <span className="text-[11px] font-medium">保存</span>
            </button>

            <button onClick={() => jsonInputRef.current?.click()} className={actionBtnClass} title="导入项目">
                <Upload size={actionIconSize} strokeWidth={actionIconStroke} className="mb-1" />
                <span className="text-[11px] font-medium">导入</span>
            </button>

            <button onClick={onExportProject} className={actionBtnClass} title="导出项目">
                <Download size={actionIconSize} strokeWidth={actionIconStroke} className="mb-1" />
                <span className="text-[11px] font-medium">导出</span>
            </button>
        </div>

        {/* Search */}
        <div className="relative mt-2">
             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
             <input 
                type="text" 
                placeholder="搜索项目..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 outline-none focus:border-blue-500 transition-colors"
             />
        </div>

        <input type="file" ref={jsonInputRef} onChange={handleJsonUpload} className="hidden" accept=".json,.itp" />
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {filteredProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-600">
             <FolderOpen size={24} strokeWidth={1} className="opacity-50 mb-2" />
             <p className="text-xs font-medium">暂无项目</p>
          </div>
        )}
        
        {filteredProjects.map((project) => {
          const isOwner = project.ownerId === currentUser.id;
          const isAdmin = currentUser.role === 'admin';
          const canManage = isOwner || isAdmin;
          const isActive = activeProjectId === project.id;

          return (
            <div
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              className={`
                 group relative rounded-lg border transition-all duration-200 cursor-pointer select-none
                 shadow-sm hover:shadow-md
                 ${isActive 
                    ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800' 
                    : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700/50 hover:border-slate-200 dark:hover:border-slate-600'}
              `}
            >
              <div className="p-2.5 flex items-center gap-3">
                 {/* Icon - Consistent Size, No Background Box */}
                 <div className={`
                    shrink-0 transition-colors
                    ${isActive 
                        ? 'text-blue-600 dark:text-blue-400' 
                        : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-500'}
                 `}>
                    <FolderOpen size={actionIconSize} strokeWidth={actionIconStroke} />
                 </div>

                 {/* Content */}
                 <div className="flex-1 min-w-0">
                    {editingId === project.id ? (
                        <input 
                           autoFocus
                           className="w-full bg-white dark:bg-slate-900 border border-blue-500 rounded px-1.5 py-0.5 text-xs font-medium outline-none mb-1 text-slate-900 dark:text-white"
                           value={editName}
                           onChange={(e) => setEditName(e.target.value)}
                           onBlur={saveEdit}
                           onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                           onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <div className="flex justify-between items-center">
                             <h3 
                                title={project.name}
                                onDoubleClick={(e) => startEditing(e, project)}
                                className={`text-xs font-medium truncate pr-2 ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-900'}`}
                             >
                                {project.name}
                             </h3>
                        </div>
                    )}
                    
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                             {isOwner ? '我' : project.ownerName}
                        </span>
                        
                        <button 
                           onClick={(e) => toggleVisibility(e, project)}
                           className={`flex items-center gap-1 text-[10px] px-1 py-0.5 rounded transition-colors ${
                                project.visibility === 'private' 
                                ? 'text-slate-400 hover:text-slate-600' 
                                : project.visibility === 'public-edit'
                                    ? 'text-emerald-500 hover:text-emerald-600'
                                    : 'text-blue-500 hover:text-blue-600'
                           }`}
                        >
                            {getVisibilityIcon(project.visibility)}
                        </button>
                    </div>
                 </div>
              </div>

              {/* Hover Actions */}
              {canManage && (
                 <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 transition-colors"
                    >
                        <Trash2 size={13} />
                    </button>
                 </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProjectList;