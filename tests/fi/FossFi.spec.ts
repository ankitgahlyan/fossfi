import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { FossFi, FossFiConfig } from '../../wrappers/fi/FossFi';
import { FossFiWallet, FossFiWalletConfig } from '../../wrappers/fi/FossFiWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { envContent } from '../../utils/jetton-helpers';

describe('FossFi', () => {
    let fiCode: Cell;
    let fiWalletCode: Cell;

    beforeAll(async () => {
        fiCode = await compile('FossFi');
        fiWalletCode = await compile('FossFiWallet');
    }, 20000);

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let fossFi: SandboxContract<FossFi>;
    let fossFiWallet: SandboxContract<FossFiWallet>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        let fossFiConfig: FossFiConfig = {
            admin_address: deployer.address,
            base_fi_wallet_code: fiWalletCode,
            metadata_uri: envContent
        }

        let fiWalletConfig: FossFiWalletConfig = {
            balance: 0n,
            votes: 10,
            id: new Cell,
            addresses: beginCell().endCell(),
            maps: beginCell().endCell(),
            base_fi_wallet_code: fiWalletCode
        }

        fossFi = blockchain.openContract(FossFi.createFromConfig(fossFiConfig, fiCode));
        fossFiWallet = blockchain.openContract(FossFiWallet.createFromConfig(fiWalletConfig, fiWalletCode));

        const deployResult = await fossFi.sendDeploy(deployer.getSender(), toNano('0.05'));
        // const deployResultWallet = await fossFiWallet.sendDeploy(deployer.getSender(), toNano('0.05'));


        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: fossFi.address,
            deploy: true,
            success: true,
        });

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
    });
});
