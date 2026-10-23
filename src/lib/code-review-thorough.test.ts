import { describe, expect, it } from "vitest";
import {
  buildThoroughReport,
  extractEnvNames,
  inventoryFromPaths,
  parseDotEnvKeys,
  thoroughToMarkdown,
} from "@/lib/code-review-thorough";

describe("thorough Code Reviewer inventory", () => {
  it("flags the obvious missing project files", () => {
    const inv = inventoryFromPaths(["package.json", "src/index.ts"]);
    const paths = inv.missing.map((m) => m.path);
    expect(paths).toEqual(expect.arrayContaining(["README.md", "LICENSE", ".gitignore", ".github/workflows/", "tests/"]));
    expect(inv.projectKind).toBe("node");
    expect(inv.hasVercel).toBe(false);
  });

  it("stays quiet when the tree already has them", () => {
    const inv = inventoryFromPaths([
      "package.json", "README.md", "LICENSE", ".gitignore",
      ".github/workflows/ci.yml", "src/app.test.ts", ".env.example", "vercel.json",
    ]);
    expect(inv.missing).toHaveLength(0);
    expect(inv.hasCi).toBe(true);
    expect(inv.hasVercel).toBe(true);
    expect(inv.vercelNote).toMatch(/later step/i);
  });
});

describe("env name extraction", () => {
  it("picks up names from JS/Python/PHP without values", () => {
    const names = extractEnvNames(`
      const url = process.env.DATABASE_URL;
      const key = process.env["STRIPE_SECRET"];
      os.environ.get("OPENAI_API_KEY")
      os.Getenv("PORT")
      $_ENV["APP_KEY"]
      Deno.env.get("SUPABASE_URL")
      const pub = import.meta.env.VITE_PUBLIC;
      getenv("MAIL_FROM")
    `);
    expect(names).toEqual(expect.arrayContaining([
      "DATABASE_URL", "STRIPE_SECRET", "OPENAI_API_KEY", "PORT", "APP_KEY", "SUPABASE_URL", "VITE_PUBLIC", "MAIL_FROM",
    ]));
    expect(names).not.toContain("NODE_ENV");
  });

  it("reads .env.example keys and ignores comments", () => {
    expect(parseDotEnvKeys("# comment\nDATABASE_URL=\nexport MAIL_FROM=dev@local\n")).toEqual(["DATABASE_URL", "MAIL_FROM"]);
  });
});

describe("thorough report", () => {
  it("walks files, reports missing .env.example, and never keeps source", () => {
    const report = buildThoroughReport({
      rootName: "demo",
      paths: ["package.json", "src/db.ts"],
      filesSkipped: 0,
      files: [{
        path: "src/db.ts",
        content: `const url = process.env.DATABASE_URL;\nconst apiKey = "sk-live-9f27ab41c0d84e12";\n`,
      }],
    });
    expect(report.findings.some((f) => f.ruleId === "CR-001")).toBe(true);
    expect(report.missing.some((m) => m.path === ".env.example")).toBe(true);
    expect(report.env.missingFromExample).toContain("DATABASE_URL");
    expect(Object.keys(report)).not.toContain("source");
    expect(Object.keys(report)).not.toContain("code");
    const md = thoroughToMarkdown(report);
    expect(md).toContain("Clyvro Code Review — demo");
    expect(md).toContain(".env.example");
    expect(md).toContain("CR-001");
  });
});
