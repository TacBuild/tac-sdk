import { Blockchain, createShardAccount, GetMethodError as SandboxGetMethodError } from '@ton/sandbox';
import { Address, beginCell, Cell, ComputeError, TonClient } from '@ton/ton';

import { testnet } from '../../artifacts';
import { JettonMinter } from '../../artifacts/mainnet/ton/internal/wrappers/JettonMinter';
import { sandboxOpener } from '../../src/adapters/SandboxOpener';
import { FT } from '../../src/assets/FT';
import type { IConfiguration } from '../../src/interfaces';
import { FIVE_MINUTES } from '../../src/sdk/Consts';
import { FTOriginAndData, Origin } from '../../src/structs/Struct';
import { buildJettonOnchainMetadata } from '../../src/wrappers/ContentUtils';

afterEach(() => jest.restoreAllMocks());

describe('FT display multiplier', () => {
    const address = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
    const getDisplayMultiplier = jest.fn();
    const getContractState = jest.fn();
    const minter = { getDisplayMultiplier } as unknown as FTOriginAndData['jettonMinter'];
    const config = {
        TONParams: { contractOpener: { open: () => minter, getContractState } },
        artifacts: { ton: { wrappers: { JettonMinter } } },
    } as unknown as IConfiguration;
    let now: number;

    beforeEach(() => {
        now = 1_000_000;
        jest.spyOn(Date, 'now').mockImplementation(() => now);
        getDisplayMultiplier.mockReset().mockResolvedValue({ numerator: 1000n, denominator: 1n });
        getContractState.mockReset().mockResolvedValue({ state: 'active' });
        jest.spyOn(FT, 'getOriginAndData').mockResolvedValue({
            origin: Origin.TON,
            jettonMinter: minter,
            jettonData: {
                totalSupply: 0n,
                mintable: false,
                content: buildJettonOnchainMetadata({ decimals: '9' }),
                walletCode: beginCell().endCell(),
            },
        });
    });

    it.each([
        [1000n, 1n, 10_000_000n],
        [1n, 1000n, 10_000_000_000_000n],
    ])('loads the %s/%s multiplier when creating an asset', async (numerator, denominator, rawAmount) => {
        getDisplayMultiplier.mockResolvedValue({ numerator, denominator });
        const ft = await FT.fromAddress(config, address);
        expect(getDisplayMultiplier).toHaveBeenCalledTimes(1);
        expect(ft.withAmount(10).rawAmount).toBe(rawAmount);
        expect(ft.clone.withAmount(10).rawAmount).toBe(rawAmount);
    });

    it.each([
        new Error('ETIMEDOUT'),
        Object.assign(new Error('Request failed with status code 429'), { response: { status: 429 } }),
        new ComputeError('Out of gas', 13),
        new ComputeError('Unable to execute get method', -256),
        new Error('Exit code: 110'),
        new Error('Request failed with status code 429: Exit code: 11'),
        Object.assign(new Error('Exit code: 11'), { response: { status: 429 } }),
        Object.assign(new Error('Unable to execute get method. Got exit_code: 11'), { code: 'ETIMEDOUT' }),
        new ComputeError('Exit code: 11', 13),
        new SandboxGetMethodError(11, 0n, '', '', ''),
        new Error('Exit code: 11'),
        new Error('Unable to execute get method. Got exit_code: 11'),
    ])('rejects asset creation when fetching the multiplier fails: %s', async (error) => {
        getDisplayMultiplier.mockRejectedValue(error);
        await expect(FT.fromAddress(config, address)).rejects.toBe(error);
    });

    it('does not refresh jettons without multiplier support', async () => {
        getDisplayMultiplier.mockRejectedValue(new ComputeError('Exit code: 11', 11));
        const ft = await FT.fromAddress(config, address);
        expect(ft.withAmount(10).rawAmount).toBe(10_000_000_000n);
        now += FIVE_MINUTES + 1;
        expect(ft.withAmount(10).rawAmount).toBe(10_000_000_000n);
        await ft.refreshDisplayMultiplier();
        await ft.clone.refreshDisplayMultiplier();
        expect(ft.withAmount(10).rawAmount).toBe(10_000_000_000n);
        expect(getDisplayMultiplier).toHaveBeenCalledTimes(1);
    });

    it('propagates untyped VM errors from a custom opener delegating to the native TonClient provider', async () => {
        const client = new TonClient({
            endpoint: 'https://rpc.example',
            httpAdapter: async (request) => ({
                data: { ok: true, result: { gas_used: 1, exit_code: 11, stack: [] } },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: request,
            }),
        });
        const customConfig = {
            ...config,
            TONParams: { ...config.TONParams, contractOpener: { open: client.open.bind(client), getContractState } },
        } as unknown as IConfiguration;
        await expect(FT.fromAddress(customConfig, address)).rejects.toThrow(
            'Unable to execute get method. Got exit_code: 11',
        );
    });

    it('reads the multiplier for TAC-origin jettons during creation and refresh', async () => {
        const evmAddress = '0x' + '11'.repeat(20);
        jest.spyOn(FT, 'getOriginAndData').mockResolvedValue({ origin: Origin.TAC, jettonMinter: minter, evmAddress });
        const ft = await FT.fromAddress({ ...config, nativeTACAddress: async () => evmAddress }, address);
        expect(ft.withAmount(10).rawAmount).toBe(10n ** 16n);
        expect(getDisplayMultiplier).toHaveBeenCalledTimes(1);
        expect(getContractState).toHaveBeenCalledTimes(1);

        getDisplayMultiplier.mockResolvedValue({ numerator: 2000n, denominator: 1n });
        await ft.refreshDisplayMultiplier();
        expect(ft.withAmount(10).rawAmount).toBe(5n * 10n ** 15n);
        expect(getDisplayMultiplier).toHaveBeenCalledTimes(2);
        expect(getContractState).toHaveBeenCalledTimes(1);
    });

    it('propagates state lookup errors for TAC-origin jettons', async () => {
        const evmAddress = '0x' + '11'.repeat(20);
        jest.spyOn(FT, 'getOriginAndData').mockResolvedValue({ origin: Origin.TAC, jettonMinter: minter, evmAddress });
        const error = new Error('ETIMEDOUT');
        getContractState.mockRejectedValue(error);
        await expect(FT.fromAddress({ ...config, nativeTACAddress: async () => evmAddress }, address)).rejects.toBe(
            error,
        );
        expect(getDisplayMultiplier).not.toHaveBeenCalled();
    });

    it.each([
        [1000n, new ComputeError('Exit code: 11', 11)],
        [1n, new ComputeError('Exit code: 11', 11)],
        [1000n, new Error('Exit code: 11')],
        [1000n, new Error('Unable to execute get method. Got exit_code: 11')],
    ] as const)('preserves a previously fetched multiplier and its age: %s/1, %s', async (numerator, error) => {
        getDisplayMultiplier.mockResolvedValue({ numerator, denominator: 1n });
        const ft = (await FT.fromAddress(config, address)).clone;
        now += 1000;
        getDisplayMultiplier.mockRejectedValue(error);
        await expect(ft.refreshDisplayMultiplier()).rejects.toBe(error);
        expect(ft.withAmount(10).rawAmount).toBe(10_000_000_000n / numerator);
        now += FIVE_MINUTES;
        await expect(ft.getUserBalance(address)).rejects.toBe(error);
        expect(getDisplayMultiplier).toHaveBeenCalledTimes(3);
    });

    it('uses the refreshed multiplier for new amounts without changing the previously set amount', async () => {
        const ft = (await FT.fromAddress(config, address)).withAmount(10);
        expect(ft.rawAmount).toBe(10_000_000n);
        now += FIVE_MINUTES + 1;
        expect(ft.withAmount(10).rawAmount).toBe(10_000_000n);
        expect(ft.withRawAmount(77n).rawAmount).toBe(77n);

        getDisplayMultiplier.mockResolvedValue({ numerator: 2000n, denominator: 1n });
        await ft.refreshDisplayMultiplier();
        expect(getDisplayMultiplier).toHaveBeenCalledTimes(2);
        expect(ft.rawAmount).toBe(10_000_000n);
        expect(ft.withAmount(10).rawAmount).toBe(5_000_000n);
        expect(ft.addAmount(10).rawAmount).toBe(15_000_000n);
    });
});

it('creates a TAC asset before its TON wrapper is deployed and checks support after deployment', async () => {
    const blockchain = await Blockchain.create();
    const evmAddress = '0x' + '11'.repeat(20);
    const minter = testnet.ton.wrappers.JettonMinter.createFromConfig(
        {
            totalSupply: 0n,
            adminAddress: new Address(0, Buffer.alloc(32, 7)),
            jettonWalletCode: Cell.fromHex(testnet.ton.compilationArtifacts.JettonWalletCompiled.hex),
            evmTokenAddress: evmAddress,
            content: beginCell().endCell(),
        },
        Cell.fromHex(testnet.ton.compilationArtifacts.JettonMinterCompiled.hex),
    );
    const config = {
        artifacts: testnet,
        nativeTACAddress: async () => evmAddress,
        TACParams: { tokenUtils: { 'exists(address)': async () => false } },
        TONParams: {
            contractOpener: sandboxOpener(blockchain),
            crossChainLayerAddress: new Address(0, Buffer.alloc(32, 7)).toString(),
            jettonMinterCode: minter.init!.code,
            jettonWalletCode: Cell.fromHex(testnet.ton.compilationArtifacts.JettonWalletCompiled.hex),
        },
    } as unknown as IConfiguration;
    const getContractState = jest.spyOn(config.TONParams.contractOpener, 'getContractState');
    const runGetMethod = jest.spyOn(blockchain, 'runGetMethod');
    const ft = await FT.fromAddress(config, evmAddress);
    expect(ft.withAmount(1).rawAmount).toBe(10n ** 18n);
    expect(getContractState).toHaveBeenCalledTimes(1);
    expect(runGetMethod).not.toHaveBeenCalled();
    await expect(ft.getUserBalanceExtended(minter.address.toString())).resolves.toEqual({ exists: false });
    expect(getContractState).toHaveBeenCalledTimes(2);
    expect(runGetMethod).not.toHaveBeenCalled();

    await expect(ft.refreshDisplayMultiplier()).rejects.toThrow('Trying to run get method on non-active contract');
    expect(getContractState).toHaveBeenCalledTimes(2);
    runGetMethod.mockClear();

    const clone = ft.clone;
    await blockchain.setShardAccount(minter.address, createShardAccount({ ...minter.init!, balance: 10n ** 9n }));
    await clone.refreshDisplayMultiplier();
    expect(runGetMethod).toHaveBeenCalledTimes(1);
    expect(runGetMethod.mock.calls[0][0].equals(minter.address)).toBe(true);
    expect(runGetMethod.mock.calls[0].slice(1)).toEqual(['get_display_multiplier', []]);
    await clone.refreshDisplayMultiplier();
    expect(runGetMethod).toHaveBeenCalledTimes(1);
    expect(getContractState).toHaveBeenCalledTimes(2);

    const deployed = await FT.fromAddress(config, evmAddress);
    expect(deployed.withAmount(1).rawAmount).toBe(10n ** 18n);
    expect(getContractState).toHaveBeenCalledTimes(3);
    await expect(FT.getOrigin(config, minter.address.toString())).resolves.toBe(Origin.TAC);
    expect(getContractState).toHaveBeenCalledTimes(4);
});
