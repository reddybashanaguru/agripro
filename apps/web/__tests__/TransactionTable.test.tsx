import { render, screen } from "@testing-library/react";
import { TransactionTable } from "@/components/TransactionTable";
import type { Transaction } from "@/lib/types";

const mockTransactions: Transaction[] = [
  {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    idempotency_key: "key-1",
    gross_amount: "10000",
    currency: "INR",
    status: "COMPLETED",
    farmer_id: "farmer-uuid-1",
    description: "Wheat harvest payout",
    created_at: "2024-06-01T10:00:00Z",
    completed_at: "2024-06-01T10:01:00Z",
  },
  {
    id: "ffffffff-0000-1111-2222-333333333333",
    idempotency_key: "key-2",
    gross_amount: "5000",
    currency: "INR",
    status: "PENDING",
    farmer_id: "farmer-uuid-2",
    description: "",
    created_at: "2024-06-02T08:00:00Z",
    completed_at: null,
  },
];

describe("TransactionTable", () => {
  describe("with transactions", () => {
    it("renders the table", () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    it("renders a row per transaction", () => {
      render(<TransactionTable transactions={mockTransactions} />);
      const rows = screen.getAllByRole("row");
      // 1 header row + 2 data rows
      expect(rows).toHaveLength(3);
    });

    it("renders truncated transaction ID", () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByText("aaaaaaaa…")).toBeInTheDocument();
    });

    it("renders status badge for COMPLETED", () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    });

    it("renders status badge for PENDING", () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByText("PENDING")).toBeInTheDocument();
    });

    it("renders em dash for empty description", () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("renders transaction description when present", () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByText("Wheat harvest payout")).toBeInTheDocument();
    });

    it("renders sr-only caption", () => {
      render(
        <TransactionTable
          transactions={mockTransactions}
          caption="Test caption"
        />
      );
      expect(screen.getByText("Test caption")).toBeInTheDocument();
    });

    it("renders column headers with scope=col", () => {
      render(<TransactionTable transactions={mockTransactions} />);
      const headers = screen.getAllByRole("columnheader");
      expect(headers.length).toBeGreaterThanOrEqual(5);
      headers.forEach((h) => {
        expect(h).toHaveAttribute("scope", "col");
      });
    });

    it("currency code appears in amount cell", () => {
      render(<TransactionTable transactions={mockTransactions} />);
      const inrBadges = screen.getAllByText("INR");
      expect(inrBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("with empty transactions", () => {
    it("renders empty-state message", () => {
      render(<TransactionTable transactions={[]} />);
      expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
    });

    it("does not render a table element", () => {
      render(<TransactionTable transactions={[]} />);
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("has accessible role=status on empty state", () => {
      render(<TransactionTable transactions={[]} />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });
});
