
import React, { useState, useEffect } from 'react';
import { User, Project, ProjectVisibility } from '../types';
import { X, Users, FolderKanban, ShieldCheck, Trash2, Search, UserPlus, Database, Smartphone, UserCircle, Lock, Clock } from 'lucide-react';

interface ManagementConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  allProjects: Project[];
  onDeleteProject: (id: string) => void;
  onUpdateProjectVisibility: (id: string, visibility: ProjectVisibility) => void;
}

const ManagementConsole: React.FC<ManagementConsoleProps> = ({ isOpen, onClose, allProjects, onDeleteProject, onUpdateProjectVisibility }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'projects'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ phone: '', username: '', password: '' });

  useEffect(() => {
    if (isOpen) {
      const userDb = JSON.parse(localStorage.getItem('intelliplan_user_db') || '{}');
      setUsers(Object.values(userDb));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredUsers = users.filter(u => 
    u.phone.includes(searchTerm) || u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProjects = allProjects.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.ownerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteUser = (phone: string) => {
    if (phone === '18663187732') {
      alert('无法删除主管理员账户');
      return;
    }
    if (confirm(`确定要注销用户 ${phone} 吗？其创建的项目将保留但无法继续管理。`)) {
      const userDb = JSON.parse(localStorage.getItem('intelliplan_user_db') || '{}');
      delete userDb[phone];
      localStorage.setItem('intelliplan_user_db', JSON.stringify(userDb));
      setUsers(Object.values(userDb));
    }
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^1[3-9]\d{9}$/.test(newUser.phone)) {
      alert('请输入正确的手机号');
      return;
    }
    if (!newUser.username.trim() || !newUser.password.trim()) {
      alert('请完整填写信息');
      return;
    }

    const userDb = JSON.parse(localStorage.getItem('intelliplan_user_db') || '{}');
    if (userDb[newUser.phone]) {
      alert('该手机号已注册');
      return;
    }

    const role = newUser.phone === '18663187732' ? 'admin' : 'editor';
    const createdUser = {
      id: newUser.phone,
      username: newUser.username,
      phone: newUser.phone,
      role: role,
      password: newUser.password,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${newUser.phone}`,
      createdAt: Date.now()
    };

    userDb[newUser.phone] = createdUser;
    localStorage.setItem('intelliplan_user_db', JSON.stringify(userDb));
    setUsers(Object.values(userDb));
    setIsAddingUser(false);
    setNewUser({ phone: '', username: '', password: '' });
  };

  // Common input class consistent with other components
  const inputClass = "w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 outline-none focus:border-blue-500 transition-colors";

  return (
    <div className="fixed inset-0 z-[4000] bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300 border border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 flex justify-between items-center bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <ShieldCheck size={20} className="text-slate-900 dark:text-slate-100" strokeWidth={2} />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">后台管理中心</h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">System Administration</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'users' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              <Users size={14} /> 用户 ({users.length})
            </button>
            <button 
              onClick={() => setActiveTab('projects')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'projects' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              <FolderKanban size={14} /> 项目 ({allProjects.length})
            </button>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'users' && (
              <button 
                onClick={() => setIsAddingUser(true)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm"
              >
                <UserPlus size={14} /> 新增
              </button>
            )}
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="搜索..." 
                className={inputClass}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
              <tr>
                 {activeTab === 'users' ? (
                    <>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">用户</th>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">角色</th>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">注册时间</th>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">操作</th>
                    </>
                 ) : (
                    <>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">项目</th>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">所有者</th>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">可见性</th>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">最后修改</th>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">操作</th>
                    </>
                 )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeTab === 'users' ? filteredUsers.map(user => (
                <tr key={user.phone} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <img src={user.avatar} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700" alt="" />
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.username}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-500 font-mono">{user.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                        user.role === 'admin' 
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800' 
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                    }`}>
                      {user.role === 'admin' ? '管理员' : '普通用户'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 h-full">
                     <Clock size={12} className="opacity-70" />
                     {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {user.phone !== '18663187732' && (
                      <button 
                        onClick={() => handleDeleteUser(user.phone)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all opacity-0 group-hover:opacity-100"
                        title="删除用户"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )) : filteredProjects.map(project => (
                <tr key={project.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="text-slate-400 dark:text-slate-500">
                        <Database size={16} />
                      </div>
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{project.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {project.ownerName}
                  </td>
                  <td className="px-6 py-3">
                    <select 
                      value={project.visibility}
                      onChange={(e) => onUpdateProjectVisibility(project.id, e.target.value as ProjectVisibility)}
                      className="bg-transparent border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 outline-none focus:border-blue-500 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <option value="private">私有</option>
                      <option value="public-read">公开只读</option>
                      <option value="public-edit">公开协作</option>
                    </select>
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {new Date(project.lastModified).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button 
                      onClick={() => { if(confirm('确定强制删除该项目吗？')) onDeleteProject(project.id); }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all opacity-0 group-hover:opacity-100"
                      title="删除项目"
                    >
                       <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {((activeTab === 'users' && filteredUsers.length === 0) || (activeTab === 'projects' && filteredProjects.length === 0)) && (
             <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Search size={32} className="opacity-20 mb-3"/>
                <p className="text-xs">未找到相关数据</p>
             </div>
          )}
        </div>

        {/* Add User Modal */}
        {isAddingUser && (
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px] z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-sm p-6 animate-in zoom-in fade-in duration-200 border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                   <UserPlus size={16} className="text-blue-600 dark:text-blue-400"/> 新增用户
                </h3>
                <button onClick={() => setIsAddingUser(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">手机号</label>
                  <div className="relative">
                     <Smartphone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                     <input type="tel" className={inputClass} placeholder="登录账号" value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} required />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">用户名</label>
                  <div className="relative">
                     <UserCircle size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                     <input type="text" className={inputClass} placeholder="显示名称" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} required />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">密码</label>
                  <div className="relative">
                     <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                     <input type="password" className={inputClass} placeholder="初始密码" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} required />
                  </div>
                </div>

                <div className="pt-3 flex gap-2">
                  <button type="button" onClick={() => setIsAddingUser(false)} className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">取消</button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">创建</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500">
           <span>IntelliPlan Admin Console</span>
           <span>v2.7.0</span>
        </div>
      </div>
    </div>
  );
};

export default ManagementConsole;
