import DashboardLayout from "@/components/layout/DashboardLayout";

export default function IdeasLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardLayout>{children}</DashboardLayout>;
}
