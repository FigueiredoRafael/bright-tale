/**
 * Tests for saveContentDraft utility
 * Verifies correct HTTP method selection, response handling, and error propagation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveContentDraft, type SaveResult } from "../workflow/contentSaver";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

function mockOkResponse(data: Record<string, unknown>) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data }),
  } as Response);
}

function mockErrorResponse(status = 400) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ error: "Validation failed" }),
  } as unknown as Response);
}

describe("saveContentDraft — POST (new record)", () => {
  it("calls POST /api/{format} when no savedId provided", async () => {
    mockFetch.mockReturnValue(mockOkResponse({ blog: { id: "abc123" } }));

    const result = await saveContentDraft({
      format: "blog",
      data: { title: "Test" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/blogs",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.success).toBe(true);
    expect(result.id).toBe("abc123");
  });

  it("calls POST /api/videos when format is 'video'", async () => {
    mockFetch.mockReturnValue(mockOkResponse({ video: { id: "vid-001" } }));

    const result = await saveContentDraft({
      format: "video",
      data: { title: "Video Title" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/videos",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.id).toBe("vid-001");
  });

  it("calls POST /api/shorts when format is 'shorts'", async () => {
    mockFetch.mockReturnValue(mockOkResponse({ shorts: { id: "sht-001" } }));

    await saveContentDraft({ format: "shorts", data: { shorts: [] } });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/shorts",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("calls POST /api/podcasts when format is 'podcast'", async () => {
    mockFetch.mockReturnValue(mockOkResponse({ podcast: { id: "pod-001" } }));

    await saveContentDraft({ format: "podcast", data: {} });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/podcasts",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("saveContentDraft — PUT (existing record)", () => {
  it("calls PUT /api/{format}/{id} when savedId provided", async () => {
    mockFetch.mockReturnValue(mockOkResponse({ blog: { id: "existing-id" } }));

    await saveContentDraft({
      format: "blog",
      data: { title: "Updated" },
      savedId: "existing-id",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/blogs/existing-id",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("returns same id on successful PUT", async () => {
    mockFetch.mockReturnValue(mockOkResponse({ blog: { id: "existing-id" } }));

    const result = await saveContentDraft({
      format: "blog",
      data: {},
      savedId: "existing-id",
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe("existing-id");
  });
});

describe("saveContentDraft — error handling", () => {
  it("returns failure when server returns non-ok response (POST)", async () => {
    mockFetch.mockReturnValue(mockErrorResponse(400));

    const result = await saveContentDraft({ format: "blog", data: {} });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns failure when server returns non-ok response (PUT)", async () => {
    mockFetch.mockReturnValue(mockErrorResponse(500));

    const result = await saveContentDraft({
      format: "video",
      data: {},
      savedId: "some-id",
    });

    expect(result.success).toBe(false);
  });

  it("returns failure on network error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await saveContentDraft({ format: "blog", data: {} });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("sends Content-Type: application/json header", async () => {
    mockFetch.mockReturnValue(mockOkResponse({ blog: { id: "x" } }));

    await saveContentDraft({ format: "blog", data: { title: "Test" } });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });
});
