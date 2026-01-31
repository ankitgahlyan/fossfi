//  SPDX-License-Identifier: MIT
//  Copyright © 2023 @howardpen9 @0kenx
//  Based on https://github.com/howardpen9/jetton-implementation-in-tact/blob/d996d51c59e672aa9eabb028869e0e4d6135a8cb/sources/utils/jetton-helpers.ts
//  Modified by TON Studio

import { Sha256 } from "@aws-crypto/sha256-js"
import { Dictionary, DictionaryValue, beginCell, Cell, Address, contractAddress } from "@ton/core"
import { TonClient } from "@ton/ton"
import chalk from "chalk"
import { FossFi } from "../wrappers/fi/FossFi";
import { FossFiWallet } from "../wrappers/fi/FossFiWallet";
import { sha256_sync } from "@ton/crypto";

const ONCHAIN_CONTENT_PREFIX = 0x00
const SNAKE_PREFIX = 0x00
const CELL_MAX_SIZE_BYTES = Math.floor((1023 - 8) / 8)

const sha256 = (str: string) => {
    const sha = new Sha256()
    sha.update(str)
    return Buffer.from(sha.digestSync())
}

const toKey = (key: string) => {
    return BigInt(`0x${sha256(key).toString("hex")}`)
}

function OnChainString(): DictionaryValue<string> {
    return {
        serialize(src, builder) {
            builder.storeRef(beginCell().storeUint(0, 8).storeStringTail(src));
        },
        parse(src) {
            const sc  = src.loadRef().beginParse();
            const tag = sc.loadUint(8);
            if(tag == 0) {
                return sc.loadStringTail();
            } else if(tag == 1) {
                // Not really tested, but feels like it should work
                const chunkDict = Dictionary.loadDirect(Dictionary.Keys.Uint(32), Dictionary.Values.Cell(), sc);
                return chunkDict.values().map(x => x.beginParse().loadStringTail()).join('');

            } else {
                throw Error(`Prefix ${tag} is not supported yet!`);
            }
        }
    }
}

export function nftContentToCell(content: {
    name: string
    description: string
    symbol: string
    image: string
}) {
    // if(content.type == 'offchain') {
    //     return beginCell()
    //         .storeUint(1, 8)
    //         .storeStringRefTail(content.uri) //Snake logic under the hood
    //         .endCell();
    // }
    let keySet = new Set(['uri' , 'name' , 'description' , 'image' , 'image_data' , 'symbol' , 'decimals' , 'amount_style' , 'render_type' , 'currency' , 'game']);
    let contentDict = Dictionary.empty(Dictionary.Keys.Buffer(32), OnChainString());

    // for (let contentKey in content.data) {
    //     if(keySet.has(contentKey)) {
    //         contentDict.set(
    //             sha256_sync(contentKey),
    //             content.data[contentKey as OnChainContentData]!
    //         );
    //     }
    // }

    // Store the on-chain metadata in the dictionary
    Object.entries(content).forEach(([key, value]) => {
        contentDict.set(sha256_sync(key), value)
    })
    return beginCell().storeUint(0, 8).storeDict(contentDict).endCell();
}

export function buildOnchainMetadata(data: {
    name: string
    description: string
    symbol: string
    image: string
}): Cell {
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())

    // Store the on-chain metadata in the dictionary
    Object.entries(data).forEach(([key, value]) => {
        dict.set(toKey(key), makeSnakeCell(Buffer.from(value, "utf8")))
    })

    return beginCell().storeInt(ONCHAIN_CONTENT_PREFIX, 8).storeDict(dict).endCell()
}

export function makeSnakeCell(data: Buffer) {
    // Create a cell that package the data
    const chunks = bufferToChunks(data, CELL_MAX_SIZE_BYTES)

    const b = chunks.reduceRight((curCell, chunk, index) => {
        if (index === 0) {
            curCell.storeInt(SNAKE_PREFIX, 8)
        }
        curCell.storeBuffer(chunk)
        if (index > 0) {
            const cell = curCell.endCell()
            return beginCell().storeRef(cell)
        } else {
            return curCell
        }
    }, beginCell())
    return b.endCell()
}

function bufferToChunks(buff: Buffer, chunkSize: number) {
    const chunks: Buffer[] = []
    while (buff.byteLength > 0) {
        chunks.push(buff.slice(0, chunkSize))
        buff = buff.slice(chunkSize)
    }
    return chunks
}

export type Metadata = {
    name: string
    symbol: string
    description: string
    image: string
}

export type JettonParams = {
    address: Address
    metadata: Metadata
    totalSupply: bigint
    owner: Address
    jettonWalletCode: Cell
}

async function parseMetadataFromCell(metadataCell: Cell) {
    const cs = metadataCell.beginParse()
    const prefix = cs.loadInt(8)
    if (prefix !== ONCHAIN_CONTENT_PREFIX) {
        throw new Error("Invalid metadata prefix")
    }
    const dict = cs.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
    // In each key we need to skip 8 bits - size of snake prefix.
    const name = dict.get(toKey("name"))?.beginParse().skip(8).loadStringTail()
    const description = dict.get(toKey("description"))?.beginParse().skip(8).loadStringTail()
    const image = dict.get(toKey("image"))?.beginParse().skip(8).loadStringTail()
    return { name, description, image }
}

export const displayContentCell = async (content: Cell) => {
    try {
        const result = await parseMetadataFromCell(content)
        console.log(`Token name: ${result.name}`)
        console.log(`Description: ${result.description}`)
        console.log(`Image: ${chalk.underline(result.image)}`)
    } catch (_e) {
        console.error("Failed to parse metadata from cell")
    }
}

export async function validateJettonParams(
    expectedJettonParams: JettonParams,
    jettonAddress: Address,
    client: TonClient,
) {
    const { metadata, totalSupply, owner, jettonWalletCode } = expectedJettonParams
    const jettonContract = client.open(new FossFi(jettonAddress)) // TODO: validate all params
    const jettonData = await jettonContract.getJettonData()
    expect(jettonData.totalSupply).toBe(totalSupply)
    expect(jettonData.adminAddress?.toRaw().toString("hex")).toBe(owner.toRaw().toString("hex"))
    expect(jettonData.walletCode.toBoc().toString("hex")).toBe(
        jettonWalletCode.toBoc().toString("hex"),
    )

    const realMetadata = await parseMetadataFromCell(jettonData.content)
    expect(realMetadata.name).toBe(metadata.name)
    expect(realMetadata.description).toBe(metadata.description)
    expect(realMetadata.image).toBe(metadata.image)
}

const jettonParams = {
    name: process.env.JETTON_NAME ?? "FossFi",
    description:
        process.env.JETTON_DESCRIPTION ?? "This is description of Jetton, written in Tact-lang",
    symbol: process.env.JETTON_SYMBOL ?? "MINT",
    image:
        process.env.JETTON_IMAGE ??
        "https://raw.githubusercontent.com/tact-lang/tact/refs/heads/main/docs/public/logomark-light.svg",
}
// Create content Cell
export const envContent = buildOnchainMetadata(jettonParams)
export const content = nftContentToCell(jettonParams)

export async function buildJettonMinterFromEnv(deployerAddress: Address) {

    return await FossFi.fromInit(deployerAddress, content)
}
export async function buildFossFiWalletFromAddress(deployerAddress: Address) {
    return await FossFiWallet.createFromAddress(deployerAddress)
}

export async function buildJettonWalletFromEnv(deployerAddress: Address, minterAddress: Address) {// FIXME: for upgrades only
    // return await FossFiWallet.fromInit(deployerAddress, minterAddress, 0n)
}
