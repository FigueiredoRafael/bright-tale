import React from "react";

export default function ProjectDiscoveryPage({ params }: { params: { id: string } }) {
    return (
        <div>
            <h1 className="text-2xl font-bold">Project Discovery (placeholder)</h1>
            <p className="text-sm text-muted-foreground">Project ID: {params.id}</p>
        </div>
    );
}
