import { Address, beginCell, SendMode, toNano } from '@ton/core';
import { FossFi } from "../wrappers/FossFi";
import { FossFiWallet } from '../wrappers/FossFiWallet';
import { compile, NetworkProvider } from '@ton/blueprint';
import { FI_ADDRESS } from './consts';
import { content } from '../utils/jetton-helpers';
import { Op } from '../wrappers/constants';

export async function run(provider: NetworkProvider) {
    const deployedFi = Address.parse(FI_ADDRESS)
    const fi = provider.open(FossFi.createFromAddress(deployedFi));

    // await fi.sendDeploy(provider.sender(), toNano('0.05'));
    // await provider.waitForDeploy(fi.address);

    // run methods on `fossFiWallet`
    // await fi.sendChangeContent(provider.sender(), content)

    // await provider.sender().send({ // todo: sent but not changed fixContent
    //     to: deployedFi,
    //     value: toNano('0.5'),
    //     // bounce: true, // ignored by sender apis
    //     // sendMode: SendMode.NONE,
    //     body: beginCell()
    //         .storeUint(Op.change_metadata_url, 32) // opcode - check your minter's implementation
    //         .storeUint(0, 64)
    //         .storeRef(content)
    //         .endCell(),
    // })
    
}
