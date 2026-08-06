import { describe, expect, it } from "vitest";
import { isMissingColumnError } from "../src/lib/supabase/schema-errors";

describe("isMissingColumnError", () => {
  it("detects Postgres missing-column errors", () => {
    expect(isMissingColumnError({
      code: "42703",
      message: "column profiles.account_type does not exist",
    }, ["account_type", "document_type"])).toBe(true);
  });

  it("detects PostgREST schema cache errors", () => {
    expect(isMissingColumnError({
      code: "PGRST204",
      message: "Could not find the 'document_type' column of 'profiles' in the schema cache",
    }, ["document_type"])).toBe(true);
  });

  it("ignores unrelated database errors", () => {
    expect(isMissingColumnError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    }, ["document_type"])).toBe(false);
  });
});
