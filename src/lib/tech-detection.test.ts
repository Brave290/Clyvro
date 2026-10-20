import { describe, expect, it } from "vitest";
import { detectTechnology } from "./tech-detection";

const names = (html: string, extra: Parameters<typeof detectTechnology>[0] = {}) =>
  detectTechnology({ html, ...extra }).map((t) => t.name);

describe("shared technology detection", () => {
  it("detects a plain static HTML site (the case that used to return nothing)", () => {
    const tech = detectTechnology({
      html: `<!doctype html><html><head><link rel="stylesheet" href="/site.css"></head><body><h1>Hello</h1><script src="/app.js"></script></body></html>`,
      contentType: "text/html; charset=utf-8",
      url: "https://static.example/",
    });
    expect(tech.map((t) => t.name)).toEqual(expect.arrayContaining(["HTML", "CSS", "JavaScript"]));
    expect(tech.find((t) => t.name === "HTML")).toMatchObject({ category: "language", confidence: "direct" });
  });

  it("does not invent a stack for a non-HTML response", () => {
    expect(detectTechnology({ html: "plain text", contentType: "text/plain", url: "https://x.example/file.txt" })).toEqual([]);
  });

  it("detects frameworks, libraries, CSS and services from public page signals", () => {
    const found = names(`
      <html><head>
        <script src="/_next/static/chunks/main.js"></script>
        <link rel="stylesheet" href="/tailwindcss.css">
        <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
        <script src="https://www.googletagmanager.com/gtm.js"></script>
      </head><body><div id="__next"></div></body></html>`);
    expect(found).toEqual(expect.arrayContaining(["Next.js", "React", "Tailwind CSS", "jQuery", "Google Tag Manager", "JavaScript"]));
    const react = detectTechnology({ html: `<script src="/_next/static/a.js"></script>` }).find((t) => t.name === "React");
    expect(react?.confidence).toBe("inferred");
  });

  it("detects Expo / React Native Web bundles", () => {
    const found = names(`
      <html><body><div id="expo-root"></div>
      <script src="/_expo/static/js/web/entry-abc.js"></script>
      <script>window.__EXPO_ROUTER = true;</script></body></html>`);
    expect(found).toEqual(expect.arrayContaining(["Expo", "React Native", "React", "JavaScript", "HTML"]));
  });

  it("detects CMS/backend stacks and labels their languages as inferred", () => {
    expect(names(`<html><body><img src="/wp-content/uploads/a.jpg"></body></html>`))
      .toEqual(expect.arrayContaining(["WordPress", "PHP"]));
    expect(names(`<html><body><form><input type="hidden" name="csrfmiddlewaretoken"></form></body></html>`))
      .toEqual(expect.arrayContaining(["Django", "Python"]));
    expect(names(`<html><body><form><input type="hidden" name="authenticity_token"></form></body></html>`))
      .toEqual(expect.arrayContaining(["Ruby on Rails", "Ruby"]));
    expect(names(`<html><body><script src="/_framework/blazor.webassembly.js"></script></body></html>`))
      .toEqual(expect.arrayContaining(["Blazor", ".NET", "C#"]));
    expect(detectTechnology({ html: "<html></html>", cookieNames: ["PHPSESSID", "laravel_session"] }).map((t) => t.name))
      .toEqual(expect.arrayContaining(["PHP", "Laravel"]));
    expect(detectTechnology({ html: "<html></html>", headers: { "x-powered-by": "PHP/8.3, ASP.NET" } }).map((t) => t.name))
      .toEqual(expect.arrayContaining(["PHP", "ASP.NET", ".NET"]));
  });

  it("detects Railway, Expo hosting and other platform domains/CNAMEs", () => {
    expect(names("", { url: "https://api-production-1234.up.railway.app/" })).toContain("Railway");
    expect(names("", { url: "https://my-app.expo.app/" })).toContain("Expo / EAS Hosting");
    expect(names("", { url: "https://service-abc.run.app/" })).toContain("Google Cloud Run");
    expect(names("", { url: "https://app.fly.dev/" })).toContain("Fly.io");
    expect(names("", {
      url: "https://www.example.com/",
      cnameTargets: ["example-production.up.railway.app"],
    })).toContain("Railway");
    expect(names("", {
      url: "https://www.example.com/",
      cnameTargets: ["d123.cloudfront.net"],
      nameservers: ["ada.ns.cloudflare.com"],
    })).toEqual(expect.arrayContaining(["AWS CloudFront", "Cloudflare DNS"]));
    expect(names("", { headers: { "x-railway-request-id": "abc" } })).toContain("Railway");
    expect(names("", { ipAddresses: ["76.76.21.21"] })).toContain("Vercel");
  });
});
