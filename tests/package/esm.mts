import { type ITonConnectUI, Network, SenderFactory } from '@tonappchain/sdk';
import { dev, type NetworkArtifacts } from '@tonappchain/sdk/artifacts';
import type { IERC20WithDecimals } from '@tonappchain/sdk/artifacts/types/tac';
import type { JettonMinter } from '@tonappchain/sdk/artifacts/types/ton';

const network: Network = Network.TESTNET;
const artifacts: NetworkArtifacts = dev;
declare const tonConnect: ITonConnectUI;
declare const jettonMinter: JettonMinter;
declare const token: IERC20WithDecimals;
void [network, artifacts, tonConnect, jettonMinter, token, SenderFactory];
