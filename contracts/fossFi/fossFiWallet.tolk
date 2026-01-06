import "@stdlib/gas-payments"
import "../common/errors"
import "fees-management"
import "jetton-utils"
import "../common/messages"
import "../common/sharding"
import "storage"
import "../common/consts"

type AllowedMessageToWallet =
    | AskToTransfer
    | AskToBurn
    | InternalTransferStep
    | InviteInternal
    | TopUpTons

type BounceOpToHandle = InternalTransferStep | InviteInternal | BurnNotificationForMinter

// type BounceRich = InviteInternal
// global store: FiWalletStore = lazy FiWalletStore.load();
fun onBouncedMessage(in: InMessageBounced) {
    // in.bouncedBody.skipBouncedPrefix();
    val msg = lazy BounceOpToHandle.fromSlice(in.bouncedBody);
    var store = lazy FiWalletStore.load();
    var restoreAmount: coins;
    match (msg) {
        InternalTransferStep => restoreAmount = msg.jettonAmount, // safe to fetch jettonAmount, because
        BurnNotificationForMinter => restoreAmount = msg.jettonAmount, // it's in the beginning of a message
        InviteInternal => {
            // todo: for optimist invites, update invite fun also and just inform invitor instead of approval
            restoreAmount = - 10 * MBRP_AMOUNT; // todo need fix? negative value
            var invited = lazy store.maps.load();
            invited.invited.delete(in.senderAddress); // todo fixme need to delete owner of sender
            store.connections -= 1;

        }
    }

    // todo: need to burnForce
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
            // store.save();

            if (msg.forwardTonAmount) {
                val notifyOwnerMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: addrs.ownerAddress,
                    value: msg.forwardTonAmount,
                    body: TransferNotificationForRecipient {
                        queryId: msg.queryId,
                        jettonAmount: msg.jettonAmount,
                        transferInitiator: msg.transferInitiator,
                        forwardPayload: msg.forwardPayload,
                    },
                });
                notifyOwnerMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
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
            }
        }

        AskToTransfer => {
            assert (in.senderAddress == addrs.ownerAddress) throw ERROR_NOT_OWNER;
            msg.forwardPayload.checkIsCorrectTLBEither();
            assert (
                msg.transferRecipient.getWorkchain() == MY_WORKCHAIN
            ) throw ERROR_WRONG_WORKCHAIN;
            checkAmountIsEnoughToTransfer(
                // todo: 
                in.valueCoins,
                msg.forwardTonAmount,
                in.originalForwardFee
            );

            if (msg.jettonAmount >= ton("1")) {
                if (msg.transferRecipient != in.senderAddress) {
                    // normal txn
                    // self.burn(msg.amount); // for fees and treasury minting
                    assert (store.jettonBalance >= msg.jettonAmount + ton("1")) throw ERROR_BALANCE_ERROR;
                    store.jettonBalance -= msg.jettonAmount;
                    // store.save(); // continue below to sent msg to receiver
                } else {
                    // for getting funding for public works
                    // self.applyGrant(sender, msg.amount);
                    // return;
                }
            } else {
                // semantic txn
                assert (store.active) throw ACCOUNT_INACTIVE;

                match (msg.jettonAmount) {
                    ton("0.1") => {
                        msg.transferRecipient.invite(msg.forwardPayload, store);
                    }

                    ton("0.2") => {}
                }

                return; // early return to avoid sending msg below to receiver
            }

            val deployMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: msg.transferRecipient.autoAddrFiWallet(store), // deploy for idLess accounts
                value: 0,
                body: InternalTransferStep {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    version: store.version,
                    transferInitiator: addrs.ownerAddress,
                    sendExcessesTo: msg.sendExcessesTo,
                    forwardTonAmount: msg.forwardTonAmount,
                    forwardPayload: msg.forwardPayload,
                },
            });
            deployMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
            SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        InviteInternal => {
            checkCorrectSenderInternal(in.senderAddress, msg.sender, store);
            assert (!store.active) throw ALREADY_INVITED;
            addrs.nomInAddrs.load().nominee = msg.sender;
            addrs.nomInAddrs.load().invitor = msg.sender;
            addrs.nomInAddrs.load().invitor0 = msg.invitor;
            store.id = msg.forwardPayload.toCell();

            // todo other store updates
            if (store.accountInitTime == 0) {
                store.accountInitTime = blockchain.now();
            }
            store.active = true;
            store.connections += 1;
            mintInternal(MBRP_AMOUNT, store);

            // upgrade code if not already
            if (msg.version > store.version) {
                // fresh invite
                store.version = msg.version;
                contract.setCodePostponed(msg.currentWalletCode);
            } else if (msg.version < store.version) {
                // todo: reInvite/changeInvitor, redundant?
                // todo 
                // self.sendUpgrade(in.senderAddress)
            }

            // store.save();

            val notifyInvitor0 = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.invitor, // w5 wallet
                value: 0, // todo fixme some tons?
                body: TransferNotificationForRecipient {
                    queryId: msg.queryId,
                    jettonAmount: ton("0.1"), // invite
                    transferInitiator: msg.sender,
                    forwardPayload: msg.forwardPayload,
                },
            });
            notifyInvitor0.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS); // todo other action

            val notifyMinterMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody, // todo: fixme actions/handle on bounce
                dest: addrs.trustedJettonAddrs.load().minterAddr,
                value: 0,
                body: InviteInternal {
                    queryId: msg.queryId,
                    version: msg.version,
                    id: null,
                    sender: addrs.ownerAddress, // different for mint for addr calc
                    invitor: msg.sender, // just invitor not invitor0
                    currentWalletCode: createEmptyCell(), // noNeed
                    forwardPayload: msg.forwardPayload, // for broadcast, ledger update
                },
            });
            notifyMinterMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }
        // todo comma
        AskToBurn => {
            checkAmountIsEnoughToBurn(in.valueCoins);

            assert (in.senderAddress == addrs.ownerAddress) throw ERROR_NOT_OWNER;
            assert (store.jettonBalance >= msg.jettonAmount) throw ERROR_BALANCE_ERROR;
            store.jettonBalance -= msg.jettonAmount;
            // store.save();

            val notifyMinterMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: addrs.trustedJettonAddrs.load().minterAddr,
                value: 0,
                body: BurnNotificationForMinter {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    burnInitiator: addrs.ownerAddress,
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
        ownerAddress: addrs.ownerAddress,
        minterAddress: addrs.trustedJettonAddrs.load().minterAddr,
        jettonWalletCode: contract.getCode(), // latest code
    };
}
