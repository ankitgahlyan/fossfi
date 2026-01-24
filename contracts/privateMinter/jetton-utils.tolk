import "storage"
import "../common/sharding"

fun calcDeployPriWallet(
    ownerAddress: address,
    treasury: address,
    minterAddress: address,
    jettonWalletCode: cell,
): AutoDeployAddress {
    val emptyPriWalletStore: PriWalletStore = {
        ownerAddress,
        treasury,
        minterAddress,
    };

    return {
        workchain: MY_WORKCHAIN,
        stateInit: { code: jettonWalletCode, data: emptyPriWalletStore.toCell() },
        toShard: { fixedPrefixLength: SHARD_DEPTH, closeTo: ownerAddress },
    };
}

@inline
fun calcDeployPriMinter(fiFields: FiFields, adminAddress: address, jettonWalletCode: cell, jettonMinterCode: cell): AutoDeployAddress {
    val emptyPriMinterStore: PriStore = {
        fiFields: fiFields.toCell(),
        adminAddress,
        jettonWalletCode,
    };

    return {
        workchain: BASECHAIN,
        stateInit: { code: jettonMinterCode, data: emptyPriMinterStore.toCell() }, // todo fixme need jettonMinterCode
        toShard: { fixedPrefixLength: SHARD_DEPTH, closeTo: adminAddress }, // noNeed to be in same shard for minter
    };
}


fun autoAddrPriWallet(owner: address) {
    // wallet calls this when deploy and checking on incoming
    val st = lazy PriWalletStore.load();
    return calcDeployPriWallet(owner, st.treasury, st.minterAddress, contract.getCode());
}

fun addrPriWallet(owner: address) {
    return autoAddrPriWallet(owner).calculateAddress();
}

fun calcAddrPriWallet(
    ownerAddress: address,
    treasury: address,
    minterAddress: address,
    jettonWalletCode: cell,
) {
    return calcDeployPriWallet(ownerAddress, treasury, minterAddress, jettonWalletCode)
        .calculateAddress();
}
