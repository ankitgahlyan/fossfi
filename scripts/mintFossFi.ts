import { toNano, beginCell, Address, SendMode, fromNano } from '@ton/core';
import { content, envContent } from '../utils/jetton-helpers';
import { FossFiConfig, MintNewJettons, storeMint } from '../wrappers/fi/FossFi';
import { getJettonHttpLink, getNetworkFromEnv } from '../utils/utils';
import { printSeparator } from '../utils/print';
// import "dotenv/config";

import { FossFi } from '../wrappers/fi/FossFi';
import { compile, NetworkProvider } from '@ton/blueprint';
import { FI_ADDRESS } from './consts';

export async function run(provider: NetworkProvider) {
    const deployerAddress = provider.sender().address!;
    const fossFi = provider.open(FossFi.createFromAddress(Address.parse(FI_ADDRESS)));

    // deploy first by sending init and value
    const mint = {
        $$type: "MintNewJettons",
        queryId: 0n,
        mintRecipient: deployerAddress,
        tonAmount: toNano("0.2"),
        internalTransferMsg: {
            $$type: "InternalTransferStep",
            queryId: 0n,
            jettonAmount: toNano("1000"), // mint 1000 jettons
            version: 0n,
            transferInitiator: deployerAddress,
            sendExcessesTo: deployerAddress,
            forwardTonAmount: 0n,
            forwardPayload: beginCell().storeUint(0, 1).asSlice(),
        },
    } as MintNewJettons;

    await provider.sender().send(
        {
            value: toNano("0.2"),
            to: fossFi.address,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            init: fossFi.init,
            body: beginCell()
                .store(
                    storeMint(mint),
                )
                .endCell(),
        }
    )
}
