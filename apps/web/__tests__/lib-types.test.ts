import {
  formatINR,
  formatDate,
  statusToVariant,
  ndviToVariant,
} from "@/lib/types";

describe("formatINR", () => {
  it("formats a string number as INR currency", () => {
    const result = formatINR("10000");
    expect(result).toContain("10,000");
    expect(result).toContain("₹");
  });

  it("formats a numeric value", () => {
    const result = formatINR(500000);
    expect(result).toContain("5,00,000");
  });

  it("handles zero", () => {
    const result = formatINR(0);
    expect(result).toContain("0");
  });

  it("handles decimal string by truncating to 0 fraction digits", () => {
    const result = formatINR("9999.99");
    expect(result).not.toContain(".99");
  });
});

describe("formatDate", () => {
  it("returns a non-empty string for a valid ISO date", () => {
    const result = formatDate("2024-01-15T10:30:00Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the year in the output", () => {
    const result = formatDate("2024-06-01T00:00:00Z");
    expect(result).toContain("2024");
  });
});

describe("statusToVariant", () => {
  it("maps COMPLETED to success", () => {
    expect(statusToVariant("COMPLETED")).toBe("success");
  });

  it("maps PENDING to warning", () => {
    expect(statusToVariant("PENDING")).toBe("warning");
  });

  it("maps PROCESSING to warning", () => {
    expect(statusToVariant("PROCESSING")).toBe("warning");
  });

  it("maps FAILED to error", () => {
    expect(statusToVariant("FAILED")).toBe("error");
  });

  it("maps REVERSED to error", () => {
    expect(statusToVariant("REVERSED")).toBe("error");
  });
});

describe("ndviToVariant", () => {
  it("returns success for NDVI >= 0.5", () => {
    expect(ndviToVariant(0.5)).toBe("success");
    expect(ndviToVariant(0.72)).toBe("success");
    expect(ndviToVariant(1.0)).toBe("success");
  });

  it("returns warning for NDVI between 0.3 and 0.5", () => {
    expect(ndviToVariant(0.3)).toBe("warning");
    expect(ndviToVariant(0.45)).toBe("warning");
    expect(ndviToVariant(0.499)).toBe("warning");
  });

  it("returns error for NDVI below 0.3", () => {
    expect(ndviToVariant(0.0)).toBe("error");
    expect(ndviToVariant(0.1)).toBe("error");
    expect(ndviToVariant(0.29)).toBe("error");
  });
});
