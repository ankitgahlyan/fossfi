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
    let fossFi: SandboxContract<FossFi>;
    let fiWallet: SandboxContract<FossFiWallet>;

    const newCode = beginCell().storeStringTail('new code').endCell();
    const newData = beginCell().storeStringTail('new data').endCell();

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        // blockchain = await Blockchain.create({webUI: true});
        // blockchain.verbosity.vmLogs = "vm_logs";
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
        let fossFiConfig: FossFiConfig = {
            admin_address: deployer.address,
            base_fi_wallet_code: fiWalletCode,
            metadata_uri: envContent
        }

        // let fiWalletConfig: FossFiWalletConfig = {
        //     balance: 0n,
        //     votes: 10,
        //     id: new Cell,
        //     addresses: beginCell().endCell(),
        //     maps: beginCell().endCell(),
        //     base_fi_wallet_code: fiWalletCode
        // }
        // const fossFiWallet = blockchain.openContract(FossFiWallet.createFromConfig(fiWalletConfig, fiWalletCode));

        fossFi = blockchain.openContract(FossFi.createFromConfig(fossFiConfig, fiCode));

        const result = await fossFi.sendDeploy(deployer.getSender(), toNano('0.5'));
        fiWallet = blockchain.openContract(FossFiWallet.createFromAddress(await fossFi.getWalletAddress(deployer.address)));

        // expect(fossFiWallet.address).toEqualAddress(fiWallet.address);
        // const deployResultWallet = await fossFiWallet.sendDeploy(deployer.getSender(), toNano('0.05'));

        // for (const tx of result.transactions) {
        //     console.log(flattenTransaction(tx));
        // }

        // expect(result.transactions).toHaveTransaction({
        //     from: deployer.address,
        //     to: fossFi.address,
        //     deploy: true,
        //     success: true,
        // });

        // const txToInspect = findTransaction(
        //     result.transactions,
        //     {
        //         to: fossFi.address,
        //         deploy: true,
        //     },
        // );
        // if (txToInspect === undefined) {
        //     throw new Error('Requested tx was not found.');
        // }
        // User-friendly output
        // console.log(flattenTransaction(txToInspect));

        // expect(deployResult.transactions).toHaveTransaction({
        //     from: fossFi.address,
        //     to: fossFiWallet.address,
        //     deploy: true,
        //     success: true,
        // });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and fossFi and fossFiWallet are ready to use
        // const jettonDataAll = await fossFi.getjettonDataAll();
        // expect(jettonDataAll.baseFiWalletCode).toEqualCell(jettonDataAll.latestFiWalletCode);

        const upgradeResult = await fossFi.sendUpgrade(deployer.getSender(), true, deployer.address, newCode, null, toNano(1));

        const newAccountState = (await blockchain.getContract(fossFi.address)).accountState;
        if (newAccountState?.type !== 'active') {
            throw new Error('Fi contract is not active');
        }

        const fiWalletState = (await blockchain.getContract(fiWallet.address)).accountState;
        if (fiWalletState?.type !== 'active') {
            throw new Error('FiWallet contract is not active');
        }

        // const jettonDataAll2 = await fossFi.getjettonDataAll();
        // expect(jettonDataAll2.latestFiWalletCode).toEqualCell(newCode);

        // expect(jettonData.adminAddress).toEqualAddress(deployer.address)
        // expect(jettonData.content).toEqualCell(envContent)
        // expect(jettonData.walletCode).toEqualCell(newCode);

        // Fi upgrades
        // const updatedData = newAccountState?.state.data!;
        // const updatedCode = newAccountState?.state.code!;
        // expect(updatedCode).toEqualCell(newCode);

        // send upgradeRequest msg from jettonWallet

        const upgradeRequestResult = await fiWallet.send(
            deployer.getSender(),
            {
                value: toNano(0.5)
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

        // await sleep(5000);

        const updatedCode = fiWalletState?.state.code!;
        // expect(updatedCode).toEqualCell(newCode);

        // const fiWalletData = await fiWallet.getGetWalletData();
        // expect(fiWalletData?.code).toEqualCell(fiWalletCode);
        // expect(fiWalletData.owner).toEqualAddress(deployer.address)
        // expect(fiWalletData.balance).toBe(toNano(1))

    }, 50000);
});
