// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fixture } from "../../test-support";
import { isBlockedStatus, looksPaywalled } from "./detect";

describe("isBlockedStatus", () => {
  it.each([401, 402, 403, 429, 451])("treats %d as blocked", (status) => {
    expect(isBlockedStatus(status)).toBe(true);
  });

  it.each([200, 301, 404, 500])("does not treat %d as blocked", (status) => {
    expect(isBlockedStatus(status)).toBe(false);
  });
});

describe("looksPaywalled", () => {
  it("detects the schema.org paywall marker", () => {
    expect(looksPaywalled(fixture("publisher-paywalled.html"))).toBe(true);
    expect(looksPaywalled('"isAccessibleForFree": "False"')).toBe(true);
  });

  it("passes free articles", () => {
    expect(looksPaywalled(fixture("publisher-article.html"))).toBe(false);
    expect(looksPaywalled('"isAccessibleForFree": true')).toBe(false);
  });
});
