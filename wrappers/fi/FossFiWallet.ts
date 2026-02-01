import {
    Address,
    beginCell,
    Cell,
    Contract,
    ContractABI,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode
} from '@ton/core';

export type FossFiWalletConfig = {
    balance: bigint,
    votes: number,
    id: Cell,
    addresses: Cell,
    maps: Cell,
    base_fi_wallet_code: Cell,
};

export function fossFiWalletConfigToCell(config: FossFiWalletConfig): Cell {
    return beginCell()
        .storeCoins(config.balance) // jettonBalance
        .storeUint(0, 8) // txnCount
        .storeUint(0, 2) // status
        .storeBit(false) // isAuthorityAccount
        .storeCoins(0) // creditNeed
        .storeCoins(0) // accumulatedFees
        .storeCoins(0) // debt
        .storeBit(false) // debts
        .storeUint(10, 4) // votes
        .storeUint(0, 20) // receivedVotes
        .storeUint(0, 8) // connections
        .storeBit(false) // active
        .storeBit(true) // mintable
        .storeUint(0, 32) // accountInitTime
        .storeUint(0, 10) // version
        .storeUint(0, 32) // lastWeeklyAllowanceClaimTime
        .storeRef(config.id) // uniqueId
        .storeRef(config.addresses) // addresses map
        .storeRef(config.maps) // other maps
        .storeRef(config.base_fi_wallet_code) // baseCode
        .endCell()
}

export class FossFiWallet implements Contract {
    abi: ContractABI = { name: 'FossFiWallet' }

    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) { }

    static createFromAddress(address: Address) {
        return new FossFiWallet(address);
    }

    static createFromConfig(config: FossFiWalletConfig, code: Cell, workchain = 0) {
        const data = fossFiWalletConfigToCell(config);
        const init = { code, data };
        return new FossFiWallet(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
