import { Cell, toNano } from '@ton/ton';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { RetryableContractOpener } from '../../src/adapters/retryableContractOpener';
import '@ton/test-utils';
import { UnstableContractOpener } from './unstableContractOpener';
import { testnet } from '@tonappchain/artifacts';

describe('RetryableContractOpener with Sandbox', () => {
    let blockchain: Blockchain;
    let jettonWallet: SandboxContract<testnet.ton.wrappers.JettonWallet>;
    let deployer: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        const jettonMaster = await blockchain.treasury('jettonMaster');

        const jettonWalletCode = Cell.fromHex(testnet.ton.compilationArtifacts.JettonWalletCompiled.hex);
        const config = {
            balance: 0,
            ownerAddress: deployer.address.toString(),
            jettonMasterAddress: jettonMaster.address.toString(),
            jettonWalletCode: jettonWalletCode,
        };

        jettonWallet = blockchain.openContract(
            testnet.ton.wrappers.JettonWallet.createFromConfig(config, jettonWalletCode),
        );

        await jettonWallet.sendReceive(jettonMaster.getSender(), toNano('0.01'), { jettonAmount: 1000 });
    });

    describe('multiple method calls with fallback', () => {
        it('should handle multiple sequential method calls correctly and wait retryDelay', async () => {
            const unstableOpener1 = new UnstableContractOpener('RPC1', blockchain, 10);
            const unstableOpener2 = new UnstableContractOpener('RPC2', blockchain, 3);
            const stableOpener = new UnstableContractOpener('RPC3', blockchain, 0);

            const retryableOpener = new RetryableContractOpener([
                { opener: unstableOpener1, retries: 2, retryDelay: 1000 },
                { opener: unstableOpener2, retries: 2, retryDelay: 1000 },
                { opener: stableOpener, retries: 1, retryDelay: 10 },
            ]);
            const contract = retryableOpener.open(jettonWallet);

            const startTime = Date.now();
            await contract.getJettonBalance();
            const endTime = Date.now();

            // 2 retries (2s) in unstableOpener1 + 2 retries (2s) in unstableOpener2
            expect(endTime - startTime).toBeGreaterThanOrEqual(4000);

            expect(unstableOpener1.callCounts.get('RPC1-getJettonBalance')).toBe(3);
            expect(unstableOpener2.callCounts.get('RPC2-getJettonBalance')).toBe(3);
            expect(stableOpener.callCounts.get('RPC3-getJettonBalance')).toBe(0);
        });

        it('should demonstrate each method call starts from first opener', async () => {
            const unstableOpener1 = new UnstableContractOpener('RPC1', blockchain, 10);
            const unstableOpener2 = new UnstableContractOpener('RPC2', blockchain, 10);
            const unstableOpener3 = new UnstableContractOpener('RPC3', blockchain, 10);
            const stableOpener = new UnstableContractOpener('RPC4', blockchain, 0);

            const retryableOpener = new RetryableContractOpener([
                { opener: unstableOpener1, retries: 2, retryDelay: 100 },
                { opener: unstableOpener2, retries: 2, retryDelay: 100 },
                { opener: unstableOpener3, retries: 2, retryDelay: 100 },
                { opener: stableOpener, retries: 1, retryDelay: 10 },
            ]);

            const contract = retryableOpener.open(jettonWallet);
            await contract.getJettonBalance();

            expect(unstableOpener1.callCounts.get('RPC1-getJettonBalance')).toBe(3);
            expect(unstableOpener2.callCounts.get('RPC2-getJettonBalance')).toBe(3);
            expect(unstableOpener3.callCounts.get('RPC3-getJettonBalance')).toBe(3);
            expect(stableOpener.callCounts.get('RPC4-getJettonBalance')).toBe(0);

            await contract.getWalletData();

            expect(unstableOpener1.callCounts.get('RPC1-getWalletData')).toBe(3);
            expect(unstableOpener2.callCounts.get('RPC2-getWalletData')).toBe(3);
            expect(unstableOpener3.callCounts.get('RPC3-getWalletData')).toBe(3);
            expect(stableOpener.callCounts.get('RPC4-getWalletData')).toBe(0);
        });

        it('should throw error when all openers fail', async () => {
            const failingOpener1 = new UnstableContractOpener('RPC1', blockchain, 10);
            const failingOpener2 = new UnstableContractOpener('RPC2', blockchain, 10);
            const failingOpener3 = new UnstableContractOpener('RPC2', blockchain, 10);

            const retryableOpener = new RetryableContractOpener([
                { opener: failingOpener1, retries: 3, retryDelay: 100 },
                { opener: failingOpener2, retries: 3, retryDelay: 100 },
                { opener: failingOpener3, retries: 3, retryDelay: 100 },
            ]);

            const contract = retryableOpener.open(jettonWallet);

            await expect(contract.getJettonBalance()).rejects.toThrow();

            expect(failingOpener1.callCounts.get('RPC1-getJettonBalance')).toBe(4);
            expect(failingOpener2.callCounts.get('RPC2-getJettonBalance')).toBe(4);
            expect(failingOpener3.callCounts.get('RPC2-getJettonBalance')).toBe(4);
        });
    });
});
