// Decentralized Lottery Contract using Commit-Reveal(noNo evenBetter) Scheme
// Addresses are used as part of the commitment to ensure uniqueness

import "@stdlib/common"
import "../fossFi/storage"
import "messages"
import "utils"
import "consts"
// import "@stdlib/exotic-cells"
// import "@stdlib/tvm-dicts"
// import "@stdlib/tvm-lowlevel"


type AllowedMessageToLottery = EnterLottery | DrawWinner

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

fun onInternalMessage(in: InMessage) {
    val msg = AllowedMessageToLottery.fromSlice(in.body);
    var storage = lazy LotteryStorage.load();
    
    match (msg) {
        EnterLottery => {
            // correct sender
            assert (in.senderAddress == getFiWallet(msg.sender, storage.treasury, storage.minter, storage.fiJettonInitCode)) throw 700; // todo: incorrectSender
            
            // Deadline check
            assert(blockchain.now() <= storage.revealDeadline) throw 201;
            
            // todo: fixme make every hour
            if (!storage.revealDeadline) {
                storage.revealDeadline = blockchain.now() + REVEAL_DEADLINE_SECONDS;
            }

            // add if not already entered
            if (!storage.participants.exists(in.senderAddress)) {
                // Add participant
                storage.participants.set(in.senderAddress, ());
                storage.participantCount += 1;
            }
            
            storage.prizePool += ENTRY_FEE;
            val addrHash = in.senderAddress.toCell().hash();
            storage.randomSeed ^= addrHash;
        }   

        DrawWinner => {
            // Phase check
            assert(blockchain.now() > storage.revealDeadline) throw 400;
            
            // Select winner
            val winner = selectWinner(storage.randomSeed, storage.participants, storage.participantCount);
            // Send prize to winner
            val prizeMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: winner, // todo: implement receiver in fiJetton
                value: 0,
                body: LotteryWin {
                    amt: storage.prizePool,
                }
            });
            prizeMsg.send(SEND_MODE_REGULAR | SEND_MODE_IGNORE_ERRORS); // todo:
            
            // Reset storage for new lottery
            storage.participants = createEmptyMap();
            storage.prizePool = 0;
            storage.participantCount = 0;
            storage.randomSeed =0;
            storage.revealDeadline = 0;
        }
        
        else => {
            // Reject unkblockchain.nown messages
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }

    storage.save();
}

// ============================================================================
// GET METHODS
// ============================================================================

get fun getCurrentPhase() {
    val storage = lazy LotteryStorage.load();
    return storage.currentPhase;
}

get fun getParticipantCount() {
    val storage = lazy LotteryStorage.load();
    return storage.participantCount;
}

get fun isParticipant(addr: address) {
    val storage = lazy LotteryStorage.load();
    return storage.participants.exists(addr);
}

get fun getDeadline() {
    val storage = lazy LotteryStorage.load();
    return storage.revealDeadline;
}
