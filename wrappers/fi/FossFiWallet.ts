import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    ContractABI,
    contractAddress,
    ContractProvider,
    Dictionary,
    DictionaryValue,
    Sender,
    SendMode,
    Slice,
    TupleBuilder,
    TupleReader
} from '@ton/core';

export type FossFiWalletConfig = {
    balance: bigint,
    votes: number,
    id: Cell,
    addresses: Cell,
    maps: Cell,
    base_fi_wallet_code: Cell,
};

export function fossFiWalletConfigToCell(config: FossFiWalletConfig): Cell {
    return beginCell()
        .storeCoins(config.balance) // jettonBalance
        .storeUint(0, 8) // txnCount
        .storeUint(0, 2) // status
        .storeBit(false) // isAuthorityAccount
        .storeCoins(0) // creditNeed
        .storeCoins(0) // accumulatedFees
        .storeCoins(0) // debt
        .storeBit(false) // debts
        .storeUint(10, 4) // votes
        .storeUint(0, 20) // receivedVotes
        .storeUint(0, 8) // connections
        .storeBit(false) // active
        .storeBit(true) // mintable
        .storeUint(0, 32) // accountInitTime
        .storeUint(0, 10) // version
        .storeUint(0, 32) // lastWeeklyAllowanceClaimTime
        .storeRef(config.id) // uniqueId
        .storeRef(config.addresses) // addresses map
        .storeRef(config.maps) // other maps
        .storeRef(config.base_fi_wallet_code) // baseCode
        .endCell()
}

export class FossFiWallet implements Contract {
    abi: ContractABI = { name: 'FossFiWallet' }

    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) { }

    static createFromAddress(address: Address) {
        return new FossFiWallet(address);
    }

    static createFromConfig(config: FossFiWalletConfig, code: Cell, workchain = 0) {
        const data = fossFiWalletConfigToCell(config);
        const init = { code, data };
        return new FossFiWallet(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async send(provider: ContractProvider, via: Sender, args: { value: bigint, bounce?: boolean | null | undefined }, message: JettonTransfer | JettonTransferInternal | Slice | null) {

        let body: Cell | null = null;
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'JettonTransfer') {
            body = beginCell().store(storeJettonTransfer(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'JettonTransferInternal') {
            body = beginCell().store(storeJettonTransferInternal(message)).endCell();
        }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'InviteInternal') {
        //     body = beginCell().store(storeInviteInternal(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'InviteApproval') {
        //     body = beginCell().store(storeInviteApproval(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'UnInviteInternal') {
        //     body = beginCell().store(storeUnInviteInternal(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'FriendRequestInternal') {
        //     body = beginCell().store(storeFriendRequestInternal(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ConfirmRequestInternal') {
        //     body = beginCell().store(storeConfirmRequestInternal(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'UnfriendInternal') {
        //     body = beginCell().store(storeUnfriendInternal(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'FollowInternal') {
        //     body = beginCell().store(storeFollowInternal(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'UnfollowInternal') {
        //     body = beginCell().store(storeUnfollowInternal(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ReportInternal') {
        //     body = beginCell().store(storeReportInternal(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'DisputeInternal') {
        //     body = beginCell().store(storeDisputeInternal(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ResolutionInternal') {
        //     body = beginCell().store(storeResolutionInternal(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'AccCloseBurnInternal') {
        //     body = beginCell().store(storeAccCloseBurnInternal(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ProvideWalletBalance') {
        //     body = beginCell().store(storeProvideWalletBalance(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'JettonBurn') {
        //     body = beginCell().store(storeJettonBurn(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ClaimTON') {
        //     body = beginCell().store(storeClaimTON(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'RequestUpgradeCode') {
        //     body = beginCell().store(storeRequestUpgradeCode(message)).endCell();
        // }
        // if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'UpgradeCode') {
        //     body = beginCell().store(storeUpgradeCode(message)).endCell();
        // }
        if (message && typeof message === 'object' && message instanceof Slice) {
            body = message.asCell();
        }
        if (message === null) {
            body = new Cell();
        }
        if (body === null) { throw new Error('Invalid message type'); }

        await provider.internal(via, { ...args, body: body });

    }

    async getGetWalletData(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('get_wallet_data', builder.build())).stack;
        const result = loadGetterTupleJettonWalletData(source);
        return result;
    }

    async getGetWalletDataAll(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('get_wallet_data_all', builder.build())).stack;
        const result = loadGetterTupleFiJetton$Data(source);
        return result;
    }
}

export type JettonTransfer = {
    $$type: 'JettonTransfer';
    queryId: bigint;
    amount: bigint;
    destination: Address;
    responseDestination: Address | null;
    customPayload: Cell | null;
    forwardTonAmount: bigint;
    forwardPayload: Slice;
}

export function storeJettonTransfer(src: JettonTransfer) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(260734629, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeCoins(src.amount);
        b_0.storeAddress(src.destination);
        b_0.storeAddress(src.responseDestination);
        if (src.customPayload !== null && src.customPayload !== undefined) { b_0.storeBit(true).storeRef(src.customPayload); } else { b_0.storeBit(false); }
        b_0.storeCoins(src.forwardTonAmount);
        b_0.storeBuilder(src.forwardPayload.asBuilder());
    };
}

export function loadJettonTransfer(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 260734629) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _amount = sc_0.loadCoins();
    const _destination = sc_0.loadAddress();
    const _responseDestination = sc_0.loadMaybeAddress();
    const _customPayload = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _forwardTonAmount = sc_0.loadCoins();
    const _forwardPayload = sc_0;
    return { $$type: 'JettonTransfer' as const, queryId: _queryId, amount: _amount, destination: _destination, responseDestination: _responseDestination, customPayload: _customPayload, forwardTonAmount: _forwardTonAmount, forwardPayload: _forwardPayload };
}

export function loadTupleJettonTransfer(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _destination = source.readAddress();
    const _responseDestination = source.readAddressOpt();
    const _customPayload = source.readCellOpt();
    const _forwardTonAmount = source.readBigNumber();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'JettonTransfer' as const, queryId: _queryId, amount: _amount, destination: _destination, responseDestination: _responseDestination, customPayload: _customPayload, forwardTonAmount: _forwardTonAmount, forwardPayload: _forwardPayload };
}

export function loadGetterTupleJettonTransfer(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _destination = source.readAddress();
    const _responseDestination = source.readAddressOpt();
    const _customPayload = source.readCellOpt();
    const _forwardTonAmount = source.readBigNumber();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'JettonTransfer' as const, queryId: _queryId, amount: _amount, destination: _destination, responseDestination: _responseDestination, customPayload: _customPayload, forwardTonAmount: _forwardTonAmount, forwardPayload: _forwardPayload };
}

export function storeTupleJettonTransfer(source: JettonTransfer) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeNumber(source.amount);
    builder.writeAddress(source.destination);
    builder.writeAddress(source.responseDestination);
    builder.writeCell(source.customPayload);
    builder.writeNumber(source.forwardTonAmount);
    builder.writeSlice(source.forwardPayload.asCell());
    return builder.build();
}

export function dictValueParserJettonTransfer(): DictionaryValue<JettonTransfer> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeJettonTransfer(src)).endCell());
        },
        parse: (src) => {
            return loadJettonTransfer(src.loadRef().beginParse());
        }
    }
}

export type JettonTransferInternal = {
    $$type: 'JettonTransferInternal';
    queryId: bigint;
    amount: bigint;
    version: bigint;
    sender: Address;
    responseDestination: Address | null;
    forwardTonAmount: bigint;
    forwardPayload: Slice;
}

export function storeJettonTransferInternal(src: JettonTransferInternal) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(395134233, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeCoins(src.amount);
        b_0.storeUint(src.version, 10);
        b_0.storeAddress(src.sender);
        b_0.storeAddress(src.responseDestination);
        b_0.storeCoins(src.forwardTonAmount);
        b_0.storeBuilder(src.forwardPayload.asBuilder());
    };
}

export function loadJettonTransferInternal(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 395134233) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _amount = sc_0.loadCoins();
    const _version = sc_0.loadUintBig(10);
    const _sender = sc_0.loadAddress();
    const _responseDestination = sc_0.loadMaybeAddress();
    const _forwardTonAmount = sc_0.loadCoins();
    const _forwardPayload = sc_0;
    return { $$type: 'JettonTransferInternal' as const, queryId: _queryId, amount: _amount, version: _version, sender: _sender, responseDestination: _responseDestination, forwardTonAmount: _forwardTonAmount, forwardPayload: _forwardPayload };
}

export function loadTupleJettonTransferInternal(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _version = source.readBigNumber();
    const _sender = source.readAddress();
    const _responseDestination = source.readAddressOpt();
    const _forwardTonAmount = source.readBigNumber();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'JettonTransferInternal' as const, queryId: _queryId, amount: _amount, version: _version, sender: _sender, responseDestination: _responseDestination, forwardTonAmount: _forwardTonAmount, forwardPayload: _forwardPayload };
}

export function loadGetterTupleJettonTransferInternal(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _version = source.readBigNumber();
    const _sender = source.readAddress();
    const _responseDestination = source.readAddressOpt();
    const _forwardTonAmount = source.readBigNumber();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'JettonTransferInternal' as const, queryId: _queryId, amount: _amount, version: _version, sender: _sender, responseDestination: _responseDestination, forwardTonAmount: _forwardTonAmount, forwardPayload: _forwardPayload };
}

export function storeTupleJettonTransferInternal(source: JettonTransferInternal) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeNumber(source.amount);
    builder.writeNumber(source.version);
    builder.writeAddress(source.sender);
    builder.writeAddress(source.responseDestination);
    builder.writeNumber(source.forwardTonAmount);
    builder.writeSlice(source.forwardPayload.asCell());
    return builder.build();
}

export function dictValueParserJettonTransferInternal(): DictionaryValue<JettonTransferInternal> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeJettonTransferInternal(src)).endCell());
        },
        parse: (src) => {
            return loadJettonTransferInternal(src.loadRef().beginParse());
        }
    }
}

export type JettonWalletData = {
    $$type: 'JettonWalletData';
    balance: bigint;
    owner: Address;
    minter: Address;
    code: Cell;
}

export function storeJettonWalletData(src: JettonWalletData) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeCoins(src.balance);
        b_0.storeAddress(src.owner);
        b_0.storeAddress(src.minter);
        b_0.storeRef(src.code);
    };
}

export function loadJettonWalletData(slice: Slice) {
    const sc_0 = slice;
    const _balance = sc_0.loadCoins();
    const _owner = sc_0.loadAddress();
    const _minter = sc_0.loadAddress();
    const _code = sc_0.loadRef();
    return { $$type: 'JettonWalletData' as const, balance: _balance, owner: _owner, minter: _minter, code: _code };
}

export function loadTupleJettonWalletData(source: TupleReader) {
    const _balance = source.readBigNumber();
    const _owner = source.readAddress();
    const _minter = source.readAddress();
    const _code = source.readCell();
    return { $$type: 'JettonWalletData' as const, balance: _balance, owner: _owner, minter: _minter, code: _code };
}

export function loadGetterTupleJettonWalletData(source: TupleReader) {
    const _balance = source.readBigNumber();
    const _owner = source.readAddress();
    const _minter = source.readAddress();
    const _code = source.readCell();
    return { $$type: 'JettonWalletData' as const, balance: _balance, owner: _owner, minter: _minter, code: _code };
}

export function storeTupleJettonWalletData(source: JettonWalletData) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.balance);
    builder.writeAddress(source.owner);
    builder.writeAddress(source.minter);
    builder.writeCell(source.code);
    return builder.build();
}

export function dictValueParserJettonWalletData(): DictionaryValue<JettonWalletData> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeJettonWalletData(src)).endCell());
        },
        parse: (src) => {
            return loadJettonWalletData(src.loadRef().beginParse());
        }
    }
}

export function loadGetterTupleFiJetton$Data(source: TupleReader) {
    const _balance = source.readBigNumber();
    const _txnCount = source.readBigNumber();
    const _status = source.readBigNumber();
    const _isAuthority = source.readBoolean();
    const _creditNeed = source.readBigNumber();
    const _accumulatedFees = source.readBigNumber();
    const _debt = source.readBigNumber();
    const _debts = source.readBoolean();
    const _votes = source.readBigNumber();
    const _receivedVotes = source.readBigNumber();
    const _connections = source.readBigNumber();
    const _active = source.readBoolean();
    const _mintable = source.readBoolean();
    const _accountInitTime = source.readBigNumber();
    const _version = source.readBigNumber();
    const _lastWeeklyClaimTime = source.readBigNumber();
    const _id = source.readCell();
    const _addresses = loadGetterTupleAddresses(source);
    const _maps = source.readCell(); // todo: parseIt
    const _baseFiWalletCode = source.readCell();
    return {
        $$type: 'FiJetton$Data' as const,
        owner: _addresses.owner,
        treasury: _addresses.treasury,
        initialOwner: _addresses.initialOwner,
        minter: _addresses.minter,
        personalMinter: _addresses.personalMinter,
        personalJetton: _addresses.personalJetton,
        nominee: _addresses.nominee,
        invitor: _addresses.invitor,
        invitor0: _addresses.invitor0,
        authorisedAccs: _addresses.authorisedAccs,
        balance: _balance,
        txnCount: _txnCount,
        status: _status,
        isAuthority: _isAuthority,
        creditNeed: _creditNeed,
        accumulatedFees: _accumulatedFees,
        debt: _debt,
        debts: _debts,
        votes: _votes,
        receivedVotes: _receivedVotes,
        connections: _connections,
        active: _active,
        mintable: _mintable,
        accountInitTime: _accountInitTime,
        lastWeeklyClaimTime: _lastWeeklyClaimTime,
        version: _version,
        id: _id,
        maps: _maps,
        // baseFiWalletCode: _baseFiWalletCode
    };
}

export function loadGetterTupleAddresses(source: TupleReader) {
    const slice = source.readCell().beginParse();
    const _owner = slice.loadAddress();
    const _treasury = slice.loadAddress();
    const _initialOwner = slice.loadAddress();
    const nomins = slice.loadRef().beginParse();
    const _nominee = nomins.loadAddressAny();
    const _invitor = nomins.loadAddressAny();
    const _invitor0 = nomins.loadAddressAny();
    const trustedAddrs = slice.loadRef().beginParse();
    const _minter = trustedAddrs.loadAddress();
    const _personalMinter = trustedAddrs.loadAddressAny();
    const _personalJetton = trustedAddrs.loadAddressAny();
    const _authorisedAccs = trustedAddrs.loadDict(Dictionary.Keys.Address(), Dictionary.Values.Address());
    return { $$type: 'Addresses' as const, owner: _owner, treasury: _treasury, initialOwner: _initialOwner, nominee: _nominee, invitor: _invitor, invitor0: _invitor0, minter: _minter, personalMinter: _personalMinter, personalJetton: _personalJetton, authorisedAccs: _authorisedAccs };
}
