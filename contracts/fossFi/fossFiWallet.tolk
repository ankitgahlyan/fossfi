import "@stdlib/gas-payments"
import "@stdlib/tvm-lowlevel"
import "fees-management"
import "jetton-utils"
import "storage"
import "../common/consts"
import "../common/errors"
import "../common/messages"
import "../common/sharding"

type AllowedMessageToWallet =
    | AskToTransfer
    | AskToBurn
    | AuthorityAction
    | InternalTransferStep
    | InternalInvite
    | InternalDeActivate
    | RequestUpgradeCode
    | SetStatus
    | TopUpTons
    | TransferNotificationForRecipient // forwards invite notif invitor0 owner
    | Upgrade
    | VotingAction

type BounceOpToHandle = InternalTransferStep | InternalInvite | VotingAction

// type BounceRich = InternalInvite
// global store: FiWalletStore = lazy FiWalletStore.load();
fun onBouncedMessage(in: InMessageBounced): void {
    in.bouncedBody.skipBouncedPrefix();
    val msg = lazy BounceOpToHandle.fromSlice(in.bouncedBody);
    var store = lazy FiWalletStore.load();
    var restoreAmount: coins = 0;
    match (msg) {
        // todo fixme: ignore < 1 ton symantic txns
        InternalTransferStep => {
            restoreAmount = msg.jettonAmount; // safe to fetch jettonAmount, because it's in the beginning of a message
        }

        // NotifyMinter => restoreAmount = msg.jettonAmount,
        InternalInvite => {
            restoreAmount = -MBRP_AMOUNT + ton("1"); // 
            store.maps.load().invited.delete(in.senderAddress); // jettonAddrs are saved for bounceHandling// store.connections -= 1;
        }

        VotingAction => {} // todo: need?
    }

    // todo: need? to burnForce for async reasons
    store.jettonBalance += restoreAmount;
    store.save(); // todo learn: where to call this
}

fun onInternalMessage(in: InMessage): void {
    val msg = lazy AllowedMessageToWallet.fromSlice(in.body);
    var store = lazy FiWalletStore.load();
    var addrs = lazy store.addresses.load();
    var maps = lazy store.maps.load();
    var nomins = lazy addrs.nomInAddrs.load();

    match (msg) {
        InternalTransferStep => {
            checkCorrectSenderInternal(in.senderAddress, msg.transferInitiator, store);
            // sync version
            // assert (msg.version == store.version) throw UPGRADE;
            if (msg.version == store.version) {
                // continue
            } else if (msg.version < store.version) {
                sendUpgrade(in.senderAddress, addrs.initialOwnerAddr, store.version);
            } else {
                requestUpgrade(in.senderAddress, addrs.initialOwnerAddr, store.version);
            }
            // val incomingTransfersLocked = ((self.status & 2) == 2);
            // val incomingTransfersLocked = (store.locked != false);
            // require(!incomingTransfersLocked, "Incoming transfers are locked");
            store.jettonBalance += msg.jettonAmount;

            var payload = msg.forwardPayload;
            if (payload.remainingBitsCount() >= 32) {
                // check if transferred as loan
                val opcode = payload.loadUint(32);
                if (opcode == 0x0000) {
                    // todo: transfer personal tokens if requirement is unfulfilled
                    var unexpected0 = "failed".hash();
                    val remSlice = payload.hash();
                    var a = beginCell().storeSlice("fails").toSlice();
                    val unexpected = payload.bitsEqual("fail"); // UTF-8 string
                    val noexpect = cmpStringTail(mutate payload, mutate a); // UTF-8 string
                    assert (!unexpected & !noexpect & !(unexpected0 == remSlice)) throw INCORRECT_RECEIVER;
                }
            }
            if (msg.forwardTonAmount) {
                val notifyOwnerMsg = createMessage({
                    bounce: BounceMode.NoBounce, // cause receiver can have uninitialized contract
                    dest: addrs.ownerAddress, // notify current owner
                    value: ton("0.001"), // todo
                    body: TransferNotificationForRecipient {
                        queryId: msg.queryId,
                        jettonAmount: msg.jettonAmount,
                        transferInitiator: msg.transferInitiator,
                        forwardPayload: msg.forwardPayload,
                    },
                });
                notifyOwnerMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL); // bounce back to sender
            }

            if (msg.sendExcessesTo != null) {
                var toLeaveOnBalance = contract.getOriginalBalance() - in.valueCoins +
                contract.getStorageDuePayment();
                reserveToncoinsOnBalance(
                    // todo: manage fees properly
                    max(toLeaveOnBalance + ton("0.5"), calculateJettonWalletMinStorageFee()),
                    RESERVE_MODE_AT_MOST
                );

                val excessesMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: msg.sendExcessesTo,
                    value: 0,
                    body: ReturnExcessesBack { queryId: msg.queryId },
                });
                excessesMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
            }
        }

        AskToTransfer => {
            // todo : or sender == authorityAccount/minter for force transfer in disputes USDT like control
            // val isFromMaster = in.senderAddress == addrs.trustedJettonAddrs.load().minterAddr;
            // val outgoingTransfersAllowed = ((store.status & 1) == 0);
            // val outgoingTransfersAllowed = (store.locked != true);
            // require(outgoingTransfersAllowed || isFromMaster, "Contract is locked");
            // require(sender() == self.owner || isFromMaster, "Incorrect sender");
            assert (in.senderAddress == addrs.ownerAddress) throw ERROR_NOT_OWNER;
            // assert (false, 0); // todo what it does?
            msg.forwardPayload.checkIsCorrectTLBEither();
            assert (
                msg.transferRecipient.getWorkchain() == MY_WORKCHAIN
            ) throw ERROR_WRONG_WORKCHAIN;
            assert (in.valueCoins > ton("0.5"), ERROR_NOT_ENOUGH_GAS); // todo : bench and update
            // checkAmountIsEnoughToTransfer(
            //     // todo: fixme
            //     in.valueCoins,
            //     msg.forwardTonAmount,
            //     in.originalForwardFee
            // );

            // check customPayload
            if (msg.customPayload != null) {
                // parse
                val customMsg = CustomPayloadMsg.fromCell(msg.customPayload, {assertEndAfterReading: true, throwIfOpcodeDoesNotMatch: 63});
                // todo: do something now send custom msg to contracts etc.
                val notifyOwnerMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: addrs.ownerAddress,
                    value: ton("0.001"),
                    body: TransferNotificationForRecipient {
                        queryId: msg.queryId,
                        jettonAmount: msg.jettonAmount,
                        transferInitiator: msg.transferRecipient,
                        forwardPayload: msg.forwardPayload,
                    },
                });
                notifyOwnerMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
            }

            if (msg.jettonAmount >= ton("1")) {
                if (msg.transferRecipient != in.senderAddress) {
                    // no self-transfer
                    // normal txn
                    // todo: fixed fees for now. use subscription based instead that'll be like credit score
                    var burnAmount = 0;
                    if (store.txnCount > 100) {
                        store.txnCount = 0;
                        burnAmount = ton("101");
                        val notifyMinterMsg = createMessage({
                            bounce: BounceMode.NoBounce,
                            dest: addrs.trustedJettonAddrs.load().minterAddr,
                            value: ton("0.01"),
                            body: NotifyMinter {
                                queryId: 0, // to inform about BURN
                                jettonAmount: burnAmount,
                                burnInitiator: addrs.initialOwnerAddr,
                                sendExcessesTo: msg.sendExcessesTo,
                            },
                        });
                        notifyMinterMsg.send(SEND_MODE_PAY_FEES_SEPARATELY |
                        SEND_MODE_BOUNCE_ON_ACTION_FAIL);
                    } else {
                        store.txnCount += 1;
                    }

                    assert (
                        // keep 1 ton that minted on init
                        store.jettonBalance >=
                        msg.jettonAmount + burnAmount
                    ) throw ERROR_BALANCE_ERROR;
                    store.jettonBalance -= msg.jettonAmount + burnAmount;

                    var toLeaveOnBalance = contract.getOriginalBalance() - in.valueCoins +
                    contract.getStorageDuePayment();
                    reserveToncoinsOnBalance(
                        max(toLeaveOnBalance, calculateJettonWalletMinStorageFee()),
                        RESERVE_MODE_AT_MOST
                    );
                    val transferMsg = createMessage({
                        bounce: BounceMode.Only256BitsOfBody,
                        dest: msg.transferRecipient.getAddrFiWallet(store), // only id accounts allowed
                        value: 0,
                        body: InternalTransferStep {
                            queryId: msg.queryId,
                            jettonAmount: msg.jettonAmount,
                            version: store.version,
                            transferInitiator: addrs.initialOwnerAddr,
                            sendExcessesTo: msg.sendExcessesTo,
                            forwardTonAmount: msg.forwardTonAmount,
                            forwardPayload: msg.forwardPayload,
                        },
                    });
                    transferMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL); // return;
                } else {
                    // for getting funding for public works
                    // self.applyGrant(sender, msg.amount);
                    // return;
                    // set creditNeed
                    store.creditNeed = msg.jettonAmount;
                }
            } else {
                match (msg.jettonAmount) {
                    ton("0.101") => {
                        // claim weekly grant
                        val now = blockchain.now();
                        assert (
                            // for 2 years weekly 11,111 tokens can be claimed
                            (now < 63072000 + store.accountInitTime) &&
                            (now > 604800 + store.lastWeeklyAllowanceClaimTime)
                        ) throw WAIT_MORE;

                        // votingPower based mint
                        var claimAmount = ton("11111") + (ton("1") * store.receivedVotes);

                        store.jettonBalance += claimAmount;
                        store.lastWeeklyAllowanceClaimTime = now;
                        // inform minter about new tokens mint
                        val notifyMinterMsg = createMessage({
                            bounce: BounceMode.NoBounce,
                            dest: addrs.trustedJettonAddrs.load().minterAddr,
                            value: 0,
                            body: NotifyMinter {
                                queryId: msg.queryId, // to inform about MINT
                                jettonAmount: claimAmount,
                                burnInitiator: addrs.initialOwnerAddr,
                                sendExcessesTo: msg.sendExcessesTo,
                            },
                        });
                        notifyMinterMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
                        SEND_MODE_BOUNCE_ON_ACTION_FAIL);
                    }

                    ton("0.1") => {
                        idActionChecks(store); // active, !reported
                        // reward
                        store.jettonBalance += MBRP_AMOUNT - ton("1"); // 1 goes to invitee
                        val to = calcDeployFiWallet(
                            msg.transferRecipient,
                            addrs.treasury,
                            addrs.trustedJettonAddrs.load().minterAddr,
                            store.baseFiWalletCode
                        );

                        val inviteInternal = createMessage({
                            bounce: BounceMode.Only256BitsOfBody, // 
                            dest: to, // deploy in invite + standalone for idLess accounts
                            value: 0,
                            body: InternalInvite {
                                queryId: 0, // todo
                                version: store.version,
                                sender: addrs.ownerAddress,
                                invitor: nomins.invitor!, // todo null?
                                currentWalletCode: store.version ? contract.getCode() : null,
                                forwardPayload: msg.forwardPayload,
                            },
                        });
                        inviteInternal.send(SEND_MODE_BOUNCE_ON_ACTION_FAIL |
                        SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
                    }

                    // voting
                    ton("0.11") => {
                        // check if votingPower exists
                        assert (store.votes) throw NO_VOTES_AVAILABLE;
                        assert (
                            msg.transferRecipient != in.senderAddress
                        ) throw INCORRECT_RECEIVER; // no self-voting
                        val candidate = msg.transferRecipient.getAddrFiWallet(store);
                        store.votes = 0;
                        maps.votedFor.set(candidate, 10); // store to unVoteLater + total votes sent

                        val votingMsg = createMessage({
                            bounce: BounceMode.NoBounce, // todo: ok?
                            dest: candidate,
                            value: 0,
                            body: VotingAction {
                                // positiveVote: true, // default
                                // count: 10, // default
                                originalSender: addrs.initialOwnerAddr,
                            },
                        });
                        votingMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
                        SEND_MODE_BOUNCE_ON_ACTION_FAIL);
                    }

                    // claim votes back
                    ton("0.12") => {
                        // assert (!store.votes) throw NOT_VOTED_YET; // noNeed
                        val candidate = msg.transferRecipient.getAddrFiWallet(store);
                        val exists = maps.votedFor.deleteAndGetDeleted(candidate);
                        assert (exists.isFound) throw NOT_VOTED_YET;
                        store.votes += exists.loadValue();

                        val votingMsg = createMessage({
                            bounce: BounceMode.NoBounce,
                            dest: candidate,
                            value: 0,
                            body: VotingAction {
                                positiveVote: false,
                                originalSender: addrs.initialOwnerAddr,
                            },
                        });
                        votingMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
                        SEND_MODE_BOUNCE_ON_ACTION_FAIL);
                    }

                    ton("0.23") => {
                        // just use single for both txn
                        msg.transferRecipient.deActivate(msg.jettonAmount, store); // todo fixme when implementing native ui then use jettonAddrs directly
                    }

                    ton("0.999") => {
                        // todo: fixme
                        requestUpgrade(
                            addrs.trustedJettonAddrs.load().minterAddr,
                            addrs.initialOwnerAddr,
                            store.version
                        );
                    }

                    ton("0.404") => {
                        // send AuthorityAction
                        assert (
                            store.isAuthorityAccount || in.senderAddress == addrs.treasury
                        ) throw INCORRECT_SENDER;

                        val authorityMsg = createMessage({
                            bounce: BounceMode.Only256BitsOfBody,
                            dest: msg.transferRecipient.getAddrFiWallet(store),
                            value: 0,
                            body: AuthorityAction { sender: addrs.initialOwnerAddr },
                        });
                        authorityMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
                        SEND_MODE_BOUNCE_ON_ACTION_FAIL);
                    }
                }
            }
        }

        InternalInvite => {
            // assert (store.jettonBalance == ton("1")) throw ALREADY_INVITED;
            assert (!store.active) throw ALREADY_INVITED; // cheap calc first/failFast
            assert (in.senderAddress == msg.sender.getAddrFiWallet(store)) throw INCORRECT_SENDER;

            store.active = true;
            store.jettonBalance = ton("1"); // for semantic txns.
            if (!store.accountInitTime) {
                store.accountInitTime = blockchain.now();
                nomins.nominee = in.senderAddress; // must be null at init
                store.id = msg.forwardPayload.toCell();

                if (msg.version > store.version) {
                    store.version = msg.version;
                    contract.setCodePostponed(msg.currentWalletCode!);
                }
            }

            nomins.invitor = in.senderAddress; // contract addr
            nomins.invitor0 = msg.invitor; // todo: null, can deactivate acc

            val notifyInvitor0 = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.invitor, // todo: fixme w5 wallet
                value: ton("0.01"),
                body: TransferNotificationForRecipient {
                    queryId: msg.queryId,
                    jettonAmount: ton("0.1"), // invite
                    transferInitiator: msg.sender, // invitor
                    forwardPayload: msg.forwardPayload, // contains idInfo
                },
            });
            notifyInvitor0.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS); // should? bounce

            val notifyMinterMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: addrs.trustedJettonAddrs.load().minterAddr,
                value: ton("0.01"),
                body: InformMinterInviteInternal {
                    sender: addrs.initialOwnerAddr, // different for mint for addr calc
                    invitor: msg.sender, // just invitor not invitor0
                    forwardPayload: msg.forwardPayload, // for broadcast, ledger update
                },
            });
            notifyMinterMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
        }

        InternalDeActivate => {
            // todo: learn no need to check correctInternalSender() for STORED jettonAddrs
            assert (
                in.senderAddress == addrs.nomInAddrs.load().invitor0!
            ) throw INVITE_FIRST; // throws if invitor0 null

            store.active = !store.active;
        }

        // DeActivate accounts
        AuthorityAction => {
            checkCorrectSenderInternal(in.senderAddress, msg.sender, store);
            store.active = !store.active; // todo fixme: action override by others(invitor0 etc)
            if (store.jettonBalance) {
                val transferMsg = createMessage({
                        bounce: BounceMode.Only256BitsOfBody,
                        dest: in.senderAddress, // to authority
                        value: 0,
                        body: InternalTransferStep {
                            queryId: 0,
                            jettonAmount: store.jettonBalance, // all coins
                            version: store.version,
                            transferInitiator: addrs.initialOwnerAddr,
                            sendExcessesTo: addrs.initialOwnerAddr,
                            forwardTonAmount: 0,
                            forwardPayload: "authorityFreeze", // todo
                        },
                    });
                    transferMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
            }
        }

        // for granular control
        SetStatus => {
            // todo fixme : check correct sender
            store.status = msg.status;
        }

        RequestUpgradeCode => {
            checkCorrectSenderInternal(in.senderAddress, msg.sender, store);
            sendUpgrade(in.senderAddress, addrs.initialOwnerAddr, store.version);
        },

        Upgrade => {
            checkCorrectSenderInternal(in.senderAddress, msg.sender, store);
            if (store.version < msg.walletVersion) {
                // ignore if manually upgraded
                store.version = msg.walletVersion;
                // setTvmRegisterC3(transformSliceToContinuation(msg.newCode.beginParse()));
                contract.setCodePostponed(msg.newCode!);
            }
        }

        VotingAction => {
            checkCorrectSenderInternal(in.senderAddress, msg.originalSender, store);
            msg.positiveVote ? store.receivedVotes += msg.count : store.receivedVotes -= msg.count;
            store.isAuthorityAccount = store.receivedVotes > AUTHORITY_THRESHOLD ? true : false;
        }

        AskToBurn => {
            assert (false) throw 0xFFFF; // not allowed
        }

        TopUpTons => {
            // deploy + just accept tons
            if (
                !store.accountInitTime &&
                (in.senderAddress == addrs.trustedJettonAddrs.load().minterAddr)
            ) {
                store.active = true;
                store.jettonBalance += ton("1"); // need for semantic txns.
                store.isAuthorityAccount = true;
                store.accountInitTime = blockchain.now();
                nomins.invitor = contract.getAddress();
                nomins.invitor0 = contract.getAddress();
            }
        }

        TransferNotificationForRecipient => {
            val notifyInvitor0 = createMessage({
                bounce: BounceMode.NoBounce,
                dest: addrs.ownerAddress,
                value: ton("0.01"),
                body: msg,
            });
            notifyInvitor0.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
        }

        else => {
            // invalid input; a typical reaction is:
            // ignore empty messages, "wrong opcode" if not
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }

    addrs.nomInAddrs = nomins.toCell();
    store.addresses = addrs.toCell();
    store.maps = maps.toCell();
    store.save(); // save once for any matches above
}

struct JettonWalletDataReply {
    jettonBalance: coins
    ownerAddress: address
    minterAddress: address
    jettonWalletCode: cell
}

get fun get_wallet_data(): JettonWalletDataReply {
    val store = lazy FiWalletStore.load();
    val addrs = lazy store.addresses.load();

    return {
        jettonBalance: store.jettonBalance,
        ownerAddress: addrs.initialOwnerAddr, // init owner
        minterAddress: addrs.trustedJettonAddrs.load().minterAddr,
        // jettonWalletCode: store.baseFiWalletCode, // init code
        jettonWalletCode: contract.getCode(), // latest
    };
}

get fun get_wallet_data_all(): FiWalletStore {
    return FiWalletStore.load();
}
