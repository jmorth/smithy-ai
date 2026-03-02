export interface WorkerConfig {
  name: string;
  inputTypes: string[];
  outputType: string;
  provider: {
    name: string;
    model: string;
    apiKeyEnv: string;
  };
  tools?: string[];
  timeout?: number;
}

export interface Worker {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerVersion {
  id: string;
  workerId: string;
  version: string;
  yamlConfig: WorkerConfig;
  dockerfileHash?: string;
  status: string;
  createdAt: string;
}
