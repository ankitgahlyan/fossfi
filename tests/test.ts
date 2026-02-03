import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { FossFi, FossFiConfig } from '../wrappers/fi/FossFi';
import { FossFiWallet, FossFiWalletConfig } from '../wrappers/fi/FossFiWallet';
import '@ton/test-utils';
import { findTransaction, flattenTransaction } from "@ton/test-utils";
import { compile } from '@ton/blueprint';
import { envContent } from '../utils/jetton-helpers';

// # Run with coverage
// npx blueprint test --coverage

// # Run with gas reporting  
// npx blueprint test --gas-report

// result.transactions - Array of all transactions in the chain
// result.events - Blockchain events emitted
// result.externals - External messages generated
// expect(result.transactions).toHaveTransaction({
//     from: user.address,
//     to: contract.address,
//     value: toNano('1'),
//     op: 0x12345678, // Operation code
//     success: true,
//     outMessagesCount: 2, // Number of outbound messages
//     deploy: false,
//     body: beginCell()
//         .storeUint(0, 32) // Comment op
//         .storeStringTail("Hello, user!")
//         .endCell()
// });

const setup = async () => {
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('deployer');
    const contract = blockchain.openContract(
        await FossFi.createFromAddress(owner.address),
    );
    const deployResult = await contract.sendDeploy(owner.getSender(), toNano(0.5));
    return { blockchain, owner, contract, deployResult };
};

it('should deploy correctly', async () => {
    const { contract, deployResult } = await setup();

    const txToInspect = findTransaction(
        deployResult.transactions,
        {
            to: contract.address,
            deploy: true,
        },
    );
    if (txToInspect === undefined) {
        throw new Error('Requested tx was not found.');
    }
    // User-friendly output
    console.log(flattenTransaction(txToInspect));
    // Verbose output
    console.log(txToInspect);
});