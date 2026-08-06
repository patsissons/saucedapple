// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isBlockedStatus } from "./detect";

describe("isBlockedStatus", () => {
  it.each([401, 402, 403, 429, 451])("treats %d as blocked", (status) => {
    expect(isBlockedStatus(status)).toBe(true);
  });

  it.each([200, 301, 404, 500])("does not treat %d as blocked", (status) => {
    expect(isBlockedStatus(status)).toBe(false);
  });
});
