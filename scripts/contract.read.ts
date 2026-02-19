//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

import "dotenv/config"
import { getHttpEndpoint } from "@orbs-network/ton-access"
import { Address } from "@ton/core"
import { createInterface } from "readline/promises"
import { TonClient } from "@ton/ton"
import { FossFi } from "../wrappers/fi/FossFi"
import chalk from "chalk"
import { getNetworkFromEnv } from "../utils/utils"
import { displayContentCell } from "../utils/jetton-helpers"
import { FI_ADDRESS } from "./consts"

// const readContractAddress = async () => {
//     const readline = createInterface({
//         input: process.stdin,
//         output: process.stdout,
//     })

//     while (true) {
//         try {
//             const walletAddress = await readline.question("Enter wallet address: ")
//             const address = Address.parse(walletAddress)
//             readline.close()
//             return address
//         } catch (_e) {
//             console.error("Invalid address, please try again.")
//         }
//     }
// }

const main = async () => {
    // const network = getNetworkFromEnv()

    // const endpoint = await getHttpEndpoint({ network: 'testnet' })
    const client = new TonClient({
        // endpoint: endpoint,
        endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
    })

    // const minterAddress = await readContractAddress()
    const minter = client.open(FossFi.createFromAddress(Address.parse(FI_ADDRESS)))
    const minterData = await minter.getjettonDataAll();
   
    console.log("\nMinter data")
    console.log(`totalSupply: ${chalk.underline(minterData.totalSupply)} tokens`)
    console.log(`walletVersion: ${chalk.yellowBright(minterData.walletVersion)}`)
    console.log(`adminAddress: ${chalk.underline(minterData.adminAddress)}`)
    console.log(`codeEqual: ${chalk.underline(minterData.baseFiWalletCode.equals(minterData.latestFiWalletCode) ? chalk.greenBright("Yes") : chalk.redBright("No"))}`)
    // console.log(
    //     `Is mintable: ${walletData.mintable ? chalk.greenBright("Yes") : chalk.redBright("No")}`,
    // )
    await displayContentCell(minterData.content)
    //  console.log(walletAllData)
}

void main()
