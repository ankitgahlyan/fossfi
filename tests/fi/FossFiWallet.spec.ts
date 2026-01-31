import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { FossFiWallet } from '../../wrappers/fi/FossFiWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('FossFiWallet', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('FossFiWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let fossFiWallet: SandboxContract<FossFiWallet>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        fossFiWallet = blockchain.openContract(FossFiWallet.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await fossFiWallet.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: fossFiWallet.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and fossFiWallet are ready to use
    });
});
