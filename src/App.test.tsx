import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolveResponse } from "../shared/api";
import App from "./App";

const ID = "AtPew8L70RNexncdCICfcUg";
const ARTICLE_URL = `https://apple.news/${ID}`;

const ARTICLE: ResolveResponse = {
  id: ID,
  appleNewsUrl: ARTICLE_URL,
  canonicalUrl: "https://publisher.test/story",
  title: "How Cider Makers Reinvented an Industry",
  publisher: "The Orchard Report",
  description: "A wave of small producers changed everything.",
  image: null,
};

function stubResolve(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  document.documentElement.classList.remove("dark");
  window.localStorage.removeItem("theme");
});

describe("App", () => {
  it("renders the wordmark and input in the idle state", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /sauced\s+apple/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Apple News link")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sauce it!" })).toBeDisabled();
  });

  it("resolves a submitted link and shows the article card with links", async () => {
    const fetchMock = stubResolve(ARTICLE);
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Apple News link"), ARTICLE_URL);
    await user.click(screen.getByRole("button", { name: "Sauce it!" }));

    expect(
      await screen.findByText("How Cider Makers Reinvented an Industry"),
    ).toBeInTheDocument();
    expect(screen.getByText("The Orchard Report")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "archive.today" })).toHaveAttribute(
      "href",
      "https://archive.ph/newest/https://publisher.test/story",
    );
    expect(
      screen.getByRole("button", { name: /read transcript/i }),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/resolve?url=${encodeURIComponent(ARTICLE_URL)}`,
    );
    expect(window.location.search).toBe(
      `?url=${encodeURIComponent(ARTICLE_URL)}`,
    );
  });

  it("shows an error for an invalid link without calling the API", async () => {
    const fetchMock = stubResolve(ARTICLE);
    const user = userEvent.setup();
    render(<App />);

    await user.type(
      screen.getByLabelText("Apple News link"),
      "https://example.com/story",
    );
    await user.click(screen.getByRole("button", { name: "Sauce it!" }));

    expect(
      await screen.findByText("Not an Apple News link"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("auto-resolves a ?url= permalink on load", async () => {
    stubResolve(ARTICLE);
    window.history.replaceState(
      {},
      "",
      `/?url=${encodeURIComponent(ARTICLE_URL)}`,
    );
    render(<App />);

    expect(
      await screen.findByText("How Cider Makers Reinvented an Industry"),
    ).toBeInTheDocument();
  });

  it("toggles dark mode and persists the override", async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Toggle theme" });

    // The stubbed matchMedia prefers light, so toggling turns dark on and
    // stores an override…
    await user.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("theme")).toBe("dark");

    // …and toggling back to the system preference clears the override.
    await user.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("shows the News+ exclusive notice when there is no canonical URL", async () => {
    stubResolve({
      ...ARTICLE,
      canonicalUrl: null,
      publisher: "Apple News+ Magazine",
    });
    window.history.replaceState(
      {},
      "",
      `/?url=${encodeURIComponent(ARTICLE_URL)}`,
    );
    render(<App />);

    expect(
      await screen.findByText(/Apple News\+ exclusive/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /read transcript/i }),
    ).not.toBeInTheDocument();
  });
});
