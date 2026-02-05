import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    ContractABI,
    contractAddress,
    ContractProvider,
    DictionaryValue,
    Sender,
    SendMode, Slice,
    toNano,
    TupleBuilder,
    TupleReader
} from '@ton/core';
import { Op } from '../constants';
import * as fs from 'node:fs';
import * as path from 'path';

export type FossFiContent = {
    uri: string
};

export type FossFiConfig = {
    admin_address: Address | null,
    base_fi_wallet_code: Cell,
    metadata_uri: Cell | FossFiContent
};
export type FossFiConfigFull = {
    supply: bigint,
    admin: Address | null,
    //Makes no sense to update transfer admin. ...Or is it?
    transfer_admin: Address | null,
    wallet_code: Cell,
    metadata_uri: Cell | FossFiContent
}

export function endParse(slice: Slice) {
    if (slice.remainingBits > 0 || slice.remainingRefs > 0) {
        throw new Error('remaining bits in data');
    }
}

export function fossFiConfigCellToConfig(config: Cell): FossFiConfigFull {
    const sc = config.beginParse()
    const parsed: FossFiConfigFull = {
        supply: sc.loadCoins(),
        admin: sc.loadMaybeAddress(),
        transfer_admin: sc.loadMaybeAddress(),
        wallet_code: sc.loadRef(),
        metadata_uri: sc.loadRef()
    };
    endParse(sc);
    return parsed;
}

export function parseFossFiData(data: Cell): FossFiConfigFull {
    return fossFiConfigCellToConfig(data);
}

export function fossFiConfigFullToCell(config: FossFiConfigFull): Cell {
    const content = config.metadata_uri instanceof Cell ? config.metadata_uri : jettonContentToCell(config.metadata_uri);
    return beginCell()
        .storeCoins(config.supply)
        .storeAddress(config.admin)
        .storeAddress(config.transfer_admin)
        .storeRef(config.wallet_code)
        .storeRef(content)
        .endCell()
}

export function fossFiConfigToCell(config: FossFiConfig): Cell {
    const content = config.metadata_uri instanceof Cell ? config.metadata_uri : jettonContentToCell(config.metadata_uri);
    return beginCell()
        .storeCoins(0)
        .storeUint(0, 10)
        .storeAddress(config.admin_address)
        .storeRef(config.base_fi_wallet_code)
        .storeRef(config.base_fi_wallet_code)
        .storeRef(content)
        .endCell();
}

export function jettonContentToCell(content: FossFiContent) {
    return beginCell()
        .storeStringRefTail(content.uri) //Snake logic under the hood
        .endCell();
}

export type MintNewJettons = {
    $$type: 'MintNewJettons';
    queryId: bigint;
    mintRecipient: Address;
    tonAmount: bigint;
    internalTransferMsg: InternalTransferStep;
}

export function storeMint(src: MintNewJettons) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1680571655, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeAddress(src.mintRecipient);
        b_0.storeCoins(src.tonAmount);

        const b_1 = new Builder();
        b_1.store(storeInternalTransferStep(src.internalTransferMsg));
        b_0.storeRef(b_1.endCell());
    };
}

export type InternalTransferStep = {
    $$type: 'InternalTransferStep';
    queryId: bigint;
    jettonAmount: bigint;
    version: bigint;
    transferInitiator: Address;
    sendExcessesTo: Address | null;
    forwardTonAmount: bigint;
    forwardPayload: Slice;
}

export function storeInternalTransferStep(src: InternalTransferStep) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(395134233, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeCoins(src.jettonAmount);
        b_0.storeUint(src.version, 10);
        b_0.storeAddress(src.transferInitiator);
        b_0.storeAddress(src.sendExcessesTo);
        b_0.storeCoins(src.forwardTonAmount);
        b_0.storeBuilder(src.forwardPayload.asBuilder());
    };
}

export class FossFi implements Contract {
    readonly abi: ContractABI = { name: 'FossFi' } // todo: implement from shard wrapper

    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new FossFi(address);
    }

    static async fromInit(owner: Address, jettonContent: Cell) {
        const __gen_init = await FossFi_init(owner, jettonContent);
        const address = contractAddress(0, __gen_init);
        return new FossFi(address, __gen_init);
    }

    static createFromConfig(config: FossFiConfig, code: Cell, workchain = 0) {
        const data = fossFiConfigToCell(config);
        const init = { code, data };
        return new FossFi(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Op.top_up, 32).storeUint(0, 64).endCell(),
        });
    }

    static mintMessage(to: Address, jetton_amount: bigint, from?: Address | null, response?: Address | null, customPayload?: Cell | null, forward_ton_amount: bigint = 0n, total_ton_amount: bigint = 0n) {
        const mintMsg = beginCell().storeUint(Op.internal_transfer, 32)
            .storeUint(0, 64)
            .storeCoins(jetton_amount)
            .storeUint(0, 10) // version
            .storeAddress(from)
            .storeAddress(response)
            .storeCoins(forward_ton_amount)
            .storeMaybeRef(customPayload)
            .endCell();
        return beginCell().storeUint(Op.mint, 32).storeUint(0, 64) // op, queryId
            .storeAddress(to)
            .storeCoins(total_ton_amount)
            .storeRef(mintMsg)
            .endCell();
    }

    static parseMintInternalMessage(slice: Slice) {
        const op = slice.loadUint(32);
        if (op !== Op.internal_transfer) throw new Error('Invalid op');
        const queryId = slice.loadUint(64);
        const jettonAmount = slice.loadCoins();
        const fromAddress = slice.loadAddress();
        const responseAddress = slice.loadAddress();
        const forwardTonAmount = slice.loadCoins();
        const customPayload = slice.loadMaybeRef();
        endParse(slice);
        return {
            queryId,
            jettonAmount,
            fromAddress,
            responseAddress,
            forwardTonAmount,
            customPayload
        }
    }

    static parseMintMessage(slice: Slice) {
        const op = slice.loadUint(32);
        if (op !== Op.mint) throw new Error('Invalid op');
        const queryId = slice.loadUint(64);
        const toAddress = slice.loadAddress();
        const tonAmount = slice.loadCoins();
        const mintMsg = slice.loadRef();
        endParse(slice);
        return {
            queryId,
            toAddress,
            tonAmount,
            internalMessage: this.parseMintInternalMessage(mintMsg.beginParse())
        }
    }

    async sendMint(provider: ContractProvider,
        via: Sender,
        to: Address,
        jetton_amount: bigint,
        from?: Address | null,
        response_addr?: Address | null,
        customPayload?: Cell | null,
        forward_ton_amount: bigint = toNano('0.05'), total_ton_amount: bigint = toNano('0.1')) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: FossFi.mintMessage(to, jetton_amount, from, response_addr, customPayload, forward_ton_amount, total_ton_amount),
            value: total_ton_amount + toNano('0.05'),
        });
    }

    /* provide_wallet_address#2c76b973 query_id:uint64 owner_address:MsgAddress include_address:Bool = InternalMsgBody;
    */
    static discoveryMessage(owner: Address, include_address: boolean) {
        return beginCell().storeUint(Op.provide_wallet_address, 32).storeUint(0, 64) // op, queryId
            .storeAddress(owner).storeBit(include_address)
            .endCell();
    }

    async sendDiscovery(provider: ContractProvider, via: Sender, owner: Address, include_address: boolean, value: bigint = toNano('0.1')) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: FossFi.discoveryMessage(owner, include_address),
            value: value,
        });
    }

    static topUpMessage() {
        return beginCell().storeUint(Op.top_up, 32).storeUint(0, 64) // op, queryId
            .endCell();
    }

    static parseTopUp(slice: Slice) {
        const op = slice.loadUint(32);
        if (op !== Op.top_up) throw new Error('Invalid op');
        const queryId = slice.loadUint(64);
        endParse(slice);
        return {
            queryId,
        }
    }

    async sendTopUp(provider: ContractProvider, via: Sender, value: bigint = toNano('0.1')) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: FossFi.topUpMessage(),
            value: value,
        });
    }

    static changeAdminMessage(newOwner: Address) {
        return beginCell().storeUint(Op.change_admin, 32).storeUint(0, 64) // op, queryId
            .storeAddress(newOwner)
            .endCell();
    }

    static parseChangeAdmin(slice: Slice) {
        const op = slice.loadUint(32);
        if (op !== Op.change_admin) throw new Error('Invalid op');
        const queryId = slice.loadUint(64);
        const newAdminAddress = slice.loadAddress();
        endParse(slice);
        return {
            queryId,
            newAdminAddress
        }
    }

    async sendChangeAdmin(provider: ContractProvider, via: Sender, newOwner: Address) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: FossFi.changeAdminMessage(newOwner),
            value: toNano("0.1"),
        });
    }

    static claimAdminMessage(query_id: bigint = 0n) {
        return beginCell().storeUint(Op.claim_admin, 32).storeUint(query_id, 64).endCell();
    }

    static parseClaimAdmin(slice: Slice) {
        const op = slice.loadUint(32);
        if (op !== Op.claim_admin) throw new Error('Invalid op');
        const queryId = slice.loadUint(64);
        endParse(slice);
        return {
            queryId
        }
    }

    async sendClaimAdmin(provider: ContractProvider, via: Sender, query_id: bigint = 0n) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: FossFi.claimAdminMessage(query_id),
            value: toNano('0.1')
        })
    }

    static dropAdminMessage(query_id: number | bigint) {
        return beginCell().storeUint(Op.drop_admin, 32).storeUint(query_id, 64).endCell();
    }
    static parseDropAdmin(slice: Slice) {
        const op = slice.loadUint(32);
        if (op !== Op.drop_admin) {
            throw new Error("Invalid op");
        }
        const queryId = slice.loadUint(64);
        endParse(slice);
        return {
            queryId
        }
    }
    async sendDropAdmin(provider: ContractProvider, via: Sender, value: bigint = toNano('0.05'), query_id: number | bigint = 0) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: FossFi.dropAdminMessage(query_id),
            value
        });
    }


    static changeContentMessage(content: Cell | FossFiContent) {
        const contentString = content instanceof Cell ? content.beginParse().loadStringTail() : content.uri;
        return beginCell().storeUint(Op.change_metadata_url, 32).storeUint(0, 64) // op, queryId
            .storeStringTail(contentString)
            .endCell();
    }

    static parseChangeContent(slice: Slice) {
        const op = slice.loadUint(32);
        if (op !== Op.change_metadata_url) throw new Error('Invalid op');
        const queryId = slice.loadUint(64);
        const newMetadataUrl = slice.loadStringTail();
        endParse(slice);
        return {
            queryId,
            newMetadataUrl
        }
    }

    async sendChangeContent(provider: ContractProvider, via: Sender, content: Cell | FossFiContent) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: FossFi.changeContentMessage(content),
            value: toNano("0.1"),
        });
    }

    static parseTransfer(slice: Slice) {
        const op = slice.loadUint(32);
        if (op !== Op.transfer) throw new Error('Invalid op');
        const queryId = slice.loadUint(64);
        const jettonAmount = slice.loadCoins();
        const toAddress = slice.loadAddress();
        const responseAddress = slice.loadAddress();
        const customPayload = slice.loadMaybeRef();
        const forwardTonAmount = slice.loadCoins();
        const inRef = slice.loadBit();
        const forwardPayload = inRef ? slice.loadRef().beginParse() : slice;
        return {
            queryId,
            jettonAmount,
            toAddress,
            responseAddress,
            customPayload,
            forwardTonAmount,
            forwardPayload
        }
    }

    static parseBurn(slice: Slice) {
        const op = slice.loadUint(32);
        if (op !== Op.burn) throw new Error('Invalid op');
        const queryId = slice.loadUint(64);
        const jettonAmount = slice.loadCoins();
        const responseAddress = slice.loadAddress();
        const customPayload = slice.loadMaybeRef();
        endParse(slice);
        return {
            queryId,
            jettonAmount,
            responseAddress,
            customPayload,
        }
    }

    static upgradeMessage(walletUpgrade: boolean, sender: Address, new_code: Cell, new_data: Cell | null,) {
        return beginCell().storeUint(Op.upgrade, 32).storeBit(walletUpgrade)
        // return beginCell().storeUint(Op.upgrade, 32).storeBit(walletUpgrade)
            .storeUint(0, 10)
            .storeAddress(sender)
            .storeBit(false)
            .storeBit(true) // todo: fixme need to check for null
            .storeRef(new_code)
            .endCell();
    }

    static parseUpgrade(slice: Slice) {
        const op = slice.loadUint(32);
        if (op !== Op.upgrade) throw new Error('Invalid op');
        const queryId = slice.loadUint(64);
        const newData = slice.loadRef();
        const newCode = slice.loadRef();
        endParse(slice);
        return {
            queryId,
            newData,
            newCode
        }
    }

    async sendUpgrade(provider: ContractProvider, via: Sender, walletUpgrade: boolean, sender: Address, new_code: Cell, new_data: Cell | null, value: bigint) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: FossFi.upgradeMessage(walletUpgrade, sender, new_code, new_data),
            value
        });
    }

    async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
        const res = await provider.get('get_wallet_address', [{
            type: 'slice',
            cell: beginCell().storeAddress(owner).endCell()
        }])
        return res.stack.readAddress()
    }

    async getJettonData(provider: ContractProvider) {
        let res = await provider.get('get_jetton_data', []);
        let totalSupply = res.stack.readBigNumber();
        let mintable = res.stack.readBoolean();
        let adminAddress = res.stack.readAddress();
        let content = res.stack.readCell();
        let walletCode = res.stack.readCell();
        return {
            totalSupply,
            mintable,
            adminAddress,
            content,
            walletCode,
        };
    }

    async getjettonDataAll(provider: ContractProvider) {
        let res = await provider.get('get_jetton_data_all', []);
        let totalSupply = res.stack.readBigNumber();
        let walletVersion = res.stack.readBigNumber();
        let adminAddress = res.stack.readAddress();
        let baseFiWalletCode = res.stack.readCell();
        let latestFiWalletCode = res.stack.readCell();
        let content = res.stack.readCell();
        return {
            totalSupply,
            walletVersion,
            adminAddress,
            baseFiWalletCode,
            latestFiWalletCode,
            content,
        };
    }

    async getTotalSupply(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.totalSupply;
    }

    async getAdminAddress(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.adminAddress;
    }

    async getContent(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.content;
    }

    async getNextAdminAddress(provider: ContractProvider) {
        const res = await provider.get('get_next_admin_address', []);
        return res.stack.readAddressOpt();
    }
}

async function FossFi_init(owner: Address, jettonContent: Cell) {
    const codefile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../build/', 'FossFi.compiled.json'), 'utf-8'));
    const keys = Object.keys(codefile);
    const thirdValue = codefile[keys[2]];        // dynamic third property
    const codeHex: string = String(thirdValue);  // or: const codeHex = codefile.hex;
    const __code = Cell.fromHex(codeHex);
    const builder = beginCell();
    builder.storeUint(0, 1);
    initFossFi_init_args({ $$type: 'FossFi_init_args', owner, jettonContent })(builder);
    const __data = builder.endCell();
    return { code: __code, data: __data };
}

function initFossFi_init_args(src: FossFi_init_args) {
    return (builder: Builder) => {
        const b_0 = builder;
        // b_0.storeCoins(src.totalSupply);
        b_0.storeAddress(src.owner);
        b_0.storeRef(src.jettonContent);
        // b_0.storeBit(src.mintable);
    };
}

type FossFi_init_args = {
    $$type: 'FossFi_init_args';
    // totalSupply: bigint;
    owner: Address;
    jettonContent: Cell; // todo: field names need 2b changed
    // mintable: boolean;
}

// (0x2508d66a) UpgradeAnyDataCode
export type Upgrade = {
    $$type: 'Upgrade';
    walletUpgrade: boolean;
    sender: Address;
    newData: Cell | null | undefined;
    newCode: Cell | null | undefined;
}

export function storeUpgrade(src: Upgrade) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(621336170, 32);
        b_0.storeBit(src.walletUpgrade);
        b_0.storeUint(0, 10); // ignored. used in internal upgrades
        b_0.storeAddress(src.sender);
        if (src.newData !== null && src.newData !== undefined) { b_0.storeBit(true).storeRef(src.newData); } else { b_0.storeBit(false); }
        if (src.newCode !== null && src.newCode !== undefined) { b_0.storeBit(true).storeRef(src.newCode); } else { b_0.storeBit(false); }
    };
}

export function loadUpgrade(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 621336170) { throw Error('Invalid prefix'); }
    const _walletUpgrade = sc_0.loadBoolean();
    const _walletVersion = sc_0.loadUintBig(10);
    const _sender = sc_0.loadAddress();
    const _newData = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _newCode = sc_0.loadBit() ? sc_0.loadRef() : null;
    return { $$type: 'Upgrade' as const, walletUpgrade: _walletUpgrade, walletVersion: _walletVersion, sender: _sender, newData: _newData, newCode: _newCode };
}

export function loadTupleUpgrade(source: TupleReader) {
    const _walletUpgrade = source.readBoolean();
    const _walletVersion = source.readBigNumber();
    const _sender = source.readAddress();
    const _newData = source.readCellOpt();
    const _newCode = source.readCellOpt();
    return { $$type: 'Upgrade' as const, walletUpgrade: _walletUpgrade, walletVersion: _walletVersion, sender: _sender, newData: _newData, newCode: _newCode };
}

export function loadGetterTupleUpgrade(source: TupleReader) {
    const _walletUpgrade = source.readBoolean;
    const _walletVersion = source.readBigNumber;
    const _sender = source.readAddress();
    const _newData = source.readCellOpt();
    const _newCode = source.readCellOpt();
    return { $$type: 'Upgrade' as const, walletUpgrade: _walletUpgrade, walletVersion: _walletVersion, sender: _sender, newData: _newData, newCode: _newCode };
}

export function storeTupleUpgrade(source: Upgrade) {
    const builder = new TupleBuilder();
    builder.writeBoolean(source.walletUpgrade);
    builder.writeNumber(0n);
    builder.writeAddress(source.sender);
    builder.writeCell(source.newData);
    builder.writeCell(source.newCode);
    return builder.build();
}

export function dictValueParserUpgrade(): DictionaryValue<Upgrade> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeUpgrade(src)).endCell());
        },
        parse: (src) => {
            return loadUpgrade(src.loadRef().beginParse());
        }
    }
}