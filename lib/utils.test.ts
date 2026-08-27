import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("should merge simple classes", () => {
    expect(cn("bg-red-500", "text-white")).toBe("bg-red-500 text-white");
  });

  it("should handle conditional classes", () => {
    expect(cn("bg-red-500", true && "text-white", false && "text-black")).toBe("bg-red-500 text-white");
  });

  it("should override tailwind classes via tailwind-merge", () => {
    expect(cn("bg-red-500 px-2", "bg-blue-500")).toBe("px-2 bg-blue-500");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });

  it("should handle undefined, null, and empty inputs", () => {
    expect(cn("bg-red-500", undefined, null, "")).toBe("bg-red-500");
  });

  it("should handle arrays of classes", () => {
    expect(cn(["bg-red-500", "text-white"])).toBe("bg-red-500 text-white");
  });

  it("should handle objects with conditional classes", () => {
    expect(cn({ "bg-red-500": true, "text-white": false })).toBe("bg-red-500");
  });
});
