import type { Metadata } from "next";
import DashboardLayout from "@/components/layout/DashboardLayout";

export const metadata: Metadata = {
    title: "Podcast Outlines | Bright Curios",
    description: "Manage your podcast episode drafts and talking points",
};

export default function PodcastsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardLayout>{children}</DashboardLayout>;
}
