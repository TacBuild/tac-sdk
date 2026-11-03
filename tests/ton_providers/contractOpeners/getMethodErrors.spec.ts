import { Address, beginCell, Cell, ComputeError, ContractProvider, TupleItem } from '@ton/ton';

import { testnet } from '../../../artifacts';
import { JettonMinter } from '../../../artifacts/testnet/ton/internal/wrappers/JettonMinter';
import { LiteClientOpener } from '../../../src/adapters/LiteClientOpener';
import { TonClient4Opener } from '../../../src/adapters/TonClient4Opener';
import { TonClientOpener } from '../../../src/adapters/TonClientOpener';
import { FT } from '../../../src/assets/FT';
import { ContractOpener, IConfiguration } from '../../../src/interfaces';
import { Network } from '../../../src/structs/Struct';

const address = Address.parse('kQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOti_');
const scaledAddress = Address.parse('kQCKTsrGef-SGeH-dXq3QhsgORVWDU7GOHzSlGkFc9BdUo_v');
const contract = {
    address,
    async getResult(provider: ContractProvider, method: string, args: TupleItem[] = []) {
        return provider.get(method, args);
    },
};

describe.each([
    {
        name: 'TonClient',
        create: async () =>
            TonClientOpener.create(new URL('api/v2/jsonRPC', testnet.TON_RPC_ENDPOINT_BY_TAC).toString()),
    },
    { name: 'TonClient4', create: async () => TonClient4Opener.create('https://testnet-v4.tonhubapi.com') },
    { name: 'LiteClient', create: () => LiteClientOpener.create({ network: Network.TESTNET }) },
])('$name getter errors on testnet', ({ create }) => {
    let opener: ContractOpener;

    beforeAll(async () => {
        opener = await create();
        expect((await opener.getContractState(address)).state).toBe('active');
    }, 60000);

    afterAll(() => opener?.closeConnections?.());

    it('reads existing jetton getters and passes cell arguments', async () => {
        const jetton = opener.open(JettonMinter.createFromAddress(address));
        const data = await jetton.getJettonData();
        expect(typeof data.totalSupply).toBe('bigint');
        const result = await opener
            .open(contract)
            .getResult('get_wallet_address', [{ type: 'slice', cell: beginCell().storeAddress(address).endCell() }]);
        expect(result.stack.readAddress().equals(await jetton.getWalletAddress(address))).toBe(true);
    }, 60000);

    it.each(['get_display_multiplier', 'get_codex_nonexistent_20260929'])(
        'returns numeric exit code 11 for absent %s',
        async (method) => {
            await expect(opener.open(contract).getResult(method)).rejects.toMatchObject({
                constructor: ComputeError,
                exitCode: 11,
            });
        },
        60000,
    );

    it('preserves exit code 2 for an existing getter called without arguments', async () => {
        await expect(opener.open(contract).getResult('get_wallet_address')).rejects.toMatchObject({ exitCode: 2 });
    }, 60000);

    it.each([address, scaledAddress])(
        'creates FT with the live multiplier for %s',
        async (jettonAddress) => {
            const config = {
                artifacts: testnet,
                TONParams: {
                    contractOpener: opener,
                    jettonMinterCode: Cell.fromHex(testnet.ton.compilationArtifacts.JettonMinterCompiled.hex),
                },
            } as unknown as IConfiguration;
            const ft = await FT.fromAddress(config, jettonAddress.toString());
            const multiplier = jettonAddress.equals(scaledAddress)
                ? await opener.open(JettonMinter.createFromAddress(jettonAddress)).getDisplayMultiplier()
                : { numerator: 1n, denominator: 1n };
            const { numerator, denominator } = multiplier;
            expect(numerator).toBeGreaterThan(0n);
            expect(denominator).toBeGreaterThan(0n);
            if (jettonAddress.equals(scaledAddress)) {
                expect(numerator).not.toBe(denominator);
            }
            const displayAmount = 10n * 10n ** BigInt(await ft.getDecimals());
            expect(ft.withAmount(10).rawAmount).toBe((displayAmount * denominator + numerator / 2n) / numerator);
            await ft.refreshDisplayMultiplier();
            expect(ft.toDisplayAmount(denominator)).toBe(numerator);
        },
        60000,
    );
});
