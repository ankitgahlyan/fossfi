// ============================================================================
// CONSTANTS
// ============================================================================

const ENTRY_FEE: coins = ton("10.0");           // 10 TOKENS to enter
const REVEAL_DEADLINE_SECONDS: int = 3600;      // 1 hour to reveal
// const OWNER_FEE_PERCENT: int = 5;              // todo: 5% fee for owner

// ============================================================================
// LOTTERY PHASES
// ============================================================================

const PHASE_ENTRY: int8 = 0;
// const PHASE_COMMIT: int8 = 1;
const PHASE_REVEAL: int8 = 2;
const PHASE_COMPLETE: int8 = 3;