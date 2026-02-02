// Storage costs
// these constants are used to estimate storage fee (how much we should pay for storing a wallet contract);
// actual storage state (desired value of these constants) are printed to console in StateInit.spec.ts
// const MBRP_AMOUNT = ton("1000") // NOTE: store as consts to upgrade with code now minter updates, any const update also updates version but should not

// asm fun setCode(newCode: Cell) { SETCODE }
// asm fun setData(newData: Cell) {c4 POP} // rarely used for wallet
const ZERO_ADDRESS = address("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c") // TODO mainnet addr


// const gasForMint: int = 11050; //anybody can mint(burn if minted) limitedAmount(not fixedAmount once) per id

// const walletStateInitCells: int = 300; // 30, 283
// const walletStateInitBits: int = 2_50_000; // 20_000, 2_19_987 // todo 

const MBRP_AMOUNT: int = ton("1000"); // NOTE: store as consts to upgrade with code now minter updates, any const update also updates version but should not
const CLOSURE_WAIT: int = 86400; // 1 day

// asm fun setCode(newCode: Cell) { SETCODE };

// asm fun setData(newData: Cell) {c4 POP}; // rarely used for wallet

// SYMANTIC TXN CODES
// const FOLLOW_AMOUNT: int = 100000000000000000; // 1*10**17
// const REPORT_AMOUNT: int = 200000000000000000; // 2*10**17
// const DISPUTE_AMOUNT: int = 300000000000000000; // 3*10**17
// const PROCESS_AMOUNT: int = 400000000000000000; // 4*10**17
// const CHANGE_NOMINEE_AMOUNT: int = 500000000000000000; // 5*10**17

// ERROR_CODES
const INCORRECT_SENDER = 700;
const ACCOUNT_TERMINATED: int = 701;
const ACCOUNT_INACTIVE: int = 702;
const INSUFFICIENT_GAS_SENT: int = 703;
const RESERVED_INTERNAL: int = 704;
// const UPGRADE_WALLET: int = 705;
const NO_PENDING_REQUEST: int = 706;
const CANT_UNFOLLOW_REPORTED: int = 707;

const INSUFFICIENT_BALANCE: int = 709;
const ALREADY_REPORTED: int = 710;
const ACCOUNT_NOT_REPORTED: int = 711;
// const NOT_AUTHORIZED: int = 712;
// const AMOUNT_EXCEEDS_MBRP: int = 715;

const NOT_FOLLOWING: int = 717;
//follower Cleared by confirmRequestInternal bounce? TODO:
const CONNECTION_EXISTS: int = 719;
const NOT_FRIEND: int = 720;
const NOT_INVITOR: int = 721;
const ALREADY_INVITED: int = 723;
const UNAUTHORIZED_BURN: int = 724;
const MINT_CLOSED: int = 730;
const NO_VOTES_AVAILABLE: int = 731;
const NOT_VOTED_YET: int = 732;

const UPGRADE: int = 733;
const WRONG_WORKCHAIN: int = 734;
const WAIT_MORE: int = 735;
const NOT_CLOSE_FRIEND: int = 736;
const ALREADY_VOUCHED: int = 737;
const PROVIDE_COORDINATES: int = 738;
const INVALID_FWD_PAYLOAD: int = 739;
const INVITE_FIRST: int = 740;
const ALREADY_REPORTED_FOR_OTHER_REASON: int = 741;

// CONTRACT_CONSTS
// Declare a compile-time constant upper-bound for our map
const MAX_CONNECTIONS: int = 250; // coz accClosing contract can send only approx 250 msg once
