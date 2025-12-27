
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Project, Task, LinkType, Annotation, User, SyncMessage, ProjectVisibility } from './types';
import ProjectList from './components/ProjectList';
import ScheduleTable from './components/ScheduleTable';
import { NetworkDiagram } from './components/NetworkDiagram';
import AIAssistant from './components/AIAssistant';
import Auth from './components/Auth';
import VersionModal from './components/VersionModal';
import ManagementConsole from './components/ManagementConsole';
import { Undo, Redo, CloudCheck, Loader2, ChevronLeft, PanelLeftOpen, Columns, Share2, Globe, LogOut, Users, Download, Zap, HardHat, X, ShieldAlert, Settings, Info } from 'lucide-react';

const SYNC_CHANNEL = 'intelliplan_sync_v1';
const CURRENT_VERSION = 'v2.6.0';

const App: React.FC = () => {
  // 从本地存储初始化用户，如果不存在则为 null (显示登录页)
  const [user, setUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('intelliplan_user');
      if (savedUser) {
        return JSON.parse(savedUser);
      }
    } catch (e) {
      console.error("Failed to parse user from local storage", e);
    }
    return null;
  });

  const initialProject: Project = { 
    id: '1', 
    name: 'XX机场航站区安装施工总进度计划', 
    lastModified: Date.now(),
    startDate: new Date().setHours(0,0,0,0) - (2 * 24 * 60 * 60 * 1000), 
    annotations: [], 
    zoneOrder: ['区域一', '区域二', '区域三', '区域四'],
    ownerId: '18663187732',
    ownerName: '系统管理员',
    visibility: 'public-edit',
    tasks: [
      { id: '10', name: '施工准备', duration: 20, completion: 100, predecessors: [], type: LinkType.Real, zone: '区域一' },
      { id: '20', name: '测量放线', duration: 92, completion: 85, predecessors: ['10'], type: LinkType.Real, zone: '区域一' },
      { id: '30', name: '切槽配管1', duration: 30, completion: 30, predecessors: ['20'], type: LinkType.Real, zone: '区域一' },
      { id: '40', name: '灯箱安装1', duration: 90, completion: 0, predecessors: ['30'], type: LinkType.Real, zone: '区域一' },
      { id: '50', name: '电缆敷设及接头制作', duration: 100, completion: 0, predecessors: ['40'], type: LinkType.Real, zone: '区域一' },
      { id: '60', name: '弱电系统受压', duration: 30, completion: 0, predecessors: ['50'], type: LinkType.Real, zone: '区域一' },
      { id: '70', name: '灯具安装', duration: 30, completion: 0, predecessors: ['60'], type: LinkType.Real, zone: '区域一' },
      { id: '240', name: '竣工验收', duration: 0, completion: 0, predecessors: ['70'], type: LinkType.Wavy, zone: '区域四' },
    ] 
  };

  const [history, setHistory] = useState<Project[][]>(() => {
    try {
      const saved = localStorage.getItem('intelliPlan_projects');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return [parsed];
      }
    } catch (e) { console.error(e); }
    return [[initialProject]];
  });
  const [historyIndex, setHistoryIndex] = useState(0);
  const projects = history[historyIndex];
  
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [isMgmtConsoleOpen, setIsMgmtConsoleOpen] = useState(false);

  const visibleProjects = useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return projects;
    return projects.filter(p => {
      if (p.ownerId === user.id) return true;
      if (p.visibility === 'private') return false;
      return true;
    });
  }, [projects, user]);

  const [activeProjectId, setActiveProjectId] = useState<string>(visibleProjects[0]?.id || '1');

  // Stable BroadcastChannel
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!broadcastChannelRef.current) {
      broadcastChannelRef.current = new BroadcastChannel(SYNC_CHANNEL);
    }
    const bc = broadcastChannelRef.current;

    const handleSync = (event: MessageEvent<SyncMessage>) => {
      if (event.data.senderId === user?.id) return;
      if (event.data.type === 'UPDATE_PROJECT') {
        const updatedProjects = event.data.payload as Project[];
        setHistory(prev => {
          const next = [...prev];
          if (historyIndex >= 0 && historyIndex < next.length) {
            next[historyIndex] = updatedProjects;
          }
          return next;
        });
      }
    };

    bc.addEventListener('message', handleSync);
    return () => {
      bc.removeEventListener('message', handleSync);
    };
  }, [user?.id, historyIndex]);

  useEffect(() => {
    return () => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
    };
  }, []);

  const pushUpdate = useCallback((newProjects: Project[]) => {
    if (!user || !broadcastChannelRef.current) return;
    try {
      broadcastChannelRef.current.postMessage({
        type: 'UPDATE_PROJECT',
        projectId: activeProjectId,
        payload: newProjects,
        senderId: user.id
      });
    } catch (err) {
      broadcastChannelRef.current = new BroadcastChannel(SYNC_CHANNEL);
      broadcastChannelRef.current.postMessage({
        type: 'UPDATE_PROJECT',
        projectId: activeProjectId,
        payload: newProjects,
        senderId: user.id
      });
    }
  }, [user, activeProjectId]);

  const [leftWidth, setLeftWidth] = useState(260);
  const [middleWidth, setMiddleWidth] = useState(420);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isMiddleCollapsed, setIsMiddleCollapsed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

  const activeProject = useMemo(() => {
    return projects.find(p => p.id === activeProjectId) || visibleProjects[0] || initialProject;
  }, [projects, activeProjectId, visibleProjects, initialProject]);

  const canEditActiveProject = useMemo(() => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (activeProject.ownerId === user.id) return true;
    return activeProject.visibility === 'public-edit';
  }, [user, activeProject]);

  const handleExportFullProject = () => {
    // 导出包含所有元数据的数据包
    const exportData = {
      ...activeProject,
      exportDate: new Date().toISOString(),
      version: CURRENT_VERSION,
      system: 'IntelliPlan AI'
    };
    const data = JSON.stringify(exportData, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.name}_${new Date().toISOString().split('T')[0]}.itp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const calculatedTasks = useMemo(() => {
    if (!activeProject || !activeProject.tasks) return [];
    const _tasks = JSON.parse(JSON.stringify(activeProject.tasks)) as Task[];
    const taskMap = new Map(_tasks.map(t => [t.id, t]));
    _tasks.forEach(t => { t.isSummary = _tasks.some(child => child.parentId === t.id); });

    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 100;

    while(changed && iterations < MAX_ITERATIONS) {
      changed = false;
      iterations++;
      _tasks.forEach(task => {
        if (task.isSummary) return;
        let maxES = 0;
        task.predecessors.forEach(pid => {
          const p = taskMap.get(pid);
          if (p && p.earlyFinish !== undefined) maxES = Math.max(maxES, p.earlyFinish);
        });
        if (task.constraintDate !== undefined) maxES = Math.max(maxES, task.constraintDate);
        if (task.earlyStart !== maxES) { 
          task.earlyStart = maxES; 
          task.earlyFinish = maxES + task.duration; 
          changed = true; 
        }
      });
    }
    _tasks.forEach(t => {
        const totalFloat = (t.lateStart || 0) - (t.earlyStart || 0);
        t.isCritical = Math.abs(totalFloat) < 0.001 && !t.isSummary;
    });
    return _tasks;
  }, [activeProject.tasks]);

  const updateProjectsWithHistory = (newProjects: Project[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newProjects);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    pushUpdate(newProjects);
    localStorage.setItem('intelliPlan_projects', JSON.stringify(newProjects));
  };

  const handleUpdateTasks = (newTasks: Task[]) => {
    if (!canEditActiveProject) return;
    const updatedProjects = projects.map(p => p.id === activeProjectId ? { ...p, tasks: newTasks, lastModified: Date.now() } : p);
    updateProjectsWithHistory(updatedProjects);
  };

  const handleUpdateZoneOrder = (newOrder: string[]) => {
    if (!canEditActiveProject) return;
    const updatedProjects = projects.map(p => p.id === activeProjectId ? { ...p, zoneOrder: newOrder, lastModified: Date.now() } : p);
    updateProjectsWithHistory(updatedProjects);
  };

  const handleUpdateVisibility = (projectId: string, visibility: ProjectVisibility) => {
    const updatedProjects = projects.map(p => p.id === projectId ? { ...p, visibility, lastModified: Date.now() } : p);
    updateProjectsWithHistory(updatedProjects);
  };

  const handleDeleteProject = (id: string) => {
    const updatedProjects = projects.filter(p => p.id !== id);
    if (activeProjectId === id) {
      const nextVisible = visibleProjects.find(p => p.id !== id);
      if (nextVisible) setActiveProjectId(nextVisible.id);
    }
    updateProjectsWithHistory(updatedProjects);
  };

  const handleAddNewProject = (newPrj: Project) => {
    updateProjectsWithHistory([...projects, newPrj]);
    setActiveProjectId(newPrj.id);
  };

  const handleLogout = () => {
    localStorage.removeItem('intelliplan_user');
    setUser(null);
  };

  if (!user) return <Auth onLogin={(u) => {
    localStorage.setItem('intelliplan_user', JSON.stringify(u));
    setUser(u);
  }} />;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden p-3 sm:p-5 gap-3 sm:gap-5">
      <header className="h-16 glass-panel rounded-[1.25rem] px-8 flex items-center justify-between shrink-0 shadow-2xl z-[100] border-white/50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-2xl shadow-xl shadow-blue-500/20">
              <HardHat size={22} className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-black tracking-tight text-base uppercase leading-tight text-slate-900">IntelliPlan AI</span>
              <button onClick={() => setIsVersionModalOpen(true)} className="text-[10px] text-slate-500 font-bold hover:text-blue-600 transition-colors text-left flex items-center gap-1">
                {CURRENT_VERSION} <Info size={10} />
              </button>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-400/20"></div>
          <div className="flex items-center gap-4 bg-white/20 backdrop-blur-2xl px-4 py-2 rounded-full border border-white/40">
            <div className="flex -space-x-2.5">
              <img src={user.avatar} className="w-7 h-7 rounded-full border-2 border-white shadow-md" title={`你 (${user.username})`} />
              <div className="w-7 h-7 rounded-full bg-indigo-500 border-2 border-white flex items-center justify-center text-[10px] text-white font-black shadow-md">+2</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_12px_#34d399]"></div>
              <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">多人协作在线</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user.role === 'admin' && (
            <button 
              onClick={() => setIsMgmtConsoleOpen(true)}
              className="liquid-button flex items-center gap-2 bg-slate-900/10 hover:bg-slate-900/20 text-slate-900 px-5 py-2.5 rounded-2xl transition-all text-xs font-black uppercase tracking-wider border border-white/60"
            >
              <Settings size={18} /> 管理后台
            </button>
          )}

          {activeProject && !canEditActiveProject && (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-700 text-xs font-black uppercase">
              <ShieldAlert size={18} /> 只读模式
            </div>
          )}

          {showSaveSuccess && (
            <div className="flex items-center gap-2 text-emerald-600 text-xs font-black animate-in fade-in uppercase">
              <CloudCheck size={20} /> 实时已同步
            </div>
          )}
          
          <button 
            onClick={() => setIsDeployModalOpen(true)} 
            className="liquid-button flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-2xl transition-all shadow-xl shadow-blue-500/30 text-xs font-black uppercase tracking-wider"
          >
             <Globe size={16} /> 部署应用
          </button>
          
          <div className="w-px h-8 bg-slate-400/20 mx-2"></div>
          
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
                <span className="text-xs font-black text-slate-900 leading-none mb-1">{user.username}</span>
                <span className="text-[9px] text-slate-500 font-bold tracking-tight">{user.phone}</span>
            </div>
            <button 
              onClick={handleLogout} 
              className="p-3 text-slate-500 hover:text-red-600 hover:bg-red-500/10 rounded-2xl transition-all border border-transparent hover:border-red-500/30"
              title="退出登录"
            >
               <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 gap-4 sm:gap-6 overflow-hidden">
        <div 
          style={{ width: isLeftCollapsed ? 80 : leftWidth }} 
          className="flex-shrink-0 glass-panel rounded-[1.25rem] overflow-hidden flex flex-col shadow-2xl border-white/40"
        >
          <ProjectList 
            projects={visibleProjects} 
            currentUser={user}
            activeProjectId={activeProjectId} 
            onSelectProject={setActiveProjectId} 
            onAddProject={() => {
              const newId = crypto.randomUUID();
              handleAddNewProject({ 
                id: newId, 
                name: '新建工程', 
                lastModified: Date.now(), 
                tasks: [],
                ownerId: user.id,
                ownerName: user.username,
                visibility: 'private'
              });
            }}
            onDeleteProject={handleDeleteProject}
            onImportProject={(tasks, start) => {
              const newId = crypto.randomUUID();
              handleAddNewProject({ 
                id: newId, 
                name: '导入项目', 
                lastModified: Date.now(), 
                tasks, 
                startDate: start || Date.now(),
                ownerId: user.id,
                ownerName: user.username,
                visibility: 'private'
              });
            }}
            onLoadProject={(p) => {
              const newId = crypto.randomUUID();
              const adaptedProject: Project = {
                ...p,
                id: newId,
                ownerId: p.ownerId || user.id,
                ownerName: p.ownerName || user.username,
                visibility: p.visibility || 'private',
                lastModified: Date.now()
              };
              handleAddNewProject(adaptedProject);
            }}
            onRenameProject={(id, name) => updateProjectsWithHistory(projects.map(p => p.id === id ? {...p, name} : p))}
            onUpdateVisibility={handleUpdateVisibility}
            onSaveProject={handleExportFullProject}
            onExportProject={handleExportFullProject}
            onSaveToServer={() => { setIsSaving(true); setTimeout(() => { setIsSaving(false); setShowSaveSuccess(true); setTimeout(() => setShowSaveSuccess(false), 2000); }, 600); }}
            onUndo={() => historyIndex > 0 && setHistoryIndex(historyIndex - 1)}
            onRedo={() => historyIndex < history.length - 1 && setHistoryIndex(historyIndex + 1)}
            canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1}
            isLoading={false} isSaving={isSaving} setIsLoading={() => {}}
          />
        </div>

        <div 
          style={{ width: isMiddleCollapsed ? 80 : middleWidth }} 
          className="flex-shrink-0 glass-panel rounded-[1.25rem] overflow-hidden flex flex-col shadow-2xl border-white/40"
        >
          <ScheduleTable 
            tasks={calculatedTasks} 
            isReadOnly={!canEditActiveProject}
            onUpdateTask={(t) => handleUpdateTasks(activeProject.tasks.map(orig => orig.id === t.id ? t : orig))} 
            onAddTask={() => handleUpdateTasks([...activeProject.tasks, { id: Date.now().toString(), name: '新任务', duration: 1, completion: 0, predecessors: [], type: LinkType.Real }])} 
            onDeleteTask={(id) => handleUpdateTasks(activeProject.tasks.filter(t => t.id !== id))} 
            onReplaceTasks={handleUpdateTasks} 
            projectStartDate={new Date(activeProject.startDate || Date.now())} 
          />
        </div>

        <div className="flex-1 glass-panel rounded-[1.5rem] overflow-hidden flex flex-col shadow-2xl border-white/50 bg-white/20">
          <NetworkDiagram 
            tasks={calculatedTasks.filter(t => !t.isSummary)} 
            projectStartDate={new Date(activeProject.startDate || Date.now())} 
            onUpdateAnalysis={() => {}} 
            onUpdateTasks={handleUpdateTasks} 
            projectName={activeProject.name} 
            zoneOrder={activeProject.zoneOrder}
            onZoneOrderChange={handleUpdateZoneOrder}
            isFocusMode={isLeftCollapsed && isMiddleCollapsed} 
            onToggleFocusMode={() => { setIsLeftCollapsed(!isLeftCollapsed); setIsMiddleCollapsed(!isMiddleCollapsed); }} 
            onExportJson={handleExportFullProject}
          />
        </div>
      </main>

      <VersionModal isOpen={isVersionModalOpen} onClose={() => setIsVersionModalOpen(false)} />
      <ManagementConsole 
        isOpen={isMgmtConsoleOpen} 
        onClose={() => setIsMgmtConsoleOpen(false)} 
        allProjects={projects}
        onDeleteProject={handleDeleteProject}
        onUpdateProjectVisibility={handleUpdateVisibility}
      />
      <AIAssistant tasks={calculatedTasks} criticalPath={[]} projectDuration={0} />
    </div>
  );
};

export default App;
