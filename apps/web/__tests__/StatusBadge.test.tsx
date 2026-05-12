import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/StatusBadge";

describe("StatusBadge", () => {
  describe("auto-variant from status string", () => {
    it("applies success style for COMPLETED", () => {
      render(<StatusBadge status="COMPLETED" />);
      const badge = screen.getByText("COMPLETED");
      expect(badge.className).toContain("text-brand-800");
    });

    it("applies success style for VERIFIED", () => {
      render(<StatusBadge status="VERIFIED" />);
      const badge = screen.getByText("VERIFIED");
      expect(badge.className).toContain("text-brand-800");
    });

    it("applies warning style for PENDING", () => {
      render(<StatusBadge status="PENDING" />);
      const badge = screen.getByText("PENDING");
      expect(badge.className).toContain("text-yellow-800");
    });

    it("applies warning style for PROCESSING", () => {
      render(<StatusBadge status="PROCESSING" />);
      const badge = screen.getByText("PROCESSING");
      expect(badge.className).toContain("text-yellow-800");
    });

    it("applies error style for FAILED", () => {
      render(<StatusBadge status="FAILED" />);
      const badge = screen.getByText("FAILED");
      expect(badge.className).toContain("text-red-800");
    });

    it("applies error style for REVERSED", () => {
      render(<StatusBadge status="REVERSED" />);
      const badge = screen.getByText("REVERSED");
      expect(badge.className).toContain("text-red-800");
    });

    it("applies error style for REJECTED", () => {
      render(<StatusBadge status="REJECTED" />);
      const badge = screen.getByText("REJECTED");
      expect(badge.className).toContain("text-red-800");
    });

    it("applies error style for SPOOFED", () => {
      render(<StatusBadge status="SPOOFED" />);
      const badge = screen.getByText("SPOOFED");
      expect(badge.className).toContain("text-red-800");
    });

    it("applies neutral style for unknown status", () => {
      render(<StatusBadge status="UNKNOWN_STATUS" />);
      const badge = screen.getByText("UNKNOWN_STATUS");
      expect(badge.className).toContain("text-gray-700");
    });
  });

  describe("explicit variant override", () => {
    it("uses provided variant instead of auto-detecting", () => {
      render(<StatusBadge status="PENDING" variant="success" />);
      const badge = screen.getByText("PENDING");
      expect(badge.className).toContain("text-brand-800");
    });

    it("renders error variant explicitly", () => {
      render(<StatusBadge status="INFO" variant="error" />);
      const badge = screen.getByText("INFO");
      expect(badge.className).toContain("text-red-800");
    });
  });

  it("renders the status text", () => {
    render(<StatusBadge status="COMPLETED" />);
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
  });
});
