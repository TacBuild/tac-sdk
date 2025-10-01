import { HighloadQueryId } from '../../../src';

describe('HighloadQueryId', () => {
    describe('constructor', () => {
        it('creates instance with default values', () => {
            const queryId = new HighloadQueryId();
            
            expect(queryId.getShift()).toBe(0n);
            expect(queryId.getBitNumber()).toBe(0n);
            expect(queryId.getQueryId()).toBe(0n);
            expect(queryId.toSeqno()).toBe(0n);
        });
    });

    describe('fromShiftAndBitNumber', () => {
        it('creates instance with valid shift and bitnumber', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(100n, 500n);
            
            expect(queryId.getShift()).toBe(100n);
            expect(queryId.getBitNumber()).toBe(500n);
        });

        it('creates instance with maximum valid values', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(8191n, 1022n);
            
            expect(queryId.getShift()).toBe(8191n);
            expect(queryId.getBitNumber()).toBe(1022n);
        });

        it('throws error for negative shift', () => {
            expect(() => HighloadQueryId.fromShiftAndBitNumber(-1n, 0n)).toThrow('invalid shift');
        });

        it('throws error for shift too large', () => {
            expect(() => HighloadQueryId.fromShiftAndBitNumber(8192n, 0n)).toThrow('invalid shift');
        });

        it('throws error for negative bitnumber', () => {
            expect(() => HighloadQueryId.fromShiftAndBitNumber(0n, -1n)).toThrow('invalid bitnumber');
        });

        it('throws error for bitnumber too large', () => {
            expect(() => HighloadQueryId.fromShiftAndBitNumber(0n, 1023n)).toThrow('invalid bitnumber');
        });
    });

    describe('getNext', () => {
        it('increments bitnumber when within range', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(0n, 100n);
            const next = queryId.getNext();
            
            expect(next.getShift()).toBe(0n);
            expect(next.getBitNumber()).toBe(101n);
        });

        it('resets bitnumber and increments shift when bitnumber exceeds max', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(0n, 1022n);
            const next = queryId.getNext();
            
            expect(next.getShift()).toBe(1n);
            expect(next.getBitNumber()).toBe(0n);
        });

        it('throws error when at maximum shift and near maximum bitnumber', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(8191n, 1021n);
            
            expect(() => queryId.getNext()).toThrow('Overload');
        });

        it('throws error when shift would exceed maximum', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(8191n, 1022n);
            
            expect(() => queryId.getNext()).toThrow('Overload');
        });
    });

    describe('hasNext', () => {
        it('returns true when not at the end', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(0n, 0n);
            
            expect(queryId.hasNext()).toBe(true);
        });

        it('returns true when at maximum shift but not maximum bitnumber', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(8191n, 1020n);
            
            expect(queryId.hasNext()).toBe(true);
        });

        it('returns false when at maximum shift and near maximum bitnumber', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(8191n, 1021n);
            
            expect(queryId.hasNext()).toBe(false);
        });

        it('returns false when at maximum values', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(8191n, 1022n);
            
            expect(queryId.hasNext()).toBe(false);
        });
    });

    describe('getQueryId', () => {
        it('calculates correct query ID from shift and bitnumber', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(1n, 500n);
            const expectedQueryId = (1n << 10n) + 500n; // shift << 10 + bitnumber
            
            expect(queryId.getQueryId()).toBe(expectedQueryId);
        });

        it('calculates query ID for zero values', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(0n, 0n);
            
            expect(queryId.getQueryId()).toBe(0n);
        });

        it('calculates query ID for maximum values', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(8191n, 1022n);
            const expectedQueryId = (8191n << 10n) + 1022n;
            
            expect(queryId.getQueryId()).toBe(expectedQueryId);
        });
    });

    describe('fromQueryId', () => {
        it('reconstructs HighloadQueryId from query ID', () => {
            const originalQueryId = HighloadQueryId.fromShiftAndBitNumber(100n, 500n);
            const queryIdValue = originalQueryId.getQueryId();
            const reconstructed = HighloadQueryId.fromQueryId(queryIdValue);
            
            expect(reconstructed.getShift()).toBe(100n);
            expect(reconstructed.getBitNumber()).toBe(500n);
        });

        it('handles zero query ID', () => {
            const reconstructed = HighloadQueryId.fromQueryId(0n);
            
            expect(reconstructed.getShift()).toBe(0n);
            expect(reconstructed.getBitNumber()).toBe(0n);
        });

        it('handles maximum query ID', () => {
            const maxQueryId = (8191n << 10n) + 1022n;
            const reconstructed = HighloadQueryId.fromQueryId(maxQueryId);
            
            expect(reconstructed.getShift()).toBe(8191n);
            expect(reconstructed.getBitNumber()).toBe(1022n);
        });
    });

    describe('fromSeqno', () => {
        it('creates HighloadQueryId from sequence number', () => {
            const seqno = 1523n; // 1 * 1023 + 500
            const queryId = HighloadQueryId.fromSeqno(seqno);
            
            expect(queryId.getShift()).toBe(1n);
            expect(queryId.getBitNumber()).toBe(500n);
        });

        it('handles zero sequence number', () => {
            const queryId = HighloadQueryId.fromSeqno(0n);
            
            expect(queryId.getShift()).toBe(0n);
            expect(queryId.getBitNumber()).toBe(0n);
        });

        it('handles sequence number that results in exact division', () => {
            const seqno = 1023n; // 1 * 1023 + 0
            const queryId = HighloadQueryId.fromSeqno(seqno);
            
            expect(queryId.getShift()).toBe(1n);
            expect(queryId.getBitNumber()).toBe(0n);
        });

        it('handles large sequence number', () => {
            const seqno = 10230n + 500n; // 10 * 1023 + 500
            const queryId = HighloadQueryId.fromSeqno(seqno);
            
            expect(queryId.getShift()).toBe(10n);
            expect(queryId.getBitNumber()).toBe(500n);
        });
    });

    describe('toSeqno', () => {
        it('converts to sequence number correctly', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(1n, 500n);
            const expectedSeqno = 500n + 1n * 1023n;
            
            expect(queryId.toSeqno()).toBe(expectedSeqno);
        });

        it('converts zero values to zero seqno', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(0n, 0n);
            
            expect(queryId.toSeqno()).toBe(0n);
        });

        it('converts maximum values correctly', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(8191n, 1022n);
            const expectedSeqno = 1022n + 8191n * 1023n;
            
            expect(queryId.toSeqno()).toBe(expectedSeqno);
        });
    });

    describe('round-trip conversions', () => {
        it('fromSeqno and toSeqno are inverse operations', () => {
            const originalSeqno = 12345n;
            const queryId = HighloadQueryId.fromSeqno(originalSeqno);
            const reconstructedSeqno = queryId.toSeqno();
            
            expect(reconstructedSeqno).toBe(originalSeqno);
        });

        it('fromQueryId and getQueryId are inverse operations', () => {
            const originalId = 123456n;
            const queryId = HighloadQueryId.fromQueryId(originalId);
            const reconstructedId = queryId.getQueryId();
            
            expect(reconstructedId).toBe(originalId);
        });

        it('maintains consistency across multiple getNext calls', () => {
            let queryId = HighloadQueryId.fromShiftAndBitNumber(0n, 0n);
            
            for (let i = 0; i < 5; i++) {
                expect(queryId.hasNext()).toBe(true);
                const nextQueryId = queryId.getNext();
                expect(nextQueryId.getBitNumber()).toBe(BigInt(i + 1));
                queryId = nextQueryId;
            }
        });
    });

    describe('edge cases', () => {
        it('handles boundary values correctly', () => {
            // Test at the boundary where bitnumber wraps
            const queryId = HighloadQueryId.fromShiftAndBitNumber(5n, 1022n);
            const next = queryId.getNext();
            
            expect(next.getShift()).toBe(6n);
            expect(next.getBitNumber()).toBe(0n);
        });

        it('correctly identifies near-end state', () => {
            const queryId = HighloadQueryId.fromShiftAndBitNumber(8191n, 1020n);
            
            expect(queryId.hasNext()).toBe(true);
            
            const next = queryId.getNext();
            expect(next.hasNext()).toBe(false);
        });
    });
});