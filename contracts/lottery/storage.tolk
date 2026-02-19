// ============================================================================
// STORAGE
// ============================================================================

struct LotteryStorage {
    participants: map<address, ()> // todo: fixme max participants
    participantCount: int32 = 0
    revealDeadline: int32 = 0
    prizePool: coins = 0
    randomSeed: uint256 = 0
    minter: address
    treasury: address
    fiJettonInitCode: cell
}

fun LotteryStorage.load() {
    return LotteryStorage.fromCell(contract.getData())
}

fun LotteryStorage.save(self) {
    contract.setData(self.toCell())
}