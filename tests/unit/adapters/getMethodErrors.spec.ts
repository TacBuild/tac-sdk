import { Blockchain, GetMethodError, TreasuryContract } from '@ton/sandbox';
import {
    Address,
    beginCell,
    ComputeError,
    ContractProvider,
    Sender,
    serializeTuple,
    toNano,
    TonClient,
    TonClient4,
    TupleItem,
    TupleReader,
} from '@ton/ton';

import { LiteClientOpener } from '../../../src/adapters/LiteClientOpener';
import { RetryableContractOpener } from '../../../src/adapters/RetryableContractOpener';
import { SandboxOpener } from '../../../src/adapters/SandboxOpener';
import { TonClient4Opener } from '../../../src/adapters/TonClient4Opener';
import { TonClientOpener } from '../../../src/adapters/TonClientOpener';

const address = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
const contract = {
    address,
    init: { code: beginCell().endCell(), data: beginCell().endCell() },
    async getValue(provider: ContractProvider, args: TupleItem[] = []): Promise<bigint> {
        return (await provider.get('get_value', args)).stack.readBigNumber();
    },
    async getNestedValue(provider: ContractProvider): Promise<bigint> {
        return provider.open(contract).getValue();
    },
    async sendTest(provider: ContractProvider, sender: Sender): Promise<void> {
        return provider.internal(sender, { value: 1n });
    },
};

function createOpener(kind: string) {
    const provider = { internal: jest.fn().mockResolvedValue(undefined) };
    const runMethod = jest.fn().mockImplementation(async () => {
        const values: TupleItem[] = [{ type: 'int', value: 42n }];
        return {
            exit_code: 0,
            exitCode: 0,
            stack: new TupleReader(values),
            reader: new TupleReader(values),
            result: kind === 'LiteClient' ? serializeTuple(values).toBoc().toString('base64') : values,
        };
    });
    const client = {
        provider: jest.fn().mockReturnValue(provider),
        runMethod,
        runMethodWithError: runMethod,
        getLastBlock: jest.fn().mockResolvedValue({ last: { seqno: 123 } }),
        getMasterchainInfo: jest.fn().mockResolvedValue({ last: { seqno: 123 } }),
    };
    const LiteOpener = LiteClientOpener as unknown as {
        new (client: unknown, engine: { close: () => void }): LiteClientOpener;
    };
    const opener =
        kind === 'TonClient'
            ? new TonClientOpener(client as unknown as TonClient)
            : kind === 'TonClient4'
              ? new TonClient4Opener(client as unknown as TonClient4)
              : new LiteOpener(client, { close: () => undefined });
    return { opener, client, provider, runMethod };
}

describe.each(['TonClient', 'TonClient4', 'LiteClient'])('%s getter errors', (kind) => {
    it('preserves the result, arguments and contract init', async () => {
        const { opener, client, runMethod } = createOpener(kind);
        const args: TupleItem[] = [
            { type: 'int', value: 123n },
            { type: 'slice', cell: beginCell().storeAddress(address).endCell() },
        ];
        expect(await opener.open(contract).getValue(args)).toBe(42n);
        expect(client.provider).toHaveBeenCalledWith(address, contract.init);
        const call = runMethod.mock.calls[0];
        if (kind === 'LiteClient') {
            expect(call).toEqual([
                address,
                'get_value',
                serializeTuple(args).toBoc({ idx: false, crc32: false }),
                { seqno: 123 },
            ]);
        } else if (kind === 'TonClient4') {
            expect(call).toEqual([123, address, 'get_value', args]);
        } else {
            expect(call).toEqual([address, 'get_value', args]);
        }
    });

    it.each([11, 2, 13, -256])('preserves numeric exit code %s in ComputeError', async (exitCode) => {
        const { opener, runMethod } = createOpener(kind);
        runMethod.mockResolvedValue({ exitCode, exit_code: exitCode });
        await expect(opener.open(contract).getValue()).rejects.toBeInstanceOf(ComputeError);
        await expect(opener.open(contract).getNestedValue()).rejects.toMatchObject({ exitCode });
    });

    it('accepts alternative successful exit code 1', async () => {
        const { opener, runMethod } = createOpener(kind);
        const result = await runMethod();
        runMethod.mockResolvedValue({ ...result, exitCode: 1, exit_code: 1 });
        expect(await opener.open(contract).getValue()).toBe(42n);
    });

    it('propagates transport errors unchanged', async () => {
        const { opener, runMethod } = createOpener(kind);
        const error = Object.assign(new Error('Request failed'), { response: { status: 429 } });
        runMethod.mockRejectedValue(error);
        await expect(opener.open(contract).getValue()).rejects.toBe(error);
    });

    it('preserves sender calls through the original provider', async () => {
        const { opener, provider } = createOpener(kind);
        const sender = { send: jest.fn() };
        await opener.open(contract).sendTest(sender);
        expect(provider.internal).toHaveBeenCalledWith(sender, { value: 1n });
    });

    it('retries HTTP 429 through RetryableContractOpener', async () => {
        const { opener, runMethod } = createOpener(kind);
        runMethod.mockRejectedValueOnce(Object.assign(new Error('Request failed'), { response: { status: 429 } }));
        const retryable = new RetryableContractOpener([{ opener, retries: 1, retryDelay: 0 }]);
        expect(await retryable.open(contract).getValue()).toBe(42n);
        expect(runMethod).toHaveBeenCalledTimes(2);
    });

    it('does not retry or fall back on a numeric VM error', async () => {
        const { opener, runMethod } = createOpener(kind);
        const fallback = createOpener(kind);
        runMethod.mockResolvedValue({ exitCode: 11, exit_code: 11 });
        const retryable = new RetryableContractOpener([
            { opener, retries: 2, retryDelay: 0 },
            { opener: fallback.opener, retries: 2, retryDelay: 0 },
        ]);
        await expect(retryable.open(contract).getValue()).rejects.toMatchObject({ exitCode: 11 });
        expect(runMethod).toHaveBeenCalledTimes(1);
        expect(fallback.runMethod).not.toHaveBeenCalled();
    });
});

describe('Sandbox getter errors', () => {
    it('normalizes VM errors and preserves their logs', async () => {
        const blockchain = await Blockchain.create();
        const treasury = await blockchain.treasury('getter-errors');
        const nativeError = await blockchain.runGetMethod(treasury.address, 'get_value').catch((error) => error);
        expect(nativeError).toBeInstanceOf(GetMethodError);

        const opener = new SandboxOpener(blockchain);
        const error = await opener
            .open({ ...contract, address: treasury.address })
            .getValue()
            .catch((error) => error);
        expect(error).toBeInstanceOf(ComputeError);
        expect(error).toMatchObject({
            exitCode: 11,
            logs: nativeError.vmLogs,
            debugLogs: nativeError.debugLogs || null,
        });
    });

    it('propagates ordinary getter errors unchanged', async () => {
        const opener = new SandboxOpener(await Blockchain.create());
        const error = new Error('Getter failed');
        const opened = opener.open({
            address,
            getValue: jest.fn<Promise<bigint>, [ContractProvider]>().mockRejectedValue(error),
        });
        await expect(opened.getValue()).rejects.toBe(error);
    });

    it('preserves synchronous getters and sandbox send results', async () => {
        const blockchain = await Blockchain.create();
        const treasury = await blockchain.treasury('sender');
        const opener = new SandboxOpener(blockchain);
        const opened = opener.open(TreasuryContract.create(treasury.address.workChain, treasury.subwalletId));
        const sender = opened.getSender();
        expect(sender.address.equals(treasury.address)).toBe(true);
        expect(typeof sender.send).toBe('function');
        await expect(opened.getBalance()).resolves.toBeGreaterThan(0n);

        const result = await opened.send({ to: address, value: toNano('1'), bounce: false });
        expect(result.transactions).toHaveLength(2);
        expect((await blockchain.getContract(address)).balance).toBe(toNano('1'));
    });
});
