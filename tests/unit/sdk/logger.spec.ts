import { ConsoleLogger, NoopLogger } from '../../../src';

describe('Logger implementations', () => {
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
    const infoSpy = jest.spyOn(console, 'info').mockImplementation();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        debugSpy.mockRestore();
        infoSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('ConsoleLogger prepends level markers', () => {
        const logger = new ConsoleLogger();
        logger.debug('dbg');
        logger.info('inf', { ctx: 1 });
        logger.warn('warn');
        logger.error('err');

        expect(debugSpy).toHaveBeenCalledWith('[DEBUG]', 'dbg');
        expect(infoSpy).toHaveBeenCalledWith('[INFO]', 'inf', { ctx: 1 });
        expect(warnSpy).toHaveBeenCalledWith('[WARN]', 'warn');
        expect(errorSpy).toHaveBeenCalledWith('[ERROR]', 'err');
    });

    it('NoopLogger does nothing', () => {
        const logger = new NoopLogger();
        logger.debug('dbg');
        logger.info('inf');
        logger.warn('warn');
        logger.error('err');

        expect(debugSpy).not.toHaveBeenCalled();
        expect(infoSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });
});
