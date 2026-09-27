# Demonstration data

Fictional schools for showing EduCore to schools and the Ministry of Education.
Every demo school has `schools.is_demo = true`, so the app:

- shows a "Demonstration school" banner to everyone signed in to it,
- prints "DEMONSTRATION — fictional student and school data · not a real record" on its report cards,
- labels it "Demo" on the platform screens, and lets the statistics include or exclude it
  (the printable Ministry report carries a red "includes demonstration schools" notice).

The generator lives in the database's `demo` schema (migration `…_demo_data_generator.sql`).
It is not exposed through the API and only the database owner can run it — use the Supabase
SQL editor.

| File | Purpose |
| --- | --- |
| `generate.sql` | Creates the seven demo schools (2025/2026, a complete school year) |
| `verify.sql` | Integrity checks — every check must be 0 |
| `remove.sql` | Deletes every demo school, its people and their Auth accounts |

## What a demo school contains

- A principal (school administrator), 9 or 18 teachers, 100–270 students, one parent or guardian per student
- Grades 9–12, nine subjects, staff and student records (no phone numbers, so nobody real can be contacted)
- 2025/2026: two semesters, six marking periods (a quiz, an assignment and a test each) and two exams,
  all submitted and published
- A register for every class on every school day (Liberian public holidays and school breaks excluded)
- Report cards for both semesters, computed with exactly the app's rules (checked against
  `lib/grades/compute.ts`), with homeroom remarks and automatic promotion
- A year of announcements

Generated people can't sign in (their Auth accounts have no password). To walk through a demo
school, the super admin opens it under Platform → Schools and uses **Add an administrator**.
That administrator can then give any demo teacher, student or parent a temporary password from
User accounts.

Differences between the demo schools (results, attendance) are invented to show how the
dashboards reveal gaps. They say nothing about real schools or counties.

## How it is written

Bulk rows are inserted with `session_replication_role = replica` (triggers off) so hundreds of
thousands of fictional rows don't flood the audit log. The school row itself is inserted
normally so its seeding triggers run. Because triggers are off, `verify.sql` checks every
foreign key and every rule the triggers would have enforced.

## Size

About 0.13 MB per student, mostly attendance marks. The seven schools add roughly 130 MB;
`remove.sql` frees it.
