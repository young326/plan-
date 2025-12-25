
import React, { useState, useEffect } from 'react';
import { User, Project, ProjectVisibility } from '../types';
import { X, Users, FolderKanban, ShieldCheck, Trash2, Search, Filter, Database, ArrowUpDown, Clock, Plus, UserPlus, Lock, Smartphone, UserCircle } from 'lucide-react';

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
  
  // 新增用户表单状态
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

  return (
    <div className="fixed inset-0 z-[4000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-500 relative">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500 rounded-2xl shadow-xl shadow-indigo-500/20">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">后台管理中心</h2>
              <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">IntelliPlan System Administration</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
            <button 
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'users' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Users size={16} /> 用户管理 ({users.length})
            </button>
            <button 
              onClick={() => setActiveTab('projects')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'projects' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <FolderKanban size={16} /> 全部项目 ({allProjects.length})
            </button>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'users' && (
              <button 
                onClick={() => setIsAddingUser(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/20"
              >
                <UserPlus size={16} /> 新增用户
              </button>
            )}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="搜索名称、手机号..." 
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === 'users' ? (
            <table className="w-full text-left border-separate border-spacing-y-2">
              <thead>
                <tr className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                  <th className="px-4 py-2">用户详情</th>
                  <th className="px-4 py-2">账号角色</th>
                  <th className="px-4 py-2">注册时间</th>
                  <th className="px-4 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.phone} className="group bg-slate-50/50 hover:bg-indigo-50/50 transition-colors rounded-2xl overflow-hidden">
                    <td className="px-4 py-4 rounded-l-2xl">
                      <div className="flex items-center gap-3">
                        <img src={user.avatar} className="w-10 h-10 rounded-full border border-white shadow-sm" />
                        <div>
                          <p className="text-sm font-bold text-slate-800">{user.username}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{user.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight ${user.role === 'admin' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                        {user.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                        <Clock size={12} />
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '早期用户'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right rounded-r-2xl">
                      {user.phone !== '18663187732' && (
                        <button 
                          onClick={() => handleDeleteUser(user.phone)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-white rounded-xl transition-all"
                          title="注销账号"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-separate border-spacing-y-2">
              <thead>
                <tr className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                  <th className="px-4 py-2">项目名称</th>
                  <th className="px-4 py-2">所有者</th>
                  <th className="px-4 py-2">权限设置</th>
                  <th className="px-4 py-2">最近修改</th>
                  <th className="px-4 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map(project => (
                  <tr key={project.id} className="group bg-slate-50/50 hover:bg-indigo-50/50 transition-colors rounded-2xl overflow-hidden">
                    <td className="px-4 py-4 rounded-l-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-100 text-indigo-500 shadow-sm">
                          <Database size={20} />
                        </div>
                        <p className="text-sm font-bold text-slate-800">{project.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-600 font-bold">
                      {project.ownerName}
                    </td>
                    <td className="px-4 py-4">
                      <select 
                        value={project.visibility}
                        onChange={(e) => onUpdateProjectVisibility(project.id, e.target.value as ProjectVisibility)}
                        className="bg-white border border-slate-200 rounded-lg text-[10px] font-bold py-1.5 px-2 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="private">私有 (Private)</option>
                        <option value="public-read">公开只读 (Public Read)</option>
                        <option value="public-edit">公开协作 (Public Edit)</option>
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-[10px] text-slate-400 font-mono">{new Date(project.lastModified).toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-4 text-right rounded-r-2xl">
                      <button 
                        onClick={() => { if(confirm('确定强制删除该项目吗？此操作无法撤销。')) onDeleteProject(project.id); }}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-white rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add User Modal */}
        {isAddingUser && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md p-8 animate-in zoom-in fade-in duration-300 border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-100 rounded-xl text-blue-600">
                    <UserPlus size={20} />
                  </div>
                  <h3 className="text-lg font-black text-slate-800">新增系统用户</h3>
                </div>
                <button onClick={() => setIsAddingUser(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">手机号 (登录账号)</label>
                  <div className="relative">
                    <Smartphone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="tel" 
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      placeholder="请输入11位手机号"
                      value={newUser.phone}
                      onChange={e => setNewUser({...newUser, phone: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">用户昵称</label>
                  <div className="relative">
                    <UserCircle size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      placeholder="设置显示名称"
                      value={newUser.username}
                      onChange={e => setNewUser({...newUser, username: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">登录密码</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="password" 
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      placeholder="设置账号初始密码"
                      value={newUser.password}
                      onChange={e => setNewUser({...newUser, password: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="submit" 
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98]"
                  >
                    创建账号
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsAddingUser(false)}
                    className="px-6 py-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0 text-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">管理员安全管控界面 · 操作日志已记录</p>
        </div>
      </div>
    </div>
  );
};

export default ManagementConsole;
