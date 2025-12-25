
import { GoogleGenAI, Type } from "@google/genai";
import { Task, LinkType, AnalysisResult } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper: Wait function for backoff
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Wrapper for API calls with retry logic
async function generateContentWithRetry(model: string, contents: string, config: any, retries = 3) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });
      return response;
    } catch (error: any) {
      console.warn(`Gemini API attempt ${i + 1} failed:`, error);
      lastError = error;
      if (i < retries - 1) {
        await wait(1000 * Math.pow(2, i)); // 1s, 2s, 4s
      }
    }
  }
  throw lastError;
}

// 1. Intelligent Parsing
export const parseScheduleFromText = async (textContext: string): Promise<{ tasks: Task[], projectStartDate: number } | null> => {
  try {
    const prompt = `你是一位拥有20年经验的工程造造价与进度管理专家。
      请对用户上传的工程计划数据进行深度分析、清洗和逻辑重构。
      将非结构化或半结构化的表格数据转换为符合 CPM（关键路径法）计算的双代号网络图数据。
      输入内容：${textContext.substring(0, 4000)}`;

    const response = await generateContentWithRetry(
      'gemini-3-pro-preview',
      prompt,
      {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              duration: { type: Type.NUMBER },
              startDate: { type: Type.STRING },
              endDate: { type: Type.STRING },
              predecessors: { type: Type.ARRAY, items: { type: Type.STRING } },
              zone: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["Real", "Virtual"] }
            },
            required: ["id", "name", "predecessors", "type"]
          }
        }
      }
    );

    let jsonString = response?.text || "[]";
    const rawTasks = JSON.parse(jsonString);
    let minDateTimestamp = Infinity;
    
    const parseDate = (str: string) => {
      if(!str) return null;
      const d = new Date(str.replace(/[\/\.]/g, '-'));
      if (isNaN(d.getTime())) return null;
      return d;
    };

    rawTasks.forEach((t: any) => {
      const d = parseDate(t.startDate);
      if (d && d.getTime() < minDateTimestamp) minDateTimestamp = d.getTime();
    });

    if (minDateTimestamp === Infinity) minDateTimestamp = new Date().setHours(0,0,0,0);

    const tasks = rawTasks.map((t: any) => {
        let constraintDate = undefined;
        let duration = Number(t.duration);
        const start = parseDate(t.startDate);
        const end = parseDate(t.endDate);
        if (start) constraintDate = Math.round((start.getTime() - minDateTimestamp) / (1000 * 3600 * 24));
        if ((!duration || duration <= 0) && start && end) duration = Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
        return {
          id: String(t.id || Math.random().toString(36).substr(2, 5)),
          name: String(t.name || "未命名工作"),
          duration: duration || 1,
          constraintDate,
          predecessors: Array.isArray(t.predecessors) ? t.predecessors.map(String) : [],
          type: t.type === "Virtual" ? LinkType.Virtual : LinkType.Real,
          zone: t.zone || "未分区"
        };
    });
    return { tasks, projectStartDate: minDateTimestamp };
  } catch (error) { return null; }
};

// 2. AI Logic Check (Enhanced with thinking)
export const checkScheduleLogicWithAI = async (tasks: Task[]): Promise<string> => {
  try {
    const taskData = tasks.map(t => ({ id: t.id, name: t.name, duration: t.duration, preds: t.predecessors }));
    const prompt = `你现在是高级进度审计专家。请对以下网络计划进行逻辑严密性审计：
    
    检查标准：
    1. 闭环检查：找出所有循环依赖路径 (例如 A->B->A)。
    2. 孤岛检查：非首项工作无紧前，或非末项工作无紧后。
    3. 冗余检查：识别多余的逻辑约束 (例如已有 A->B->C，就不需要 A->C)。
    4. 里程碑检查：持续时间为0的工作逻辑是否正确。
    
    任务清单：
    ${JSON.stringify(taskData, null, 2)}
    
    请按以下格式输出：
    ### 1. 逻辑健康评分 (0-100)
    ### 2. 发现的问题 (分类列表)
    ### 3. 修改方案建议
    
    请使用 Markdown 格式，保持专业语气。`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });
    
    return response?.text || "逻辑检查完成，未返回结果。";
  } catch (error) { return "逻辑检查服务暂时不可用，请稍后再试。"; }
};

export const analyzeScheduleWithAI = async (tasks: Task[], criticalPath: string[], duration: number): Promise<string> => {
  try {
    const taskSummary = tasks.map(t => `ID:${t.id} ${t.name} (${t.duration}d) -> 紧前:[${t.predecessors.join(',')}]`).join('\n');
    const prompt = `作为工程管理专家，分析此计划：
      总工期: ${duration} 天, 关键线路: ${criticalPath.join(' -> ')}
      任务详情: ${taskSummary.substring(0, 3000)}
      要求：Markdown格式，重点关注工期压缩可能性和资源冲突。`;
    const response = await generateContentWithRetry('gemini-3-pro-preview', prompt, {});
    return response?.text || "分析失败。";
  } catch (error) { return "AI 分析暂时无法连接。"; }
};
