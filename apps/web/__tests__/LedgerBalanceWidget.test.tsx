import { render, screen } from "@testing-library/react";
import { LedgerBalanceWidget } from "@/components/LedgerBalanceWidget";
import type { LedgerBalance } from "@/lib/types";

const balancedData: LedgerBalance = {
  total_debit: "100000",
  total_credit: "100000",
  is_balanced: true,
  entry_count: 8,
  transaction_count: 1,
};

const imbalancedData: LedgerBalance = {
  total_debit: "100000",
  total_credit: "90000",
  is_balanced: false,
  entry_count: 7,
  transaction_count: 1,
};

describe("LedgerBalanceWidget", () => {
  it("renders heading", () => {
    render(<LedgerBalanceWidget balance={balancedData} />);
    expect(screen.getByText("Global Ledger Balance")).toBeInTheDocument();
  });

  it("shows BALANCED badge when is_balanced is true", () => {
    render(<LedgerBalanceWidget balance={balancedData} />);
    expect(screen.getByText("BALANCED")).toBeInTheDocument();
  });

  it("shows IMBALANCED badge when is_balanced is false", () => {
    render(<LedgerBalanceWidget balance={imbalancedData} />);
    expect(screen.getByText("IMBALANCED")).toBeInTheDocument();
  });

  it("renders total debit as formatted INR", () => {
    render(<LedgerBalanceWidget balance={balancedData} />);
    // ₹1,00,000 in en-IN format
    const debitEl = screen.getByText(/Total Debit/i);
    expect(debitEl).toBeInTheDocument();
  });

  it("renders total credit as formatted INR", () => {
    render(<LedgerBalanceWidget balance={balancedData} />);
    expect(screen.getByText(/Total Credit/i)).toBeInTheDocument();
  });

  it("renders journal entry count", () => {
    render(<LedgerBalanceWidget balance={balancedData} />);
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText(/journal entries/i)).toBeInTheDocument();
  });

  it("renders transaction count", () => {
    render(<LedgerBalanceWidget balance={balancedData} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/transactions/i)).toBeInTheDocument();
  });

  it("has aria-labelledby pointing to heading", () => {
    render(<LedgerBalanceWidget balance={balancedData} />);
    const section = screen.getByRole("region", { name: /Global Ledger Balance/i });
    expect(section).toBeInTheDocument();
  });

  it("has aria-live on balance status badge", () => {
    const { container } = render(<LedgerBalanceWidget balance={balancedData} />);
    const liveEl = container.querySelector("[aria-live]");
    expect(liveEl).toBeInTheDocument();
  });
});
