import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type {
  Package,
  Worker,
  AssemblyLine,
  WorkerPool,
} from '@smithy/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListParams {
  page?: number;
  limit?: number;
  sort?: string;
  filter?: Record<string, string>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface CreatePackageData {
  type: string;
  metadata?: Record<string, unknown>;
  assemblyLineId?: string;
}

export interface SubmitPackageData {
  type: string;
  metadata?: Record<string, unknown>;
}

export interface PresignFileData {
  filename: string;
  contentType: string;
}

export interface PresignFileResponse {
  uploadUrl: string;
  fileKey: string;
}

export interface ConfirmFileData {
  fileKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PackageFileRecord {
  id: string;
  packageId: string;
  fileKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface JobLogEntry {
  id: string;
  jobId: string;
  level: string;
  message: string;
  timestamp: string;
}

export interface JobLogsParams {
  page?: number;
  limit?: number;
  level?: string;
  after?: string;
  before?: string;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class CliApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'CliApiError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'http://localhost:3000/api';

let resolvedBaseUrl: string | undefined;

function buildSearchParams(params?: ListParams): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.page !== undefined) sp.set('page', String(params.page));
  if (params.limit !== undefined) sp.set('limit', String(params.limit));
  if (params.sort !== undefined) sp.set('sort', params.sort);
  if (params.filter) {
    for (const [key, value] of Object.entries(params.filter)) {
      sp.set(key, value);
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

function buildJobLogsSearchParams(params?: JobLogsParams): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.page !== undefined) sp.set('page', String(params.page));
  if (params.limit !== undefined) sp.set('limit', String(params.limit));
  if (params.level !== undefined) sp.set('level', params.level);
  if (params.after !== undefined) sp.set('after', params.after);
  if (params.before !== undefined) sp.set('before', params.before);
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

async function loadConfigApiUrl(): Promise<string | undefined> {
  try {
    const configPath = join(homedir(), '.smithy', 'config.json');
    const raw = await readFile(configPath, 'utf-8');
    const config = JSON.parse(raw) as { apiUrl?: string };
    return config.apiUrl || undefined;
  } catch {
    return undefined;
  }
}

export async function resolveBaseUrl(): Promise<string> {
  if (resolvedBaseUrl !== undefined) return resolvedBaseUrl;

  const envUrl = process.env['SMITHY_API_URL'];
  if (envUrl) {
    resolvedBaseUrl = envUrl;
    return resolvedBaseUrl;
  }

  const configUrl = await loadConfigApiUrl();
  if (configUrl) {
    resolvedBaseUrl = configUrl;
    return resolvedBaseUrl;
  }

  resolvedBaseUrl = DEFAULT_BASE_URL;
  return resolvedBaseUrl;
}

/**
 * Reset the cached base URL. Useful for testing or when config changes.
 */
export function resetBaseUrl(): void {
  resolvedBaseUrl = undefined;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const baseUrl = await resolveBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = response.statusText || `HTTP ${response.status}`;
    let details: Record<string, string[]> | undefined;

    try {
      const errorBody = (await response.json()) as {
        message?: string;
        details?: Record<string, string[]>;
      };
      if (errorBody.message) message = errorBody.message;
      if (errorBody.details) details = errorBody.details;
    } catch {
      // Response body is not JSON — use status text
    }

    throw new CliApiError(response.status, message, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Namespaced method groups
// ---------------------------------------------------------------------------

export const packages = {
  list(params?: ListParams): Promise<PaginatedResponse<Package>> {
    return request('GET', `/packages${buildSearchParams(params)}`);
  },
  get(id: string): Promise<Package> {
    return request('GET', `/packages/${encodeURIComponent(id)}`);
  },
  create(data: CreatePackageData): Promise<Package> {
    return request('POST', '/packages', data);
  },
  presign(id: string, data: PresignFileData): Promise<PresignFileResponse> {
    return request(
      'POST',
      `/packages/${encodeURIComponent(id)}/files/presign`,
      data,
    );
  },
  confirmFile(id: string, data: ConfirmFileData): Promise<PackageFileRecord> {
    return request(
      'POST',
      `/packages/${encodeURIComponent(id)}/files/confirm`,
      data,
    );
  },
};

/**
 * Upload a file to a presigned URL via PUT.
 * This goes directly to S3, not through the API.
 */
export async function uploadToPresignedUrl(
  url: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });
  if (!response.ok) {
    throw new CliApiError(
      response.status,
      `File upload failed: ${response.statusText || `HTTP ${response.status}`}`,
    );
  }
}

export const workers = {
  list(params?: ListParams): Promise<PaginatedResponse<Worker>> {
    return request('GET', `/workers${buildSearchParams(params)}`);
  },
  get(slug: string): Promise<Worker> {
    return request('GET', `/workers/${encodeURIComponent(slug)}`);
  },
};

export const assemblyLines = {
  list(params?: ListParams): Promise<PaginatedResponse<AssemblyLine>> {
    return request('GET', `/assembly-lines${buildSearchParams(params)}`);
  },
  get(slug: string): Promise<AssemblyLine> {
    return request('GET', `/assembly-lines/${encodeURIComponent(slug)}`);
  },
  submit(slug: string, data: SubmitPackageData): Promise<Package> {
    return request(
      'POST',
      `/assembly-lines/${encodeURIComponent(slug)}/packages`,
      data,
    );
  },
};

export const workerPools = {
  list(params?: ListParams): Promise<PaginatedResponse<WorkerPool>> {
    return request('GET', `/worker-pools${buildSearchParams(params)}`);
  },
  get(slug: string): Promise<WorkerPool> {
    return request('GET', `/worker-pools/${encodeURIComponent(slug)}`);
  },
  submit(slug: string, data: SubmitPackageData): Promise<Package> {
    return request(
      'POST',
      `/worker-pools/${encodeURIComponent(slug)}/packages`,
      data,
    );
  },
};

export const jobs = {
  getLogs(
    jobId: string,
    params?: JobLogsParams,
  ): Promise<PaginatedResponse<JobLogEntry>> {
    return request(
      'GET',
      `/jobs/${encodeURIComponent(jobId)}/logs${buildJobLogsSearchParams(params)}`,
    );
  },
};
