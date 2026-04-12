import type { Metadata } from "next";
import DashboardLayout from "@/components/layout/DashboardLayout";

export const metadata: Metadata = {
    title: "Image Bank | Bright Curios",
    description: "AI-generated image gallery. Create, manage, and download visual assets for your projects",
};

export default function ImagesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardLayout>{children}</DashboardLayout>;
}
