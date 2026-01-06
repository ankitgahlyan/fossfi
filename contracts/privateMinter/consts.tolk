// SYMANTIC TXN CODES
// const FOLLOW_AMOUNT: int = 100000000000000000; // 1*10**17
// const REPORT_AMOUNT: int = 200000000000000000; // 2*10**17
// const DISPUTE_AMOUNT: int = 300000000000000000; // 3*10**17
// const PROCESS_AMOUNT: int = 400000000000000000; // 4*10**17
// const CHANGE_NOMINEE_AMOUNT: int = 500000000000000000; // 5*10**17
// Storage costs
// these constants are used to estimate storage fee (how much we should pay for storing a wallet contract);
// actual storage state (desired value of these constants) are printed to console in StateInit.spec.ts
const MBRP_AMOUNT = ton("1000") // NOTE: store as consts to upgrade with code now minter updates, any const update also updates version but should not
const CLOSURE_WAIT = 86400 // 1 day

// asm fun setCode(newCode: Cell) { SETCODE }
// asm fun setData(newData: Cell) {c4 POP} // rarely used for wallet
const ZERO_ADDRESS = address("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c") // TODO mainnet addr
