import { toNano, beginCell, Address, SendMode, fromNano, Cell } from '@ton/core';
import { buildJettonMinterFromEnv, content, envContent } from '../utils/jetton-helpers';
import { FossFiConfig, MintNewJettons, storeMint, storeUpgrade, Upgrade } from '../wrappers/fi/FossFi';
import { getJettonHttpLink, getNetworkFromEnv } from '../utils/utils';
import { printSeparator } from '../utils/print';
import "dotenv/config";

import { FossFi } from '../wrappers/fi/FossFi';
import { compile, NetworkProvider } from '@ton/blueprint';
import { FI_ADDRESS } from './consts';

export async function run(provider: NetworkProvider) {
    const deployer = process.env.DEPLOYER;
    if (deployer === undefined) {
        console.error("deployer address is not provided, please add it to .env file")
        throw new Error("deployer address is not provided")
    }
    const deployerAddress = Address.parse(deployer);
    const deployAmount = toNano("1");
    // const fossFi = provider.open(await buildJettonMinterFromEnv(deployerAddress));

    // ====================================================================================
    // const walletCode = await compile('FossFiWallet')

    // const fossFiConfig: FossFiConfig = {
    //     admin_address: deployerAddress,
    //     base_fi_wallet_code: walletCode,
    //     metadata_uri: envContent // content
    // };

    const fossFi = provider.open(FossFi.createFromAddress(Address.parse(FI_ADDRESS)));

    // Ask user which contract(s) to upgrade
    const { createInterface } = await import("readline/promises")
    const rl = createInterface({ input: process.stdin, output: process.stdout })

    let choice: string
    while (true) {
        choice = (await rl.question("Which contract to upgrade? (minter / wallet / m / w ): ")).trim().toLowerCase()
        if (["minter", "wallet", "m", "w"].includes(choice)) break
        console.log("Invalid choice. Please type m/w/minter/wallet")
    }
    await rl.close()

    const upgradeMinter = choice === "m" || choice === "minter"
    const upgradeWallet = choice === "w" || choice === "wallet"

    // const code: Cell = upgradeMinter ? jettonMinterNew!.init!.code : await compile('FossFiWallet')
    const code: Cell = upgradeMinter ? await compile('FossFi') : await compile('FossFiWallet')

    console.log("Upgrade selection:", upgradeMinter ? "minter" : "", upgradeWallet ? "wallet" : "")

    const upgrade: Upgrade = {
        $$type: "Upgrade",
        walletUpgrade: upgradeMinter ? false : true,
        sender: deployerAddress,
        newData: null,
        newCode: code,
    };

    await provider.sender().send(
        {
            value: deployAmount,
            to: fossFi.address,
            sendMode: SendMode.PAY_GAS_SEPARATELY, // + SendMode.IGNORE_ERRORS,
            body: beginCell()
                .store(
                    storeUpgrade(upgrade),
                )
                .endCell(),
        }
    )

    // await fossFi.send(
    //     provider.sender(),
    //     {
    //         value: deployAmount,
    //         bounce: true,
    //     },
    //     mint,
    // );

    const network = getNetworkFromEnv()
    console.log(`Running deploy script for ${network} network and for Shard Jetton Minter`)
    console.log(
        "Make sure to send txn from following wallet:. \n" +
        deployerAddress.toString({ testOnly: true })
    )
    printSeparator()
    // console.log("Minting:: ", fromNano(supply))
    // printSeparator()

    const link = getJettonHttpLink(network, fossFi.address, "tonviewer")
    console.log(`You can soon check your deployed contract at ${link}`)

    console.log(`Jetton ${upgradeMinter ? "minter" : "wallet"} upgraded successfully!`);
}
