import { Network, TacSdk } from '../../src';


async function measurePerformance() {
    console.log('Starting performance test...');

    const iterations = 10;
    const times = [];

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await TacSdk.create({
            network: Network.TESTNET,
        });

        const end = performance.now();
        const timeMs = end - start;
        times.push(timeMs);

        console.log(`Iteration ${i + 1}: ${timeMs.toFixed(2)}ms`);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    console.log('\n=== Performance Results ===');
    console.log(`Average time: ${avgTime.toFixed(2)}ms`);
    console.log(`Min time: ${minTime.toFixed(2)}ms`);
    console.log(`Max time: ${maxTime.toFixed(2)}ms`);
    console.log(`Total iterations: ${iterations}`);
}

measurePerformance().catch(console.error);