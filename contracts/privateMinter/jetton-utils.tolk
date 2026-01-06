import "../common/sharding"
import "storage"

fun calcDeployPriWallet( // minter calls this when deploy & check on incoming
    ownerAddress: address,
    treasury: address,
    minterAddress: address,
    jettonWalletCode: cell,
): AutoDeployAddress {
    val emptyPriWalletStore: PriWalletStore = {
        jettonBalance: 0,
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

fun autoAddrPriWallet(owner: address) { // wallet calls this when deploy and checking on incoming
    val st = lazy PriWalletStore.load();
    return calcDeployPriWallet(owner, st.treasury, st.minterAddress, contract.getCode());
}

fun addrPriWallet(owner: address) {
    return autoAddrPriWallet(owner).calculateAddress();
}

fun calcAddrPriWallet( // wallet calls this except deploy
    ownerAddress: address,
    treasury: address,
    minterAddress: address,
    jettonWalletCode: cell,
) {
    return calcDeployPriWallet(
        ownerAddress,
        treasury,
        minterAddress,
        jettonWalletCode
    ).calculateAddress();
}

