import { createDefaultRetryableOpener, RetryableContractOpener } from '../../../src/adapters/RetryableContractOpener';
import * as TonClient4OpenerModule from '../../../src/adapters/TonClient4Opener';
import * as TonClientOpenerModule from '../../../src/adapters/TonClientOpener';
import { ContractOpener, ILogger } from '../../../src/interfaces';
import { Network } from '../../../src/structs/Struct';

function createMockOpener(): ContractOpener {
    return {} as ContractOpener;
}

describe('createDefaultRetryableOpener logger', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('passes logger to underlying opener factories', async () => {
        const logger: ILogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };

        const tonClientLikeOpener = createMockOpener() as unknown as TonClientOpenerModule.TonClientOpener;
        const tonClient4LikeOpener = createMockOpener() as unknown as TonClient4OpenerModule.TonClient4Opener;
        const tonClientOpenerSpy = jest
            .spyOn(TonClientOpenerModule, 'tonClientOpener')
            .mockReturnValue(tonClientLikeOpener);
        const orbsOpenerSpy = jest.spyOn(TonClientOpenerModule, 'orbsOpener').mockResolvedValue(tonClientLikeOpener);
        const orbsOpener4Spy = jest
            .spyOn(TonClient4OpenerModule, 'orbsOpener4')
            .mockResolvedValue(tonClient4LikeOpener);

        const retryableOpener = await createDefaultRetryableOpener(
            'https://example.com',
            Network.TESTNET,
            1,
            1,
            logger,
        );

        expect(retryableOpener).toBeInstanceOf(RetryableContractOpener);
        expect(tonClientOpenerSpy).toHaveBeenCalledWith(expect.anything(), logger);
        expect(orbsOpenerSpy).toHaveBeenCalledWith(Network.TESTNET, logger);
        expect(orbsOpener4Spy).toHaveBeenCalledWith(Network.TESTNET, undefined, logger);
    });
});
