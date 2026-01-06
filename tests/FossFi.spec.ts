import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { FossFi } from '../wrappers/FossFi';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('FossFi', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('FossFi');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let fossFi: SandboxContract<FossFi>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        fossFi = blockchain.openContract(FossFi.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

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
