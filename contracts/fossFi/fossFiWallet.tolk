import "@stdlib/gas-payments"
import "fees-management"
import "jetton-utils"
import "storage"
import "../common/consts"
import "../common/errors"
import "../common/messages"
import "../common/sharding"
import "../privateMinter/jetton-utils"
import "../privateMinter/storage"

type AllowedMessageToWallet =
    | AskToTransfer
    | AskToBurn
    | AuthorityAction
    | InternalTransferStep
    | InternalInvite
    | InternalDeActivate
    | SetStatus
    | TopUpTons
    | UpgradeAnyDataCode

type BounceOpToHandle = InternalTransferStep

// type BounceRich = InternalInvite
// global store: FiWalletStore = lazy FiWalletStore.load();
fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();
    val msg = lazy BounceOpToHandle.fromSlice(in.bouncedBody);
    var store = lazy FiWalletStore.load();
    var restoreAmount: coins;
    match (msg) {
        // todo fixme: ignore < 1 ton symantic txns
        InternalTransferStep => restoreAmount = msg.jettonAmount, // safe to fetch jettonAmount, because
    }
    // NotifyMinter => restoreAmount = msg.jettonAmount, // it's in the beginning of a message
    // InternalInvite => {
    //     restoreAmount = -10 * MBRP_AMOUNT; // todo need fix? negative value
    //     var invited = lazy store.maps.load();
    //     invited.invited.delete(in.senderAddress); // jettonAddrs are saved for bounceHandling
    //     store.connections -= 1;
    // }
    // todo: need? to burnForce for async reasons
    // ignore semantic bounces
    if (restoreAmount >= ton("1")) {
        store.jettonBalance += restoreAmount;
    }
    store.save(); // todo learn: where to call this
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToWallet.fromSlice(in.body);
    var store = lazy FiWalletStore.load();
    val addrs = lazy store.addresses.load();
    match (msg) {
        InternalTransferStep => {
            checkCorrectSenderInternal(in.senderAddress, msg.transferInitiator, store);
            // sync version
            assert (msg.version == store.version) throw UPGRADE;
            // val incomingTransfersLocked = ((self.status & 2) == 2);
            // val incomingTransfersLocked = (store.locked != false);
            // require(!incomingTransfersLocked, "Incoming transfers are locked");
            store.jettonBalance += msg.jettonAmount;

            // check if transferred as loan
            val opcode = msg.forwardPayload.preloadUint(32);
            // val text = msg.forwardPayload.loadStringTail(); // todo: UTF-8 string
            // if (opcode == 0x00000000 && text == "loan") {
            //         // todo: transfer personal tokens if requirement is unfulfilled
            // }
            if (msg.forwardTonAmount) {
                val notifyOwnerMsg = createMessage({
                    bounce: BounceMode.NoBounce, // cause receiver can have uninitialized contract
                    dest: addrs.ownerAddress, // notify current owner
                    value: msg.forwardTonAmount,
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
            msg.forwardPayload.checkIsCorrectTLBEither();
            assert (
                msg.transferRecipient.getWorkchain() == MY_WORKCHAIN
            ) throw ERROR_WRONG_WORKCHAIN;
            checkAmountIsEnoughToTransfer(
                // todo: fixme
                in.valueCoins,
                msg.forwardTonAmount,
                in.originalForwardFee
            );

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
                            value: 0, // todo: fees
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
                        val claimAmount = ton("11111");
                        assert (
                            // for 2 years weekly 11,111 tokens can be claimed
                            (now < 63072000 + store.accountInitTime) &&
                            (now > 604800 + store.lastWeeklyAllowanceClaimTime)
                        ) throw WAIT_MORE;
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
                        calcDeployFiWallet(
                            msg.transferRecipient,
                            addrs.treasury,
                            addrs.trustedJettonAddrs.load().minterAddr,
                            store.baseFiWalletCode
                        )
                            .invite(msg.forwardPayload, store);
                    }

                    ton("0.23") => {
                        // just use single for both txn
                        msg.transferRecipient.deActivate(msg.jettonAmount, store); // todo fixme when implementing native ui then use jettonAddrs directly
                    }

                    ton("0.999") => {
                        requestUpgrade(store);
                    }

                    ton("0.404") => {
                        // send AuthorityAction
                        assert (
                            store.isAuthorityAccount || in.senderAddress == addrs.treasury
                        ) throw INCORRECT_SENDER;

                        val authorityMsg = createMessage({
                            bounce: BounceMode.NoBounce,
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
            var nomins = lazy addrs.nomInAddrs.load();
            if (store.accountInitTime == 0) {
                store.accountInitTime = blockchain.now();
                nomins.nominee = in.senderAddress; // must be null at init
                store.id = msg.forwardPayload.toCell();

                if (msg.version > store.version) {
                    store.version = msg.version;
                    contract.setCodePostponed(msg.currentWalletCode);
                }
            }

            nomins.invitor = in.senderAddress; // contract addr
            nomins.invitor0 = msg.invitor.getAddrFiWallet(store); // can deactivate acc

            val notifyInvitor0 = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.invitor, // w5 wallet
                value: 0,
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
                value: 0,
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
        }

        // for granular control
        SetStatus => {
            // todo fixme : check correct sender
            store.status = msg.status;
        }

        UpgradeAnyDataCode => {
            checkCorrectSenderInternal(in.senderAddress, msg.sender, store);
            if (store.version < msg.walletVersion!) {
                // ignore if manually upgraded
                store.version = msg.walletVersion!;
                contract.setCodePostponed(msg.newCode!);
            }
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
                var invitors = lazy addrs.nomInAddrs.load();
                store.active = true;
                store.jettonBalance += ton("1"); // need for semantic txns.
                store.isAuthorityAccount = true;
                store.accountInitTime = blockchain.now();
                invitors.invitor = contract.getAddress();
                invitors.invitor0 = contract.getAddress();
            }
        }

        else => {
            // invalid input; a typical reaction is:
            // ignore empty messages, "wrong opcode" if not
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }

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
        jettonWalletCode: store.baseFiWalletCode, // init code
    };
}

get fun get_wallet_data_all(): FiWalletStore {
    return FiWalletStore.load();
}
