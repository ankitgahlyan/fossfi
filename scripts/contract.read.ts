//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

import "dotenv/config"
import { getHttpEndpoint } from "@orbs-network/ton-access"
import { Address } from "@ton/core"
import { createInterface } from "readline/promises"
import { TonClient } from "@ton/ton"
// import {JettonMinter} from "../output/Jetton_JettonMinter"//base
// import {JettonMinterSharded} from "../output/Shard_JettonMinterSharded" // shard
import { JettonWalletSharded } from "../output/Shard_JettonWalletSharded"
// import chalk from "chalk"
import { getNetworkFromEnv } from "../utils/utils"
// import { displayContentCell } from "../utils/jetton-helpers"

const readContractAddress = async () => {
    const readline = createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    while (true) {
        try {
            const walletAddress = await readline.question("Enter wallet address: ")
            const address = Address.parse(walletAddress)
            readline.close()
            return address
        } catch (_e) {
            console.error("Invalid address, please try again.")
        }
    }
}

const main = async () => {
    const network = getNetworkFromEnv()

    const endpoint = await getHttpEndpoint({ network })
    const client = new TonClient({
        endpoint: endpoint,
    })

    // const minterAddress = await readContractAddress()
    const walletAddress = await readContractAddress()
    // const minter = client.open(JettonMinterSharded.fromAddress(minterAddress))
    const wallet = client.open(JettonWalletSharded.fromAddress(walletAddress))

    // const minterData = await minter.getGetJettonData()
    const walletAllData = await wallet.getState();
    // const maps = await wallet.getGetFriendsAndFollowings()
   
    console.log("\nWallet data")
    // console.log(`totalSupply: ${chalk.underline(minterData.totalSupply)}`)
    // console.log(`friends: ${chalk.yellowBright(parseMap(walletAllData.friends))}`)

if (walletAllData.friends.size == 0) {
    console.log('zero entries');
} else {
    walletAllData.friends.values()
    // walletAllData.friends.keys().forEach()
    // for (const key in walletAllData.friends) {
    //     if (!Object.hasOwn(walletAllData.friends, key)) continue;

    //     const element = walletAllData.friends[key];
    //     console.log(`user: $key, val: ${element}`)
    // }
}
    // console.log(`followings: ${chalk.underline(walletData.followings)}`)
    // console.log(`invited: ${chalk.underline(walletData.invited)}`)
    // console.log(`debts: ${chalk.underline(walletData.debts)}`)
    // console.log(`pendingRequests: ${chalk.underline(walletData.pendingRequests)}`)
    // console.log(`reports: ${chalk.underline(walletData.reports)}`)
    // console.log(
    //     `Is mintable: ${walletData.mintable ? chalk.greenBright("Yes") : chalk.redBright("No")}`,
    // )
    // await displayContentCell(minterData.jettonContent)
     console.log(walletAllData)
}

void main()
