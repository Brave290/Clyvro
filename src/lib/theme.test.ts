import { describe, it, expect } from "vitest";
import { parseThemePreference, resolveTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

describe("theme preference parsing", () => {
  it("defaults first-time/invalid values to system", () => {
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference(undefined)).toBe("system");
    expect(parseThemePreference("")).toBe("system");
    expect(parseThemePreference("solarized")).toBe("system");
  });
  it("accepts the three stored values", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });
});

describe("theme resolution", () => {
  it("explicit choices win over the OS", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
  it("system follows the OS setting", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("no-flicker init script", () => {
  it("reads the same storage key and toggles the dark class", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT).toContain('classList.toggle("dark"');
    expect(THEME_INIT_SCRIPT).toContain("prefers-color-scheme: dark");
  });
});
