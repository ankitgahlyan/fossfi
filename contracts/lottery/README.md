# Decentralized Lottery Smart Contract (Tolk)

A secure decentralized lottery implementation using the **commit-reveal scheme** for cryptographically secure randomness on TON blockchain.

## Overview

This lottery contract implements a multi-phase lottery system that uses participant addresses as part of the commitment scheme, ensuring:
- **Cryptographic security**: No single party can predict or manipulate the outcome
- **Validator resistance**: Even validators cannot determine the winner in advance
- **Fair randomness**: Combines secrets from all participants using XOR
- **Penalty-free**: Participants who don't reveal forfeit their chance but don't lose funds
- **Byzantine fault tolerance**: Requires minimum 2 reveals to draw a winner

## Architecture

### Commit-Reveal Scheme

The contract uses addresses as part of the commitment to prevent the same secret from being used by different participants:

```
Commitment = Hash(Secret + ParticipantAddress)
```

This ensures:
1. Each participant's commitment is unique
2. Participants cannot copy each other's commitments
3. Addresses add entropy to the final random seed

### Four Phases

#### 1. **Entry Phase** (PHASE_ENTRY)
- Participants pay the entry fee (1 TON) to join
- Minimum 3 participants required
- Automatically advances to Commit phase when minimum is reached

#### 2. **Commit Phase** (PHASE_COMMIT)
- Each participant submits `Hash(Secret + Address)`
- 1-hour deadline for all commits
- Participants generate a random 256-bit secret off-chain
- Automatically advances to Reveal phase when all participants commit

#### 3. **Reveal Phase** (PHASE_REVEAL)
- Participants reveal their original secrets
- Contract verifies: `Hash(RevealedSecret + Address) == StoredCommitment`
- 1-hour deadline for reveals
- Anyone can call `DrawWinner` after deadline or when all reveal

#### 4. **Complete Phase** (PHASE_COMPLETE)
- Winner is determined by: `(XOR of all secrets and addresses) % participantCount`
- Winner claims prize (95% of pool, 5% to owner)
- Contract resets for next lottery

## Security Features

### Against User Manipulation
- ✅ **Commitment binding**: Cannot change secret after commit
- ✅ **Address-based uniqueness**: Each participant has unique commitment
- ✅ **Reveal verification**: Must provide exact secret used in commitment

### Against Validator Manipulation
- ✅ **Multi-party randomness**: No single party controls the outcome
- ✅ **XOR combination**: All secrets contribute equally to randomness
- ✅ **Address mixing**: Adds blockchain state to entropy
- ✅ **Timing resistance**: Validators cannot predict based on block time

### Failure Handling
- ⚠️ **Partial reveals**: If not all participants reveal, owner can trigger refund
- ⚠️ **Minimum reveals**: Requires at least 2 reveals for security
- ⚠️ **Deadlines**: Automatic progression prevents infinite waiting

## Message Types

### 1. MsgEnterLottery (0x11111111)
```tolk
{
    queryId: uint64
}
// Attach 1 TON as message value
```

### 2. MsgSubmitCommitment (0x22222222)
```tolk
{
    queryId: uint64,
    commitmentHash: uint256  // Hash(secret + your_address)
}
```

**How to generate commitment:**
```javascript
// Off-chain (JavaScript example)
const secret = crypto.randomBytes(32); // 256-bit random
const commitment = sha256(concat(secret, yourAddress));
```

### 3. MsgRevealCommitment (0x33333333)
```tolk
{
    queryId: uint64,
    secret: uint256  // The original secret you used
}
```

### 4. MsgDrawWinner (0x44444444)
```tolk
{
    queryId: uint64
}
// Anyone can call after reveal deadline or all reveals
```

### 5. MsgClaimPrize (0x55555555)
```tolk
{
    queryId: uint64
}
// Only winner can call
```

### 6. MsgRefund (0x66666666)
```tolk
{
    queryId: uint64
}
// Only owner can call if lottery fails
```

## Get Methods

```tolk
get getCurrentPhase() -> int8
get getParticipantCount() -> int32
get getCommitCount() -> int32
get getRevealCount() -> int32
get getPrizePool() -> coins
get getWinner() -> address
get isParticipant(addr: address) -> bool
get hasCommitted(addr: address) -> bool
get hasRevealed(addr: address) -> bool
get getDeadlines() -> (int32, int32)
```

## Usage Flow

### For Participants

1. **Enter the lottery**
   - Send `MsgEnterLottery` with 1 TON attached
   - Wait for commit phase to start

2. **Generate and commit secret**
   - Generate random 256-bit secret off-chain
   - Calculate: `hash = SHA256(secret || your_address)`
   - Send `MsgSubmitCommitment` with the hash
   - **Store your secret safely!**

3. **Reveal your secret**
   - When reveal phase starts, send `MsgRevealCommitment`
   - Provide the original secret
   - Contract verifies it matches your commitment

4. **Wait for winner**
   - Anyone can call `MsgDrawWinner` after reveals
   - Check if you won with `getWinner()`

5. **Claim prize** (if winner)
   - Send `MsgClaimPrize` to receive 95% of prize pool

### For Contract Owner

1. **Deploy contract** with initial storage:
```tolk
{
    ownerAddress: <your_address>,
    currentPhase: 0,
    entryFee: ton("1.0"),
    participants: createEmptyMap(),
    participantCount: 0,
    commitments: createEmptyMap(),
    commitCount: 0,
    reveals: createEmptyMap(),
    revealCount: 0,
    commitDeadline: 0,
    revealDeadline: 0,
    prizePool: 0,
    winner: null,
    winnerDetermined: false,
    randomSeed: 0
}
```

2. **Monitor phases**
   - Use get methods to track progress
   - Trigger `MsgRefund` if lottery fails

## Constants (Configurable)

```tolk
const ENTRY_FEE: coins = ton("1.0");           // Entry fee per participant
const MIN_PARTICIPANTS: int = 3;                // Minimum to start
const COMMIT_DEADLINE_SECONDS: int = 3600;      // 1 hour
const REVEAL_DEADLINE_SECONDS: int = 3600;      // 1 hour
const OWNER_FEE_PERCENT: int = 5;              // 5% commission
```

## Error Codes

| Code | Description |
|------|-------------|
| 100  | Not in entry phase |
| 101  | Insufficient entry fee |
| 102  | Already entered |
| 200  | Not in commit phase |
| 201  | Commit deadline passed |
| 202  | Not a participant |
| 203  | Already committed |
| 300  | Not in reveal phase |
| 301  | Reveal deadline passed |
| 302  | Invalid reveal (doesn't match commitment) |
| 400  | Cannot draw winner yet |
| 401  | Not enough reveals or deadline not passed |
| 402  | Need at least 2 reveals for security |
| 500  | Not in complete phase |
| 501  | Winner not determined |
| 502  | Only winner can claim |
| 600  | Only owner can refund |
| 601  | Cannot refund completed lottery |

## Gas Optimization

- Uses `lazy` loading for efficient storage access
- Maps for O(1) lookups
- Minimal cell operations
- Efficient XOR-based randomness combination

## Security Considerations

### What Makes It Secure?

1. **Multi-party computation**: Winner depends on ALL participant secrets
2. **Commitment scheme**: Participants cannot change their input after seeing others
3. **Address binding**: Prevents replay attacks and ensures uniqueness
4. **XOR mixing**: Equal contribution from all parties
5. **Deadline enforcement**: Prevents indefinite blocking

### Potential Issues

1. **Non-revealing participants**: If many don't reveal, owner must refund
   - Mitigation: Social/economic incentives to reveal
   - Future: Add collateral requirements

2. **Griefing**: Last participant to reveal sees outcome
   - Mitigation: Requires 2+ reveals minimum
   - Impact: Can only decide to reveal or not, cannot change outcome

3. **Sybil attacks**: Multiple addresses from same entity
   - Mitigation: Entry fee creates economic barrier
   - Future: Add identity verification or staking

## Comparison with Other Methods

| Method | Speed | Security | Complexity |
|--------|-------|----------|------------|
| `randomize_lt()` | Fast | Low | Low |
| Block skipping | Medium | Medium | Medium |
| **Commit-reveal** | Slow | **High** | High |

This implementation is recommended for **high-value lotteries** where security is paramount.

## Testing Checklist

- [ ] Entry with correct fee
- [ ] Entry rejection with insufficient fee
- [ ] Entry rejection after phase change
- [ ] Commit with valid hash
- [ ] Commit rejection for non-participants
- [ ] Commit rejection after deadline
- [ ] Reveal with correct secret
- [ ] Reveal rejection with wrong secret
- [ ] Draw winner with all reveals
- [ ] Draw winner after deadline with partial reveals
- [ ] Prize claim by winner
- [ ] Prize claim rejection by non-winner
- [ ] Refund by owner
- [ ] Refund rejection by non-owner

## License

MIT License - Feel free to use and modify for your projects.

## References

- [TON Random Number Generation](https://docs.ton.org/contract-dev/random.md)
- [Tolk Language Overview](https://docs.ton.org/languages/tolk/overview.md)
- [Commit-Reveal Schemes](https://en.wikipedia.org/wiki/Commitment_scheme)
