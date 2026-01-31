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

export type FossFiWalletConfig = {};

export function fossFiWalletConfigToCell(config: FossFiWalletConfig): Cell {
    return beginCell().endCell();
}

export class FossFiWallet implements Contract {
    abi: ContractABI = { name: 'FossFiWallet' }

    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

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
