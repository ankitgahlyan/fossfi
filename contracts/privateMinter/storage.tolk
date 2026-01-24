import "../common/utils"

struct FiFields {
    fiAddr: address // maybe use for onchain api addr queries
    treasury: address // for fees collection
    fiWalletCode: cell // for addr calc to send msg to MINT jettons
}

struct PriWalletStore {
    jettonBalance: coins = 0 
    ownerAddress: address
    treasury: address
    minterAddress: address
}

struct PriStore { // not upgradable
    totalSupply: coins = 0
    creditRequired: coins = 0
    fiFields: Cell<FiFields>
    adminAddress: address
    nextAdminAddress: address? = null
    readonly jettonWalletCode: cell
    metadataUri: Cell<SnakeString>? = null // to deploy directly from MINT wallet & calc minter addr onchain
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
