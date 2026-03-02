export interface AssemblyLine {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssemblyLineStep {
  id: string;
  assemblyLineId: string;
  stepNumber: number;
  workerVersionId: string;
  configOverrides?: Record<string, unknown>;
}

export interface WorkerPool {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: string;
  maxConcurrency: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerPoolMember {
  id: string;
  poolId: string;
  workerVersionId: string;
  priority: number;
}
