
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { ShieldCheck, LogIn, HardHat, CheckCircle2, Phone, Key, Loader2, Lock, Smartphone, UserCircle, ArrowLeft, Zap, Sparkles, UserMinus, History } from 'lucide-react';

interface AuthProps {
  onLogin: (user: User) => void;
}

const ADMIN_PHONE = '18663187732';
const DEFAULT_ADMIN_PWD = 'admin';

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [loginMode, setLoginMode] = useState<'code' | 'password'>('code');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isFastLoggingIn, setIsFastLoggingIn] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  
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
    setTimeout(() => {
      setIsSendingCode(false);
      setCountdown(60);
      alert('【IntelliPlan】验证码：1234');
    }, 800);
  };

  const handleFastLogin = () => {
    if (!lastUser) return;
    setIsFastLoggingIn(true);
    
    setTimeout(() => {
      const userDb = JSON.parse(localStorage.getItem('intelliplan_user_db') || '{}');
      const targetUser = userDb[lastUser.phone];
      
      if (targetUser) {
        const mockUser: User = {
          id: targetUser.id,
          username: targetUser.username,
          phone: targetUser.phone,
          role: targetUser.role,
          avatar: targetUser.avatar,
          createdAt: targetUser.createdAt
        };
        
        localStorage.setItem('intelliplan_user', JSON.stringify(mockUser));
        localStorage.setItem('intelliplan_last_login_time', Date.now().toString());
        onLogin(mockUser);
      } else {
        setError('登录记忆已失效，请重新输入');
        setLastUser(null);
        setIsFastLoggingIn(false);
      }
    }, 800);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const userDb = JSON.parse(localStorage.getItem('intelliplan_user_db') || '{}');
    let targetUser = userDb[phone];

    if (loginMode === 'code') {
      if (code !== '1234') {
        setError('验证码错误，请使用 1234');
        return;
      }
    } else {
      if (phone === ADMIN_PHONE) {
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

    userDb[phone] = { ...mockUser, password: finalPassword };
    localStorage.setItem('intelliplan_user_db', JSON.stringify(userDb));
    localStorage.setItem('intelliplan_user', JSON.stringify(mockUser));
    localStorage.setItem('intelliplan_last_login_time', Date.now().toString());
    
    if (rememberMe) {
        localStorage.setItem('intelliplan_last_user_info', JSON.stringify({
          phone: mockUser.phone,
          username: mockUser.username,
          avatar: mockUser.avatar
        }));
    } else {
        localStorage.removeItem('intelliplan_last_user_info');
    }

    onLogin(mockUser);
  };

  const handleSwitchAccount = () => {
    setLastUser(null);
    setPhone(lastUser?.phone || '');
    setPassword('');
    setCode('');
    setError('');
  };

  const handleClearMemory = (e: React.MouseEvent) => {
      e.stopPropagation();
      if(confirm('确定要清除账号登录记忆吗？')) {
          localStorage.removeItem('intelliplan_last_user_info');
          setLastUser(null);
      }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-100/40 backdrop-blur-md overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-400/10 blur-[150px] rounded-full animate-pulse"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-400/10 blur-[150px] rounded-full animate-pulse"></div>

      <div className="relative w-full max-w-md p-10 bg-white/70 backdrop-blur-3xl border border-white/60 rounded-[3rem] shadow-[0_40px_100px_rgba(15,23,42,0.1)] fade-in-up">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="p-5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl shadow-2xl shadow-blue-500/20 mb-5">
            <HardHat size={36} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">IntelliPlan AI</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">智能工程进度管理套件</p>
        </div>

        {lastUser ? (
          <div className="mb-8 space-y-4 animate-in fade-in zoom-in duration-500">
            <div className="bg-white/80 border border-blue-100 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 text-blue-500/5 group-hover:scale-125 transition-transform duration-1000">
                <History size={160} />
              </div>
              
              <div className="flex flex-col items-center text-center relative z-10">
                <div className="relative mb-4">
                    <img src={lastUser.avatar} className="w-20 h-20 rounded-full border-4 border-white shadow-xl" alt="Avatar" />
                    <div className="absolute bottom-0 right-0 bg-emerald-500 w-6 h-6 rounded-full border-4 border-white shadow-md"></div>
                </div>
                
                <p className="text-[10px] text-blue-600 font-black uppercase tracking-[0.25em] mb-2">欢迎回来</p>
                <h3 className="text-xl font-black text-slate-900 mb-1">{lastUser.username}</h3>
                <p className="text-xs text-slate-400 font-mono mb-6">{lastUser.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</p>

                <button 
                  onClick={handleFastLogin}
                  disabled={isFastLoggingIn}
                  className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/30 hover:bg-blue-500 transition-all active:scale-[0.97] flex justify-center items-center gap-3"
                >
                  {isFastLoggingIn ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} className="fill-current" />}
                  <span className="text-sm tracking-wide">一键极速登录</span>
                </button>

                <div className="flex items-center justify-center gap-6 mt-6">
                    <button 
                        onClick={handleSwitchAccount}
                        className="text-slate-500 hover:text-blue-600 text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5"
                    >
                        <UserCircle size={14} /> 切换账号
                    </button>
                    <div className="w-px h-3 bg-slate-200"></div>
                    <button 
                        onClick={handleClearMemory}
                        className="text-slate-400 hover:text-red-500 text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5"
                    >
                        <UserMinus size={14} /> 清除记忆
                    </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex bg-slate-100/50 p-1.5 rounded-2xl border border-slate-200/50 mb-8">
              <button 
                onClick={() => { setLoginMode('code'); setError(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black rounded-xl transition-all ${loginMode === 'code' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Smartphone size={15} /> 验证码
              </button>
              <button 
                onClick={() => { setLoginMode('password'); setError(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black rounded-xl transition-all ${loginMode === 'password' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Lock size={15} /> 账号密码
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">手机号 / 账号</label>
                <div className="relative">
                  <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input 
                    type="tel" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-slate-900 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold placeholder:text-slate-300 shadow-inner"
                    placeholder="请输入手机号"
                    required
                  />
                </div>
              </div>

              {loginMode === 'code' ? (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">动态验证码</label>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Key size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                      <input 
                        type="text" 
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-slate-900 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold placeholder:text-slate-300 shadow-inner"
                        placeholder="1234"
                        maxLength={4}
                        required
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={handleSendCode}
                      disabled={countdown > 0 || isSendingCode}
                      className="px-6 bg-slate-900 text-white text-xs font-black rounded-2xl transition-all disabled:opacity-50 min-w-[110px] active:scale-95 shadow-lg"
                    >
                      {isSendingCode ? <Loader2 className="animate-spin mx-auto" size={18} /> : (countdown > 0 ? `${countdown}s` : '获取验证码')}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">登录密码</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-slate-900 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold placeholder:text-slate-300 shadow-inner"
                      placeholder={phone === ADMIN_PHONE ? "默认管理员密码 admin" : "请输入密码"}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between px-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${rememberMe ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-500/20' : 'border-slate-200 bg-white group-hover:border-slate-300'}`} onClick={() => setRememberMe(!rememberMe)}>
                    {rememberMe && <CheckCircle2 size={12} className="text-white" />}
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 select-none">记住登录状态</span>
                </label>
                <button type="button" className="text-[11px] font-bold text-blue-600 hover:text-blue-500 transition-colors">忘记密码？</button>
              </div>

              {isNewUser && loginMode === 'code' && (
                <div className="space-y-5 pt-3 animate-in slide-in-from-top-4 duration-500">
                  <div className="h-px bg-slate-100 w-full"></div>
                  <div>
                    <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 ml-2">新用户：设置昵称</label>
                    <input 
                      type="text" 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-emerald-50 bg-emerald-50/30 border border-emerald-100 rounded-2xl px-5 py-4 text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold"
                      placeholder="新用户请输入昵称"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 ml-2">新用户：设置密码</label>
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-emerald-50/30 border border-emerald-100 rounded-2xl px-5 py-4 text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold"
                      placeholder="请设置初始登录密码"
                      required
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-red-500 text-xs font-black text-center animate-bounce">{error}</p>}

              <button 
                type="submit" 
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-[1.5rem] shadow-xl shadow-blue-500/30 transition-all active:scale-[0.97] flex justify-center items-center gap-3 mt-4"
              >
                <LogIn size={22} />
                <span className="text-base tracking-wide">{isNewUser ? '注册并进入系统' : '立即进入控制台'}</span>
              </button>
            </form>
          </>
        )}

        <div className="mt-10 pt-8 border-t border-slate-100 flex flex-col items-center">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-black tracking-widest uppercase">
              <ShieldCheck size={14} className="text-emerald-500" /> AES-256 加密
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-black tracking-widest uppercase">
              <CheckCircle2 size={14} className="text-emerald-500" /> 多权验证
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] opacity-80">
        © 2024 IntelliPlan Engineering | Enterprise Edition v2.6
      </div>
    </div>
  );
};

export default Auth;
