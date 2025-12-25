
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { ShieldCheck, LogIn, HardHat, CheckCircle2, Phone, Key, Loader2, Lock, Smartphone, UserCircle, ArrowLeft } from 'lucide-react';

interface AuthProps {
  onLogin: (user: User) => void;
}

const ADMIN_PHONE = '18663187732';
const DEFAULT_ADMIN_PWD = 'admin'; // 管理员默认密码

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [loginMode, setLoginMode] = useState<'code' | 'password'>('code');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  
  // 上次登录用户信息
  const [lastUser, setLastUser] = useState<any>(() => {
    const saved = localStorage.getItem('intelliplan_last_user_info');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  // 监听手机号变化，检查是否是新用户
  useEffect(() => {
    if (/^1[3-9]\d{9}$/.test(phone)) {
      const userDb = JSON.parse(localStorage.getItem('intelliplan_user_db') || '{}');
      if (!userDb[phone] && phone !== ADMIN_PHONE) {
        setIsNewUser(true);
      } else {
        setIsNewUser(false);
      }
    } else {
      setIsNewUser(false);
    }
  }, [phone]);

  // 如果有上次登录用户，初始化填充手机号
  useEffect(() => {
    if (lastUser && !phone) {
      setPhone(lastUser.phone);
    }
  }, [lastUser]);

  const handleSendCode = () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入正确的手机号');
      return;
    }
    setError('');
    setIsSendingCode(true);
    // 模拟发送验证码
    setTimeout(() => {
      setIsSendingCode(false);
      setCountdown(60);
      alert('【IntelliPlan】验证码：1234');
    }, 800);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const userDb = JSON.parse(localStorage.getItem('intelliplan_user_db') || '{}');
    let targetUser = userDb[phone];

    // 1. 验证逻辑
    if (loginMode === 'code') {
      if (code !== '1234') {
        setError('验证码错误，请使用 1234');
        return;
      }
    } else {
      // 密码登录
      if (phone === ADMIN_PHONE) {
        // 管理员初次登录特殊处理
        const adminPwd = targetUser?.password || DEFAULT_ADMIN_PWD;
        if (password !== adminPwd) {
          setError('管理员密码错误');
          return;
        }
      } else {
        if (!targetUser) {
          setError('该手机号尚未注册，请使用验证码登录');
          return;
        }
        if (password !== targetUser.password) {
          setError('密码错误');
          return;
        }
      }
    }

    // 2. 新用户注册信息补全
    if (isNewUser && loginMode === 'code') {
      if (!username.trim()) {
        setError('新用户请输入昵称');
        return;
      }
      if (!password.trim()) {
        setError('请设置您的登录密码');
        return;
      }
    }

    // 3. 构造用户对象
    const role = phone === ADMIN_PHONE ? 'admin' : 'editor';
    const finalUsername = phone === ADMIN_PHONE ? '系统管理员' : (username || targetUser?.username || `用户_${phone.slice(-4)}`);
    const finalPassword = password || targetUser?.password || '123456';
    const createdAt = targetUser?.createdAt || Date.now();

    const mockUser: User = {
      id: phone,
      username: finalUsername,
      phone: phone,
      role: role,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${phone}`,
      createdAt: createdAt
    };

    // 4. 持久化存储
    userDb[phone] = { ...mockUser, password: finalPassword };
    localStorage.setItem('intelliplan_user_db', JSON.stringify(userDb));
    localStorage.setItem('intelliplan_user', JSON.stringify(mockUser));
    localStorage.setItem('intelliplan_last_login_time', Date.now().toString());
    localStorage.setItem('intelliplan_last_user_info', JSON.stringify({
      phone: mockUser.phone,
      username: mockUser.username,
      avatar: mockUser.avatar
    }));

    onLogin(mockUser);
  };

  const handleSwitchAccount = () => {
    setLastUser(null);
    setPhone('');
    setPassword('');
    setCode('');
    setError('');
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0f172a] overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3b82f6 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full"></div>

      <div className="relative w-full max-w-md p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-500">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg mb-4">
            <HardHat size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">IntelliPlan AI</h1>
          <p className="text-slate-400 text-sm mt-1">智能网络计划管理系统</p>
        </div>

        {/* 上次登录用户卡片 */}
        {lastUser && (
          <div className="mb-6 bg-blue-600/10 border border-blue-500/30 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-3">
              <img src={lastUser.avatar} className="w-10 h-10 rounded-full border border-blue-500/50 shadow-sm" alt="Avatar" />
              <div>
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">欢迎回来</p>
                <p className="text-sm font-black text-white">{lastUser.username}</p>
                <p className="text-[10px] text-slate-500 font-mono">{lastUser.phone}</p>
              </div>
            </div>
            <button 
              onClick={handleSwitchAccount}
              className="p-2 text-slate-400 hover:text-white transition-colors"
              title="切换账号"
            >
              <ArrowLeft size={18} />
            </button>
          </div>
        )}

        {/* 登录模式切换 */}
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 mb-6">
          <button 
            onClick={() => { setLoginMode('code'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${loginMode === 'code' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Smartphone size={14} /> 验证码
          </button>
          <button 
            onClick={() => { setLoginMode('password'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${loginMode === 'password' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Lock size={14} /> 密码
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!lastUser && (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">手机号</label>
              <div className="relative">
                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="tel" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-600"
                  placeholder="请输入手机号"
                  required
                />
              </div>
            </div>
          )}

          {loginMode === 'code' ? (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">动态验证码</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    type="text" 
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-600"
                    placeholder="1234"
                    maxLength={4}
                    required
                  />
                </div>
                <button 
                  type="button"
                  onClick={handleSendCode}
                  disabled={countdown > 0 || isSendingCode}
                  className="px-4 bg-white/10 hover:bg-white/20 text-blue-400 text-xs font-bold rounded-xl border border-white/10 transition-all disabled:opacity-50 min-w-[100px]"
                >
                  {isSendingCode ? <Loader2 className="animate-spin mx-auto" size={16} /> : (countdown > 0 ? `${countdown}s` : '获取')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">登录密码</label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-600"
                  placeholder={phone === ADMIN_PHONE ? "管理员密码 admin" : "请输入密码"}
                  required
                />
              </div>
            </div>
          )}

          {isNewUser && loginMode === 'code' && (
            <div className="animate-in slide-in-from-top-2 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1.5 ml-1">设置昵称</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-white/5 border border-emerald-500/30 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  placeholder="新用户请输入昵称"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1.5 ml-1">设置初始密码</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-emerald-500/30 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  placeholder="请输入初始登录密码"
                  required
                />
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-xs font-bold text-center animate-pulse">{error}</p>}

          <button 
            type="submit" 
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3.5 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] flex justify-center items-center gap-2 mt-2"
          >
            <LogIn size={18} />
            <span>{isNewUser ? '注册并登录' : '立即进入系统'}</span>
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
              <ShieldCheck size={12} className="text-emerald-500" /> 2小时免密有效期
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
              <CheckCircle2 size={12} className="text-emerald-500" /> 多权验证模式
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-600 text-[10px] font-black uppercase tracking-[0.2em]">
        © 2024 IntelliPlan Engineering Suite | Enterprise v2.6
      </div>
    </div>
  );
};

export default Auth;
