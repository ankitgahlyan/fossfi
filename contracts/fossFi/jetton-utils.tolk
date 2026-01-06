import "../common/errors"
import "../common/messages"
import "../common/sharding"
import "storage"
import "../common/consts"

fun calcDeployFiWallet(
    ownerAddress: address,
    treasury: address,
    minterAddress: address,
    baseFiWalletCode: cell,
): AutoDeployAddress {
    val emptyFiWalletStore: FiWalletStore = {
        addresses: Addresses {
            ownerAddress,
            treasury,
            initialOwnerAddr: ownerAddress,
            nomInAddrs: NomInAddrs {}.toCell(),
            trustedJettonAddrs: TrustedAddrs {minterAddr: minterAddress}.toCell(),
        }.toCell(),
        maps: Maps {
            friends: createEmptyMap(),
            followers: createEmptyMap(),
            followings: createEmptyMap(),
            invited: createEmptyMap(),
            debts: createEmptyMap(),
            reportInfo: ReportInfo { reports: createEmptyMap() }.toCell(),
        }.toCell(), // todo: learn how to set it default
        id: createEmptyCell(),
        baseFiWalletCode,
    };

    return {
        workchain: MY_WORKCHAIN,
        stateInit: { code: baseFiWalletCode, data: emptyFiWalletStore.toCell() },
        toShard: { fixedPrefixLength: SHARD_DEPTH, closeTo: ownerAddress },
    };
}

// fun calcAddrFiWallet( // used by minter: getter, sending msg(rare)
//     ownerAddress: address,
//     treasury: address,
//     minterAddress: address,
//     baseFiWalletCode: cell,
// ) {
//     return calcDeployFiWallet(
//         ownerAddress,
//         treasury,
//         minterAddress,
//         baseFiWalletCode
//     ).calculateAddress();
// }
fun address.getAddrFiWallet(self, store: FiWalletStore) {
    // used by: wallet txn sending
    return self.autoAddrFiWallet(store).calculateAddress();
}

fun address.autoAddrFiWallet(self, store: FiWalletStore) {
    // used by wallet: deploy/invite,
    // val store = lazy FiWalletStore.load();
    val addrs = lazy store.addresses.load();
    return calcDeployFiWallet(self, addrs.treasury, addrs.trustedJettonAddrs.load().minterAddr, store.baseFiWalletCode);
}

fun address.invite(self, forwardPayload: slice, store: FiWalletStore) {
    // var store = lazy FiWalletStore.load();
    val addrs = lazy store.addresses.load();
    var maps = lazy store.maps.load();
    val reports = lazy maps.reportInfo.load();

    assert (
        reports.reporterCount < 1
    ) throw ALREADY_REPORTED; // todo use in other connecting actions.reported accounts cant't invite
    // assert (store.jettonBalance >= MBRP_AMOUNT) throw ERROR_BALANCE_ERROR; // spam protection but deployer have 1 ton, so...
    assert (store.connections < MAX_CONNECTIONS) throw MAX_CONNECTIONS;
    assert (
        !self.connected(store)
    ) throw CONNECTION_EXISTS; // todo maybe use advanced map methods instead?

    // update stores
    val reward = 10 * MBRP_AMOUNT;
    mintInternal(reward, store);
    maps.invited.set(self, reward);
    store.connections += 1;

    val inviteInternal = createMessage({
        bounce: BounceMode.Only256BitsOfBody, // for refund only
        dest: self.autoAddrFiWallet(store), // deploy in invite + standalone for idLess accounts
        value: 0,
        body: InviteInternal {
            queryId: 0, // todo
            version: store.version,
            id: null,
            sender: addrs.ownerAddress,
            invitor: addrs.nomInAddrs.load().invitor!,
            currentWalletCode: contract.getCode(),
            forwardPayload,
        },
    });
    inviteInternal.send(SEND_MODE_BOUNCE_ON_ACTION_FAIL |
    SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun address.connected(self, store: FiWalletStore) {
    // val store = lazy FiWalletStore.load();
    val addrs = lazy store.addresses.load();
    val maps = lazy store.maps.load();

    return ((self == addrs.ownerAddress) || (self == addrs.nomInAddrs.load().invitor!) ||
    (maps.followers.exists(self)) ||
    (maps.followings.exists(self)) ||
    (maps.friends.exists(self)) ||
    (maps.invited.exists(self)))
        ? true
        : false; // todo fixme null  
}

fun checkCorrectSenderInternal(sender: address, owner: address, store: FiWalletStore) {
    // todo: fixme null owner in case of minter
    // var store = lazy FiWalletStore.load();
    var addrs = lazy store.addresses.load();
    var invitors = lazy addrs.nomInAddrs.load();
    if (sender != owner.getAddrFiWallet(store)) {
        assert (sender == addrs.trustedJettonAddrs.load().minterAddr) throw ERROR_NOT_VALID_WALLET;
        if (!store.active) {
            store.active = true;
            store.connections += 1;
            invitors.invitor = owner;
            invitors.invitor0 = owner;

            store.save();
        }
    }
}

fun mintInternal(amount: coins, store: FiWalletStore) {
    amount = deductDebts(amount, store);
    if (amount > 0) {
        // var store = lazy FiWalletStore.load();
        store.jettonBalance += amount;
    }
}

fun deductDebts(amount: coins, store: FiWalletStore) {
    // var store = lazy FiWalletStore.load();
    var debtsMap = store.maps.load().debts; // todo simple bool store toggle to prevent expensive loads

    var remaining = amount;
    var debt = store.debt;
    val noDebts = debtsMap.isEmpty();
    // nothing to do
    if (remaining <= 0 || (debt == 0 && noDebts)) {
        return remaining;
    }
    if (debt > 0) {
        // TODO: pay a portion and shift to transfer side also
        if (remaining >= debt) {
            remaining -= debt; // continue deducting others
            store.debt = 0;
        } else {
            store.debt = debt - remaining;
            remaining = 0;
            return remaining;
        }
    }

    if (!noDebts) {
        // Pay debts in map order until remaining is exhausted
        var debt = debtsMap.findFirst();
        while (debt.isFound) {
            // ... use r.getKey() and r.loadValue()
            if (remaining <= 0) {
                // ==0
                return remaining; // 0
            }

            val from = debt.getKey();
            var foundDebt = debt.loadValue();

            var pay = 0;
            if (remaining >= foundDebt) {
                pay = foundDebt;
            } else {
                pay = remaining;
            }
            foundDebt -= pay;
            remaining -= pay;

            if (foundDebt == 0) {
                var _ = debtsMap.delete(from);
            } else {
                debtsMap.set(from, foundDebt);
            }
            // emitEvent(2, self.owner, from, pay);
            debt = debtsMap.iterateNext(debt);
        }
    }
    // optional: emit an event for debt payment
    return remaining;
}
