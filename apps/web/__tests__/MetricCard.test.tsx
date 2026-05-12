import { render, screen } from "@testing-library/react";
import { MetricCard } from "@/components/MetricCard";

describe("MetricCard", () => {
  it("renders title and value", () => {
    render(<MetricCard title="Total Farmers" value="1,234" />);
    expect(screen.getByText("Total Farmers")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(<MetricCard title="NDVI Alerts" value="3" subtitle="Plots below 0.3" />);
    expect(screen.getByText("Plots below 0.3")).toBeInTheDocument();
  });

  it("shows loading skeleton when loading=true", () => {
    render(<MetricCard title="Metrics" value="0" loading />);
    const skeleton = document.querySelector(".animate-pulse");
    expect(skeleton).toBeInTheDocument();
  });

  it("does not render value text while loading", () => {
    render(<MetricCard title="Metrics" value="999" loading />);
    // value text should NOT be visible while loading
    expect(screen.queryByText("999")).not.toBeInTheDocument();
  });

  it("uses aria-label prop when provided", () => {
    render(
      <MetricCard
        title="Farmers"
        value="500"
        aria-label="Number of registered farmers"
      />
    );
    expect(
      screen.getByRole("article", { name: "Number of registered farmers" })
    ).toBeInTheDocument();
  });

  it("falls back to title as aria-label", () => {
    render(<MetricCard title="GPS Proofs" value="42" />);
    expect(
      screen.getByRole("article", { name: "GPS Proofs" })
    ).toBeInTheDocument();
  });

  it("applies success variant class", () => {
    render(<MetricCard title="Disbursed" value="₹10,000" variant="success" />);
    const article = screen.getByRole("article");
    expect(article.className).toContain("border-brand-200");
  });

  it("applies warning variant class", () => {
    render(<MetricCard title="Alerts" value="5" variant="warning" />);
    const article = screen.getByRole("article");
    expect(article.className).toContain("border-yellow-200");
  });

  it("applies error variant class", () => {
    render(<MetricCard title="Failed" value="2" variant="error" />);
    const article = screen.getByRole("article");
    expect(article.className).toContain("border-red-200");
  });
});
