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

export async function seedTestData(): Promise<SeedData> {
  const summarizer = await apiPost<Worker>("/workers", {
    name: "summarizer",
    description: "Summarizes input text into concise output",
  });

  const specWriter = await apiPost<Worker>("/workers", {
    name: "spec-writer",
    description: "Generates specification documents from requirements",
  });

  const summarizerVersion = await apiPost<WorkerVersion>(
    `/workers/${summarizer.slug}/versions`,
    {
      yamlConfig: {
        name: "summarizer",
        version: "1.0.0",
        entrypoint: "index.ts",
        inputs: [{ name: "text", type: "string" }],
        outputs: [{ name: "summary", type: "string" }],
      },
    },
  );

  const specWriterVersion = await apiPost<WorkerVersion>(
    `/workers/${specWriter.slug}/versions`,
    {
      yamlConfig: {
        name: "spec-writer",
        version: "1.0.0",
        entrypoint: "index.ts",
        inputs: [{ name: "requirements", type: "string" }],
        outputs: [{ name: "spec", type: "string" }],
      },
    },
  );

  const assemblyLine = await apiPost<AssemblyLine>("/assembly-lines", {
    name: "summarize-then-spec",
    description: "Summarizes input then writes a spec",
    steps: [
      { workerVersionId: summarizerVersion.id },
      { workerVersionId: specWriterVersion.id },
    ],
  });

  const workerPool = await apiPost<WorkerPool>("/worker-pools", {
    name: "text-processors",
    maxConcurrency: 5,
    members: [
      { workerVersionId: summarizerVersion.id, priority: 1 },
      { workerVersionId: specWriterVersion.id, priority: 2 },
    ],
  });

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
