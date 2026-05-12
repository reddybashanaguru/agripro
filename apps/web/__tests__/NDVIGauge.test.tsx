import { render, screen } from "@testing-library/react";
import { NDVIGauge } from "@/components/NDVIGauge";

const plotId = "abcdef12-0000-0000-0000-000000000000";

describe("NDVIGauge", () => {
  describe("value display", () => {
    it("renders the NDVI value formatted to 2 decimal places", () => {
      render(<NDVIGauge value={0.72} plotId={plotId} />);
      expect(screen.getByText("0.72")).toBeInTheDocument();
    });

    it("renders 'Healthy' label for NDVI >= 0.5", () => {
      render(<NDVIGauge value={0.65} plotId={plotId} />);
      expect(screen.getByText("Healthy")).toBeInTheDocument();
    });

    it("renders 'Moderate' label for NDVI between 0.3 and 0.5", () => {
      render(<NDVIGauge value={0.38} plotId={plotId} />);
      expect(screen.getByText("Moderate")).toBeInTheDocument();
    });

    it("renders 'Stressed' label for NDVI below 0.3", () => {
      render(<NDVIGauge value={0.15} plotId={plotId} />);
      expect(screen.getByText("Stressed")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has role=region with descriptive aria-label", () => {
      render(<NDVIGauge value={0.72} plotId={plotId} />);
      const region = screen.getByRole("region");
      expect(region).toHaveAttribute(
        "aria-label",
        expect.stringContaining("abcdef12")
      );
      expect(region).toHaveAttribute(
        "aria-label",
        expect.stringContaining("0.72")
      );
    });

    it("has role=progressbar with aria-valuenow", () => {
      render(<NDVIGauge value={0.72} plotId={plotId} />);
      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "72");
      expect(bar).toHaveAttribute("aria-valuemin", "0");
      expect(bar).toHaveAttribute("aria-valuemax", "100");
    });

    it("sets aria-valuenow=30 for NDVI 0.3", () => {
      render(<NDVIGauge value={0.3} plotId={plotId} />);
      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "30");
    });

    it("clamps value below 0 to 0", () => {
      render(<NDVIGauge value={-0.1} plotId={plotId} />);
      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "0");
    });

    it("clamps value above 1 to 100", () => {
      render(<NDVIGauge value={1.5} plotId={plotId} />);
      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "100");
    });
  });

  describe("plot ID", () => {
    it("renders truncated plot ID (first 8 chars)", () => {
      render(<NDVIGauge value={0.5} plotId={plotId} />);
      expect(screen.getByText(/abcdef12/)).toBeInTheDocument();
    });
  });

  describe("optional props", () => {
    it("renders source when provided", () => {
      render(<NDVIGauge value={0.5} plotId={plotId} source="Sentinel-2" />);
      expect(screen.getByText("Sentinel-2")).toBeInTheDocument();
    });

    it("does not render source when not provided", () => {
      render(<NDVIGauge value={0.5} plotId={plotId} />);
      expect(screen.queryByText("Sentinel-2")).not.toBeInTheDocument();
    });

    it("renders observation date when observedAt provided", () => {
      render(
        <NDVIGauge value={0.5} plotId={plotId} observedAt="2024-01-15T00:00:00Z" />
      );
      expect(screen.getByText(/Observed/)).toBeInTheDocument();
    });

    it("does not render observation date when not provided", () => {
      render(<NDVIGauge value={0.5} plotId={plotId} />);
      expect(screen.queryByText(/Observed/)).not.toBeInTheDocument();
    });
  });
});
