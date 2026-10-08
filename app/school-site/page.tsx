import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EduCoreLogo } from "@/components/brand/educore-logo";
import { ButtonLink } from "@/components/ui/button";
import { brandStyle, initialsFor } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { hostnameOf } from "@/lib/tenant-host";

/**
 * A school's public page, shown (via a proxy.ts rewrite of "/") to visitors on
 * that school's verified domain. The school is decided ONLY by the request's
 * hostname, through public_school_site(), which returns nothing unless the
 * host is a verified domain of an active school. It never takes an id from
 * the URL, so it cannot be used to browse other schools (ARCHITECTURE.md §21.5).
 */
async function loadSite() {
  const h = await headers();
  const hostname = hostnameOf(h.get("x-forwarded-host") ?? h.get("host"));
  if (!hostname) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_school_site", { p_domain: hostname });
  if (error || !data || data.length === 0) return null;
  return data[0];
}

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite();
  if (!site) return { title: "Site unavailable", robots: { index: false } };
  return { title: site.name, description: site.motto ?? `${site.name}, ${[site.city, site.country].filter(Boolean).join(", ")}` };
}

export default async function SchoolSitePage() {
  const site = await loadSite();
  if (!site) notFound();

  const place = [site.address, site.city, site.county, site.country].filter(Boolean).join(", ");
  const contacts: { label: string; value: string; href?: string }[] = [];
  if (place) contacts.push({ label: "Address", value: place });
  if (site.phone) contacts.push({ label: "Phone", value: site.phone, href: `tel:${site.phone.replace(/[^+\d]/g, "")}` });
  if (site.email) contacts.push({ label: "Email", value: site.email, href: `mailto:${site.email}` });
  if (site.website) contacts.push({ label: "Website", value: site.website.replace(/^https?:\/\//, ""), href: site.website });

  return (
    <div className="flex min-h-dvh flex-col" style={brandStyle(site.primary_color)}>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {site.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- school-supplied https logo from any host
              <img src={site.logo_url} alt="" className="h-9 w-9 rounded object-contain" />
            ) : (
              <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded bg-[var(--brand)] text-sm font-semibold text-[var(--brand-foreground)]">
                {initialsFor(site.name)}
              </span>
            )}
            <span className="truncate font-semibold text-foreground">{site.name}</span>
          </div>
          <ButtonLink href="/login" size="sm">
            Sign in
          </ButtonLink>
        </div>
      </header>

      <main className="flex-1">
        <section
          className="bg-[var(--brand)] text-[var(--brand-foreground)]"
          style={site.cover_image_url ? { backgroundImage: `linear-gradient(rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.55)), url("${encodeURI(site.cover_image_url)}")`, backgroundSize: "cover", backgroundPosition: "center", color: "#ffffff" } : undefined}
        >
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">{site.name}</h1>
            {site.motto ? <p className="mt-4 max-w-xl text-lg opacity-90">{site.motto}</p> : null}
            <div className="mt-8">
              <ButtonLink href="/login" variant="secondary">
                Students, parents and staff: sign in
              </ButtonLink>
            </div>
          </div>
        </section>

        {site.about ? (
          <section className="mx-auto max-w-3xl px-4 pt-12 sm:px-6" aria-labelledby="about-title">
            <h2 id="about-title" className="text-xl font-semibold text-foreground">
              About us
            </h2>
            <div className="mt-4 space-y-4 text-foreground">
              {site.about.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="whitespace-pre-line">
                  {para}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {contacts.length > 0 ? (
          <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6" aria-labelledby="contact-title">
            <h2 id="contact-title" className="text-xl font-semibold text-foreground">
              Contact
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {contacts.map((c) => (
                <div key={c.label}>
                  <dt className="text-sm text-muted">{c.label}</dt>
                  <dd className="text-foreground">
                    {c.href ? (
                      <a href={c.href} className="text-brand hover:underline" {...(c.label === "Website" ? { rel: "noopener noreferrer" } : {})}>
                        {c.value}
                      </a>
                    ) : (
                      c.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 text-sm text-muted sm:px-6">
          <span>© {site.name}</span>
          <span className="flex items-center gap-2">
            Powered by <EduCoreLogo />
          </span>
        </div>
      </footer>
    </div>
  );
}
