// IMMUTABLE — mirrors domain/ledger.go split constants
// Any change here MUST also update the Go backend and Math Lockdown test.
export const SPLIT_FARMER = 0.50
export const SPLIT_PLATFORM = 0.25
export const SPLIT_AGENT = 0.05
export const SPLIT_RESERVE = 0.20

if (SPLIT_FARMER + SPLIT_PLATFORM + SPLIT_AGENT + SPLIT_RESERVE !== 1.0) {
  throw new Error('FATAL: Math Law violation — splits do not sum to 1.0')
}
