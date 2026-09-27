import { SectionTabs } from "@/components/ui/section-tabs";
import { requireCapability } from "@/services/auth";

const TABS = [
  { href: "/academics", label: "Academic years", exact: true },
  { href: "/academics/grades", label: "Grade levels" },
  { href: "/academics/subjects", label: "Subjects" },
] as const;

export default async function AcademicsLayout({ children }: LayoutProps<"/academics">) {
  // Layouts don't re-run on client navigation, so every page guards itself too.
  await requireCapability("school.manage", "/academics");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Academic setup</h1>
        <p className="mt-1 text-sm text-muted">Academic years, marking periods, grade levels and subjects for your school.</p>
      </div>
      <SectionTabs label="Academic setup sections" tabs={TABS} />
      {children}
    </div>
  );
}
