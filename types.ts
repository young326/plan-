
// Data models for the application

export enum LinkType {
  Real = 'Real',
  Virtual = 'Virtual', 
  Wavy = 'Wavy'
}

export type ProjectVisibility = 'private' | 'public-read' | 'public-edit';

export interface User {
  id: string;
  username: string;
  phone: string;
  role: 'admin' | 'editor' | 'viewer';
  avatar?: string;
  createdAt?: number; // 注册时间
}

export interface Annotation {
  id: string;
  type: 'text' | 'icon';
  content: string;
  x: number;
  y: number;
  style?: {
    color?: string;
    fontSize?: number;
    backgroundColor?: string;
  };
}

export interface Task {
  id: string;
  name: string;
  duration: number;
  predecessors: string[];
  type: LinkType;
  zone?: string;
  description?: string;
  parentId?: string;
  isCollapsed?: boolean;
  constraintDate?: number;
  labelOffsetX?: number;
  manualLane?: number;
  completion?: number; // 完成百分比 (0-100)
  
  // Calculated fields
  earlyStart?: number;
  earlyFinish?: number;
  lateStart?: number;
  lateFinish?: number;
  totalFloat?: number;
  freeFloat?: number;
  isCritical?: boolean;
  isSummary?: boolean;
}

export interface Project {
  id: string;
  name: string;
  lastModified: number;
  startDate?: number;
  tasks: Task[];
  annotations?: Annotation[];
  description?: string;
  zoneOrder?: string[];
  collaborators?: User[];
  
  // Permission fields
  ownerId: string;
  ownerName: string;
  visibility: ProjectVisibility;
}

export interface SyncMessage {
  type: 'UPDATE_PROJECT' | 'USER_JOIN' | 'CURSOR_MOVE';
  projectId: string;
  payload: any;
  senderId: string;
}
