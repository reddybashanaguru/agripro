import React from "react";
import { render, screen } from "@testing-library/react";
import { EventCard, type PlatformEvent } from "../components/EventCard";

const ISO_TS = "2026-05-12T15:33:40.000Z";

function makeEvent(overrides: Partial<PlatformEvent> = {}): PlatformEvent {
  return {
    id: "test-evt-id",
    type: "payout.completed",
    timestamp: ISO_TS,
    data: {},
    ...overrides,
  };
}

// ── payout.completed ─────────────────────────────────────────────

describe("EventCard — payout.completed", () => {
  it("renders 'Payout Completed' label", () => {
    render(
      <EventCard
        event={makeEvent({
          data: { txn_id: "abc123", gross_amount: "100000", farmer_gets: "50000" },
        })}
      />
    );
    expect(screen.getByText("Payout Completed")).toBeInTheDocument();
  });

  it("displays formatted gross amount", () => {
    render(
      <EventCard
        event={makeEvent({
          data: { txn_id: "abc123", gross_amount: "100000", farmer_gets: "50000" },
        })}
      />
    );
    expect(screen.getByText(/₹1,00,000/)).toBeInTheDocument();
  });

  it("displays farmer_gets amount", () => {
    render(
      <EventCard
        event={makeEvent({
          data: { txn_id: "abc123", gross_amount: "100000", farmer_gets: "50000" },
        })}
      />
    );
    expect(screen.getByText(/₹50,000/)).toBeInTheDocument();
  });

  it("shows truncated txn_id", () => {
    render(
      <EventCard
        event={makeEvent({
          data: { txn_id: "abc12345-def6-7890", gross_amount: "10000", farmer_gets: "5000" },
        })}
      />
    );
    expect(screen.getByText(/abc12345/)).toBeInTheDocument();
  });

  it("has article role with descriptive aria-label", () => {
    render(<EventCard event={makeEvent()} />);
    expect(screen.getByRole("article")).toHaveAttribute(
      "aria-label",
      "Payout Completed event"
    );
  });
});

// ── proof.verdict ────────────────────────────────────────────────

describe("EventCard — proof.verdict", () => {
  it("renders VERIFIED verdict", () => {
    render(
      <EventCard
        event={makeEvent({
          type: "proof.verdict",
          data: { verdict: "VERIFIED", accuracy_m: 5.5 },
        })}
      />
    );
    expect(screen.getByText("VERIFIED")).toBeInTheDocument();
  });

  it("renders SPOOFED verdict", () => {
    render(
      <EventCard
        event={makeEvent({
          type: "proof.verdict",
          data: { verdict: "SPOOFED", accuracy_m: 0, spoof_reason: "zero accuracy" },
        })}
      />
    );
    expect(screen.getByText("SPOOFED")).toBeInTheDocument();
  });

  it("shows spoof_reason when present", () => {
    render(
      <EventCard
        event={makeEvent({
          type: "proof.verdict",
          data: { verdict: "SPOOFED", accuracy_m: 0, spoof_reason: "zero accuracy" },
        })}
      />
    );
    expect(screen.getByText(/zero accuracy/)).toBeInTheDocument();
  });

  it("displays accuracy_m", () => {
    render(
      <EventCard
        event={makeEvent({
          type: "proof.verdict",
          data: { verdict: "VERIFIED", accuracy_m: 5.5 },
        })}
      />
    );
    expect(screen.getByText(/5\.5 m/)).toBeInTheDocument();
  });
});

// ── ndvi.alert ───────────────────────────────────────────────────

describe("EventCard — ndvi.alert", () => {
  it("renders NDVI Alert label", () => {
    render(
      <EventCard
        event={makeEvent({
          type: "ndvi.alert",
          data: { ndvi_mean: "0.18", source: "SENTINEL-2", threshold: "0.3" },
        })}
      />
    );
    expect(screen.getByText("NDVI Alert")).toBeInTheDocument();
  });

  it("shows ndvi_mean value", () => {
    render(
      <EventCard
        event={makeEvent({
          type: "ndvi.alert",
          data: { ndvi_mean: "0.18", source: "SENTINEL-2", threshold: "0.3" },
        })}
      />
    );
    expect(screen.getByText("0.18")).toBeInTheDocument();
  });

  it("shows satellite source", () => {
    render(
      <EventCard
        event={makeEvent({
          type: "ndvi.alert",
          data: { ndvi_mean: "0.18", source: "SENTINEL-2", threshold: "0.3" },
        })}
      />
    );
    expect(screen.getByText("SENTINEL-2")).toBeInTheDocument();
  });
});

// ── sync.batch ───────────────────────────────────────────────────

describe("EventCard — sync.batch", () => {
  it("renders Mobile Sync label", () => {
    render(
      <EventCard
        event={makeEvent({
          type: "sync.batch",
          data: { farmers_created: 3, plots_created: 2, total_records: 5 },
        })}
      />
    );
    expect(screen.getByText("Mobile Sync")).toBeInTheDocument();
  });

  it("shows farmers_created count", () => {
    render(
      <EventCard
        event={makeEvent({
          type: "sync.batch",
          data: { farmers_created: 3, plots_created: 2, total_records: 5 },
        })}
      />
    );
    expect(screen.getByText("+3")).toBeInTheDocument();
  });
});

// ── timestamp ────────────────────────────────────────────────────

describe("EventCard — timestamp", () => {
  it("renders a time element with dateTime attribute", () => {
    render(<EventCard event={makeEvent({ timestamp: ISO_TS })} />);
    const timeEl = document.querySelector("time");
    expect(timeEl).not.toBeNull();
    expect(timeEl).toHaveAttribute("dateTime", ISO_TS);
  });

  it("renders unknown event type with fallback label", () => {
    render(
      <EventCard
        event={makeEvent({ type: "unknown.type", data: {} })}
      />
    );
    expect(screen.getByText("unknown.type")).toBeInTheDocument();
  });
});
