import DashboardLayout from "@/components/layout/DashboardLayout";

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
