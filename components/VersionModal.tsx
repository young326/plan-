import React from 'react';
import { X, Info, Milestone, Sparkles, ShieldCheck } from 'lucide-react';

interface VersionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VersionModal: React.FC<VersionModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const versions = [
    {
      tag: 'v2.6.0',
      date: '2024-05-20',
      title: '管理后台与权限增强',
      updates: [
        '新增管理员后台管理功能，可全局管理用户与项目数据。',
        '新增版本说明模块，追踪系统演进历史。',
        '优化手机号登录逻辑，支持密码与验证码双重验证。',
        '增强项目权限控制，支持私有、只读、公共协作三种模式。'
      ]
    },
    {
      tag: 'v2.5.0',
      date: '2024-04-15',
      title: 'AI 专家审计系统',
      updates: [
        '集成 Gemini 3.0 Pro 模型，支持双代号网络图逻辑深度审计。',
        '新增 Excel 智能识别导入功能。',
        '优化 D3.0 绘图引擎，支持时标网络图无级缩放。'
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-[3000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in fade-in duration-300 border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="p-6 bg-gradient-to-br from-slate-800 to-slate-950 text-white relative">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-xl shadow-lg">
                <Info size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">版本说明</h2>
                <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">System Release Notes</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-8 bg-white dark:bg-slate-900">
          {versions.map((v, i) => (
            <div key={v.tag} className="relative pl-8 border-l-2 border-slate-100 dark:border-slate-800 last:border-0 pb-2">
              <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-4 border-blue-500"></div>
              <div className="flex items-center gap-3 mb-2">
                <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 text-[10px] font-black px-2 py-0.5 rounded-full">{v.tag}</span>
                <span className="text-[10px] text-slate-400 font-bold">{v.date}</span>
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">{v.title}</h4>
              <ul className="space-y-1.5">
                {v.updates.map((item, idx) => (
                  <li key={idx} className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex items-start gap-2">
                    <span className="mt-1 w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0"></span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold">
            <ShieldCheck size={14} className="text-emerald-500" />
            企业级稳定版
          </div>
          <button onClick={onClose} className="bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold px-6 py-2 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-600 transition-all">
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
};

export default VersionModal;