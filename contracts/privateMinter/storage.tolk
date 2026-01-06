import "../common/utils"

struct FiFields {
    fiAddr: address
    treasury: address
    fiWalletCode: cell
}

struct PriWalletStore {
    jettonBalance: coins
    ownerAddress: address
    treasury: address
    minterAddress: address

}

struct PriStore {
    totalSupply: coins
    creditRequired: coins
    fiFields: Cell<FiFields>
    adminAddress: address
    nextAdminAddress: address?
    jettonWalletCode: cell
    metadataUri: Cell<SnakeString>? // to deploy directly from MINT wallet & calc minter addr onchain
}

fun PriStore.load() {
    return PriStore.fromCell(contract.getData());
}

fun PriStore.save(self) {
    contract.setData(self.toCell());
}

fun PriWalletStore.load() {
    return PriWalletStore.fromCell(contract.getData());
}

fun PriWalletStore.save(self) {
    contract.setData(self.toCell());
}
