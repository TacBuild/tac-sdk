import { TacSdk } from "../src";
import { Network, TacSDKTonClientParams } from "../src";

async function main() {
  const tonClientParams: TacSDKTonClientParams = {
    network: Network.Testnet,
    delay: 1,
  };
  const tacSdk = new TacSdk(tonClientParams);
  await tacSdk.init();

  const tvmTokenAddress = "EQBVRbJQ4ihedlSI10NzufGfrxGES_rwnRg3ynKsHd-zOPLM";

  const evmTokenAddress = await tacSdk.getEVMTokenAddress(
    tvmTokenAddress
  );

  console.log(evmTokenAddress);
}

main();
