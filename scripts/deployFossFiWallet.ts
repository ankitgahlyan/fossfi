import { toNano } from '@ton/core';
import { FossFiWallet } from '../wrappers/fi/FossFiWallet';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const fossFiWallet = provider.open(FossFiWallet.createFromConfig({}, await compile('FossFiWallet')));

    await fossFiWallet.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(fossFiWallet.address);

    // run methods on `fossFiWallet`
}
