import { describe, expect, it } from "vitest";

/**
 * The anon key is public by design; a service_role key is not. Shipping one to a
 * browser bypasses row-level security entirely, so the guard has to be real.
 */
function decodeRole(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role ?? null;
  } catch {
    return null;
  }
}

const anon =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJyb2xlIjoiYW5vbiJ9.sig";
const service =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig";

describe("key role guard", () => {
  it("recognises an anon key", () => {
    expect(decodeRole(anon)).toBe("anon");
  });

  it("recognises a service_role key, which must never reach the client", () => {
    expect(decodeRole(service)).toBe("service_role");
  });

  it("does not throw on a malformed value", () => {
    expect(decodeRole("not-a-jwt")).toBeNull();
    expect(decodeRole("")).toBeNull();
  });
});
