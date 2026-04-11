"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import StartWorkflowButton from "@/components/projects/StartWorkflowButton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function Home() {
  const [projectsCount, setProjectsCount] = useState<number | null>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const json = await res.json();
        const projects = json.data?.projects || [];
        setProjectsCount(json.data?.pagination?.total ?? projects.length);
        setRecent(projects.slice(0, 5));
      } catch (e) {
        // ignore
      }
    };
    load();
  }, []);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
            </CardHeader>
            <CardContent>{projectsCount ?? "..."}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <StartWorkflowButton />
                <Link href="/projects" className="ml-2 underline">
                  View Projects
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/templates" className="underline">
                Manage Templates
              </Link>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Recent Projects</h2>
          <div className="grid gap-3">
            {recent.length === 0 ? (
              <div>No projects yet</div>
            ) : (
              recent.map((p) => (
                <div key={p.id} className="p-3 rounded-md bg-white border">
                  <Link href={`/projects/${p.id}`}>{p.title}</Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
