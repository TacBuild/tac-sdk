import { Address, beginCell } from '@ton/ton';
import { ethers } from 'ethers';

import type { Asset } from '../../../src';
import { AssetType, ValidExecutors } from '../../../src';
import * as Utils from '../../../src/sdk/Utils';

// Mock the generateRandomNumberByTimestamp function
jest.mock('../../../src/sdk/Utils', () => {
    const actualUtils = jest.requireActual('../../../src/sdk/Utils');
    return {
        ...actualUtils,
        generateRandomNumberByTimestamp: jest.fn().mockReturnValue({
            timestamp: 1_700_000_000,
            randomNumber: 1_700_000_123,
        }),
    };
});

const {
    aggregateTokens,
    buildEvmDataCell,
    calculateEVMTokenAddress,
    convertKeysToCamelCase,
    formatObjectForLogging,
    formatSolidityMethodName,
    generateTransactionLinker,
    getAddressString,
    getBouncedAddress,
    getNumber,
    getString,
    mapAssetsToTonAssets,
    sha256toBigInt,
    sleep,
} = Utils;

class FakeFTAsset implements Asset {
    constructor(
        public address: string,
        public rawAmount: bigint,
        makeClone = true,
    ) {
        this.type = AssetType.FT;
        if (makeClone) {
            this.clone = new FakeFTAsset(address, rawAmount, false);
        } else {
            this.clone = this;
        }
    }
    type: AssetType;
    clone: Asset;
    withAmount(): Asset {
        return new FakeFTAsset(this.address, this.rawAmount);
    }
    withRawAmount(amount: bigint): Asset {
        return new FakeFTAsset(this.address, amount);
    }
    addAmount(): Asset {
        return new FakeFTAsset(this.address, this.rawAmount);
    }
    addRawAmount(amount: bigint): Asset {
        return new FakeFTAsset(this.address, this.rawAmount + amount);
    }
    async getEVMAddress(): Promise<string> {
        return `evm-${this.address || 'ton'}`;
    }
    async getTVMAddress(): Promise<string> {
        return this.address;
    }
    async generatePayload(): Promise<never> {
        throw new Error('not used in tests');
    }
    async checkCanBeTransferredBy(): Promise<void> {
        return;
    }
    async getBalanceOf(): Promise<bigint> {
        return this.rawAmount;
    }
}

class FakeNFTAsset extends FakeFTAsset {
    addresses = { index: 5n };
    constructor(address: string, makeClone = true) {
        super(address, 1n, false);
        this.type = AssetType.NFT;
        if (makeClone) {
            this.clone = new FakeNFTAsset(address, false);
        } else {
            this.clone = this;
        }
    }
    withAmount(): Asset {
        return new FakeNFTAsset(this.address);
    }
    withRawAmount(): Asset {
        return new FakeNFTAsset(this.address);
    }
    addAmount(): Asset {
        return new FakeNFTAsset(this.address);
    }
    addRawAmount(): Asset {
        return new FakeNFTAsset(this.address);
    }
}

describe('Utils helpers', () => {
    describe('formatSolidityMethodName', () => {
        it('returns empty string when no method provided', () => {
            expect(formatSolidityMethodName()).toBe('');
        });

        it('normalizes signature without calldata parameters', () => {
            expect(formatSolidityMethodName('bridge')).toBe('bridge(bytes,bytes)');
        });

        it('keeps fully specified signature intact', () => {
            expect(formatSolidityMethodName('bridge(bytes,bytes)')).toBe('bridge(bytes,bytes)');
        });

        it('throws for invalid method name', () => {
            expect(() => formatSolidityMethodName('not valid signature(')).toThrow(/Invalid Solidity method name/);
        });
    });

    it('generateTransactionLinker derives deterministic fields', () => {
        const linker = generateTransactionLinker('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N', 2);

        expect(linker.caller).toContain('EQ');
        expect(linker.shardCount).toBe(2);
        expect(linker.timestamp).toBeGreaterThan(0);
        expect(linker.shardsKey).toMatch(/^\d+$/);
    });

    it('buildEvmDataCell serializes request payload', () => {
        const evmProxyMsg = {
            evmTargetAddress: '0x1234',
            methodName: 'handle(bytes,bytes)',
            encodedParameters: '0x01',
            gasLimit: 123n,
        };
        const transactionLinker = { shardCount: 1, shardsKey: '42', caller: 'caller', timestamp: 1 };
        const executors: ValidExecutors = { tac: ['0xabc'], ton: ['addr'] };

        const cell = buildEvmDataCell(transactionLinker, evmProxyMsg, executors);
        const payload = cell.beginParse().loadStringTail();

        const parsed = JSON.parse(payload);
        expect(parsed.evmCall.target).toBe('0x1234');
        expect(parsed.evmCall.gasLimit).toBe(123);
        expect(parsed.shardsKey).toBe('42');
        expect(parsed.evmValidExecutors).toEqual(['0xabc']);
        expect(parsed.tvmValidExecutors).toEqual(['addr']);
    });

    it('calculateEVMTokenAddress derives deterministic create2 address', () => {
        const abiCoder = new ethers.AbiCoder();
        const result = calculateEVMTokenAddress(
            abiCoder,
            '0x00000000000000000000000000000000000000aa',
            '0x60006000',
            '0x00000000000000000000000000000000000000bb',
            '0:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        );

        expect(result).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('convertKeysToCamelCase transforms nested objects', () => {
        const data = {
            outer_key: 1,
            inner: [{ nested_key: 2 }],
        };

        expect(convertKeysToCamelCase(data)).toEqual({
            outerKey: 1,
            inner: [{ nestedKey: 2 }],
        });
    });

    it('sleep resolves after duration', async () => {
        jest.useFakeTimers();
        const promise = sleep(1000);
        jest.advanceTimersByTime(1000);
        await expect(promise).resolves.toBeUndefined();
        jest.useRealTimers();
    });

    it('formatObjectForLogging stringifies bigint values', () => {
        const payload = { amount: 10n, nested: { other: 2n } };
        expect(formatObjectForLogging(payload)).toBe('{"amount":"10","nested":{"other":"2"}}');
    });

    it('aggregateTokens and mapAssetsToTonAssets normalize asset collections', () => {
        const tonAsset = new FakeFTAsset('', 5n);
        const jettonA1 = new FakeFTAsset('jettonA', 10n);
        const jettonA2 = new FakeFTAsset('jettonA', 15n);
        const nft = new FakeNFTAsset('nft1');

        const aggregated = aggregateTokens([tonAsset, jettonA1, jettonA2, nft]);
        expect(aggregated.jettons).toHaveLength(1);
        expect(aggregated.jettons[0].rawAmount).toBe(25n);
        expect(aggregated.nfts).toHaveLength(1);
        expect(aggregated.ton?.rawAmount).toBe(5n);

        const tonAssets = mapAssetsToTonAssets([tonAsset, jettonA1, jettonA2, nft]);
        expect(tonAssets).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ tokenAddress: '', amount: '5', assetType: AssetType.FT }),
                expect.objectContaining({ tokenAddress: 'jettonA', amount: '25', assetType: AssetType.FT }),
                expect.objectContaining({ tokenAddress: 'nft1', amount: '1', assetType: AssetType.NFT }),
            ]),
        );
    });

    it('getBouncedAddress returns bounceable string representation', () => {
        const friendlyAddress = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
        const bounced = getBouncedAddress(friendlyAddress);
        expect(bounced).toMatch(/^EQ/);
    });

    it('sha256toBigInt returns positive bigint', () => {
        expect(sha256toBigInt('CrossChainLayer')).toBeGreaterThan(0n);
    });

    it('getAddressString, getNumber and getString extract data from cells', () => {
        const address = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
        const cellWithAddress = beginCell().storeAddress(Address.parse(address)).endCell();
        expect(getAddressString(cellWithAddress)).toBe(address);

        const numberCell = beginCell().storeUint(42, 16).endCell();
        expect(getNumber(16, numberCell)).toBe(42);

        const stringCell = beginCell().storeStringTail('hello').endCell();
        expect(getString(stringCell)).toBe('hello');
    });
});
