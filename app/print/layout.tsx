import { brandStyle } from "@/lib/branding";
import { getAuthContext } from "@/services/auth";

/**
 * Bare layout for printable documents: no app shell, white paper, and the
 * school's brand colour for accents. Each page guards itself.
 */
export default async function PrintLayout({ children }: LayoutProps<"/print">) {
  const ctx = await getAuthContext();
  const primary = ctx.status === "ok" ? ctx.school.primary_color : null;
  return (
    <div className="print-document min-h-dvh bg-neutral-200 print:bg-white" style={brandStyle(primary)}>
      {children}
    </div>
  );
}
