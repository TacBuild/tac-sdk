import { TacSdk } from "../src/ton/sdk/TacSdk";
import { Network, TacSDKTonClientParams } from "../src/ton/structs/Struct";

async function main() {
  const tonClientParams: TacSDKTonClientParams = {
    network: Network.Testnet,
    delay: 3,
  };
  const tacSdk = new TacSdk(tonClientParams);

  const tvmTokenAddress = "EQBVRbJQ4ihedlSI10NzufGfrxGES_rwnRg3ynKsHd-zOPLM";

  const evmTokenAddress = await tacSdk.calculateEVMTokenAddress(
    tvmTokenAddress
  );

  console.log(evmTokenAddress);
}

main();
