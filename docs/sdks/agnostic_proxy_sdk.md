# AgnosticProxy SDK

A comprehensive TypeScript SDK for building complex DeFi operations using the AgnosticProxy contract with dynamic value replacement capabilities and advanced visualization tools.
This tool serves as a utility to communicate with Agnostic proxy via Tac sdk. End goal is to make your life easier while constructing calldata for AgnosticProxy

The philosophy behind Agnostic proxy is to make development process on tac more reactive. Constructing a proxy for an application 
might be time consuming and not the easiest process. With Agnostic proxy we want to provide a way, to move business logic out of
proxy contract to front/back. For some projects this maybe more handy way, since there is no need to audit a proxy contract. 
What you need to do is just to adapt your existing front/back code with this tool. And Dynamic replacement feature will provide you an opportunity to concatenate complex transactions into one. 

## Features

- 🔄 **Dynamic Value Replacement**: Automatically replace parameter values with token balances at execution time
- 🎯 **Efficient Hook System**: Support for Custom, FullBalanceApprove, and FullBalanceTransfer hooks with optimized encoding
- 🔗 **Complex Operations**: Chain multiple DeFi operations with interdependent values
- 🎨 **Advanced Visualization**: Human-readable chain visualization and debugging tools
- 🧮 **Dynamic Value Calculations**: Precise parameter position and length calculations for dynamic value replacements
- 🛡️ **Type Safety**: Full TypeScript support with proper interfaces
- 📊 **Performance Analytics**: Gas estimation, size comparison, and efficiency metrics
- 🔍 **Smart Account Integration**: Built-in TVM wallet and smart account address management

## Table of Contents

- [🚀 Quick Start](#quick-start)
- [📋 Full Usage Example With TacSdk](#full-usage-example-with-tac-sdk-integration)
- [🧠 Core Concepts](#core-concepts)
- [📄 ABI Support](#abi-support)
- [📖 API Reference](#api-reference)
- [💡 Examples](#examples)
- [🔧 Advanced Usage](#advanced-usage)
- [🧮 Replacement Calculator Tools](#-replacement-calculator-tools)
- [🌉 Bridge Integration](#bridge-integration)
- [❌ Error Handling](#error-handling)
- [✅ Best Practices](#best-practices)
- [🔧 Troubleshooting](#troubleshooting)

## Quick Start

```typescript
import { AgnosticProxySDK, Network } from "@tonappchain/sdk";
import { ethers } from "ethers"

// Create SDK instance
const sdk = new AgnosticProxySDK(Network.MAINNET);

// Code for initializing TacSdk
// const tacSdk = ...


// Add contract interfaces
sdk.addContractInterface(ROUTER_ADDRESS, ROUTER_ABI);
sdk.addContractInterface(STAKING_ADDRESS, STAKING_ABI);

const agnosticCallParams = sdk.getAgnosticCallParams()

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
// Create hooks
const hooks = [
    sdk.createFullBalanceApproveHook(TOKEN_IN, ROUTER_ADDRESS, true),
    sdk.createCustomHook(ROUTER_ADDRESS, "swapExactTokensForTokens", [
        ethers.parseEther("100"), // amount in
        ethers.parseEther("90"),  // min amount out
        [TOKEN_IN, TOKEN_OUT],
        tacSdk.getSmartAccountAddressForTvmWallet(TVM_WALLET_ADDRESS, agnosticCallParams.evmTargetAddress),
        Math.floor(Date.now() / 1000) + 3600
    ])
];

// Build ZapCall
const zapCall = sdk.buildZapCall(hooks, [TOKEN_OUT], []);

// 🎨 Visualize the operation chain
sdk.visualizeZapCall(zapCall);

// Encode for transaction
const encodedCall = sdk.encodeZapCall(zapCall);
```

## Full Usage Example with Tac SDK integration 

Here's a comprehensive example showing AgnosticSDK usage with TacSDK
You can retreive Agnostic SDK from TacSDK *@tonappchain/sdk*

```typescript
import { ethers } from "ethers";
import { AgnosticProxySDK } from "./AgnosticProxySDK";
import { Network, SenderFactory, TacSdk, type EvmProxyMsg, type AssetBridgingData, type SDKParams, AgnosticProxySDK } from '@tonappchain/sdk';
import { TonConnectUI } from '@tonconnect/ui';



// Contract addresses
const CONTRACTS = {
    UNISWAP_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    STAKING: "0xc00e94Cb662C3520282E6f5717214004A7f26888",
};

const TOKENS = {
    USDC: "0xA0b86a33E6417aB8C6C2C4e6C1F7A6D8E9F2B3C4",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    STAKE_SHARE_TOKEN: "0xA0b86a33E6417aB8C6C2C4e6C1F7A6D8E9F2B3C4"
};

// ABIs
const UNISWAP_ROUTER_ABI = [
    "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)"
];

const STAKING_CONTRACT_ABI = [
    "function stake(uint256 amount) external"
];

async function executeCompleteStrategy() {
    console.log("🚀 Starting Complete Strategy with TacSDK");
    const sdkParams: SDKParams = {
        network: Network.MAINNET
    };
    const tacSdk = await TacSdk.create(sdkParams);

    const tonConnectUI = new TonConnectUI({
        manifestUrl: config.tonconnectManifestUrl as string
    });

    const sender = await SenderFactory.getSender({
        tonConnect: tonConnectUI
    });

    const tvmWalletAddress = sender.getSenderAddress();

    // Initialize SDK
    // Here we will use deployed by TAC Agnostic proxy and TAC Smart Account Factory. 
    // If you want to use your own, just provide addresses inside constructor.
    const agnosticSdk = new AgnosticProxySDK(Network.MAINNET);
    const agnosticCallParams = agnosticSdk.getAgnosticCallParams()
    
    // Register contract interfaces
    agnosticSdk.addContractInterface(CONTRACTS.UNISWAP_ROUTER, UNISWAP_ROUTER_ABI);
    agnosticSdk.addContractInterface(CONTRACTS.COMPOUND_STAKING, STAKING_CONTRACT_ABI);

    // Build complex strategy: USDC → WETH → Stake
    const hooks = [];

    // All money flows will be done through smart account to avoid potential money leaks.
    const smartAccountAddress = await tacSdk.getSmartAccountAddressForTvmWallet(tvmWalletAddress, agnosticCallParams.evmTargetAddress);

    // All incoming money on the moment of transaction executing are inside agnostic proxy, so
    // we should transfer them to smart account proxy, thats why last param is set to false.
    // This action will be done from proxy perspective, so, proxy will transfer money to smart account
    hooks.push(agnosticSdk.createFullBalanceTransferHook(TOKENS.USDC, smartAccountAddress, false));

    // Approve USDC for Uniswap from smart account perspective
    hooks.push(agnosticSdk.createFullBalanceApproveHook(TOKENS.USDC, CONTRACTS.UNISWAP_ROUTER, true));

    // Swap USDC to WETH from smart account perspective
    hooks.push(agnosticSdk.createCustomHook(
        CONTRACTS.UNISWAP_ROUTER,
        "swapExactTokensForTokens",
        [
            ethers.parseUnits("2000", 6), // 2000 USDC
            ethers.parseEther("1"), // min 1 WETH
            [TOKENS.USDC, TOKENS.WETH],
            smartAccountAddress,
            Math.floor(Date.now() / 1000) + 3600
        ],
        {
            isFromSAPerspective: true
        }
    ));

    // Approve WETH for staking. Staking here is an just example contract.
    hooks.push(agnosticSdk.createFullBalanceApproveHook(TOKENS.WETH, CONTRACTS.STAKING, true));

    // Stake WETH tokens (dynamic amount). Here we will use dynamic replacement, since we don't know 
    // exact amount of tokens that we will have after swap due to slippage.
    const replacement1 = agnosticSdk.createAmountReplacement(0, TOKENS.WETH, EVM_RECEIVER_ADDRESS);

    // Previous method is more advanced usage. We can do the same in a more native way
    const replacement2 = agnosticSdk.calculateReplacementData(
        CONTRACTS.STAKING,
        "stake", // function name
        "amount", // parameter name
        TOKENS.WETH, // token wich balance will be ftched
        smartAccountAddress // Holder of the token, in our case all actions are done via smart account
    );

    // Also there is very handy and interactive tool to build replacement data
    const replacement3 = agnosticSdk.buildReplacementInteractive(
        CONTRACTS.STAKING,
        "stake",
        "amount",
        TOKENS.WETH,
        smartAccountAddress,
        {
            showCalculation: true,
            validate: true
        }
    );

    hooks.push(agnosticSdk.createCustomHook(
        CONTRACTS.STAKING,
        "stake",
        [0n], // This will be replaced with actual WETH balance, so we can paste 0 here
        { 
            dynamicReplacements: [replacement1], // or replacement2 or replacement3, they are equal
            isFromSAPerspective: true
        }
    ));


    // Build ZapCall
    const zapCall = agnosticSdk.buildZapCall(
        hooks,
        [ TOKENS.STAKE_SHARE_TOKEN ], // Bridge tokens after operation
        []  // No NFTs to bridge back
    );

    // Visualize call to understand what will happen. Very usefull for debug
    console.log("📋 Strategy Visualization:");
    agnosticSdk.visualizeZapCall(zapCall);

    // Get detailed breakdown. Also a debug tool
    const breakdown = agnosticSdk.getZapCallBreakdown(zapCall);
    console.log("\n📈 Strategy Analytics:");
    console.log(`   Total Operations: ${breakdown.totalHooks}`);
    console.log(`   Hook Types:`, breakdown.hookTypes);
    console.log(`   Estimated Gas: ${breakdown.gasEstimate.toLocaleString()}`);
    console.log(`   Encoded Size: ${breakdown.encodedSize} bytes`);
    console.log(`   Bridge Required: ${breakdown.bridgeRequired}`);

    // Encode call to get raw data that will be used in message
    const encodedCall = agnosticSdk.encodeZapCall(zapCall);
    console.log(`\n📦 Encoded Call: ${encodedCall.substring(0, 50)}...`);
    console.log(`📏 Total Size: ${encodedCall.length / 2} bytes`);

    // Prepare TAC -> TON tx
    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: agnosticCallParams.evmTargetAddress,
        methodName: agnosticCallParams.methodName,
        encodedCall
    };

// Create jetton transfer messages corresponding to EVM tokens, e.g., two tokens for adding liquidity to a pool
    const assets: AssetBridgingData[] = [
        {
            address: USDCTvmAddress,
            amount: usdcAmount,
            type: AssetType.FT,
        }   
    ];
    await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, assets);
    
}
```

## Core Concepts

### Hook Types

1. **Custom Hook**: Execute arbitrary contract calls with optional dynamic value replacement
2. **FullBalanceApprove Hook**: Approve the full balance of a token to a spender
3. **FullBalanceTransfer Hook**: Transfer the full balance of a token to a recipient

### ABI Support

The SDK supports multiple ABI formats for maximum flexibility:

#### 1. Human-Readable ABI (Ethers.js format)
```typescript
const abi = [
    "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
    "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)"
];

sdk.addContractInterface(CONTRACT_ADDRESS, abi);
```

#### 2. Generated JSON ABI (Hardhat/Truffle artifacts)
```typescript

// Or define directly
const jsonAbi = [
    {
        "inputs": [
            {
                "internalType": "bytes",
                "name": "tacHeader", 
                "type": "bytes"
            },
            {
                "internalType": "bytes",
                "name": "arguments",
                "type": "bytes"
            }
        ],
        "name": "createStrategy",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    }
    // ... events, errors, constructor are automatically filtered out
];

sdk.addContractInterface(CONTRACT_ADDRESS, jsonAbi);
```

#### 3. Mixed ABI (Both formats)
```typescript
const mixedAbi = [
    // Human-readable
    "function transfer(address to, uint256 amount) external returns (bool)",
    // JSON object
    {
        "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

sdk.addContractInterface(CONTRACT_ADDRESS, mixedAbi);
```

### Dynamic Value Replacement

The SDK supports replacing parameter values at execution time with actual token balances:

```typescript
// Create a dynamic amount replacement
const replacement = sdk.createAmountReplacement(
    0,                    // parameter index to replace
    TOKEN_ADDRESS,        // token to get balance of
    BALANCE_ADDRESS       // address to check balance for
);

// Use in a custom hook
const hook = sdk.createCustomHook(
    CONTRACT_ADDRESS,
    "functionName",
    [0n], // This 0 will be replaced with actual balance
    {
        dynamicReplacements: [replacement]
    }
);
```

## API Reference

### AgnosticProxySDK

#### Constructor

##### `constructor(network: Network, agnosticProxyAddress?: string)`
The network enum struct from TacSDK. If will be provided Network.MAINNET || Network.TESTNET, will set 
Agnostic Proxy address automaticly, which will help you to call getAgnosticCallParams helper function.
For Network.DEV option, passing agnosticProxyAddress is required, because DEV is for local environment.
By the way, even if you chosen MAINNET or TESTNET you can pass your own agnosticProxyAddress and work
with your own instance of this proxy.

#### Core Methods

##### `addContractInterface(address: string, abi: any[]): this`
Add a contract interface for encoding function calls. Supports both human-readable ABI strings and generated ABI JSON objects (from Hardhat/Truffle artifacts). Automatically extracts only function definitions from JSON ABI, filtering out events, errors, and constructors.


##### `getSmartAccountAddress(tvmWallet: string, provider?: ethers.Provider, smartAccountFactory?: string, agnosticProxyAddress?: string): string`
Get the current smart account address for a provided tvmWallet(in EQ format). If you didn't provide 
provider, smartAccountFactory and agnosticProxy through initializing, you can do it within this function, but all
this entities are required to be able to get smart account address

##### `createCustomHook(contractAddress, functionName, params, options): Hook`
Create a custom hook with optional dynamic value replacement.

**Options:**
- `isFromSAPerspective?: boolean` - Execute from Smart Account perspective (default: true)
- `value?: bigint` - ETH value to send (default: 0n)
- `dynamicReplacements?: AmountChange[]` - Dynamic value replacements

##### `createFullBalanceApproveHook(token, to, isFromSAPerspective): Hook`
Create a hook that approves the full balance of a token.

##### `createFullBalanceTransferHook(token, to, isFromSAPerspective): Hook`
Create a hook that transfers the full balance of a token.

##### `buildZapCall(hooks, bridgeTokens?, bridgeNFTs?): ZapCall`
Build a complete ZapCall from hooks and bridge data.

##### `encodeZapCall(zapCall): string`
Encode a ZapCall for transaction execution with optimized hook encoding.

#### Visualization & Debug Methods

##### `visualizeZapCall(zapCall: ZapCall): void`
Display a human-readable visualization of the entire operation chain.

##### `decodeHookData(hook: Hook): any`
Decode hook data back to readable format for debugging.

##### `estimateGasUsage(zapCall: ZapCall): number`
Get estimated gas consumption for the ZapCall. Offchain, just average numbers, not precise.

##### `getZapCallBreakdown(zapCall: ZapCall): object`
Get detailed breakdown including hook types, gas estimate, and descriptions.

##### `compareZapCalls(zapCall1, zapCall2, label1?, label2?): void`
Compare two ZapCalls and show differences in console.

#### Utility Methods

##### `createAmountReplacement(paramIndex, token, balanceAddress): AmountChange`
Helper to create dynamic amount replacement for a specific parameter (manual method).

##### `calculateReplacementData(contractAddress, functionName, parameterName, token, balanceAddress): AmountChange`
Advanced replacement calculator that automatically calculates position and length based on function signature.

##### `getReplacementHelper(contractAddress): object`
Get available functions and parameters for a contract with replacement compatibility info.

##### `buildReplacementInteractive(contractAddress, functionName, parameterName, token, balanceAddress, options): object`
Interactive replacement builder with validation, calculation details, and suggestions.

##### `createMultipleApproves(approvals): Hook[]`
Create multiple approve hooks at once.

##### `createHookSequence(calls): Hook[]`
Create a sequence of custom hooks.

##### `getAgnosticCallParams(): {string, string}`
Returns evmTargetAddress for agnostic function call through TacSDK and method name to call

## Examples

### Example 1: Simple Swap with Visualization

```typescript
const sdk = new AgnosticProxySDK();
sdk.addContractInterface(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI);

const hooks = [];

// Approve tokens for swap
hooks.push(sdk.createFullBalanceApproveHook(TOKENS.USDC, UNISWAP_ROUTER, true));

// Perform swap
hooks.push(sdk.createCustomHook(
    UNISWAP_ROUTER,
    "swapExactTokensForTokens",
    [
        ethers.parseUnits("1000", 6), // 1000 USDC
        ethers.parseEther("0.4"), // min 0.4 WETH
        [TOKENS.USDC, TOKENS.WETH],
        EVM_RECEIVER_ADDRESS,
        Math.floor(Date.now() / 1000) + 3600
    ]
));

const zapCall = sdk.buildZapCall(hooks, [TOKENS.WETH], []);

// 🎨 Visualize the operation
sdk.visualizeZapCall(zapCall);

const encodedCall = sdk.encodeZapCall(zapCall);
```

**Output:**
```
🔗 ZapCall Chain Visualization
================================

 1. ✅ Approve full balance of 0xA0b8...B3C4 to 0x7a25...488D from Smart Account

 2. 📞 Custom call to 0x7a25...488D from Smart Account
     Function: swapExactTokensForTokens(uint256, uint256, address[], address, uint256)

🌉 Bridge Operations:
   📤 Bridge tokens: 0xC02a...6Cc2

📊 Summary:
   Total hooks: 2
   Estimated gas: 150,000
   Bridge required: Yes
================================
```

### Example 2: Swap with Dynamic Amount + Staking

```typescript
const sdk = new AgnosticProxySDK();
sdk.addContractInterface(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI);
sdk.addContractInterface(COMPOUND_STAKING, STAKING_CONTRACT_ABI);

const hooks = [];

// 1. Approve USDC for swap
hooks.push(sdk.createFullBalanceApproveHook(TOKENS.USDC, UNISWAP_ROUTER, true));

// 2. Swap USDC to COMP
hooks.push(sdk.createCustomHook(
    UNISWAP_ROUTER,
    "swapExactTokensForTokens",
    [
        ethers.parseUnits("1000", 6), // 1000 USDC
        ethers.parseEther("50"), // min 50 COMP
        [TOKENS.USDC, TOKENS.COMP],
        EVM_RECEIVER_ADDRESS,
        Math.floor(Date.now() / 1000) + 3600
    ]
));

// 3. Approve COMP for staking
hooks.push(sdk.createFullBalanceApproveHook(TOKENS.COMP, COMPOUND_STAKING, true));

// 4. Stake all received COMP (dynamic amount)
const stakeReplacement = sdk.createAmountReplacement(0, TOKENS.COMP, EVM_RECEIVER_ADDRESS);
hooks.push(sdk.createCustomHook(
    COMPOUND_STAKING,
    "stake",
    [0n], // This will be replaced with actual COMP balance
    { dynamicReplacements: [stakeReplacement] }
));

const zapCall = sdk.buildZapCall(hooks, [], []);
sdk.visualizeZapCall(zapCall);
```

### Example 3: Complex DeFi Strategy (Swap → Lend → Borrow)

```typescript
const sdk = new AgnosticProxySDK();
sdk.addContractInterface(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI);
sdk.addContractInterface(AAVE_LENDING_POOL, AAVE_LENDING_POOL_ABI);

const operations = [
    {
        contract: UNISWAP_ROUTER,
        functionName: "swapExactTokensForTokens",
        params: [
            ethers.parseUnits("2000", 6), // 2000 USDC
            ethers.parseEther("1"), // min 1 WETH
            [TOKENS.USDC, TOKENS.WETH],
            EVM_RECEIVER_ADDRESS,
            Math.floor(Date.now() / 1000) + 3600
        ]
    },
    {
        contract: AAVE_LENDING_POOL,
        functionName: "deposit",
        params: [TOKENS.WETH, 0n, EVM_RECEIVER_ADDRESS, 0], // 0 will be replaced
        dynamicParams: [
            { paramIndex: 1, token: TOKENS.WETH, balanceAddress: EVM_RECEIVER_ADDRESS }
        ]
    }
];

const hooks = sdk.createComplexDeFiOperation(operations);

// Add necessary approvals
const approvals = sdk.createMultipleApproves([
    { token: TOKENS.USDC, spender: UNISWAP_ROUTER },
    { token: TOKENS.WETH, spender: AAVE_LENDING_POOL }
]);

const allHooks = [...approvals, ...hooks];
const zapCall = sdk.buildZapCall(allHooks, [TOKENS.WETH], []);

// Visualize and get breakdown
sdk.visualizeZapCall(zapCall);
const breakdown = sdk.getZapCallBreakdown(zapCall);
console.log("Strategy breakdown:", breakdown);
```

### Example 4: Yield Farming with Auto-Compounding

```typescript
const sdk = new AgnosticProxySDK();
sdk.addContractInterface(COMPOUND_STAKING, STAKING_CONTRACT_ABI);
sdk.addContractInterface(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI);

const hooks = [];

// 1. Approve COMP for staking
hooks.push(sdk.createFullBalanceApproveHook(TOKENS.COMP, COMPOUND_STAKING, true));

// 2. Initial stake
hooks.push(sdk.createCustomHook(
    COMPOUND_STAKING,
    "stake",
    [ethers.parseEther("100")] // 100 COMP
));

// 3. Claim rewards
hooks.push(sdk.createCustomHook(
    COMPOUND_STAKING,
    "getReward",
    []
));

// 4. Approve rewards for swapping
hooks.push(sdk.createFullBalanceApproveHook(TOKENS.COMP, UNISWAP_ROUTER, true));

// 5. Swap rewards back to COMP (dynamic amount)
const rewardSwapReplacement = sdk.createAmountReplacement(0, TOKENS.COMP, EVM_RECEIVER_ADDRESS);
hooks.push(sdk.createCustomHook(
    UNISWAP_ROUTER,
    "swapExactTokensForTokens",
    [0n, 0n, [TOKENS.COMP, TOKENS.COMP], EVM_RECEIVER_ADDRESS, Math.floor(Date.now() / 1000) + 3600],
    { dynamicReplacements: [rewardSwapReplacement] }
));

// 6. Compound - stake the swapped rewards
const compoundReplacement = sdk.createAmountReplacement(0, TOKENS.COMP, EVM_RECEIVER_ADDRESS);
hooks.push(sdk.createCustomHook(
    COMPOUND_STAKING,
    "stake",
    [0n], // This will be replaced with actual balance
    { dynamicReplacements: [compoundReplacement] }
));

const zapCall = sdk.buildZapCall(hooks, [], []);
sdk.visualizeZapCall(zapCall);
```

### Example 5: Strategy Comparison

```typescript
const sdk = new AgnosticProxySDK();

// Strategy A: Simple Uniswap swap
const strategyAHooks = [
    sdk.createFullBalanceApproveHook(TOKENS.USDC, UNISWAP_ROUTER, true),
    sdk.createCustomHook(UNISWAP_ROUTER, "swapExactTokensForTokens", [
        ethers.parseUnits("1000", 6), ethers.parseEther("0.4"), 
        [TOKENS.USDC, TOKENS.WETH], EVM_RECEIVER_ADDRESS, 
        Math.floor(Date.now() / 1000) + 3600
    ])
];

// Strategy B: Sushiswap swap + stake
const strategyBHooks = [
    sdk.createFullBalanceApproveHook(TOKENS.USDC, SUSHISWAP_ROUTER, true),
    sdk.createCustomHook(SUSHISWAP_ROUTER, "swapExactTokensForTokens", [
        ethers.parseUnits("1000", 6), ethers.parseEther("50"), 
        [TOKENS.USDC, TOKENS.COMP], EVM_RECEIVER_ADDRESS, 
        Math.floor(Date.now() / 1000) + 3600
    ]),
    sdk.createFullBalanceApproveHook(TOKENS.COMP, COMPOUND_STAKING, true),
    sdk.createCustomHook(COMPOUND_STAKING, "stake", [0n], {
        dynamicReplacements: [sdk.createAmountReplacement(0, TOKENS.COMP, EVM_RECEIVER_ADDRESS)]
    })
];

const strategyA = sdk.buildZapCall(strategyAHooks, [TOKENS.WETH], []);
const strategyB = sdk.buildZapCall(strategyBHooks, [], []);

// 🔄 Compare strategies
sdk.compareZapCalls(strategyA, strategyB, "Uniswap Simple", "Sushiswap + Stake");
```

## Advanced Usage

### Custom Dynamic Replacements

```typescript
// Replace multiple parameters
const replacements = [
    sdk.createAmountReplacement(0, TOKEN_A, userAddress), // param 0
    sdk.createAmountReplacement(2, TOKEN_B, userAddress)  // param 2
];

const hook = sdk.createCustomHook(
    CONTRACT_ADDRESS,
    "multiParamFunction",
    [0n, fixedValue, 0n], // params 0 and 2 will be replaced
    { dynamicReplacements: replacements }
);
```

## 🧮 Replacement Calculator Tools

The SDK includes advanced tools to automatically calculate dynamic value replacement positions, eliminating manual calculations.

### Quick Replacement Calculation

```typescript
// Automatic calculation based on function signature
const replacement = sdk.calculateReplacementData(
    UNISWAP_ROUTER,
    "swapExactTokensForTokens",
    "amountIn", // parameter name
    TOKENS.USDC,
    userAddress
);

// Manual calculation
const manualReplacement = sdk.createAmountReplacement(0, TOKENS.USDC, userAddress);
```

### Interactive Replacement Builder

```typescript
// Build replacement with full validation and guidance
const result = sdk.buildReplacementInteractive(
    COMPOUND_STAKING,
    "stake",
    "amount",
    TOKENS.COMP,
    userAddress,
    {
        showCalculation: true,
        validate: true
    }
);

console.log("Replacement:", result.replacement);
console.log("Calculation:", result.calculation);
console.log("Validation:", result.validation);
```

**Output:**
```
Replacement: { position: 4, len: 32, token: "0x...", balanceAddress: "0x..." }
Calculation: {
  functionSignature: "stake(uint256 amount)",
  parameterInfo: { name: "amount", type: "uint256", index: 0, position: 4, length: 32 },
  positionCalculation: "Position = 4 bytes (selector) + 0 * 32 bytes = 4 bytes"
}
Validation: {
  isValid: true,
  warnings: [],
  suggestions: ["✅ Parameter 'amount' looks suitable for dynamic replacement"]
}
```

### Bridge Integration

```typescript
// Create operation that bridges tokens after execution
const zapCall = sdk.buildZapCall(
    hooks,
    [TOKEN_TO_BRIDGE],  // tokens to bridge
    []                  // NFTs to bridge
);
```

## Error Handling

The SDK includes comprehensive error handling:

```typescript
try {
    const zapCall = sdk.createCustomHook(
        "0xinvalidaddress",
        "someFunction",
        []
    );
} catch (error) {
    // Error: Contract interface not found for address: 0xinvalidaddress
}
```

## Best Practices

1. **Always add contract interfaces** before creating hooks
2. **Use dynamic replacements** for interdependent operations
3. **Add appropriate approvals** before token operations
4. **Consider gas optimization** when chaining multiple operations
5. **Test thoroughly** with small amounts first



## Troubleshooting

### Common Issues

1. **"Contract interface not found"**: Make sure to call `addContractInterface()` first
2. **Invalid parameter encoding**: Check that parameter types match the ABI
3. **Dynamic replacement position**: Ensure the position calculation is correct for your function signature

### Debug Tips

```typescript
// Visualize operations
agnosticSdk.visualizeZapCall(zapCall);

// Get detailed breakdown
const breakdown = agnosticSdk.getZapCallBreakdown(zapCall);
console.log("Breakdown:", breakdown);

// Compare strategies
agnosticSdk.compareZapCalls(strategyA, strategyB, "Strategy A", "Strategy B");

// Debug individual hooks
zapCall.hooks.forEach((hook, i) => {
    console.log(`Hook ${i}:`, agnosticSdk.decodeHookData(hook));
});
```