import DashboardLayout from "@/components/layout/DashboardLayout";

/**
 * Shared layout for all (app) routes — keeps sidebar/topbar mounted across
 * navigation so channel switcher doesn't flicker/reload on every page change.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
