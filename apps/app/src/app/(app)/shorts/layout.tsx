import type { Metadata } from "next";
import DashboardLayout from "@/components/layout/DashboardLayout";

export const metadata: Metadata = {
    title: "Shorts Library | Bright Curios",
    description: "Manage your shorts and vertical video drafts",
};

export default function ShortsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardLayout>{children}</DashboardLayout>;
}
