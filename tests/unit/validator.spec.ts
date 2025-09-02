import { Validator } from '../../src/sdk/Validator';

describe('Validator', () => {
    describe('validateEVMAddress', () => {
        it('should throw an error if the address is not a valid EVM address', () => {
            expect(() => Validator.validateEVMAddress('71c7656ec7ab88b098defb751b7401b5f6d8976f')).toThrow();
        });

        it('should not throw an error if the address is a valid EVM address', () => {
            expect(() => Validator.validateEVMAddress('0x71c7656ec7ab88b098defb751b7401b5f6d8976f')).not.toThrow();
        });
    });

    describe('validateTVMAddress', () => {
        it('should throw an error if the address is not a valid TVM address', () => {
            expect(() => Validator.validateTVMAddress('test')).toThrow();
        });

        it('should not throw an error if the address is a valid TVM address', () => {
            expect(() =>
                Validator.validateTVMAddress('EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK'),
            ).not.toThrow();
        });
    });
});
