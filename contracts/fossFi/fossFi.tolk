import "jetton-utils"
import "storage"
import "../common/consts.tolk"
import "../common/errors"
import "../common/messages"
import "../common/sharding"
import "../lottery/storage"

type AllowedMessageToMinter =
    | MintNewJettons
    | NotifyMinter
    | RequestWalletAddress
    | ChangeMinterAdmin
    | ChangeMinterMetadataUri
    | Upgrade
    | TopUpTons
    | InformMinterInviteInternal
    | RequestUpgradeCode

fun onInternalMessage(in: InMessage): void {
    val msg = lazy AllowedMessageToMinter.fromSlice(in.body);
    var store = lazy FiStore.load();

    match (msg) {
        InformMinterInviteInternal => {
            // todo: use notifyMinter but forwardPayload?
            checkCorrectSender(in.senderAddress, msg.sender, store);
            var store = lazy FiStore.load();
            store.totalSupply += MBRP_AMOUNT; // todo: broadcast id for explorers or dbs
        }

        NotifyMinter => {
            checkCorrectSender(in.senderAddress, msg.burnInitiator, store);

            // determine whether MINT or BURN
            msg.queryId
                ? store.totalSupply += msg.jettonAmount
                : store.totalSupply -= msg.jettonAmount;

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
                    store.baseFiWalletCode
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
            assert (false) throw INCORRECT_RECEIVER; // just for fun/standard
        }

        ChangeMinterAdmin => {
            assert (in.senderAddress == store.adminAddress) throw ERROR_NOT_OWNER;
            store.adminAddress = msg.newAdminAddress;
        }

        ChangeMinterMetadataUri => {
            assert (in.senderAddress == store.adminAddress) throw ERROR_NOT_OWNER;
            store.metadataUri = msg.newMetadataUri;
        }

        Upgrade => {
            assert (in.senderAddress == store.adminAddress) throw ERROR_NOT_OWNER;
            match (msg.walletUpgrade) {
                true => {
                    // for jettonWallet of FOSSFIAT/MINT
                    store.walletVersion += 1;
                    store.latestFiWalletCode = msg.newCode!; // shouldn't be null for other than minterUpgrade
                    val upgradeMsg = createMessage({
                        bounce: BounceMode.NoBounce,
                        value: 0,
                        dest: calcDeployFiWallet(
                            in.senderAddress,
                            store.adminAddress,
                            // owner/deployer/treasury
                            contract.getAddress(),
                            store.baseFiWalletCode
                        )
                            .calculateAddress(),
                        body: Upgrade {
                            walletVersion: store.walletVersion,
                            sender: store.adminAddress,
                            newCode: msg.newCode!,
                        },
                    });
                    upgradeMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
                    SEND_MODE_IGNORE_ERRORS);
                }

                false => {
                    // for minter
                    if (msg.newCode != null) {
                        contract.setCodePostponed(msg.newCode);
                    }
                    if (msg.newData != null) {
                        contract.setData(msg.newData);
                    }
                }
            }
        }

        RequestUpgradeCode => {
            checkCorrectSender(in.senderAddress, msg.sender, store);
            if (msg.version < store.walletVersion) {
                // sendUpgradeMinter(in.senderAddress, store);
                val upgradeMsg = createMessage({
                    // bounce for collecting fees back
                    bounce: BounceMode.NoBounce,
                    value: 0,
                    dest: in.senderAddress,
                    body: Upgrade {
                        walletVersion: store.walletVersion,
                        sender: store.adminAddress,
                        newCode: store.latestFiWalletCode!,
                    },
                });
                upgradeMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
                SEND_MODE_IGNORE_ERRORS);
            }
        }

        TopUpTons => {
            // deploy + accept tons + deploy jettonWallet
            if (in.senderAddress == store.adminAddress) {
                store.totalSupply += ton("1"); // needed for semantic txn minted to deployer
                val deployTopUpMsg = createMessage({
                    // bounce for collecting fees back
                    bounce: BounceMode.Only256BitsOfBody,
                    value: 0,
                    dest: calcDeployFiWallet(
                        in.senderAddress,
                        store.adminAddress,
                        contract.getAddress(),
                        store.baseFiWalletCode
                    ),
                    body: TopUpTons { queryId: msg.queryId },
                });
                deployTopUpMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE |
                SEND_MODE_BOUNCE_ON_ACTION_FAIL);
            }
        }

        else => {
            // invalid input; a typical reaction is:
            // ignore empty messages, "wrong opcode" if not
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
    store.save();
}

struct JettonDataReply {
    totalSupply: int
    mintable: bool
    adminAddress: address
    jettonContent: cell // Cell<OnchainMetadataReply>
    jettonWalletCode: cell
}

// struct (0x00) OnchainMetadataReply {
//     contentDict: map<uint256, Cell<SnakeDataReply>>
// }
// struct (0x00) SnakeDataReply {
//     string: SnakeString
// }
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
        mintable: true, // but by peers only & not minter
        adminAddress: store.adminAddress,
        jettonContent: store.metadataUri, // metadata.toCell(),
        jettonWalletCode: store.baseFiWalletCode,
    };
}

get fun get_jetton_data_all() {
    return FiStore.load(); // todo: return contract code + data also
}

get fun get_wallet_address(ownerAddress: address) {
    val store = lazy FiStore.load();
    return calcDeployFiWallet(
        ownerAddress,
        store.adminAddress,
        // owner/deployer/treasury
        contract.getAddress(),
        store.baseFiWalletCode
    )
        .calculateAddress();
}

fun checkCorrectSender(sender: address, senderInitOwner: address, store: FiStore) {
    assert (
        sender ==
        calcDeployFiWallet(
            senderInitOwner,
            store.adminAddress,
            contract.getAddress(),
            store.baseFiWalletCode
        )
            .calculateAddress()
    ) throw ERROR_NOT_VALID_WALLET;
}

// todo: implement minter deploy(efficient) not jetton(costly stateinit send)
// todo: implement bouncing-lottery also for gamification of network
fun calcDeployLottery(
    treasury: address,
    minter: address,
    fiJettonInitCode: cell,
    lotteryCode: cell // todo: fixme,,,
): AutoDeployAddress {
    val emptyFiWalletStore: LotteryStorage = {
        participants: createEmptyMap(),
        minter,
        treasury,
        fiJettonInitCode,
    };

    return { stateInit: { code: lotteryCode, data: emptyFiWalletStore.toCell() } };
}
