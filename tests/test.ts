// import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
// import { beginCell, Cell, toNano } from '@ton/core';
// import { FossFi, FossFiConfig } from '../wrappers/fi/FossFi';
// import { FossFiWallet, FossFiWalletConfig } from '../wrappers/fi/FossFiWallet';
// import '@ton/test-utils';
// import { findTransaction, flattenTransaction } from "@ton/test-utils";
// import { compile } from '@ton/blueprint';
// import { envContent } from '../utils/jetton-helpers';

// // # Run with coverage
// // npx blueprint test --coverage

// // # Run with gas reporting  
// // npx blueprint test --gas-report

// // result.transactions - Array of all transactions in the chain
// // result.events - Blockchain events emitted
// // result.externals - External messages generated
// // expect(result.transactions).toHaveTransaction({
// //     from: user.address,
// //     to: contract.address,
// //     value: toNano('1'),
// //     op: 0x12345678, // Operation code
// //     success: true,
// //     outMessagesCount: 2, // Number of outbound messages
// //     deploy: false,
// //     body: beginCell()
// //         .storeUint(0, 32) // Comment op
// //         .storeStringTail("Hello, user!")
// //         .endCell()
// // });

// const setup = async () => {
//     const blockchain = await Blockchain.create();
//     const owner = await blockchain.treasury('deployer');
//     const contract = blockchain.openContract(
//         await FossFi.createFromAddress(owner.address),
//     );
//     const deployResult = await contract.sendDeploy(owner.getSender(), toNano(0.5));
//     return { blockchain, owner, contract, deployResult };
// };

// it('should deploy correctly', async () => {
//     const { contract, deployResult } = await setup();

//     const txToInspect = findTransaction(
//         deployResult.transactions,
//         {
//             to: contract.address,
//             deploy: true,
//         },
//     );
//     if (txToInspect === undefined) {
//         throw new Error('Requested tx was not found.');
//     }
//     // User-friendly output
//     console.log(flattenTransaction(txToInspect));
//     // Verbose output
//     console.log(txToInspect);
// });

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, beginCell, toNano } from '@ton/core';
import { FossFi, FossFiConfig } from '../wrappers/fi/FossFi';
import { FossFiWallet, FossFiWalletConfig, JettonTransfer } from '../wrappers/fi/FossFiWallet'
import '@ton/test-utils';
import path from 'path';
import fs from 'fs';
import { envContent } from '../utils/jetton-helpers';

describe('Upgrade Message Debug', () => {
    const fiCodefile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../build/', 'FossFi.compiled.json'), 'utf8'));
    const fiWalletCodefile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../build/', 'FossFiWallet.compiled.json'), 'utf8'));
    // const keys = Object.keys(fiCodefile);
    // const thirdValue = fiCodefile[keys[2]];        // dynamic third property
    // const codeHex: string = String(thirdValue);  // or: const codeHex = codefile.hex;
    const fiCodeHex: string = fiCodefile.hex;
    const fiWalletCodeHex: string = fiWalletCodefile.hex;

    // compiled code cells
    const fiCode = Cell.fromHex(fiCodeHex);
    const fiWalletCode = Cell.fromHex(fiWalletCodeHex);

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let fi: SandboxContract<FossFi>;
    let fiJetton: SandboxContract<FossFiWallet>;

    const newCode = beginCell().storeStringTail('new code').endCell();


    beforeEach(async () => {
        blockchain = await Blockchain.create();
        // Enable full VM logs to see exact instruction that fails
        blockchain.verbosity = {
            ...blockchain.verbosity,
            vmLogs: 'vm_logs_full',
        };

        deployer = await blockchain.treasury('deployer');
        // ... deploy minter and jettonWallet
        fi = blockchain.openContract(FossFi.createFromConfig({
            admin_address: deployer.address,
            base_fi_wallet_code: fiWalletCode,
            metadata_uri: envContent
        }, fiCode));

        const result = await fi.sendDeploy(deployer.getSender(), toNano('0.5'));
        fiJetton = blockchain.openContract(FossFiWallet.createFromAddress(await fi.getWalletAddress(deployer.address)));
    });

    it('should debug upgrade message format', async () => {
        // 1. Build the EXACT message body you're sending
        const upgradeBody = beginCell()
            .storeUint(0x00000038, 32)  // Make sure opcode is 32-bit!
            .storeUint(0, 64)           // query_id
            // ... your other fields
            .endCell();

        // 2. Print the raw message body
        console.log('=== MESSAGE BODY DEBUG ===');
        // console.log('Body bits:', upgradeBody.bits.length);
        // console.log('Body refs:', upgradeBody.refs.length);
        // console.log('Body hex:', upgradeBody.toBoc().toString('hex'));

        // 3. Test parsing on BOTH contracts manually
        console.log('\n=== MINTER PARSING TEST ===');
        const minterSlice = upgradeBody.beginParse();
        const op1 = minterSlice.loadUint(32);
        console.log('Opcode:', '0x' + op1.toString(16));
        // Load remaining fields as minter expects...

        console.log('\n=== WALLET PARSING TEST ===');
        const walletSlice = upgradeBody.beginParse();
        const op2 = walletSlice.loadUint(32);
        console.log('Opcode:', '0x' + op2.toString(16));
        // Load remaining fields as wallet expects...
        // THIS IS WHERE YOU'LL SEE THE MISMATCH

        // 4. Send to minter (should work)
        const minterResult = await fi.sendUpgrade(
            deployer.getSender(),
            true, deployer.address, newCode, null,
            toNano('0.1')
        );
        console.log('\n=== MINTER TX RESULT ===');
        for (const tx of minterResult.transactions) {
            console.log('Exit code:', tx.description);
        }

        // 5. Check what message minter forwards to wallet
        const outMsg = minterResult.transactions[1]?.outMessages?.get(0);
        if (outMsg) {
            console.log('\n=== FORWARDED MESSAGE ===');
            // console.log('Body:', outMsg.body.toBoc().toString('hex'));

            // Parse the forwarded body
            const fwdSlice = outMsg.body.beginParse();
            console.log('Forwarded opcode:', '0x' + fwdSlice.loadUint(32).toString(16));
        }
    });
});