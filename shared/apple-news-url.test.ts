// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseAppleNewsUrl } from "./apple-news-url";

const ID = "AtPew8L70RNexncdCICfcUg";
const CANONICAL = { id: ID, url: `https://apple.news/${ID}` };

describe("parseAppleNewsUrl", () => {
  it.each([
    [`https://apple.news/${ID}`],
    [`http://apple.news/${ID}`],
    [`https://www.apple.news/${ID}`],
    [`https://news.apple.com/${ID}`],
    [`apple.news/${ID}`],
    [`https://apple.news/${ID}?utm_source=share`],
    [`https://apple.news/${ID}/some/extra/path`],
    [`  https://apple.news/${ID}  `],
    [ID],
  ])("accepts %s", (input) => {
    expect(parseAppleNewsUrl(input)).toEqual(CANONICAL);
  });

  it.each([
    [""],
    ["   "],
    ["not a url"],
    ["https://example.com/article"],
    ["https://apple.com/news"],
    [`https://evilapple.news/${ID}`],
    [`ftp://apple.news/${ID}`],
    ["https://apple.news/"],
    ["https://apple.news/tooshort"],
    ["https://apple.news/lowercase0start0idXXXX"],
    ["Bnot0a0valid0id0prefix"],
  ])("rejects %s", (input) => {
    expect(parseAppleNewsUrl(input)).toBeNull();
  });
});
