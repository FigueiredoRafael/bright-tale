import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProjectsDashboard from "../page";
import { vi, beforeEach, afterEach, expect } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// Mock fetch globally
const originalFetch = global.fetch;

describe("ProjectsDashboard integration", () => {
    beforeEach(() => {
        global.fetch = vi.fn((url: any) => {
            if (typeof url === "string" && url.startsWith("/api/projects")) {
                return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "p1", title: "First" }] })));
            }
            return Promise.resolve(new Response(JSON.stringify({})));
        }) as any;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it("calls API with search and filters", async () => {
        render(<ProjectsDashboard />);

        const search = screen.getByLabelText("search");
        fireEvent.change(search, { target: { value: "habit" } });

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/projects?search=habit")));

        const stage = screen.getByLabelText("stage-filter");
        fireEvent.change(stage, { target: { value: "production" } });

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("stage=production")));
    });
});
