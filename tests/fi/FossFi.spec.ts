// import { Blockchain, SandboxContract, TreasuryContract } from 'ton-sandbox-dev';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { FossFi, FossFiConfig } from '../../wrappers/fi/FossFi';
import { FossFiWallet, FossFiWalletConfig, JettonTransfer } from '../../wrappers/fi/FossFiWallet';
import '@ton/test-utils';
import { compile, sleep } from '@ton/blueprint';
import { envContent } from '../../utils/jetton-helpers';
import { findTransaction, flattenTransaction } from '@ton/test-utils';
import fs from 'fs';
import path from 'path';

describe('FossFi', () => {
    const fiCodefile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../build/', 'FossFi.compiled.json'), 'utf8'));
    const fiWalletCodefile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../build/', 'FossFiWallet.compiled.json'), 'utf8'));
    // const keys = Object.keys(fiCodefile);
    // const thirdValue = fiCodefile[keys[2]];        // dynamic third property
    // const codeHex: string = String(thirdValue);  // or: const codeHex = codefile.hex;
    const fiCodeHex: string = fiCodefile.hex;
    const fiWalletCodeHex: string = fiWalletCodefile.hex;

    // compiled code cells
    const fiCode = Cell.fromHex(fiCodeHex);
    const fiWalletCode = Cell.fromHex(fiWalletCodeHex);

    // beforeAll(async () => {
    //     fiCode = await compile('FossFi');
    //     fiWalletCode = await compile('FossFiWallet');
    // }, 20000);

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let fi: SandboxContract<FossFi>;
    let fiJetton: SandboxContract<FossFiWallet>;

    const newCode = beginCell().storeStringTail('new code').endCell();
    const newData = beginCell().storeStringTail('new data').endCell();

    beforeEach(async () => {
        // blockchain = await Blockchain.create({webUI: true});
        // blockchain.verbosity.vmLogs = "vm_logs";
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
        fi = blockchain.openContract(FossFi.createFromConfig({
            admin_address: deployer.address,
            base_fi_wallet_code: fiWalletCode,
            metadata_uri: envContent
        }, fiCode));

        // const fossFiWallet = blockchain.openContract(FossFiWallet.createFromConfig({
        //     balance: 0n,
        //     votes: 10,
        //     id: new Cell,
        //     addresses: beginCell().endCell(),
        //     maps: beginCell().endCell(),
        //     base_fi_wallet_code: fiWalletCode
        // }, fiWalletCode)); // todo: fixme: address doesn't match

        const result = await fi.sendDeploy(deployer.getSender(), toNano('0.5'));
        fiJetton = blockchain.openContract(FossFiWallet.createFromAddress(await fi.getWalletAddress(deployer.address)));

        // expect(fossFiWallet.address).toEqualAddress(fiJetton.address);
        // const deployResultWallet = await fossFiWallet.sendDeploy(deployer.getSender(), toNano('0.05'));

        // for (const tx of result.transactions) {
        //     console.log(flattenTransaction(tx));
        // }

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: fi.address,
            deploy: true,
            success: true,
        });

        expect(result.transactions).toHaveTransaction({
            from: fi.address,
            to: fiJetton.address,
            deploy: true,
            success: true,
        });

        // const txToInspect = findTransaction(
        //     result.transactions,
        //     {
        //         to: fi.address,
        //         deploy: true,
        //     },
        // );
        // if (txToInspect === undefined) {
        //     throw new Error('Requested tx was not found.');
        // }
        // User-friendly output
        // console.log(flattenTransaction(txToInspect));
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and fi and fiJetton are ready to use
        const jettonDataAll = await fi.getjettonDataAll();
        expect(jettonDataAll.baseFiWalletCode).toEqualCell(jettonDataAll.latestFiWalletCode);

        const upgradeResult = await fi.sendUpgrade(deployer.getSender(), true, deployer.address, newCode, null, toNano(1));

        const fiState = (await blockchain.getContract(fi.address)).accountState;
        if (fiState?.type !== 'active') {
            throw new Error('Fi contract is not active');
        }

        const fiJettonState = (await blockchain.getContract(fiJetton.address)).accountState;
        if (fiJettonState?.type !== 'active') {
            throw new Error('FiWallet contract is not active');
        }

        const jettonDataAll2 = await fi.getjettonDataAll();
        expect(jettonDataAll2.latestFiWalletCode).toEqualCell(newCode);
        expect(jettonDataAll2.adminAddress).toEqualAddress(deployer.address);
        expect(jettonDataAll2.content).toEqualCell(envContent);
        expect(jettonDataAll2.walletVersion).toBe(1n);

        // Fi upgrades
        // const updatedData = fiState?.state.data!;
        // const updatedCode = fiState?.state.code!;
        // expect(updatedCode).toEqualCell(newCode);

        // send upgradeRequest msg from jettonWallet

        const upgradeRequestResult = await fiJetton.send(
            deployer.getSender(),
            {
                value: toNano(1)
            },
            {
                $$type: 'JettonTransfer',
                queryId: 0n,
                amount: toNano(0.999),
                destination: user.address,
                responseDestination: null,
                customPayload: null,
                forwardTonAmount: toNano(0.01),
                forwardPayload: beginCell().asSlice(),
            } as JettonTransfer
        )

        // console.log(upgradeRequestResult);
        expect(upgradeRequestResult.transactions).toHaveTransaction({
            from: fi.address,
            on: fiJetton.address,
            // deploy: true,
            success: true,
        });

        // await sleep(5000);

        const fiJettonState2 = (await blockchain.getContract(fiJetton.address)).accountState;
        if (fiJettonState2?.type !== 'active') {
            throw new Error('FiJetton contract is not active');
        }
        const updatedCode = fiJettonState2?.state.code!;
        // expect(updatedCode).toEqualCell(newCode);

        // const fiWalletData = await fiJetton.getGetWalletData();
        // expect(fiWalletData?.code).toEqualCell(fiWalletCode);
        // expect(fiWalletData.owner).toEqualAddress(deployer.address)
        // expect(fiWalletData.balance).toBe(toNano(1))

    }, 50000);
});
