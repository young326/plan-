
// Data models for the application

export enum LinkType {
  Real = 'Real',
  Virtual = 'Virtual', // Dashed line
  Wavy = 'Wavy' // Usually implies wait/buffer, technically standard AOD uses dashed for virtual
}

export interface Annotation {
  id: string;
  type: 'text' | 'icon';
  content: string; // text content or icon name
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
  duration: number; // in days
  predecessors: string[]; // IDs of preceding tasks
  type: LinkType;
  zone?: string; // Partition/Zone
  description?: string;
  parentId?: string; // For hierarchical grouping
  isCollapsed?: boolean; // UI state for parent tasks
  constraintDate?: number; // Manual start constraint (Start No Earlier Than)
  labelOffsetX?: number; // Horizontal offset for the task label
  manualLane?: number; // Manual vertical lane index within the zone (0-based)
  
  // Calculated fields for Critical Path Method (CPM)
  earlyStart?: number;
  earlyFinish?: number;
  lateStart?: number;
  lateFinish?: number;
  totalFloat?: number;
  freeFloat?: number;
  isCritical?: boolean;
  isSummary?: boolean; // Computed property
}

export interface Project {
  id: string;
  name: string;
  lastModified: number;
  startDate?: number; // Project start timestamp (Local Midnight)
  tasks: Task[];
  annotations?: Annotation[]; // Added annotations support
  description?: string;
  zoneOrder?: string[]; // Custom order for zones
}

export interface NetworkNode {
  id: number;
  x?: number;
  y?: number;
  time?: number; // Logical time for X-axis
}

export interface NetworkLink {
  source: number; // Node ID
  target: number; // Node ID
  task: Task;
}

export interface AnalysisResult {
  criticalPath: string[];
  suggestions: string;
  estimatedDuration: number;
}
