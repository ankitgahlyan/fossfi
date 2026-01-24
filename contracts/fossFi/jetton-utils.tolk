import "storage"
import "../common/consts"
import "../common/errors"
import "../common/messages"
import "../common/sharding"
import "../privateMinter/jetton-utils"
import "../privateMinter/storage"

fun calcDeployFiWallet(
    ownerAddress: address,
    treasury: address,
    minterAddress: address,
    baseFiWalletCode: cell,
    jettonWalletCode: cell,
    jettonMinterCode: cell,
): AutoDeployAddress {
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
            reportInfo: ReportInfo { reports: createEmptyMap() }.toCell(),
        }.toCell(), // todo: learn how to set it default
        id: createEmptyCell(),
        baseFiWalletCode,
        jettonWalletCode,
        jettonMinterCode,
    };

    return {
        workchain: MY_WORKCHAIN,
        stateInit: { code: baseFiWalletCode, data: emptyFiWalletStore.toCell() },
        toShard: { fixedPrefixLength: SHARD_DEPTH, closeTo: ownerAddress }, // todo: initialOwnerAddr?
    };
}

fun address.getAddrFiWallet(self, store: FiWalletStore) {
    // used by: wallet txn sending
    val addrs = lazy store.addresses.load();
    return calcDeployFiWallet(
        self,
        addrs.treasury,
        addrs.trustedJettonAddrs.load().minterAddr,
        store.baseFiWalletCode,
        store.jettonWalletCode,
        store.jettonMinterCode
    )
        .calculateAddress();
}

fun AutoDeployAddress.invite(self, forwardPayload: slice, store: FiWalletStore) {
    val addrs = lazy store.addresses.load();
    var maps = lazy store.maps.load();

    val jettonAddr = self.calculateAddress();

    idActionChecks(store); // active, !reported
    newConnectionChecks(store, jettonAddr); // <250, !connected

    // update stores
    val reward = 10 * MBRP_AMOUNT;
    store.jettonBalance += reward; // KISS
    // mintInternal(reward, store); // todo: fixme without it burns will bounce
    maps.invited.set(jettonAddr, reward);
    store.connections += 1;

    val inviteInternal = createMessage({
        bounce: BounceMode.Only256BitsOfBody, // 
        dest: self, // deploy in invite + standalone for idLess accounts
        value: 0,
        body: InternalInvite {
            queryId: 0, // todo
            version: store.version,
            id: null,
            sender: addrs.ownerAddress,
            invitor: addrs.nomInAddrs.load().invitor!, // todo null?
            currentWalletCode: contract.getCode(), // todo: init deploy with baseCode and upgrade code on invite
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

    return ((self == contract.getAddress()) || (self == addrs.nomInAddrs.load().invitor!) ||
    (maps.followers.exists(self)) ||
    (maps.followings.exists(self)) ||
    (maps.friends.exists(self)) ||
    (maps.invited.exists(self)))
        ? true
        : false; // todo fixme null  
}

fun checkCorrectSenderInternal(sender: address, senderInitOwner: address, store: FiWalletStore) {
    var addrs = lazy store.addresses.load();
    var invitors = lazy addrs.nomInAddrs.load();

    if (sender == senderInitOwner.getAddrFiWallet(store)) {
        // invitees can also send
        assert (
            store.active
        ) throw ACCOUNT_INACTIVE; // active or invitingMsgOnly(seperateCheckIn InviteInternal)
    } else {
        assert (sender == addrs.trustedJettonAddrs.load().minterAddr) throw ERROR_NOT_VALID_WALLET;
        if (!store.active) {
            store.active = true;
            store.connections += 1;
            invitors.invitor = contract.getAddress(); // todo fixme or adapt logic for null also used after accClosed
            invitors.invitor0 = contract.getAddress();
        }

        // deploy personalMinter for deployer
        val internalTransferStep = InternalTransferStep {
            queryId: 0,
            jettonAmount: ton("1000000"), // 1 million
            version: 0, // unused in personal jettons
            transferInitiator: senderInitOwner, // todo: ok?
            sendExcessesTo: null,
            forwardTonAmount: ton("0.01"),
            forwardPayload: createEmptySlice(),
        };
        val mintMsg = createMessage({
            bounce: BounceMode.NoBounce,
            value: ton("0.5"),
            dest: calcDeployPriMinter(
                FiFields {
                    fiAddr: addrs.trustedJettonAddrs.load().minterAddr, // todo:
                    treasury: addrs.treasury,
                    fiWalletCode: store.baseFiWalletCode,
                },
                senderInitOwner,
                store.jettonWalletCode,
                store.jettonMinterCode
            ),
            // todo personalMinter of deployer of MINT
            body: MintNewJettons {
                queryId: 0,
                mintRecipient: senderInitOwner, // todo
                tonAmount: ton("0.1"),
                internalTransferMsg: internalTransferStep.toCell(),
            },
        });
        mintMsg.send(SEND_MODE_BOUNCE_ON_ACTION_FAIL | SEND_MODE_PAY_FEES_SEPARATELY);
    }// } else if (version < store.version) {
    //     // self.sendUpgrade(in.senderAddress)
    // }
}
//     // todo request code from sender()
// if (version > store.version) {
// check version and sync code
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

fun idActionChecks(store: FiWalletStore) {
    val reports = lazy store.maps.load();
    val reportInfo = lazy reports.reportInfo.load();
    assert (
        store.active
    ) throw ACCOUNT_INACTIVE; // mint/burn actions allowed only for active/ID accounts
    assert (reportInfo.reporterCount < 1) throw ALREADY_REPORTED; // reported IDs can't act
}

fun newConnectionChecks(store: FiWalletStore, targetJetton: address) {
    assert (store.connections < MAX_CONNECTIONS) throw MAX_CONNECTIONS;
    assert (
        !targetJetton.connected(store)
    ) throw CONNECTION_EXISTS; // todo maybe use advanced map methods instead?
}

fun address.deActivate(self, commandAmount: coins, store: FiWalletStore) {
    assert (store.active) throw ACCOUNT_INACTIVE;
    val internalDeActivate = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        dest: self.getAddrFiWallet(store),
        value: 0,
        body: InternalDeActivate {}, // emptybody as jettonAddrs are stored
    });
    internalDeActivate.send(SEND_MODE_BOUNCE_ON_ACTION_FAIL |
    SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

@inline
fun requestUpgrade(store: FiWalletStore) {
    val addrs = lazy store.addresses.load();
    createMessage({
        dest: addrs.trustedJettonAddrs.load().minterAddr,
        bounce: BounceMode.NoBounce,
        value: 0,
        body: RequestUpgradeCode { sender: addrs.initialOwnerAddr, version: store.version },
    })
        .send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_IGNORE_ERRORS);
}

fun burnForce(sender: address, amount: int, store: FiWalletStore) {
    // todo: refactor
    if (amount <= 0) {
        return;
    }

    if (store.jettonBalance >= amount) {
        store.jettonBalance -= amount;
        return;
    }

    // Not enough balance — consume what is left and record remaining as debt to sender
    val shortfall = amount - store.jettonBalance;
    store.jettonBalance = 0;

    var prevDebt = 0; // TODO: need this? 
    var maps = lazy store.maps.load();
    if (maps.debts.exists(sender)) {
        prevDebt = maps.debts.mustGet(sender);
    }
    // TODO FEES?
    maps.debts.set(sender, prevDebt + shortfall); // turnover += amount; // eventually debt gets paid
}

@inline
fun sendUpgrade(to: address, newCode: cell, store: FiWalletStore) {
    // FIXME use BasechainAddress
    // noNeed to check version
    createMessage({
        dest: to,
        value: ton("0.2"),
        bounce: false,
        body: UpgradeAnyDataCode {
            queryId: 0,
            sender: store.addresses.load().initialOwnerAddr,
            walletVersion: store.version,
            newData: null,
            newCode,
        },
    })
        .send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS); // todo don't ignore
}
