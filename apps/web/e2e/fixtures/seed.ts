const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000/api";

interface Worker {
  id: string;
  slug: string;
  name: string;
}

interface WorkerVersion {
  id: string;
  version: number;
}

interface AssemblyLine {
  id: string;
  slug: string;
  name: string;
}

interface WorkerPool {
  id: string;
  slug: string;
  name: string;
}

interface Package {
  id: string;
  type: string;
}

export interface SeedData {
  workers: { summarizer: Worker; specWriter: Worker };
  versions: { summarizer: WorkerVersion; specWriter: WorkerVersion };
  assemblyLine: AssemblyLine;
  workerPool: WorkerPool;
  package: Package;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `POST ${path} failed with ${response.status}: ${text}`,
    );
  }

  return response.json() as Promise<T>;
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GET ${path} failed with ${response.status}: ${text}`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * POST to create, or GET existing on 409 conflict.
 */
async function apiPostIdempotent<T>(
  postPath: string,
  body: unknown,
  getPath: string,
): Promise<T> {
  try {
    return await apiPost<T>(postPath, body);
  } catch (err) {
    if (err instanceof Error && err.message.includes("409")) {
      return apiGet<T>(getPath);
    }
    throw err;
  }
}

export async function seedTestData(): Promise<SeedData> {
  const summarizer = await apiPostIdempotent<Worker>(
    "/workers",
    { name: "summarizer", description: "Summarizes input text into concise output" },
    "/workers/summarizer",
  );

  const specWriter = await apiPostIdempotent<Worker>(
    "/workers",
    { name: "spec-writer", description: "Generates specification documents from requirements" },
    "/workers/spec-writer",
  );

  const summarizerVersion = await apiPost<WorkerVersion>(
    `/workers/${summarizer.slug}/versions`,
    {
      yamlConfig: {
        name: "summarizer",
        inputTypes: ["text/plain"],
        outputType: "text/plain",
        provider: {
          name: "anthropic",
          model: "claude-sonnet-4-20250514",
          apiKeyEnv: "ANTHROPIC_API_KEY",
        },
      },
    },
  );

  const specWriterVersion = await apiPost<WorkerVersion>(
    `/workers/${specWriter.slug}/versions`,
    {
      yamlConfig: {
        name: "spec-writer",
        inputTypes: ["text/plain"],
        outputType: "text/plain",
        provider: {
          name: "anthropic",
          model: "claude-sonnet-4-20250514",
          apiKeyEnv: "ANTHROPIC_API_KEY",
        },
      },
    },
  );

  const assemblyLine = await apiPostIdempotent<AssemblyLine>(
    "/assembly-lines",
    {
      name: "summarize-then-spec",
      description: "Summarizes input then writes a spec",
      steps: [
        { workerVersionId: summarizerVersion.id },
        { workerVersionId: specWriterVersion.id },
      ],
    },
    "/assembly-lines/summarize-then-spec",
  );

  const workerPool = await apiPostIdempotent<WorkerPool>(
    "/worker-pools",
    {
      name: "text-processors",
      maxConcurrency: 5,
      members: [
        { workerVersionId: summarizerVersion.id, priority: 1 },
        { workerVersionId: specWriterVersion.id, priority: 2 },
      ],
    },
    "/worker-pools/text-processors",
  );

  const pkg = await apiPost<Package>("/packages", {
    type: "test-input",
    metadata: { source: "e2e-seed" },
  });

  return {
    workers: { summarizer, specWriter },
    versions: { summarizer: summarizerVersion, specWriter: specWriterVersion },
    assemblyLine,
    workerPool,
    package: pkg,
  };
}
