import { EduCoreLogo } from "@/components/brand/educore-logo";
import { ButtonLink } from "@/components/ui/button";

const pillars = [
  {
    title: "Built for many schools",
    body: "Each school gets its own branded, isolated workspace on a single shared platform.",
  },
  {
    title: "Secure by design",
    body: "Every record is scoped to its school and protected at the database level.",
  },
  {
    title: "Ready for growth",
    body: "Starting with Liberian high schools, designed to extend to colleges and universities.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <EduCoreLogo />
          <ButtonLink href="/login" size="sm">
            Sign in
          </ButtonLink>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">School management platform</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            One Platform. Many Schools.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            EduCore gives administrators, teachers, students and parents one clear place to run school life.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/login" size="lg">
              Sign in to your school
            </ButtonLink>
          </div>
        </section>

        <section aria-labelledby="pillars-heading" className="border-t border-border bg-surface">
          <h2 id="pillars-heading" className="sr-only">
            Why EduCore
          </h2>
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3 sm:px-6">
            {pillars.map((pillar) => (
              <div key={pillar.title}>
                <h3 className="text-base font-semibold text-foreground">{pillar.title}</h3>
                <p className="mt-2 text-sm text-muted">{pillar.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-6 text-center text-xs text-subtle">
        © {new Date().getFullYear()} EduCore
      </footer>
    </div>
  );
}
