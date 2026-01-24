import "fees-management"
import "jetton-utils"
import "storage"
import "../common/errors"
import "../common/messages"
import "../common/sharding"
import "../common/utils.tolk"
import "../fossFi/jetton-utils"

type AllowedMessageToMinter =
    | InternalTransferStep
    | MintNewJettons
    | BurnNotificationForMinter
    | RequestWalletAddress
    | ChangeMinterAdmin
    | ClaimMinterAdmin
    | ChangeMinterMetadataUri
    | UpgradeAnyDataCode
    | TopUpTons

fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();
    // process only mint bounces; on other messages, an exception will be thrown, it's okay
    val msg = lazy InternalTransferStep.fromSlice(in.bouncedBody);

    var storage = lazy PriStore.load();
    storage.totalSupply -= msg.jettonAmount;
    storage.save();
}

fun assertSenderIsAdmin(senderAddress: address, adminAddress: address?) {
    // theoretically, minter's admin can be dropped and be `null`, so being precise, we should check:
    // ```
    // assert (adminAddress != null) throw ERROR_NOT_OWNER;
    // ```
    // but in practice, the above assertion is reduntant, we just bypass the nullability check:
    assert (
        senderAddress == adminAddress!
    ) throw ERROR_NOT_OWNER; // then, if admin is `null`, error code 7 will be thrown (while executing operator `==`),// it's suitable for current implementation
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToMinter.fromSlice(in.body);
    var storage = lazy PriStore.load();

    match (msg) {
        InternalTransferStep => {
            val fiFields = storage.fiFields.load(); // MINT wallet deploys this contract on init
            // (MINT'S minter isn't allowed)
            // if sender is MINT's jettonWallet -> forward to owner's wallet & mint him tokens
            // or this minter's token -> burn & send MINT if available 
            // todo working?
            assert (
                // my token
                in.senderAddress ==
                calcAddrPriWallet(
                    // calc flow in minter, wallet needs just address
                    msg.transferInitiator,
                    fiFields.treasury,
                    contract.getAddress(),
                    storage.jettonWalletCode
                )
            ) throw ERROR_NOT_VALID_WALLET;

            // now decide if mint or burn
            var feeAdjusted = msg.jettonAmount;

            if (storage.adminAddress == storage.fiFields.load().treasury) {
                // todo: fixme && != treasury???
                val fee = msg.jettonAmount / ton("200"); // 0.5% royalty to treasury
                feeAdjusted -= fee;

                // send fee to treasury
                createMessage({
                    bounce: BounceMode.NoBounce,
                    value: 0,
                    dest: autoAddrPriWallet(fiFields.treasury), // todo fixme whose addr
                    body: InternalTransferStep {
                        queryId: msg.queryId,
                        jettonAmount: fee,
                        version: 0, // todo: fixme add store
                        transferInitiator: storage.adminAddress,
                        sendExcessesTo: null,
                        forwardTonAmount: 0,
                        forwardPayload: msg.forwardPayload,
                    },
                })
                    .send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
            }// storage.save();
            // if (msg.forwardTonAmount) {
            //     val notifyOwnerMsg = createMessage({
            //         bounce: BounceMode.NoBounce,
            //         dest: storage.adminAddress,
            //         value: msg.forwardTonAmount,
            //         body: TransferNotificationForRecipient {
            //             queryId: msg.queryId,
            //             jettonAmount: msg.jettonAmount,
            //             transferInitiator: msg.transferInitiator,
            //             forwardPayload: msg.forwardPayload,
            //         },
            //     });
            //     notifyOwnerMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
            // }
            // if (msg.sendExcessesTo != null) {
            //     var toLeaveOnBalance = contract.getOriginalBalance() - in.valueCoins +
            //     contract.getStorageDuePayment();
            //     reserveToncoinsOnBalance(
            //         max(toLeaveOnBalance, calculateJettonWalletMinStorageFee()),
            //         RESERVE_MODE_AT_MOST
            //     );
            //     val excessesMsg = createMessage({
            //         bounce: BounceMode.NoBounce,
            //         dest: msg.sendExcessesTo,
            //         value: 0,
            //         body: ReturnExcessesBack { queryId: msg.queryId },
            //     });
            //     excessesMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
            // }
        }
        // storage.jettonBalance += feeAdjusted;
        // todo: need to call jetton wallet
        BurnNotificationForMinter => {
            assert (
                in.senderAddress ==
                calcAddrPriWallet(
                    msg.burnInitiator,
                    storage.fiFields.load().treasury,
                    contract.getAddress(),
                    storage.jettonWalletCode
                )
            ) throw ERROR_NOT_VALID_WALLET;
            storage.totalSupply -= msg.jettonAmount;
            storage.save();

            if (msg.sendExcessesTo == null) {
                return;
            }

            val excessesMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.sendExcessesTo,
                value: 0,
                body: ReturnExcessesBack { queryId: msg.queryId },
            });
            excessesMsg.send(SEND_MODE_IGNORE_ERRORS | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }

        RequestWalletAddress => {
            val ownerAddress: Cell<address>? = msg.includeOwnerAddress
                ? msg.ownerAddress.toCell()
                : null;

            var jettonWalletAddress: address? = null;
            if (msg.ownerAddress.getWorkchain() == MY_WORKCHAIN) {
                jettonWalletAddress = calcAddrPriWallet(
                    msg.ownerAddress,
                    storage.fiFields.load().treasury,
                    contract.getAddress(),
                    storage.jettonWalletCode
                );
            }

            val respondMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ResponseWalletAddress {
                    queryId: msg.queryId,
                    jettonWalletAddress,
                    ownerAddress,
                },
            });
            respondMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
            SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        MintNewJettons => {
            var storage = lazy PriStore.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            assert (msg.mintRecipient.getWorkchain() == MY_WORKCHAIN) throw ERROR_WRONG_WORKCHAIN;

            val internalTransferMsg = lazy msg.internalTransferMsg.load({
                throwIfOpcodeDoesNotMatch: ERROR_INVALID_OP,
            });
            var forwardTonAmount = internalTransferMsg.forwardTonAmount;
            internalTransferMsg.forwardPayload.checkIsCorrectTLBEither();

            // a little more than needed, it’s ok since it’s sent by the admin and excesses will return back
            checkAmountIsEnoughToTransfer(msg.tonAmount, forwardTonAmount, in.originalForwardFee);

            storage.totalSupply += internalTransferMsg.jettonAmount;
            storage.save();

            reserveToncoinsOnBalance(ton("0.01"), RESERVE_MODE_EXACT_AMOUNT); // reserve for storage fees

            val deployMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: calcDeployPriWallet(
                    msg.mintRecipient,
                    storage.fiFields.load().treasury,
                    contract.getAddress(),
                    storage.jettonWalletCode
                ),
                value: msg.tonAmount,
                body: msg.internalTransferMsg,
            });
            deployMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        ChangeMinterAdmin => {
            var storage = lazy PriStore.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            storage.nextAdminAddress = msg.newAdminAddress;
            storage.save();
        }

        ClaimMinterAdmin => {
            var storage = lazy PriStore.load();
            assertSenderIsAdmin(in.senderAddress, storage.nextAdminAddress);
            storage.adminAddress = storage.nextAdminAddress!;
            storage.nextAdminAddress = null;
            storage.save();
        }

        // DropMinterAdmin => {
        //     var storage = lazy PriStore.load();
        //     assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
        //     storage.adminAddress = ZERO_ADDRESS;
        //     storage.nextAdminAddress = null;
        //     storage.save();
        // }
        ChangeMinterMetadataUri => {
            var storage = lazy PriStore.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            storage.metadataUri = msg.newMetadataUri.toCell();
            storage.save();
        }

        UpgradeAnyDataCode => {
            var storage = lazy PriStore.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            contract.setCodePostponed(msg.newCode);
            contract.setData(msg.newData);
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
}

struct JettonDataReply {
    totalSupply: int
    mintable: bool
    adminAddress: address?
    jettonContent: Cell<OnchainMetadataReply>
    jettonWalletCode: cell
}

struct (0x00) OnchainMetadataReply {
    contentDict: map<uint256, Cell<SnakeDataReply>>
}

struct (0x00) SnakeDataReply {
    string: SnakeString
}

get fun get_jetton_data(): JettonDataReply {
    val storage = lazy PriStore.load();

    var metadata: OnchainMetadataReply = { contentDict: createEmptyMap() };
    if (storage.metadataUri != null) {
        metadata.contentDict.set(
            stringSha256("uri"),
            SnakeDataReply { string: storage.metadataUri.load() }.toCell()
        );
        metadata.contentDict.set(stringSha256("decimals"), SnakeDataReply { string: "9" }.toCell());
    }

    return {
        totalSupply: storage.totalSupply,
        mintable: true,
        adminAddress: storage.adminAddress,
        jettonContent: metadata.toCell(),
        jettonWalletCode: storage.jettonWalletCode,
    };
}

get fun get_wallet_address(ownerAddress: address): address {
    val storage = lazy PriStore.load();
    return calcAddrPriWallet(
        ownerAddress,
        storage.fiFields.load().treasury,
        contract.getAddress(),
        storage.jettonWalletCode
    );
}

get fun get_next_admin_address(): address? {
    val storage = lazy PriStore.load();
    return storage.nextAdminAddress;
}
