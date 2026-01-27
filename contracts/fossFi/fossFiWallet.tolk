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
    | InternalTransferStep
    | InternalInvite
    | InternalDeActivate
    // | InternalInviteApproval
    | TopUpTons
    | UpgradeAnyDataCode

type BounceOpToHandle = InternalTransferStep | InternalInvite | BurnNotificationForMinter

// type BounceRich = InternalInvite
// global store: FiWalletStore = lazy FiWalletStore.load();
fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();
    val msg = lazy BounceOpToHandle.fromSlice(in.bouncedBody);
    var store = lazy FiWalletStore.load();
    var restoreAmount: coins;
    match (msg) {
        InternalTransferStep => restoreAmount = msg.jettonAmount, // safe to fetch jettonAmount, because
        BurnNotificationForMinter => restoreAmount = msg.jettonAmount, // it's in the beginning of a message
        InternalInvite => {
            restoreAmount = -10 * MBRP_AMOUNT; // todo need fix? negative value
            var invited = lazy store.maps.load();
            invited.invited.delete(in.senderAddress); // jettonAddrs are saved for bounceHandling
            store.connections -= 1;
        }
    }

    // todo: need? to burnForce for async reasons
    store.jettonBalance += restoreAmount;
    store.save(); // todo learn: where to call this
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToWallet.fromSlice(in.body);
    var store = lazy FiWalletStore.load();
    val addrs = lazy store.addresses.load();
    match (msg) {
        InternalTransferStep => {
            checkCorrectSenderInternal(in.senderAddress, msg.transferInitiator, store);

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
                    max(toLeaveOnBalance, calculateJettonWalletMinStorageFee()),
                    RESERVE_MODE_AT_MOST
                );

                val excessesMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: msg.sendExcessesTo,
                    value: 0,
                    body: ReturnExcessesBack { queryId: msg.queryId },
                });
                excessesMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
            }// msgValue -= (storageFee + JETTON_WALLET_GAS_CONSUMPTION);
            // if (msg.forwardTonAmount) {
            //     msgValue -= (msg.forwardTonAmount + in.originalForwardFee);
            //     val notifyOwnerMsg = createMessage({
            //         bounce: BounceMode.NoBounce,      // cause receiver can have uninitialized contract
            //         dest: storage.ownerAddress,
            //         value: msg.forwardTonAmount,
            //         body: TransferNotificationForRecipient {
            //             queryId: msg.queryId,
            //             jettonAmount: msg.jettonAmount,
            //             transferInitiator: msg.transferInitiator,
            //             forwardPayload: msg.forwardPayload
            //         }
            //     });
            //     notifyOwnerMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
            // }
            // if (msg.sendExcessesTo != null & (msgValue > 0)) {
            //     val excessesMsg = createMessage({
            //         bounce: BounceMode.NoBounce,
            //         dest: msg.sendExcessesTo!,
            //         value: msgValue,
            //         body: ReturnExcessesBack {
            //             queryId: msg.queryId
            //         }
            //     });
            //     excessesMsg.send(SEND_MODE_IGNORE_ERRORS);
            // }
        }
        // var storageFee = MIN_TONS_FOR_STORAGE - min(tonBalanceBeforeMsg, MIN_TONS_FOR_STORAGE);
        // var tonBalanceBeforeMsg = contract.getOriginalBalance() - msgValue;
        // var msgValue = in.valueCoins;
        AskToTransfer => {
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
                    // self.burn(msg.amount); // for fees and treasury minting
                    // accumulate fees, send to invitor after threshold to avoid freqTxns
                    var fees: coins = 0;
                    val invitor = addrs.nomInAddrs.load().invitor;
                    if (invitor != null) {
                        // for top and closedAccs
                        fees = msg.jettonAmount / ton("50"); // 0.5%
                        // now transfer
                        val totalFees = store.accumulatedFees + fees;
                        if (totalFees > ton("100")) {
                            // todo: send fees to invitor
                            val transferMsg = createMessage({
                                bounce: BounceMode.Only256BitsOfBody,
                                dest: invitor,
                                value: 0,
                                body: InternalTransferStep {
                                    queryId: msg.queryId,
                                    jettonAmount: totalFees,
                                    version: store.version,
                                    transferInitiator: addrs.initialOwnerAddr,
                                    sendExcessesTo: msg.sendExcessesTo,
                                    forwardTonAmount: msg.forwardTonAmount,
                                    forwardPayload: msg.forwardPayload,
                                },
                            });
                            transferMsg.send(SEND_MODE_PAY_FEES_SEPARATELY |
                            SEND_MODE_BOUNCE_ON_ACTION_FAIL);

                            store.accumulatedFees = 0;
                        } else {
                            store.accumulatedFees += fees;
                        }
                    }
                    assert (
                        // keep 1 ton that minted on init
                        store.jettonBalance >=
                        msg.jettonAmount + ton("1") + fees
                    ) throw ERROR_BALANCE_ERROR;
                    store.jettonBalance -= msg.jettonAmount + fees;

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
                // semantic txn
                assert (store.active) throw ACCOUNT_INACTIVE;

                match (msg.jettonAmount) {
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

        UpgradeAnyDataCode => {
            checkCorrectSenderInternal(in.senderAddress, msg.sender, store);
            if (store.version < msg.walletVersion!) {
                // ignore if manually upgraded
                store.version = msg.walletVersion!;
                contract.setCodePostponed(msg.newCode!);
            }
        }

        AskToBurn => {
            checkAmountIsEnoughToBurn(in.valueCoins);

            assert (in.senderAddress == addrs.ownerAddress) throw ERROR_NOT_OWNER;
            assert (store.jettonBalance >= msg.jettonAmount) throw ERROR_BALANCE_ERROR;
            store.jettonBalance -= msg.jettonAmount;

            val notifyMinterMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: addrs.trustedJettonAddrs.load().minterAddr,
                value: 0,
                body: BurnNotificationForMinter {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    burnInitiator: addrs.initialOwnerAddr,
                    sendExcessesTo: msg.sendExcessesTo,
                },
            });
            notifyMinterMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
            SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        TopUpTons => {
            // just accept tons
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
