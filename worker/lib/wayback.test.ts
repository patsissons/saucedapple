// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  fixture,
  makeFetch,
  testEnv,
  type FakeUpstream,
} from "../test-support";
import { findWaybackSnapshot } from "./wayback";

const STORY = "https://publisher.test/story";
const AVAILABILITY = `https://wayback.test/available?url=${encodeURIComponent(STORY)}`;

describe("findWaybackSnapshot", () => {
  it("returns the raw snapshot URL when a snapshot exists", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        [AVAILABILITY]: () => new Response(fixture("wayback-available.json")),
      },
    };
    await expect(
      findWaybackSnapshot(makeFetch(upstream), testEnv, STORY),
    ).resolves.toBe(`https://snapshots.test/20260728182004id_/${STORY}`);
  });

  it("returns null when no snapshot exists", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        [AVAILABILITY]: () => new Response(fixture("wayback-unavailable.json")),
      },
    };
    await expect(
      findWaybackSnapshot(makeFetch(upstream), testEnv, STORY),
    ).resolves.toBeNull();
  });

  it("returns null when the availability API errors or rate-limits", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        "*": () => new Response("429 Too Many Requests", { status: 429 }),
      },
    };
    await expect(
      findWaybackSnapshot(makeFetch(upstream), testEnv, STORY),
    ).resolves.toBeNull();
  });
});
