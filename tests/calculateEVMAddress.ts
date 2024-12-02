import {Network, TacSdk, TacSDKTonClientParams} from "../src";

async function main() {
    const tonClientParams: TacSDKTonClientParams = {
        network: Network.Testnet,
        delay: 3,
    };
    const tacSdk = new TacSdk(tonClientParams);

    console.log(await tacSdk.calculateEVMTokenAddress('EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1'));
}

main();
