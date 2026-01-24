import "fees-management"
import "jetton-utils"
import "storage"
import "../common/consts.tolk"
import "../common/errors"
import "../common/messages"
import "../common/sharding"
import "../common/utils"

type AllowedMessageToMinter =
    | MintNewJettons
    | BurnNotificationForMinter
    | RequestWalletAddress
    | ChangeMinterAdmin
    | ClaimMinterAdmin
    | ChangeMinterMetadataUri
    | UpgradeAnyDataCode
    | TopUpTons
    | InformMinterInviteInternal
    | RequestUpgradeCode

fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();
    // process only mint bounces; on other messages, an exception will be thrown, it's okay
    val msg = lazy InternalTransferStep.fromSlice(in.bouncedBody);

    var store = lazy FiStore.load();
    store.totalSupply -= msg.jettonAmount;
    store.save();
}

// fun assertSenderIsAdmin(senderAddress: address, adminAddress: address) {
//     // theoretically, minter's admin can be dropped and be `null`, so being precise, we should check:
//     // ```
//     // assert (adminAddress != null) throw ERROR_NOT_OWNER;
//     // ```
//     // but in practice, the above assertion is reduntant, we just bypass the nullability check:
//     assert (
//         senderAddress == adminAddress
//     ) throw ERROR_NOT_OWNER; // then, if admin is `null`, error code 7 will be thrown (while executing operator `==`),// it's suitable for current implementation
// }
fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToMinter.fromSlice(in.body);
    var store = lazy FiStore.load();

    match (msg) {
        InformMinterInviteInternal => {
            checkCorrectSender(in.senderAddress, msg.sender, store);
            var store = lazy FiStore.load();
            store.totalSupply += 11 * MBRP_AMOUNT; // todo: broadcast id for explorers or dbs
        }

        BurnNotificationForMinter => {
            checkCorrectSender(in.senderAddress, msg.burnInitiator, store);
            store.totalSupply -= msg.jettonAmount;

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
            var ownerAddress: Cell<address>? = msg.includeOwnerAddress
                ? msg.ownerAddress.toCell()
                : null;

            var walletAddress: address? = null;
            if (msg.ownerAddress.getWorkchain() == MY_WORKCHAIN) {
                val store = lazy FiStore.load();
                walletAddress = calcDeployFiWallet(
                    msg.ownerAddress,
                    store.adminAddress,
                    contract.getAddress(),
                    store.baseFiWalletCode,
                    store.jettonWalletCode,
                    store.jettonMinterCode,
                )
                    .calculateAddress();
            }

            val respondMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ResponseWalletAddress {
                    queryId: msg.queryId,
                    jettonWalletAddress: walletAddress,
                    ownerAddress,
                },
            });
            respondMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
            SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        MintNewJettons => {
            assert (in.senderAddress == store.adminAddress) throw ERROR_NOT_OWNER;
            assert (msg.mintRecipient.getWorkchain() == MY_WORKCHAIN) throw ERROR_WRONG_WORKCHAIN;

            val internalTransferMsg = lazy msg.internalTransferMsg.load({
                throwIfOpcodeDoesNotMatch: ERROR_INVALID_OP,
            });
            var forwardTonAmount = internalTransferMsg.forwardTonAmount;
            internalTransferMsg.forwardPayload.checkIsCorrectTLBEither();

            // a little more than needed, it’s ok since it’s sent by the admin and excesses will return back
            checkAmountIsEnoughToTransfer(msg.tonAmount, forwardTonAmount, in.originalForwardFee);

            store.totalSupply += internalTransferMsg.jettonAmount;

            reserveToncoinsOnBalance(ton("0.01"), RESERVE_MODE_EXACT_AMOUNT); // reserve for storage fees

            val deployMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: calcDeployFiWallet(
                    msg.mintRecipient,
                    store.adminAddress,
                    contract.getAddress(),
                    store.baseFiWalletCode,
                    store.jettonWalletCode,
                    store.jettonMinterCode,
                ),
                value: msg.tonAmount,
                body: msg.internalTransferMsg,
            });
            deployMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        ChangeMinterAdmin => {
            assert (in.senderAddress == store.adminAddress) throw ERROR_NOT_OWNER;
            store.nextAdminAddress = msg.newAdminAddress;
        }

        ClaimMinterAdmin => {
            assert (in.senderAddress == store.adminAddress) throw ERROR_NOT_OWNER;
            store.adminAddress = store.nextAdminAddress!;
            store.nextAdminAddress = null;
        }

        // DropMinterAdmin => {
        //     assertSenderIsAdmin(in.senderAddress, store.adminAddress);
        //     store.adminAddress = ZERO_ADDRESS;
        //     store.nextAdminAddress = null;
        // }
        ChangeMinterMetadataUri => {
            assert (in.senderAddress == store.adminAddress) throw ERROR_NOT_OWNER;
            store.metadataUri = msg.newMetadataUri.toCell();
        }

        UpgradeAnyDataCode => {
            assert (in.senderAddress == store.adminAddress) throw ERROR_NOT_OWNER;
            match (msg.queryId) {
                0 => {
                    // for minter
                    if (msg.newCode != null) {
                        contract.setCodePostponed(msg.newCode);
                    }
                    if (msg.newData != null) {
                        contract.setData(msg.newData);
                    }
                }

                1 => {
                    // for jettonWallet of FOSSFIAT/MINT
                    store.walletVersion += 1;
                    store.latestFiWalletCode = msg.newCode!; // shouldn't be null for other than minterUpgrade
                }

                else => {throw INVALID_FWD_PAYLOAD;},
                // 2 => {
                //     store.jettonWalletCode = msg.newCode!;
                // }
            }
        }
        // todo: what about personalJettonMinter upgrades
        RequestUpgradeCode => {
            checkCorrectSender(in.senderAddress, msg.sender, store);
            if (msg.version < store.walletVersion) {
                sendUpgrade(in.senderAddress, store);
            }
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
    store.save(); // todo: what of topUp, upgrade and else cases
}

struct JettonDataReply {
    totalSupply: int
    mintable: bool
    adminAddress: address
    jettonContent: cell // Cell<OnchainMetadataReply>
    jettonWalletCode: cell // name is not baseFiWalletCode coz of standard
}

struct (0x00) OnchainMetadataReply {
    contentDict: map<uint256, Cell<SnakeDataReply>>
}

struct (0x00) SnakeDataReply {
    string: SnakeString
}

get fun get_jetton_data(): JettonDataReply {
    val store = lazy FiStore.load();

    // var metadata: OnchainMetadataReply = { contentDict: createEmptyMap() };
    // // if (store.metadataUri != null) {
    // metadata.contentDict.set(
    //     stringSha256("uri"),
    //     SnakeDataReply { string: store.metadataUri.load() }.toCell()
    // );
    // metadata.contentDict.set(stringSha256("decimals"), SnakeDataReply { string: "9" }.toCell());
    // // }
    return {
        totalSupply: store.totalSupply,
        mintable: true, // but by peers only & not owner
        adminAddress: store.adminAddress,
        jettonContent: store.metadataUri, // metadata.toCell(),
        jettonWalletCode: store.latestFiWalletCode, // todo: or return baseCode?
    };
}

get fun get_wallet_address(ownerAddress: address): address {
    val store = lazy FiStore.load();
    return calcDeployFiWallet(
        ownerAddress,
        store.adminAddress,
        // owner/deployer/treasury
        contract.getAddress(),
        store.baseFiWalletCode,
        store.jettonWalletCode,
        store.jettonMinterCode,
    )
        .calculateAddress();
}

get fun get_next_admin_address(): address? {
    val store = lazy FiStore.load();
    return store.nextAdminAddress;
}

fun checkCorrectSender(sender: address, senderInitOwner: address, store: FiStore) {
    assert (
        sender ==
        calcDeployFiWallet(
            senderInitOwner,
            store.adminAddress,
            contract.getAddress(),
            store.baseFiWalletCode,
            store.jettonWalletCode,
            store.jettonMinterCode,
        )
            .calculateAddress()
    ) throw ERROR_NOT_VALID_WALLET;
}

@inline
fun sendUpgrade(to: address, store: FiStore) {
        val upgradeMsg = createMessage( { // bounce for collecting fees back
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: to,
            body: UpgradeAnyDataCode {
                queryId: 1,
                sender: store.adminAddress,
                walletVersion: store.walletVersion,
                newCode: store.latestFiWalletCode,
                newData: null,
            },
        });
        upgradeMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_IGNORE_ERRORS);
    }
