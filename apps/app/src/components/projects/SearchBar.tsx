"use client";

import { useEffect, useState } from "react";

interface SearchBarProps {
    defaultValue?: string;
    onSearch: (value: string) => void;
    delay?: number;
}

export default function SearchBar({ defaultValue = "", onSearch, delay = 300 }: SearchBarProps) {
    const [value, setValue] = useState(defaultValue);

    useEffect(() => {
        const timer = setTimeout(() => {
            onSearch(value.trim());
        }, delay);

        return () => clearTimeout(timer);
    }, [value, onSearch, delay]);

    return (
        <input
            aria-label="search"
            type="search"
            className="rounded-md border px-3 py-2 w-full max-w-md"
            placeholder="Search projects..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
        />
    );
}
