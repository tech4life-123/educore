import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getSchoolDomainBase } from "@/lib/env";

const original = process.env.EDUCORE_SCHOOL_DOMAIN;
afterEach(() => {
  if (original === undefined) delete process.env.EDUCORE_SCHOOL_DOMAIN;
  else process.env.EDUCORE_SCHOOL_DOMAIN = original;
});

test("the base domain is off unless it is a plain hostname", () => {
  delete process.env.EDUCORE_SCHOOL_DOMAIN;
  assert.equal(getSchoolDomainBase(), undefined);
  for (const bad of ["", "localhost", "https://educore.example", "educore.example/path", "a b.example", "*.educore.example"]) {
    process.env.EDUCORE_SCHOOL_DOMAIN = bad;
    assert.equal(getSchoolDomainBase(), undefined, bad);
  }
  process.env.EDUCORE_SCHOOL_DOMAIN = "  Schools.EduCore.Example ";
  assert.equal(getSchoolDomainBase(), "schools.educore.example");
});
