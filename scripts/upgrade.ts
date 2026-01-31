//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

// import { Address, toNano, fromNano } from "@ton/core"
import {Address, TonClient, WalletContractV4, toNano, fromNano, Cell, beginCell} from "@ton/ton"
import {getHttpEndpoint} from "@orbs-network/ton-access"
import {mnemonicToPrivateKey} from "@ton/crypto"
// import {storeMint} from "../output/Jetton_JettonMinter"
import {FossFi, Upgrade} from "../wrappers/fi/FossFi"

import {printSeparator} from "../utils/print"
import "dotenv/config"
import {getJettonHttpLink, getNetworkFromEnv} from "../utils/utils"
import {buildJettonMinterFromEnv, buildJettonWalletFromEnv} from "../utils/jetton-helpers"

// import {createInterface} from "readline/promises"
// import { client, deployerWalletContract, network, secretKey } from "./shard.deploy"
import { FI_ADDRESS } from "./consts"
import { compile } from "@ton/blueprint"
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

    // const minterAddress = await readContractAddress()
    const minterAddress = Address.parse(FI_ADDRESS)
    const jettonMinter = client.open(FossFi.createFromAddress(minterAddress))
    const jettonMinterNew = await buildJettonMinterFromEnv(deployerWalletContract.address)
    const jettonWalletNew = await buildJettonWalletFromEnv(deployerWalletContract.address, minterAddress)
    const deployAmount = toNano("0.2")

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
    
    const msg: Upgrade = {
        $$type: "Upgrade",
        queryId: upgradeMinter ? 0n : upgradeWallet ? 1n : 2n, // 0 for minter, 1 for wallet
        sender: deployerWallet.address, // used in internal checks
        walletVersion: null, // used in internal upgrades
        newData: null,
        newCode: code,
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
    await jettonMinter.sendUpgrade(
        
        deployerWalletContract.sender(secretKey),
        code,
        beginCell().endCell(),
        deployAmount,
        upgradeWallet ? 1n : 0n,
        deployerWallet.address,
    )
    // await jettonMinter.send(
    //     deployerWalletContract.sender(secretKey),
    //     {value: deployAmount, bounce: true},
    //     msg,
    // )
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
