import { render, screen } from "@testing-library/react";
import { Navigation } from "@/components/Navigation";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/"),
}));

// Mock next/link
jest.mock("next/link", () => {
  const MockLink = ({
    href,
    children,
    "aria-label": ariaLabel,
    "aria-current": ariaCurrent,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    "aria-label"?: string;
    "aria-current"?: string;
    className?: string;
  }) => (
    <a href={href} aria-label={ariaLabel} aria-current={ariaCurrent} className={className}>
      {children}
    </a>
  );
  MockLink.displayName = "Link";
  return MockLink;
});

import { usePathname } from "next/navigation";

describe("Navigation", () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue("/");
  });

  it("renders the skip-nav link", () => {
    render(<Navigation />);
    const skipLink = screen.getByText("Skip to main content");
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute("href", "#main-content");
  });

  it("renders the Finagra brand link", () => {
    render(<Navigation />);
    expect(screen.getByRole("link", { name: /Finagra Unity.*home/i })).toBeInTheDocument();
  });

  it("renders all 4 nav items", () => {
    render(<Navigation />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav).toBeInTheDocument();
    // All 4 nav items in the list
    expect(screen.getByRole("link", { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ledger/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Transactions/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sentinel/i })).toBeInTheDocument();
  });

  it("sets aria-current=page on the Dashboard link when on /", () => {
    (usePathname as jest.Mock).mockReturnValue("/");
    render(<Navigation />);
    const dashLink = screen.getByRole("link", { name: /Dashboard/i });
    expect(dashLink).toHaveAttribute("aria-current", "page");
  });

  it("does not set aria-current on non-active links", () => {
    (usePathname as jest.Mock).mockReturnValue("/");
    render(<Navigation />);
    const ledgerLink = screen.getByRole("link", { name: /Ledger/i });
    expect(ledgerLink).not.toHaveAttribute("aria-current");
  });

  it("sets aria-current=page on Ledger link when on /ledger", () => {
    (usePathname as jest.Mock).mockReturnValue("/ledger");
    render(<Navigation />);
    const ledgerLink = screen.getByRole("link", { name: /Ledger/i });
    expect(ledgerLink).toHaveAttribute("aria-current", "page");
  });

  it("sets aria-current=page on Transactions link when on /transactions", () => {
    (usePathname as jest.Mock).mockReturnValue("/transactions");
    render(<Navigation />);
    const txnLink = screen.getByRole("link", { name: /Transactions/i });
    expect(txnLink).toHaveAttribute("aria-current", "page");
  });

  it("sets aria-current=page on Sentinel link when on /sentinel", () => {
    (usePathname as jest.Mock).mockReturnValue("/sentinel");
    render(<Navigation />);
    const sentLink = screen.getByRole("link", { name: /Sentinel/i });
    expect(sentLink).toHaveAttribute("aria-current", "page");
  });

  it("renders a <header> element", () => {
    render(<Navigation />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});
