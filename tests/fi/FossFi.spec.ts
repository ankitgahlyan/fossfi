import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { FossFi, FossFiConfig } from '../../wrappers/fi/FossFi';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { envContent } from '../../utils/jetton-helpers';

describe('FossFi', () => {
    let fiCode: Cell;
    let fiWalletCode: Cell;

    beforeAll(async () => {
        fiCode = await compile('FossFi');
        fiWalletCode = await compile('FossFiWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let fossFi: SandboxContract<FossFi>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        let fossFiConfig: FossFiConfig = {
            admin_address: deployer.address,
            base_fi_wallet_code: fiWalletCode,
            metadata_uri: envContent
        }
        fossFi = blockchain.openContract(FossFi.createFromConfig(fossFiConfig, fiCode));

        const deployResult = await fossFi.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: fossFi.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and fossFi are ready to use
    });
});
