import type {
  Package,
  PackageFile,
  Worker,
  WorkerVersion,
  AssemblyLine,
  AssemblyLineStep,
  WorkerPool,
  WorkerPoolMember,
  JobExecution,
  Notification,
  WebhookEndpoint,
} from '@smithy/shared';
import type { PackageStatus } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Shared query / response types
// ---------------------------------------------------------------------------

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  filter?: Record<string, string>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page?: number;
    limit: number;
    total: number;
    cursor?: string;
  };
}

// --- Packages ---

export interface PackagePaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  status?: string;
  createdAfter?: string;
  createdBefore?: string;
  sort?: string;
}

export interface CreatePackageBody {
  type: string;
  metadata?: Record<string, unknown>;
  assemblyLineId?: string;
}

export interface FileUploadUrlResponse {
  uploadUrl: string;
  fileId: string;
}

export interface FileConfirmBody {
  fileId: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface UpdatePackageBody {
  type?: string;
  metadata?: Record<string, unknown>;
  status?: PackageStatus;
}

// --- Workers ---

export interface WorkerQueryParams {
  name?: string;
  status?: string;
}

export interface CreateWorkerBody {
  name: string;
  description?: string;
}

export interface CreateWorkerVersionBody {
  yamlConfig: Record<string, unknown>;
  dockerfile?: string;
}

// --- Assembly Lines ---

export interface AssemblyLineStepBody {
  workerVersionId: string;
  configOverrides?: Record<string, unknown>;
}

export interface CreateAssemblyLineBody {
  name: string;
  description?: string;
  steps: AssemblyLineStepBody[];
}

export interface UpdateAssemblyLineBody {
  name?: string;
  description?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}

export interface SubmitPackageBody {
  type: string;
  metadata?: Record<string, unknown>;
}

// --- Worker Pools ---

export interface WorkerPoolMemberBody {
  workerVersionId: string;
  priority?: number;
}

export interface CreateWorkerPoolBody {
  name: string;
  members: WorkerPoolMemberBody[];
  maxConcurrency: number;
}

export interface UpdateWorkerPoolBody {
  name?: string;
  maxConcurrency?: number;
  members?: WorkerPoolMemberBody[];
}

// --- Notifications ---

export interface NotificationQueryParams {
  status?: 'PENDING' | 'SENT' | 'READ';
  type?: string;
  page?: number;
  limit?: number;
}

// --- Webhooks ---

export interface CreateWebhookBody {
  url: string;
  secret: string;
  events: string[];
}

export interface UpdateWebhookBody {
  url?: string;
  secret?: string;
  events?: string[];
  active?: boolean;
}

// --- Jobs ---

export interface JobQueryParams {
  packageId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface FileDownloadUrlResponse {
  downloadUrl: string;
}

// --- Logs ---

export interface LogQueryParams {
  level?: 'debug' | 'info' | 'warn' | 'error';
  after?: string;
  before?: string;
  page?: number;
  limit?: number;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface LogsResponse {
  data: LogEntry[];
  meta: {
    page: number;
    limit: number;
    total: number;
    jobId: string;
    jobState: string;
  };
}

// --- Assembly Line detail (with steps) ---

export interface AssemblyLineDetail extends AssemblyLine {
  steps: AssemblyLineStep[];
}

// --- Worker Pool detail (with members) ---

export interface WorkerPoolDetail extends WorkerPool {
  members: WorkerPoolMember[];
  activeJobCount?: number;
}

// --- Worker detail (with versions) ---

export interface WorkerDetail extends Worker {
  versions?: WorkerVersion[];
}

// ---------------------------------------------------------------------------
// Internal request helper
// ---------------------------------------------------------------------------

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const url = `${BASE_URL}${path}`;
  if (!params) return url;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(
        value as Record<string, string>,
      )) {
        if (nestedValue !== undefined && nestedValue !== null) {
          searchParams.set(nestedKey, String(nestedValue));
        }
      }
    } else {
      searchParams.set(key, String(value));
    }
  }

  const qs = searchParams.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    params?: Record<string, unknown>;
    signal?: AbortSignal;
  },
): Promise<T> {
  const url = buildUrl(path, options?.params);

  const headers: Record<string, string> = {};
  if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });

  if (!response.ok) {
    let message = response.statusText;
    let details: Record<string, string[]> | undefined;
    try {
      const errorBody = await response.json();
      if (typeof errorBody.message === 'string') {
        message = errorBody.message;
      } else if (Array.isArray(errorBody.message)) {
        message = errorBody.message.join('; ');
      }
      if (errorBody.details) {
        details = errorBody.details;
      }
    } catch {
      // response body was not JSON — keep statusText
    }
    throw new ApiError(response.status, message, details);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Package endpoints — /api/packages
// ---------------------------------------------------------------------------

export const packages = {
  list(params?: PackagePaginationParams, signal?: AbortSignal) {
    return request<PaginatedResponse<Package>>('GET', '/packages', {
      params: params as Record<string, unknown>,
      signal,
    });
  },

  get(id: string, signal?: AbortSignal) {
    return request<Package>('GET', `/packages/${encodeURIComponent(id)}`, {
      signal,
    });
  },

  create(data: CreatePackageBody, signal?: AbortSignal) {
    return request<Package>('POST', '/packages', { body: data, signal });
  },

  update(id: string, data: UpdatePackageBody, signal?: AbortSignal) {
    return request<Package>(
      'PATCH',
      `/packages/${encodeURIComponent(id)}`,
      { body: data, signal },
    );
  },

  delete(id: string, signal?: AbortSignal) {
    return request<void>(
      'DELETE',
      `/packages/${encodeURIComponent(id)}`,
      { signal },
    );
  },

  getUploadUrl(
    id: string,
    body: { fileName: string; contentType: string },
    signal?: AbortSignal,
  ) {
    return request<FileUploadUrlResponse>(
      'POST',
      `/packages/${encodeURIComponent(id)}/files/upload-url`,
      { body, signal },
    );
  },

  confirmUpload(id: string, body: FileConfirmBody, signal?: AbortSignal) {
    return request<void>(
      'POST',
      `/packages/${encodeURIComponent(id)}/files/confirm`,
      { body, signal },
    );
  },

  listFiles(id: string, signal?: AbortSignal) {
    return request<PackageFile[]>(
      'GET',
      `/packages/${encodeURIComponent(id)}/files`,
      { signal },
    );
  },

  getDownloadUrl(id: string, fileId: string, signal?: AbortSignal) {
    return request<FileDownloadUrlResponse>(
      'POST',
      `/packages/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/download-url`,
      { signal },
    );
  },
};

// ---------------------------------------------------------------------------
// Worker endpoints — /api/workers
// ---------------------------------------------------------------------------

export const workers = {
  list(params?: WorkerQueryParams, signal?: AbortSignal) {
    return request<Worker[]>('GET', '/workers', {
      params: params as Record<string, unknown>,
      signal,
    });
  },

  get(slug: string, signal?: AbortSignal) {
    return request<WorkerDetail>('GET', `/workers/${encodeURIComponent(slug)}`, {
      signal,
    });
  },

  create(data: CreateWorkerBody, signal?: AbortSignal) {
    return request<Worker>('POST', '/workers', { body: data, signal });
  },

  createVersion(
    slug: string,
    data: CreateWorkerVersionBody,
    signal?: AbortSignal,
  ) {
    return request<WorkerVersion>(
      'POST',
      `/workers/${encodeURIComponent(slug)}/versions`,
      { body: data, signal },
    );
  },
};

// ---------------------------------------------------------------------------
// Assembly Line endpoints — /api/assembly-lines
// ---------------------------------------------------------------------------

export const assemblyLines = {
  list(params?: PaginationParams, signal?: AbortSignal) {
    return request<AssemblyLine[]>('GET', '/assembly-lines', {
      params: params as Record<string, unknown>,
      signal,
    });
  },

  get(slug: string, signal?: AbortSignal) {
    return request<AssemblyLineDetail>(
      'GET',
      `/assembly-lines/${encodeURIComponent(slug)}`,
      { signal },
    );
  },

  create(data: CreateAssemblyLineBody, signal?: AbortSignal) {
    return request<AssemblyLine>('POST', '/assembly-lines', {
      body: data,
      signal,
    });
  },

  update(
    slug: string,
    data: UpdateAssemblyLineBody,
    signal?: AbortSignal,
  ) {
    return request<AssemblyLine>(
      'PATCH',
      `/assembly-lines/${encodeURIComponent(slug)}`,
      { body: data, signal },
    );
  },

  delete(slug: string, signal?: AbortSignal) {
    return request<void>(
      'DELETE',
      `/assembly-lines/${encodeURIComponent(slug)}`,
      { signal },
    );
  },

  submitPackage(
    slug: string,
    data: SubmitPackageBody,
    signal?: AbortSignal,
  ) {
    return request<Package>(
      'POST',
      `/assembly-lines/${encodeURIComponent(slug)}/submit`,
      { body: data, signal },
    );
  },

  listPackages(
    slug: string,
    params?: PackagePaginationParams,
    signal?: AbortSignal,
  ) {
    return request<PaginatedResponse<Package>>(
      'GET',
      `/assembly-lines/${encodeURIComponent(slug)}/packages`,
      { params: params as Record<string, unknown>, signal },
    );
  },
};

// ---------------------------------------------------------------------------
// Worker Pool endpoints — /api/worker-pools
// ---------------------------------------------------------------------------

export const workerPools = {
  list(params?: PaginationParams, signal?: AbortSignal) {
    return request<WorkerPoolDetail[]>('GET', '/worker-pools', {
      params: params as Record<string, unknown>,
      signal,
    });
  },

  get(slug: string, signal?: AbortSignal) {
    return request<WorkerPoolDetail>(
      'GET',
      `/worker-pools/${encodeURIComponent(slug)}`,
      { signal },
    );
  },

  create(data: CreateWorkerPoolBody, signal?: AbortSignal) {
    return request<WorkerPool>('POST', '/worker-pools', {
      body: data,
      signal,
    });
  },

  update(
    slug: string,
    data: UpdateWorkerPoolBody,
    signal?: AbortSignal,
  ) {
    return request<WorkerPool>(
      'PATCH',
      `/worker-pools/${encodeURIComponent(slug)}`,
      { body: data, signal },
    );
  },

  delete(slug: string, signal?: AbortSignal) {
    return request<void>(
      'DELETE',
      `/worker-pools/${encodeURIComponent(slug)}`,
      { signal },
    );
  },

  submitPackage(slug: string, data: SubmitPackageBody, signal?: AbortSignal) {
    return request<Package>(
      'POST',
      `/worker-pools/${encodeURIComponent(slug)}/submit`,
      { body: data, signal },
    );
  },
};

// ---------------------------------------------------------------------------
// Notification endpoints — /api/notifications
// ---------------------------------------------------------------------------

export const notifications = {
  list(params?: NotificationQueryParams, signal?: AbortSignal) {
    return request<PaginatedResponse<Notification>>(
      'GET',
      '/notifications',
      { params: params as Record<string, unknown>, signal },
    );
  },

  markRead(id: string, signal?: AbortSignal) {
    return request<Notification>(
      'PATCH',
      `/notifications/${encodeURIComponent(id)}/read`,
      { signal },
    );
  },

  markAllRead(signal?: AbortSignal) {
    return request<void>('PATCH', '/notifications/read-all', { signal });
  },
};

// ---------------------------------------------------------------------------
// Webhook endpoints — /api/webhook-endpoints
// ---------------------------------------------------------------------------

export const webhooks = {
  list(params?: PaginationParams, signal?: AbortSignal) {
    return request<WebhookEndpoint[]>('GET', '/webhook-endpoints', {
      params: params as Record<string, unknown>,
      signal,
    });
  },

  create(data: CreateWebhookBody, signal?: AbortSignal) {
    return request<WebhookEndpoint>('POST', '/webhook-endpoints', {
      body: data,
      signal,
    });
  },

  update(id: string, data: UpdateWebhookBody, signal?: AbortSignal) {
    return request<WebhookEndpoint>(
      'PATCH',
      `/webhook-endpoints/${encodeURIComponent(id)}`,
      { body: data, signal },
    );
  },

  delete(id: string, signal?: AbortSignal) {
    return request<void>(
      'DELETE',
      `/webhook-endpoints/${encodeURIComponent(id)}`,
      { signal },
    );
  },
};

// ---------------------------------------------------------------------------
// Job Log endpoints — /api/jobs/:jobId/logs
// ---------------------------------------------------------------------------

export const jobs = {
  list(params?: JobQueryParams, signal?: AbortSignal) {
    return request<PaginatedResponse<JobExecution>>(
      'GET',
      '/jobs',
      { params: params as Record<string, unknown>, signal },
    );
  },

  getLogs(jobId: string, params?: LogQueryParams, signal?: AbortSignal) {
    return request<LogsResponse>(
      'GET',
      `/jobs/${encodeURIComponent(jobId)}/logs`,
      { params: params as Record<string, unknown>, signal },
    );
  },
};
