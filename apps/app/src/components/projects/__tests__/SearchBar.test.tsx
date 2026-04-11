import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SearchBar from "../SearchBar";
import { vi } from "vitest";

describe("SearchBar", () => {
    it("debounces calls to onSearch", async () => {
        const onSearch = vi.fn();
        render(<SearchBar onSearch={onSearch} delay={100} />);

        const input = screen.getByLabelText("search");
        fireEvent.change(input, { target: { value: "a" } });
        fireEvent.change(input, { target: { value: "ab" } });
        fireEvent.change(input, { target: { value: "abc" } });

        await waitFor(() => expect(onSearch).toHaveBeenCalledWith("abc"), { timeout: 500 });
    });
});
