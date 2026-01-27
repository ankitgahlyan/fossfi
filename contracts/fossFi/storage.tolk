import "../common/utils.tolk"

struct NomInAddrs {
    nominee: address? = null
    invitor: address? = null
    invitor0: address? = null
}

struct TrustedAddrs { // todo: map field to store variable trusted addrs by root
    minterAddr: address // todo: use trusted jettonWallets pattern like bidAsk for cross contract centralised calls instead of stateInit storing & for use of provide_wallet_addr onchain api to query jettonWallet addr from owner 
    personalJettonMinter: address? = null,
    personalJettonWallet: address? = null, // separately deployed & manually added by owner
    authorisedAccs: map<address, address> // each acc can delegate its power of attorney
}

struct Addresses {
    ownerAddress: address // todo: changeAble/Recoverable use as verifying incoming msg from owner
    treasury: address // todo: killSwitch for when mainstream
    initialOwnerAddr: address // sent as owner in outbound msg for correct sender check
    nomInAddrs: Cell<NomInAddrs>
    trustedJettonAddrs: Cell<TrustedAddrs>
}

struct Maps {
    friends: map<address, coins> // todo: store jettonAddrs instead of userAddrs for bounce handling or pass extra receiver field in outgoing msg & can it help in socialRecovery too?
    followers: map<address, coins> // todo delete redundant state just keep following and one side friend then bounce on other side if not exists? NO coz how to accClose then!
    followings: map<address, coins>
    invited: map<address, coins>
    
    allowances: map<address, map<address, coins>> // todo need in personal tokens too?
    debts: map<address, coins>
    
    reportInfo: Cell<ReportInfo> 
}

struct ReportInfo {
    reports: map<address, bool>;
    tosBreach: bool = false;
    reporterCount: uint10 = 0; // todo: should be less than 250? msg sending
    disputerCount: uint10 = 0;
    reportResolutionTime: uint32 = 0;
}

struct FiWalletStore { // todo: nft like store migration after activate/upgrade/ID acc also code upgrade & reverese/killSwitch for normal jettons coz of  
    jettonBalance: coins = ton("1") // needed for semantic txn sending from wallet apps, adjusted in transfer 
    creditNeed: coins = 0;
    accumulatedFees: coins = 0; // todo: use fixed no of txn
    debt: coins = 0
    debts: bool = false // todo use this pattern of external informer about state before expensive loading cells
    connections: uint8 = 0 // 250 max msgSending constraints
    active: bool = false
    mintable: bool = true // todo: need? use active instead
    accountInitTime: uint32 = 0 // 
    version: uint10 = 0
    // lastRewardClaimTime: uint32 = 0
    lastWeeklyAllowanceClaimTime: uint32 = 0

    id: cell // todo: implement manual change
    addresses: Cell<Addresses>
    maps: Cell<Maps>

    readonly baseFiWalletCode: cell
}

struct FiStore {
    totalSupply: coins = 0
    walletVersion: uint10 = 0
    adminAddress: address
    nextAdminAddress: address? = null
    readonly baseFiWalletCode: cell // for address calculation
    latestFiWalletCode: cell // for upgrades
    readonly jettonWalletCode: cell // todo: or pass to mint method and store in wallet store directly, personal token
    readonly jettonMinterCode: cell
    metadataUri: cell // Cell<SnakeString> // noNeed2bnull for fossFi minter
}

fun FiStore.load() {
    return FiStore.fromCell(contract.getData());
}

fun FiStore.save(self) {
    contract.setData(self.toCell());
}

fun FiWalletStore.load() {
    return FiWalletStore.fromCell(contract.getData());
}

fun FiWalletStore.save(self) {
    contract.setData(self.toCell());
}
