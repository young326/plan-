import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { analyzeScheduleWithAI, checkScheduleLogicWithAI } from '../services/geminiService';
import { Task } from '../types';
import { Sparkles, X, MessageSquare, Loader2, AlertTriangle, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

interface AIAssistantProps {
  tasks: Task[];
  criticalPath: string[];
  projectDuration: number;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ tasks, criticalPath, projectDuration }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [analysis, setAnalysis] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'assess' | 'logic'>('assess');

  const handleAnalyze = async () => {
    setActiveTab('assess');
    setLoading(true);
    const result = await analyzeScheduleWithAI(tasks, criticalPath, projectDuration);
    setAnalysis(result);
    setLoading(false);
  };

  const handleLogicCheck = async () => {
    setActiveTab('logic');
    setLoading(true);
    const result = await checkScheduleLogicWithAI(tasks);
    setAnalysis(result);
    setLoading(false);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-full shadow-2xl z-[100] flex items-center gap-2 transition-all hover:scale-110 active:scale-95 group"
      >
        <div className="relative">
            <Sparkles size={24} />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500 border-2 border-white"></span>
            </span>
        </div>
        <span className="font-bold pr-1 text-sm tracking-wide">IntelliPlan AI</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-white dark:bg-slate-900 rounded-2xl shadow-[-10px_20px_50px_rgba(0,0,0,0.15)] border border-slate-200 dark:border-slate-700 z-[100] flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-300 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-indigo-600 to-violet-700 text-white flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-md">
            <Sparkles size={18} />
          </div>
          <div>
            <h4 className="font-bold text-sm tracking-tight">智能助手</h4>
            <p className="text-[10px] text-indigo-100 font-medium">Gemini 3.0 Pro 提供动力</p>
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 rounded-full p-2 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Analysis Content */}
      <div className="flex-1 p-5 overflow-y-auto bg-slate-50 dark:bg-slate-900 relative custom-scrollbar">
        {!analysis && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="relative">
                <div className="absolute inset-0 bg-indigo-100 dark:bg-indigo-900/30 rounded-full scale-150 blur-2xl opacity-50"></div>
                <MessageSquare className="relative text-indigo-200 dark:text-indigo-800" size={64} />
            </div>
            <div className="space-y-2">
              <p className="font-extrabold text-slate-600 dark:text-slate-300 text-lg">开始智能诊断</p>
              <p className="text-slate-400 text-xs px-8">我可以为您评估项目风险，或者深度检查双代号网络图的逻辑完整性。</p>
            </div>
            
            <div className="w-full space-y-3 px-2">
                <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm text-left">
                    <ShieldCheck className="text-emerald-500 shrink-0" size={18} />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-tight">基于 JGJ/T 121-2015 规程进行逻辑合法性深度扫描</span>
                </div>
                <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm text-left">
                    <Zap className="text-amber-500 shrink-0" size={18} />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-tight">全自动关键路径分析与工期压缩策略建议</span>
                </div>
            </div>
          </div>
        ) : null}
        
        {loading && (
          <div className="flex flex-col items-center justify-center h-full text-indigo-600 dark:text-indigo-400">
            <div className="relative mb-6">
                <div className="absolute inset-0 animate-ping bg-indigo-400 dark:bg-indigo-600 rounded-full opacity-20"></div>
                <div className="relative bg-indigo-50 dark:bg-indigo-900/50 p-4 rounded-full">
                    <Loader2 className="animate-spin" size={32} />
                </div>
            </div>
            <span className="font-bold text-sm tracking-widest animate-pulse uppercase">专家级深度审计中...</span>
            <p className="text-[10px] text-slate-400 mt-2">正在验证拓扑逻辑与关键路径...</p>
          </div>
        )}

        {analysis && !loading && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-500">
             <div className="mb-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
               <div className="flex items-center gap-2">
                 {activeTab === 'assess' ? <Sparkles size={14} className="text-indigo-500"/> : <AlertTriangle size={14} className="text-amber-500"/>}
                 <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">
                    {activeTab === 'assess' ? '进度评估报告' : '逻辑审计结果'}
                 </span>
               </div>
               <button onClick={() => setAnalysis("")} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300">清除</button>
             </div>
             <div className="prose prose-sm max-w-none prose-indigo dark:prose-invert prose-p:text-slate-600 dark:prose-p:text-slate-300 prose-headings:text-slate-800 dark:prose-headings:text-slate-100 prose-headings:mb-2 prose-p:leading-relaxed text-xs">
                <ReactMarkdown>{analysis}</ReactMarkdown>
             </div> 
             <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-center">
                <p className="text-[9px] text-slate-400 font-medium">AI生成结果仅供参考，请根据实际工程情况核实</p>
             </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-b-2xl shrink-0">
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={handleAnalyze}
            disabled={loading || tasks.length === 0}
            className="group flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 font-bold py-3 rounded-xl text-[11px] transition-all flex justify-center items-center gap-2 disabled:opacity-40 shadow-sm"
          >
            <Sparkles size={14} className="group-hover:animate-pulse" /> 进度评估
          </button>
          <button 
            onClick={handleLogicCheck}
            disabled={loading || tasks.length === 0}
            className="group flex-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-600 hover:text-white hover:border-amber-600 font-bold py-3 rounded-xl text-[11px] transition-all flex justify-center items-center gap-2 disabled:opacity-40 shadow-sm"
          >
            <AlertTriangle size={14} className="group-hover:animate-bounce" /> 逻辑检查
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;