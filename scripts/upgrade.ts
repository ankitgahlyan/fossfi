//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

// import { Address, toNano, fromNano } from "@ton/core"
import {Address, TonClient, WalletContractV4, toNano, fromNano, Cell} from "@ton/ton"
import {getHttpEndpoint} from "@orbs-network/ton-access"
import {mnemonicToPrivateKey} from "@ton/crypto"
// import {storeMint} from "../output/Jetton_JettonMinter"
import {JettonMinterSharded, Upgrade} from "../output/Shard_JettonMinterSharded"

import {printSeparator} from "../utils/print"
import "dotenv/config"
import {getJettonHttpLink, getNetworkFromEnv} from "../utils/utils"
import {buildJettonMinterFromEnv, buildJettonWalletFromEnv} from "../utils/jetton-helpers"

// import {createInterface} from "readline/promises"
// import { client, deployerWalletContract, network, secretKey } from "./shard.deploy"
import { SHARD_JETTON_MINTER_ADDRESS } from "./consts"
// import chalk from "chalk"

const main = async () => {
    const mnemonics = process.env.MNEMONICS
        if (mnemonics === undefined) {
            console.error("Mnemonics is not provided, please add it to .env file")
            throw new Error("Mnemonics is not provided")
        }
        if (mnemonics.split(" ").length !== 24) {
            console.error("Invalid mnemonics, it should be 24 words")
            throw new Error("Invalid mnemonics, it should be 24 words")
        }
    
        const network = getNetworkFromEnv()
    
        const endpoint = await getHttpEndpoint({network})
        const client = new TonClient({
            endpoint: endpoint,
        })
        const keyPair = await mnemonicToPrivateKey(mnemonics.split(" "))
        const secretKey = keyPair.secretKey
        const workchain = 0 // we are working in basechain.
        const deployerWallet = WalletContractV4.create({
            workchain: workchain,
            publicKey: keyPair.publicKey,
        })
    
        const deployerWalletContract = client.open(deployerWallet)
    
    // const readContractAddress = async () => {
    //     const readline = createInterface({
    //         input: process.stdin,
    //         output: process.stdout,
    //     })

    //     while (true) {
    //         try {
    //             const walletAddress = await readline.question("Enter minter address: ")
    //             const address = Address.parse(walletAddress)
    //             readline.close()
    //             return address
    //         } catch (_e) {
    //             console.error("Invalid minter address, please try again.")
    //         }
    //     }
    // }

    const minterAddress = Address.parse(SHARD_JETTON_MINTER_ADDRESS)
    // const minterAddress = await readContractAddress()
    const jettonMinter = client.open(JettonMinterSharded.fromAddress(minterAddress))
    const jettonMinterNew = await buildJettonMinterFromEnv(deployerWalletContract.address)
    const jettonWalletNew = await buildJettonWalletFromEnv(deployerWalletContract.address, minterAddress)
    // const wallet = client.open(JettonWalletSharded.fromAddress(walletAddress))
    const deployAmount = toNano("0.2")

    // Ask user which contract(s) to upgrade
    const { createInterface } = await import("readline/promises")
    const rl = createInterface({ input: process.stdin, output: process.stdout })

    let choice: string
    while (true) {
        choice = (await rl.question("Which contract to upgrade? (minter / wallet / both / m / w / b): ")).trim().toLowerCase()
        if (["minter", "wallet", "both", "m", "w", "b"].includes(choice)) break
        console.log("Invalid choice. Please type 'm', 'w', 'b', 'minter', 'wallet' or 'both'.")
    }
    await rl.close()

    const upgradeMinter = choice === "m" || choice === "b" || choice === "minter" || choice === "both"
    const upgradeWallet = choice === "w" || choice === "b" || choice === "wallet" || choice === "both"

    const minterCode: Cell | null = upgradeMinter ? jettonMinterNew!.init!.code : null
    const walletCode: Cell | null = upgradeWallet ? jettonWalletNew!.init!.code : null

    console.log("Upgrade selection:", upgradeMinter ? "minter" : "", upgradeWallet ? "wallet" : "")
    
    const msg: Upgrade = {
        $$type: "Upgrade",
        queryId: 0n,
        newData: null,
        newCode: minterCode,
        newWalletCode: walletCode,
    }

    const seqno: number = await deployerWalletContract.getSeqno()
    console.log(`Running UPGRADE script for ${network} network and for Minter`)
    console.log(
        "🛠️Preparing new outgoing massage from deployment wallet. \n" +
            deployerWalletContract.address,
    )
    console.log("Seqno: ", seqno + "\n")
    printSeparator()

    // Get deployment wallet balance
    const balance: bigint = await deployerWalletContract.getBalance()

    console.log("Current deployment wallet balance = ", fromNano(balance).toString(), "💎TON")
    if (balance < deployAmount) {
        console.error("Not enough balance to deploy the contract")
        throw new Error("Not enough balance to deploy the contract")
    }

    printSeparator()
    // ============================
    await jettonMinter.send(
        deployerWalletContract.sender(secretKey),
        {value: deployAmount, bounce: true},
        msg,
    )
    // await deployerWalletContract.sendTransfer({
    //     seqno,
    //     secretKey,
    //     messages: [
    //         internal({
    //             to: jettonMinter!!.address,
    //             value: deployAmount,
    //             init: {
    //                 code: jettonMinter!!.init?.code,// change this to old
    //                 data: jettonMinter!!.init?.data,
    //             },
    //             body: msg,
    //         }),
    //     ],
    // })
    console.log("====== UPGRADE message sent to =======\n", jettonMinter!.address)
    const link = getJettonHttpLink(network, jettonMinter!.address, "tonviewer")
    console.log(`You can soon check your upgraded contract at ${link}`)
}

void main()
