import "@stdlib/gas-payments"
import "../common/errors"
import "fees-management"
import "jetton-utils"
import "../common/messages"
import "../common/sharding"
import "storage"
import "../fossFi/jetton-utils"

type AllowedMessageToWallet = AskToTransfer | AskToBurn | InternalTransferStep | TopUpTons

type BounceOpToHandle = InternalTransferStep | BurnNotificationForMinter

fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();

    val msg = lazy BounceOpToHandle.fromSlice(in.bouncedBody);
    val restoreAmount = match (msg) {
        InternalTransferStep => msg.jettonAmount, // safe to fetch jettonAmount, because
        BurnNotificationForMinter => msg.jettonAmount, // it's in the beginning of a message
    };

    var storage = lazy PriWalletStore.load();
    storage.jettonBalance += restoreAmount;
    storage.save();
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToWallet.fromSlice(in.body);
    var storage = lazy PriWalletStore.load();
    match (msg) {
        InternalTransferStep => {
            if (in.senderAddress != storage.minterAddress) { // TODO: or treasury
                assert (
                    in.senderAddress ==
                    addrPriWallet(msg.transferInitiator!)
                ) throw ERROR_NOT_VALID_WALLET;
            }

            var feeAdjusted = msg.jettonAmount;

            if (storage.ownerAddress == storage.treasury) { // && != treasury???
                val fee = msg.jettonAmount / ton("200"); // 0.5% royalty to treasury
                feeAdjusted -= fee;

                // send fee to treasury
                createMessage({
                    bounce: BounceMode.NoBounce,
                    value: 0,
                    dest: addrPriWallet(storage.treasury),
                    body: InternalTransferStep {
                        queryId: msg.queryId,
                        jettonAmount: fee,
                        version: 0, // todo: implement
                        transferInitiator: storage.ownerAddress,
                        sendExcessesTo: null,
                        forwardTonAmount: 0,
                        forwardPayload: msg.forwardPayload,
                    },
                })
                    .send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
            }

            storage.jettonBalance += feeAdjusted;
            storage.save();

            if (msg.forwardTonAmount) {
                val notifyOwnerMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.ownerAddress,
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
            msg.forwardPayload.checkIsCorrectTLBEither();
            assert (
                msg.transferRecipient.getWorkchain() == MY_WORKCHAIN
            ) throw ERROR_WRONG_WORKCHAIN;
            checkAmountIsEnoughToTransfer(
                in.valueCoins,
                msg.forwardTonAmount,
                in.originalForwardFee
            );

            // var storage = lazy PriWalletStore.load();
            assert (in.senderAddress == storage.ownerAddress) throw ERROR_NOT_OWNER;
            assert (storage.jettonBalance >= msg.jettonAmount) throw ERROR_BALANCE_ERROR;
            storage.jettonBalance -= msg.jettonAmount;
            storage.save();

            val deployMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: autoAddrPriWallet(msg.transferRecipient),
                value: 0,
                body: InternalTransferStep {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    version: 0, // todo: implement
                    transferInitiator: storage.ownerAddress,
                    sendExcessesTo: msg.sendExcessesTo,
                    forwardTonAmount: msg.forwardTonAmount,
                    forwardPayload: msg.forwardPayload,
                },
            });
            deployMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
            SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        AskToBurn => {
            checkAmountIsEnoughToBurn(in.valueCoins);

            // var storage = lazy PriWalletStore.load();
            assert (in.senderAddress == storage.ownerAddress) throw ERROR_NOT_OWNER;
            assert (storage.jettonBalance >= msg.jettonAmount) throw ERROR_BALANCE_ERROR;
            storage.jettonBalance -= msg.jettonAmount;
            storage.save();

            val notifyMinterMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: storage.minterAddress,
                value: 0,
                body: BurnNotificationForMinter {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    burnInitiator: storage.ownerAddress,
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
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

struct JettonWalletDataReply {
    jettonBalance: coins
    ownerAddress: address
    minterAddress: address
    jettonWalletCode: cell
}

get fun get_wallet_data(): JettonWalletDataReply {
    val storage = lazy PriWalletStore.load();

    return {
        jettonBalance: storage.jettonBalance,
        ownerAddress: storage.ownerAddress,
        minterAddress: storage.minterAddress,
        jettonWalletCode: contract.getCode(),
    };
}
