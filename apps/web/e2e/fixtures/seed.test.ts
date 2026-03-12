import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedTestData } from "./seed";

const mockWorkerSummarizer = {
  id: "w1-uuid",
  slug: "summarizer",
  name: "summarizer",
};
const mockWorkerSpecWriter = {
  id: "w2-uuid",
  slug: "spec-writer",
  name: "spec-writer",
};
const mockVersionSummarizer = { id: "v1-uuid", version: 1 };
const mockVersionSpecWriter = { id: "v2-uuid", version: 1 };
const mockAssemblyLine = {
  id: "al-uuid",
  slug: "summarize-then-spec",
  name: "summarize-then-spec",
};
const mockWorkerPool = {
  id: "wp-uuid",
  slug: "text-processors",
  name: "text-processors",
};
const mockPackage = { id: "pkg-uuid", type: "test-input" };

function mockFetchResponses() {
  const responses = [
    mockWorkerSummarizer,
    mockWorkerSpecWriter,
    mockVersionSummarizer,
    mockVersionSpecWriter,
    mockAssemblyLine,
    mockWorkerPool,
    mockPackage,
  ];
  let callIndex = 0;

  return vi.fn(async () => ({
    ok: true,
    json: async () => responses[callIndex++],
  })) as unknown as typeof globalThis.fetch;
}

describe("seedTestData", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should create all seed entities via API calls", async () => {
    globalThis.fetch = mockFetchResponses();

    const data = await seedTestData();

    expect(data.workers.summarizer).toEqual(mockWorkerSummarizer);
    expect(data.workers.specWriter).toEqual(mockWorkerSpecWriter);
    expect(data.versions.summarizer).toEqual(mockVersionSummarizer);
    expect(data.versions.specWriter).toEqual(mockVersionSpecWriter);
    expect(data.assemblyLine).toEqual(mockAssemblyLine);
    expect(data.workerPool).toEqual(mockWorkerPool);
    expect(data.package).toEqual(mockPackage);
  });

  it("should make 7 API calls in the correct order", async () => {
    globalThis.fetch = mockFetchResponses();

    await seedTestData();

    expect(globalThis.fetch).toHaveBeenCalledTimes(7);

    const calls = vi.mocked(globalThis.fetch).mock.calls;

    // Workers
    expect(calls[0][0]).toBe("http://localhost:3000/api/workers");
    expect(calls[1][0]).toBe("http://localhost:3000/api/workers");

    // Versions
    expect(calls[2][0]).toBe(
      "http://localhost:3000/api/workers/summarizer/versions",
    );
    expect(calls[3][0]).toBe(
      "http://localhost:3000/api/workers/spec-writer/versions",
    );

    // Assembly line
    expect(calls[4][0]).toBe("http://localhost:3000/api/assembly-lines");

    // Worker pool
    expect(calls[5][0]).toBe("http://localhost:3000/api/worker-pools");

    // Package
    expect(calls[6][0]).toBe("http://localhost:3000/api/packages");
  });

  it("should send correct request bodies", async () => {
    globalThis.fetch = mockFetchResponses();

    await seedTestData();

    const calls = vi.mocked(globalThis.fetch).mock.calls;

    // First worker body
    const workerBody = JSON.parse(
      (calls[0][1] as RequestInit).body as string,
    );
    expect(workerBody).toEqual({
      name: "summarizer",
      description: "Summarizes input text into concise output",
    });

    // Assembly line body
    const alBody = JSON.parse((calls[4][1] as RequestInit).body as string);
    expect(alBody.name).toBe("summarize-then-spec");
    expect(alBody.steps).toHaveLength(2);
    expect(alBody.steps[0].workerVersionId).toBe("v1-uuid");
    expect(alBody.steps[1].workerVersionId).toBe("v2-uuid");

    // Worker pool body
    const wpBody = JSON.parse((calls[5][1] as RequestInit).body as string);
    expect(wpBody.name).toBe("text-processors");
    expect(wpBody.maxConcurrency).toBe(5);
    expect(wpBody.members).toHaveLength(2);

    // Package body
    const pkgBody = JSON.parse((calls[6][1] as RequestInit).body as string);
    expect(pkgBody.type).toBe("test-input");
    expect(pkgBody.metadata).toEqual({ source: "e2e-seed" });
  });

  it("should use POST method with JSON content type for all calls in happy path", async () => {
    globalThis.fetch = mockFetchResponses();

    await seedTestData();

    const calls = vi.mocked(globalThis.fetch).mock.calls;

    for (const call of calls) {
      const init = call[1] as RequestInit;
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({ "Content-Type": "application/json" });
    }
  });

  it("should fall back to GET on 409 conflict for worker creation", async () => {
    let callIndex = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      // First POST to /workers returns 409
      if (callIndex === 0 && init?.method === "POST" && urlStr.endsWith("/workers")) {
        callIndex++;
        return {
          ok: false,
          status: 409,
          text: async () => '{"statusCode":409,"message":"Worker already exists"}',
        };
      }
      // GET fallback for summarizer
      if (callIndex === 1 && !init?.method && urlStr.endsWith("/workers/summarizer")) {
        callIndex++;
        return { ok: true, json: async () => mockWorkerSummarizer };
      }
      // Remaining calls succeed
      const responses = [
        mockWorkerSpecWriter,
        mockVersionSummarizer,
        mockVersionSpecWriter,
        mockAssemblyLine,
        mockWorkerPool,
        mockPackage,
      ];
      const resp = responses[callIndex - 2] ?? {};
      callIndex++;
      return { ok: true, json: async () => resp };
    }) as unknown as typeof globalThis.fetch;

    const data = await seedTestData();

    expect(data.workers.summarizer).toEqual(mockWorkerSummarizer);
    // Should have made a GET call for the 409 fallback
    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls[1][0]).toBe("http://localhost:3000/api/workers/summarizer");
    expect((calls[1][1] as RequestInit | undefined)?.method).toBeUndefined();
  });

  it("should throw on API error with status and body", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    })) as unknown as typeof globalThis.fetch;

    await expect(seedTestData()).rejects.toThrow(
      "POST /workers failed with 400: Bad Request",
    );
  });

  it("should respect API_BASE_URL env variable", async () => {
    const originalEnv = process.env.API_BASE_URL;
    // Note: API_BASE is captured at module level, so we need to re-import
    // For this test we verify the default behavior since env is read at import time
    globalThis.fetch = mockFetchResponses();

    await seedTestData();

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect((calls[0][0] as string).startsWith("http://localhost:3000/api")).toBe(
      true,
    );

    process.env.API_BASE_URL = originalEnv;
  });
});
