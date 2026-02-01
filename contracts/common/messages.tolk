import "../fossFi/storage"
import "../common/utils.tolk"

type ForwardPayloadRemainder = RemainingBitsAndRefs

struct (0x0f8a7ea5) AskToTransfer {
    queryId: uint64
    jettonAmount: coins
    transferRecipient: address
    sendExcessesTo: address?
    customPayload: cell?
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

struct (0x7362d09c) TransferNotificationForRecipient {
    queryId: uint64
    jettonAmount: coins
    transferInitiator: address?
    forwardPayload: ForwardPayloadRemainder
}

struct (0x178d4519) InternalTransferStep {
    queryId: uint64
    jettonAmount: coins
    version: uint10
    transferInitiator: address // todo: need fix?: is null when minting (not initiated by another wallet)
    sendExcessesTo: address?
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

struct (0xd53276db) ReturnExcessesBack {
    queryId: uint64
}

struct (0x595f07bc) AskToBurn {
    queryId: uint64
    jettonAmount: coins
    sendExcessesTo: address?
    customPayload: cell?
}

struct (0x7bdd97de) NotifyMinter {
    queryId: uint64
    jettonAmount: coins
    burnInitiator: address
    sendExcessesTo: address?
}

struct (0x2c76b973) RequestWalletAddress {
    queryId: uint64
    ownerAddress: address
    includeOwnerAddress: bool
}

struct (0xd1735400) ResponseWalletAddress {
    queryId: uint64
    jettonWalletAddress: address?
    ownerAddress: Cell<address>?
}

struct (0x642b7d07) MintNewJettons {
    queryId: uint64
    mintRecipient: address
    tonAmount: coins
    internalTransferMsg: Cell<InternalTransferStep>
}

struct (0x6501f354) ChangeMinterAdmin {
    queryId: uint64
    newAdminAddress: address
}

struct (0xfb88e119) ClaimMinterAdmin {
    queryId: uint64
}

struct (0x7431f221) DropMinterAdmin {
    queryId: uint64
}

struct (0x2508d66a) UpgradeAnyDataCode {
    queryId: uint2 = 1
    sender: address
    walletVersion: uint10?
    newData: cell? = null
    newCode: cell?
}

struct (0xcb862902) ChangeMinterMetadataUri {
    queryId: uint64
    newMetadataUri: SnakeString
}

struct (0xd372158c) TopUpTons {
}


// "forward payload" is TL/B `(Either Cell ^Cell)`;
// we want to test, that if ^Cell, no other data exists in a slice
fun ForwardPayloadRemainder.checkIsCorrectTLBEither(self) {
    var mutableCopy = self;
    if (mutableCopy.loadMaybeRef() != null) {
        // throw "cell underflow" if there is data besides a ref
        mutableCopy.assertEnd()
    }
}

struct (0x1) InternalInvite {
    queryId: uint64;
    version: uint10;
    id: IdInfo?;
    sender: address;
    invitor: address;
    currentWalletCode: cell;
    forwardPayload: ForwardPayloadRemainder;
}

struct (0x2) InternalDeActivate {}

struct (0x3) InternalInviteApproval {
    sender: address;
}

struct (0x38) RequestUpgradeCode {
    sender: address;
    version: uint10;
}

struct (0x4) InformMinterInviteInternal {
    sender: address;
    invitor: address;
    forwardPayload: ForwardPayloadRemainder;
}

struct (0x5) AuthorityAction {
    sender: address;
}

struct (0x6) SetStatus {
    sender: address;
    status: uint2;
}

struct (0x7) TransferByAuthority {
    amount: coins
    receiver: address
    forwardPayload: ForwardPayloadRemainder // todo: null?
}

struct IdInfo {
    username: SnakeString;
    lattitude: SnakeString;
    longitude: SnakeString;
    address: address;
}
