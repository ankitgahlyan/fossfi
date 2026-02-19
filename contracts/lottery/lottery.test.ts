// Example test/interaction file for the Decentralized Lottery Contract
// Using Blueprint framework for TON

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell } from '@ton/core';
import { createHash } from 'crypto';

// Example of how to interact with the lottery contract

describe('Lottery Contract Tests', () => {
    let blockchain: Blockchain;
    let lottery: SandboxContract<any>;
    let owner: SandboxContract<TreasuryContract>;
    let player1: SandboxContract<TreasuryContract>;
    let player2: SandboxContract<TreasuryContract>;
    let player3: SandboxContract<TreasuryContract>;

    // Helper function to create commitment hash
    function createCommitment(secret: Buffer, address: Address): bigint {
        const builder = beginCell()
            .storeUint(BigInt('0x' + secret.toString('hex')), 256)
            .storeAddress(address);
        
        const cell = builder.endCell();
        const hash = cell.hash();
        return BigInt('0x' + hash.toString('hex'));
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        
        // Create wallets
        owner = await blockchain.treasury('owner');
        player1 = await blockchain.treasury('player1');
        player2 = await blockchain.treasury('player2');
        player3 = await blockchain.treasury('player3');

        // Deploy lottery contract
        // Note: Actual deployment code would go here
        // lottery = blockchain.openContract(await LotteryContract.fromInit(...));
    });

    // ========================================================================
    // PHASE 1: ENTRY
    // ========================================================================

    it('should allow players to enter with correct fee', async () => {
        // Player 1 enters
        const result = await lottery.send(
            player1.getSender(),
            {
                value: toNano('1.0'), // Entry fee
            },
            {
                $$type: 'MsgEnterLottery',
                queryId: 0n,
            }
        );

        expect(result.transactions).toHaveTransaction({
            from: player1.address,
            to: lottery.address,
            success: true,
        });

        // Check participant count
        const count = await lottery.getParticipantCount();
        expect(count).toBe(1);
    });

    it('should reject entry with insufficient fee', async () => {
        const result = await lottery.send(
            player1.getSender(),
            {
                value: toNano('0.5'), // Too low
            },
            {
                $$type: 'MsgEnterLottery',
                queryId: 0n,
            }
        );

        expect(result.transactions).toHaveTransaction({
            from: player1.address,
            to: lottery.address,
            success: false,
            exitCode: 101, // Insufficient fee
        });
    });

    it('should advance to commit phase with minimum participants', async () => {
        // Three players enter
        await lottery.send(player1.getSender(), { value: toNano('1.0') }, {
            $$type: 'MsgEnterLottery',
            queryId: 0n,
        });

        await lottery.send(player2.getSender(), { value: toNano('1.0') }, {
            $$type: 'MsgEnterLottery',
            queryId: 0n,
        });

        await lottery.send(player3.getSender(), { value: toNano('1.0') }, {
            $$type: 'MsgEnterLottery',
            queryId: 0n,
        });

        // Check phase
        const phase = await lottery.getCurrentPhase();
        expect(phase).toBe(1); // PHASE_COMMIT
    });

    // ========================================================================
    // PHASE 2: COMMIT
    // ========================================================================

    it('should allow participants to commit', async () => {
        // Setup: Enter phase completed
        await setupThreeParticipants();

        // Player 1 generates secret and commits
        const secret1 = Buffer.from(
            '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            'hex'
        );
        const commitment1 = createCommitment(secret1, player1.address);

        const result = await lottery.send(
            player1.getSender(),
            { value: toNano('0.05') }, // Gas
            {
                $$type: 'MsgSubmitCommitment',
                queryId: 0n,
                commitmentHash: commitment1,
            }
        );

        expect(result.transactions).toHaveTransaction({
            success: true,
        });

        // Verify commitment stored
        const hasCommitted = await lottery.hasCommitted(player1.address);
        expect(hasCommitted).toBe(true);
    });

    it('should reject commitment from non-participant', async () => {
        await setupThreeParticipants();

        const randomUser = await blockchain.treasury('random');
        const secret = Buffer.alloc(32, 1);
        const commitment = createCommitment(secret, randomUser.address);

        const result = await lottery.send(
            randomUser.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'MsgSubmitCommitment',
                queryId: 0n,
                commitmentHash: commitment,
            }
        );

        expect(result.transactions).toHaveTransaction({
            success: false,
            exitCode: 202, // Not a participant
        });
    });

    // ========================================================================
    // PHASE 3: REVEAL
    // ========================================================================

    it('should verify correct reveal', async () => {
        // Setup: All committed
        const secrets = await setupAllCommitted();

        // Player 1 reveals
        const result = await lottery.send(
            player1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'MsgRevealCommitment',
                queryId: 0n,
                secret: BigInt('0x' + secrets.player1.toString('hex')),
            }
        );

        expect(result.transactions).toHaveTransaction({
            success: true,
        });

        const hasRevealed = await lottery.hasRevealed(player1.address);
        expect(hasRevealed).toBe(true);
    });

    it('should reject incorrect reveal', async () => {
        const secrets = await setupAllCommitted();

        // Player 1 tries to reveal wrong secret
        const wrongSecret = Buffer.alloc(32, 255);

        const result = await lottery.send(
            player1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'MsgRevealCommitment',
                queryId: 0n,
                secret: BigInt('0x' + wrongSecret.toString('hex')),
            }
        );

        expect(result.transactions).toHaveTransaction({
            success: false,
            exitCode: 302, // Invalid reveal
        });
    });

    // ========================================================================
    // PHASE 4: DRAW WINNER
    // ========================================================================

    it('should draw winner after all reveals', async () => {
        // Setup: All revealed
        await setupAllRevealed();

        // Anyone can draw winner
        const result = await lottery.send(
            player1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'MsgDrawWinner',
                queryId: 0n,
            }
        );

        expect(result.transactions).toHaveTransaction({
            success: true,
        });

        // Check winner determined
        const winner = await lottery.getWinner();
        expect(winner).not.toBeNull();
    });

    it('should allow winner to claim prize', async () => {
        await setupWinnerDetermined();

        const winner = await lottery.getWinner();
        const winnerContract = winner.equals(player1.address) ? player1 :
                              winner.equals(player2.address) ? player2 : player3;

        const prizePoolBefore = await lottery.getPrizePool();
        const balanceBefore = await winnerContract.getBalance();

        const result = await lottery.send(
            winnerContract.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'MsgClaimPrize',
                queryId: 0n,
            }
        );

        expect(result.transactions).toHaveTransaction({
            success: true,
        });

        // Winner should receive 95% of prize pool
        const expectedPrize = (prizePoolBefore * 95n) / 100n;
        const balanceAfter = await winnerContract.getBalance();
        
        // Account for gas costs
        expect(balanceAfter).toBeGreaterThan(balanceBefore);
    });

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    async function setupThreeParticipants() {
        await lottery.send(player1.getSender(), { value: toNano('1.0') }, {
            $$type: 'MsgEnterLottery', queryId: 0n
        });
        await lottery.send(player2.getSender(), { value: toNano('1.0') }, {
            $$type: 'MsgEnterLottery', queryId: 0n
        });
        await lottery.send(player3.getSender(), { value: toNano('1.0') }, {
            $$type: 'MsgEnterLottery', queryId: 0n
        });
    }

    async function setupAllCommitted() {
        await setupThreeParticipants();

        const secrets = {
            player1: Buffer.alloc(32, 1),
            player2: Buffer.alloc(32, 2),
            player3: Buffer.alloc(32, 3),
        };

        await lottery.send(player1.getSender(), { value: toNano('0.05') }, {
            $$type: 'MsgSubmitCommitment',
            queryId: 0n,
            commitmentHash: createCommitment(secrets.player1, player1.address),
        });

        await lottery.send(player2.getSender(), { value: toNano('0.05') }, {
            $$type: 'MsgSubmitCommitment',
            queryId: 0n,
            commitmentHash: createCommitment(secrets.player2, player2.address),
        });

        await lottery.send(player3.getSender(), { value: toNano('0.05') }, {
            $$type: 'MsgSubmitCommitment',
            queryId: 0n,
            commitmentHash: createCommitment(secrets.player3, player3.address),
        });

        return secrets;
    }

    async function setupAllRevealed() {
        const secrets = await setupAllCommitted();

        await lottery.send(player1.getSender(), { value: toNano('0.05') }, {
            $$type: 'MsgRevealCommitment',
            queryId: 0n,
            secret: BigInt('0x' + secrets.player1.toString('hex')),
        });

        await lottery.send(player2.getSender(), { value: toNano('0.05') }, {
            $$type: 'MsgRevealCommitment',
            queryId: 0n,
            secret: BigInt('0x' + secrets.player2.toString('hex')),
        });

        await lottery.send(player3.getSender(), { value: toNano('0.05') }, {
            $$type: 'MsgRevealCommitment',
            queryId: 0n,
            secret: BigInt('0x' + secrets.player3.toString('hex')),
        });
    }

    async function setupWinnerDetermined() {
        await setupAllRevealed();

        await lottery.send(player1.getSender(), { value: toNano('0.05') }, {
            $$type: 'MsgDrawWinner',
            queryId: 0n,
        });
    }
});

// ============================================================================
// CLIENT-SIDE EXAMPLE (How users would interact)
// ============================================================================

/**
 * Example of how a user would participate in the lottery
 */
class LotteryParticipant {
    private secret: Buffer;
    private address: Address;

    constructor(address: Address) {
        this.address = address;
        // Generate random secret
        this.secret = Buffer.from(createHash('sha256')
            .update(Math.random().toString())
            .digest());
    }

    // Step 1: Enter lottery
    async enter(lotteryContract: any, sender: any) {
        await lotteryContract.send(
            sender,
            { value: toNano('1.0') },
            {
                $$type: 'MsgEnterLottery',
                queryId: BigInt(Date.now()),
            }
        );
        console.log('✓ Entered lottery');
    }

    // Step 2: Commit hash of secret
    async commit(lotteryContract: any, sender: any) {
        const commitment = createCommitment(this.secret, this.address);
        
        await lotteryContract.send(
            sender,
            { value: toNano('0.05') },
            {
                $$type: 'MsgSubmitCommitment',
                queryId: BigInt(Date.now()),
                commitmentHash: commitment,
            }
        );
        
        console.log('✓ Committed:', commitment.toString(16));
        console.log('⚠ SAVE YOUR SECRET:', this.secret.toString('hex'));
    }

    // Step 3: Reveal secret
    async reveal(lotteryContract: any, sender: any) {
        await lotteryContract.send(
            sender,
            { value: toNano('0.05') },
            {
                $$type: 'MsgRevealCommitment',
                queryId: BigInt(Date.now()),
                secret: BigInt('0x' + this.secret.toString('hex')),
            }
        );
        
        console.log('✓ Revealed secret');
    }

    // Step 4: Check if won and claim
    async claimIfWinner(lotteryContract: any, sender: any) {
        const winner = await lotteryContract.getWinner();
        
        if (winner.equals(this.address)) {
            await lotteryContract.send(
                sender,
                { value: toNano('0.05') },
                {
                    $$type: 'MsgClaimPrize',
                    queryId: BigInt(Date.now()),
                }
            );
            console.log('🎉 Claimed prize!');
            return true;
        }
        
        console.log('😢 Did not win');
        return false;
    }
}

// Usage example:
/*
const participant = new LotteryParticipant(myAddress);
await participant.enter(lottery, sender);
// Wait for commit phase
await participant.commit(lottery, sender);
// Wait for reveal phase
await participant.reveal(lottery, sender);
// Wait for winner determination
await participant.claimIfWinner(lottery, sender);
*/
