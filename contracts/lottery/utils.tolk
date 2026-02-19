import "../common/sharding"

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fun getFiWallet(
    ownerAddress: address,
    treasury: address,
    minterAddress: address,
    baseFiWalletCode: cell,
): address {
    val emptyFiWalletStore: FiWalletStore = {
        addresses: Addresses {
            ownerAddress,
            treasury,
            initialOwnerAddr: ownerAddress,
            nomInAddrs: NomInAddrs {}.toCell(),
            trustedJettonAddrs: TrustedAddrs {
                minterAddr: minterAddress,
                authorisedAccs: createEmptyMap(),
            }.toCell(),
        }.toCell(),
        maps: Maps {
            friends: createEmptyMap(),
            followers: createEmptyMap(),
            followings: createEmptyMap(),
            invited: createEmptyMap(),
            allowances: createEmptyMap(),
            debts: createEmptyMap(),
            closeFriends: createEmptyMap(),
            votedFor: createEmptyMap(),
            reportInfo: ReportInfo { reports: createEmptyMap() }.toCell(),
        }.toCell(),
        id: createEmptyCell(),
        timestamps: TimeStamps {}.toCell(),
        baseFiWalletCode,
    };

    return {
        stateInit: { code: baseFiWalletCode, data: emptyFiWalletStore.toCell() },
        toShard: { fixedPrefixLength: SHARD_DEPTH, closeTo: ownerAddress },
    }.calculateAddress();
}

// Select winner based on random seed
fun selectWinner(seed: uint256, participants: map<address, ()>, count: int32) {
    // Use the seed to select an index
    val winnerIndex = seed % count;
    
    var currentIndex: int32 = 0;
    var entry = participants.findFirst();
    
    while (entry.isFound) {
        if (currentIndex == winnerIndex) {
            return entry.getKey();
        }
        currentIndex += 1;
        entry = participants.iterateNext(entry);
    }
    
    // Fallback (should never reach here)
    throw 999;
}