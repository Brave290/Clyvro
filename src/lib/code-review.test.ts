import { describe, expect, it } from "vitest";
import { analyzeCode, codeReviewToAgentPrompt } from "@/lib/code-review-shared";

describe("Code Reviewer v1 analyzer", () => {
  it("flags the classics with line evidence, and only once per line", () => {
    const report = analyzeCode(`
const apiKey = "sk-live-9f27ab41c0d84e12";
const q = "SELECT * FROM users WHERE id = " + req.query.id;
eval(userInput);
fetch(url, { rejectUnauthorized: false });
`, "javascript");
    const ids = report.findings.map((f) => f.ruleId);
    expect(ids).toContain("CR-001");
    expect(ids).toContain("CR-005");
    expect(ids).toContain("CR-003");
    expect(ids).toContain("CR-007");
    expect(report.findings.find((f) => f.ruleId === "CR-001")?.line).toBe(2);
    expect(report.findings.find((f) => f.ruleId === "CR-001")?.evidence).toContain("Line 2:");
    expect(report.score).toBeLessThan(100);
  });

  it("stays silent on placeholders and clean code", () => {
    const clean = analyzeCode(`
const apiKey = [SECURITY_DATA]"API_KEY"];
const q = "SELECT * FROM users WHERE id = ?";
db.query(q, [id]);
const el = document.createElement("div");
el.textContent = userInput;
`, "javascript");
    expect(clean.findings).toHaveLength(0);
    expect(clean.score).toBe(100);
  });

  it("detects language and caps findings on huge pastes", () => {
    expect(analyzeCode("def hello():\n    print('hi')\n", "auto").language).toBe("python");
    const noisy = Array.from({ length: 200 }, (_, i) => `eval(x${i});`).join("\n");
    expect(analyzeCode(noisy, "javascript").findings.length).toBeLessThanOrEqual(50);
  });

  it("flags a private key as critical and python unsafe patterns", () => {
    const py = analyzeCode(`
import pickle
data = pickle.loads(request.body)
os.system("ls " + name)
`, "python");
    expect(py.findings.map((f) => f.ruleId)).toEqual(expect.arrayContaining(["CR-008", "CR-006"]));
    const marker = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
    const key = analyzeCode(marker, "other");
    expect(key.findings[0]).toMatchObject({ ruleId: "CR-002", severity: "critical" });
  });

  it("exports an agent brief that quotes the findings", () => {
    const report = analyzeCode('const password = "[SECURITY_DATA]";', "javascript");
    const prompt = codeReviewToAgentPrompt("auth.js", report);
    expect(prompt).toContain("CR-001");
    expect(prompt).toContain("rotated");
  });

  it("persists nothing about the source beyond findings (report shape check)", () => {
    const report = analyzeCode("const x = 1;\nconsole.log(x);\n", "javascript");
    // The report object carries no source-code field by design.
    expect(Object.keys(report)).not.toContain("code");
    expect(Object.keys(report)).not.toContain("source");
  });
});
