import {
    Address,
    beginCell,
    Builder,
    Cell,
    type Contract,
    type ContractABI,
    contractAddress,
    type ContractProvider,
    Dictionary,
    type DictionaryValue,
    ExternalAddress,
    type Sender,
    SendMode,
    Slice,
    TupleBuilder,
    TupleReader
} from '@ton/core';

export type FossFiWalletConfig = {
    balance: bigint,
    votes: bigint,
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
        .storeUint(config.votes, 4) // votes (use config)
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
        const result = loadTupleFiJettonData(source);
        return result;
    }

    async getGetWalletDataFull(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('get_wallet_data_all', builder.build())).stack;
        const result = loadTupleFiJettonFullData(source);
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

// Rename large complex type to avoid conflict with small FiJettonData used by helpers
export type FiJettonFullData = {
    $$type: 'FiJettonFullData';
    owner: Address;
    treasury: Address;
    initialOwner: Address;
    minter: Address;
    personalMinter: Address | null;
    personalJetton: Address | null;
    nominee: Address | null;
    invitor: Address | null;
    invitor0: Address | null;
    authorisedAccs: Dictionary<Address, Address>;
    balance: bigint;
    goldCoins: bigint;
    txnCount: bigint;
    status: bigint;
    isAuthority: boolean;
    creditNeed: bigint;
    accumulatedFees: bigint;
    debt: bigint;
    debts: boolean;
    votes: bigint;
    receivedVotes: bigint;
    connections: bigint;
    active: boolean;
    mintable: boolean;
    accountInitTime: bigint;
    lastWeeklyClaimTime: bigint;
    lastInviteTime: bigint;
    version: bigint;
    id: Cell;
    // maps: Cell;
    closeFriends: Dictionary<Address, boolean>;
    invites: Dictionary<Address, bigint>;
    friends: Dictionary<Address, bigint>;
    followers: Dictionary<Address, bigint>;
    followings: Dictionary<Address, bigint>;
    allowances: Dictionary<Address, bigint>;
    debtsMap: Dictionary<Address, bigint>;
    votedFor: Dictionary<Address, bigint>;
    reportInfo: ReportInfo;
    baseFiWalletCode: Cell;
}

export type ReportInfo = {
    reports: Dictionary<Address, boolean>;
    tosBreach: boolean;
    reporterCount: bigint;
    disputerCount: bigint;
    resolutiontime: bigint;
}

// Small FiJettonData used by store/load helpers (keeps consistency with storeFiJettonData / loadFiJettonData)
export type FiJettonData = {
    $$type: 'FiJettonData';
    owner: Address;
    minter: Address;
    balance: bigint;
    code: Cell;
}

export function storeFiJettonData(src: FiJettonData) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeCoins(src.balance);
        b_0.storeAddress(src.owner);
        b_0.storeAddress(src.minter);
        b_0.storeRef(src.code);
    };
}

export function loadFiJettonData(slice: Slice) {
    const sc_0 = slice;
    const _balance = sc_0.loadCoins();
    const _owner = sc_0.loadAddress();
    const _minter = sc_0.loadAddress();
    const _code = sc_0.loadRef();
    return { $$type: 'FiJettonData' as const, balance: _balance, owner: _owner, minter: _minter, code: _code };
}

export function loadTupleFiJettonData(source: TupleReader) {
    const _balance = source.readBigNumber();
    const _owner = source.readAddress();
    const _minter = source.readAddress();
    const _code = source.readCell();
    return { $$type: 'FiJettonData' as const, balance: _balance, owner: _owner, minter: _minter, code: _code };
}

export function storeTupleFiJettonData(source: FiJettonData) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.balance);
    builder.writeAddress(source.owner);
    builder.writeAddress(source.minter);
    builder.writeCell(source.code);
    return builder.build();
}

export function dictValueParserFiJettonData(): DictionaryValue<FiJettonData> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeFiJettonData(src)).endCell());
        },
        parse: (src) => {
            return loadFiJettonData(src.loadRef().beginParse());
        }
    }
}

// Add store/load/tuple helpers for full FiJetton data
export function storeFiJettonFullData(src: FiJettonFullData) {
    return (builder: Builder) => {
        const b = builder;
        b.storeCoins(src.balance);
        b.storeUint(src.goldCoins, 32);
        b.storeUint(src.txnCount, 8);
        b.storeUint(src.status, 2);
        b.storeBit(src.isAuthority);
        b.storeCoins(src.creditNeed);
        b.storeCoins(src.accumulatedFees);
        b.storeCoins(src.debt);
        b.storeBit(src.debts);
        b.storeUint(src.votes, 4);
        b.storeUint(src.receivedVotes, 20);
        b.storeUint(src.connections, 8);
        b.storeBit(src.active);
        b.storeBit(src.mintable);
        b.storeUint(src.version, 10);
        b.storeRef(src.id); // todo: cell

        // timestamps as a ref cell
        b.storeRef(beginCell()
            .storeUint(src.accountInitTime, 32)
            .storeUint(src.lastWeeklyClaimTime, 32)
            .storeUint(src.lastInviteTime, 32)
            .endCell());

        // addresses as a ref cell (owner, treasury, initialOwner, nomins ref, trustedAddrs ref)
        const trustedAddrsBuilder = beginCell();
        trustedAddrsBuilder.storeAddress(src.minter);
        if (src.personalMinter !== null && src.personalMinter !== undefined) { trustedAddrsBuilder.storeBit(true).storeAddress(src.personalMinter); } else { trustedAddrsBuilder.storeBit(false); }
        if (src.personalJetton !== null && src.personalJetton !== undefined) { trustedAddrsBuilder.storeBit(true).storeAddress(src.personalJetton); } else { trustedAddrsBuilder.storeBit(false); }
        trustedAddrsBuilder.storeDict(src.authorisedAccs, Dictionary.Keys.Address(), Dictionary.Values.Address());
        const trustedAddrs = trustedAddrsBuilder.endCell();

        const nomins = beginCell()
            .storeAddress(src.nominee)
            .storeAddress(src.invitor)
            .storeAddress(src.invitor0)
            .endCell();

        b.storeRef(beginCell()
            .storeAddress(src.owner)
            .storeAddress(src.treasury)
            .storeAddress(src.initialOwner)
            .storeRef(nomins)
            .storeRef(trustedAddrs)
            .endCell());

        const reportInfoCell = beginCell()
            .storeDict(src.reportInfo.reports, Dictionary.Keys.Address(), Dictionary.Values.Bool())
            .storeBit(src.reportInfo.tosBreach)
            .storeUint(src.reportInfo.reporterCount, 10)
            .storeUint(src.reportInfo.disputerCount, 10)
            .storeUint(src.reportInfo.resolutiontime, 32)
            .endCell();

        const mapsBuilder = beginCell();
        mapsBuilder.storeDict(src.friends, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
        mapsBuilder.storeDict(src.followers, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
        mapsBuilder.storeDict(src.followings, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
        mapsBuilder.storeDict(src.invites, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
        mapsBuilder.storeDict(src.allowances, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
        mapsBuilder.storeDict(src.debtsMap, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
        mapsBuilder.storeDict(src.votedFor, Dictionary.Keys.Address(), Dictionary.Values.BigUint(4));
        mapsBuilder.storeDict(src.closeFriends, Dictionary.Keys.Address(), Dictionary.Values.Bool());
        mapsBuilder.storeRef(reportInfoCell);
        const mapsCell = mapsBuilder.endCell();
        b.storeRef(mapsCell);
        b.storeRef(src.baseFiWalletCode);
    };
}

export function loadFiJettonFullData(slice: Slice) {
    const s = slice;
    const _balance = s.loadCoins();
    const _goldCoins = s.loadUintBig(32);
    const _txnCount = s.loadUintBig(8);
    const _status = s.loadUintBig(2);
    const _isAuthority = s.loadBit();
    const _creditNeed = s.loadCoins();
    const _accumulatedFees = s.loadCoins();
    const _debt = s.loadCoins();
    const _debts = s.loadBit();
    const _votes = s.loadUintBig(4);
    const _receivedVotes = s.loadUintBig(20);
    const _connections = s.loadUintBig(8);
    const _active = s.loadBit();
    const _mintable = s.loadBit();
    const _version = s.loadUintBig(10);
    const _id = s.loadRef();

    const tsSlice = s.loadRef().beginParse();
    const _accountInitTime = tsSlice.loadUintBig(32);
    const _lastWeeklyClaimTime = tsSlice.loadUintBig(32);
    const _lastInviteTime = tsSlice.loadUintBig(32);

    const addrSlice = s.loadRef().beginParse();
    const _owner = addrSlice.loadAddress();
    const _treasury = addrSlice.loadAddress();
    const _initialOwner = addrSlice.loadAddress();
    const nomins = addrSlice.loadRef().beginParse();
    const _nominee = nomins.loadAddressAny();
    const _invitor = nomins.loadAddressAny();
    const _invitor0 = nomins.loadAddressAny();
    const trustedAddrs = addrSlice.loadRef().beginParse();
    const _minter = trustedAddrs.loadAddress();
    const _personalMinter = trustedAddrs.loadAddressAny();
    const _personalJetton = trustedAddrs.loadAddressAny();
    const _authorisedAccs = trustedAddrs.loadDict(Dictionary.Keys.Address(), Dictionary.Values.Address());

    const _mapsSlice = s.loadRef().beginParse();
    const _friends = _mapsSlice.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _followers = _mapsSlice.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _followings = _mapsSlice.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _invites = _mapsSlice.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _allowances = _mapsSlice.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _debtsMap = _mapsSlice.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _votedFor = _mapsSlice.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(4));
    const _closeFriends = _mapsSlice.loadDict(Dictionary.Keys.Address(), Dictionary.Values.Bool());
    const reportInfoSlice = _mapsSlice.loadRef().beginParse();
    const _reportInfo: ReportInfo = {
        reports: reportInfoSlice.loadDict(Dictionary.Keys.Address(), Dictionary.Values.Bool()),
        tosBreach: reportInfoSlice.loadBit(),
        reporterCount: reportInfoSlice.loadUintBig(10),
        disputerCount: reportInfoSlice.loadUintBig(10),
        resolutiontime: reportInfoSlice.loadUintBig(32)
    };
    const _baseFiWalletCode = s.loadRef();

    return {
        $$type: 'FiJettonFullData' as const,
        owner: _owner,
        treasury: _treasury,
        initialOwner: _initialOwner,
        minter: _minter,
        personalMinter: _personalMinter as Address,
        personalJetton: _personalJetton as Address,
        nominee: _nominee as Address,
        invitor: _invitor as Address,
        invitor0: _invitor0 as Address,
        authorisedAccs: _authorisedAccs,
        balance: _balance,
        goldCoins: _goldCoins,
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
        lastInviteTime: _lastInviteTime,
        version: _version,
        id: _id,
        friends: _friends,
        followers: _followers,
        followings: _followings,
        invites: _invites,
        allowances: _allowances,
        debtsMap: _debtsMap,
        votedFor: _votedFor,
        closeFriends: _closeFriends,
        reportInfo: _reportInfo,
        baseFiWalletCode: _baseFiWalletCode
    };
}

export function loadTupleFiJettonFullData(source: TupleReader) {
    const _balance = source.readBigNumber();
    const _goldCoins = source.readBigNumber();
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
    const _version = source.readBigNumber();
    const _id = source.readBigNumber();
    // const _id = source.readCell();
    const _timestamps = loadGetterTupleTimestamps(source);
    const _addresses = loadGetterTupleAddresses(source);
    const _maps = source.readCell().beginParse();
    const _friends = _maps.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _followers = _maps.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _followings = _maps.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _invites = _maps.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _allowances = _maps.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _debtsMap = _maps.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    const _votedFor = _maps.loadDict(Dictionary.Keys.Address(), Dictionary.Values.BigUint(4));
    const _closeFriends = _maps.loadDict(Dictionary.Keys.Address(), Dictionary.Values.Bool());
    const reportInfoSlice = _maps.loadRef().beginParse();
    const _reportInfo: ReportInfo = {
        reports: reportInfoSlice.loadDict(Dictionary.Keys.Address(), Dictionary.Values.Bool()),
        tosBreach: reportInfoSlice.loadBit(),
        reporterCount: reportInfoSlice.loadUintBig(10),
        disputerCount: reportInfoSlice.loadUintBig(10),
        resolutiontime: reportInfoSlice.loadUintBig(32)
    };
    const _baseFiWalletCode = source.readCell();

    return {
        $$type: 'FiJettonFullData' as const,
        owner: _addresses.owner,
        treasury: _addresses.treasury,
        initialOwner: _addresses.initialOwner,
        minter: _addresses.minter,
        personalMinter: _addresses.personalMinter as Address,
        personalJetton: _addresses.personalJetton as Address,
        nominee: _addresses.nominee as Address,
        invitor: _addresses.invitor as Address,
        invitor0: _addresses.invitor0 as Address,
        authorisedAccs: _addresses.authorisedAccs,
        balance: _balance,
        goldCoins: _goldCoins,
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
        accountInitTime: _timestamps.accountInit,
        lastWeeklyClaimTime: _timestamps.lastClaim,
        lastInviteTime: _timestamps.lastInvite,
        version: _version,
        id: _id,
        friends: _friends,
        followers: _followers,
        followings: _followings,
        invites: _invites,
        allowances: _allowances,
        debtsMap: _debtsMap,
        votedFor: _votedFor,
        closeFriends: _closeFriends,
        reportInfo: _reportInfo,
        baseFiWalletCode: _baseFiWalletCode
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

export function loadGetterTupleTimestamps(source: TupleReader) {
    const slice = source.readCell().beginParse();

    return { $$type: 'Timestamps' as const, accountInit: slice.loadVarUintBig, lastClaim: slice.loadUintBig, lastInvite: slice.loadUint } // todo: all working
}

export function storeTupleFiJettonFullData(source: FiJettonFullData) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.balance);
    builder.writeNumber(source.goldCoins);
    builder.writeNumber(source.txnCount);
    builder.writeNumber(source.status);
    builder.writeBoolean(source.isAuthority);
    builder.writeNumber(source.creditNeed);
    builder.writeNumber(source.accumulatedFees);
    builder.writeNumber(source.debt);
    builder.writeBoolean(source.debts);
    builder.writeNumber(source.votes);
    builder.writeNumber(source.receivedVotes);
    builder.writeNumber(source.connections);
    builder.writeBoolean(source.active);
    builder.writeBoolean(source.mintable);
    builder.writeNumber(source.version);
    builder.writeCell(source.id);

    // timestamps cell
    builder.writeCell(beginCell()
        .storeUint(source.accountInitTime, 32)
        .storeUint(source.lastWeeklyClaimTime, 32)
        .storeUint(source.lastInviteTime, 32)
        .endCell());

    // addresses cell
    const trustedAddrsBuilder = beginCell();
    trustedAddrsBuilder.storeAddress(source.minter);
    if (source.personalMinter !== null && source.personalMinter !== undefined) { trustedAddrsBuilder.storeBit(true).storeAddress(source.personalMinter); } else { trustedAddrsBuilder.storeBit(false); }
    if (source.personalJetton !== null && source.personalJetton !== undefined) { trustedAddrsBuilder.storeBit(true).storeAddress(source.personalJetton); } else { trustedAddrsBuilder.storeBit(false); }
    trustedAddrsBuilder.storeDict(source.authorisedAccs, Dictionary.Keys.Address(), Dictionary.Values.Address());
    const trustedAddrs = trustedAddrsBuilder.endCell();

    const nomins = beginCell()
        .storeAddress(source.nominee)
        .storeAddress(source.invitor)
        .storeAddress(source.invitor0)
        .endCell();

    builder.writeCell(beginCell()
        .storeAddress(source.owner)
        .storeAddress(source.treasury)
        .storeAddress(source.initialOwner)
        .storeRef(nomins)
        .storeRef(trustedAddrs)
        .endCell());

    // build maps cell (friends, followers, followings, invites, allowances, debtsMap, votedFor, closeFriends, reportInfo)
    const mapsBuilder = beginCell();
    mapsBuilder.storeDict(source.friends, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    mapsBuilder.storeDict(source.followers, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    mapsBuilder.storeDict(source.followings, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    mapsBuilder.storeDict(source.invites, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    mapsBuilder.storeDict(source.allowances, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    mapsBuilder.storeDict(source.debtsMap, Dictionary.Keys.Address(), Dictionary.Values.BigUint(128));
    mapsBuilder.storeDict(source.votedFor, Dictionary.Keys.Address(), Dictionary.Values.BigUint(4));
    mapsBuilder.storeDict(source.closeFriends, Dictionary.Keys.Address(), Dictionary.Values.Bool());
    const reportInfoCell = beginCell()
        .storeDict(source.reportInfo.reports, Dictionary.Keys.Address(), Dictionary.Values.Bool())
        .storeBit(source.reportInfo.tosBreach)
        .storeUint(source.reportInfo.reporterCount, 10)
        .storeUint(source.reportInfo.disputerCount, 10)
        .storeUint(source.reportInfo.resolutiontime, 32)
        .endCell();
    mapsBuilder.storeRef(reportInfoCell);
    const mapsCell = mapsBuilder.endCell();
    builder.writeCell(mapsCell);
    builder.writeCell(source.baseFiWalletCode);

    return builder.build();
}

export function dictValueParserFiJettonFullData(): DictionaryValue<FiJettonFullData> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeFiJettonFullData(src)).endCell());
        },
        parse: (src) => {
            return loadFiJettonFullData(src.loadRef().beginParse());
        }
    }
}

