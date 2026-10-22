import { describe, it, expect, afterEach } from "vitest";
import { looksLikeSpaShell, renderWithBrowser } from "@/lib/intel/js-render";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("looksLikeSpaShell", () => {
  it("flags Next.js shell with __next mount point", () => {
    const html = `<!doctype html><html><head><title></title></head><body><div id="__next"></div><script src="/_next/app.js"></script></body></html>`;
    expect(looksLikeSpaShell(html, html.length)).toBe(true);
  });

  it("flags generic React root div shell", () => {
    const html = `<!doctype html><html><body><div id="root"></div></body></html>`;
    expect(looksLikeSpaShell(html, html.length)).toBe(true);
  });

  it("flags Angular <app-root> shell", () => {
    const html = `<!doctype html><html><body><app-root></app-root></body></html>`;
    expect(looksLikeSpaShell(html, html.length)).toBe(true);
  });

  it("flags tiny shell with no anchor tags", () => {
    const html = `<!doctype html><html><body><p>loading</p></body></html>`;
    expect(looksLikeSpaShell(html, html.length)).toBe(true);
  });

  it("does not flag a page with several anchor tags under 5KB", () => {
    const html = `<!doctype html><html><body>
      <a href="/">Home</a><a href="/about">About</a><a href="/contact">Contact</a>
    </body></html>`;
    expect(looksLikeSpaShell(html, html.length)).toBe(false);
  });

  it("does not flag a page over the size threshold even with a root marker", () => {
    const padding = "x".repeat(6000);
    const html = `<div id="root"></div>${padding}`;
    expect(looksLikeSpaShell(html, html.length)).toBe(false);
  });
});

describe("renderWithBrowser", () => {
  it("returns ok:false (without throwing) when CLOUDFLARE_API_TOKEN is missing", async () => {
    const result = await renderWithBrowser("https://acme.example/", {
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/CLOUDFLARE_API_TOKEN/);
    }
  });

  it("returns ok:false (without throwing) when CLOUDFLARE_ACCOUNT_ID is missing", async () => {
    const result = await renderWithBrowser("https://acme.example/", {
      CLOUDFLARE_API_TOKEN: "tok",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/CLOUDFLARE_ACCOUNT_ID/);
    }
  });

  it("returns ok:false when env is entirely empty", async () => {
    const result = await renderWithBrowser("https://acme.example/", {});
    expect(result.ok).toBe(false);
  });

  it("returns rendered HTML when Cloudflare responds success:true", async () => {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      expect(url).toContain(
        "api.cloudflare.com/client/v4/accounts/acct-123/browser-rendering/content"
      );
      expect(init?.method).toBe("POST");
      const authHeader = (init?.headers as Record<string, string> | undefined)?.["authorization"];
      expect(authHeader).toBe("Bearer tok");
      const body = JSON.parse((init?.body as string) ?? "{}");
      expect(body.url).toBe("https://acme.example/");
      return new Response(
        JSON.stringify({
          success: true,
          result: "<html><body><h1>Hydrated</h1></body></html>",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await renderWithBrowser("https://acme.example/", {
      CLOUDFLARE_API_TOKEN: "tok",
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain("<h1>Hydrated</h1>");
      expect(result.bytes).toBeGreaterThan(0);
    }
  });

  it("surfaces 401 as a non-throwing failure", async () => {
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
    const result = await renderWithBrowser("https://acme.example/", {
      CLOUDFLARE_API_TOKEN: "bad",
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/401/);
    }
  });

  it("surfaces 403 as a non-throwing failure", async () => {
    globalThis.fetch = (async () => new Response("forbidden", { status: 403 })) as typeof fetch;
    const result = await renderWithBrowser("https://acme.example/", {
      CLOUDFLARE_API_TOKEN: "bad",
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/403/);
    }
  });

  it("surfaces 429 as a quota error", async () => {
    globalThis.fetch = (async () => new Response("too many", { status: 429 })) as typeof fetch;
    const result = await renderWithBrowser("https://acme.example/", {
      CLOUDFLARE_API_TOKEN: "tok",
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/quota|429/i);
    }
  });

  it("surfaces success:false payloads as failures without throwing", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: "Browser Rendering is not enabled for this account" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;
    const result = await renderWithBrowser("https://acme.example/", {
      CLOUDFLARE_API_TOKEN: "tok",
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/not enabled/);
    }
  });
});
