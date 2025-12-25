
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Project, Task, LinkType, Annotation } from './types';
import ProjectList from './components/ProjectList';
import ScheduleTable from './components/ScheduleTable';
import NetworkDiagram from './components/NetworkDiagram';
import AIAssistant from './components/AIAssistant';
import { Undo, Redo, CloudCheck, Loader2, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, LayoutPanelLeft, Columns, Maximize2, Minimize2 } from 'lucide-react';

const App: React.FC = () => {
  // --- Initial Data ---
  const initialProject: Project = { 
    id: '1', 
    name: 'XX机场航站区安装施工总进度计划', 
    lastModified: Date.now(),
    startDate: new Date().setHours(0,0,0,0) - (2 * 24 * 60 * 60 * 1000), 
    annotations: [], 
    zoneOrder: ['区域一', '区域二', '区域三', '区域四'],
    tasks: [
      { id: '10', name: '施工准备', duration: 20, predecessors: [], type: LinkType.Real, zone: '区域一' },
      { id: '20', name: '测量放线', duration: 92, predecessors: ['10'], type: LinkType.Real, zone: '区域一' },
      { id: '30', name: '切槽配管1', duration: 30, predecessors: ['20'], type: LinkType.Real, zone: '区域一' },
      { id: '40', name: '灯箱安装1', duration: 90, predecessors: ['30'], type: LinkType.Real, zone: '区域一' },
      { id: '50', name: '电缆敷设及接头制作', duration: 100, predecessors: ['40'], type: LinkType.Real, zone: '区域一' },
      { id: '60', name: '弱电系统受压', duration: 30, predecessors: ['50'], type: LinkType.Real, zone: '区域一' },
      { id: '70', name: '灯具安装', duration: 30, predecessors: ['60'], type: LinkType.Real, zone: '区域一' },
      { id: '80', name: '区域二综合作业', duration: 0, predecessors: ['10'], type: LinkType.Real, zone: '区域二', isCollapsed: false },
      { id: '81', name: '测量放线', duration: 32, predecessors: ['10'], type: LinkType.Real, zone: '区域二', parentId: '80' },
      { id: '90', name: '切槽配管', duration: 233, predecessors: ['81'], type: LinkType.Real, zone: '区域二', parentId: '80' },
      { id: '100', name: '灯箱安装', duration: 125, predecessors: ['90'], type: LinkType.Real, zone: '区域二', parentId: '80' },
      { id: '110', name: '电缆敷设', duration: 100, predecessors: ['100'], type: LinkType.Real, zone: '区域二', parentId: '80' },
      { id: '120', name: '高杆灯基础施工', duration: 42, predecessors: ['10'], type: LinkType.Real, zone: '区域三' },
      { id: '130', name: '高杆灯立及安装', duration: 44, predecessors: ['120'], type: LinkType.Real, zone: '区域三' },
      { id: '140', name: '切槽配管', duration: 202, predecessors: ['130'], type: LinkType.Real, zone: '区域三' },
      { id: '150', name: '配电亭安装', duration: 47, predecessors: ['140'], type: LinkType.Real, zone: '区域三' },
      { id: '200', name: '主体结构及装饰', duration: 76, predecessors: ['10'], type: LinkType.Real, zone: '区域四' },
      { id: '210', name: '机电管线安装', duration: 112, predecessors: ['200'], type: LinkType.Real, zone: '区域四' },
      { id: '220', name: '机电设备安装及调试', duration: 60, predecessors: ['210'], type: LinkType.Real, zone: '区域四' },
      { id: '230', name: '助航灯光设备调试', duration: 59, predecessors: ['220'], type: LinkType.Real, zone: '区域四' },
      { id: '240', name: '竣工验收', duration: 0, predecessors: ['70', '110', '150', '230'], type: LinkType.Wavy, zone: '区域四' },
    ] 
  };

  const loadProjects = () => {
    try {
      const saved = localStorage.getItem('intelliPlan_projects');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { console.error("Failed to load projects", e); }
    return [initialProject];
  };

  const [history, setHistory] = useState<Project[][]>([loadProjects()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const projects = history[historyIndex];
  const [activeProjectId, setActiveProjectId] = useState<string>(projects[0]?.id || '1');

  // --- View Control States ---
  const [leftWidth, setLeftWidth] = useState(240);
  const [middleWidth, setMiddleWidth] = useState(400);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isMiddleCollapsed, setIsMiddleCollapsed] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  
  const [currentCriticalPath, setCurrentCriticalPath] = useState<string[]>([]);
  const [projectDuration, setProjectDuration] = useState(0);

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];

  const projectStartDate = useMemo(() => {
    if (activeProject.startDate) return new Date(activeProject.startDate);
    const d = new Date(); d.setHours(0,0,0,0); return d;
  }, [activeProject.startDate]);

  // --- CPM Calculation Logic ---
  const calculatedTasks = useMemo(() => {
    const _tasks = JSON.parse(JSON.stringify(activeProject.tasks)) as Task[];
    const taskMap = new Map(_tasks.map(t => [t.id, t]));
    _tasks.forEach(t => { t.isSummary = _tasks.some(child => child.parentId === t.id); });

    let changed = true;
    while(changed) {
      changed = false;
      _tasks.forEach(task => {
        if (task.isSummary) return;
        let maxES = -Infinity;
        if (task.predecessors.length > 0) {
          task.predecessors.forEach(pid => {
            const p = taskMap.get(pid);
            if (p && p.earlyFinish !== undefined) maxES = Math.max(maxES, p.earlyFinish);
          });
        }
        if (task.constraintDate !== undefined) maxES = maxES === -Infinity ? task.constraintDate : Math.max(maxES, task.constraintDate);
        if (maxES === -Infinity) maxES = 0;
        if (task.earlyStart !== maxES) { task.earlyStart = maxES; task.earlyFinish = maxES + task.duration; changed = true; }
      });
    }

    let rollupChanged = true;
    while(rollupChanged) {
        rollupChanged = false;
        _tasks.forEach(parent => {
            if (parent.isSummary) {
                const children = _tasks.filter(t => t.parentId === parent.id);
                if (children.length > 0) {
                    const validChildren = children.filter(c => c.earlyStart !== undefined && c.earlyFinish !== undefined);
                    if (validChildren.length > 0) {
                        const minStart = Math.min(...validChildren.map(c => c.earlyStart!));
                        const maxFinish = Math.max(...validChildren.map(c => c.earlyFinish!));
                        if (parent.earlyStart !== minStart || parent.earlyFinish !== maxFinish) {
                            parent.earlyStart = minStart; parent.earlyFinish = maxFinish; parent.duration = maxFinish - minStart; rollupChanged = true;
                        }
                    }
                }
            }
        });
    }

    let pDuration = 0;
    const finishes = _tasks.map(t => t.earlyFinish !== undefined ? t.earlyFinish : -Infinity);
    const maxFinish = Math.max(...finishes);
    if (maxFinish !== -Infinity) pDuration = maxFinish;

    _tasks.forEach(t => { if(!t.lateFinish) { t.lateFinish = pDuration; t.lateStart = pDuration - t.duration; } });
    
    changed = true;
    while(changed) {
      changed = false;
      _tasks.forEach(task => {
        if (task.isSummary) return;
        const successors = _tasks.filter(t => t.predecessors.includes(task.id) && !t.isSummary);
        if (successors.length > 0) {
          const minLS = Math.min(...successors.map(s => s.lateStart !== undefined ? s.lateStart : pDuration));
          if (task.lateFinish !== minLS) { task.lateFinish = minLS; task.lateStart = minLS - task.duration; changed = true; }
        }
      });
    }

    _tasks.forEach(t => {
      if (t.isSummary) { t.totalFloat = 0; t.isCritical = false; } 
      else {
          const totalFloat = (t.lateStart || 0) - (t.earlyStart || 0);
          t.totalFloat = totalFloat; t.isCritical = Math.abs(totalFloat) < 0.001;
      }
    });
    
    _tasks.forEach(task => {
        if (task.isSummary) return;
        const successors = _tasks.filter(t => t.predecessors.includes(task.id) && !t.isSummary);
        if (successors.length > 0) {
            const minES = Math.min(...successors.map(s => s.earlyStart || 0));
            task.freeFloat = minES - (task.earlyFinish || 0);
        } else { task.freeFloat = pDuration - (task.earlyFinish || 0); }
    });
    return _tasks;
  }, [activeProject.tasks]);

  const diagramTasks = useMemo(() => {
    const idMap = new Map<string, Task>();
    calculatedTasks.forEach(t => idMap.set(t.id, t));
    const visibleIds = new Set<string>();
    const taskToVisibleMap = new Map<string, string>(); 

    const getVisibleAncestor = (taskId: string): string | null => {
         let currentId = taskId;
         while(currentId) {
             const t = idMap.get(currentId);
             if (!t) return null;
             let ptr = t.parentId;
             const ancestors: Task[] = [];
             while(ptr) {
                 const p = idMap.get(ptr);
                 if(p) { ancestors.push(p); ptr = p.parentId; } else break;
             }
             for(let i=ancestors.length-1; i>=0; i--) { if(ancestors[i].isCollapsed) return ancestors[i].id; }
             if (t.isSummary) { if (t.isCollapsed) return t.id; return null; } else { return t.id; }
         }
         return null;
    };

    calculatedTasks.forEach(t => {
        const rep = getVisibleAncestor(t.id);
        if (rep) { taskToVisibleMap.set(t.id, rep); visibleIds.add(rep); }
    });

    const resultTasks: Task[] = [];
    visibleIds.forEach(vid => {
        const t = idMap.get(vid);
        if (t) resultTasks.push({ ...t, predecessors: [] }); 
    });

    const newLinks = new Map<string, Set<string>>();
    calculatedTasks.forEach(t => {
        const targetVisible = taskToVisibleMap.get(t.id);
        if (!targetVisible) return;
        t.predecessors.forEach(pid => {
            const sourceVisible = taskToVisibleMap.get(pid);
            if (sourceVisible && sourceVisible !== targetVisible) {
                if (!newLinks.has(targetVisible)) newLinks.set(targetVisible, new Set());
                newLinks.get(targetVisible)?.add(sourceVisible);
            }
        });
    });

    resultTasks.forEach(t => { if (newLinks.has(t.id)) { t.predecessors = Array.from(newLinks.get(t.id)!); } });
    return resultTasks;
  }, [calculatedTasks]);

  const updateProjectsWithHistory = (newProjects: Project[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newProjects);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => { if (historyIndex > 0) setHistoryIndex(historyIndex - 1); };
  const handleRedo = () => { if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1); };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.shiftKey ? handleRedo() : handleUndo(); e.preventDefault(); } 
      else if ((e.metaKey || e.ctrlKey) && e.key === 'y') { handleRedo(); e.preventDefault(); } 
      else if ((e.metaKey || e.ctrlKey) && e.key === 's') { handleSaveToServer(); e.preventDefault(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  const handleUpdateTasks = (newTasks: Task[]) => {
    const updatedProjects = projects.map(p => p.id === activeProjectId ? { ...p, tasks: newTasks, lastModified: Date.now() } : p);
    updateProjectsWithHistory(updatedProjects);
  };

  const handleTaskUpdate = (updatedTask: Task) => {
    const newTasks = activeProject.tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
    handleUpdateTasks(newTasks);
  };

  const handleAddTask = () => {
    const newTask: Task = { id: (Math.max(...activeProject.tasks.map(t => parseInt(t.id) || 0), 0) + 10).toString(), name: '新工作项', duration: 1, predecessors: [], type: LinkType.Real, zone: '区域一' };
    handleUpdateTasks([...activeProject.tasks, newTask]);
  };

  const handleDeleteTask = (id: string) => { handleUpdateTasks(activeProject.tasks.filter(t => t.id !== id)); };

  const handleAddProject = () => {
    const newProject: Project = { id: crypto.randomUUID(), name: '新建工程项目', lastModified: Date.now(), startDate: new Date().setHours(0,0,0,0), tasks: [], annotations: [], zoneOrder: [] };
    const updatedProjects = [...projects, newProject];
    updateProjectsWithHistory(updatedProjects);
    setActiveProjectId(newProject.id);
  };

  const handleDeleteProject = (id: string) => {
    const newProjects = projects.filter(p => p.id !== id);
    updateProjectsWithHistory(newProjects);
    if (activeProjectId === id && newProjects.length > 0) setActiveProjectId(newProjects[0].id);
  };
  
  const handleRenameProject = (id: string, newName: string) => {
    const updatedProjects = projects.map(p => p.id === id ? { ...p, name: newName, lastModified: Date.now() } : p);
    updateProjectsWithHistory(updatedProjects);
  };

  const handleSaveProject = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeProject));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${activeProject.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleSaveToServer = async () => {
    setIsSaving(true);
    try {
        await new Promise(resolve => setTimeout(resolve, 800));
        localStorage.setItem('intelliPlan_projects', JSON.stringify(projects));
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 2000);
    } catch (e) { alert("保存失败: " + e); } finally { setIsSaving(false); }
  };

  const handleImportProject = (importedTasks: Task[], startDate?: number) => {
    const newProject: Project = { id: crypto.randomUUID(), name: '导入的工程 ' + new Date().toLocaleTimeString(), lastModified: Date.now(), startDate: startDate || new Date().setHours(0,0,0,0), tasks: importedTasks, annotations: [], zoneOrder: [] };
    const updatedProjects = [...projects, newProject];
    updateProjectsWithHistory(updatedProjects);
    setActiveProjectId(newProject.id);
  };

  const handleLoadProject = (importedProject: Project) => {
      if (!importedProject.tasks || !Array.isArray(importedProject.tasks)) { alert("文件格式错误：缺少任务数据"); return; }
      let finalProject = { ...importedProject };
      if (projects.some(p => p.id === finalProject.id)) { finalProject.id = crypto.randomUUID(); finalProject.name = finalProject.name + " (导入副本)"; }
      finalProject.lastModified = Date.now();
      const updatedProjects = [...projects, finalProject];
      updateProjectsWithHistory(updatedProjects);
      setActiveProjectId(finalProject.id);
  };

  const handleUpdateAnnotations = (newAnnotations: Annotation[]) => {
    const updatedProjects = projects.map(p => p.id === activeProjectId ? { ...p, annotations: newAnnotations, lastModified: Date.now() } : p);
    updateProjectsWithHistory(updatedProjects);
  };
  
  const handleZoneReorder = (newOrder: string[]) => {
      const updatedProjects = projects.map(p => p.id === activeProjectId ? { ...p, zoneOrder: newOrder, lastModified: Date.now() } : p);
      updateProjectsWithHistory(updatedProjects);
  };

  const startResizingLeft = useCallback((mouseDownEvent: React.MouseEvent) => {
    const startX = mouseDownEvent.clientX;
    const startWidth = leftWidth;
    const doDrag = (dragEvent: MouseEvent) => setLeftWidth(Math.max(150, Math.min(400, startWidth + dragEvent.clientX - startX)));
    const stopDrag = () => { document.removeEventListener('mousemove', doDrag); document.removeEventListener('mouseup', stopDrag); };
    document.addEventListener('mousemove', doDrag); document.addEventListener('mouseup', stopDrag);
  }, [leftWidth]);

  const startResizingMiddle = useCallback((mouseDownEvent: React.MouseEvent) => {
    const startX = mouseDownEvent.clientX;
    const startWidth = middleWidth;
    const doDrag = (dragEvent: MouseEvent) => setMiddleWidth(Math.max(300, Math.min(800, startWidth + dragEvent.clientX - startX)));
    const stopDrag = () => { document.removeEventListener('mousemove', doDrag); document.removeEventListener('mouseup', stopDrag); };
    document.addEventListener('mousemove', doDrag); document.addEventListener('mouseup', stopDrag);
  }, [middleWidth]);

  return (
    <div className="flex h-screen w-screen overflow-hidden text-slate-800 font-sans relative">
      {isLoading && <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center text-white flex-col backdrop-blur-sm"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mb-4"></div><p>AI模型正在智能识别与计算...</p></div>}
      {showSaveSuccess && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg z-[100] flex items-center gap-2 animate-in fade-in slide-in-from-top-4"><CloudCheck size={20} /><span className="font-medium">项目已成功保存到服务器</span></div>}

      {/* 1. Project Management Panel */}
      <div 
        style={{ width: isLeftCollapsed ? 40 : leftWidth }} 
        className={`flex-shrink-0 relative h-full transition-all duration-300 ease-in-out border-r border-slate-200 bg-slate-50 overflow-hidden ${isLeftCollapsed ? 'bg-slate-100' : ''}`}
      >
        {isLeftCollapsed ? (
            <div className="h-full w-full flex flex-col items-center pt-4 gap-4">
                <button onClick={() => setIsLeftCollapsed(false)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-white rounded shadow-sm transition-all" title="展开项目管理">
                    <PanelLeftOpen size={20} />
                </button>
                <div className="flex-1 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap rotate-90 origin-center">Project Management</span>
                </div>
            </div>
        ) : (
            <>
                <div className="absolute top-2 right-2 z-20">
                    <button onClick={() => setIsLeftCollapsed(true)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-200 rounded transition-colors" title="折叠项目管理">
                        <ChevronLeft size={16} />
                    </button>
                </div>
                <ProjectList 
                  projects={projects} activeProjectId={activeProjectId} onSelectProject={setActiveProjectId} onAddProject={handleAddProject} onDeleteProject={handleDeleteProject} onImportProject={handleImportProject} onLoadProject={handleLoadProject} onRenameProject={handleRenameProject} onSaveProject={handleSaveProject} onSaveToServer={handleSaveToServer} onUndo={handleUndo} onRedo={handleRedo} canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1} isLoading={isLoading} isSaving={isSaving} setIsLoading={setIsLoading}
                />
                <div className="resize-handle-h absolute top-0 right-0 h-full w-1 hover:bg-blue-400 z-10" onMouseDown={startResizingLeft}></div>
            </>
        )}
      </div>

      {/* 2. Schedule Table Panel */}
      <div 
        style={{ width: isMiddleCollapsed ? 40 : middleWidth }} 
        className={`flex-shrink-0 relative h-full transition-all duration-300 ease-in-out border-r border-slate-200 bg-white overflow-hidden ${isMiddleCollapsed ? 'bg-slate-50' : ''}`}
      >
        {isMiddleCollapsed ? (
            <div className="h-full w-full flex flex-col items-center pt-4 gap-4">
                <button onClick={() => setIsMiddleCollapsed(false)} className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-white rounded shadow-sm transition-all" title="展开进度表">
                    <Columns size={20} />
                </button>
                <div className="flex-1 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap rotate-90 origin-center">Schedule Table</span>
                </div>
            </div>
        ) : (
            <>
                <div className="absolute top-2 right-2 z-20">
                    <button onClick={() => setIsMiddleCollapsed(true)} className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded transition-colors" title="折叠进度表">
                        <ChevronLeft size={16} />
                    </button>
                </div>
                <ScheduleTable 
                    tasks={calculatedTasks} 
                    onUpdateTask={handleTaskUpdate} onAddTask={handleAddTask} onDeleteTask={handleDeleteTask} onReplaceTasks={handleUpdateTasks} projectStartDate={projectStartDate}
                />
                <div className="resize-handle-h absolute top-0 right-0 h-full w-1 hover:bg-blue-400 z-10" onMouseDown={startResizingMiddle}></div>
            </>
        )}
      </div>

      {/* 3. Main Network Diagram Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-slate-50 relative overflow-hidden">
          <NetworkDiagram 
            tasks={diagramTasks} 
            annotations={activeProject.annotations || []} 
            onUpdateTasks={(updatedDisplayTasks: Task[]) => {
                const newFullTasks = [...activeProject.tasks];
                updatedDisplayTasks.forEach(dt => {
                    const idx = newFullTasks.findIndex(t => t.id === dt.id);
                    if (idx >= 0) newFullTasks[idx] = { ...newFullTasks[idx], ...dt };
                });
                handleUpdateTasks(newFullTasks);
            }}
            onUpdateAnnotations={handleUpdateAnnotations}
            projectStartDate={projectStartDate}
            onUpdateAnalysis={(path, duration) => { setCurrentCriticalPath(path); setProjectDuration(duration); }}
            onUndo={handleUndo} onRedo={handleRedo} canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1} projectName={activeProject.name}
            zoneOrder={activeProject.zoneOrder}
            onZoneOrderChange={handleZoneReorder}
            isFocusMode={isLeftCollapsed && isMiddleCollapsed}
            onToggleFocusMode={() => {
              const nextState = !(isLeftCollapsed && isMiddleCollapsed);
              setIsLeftCollapsed(nextState);
              setIsMiddleCollapsed(nextState);
            }}
          />
      </div>

      <AIAssistant tasks={calculatedTasks} criticalPath={currentCriticalPath} projectDuration={projectDuration} />
    </div>
  );
};

export default App;
