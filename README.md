# Fibon Token System

This README provides instructions for deploying the Fibon Token system using Remix IDE.

## Prerequisites

- Access to [Remix IDE](https://remix.ethereum.org/)
- MetaMask or similar web3 wallet
- Sufficient ETH for gas fees
- Understanding of Ethereum and smart contract deployment

## Deployment Steps

### 1. Deploy FibonMultiSig

1. Load `FibonMultiSig.sol` into Remix
2. Compile the contract
3. Navigate to the "Deploy & Run Transactions" tab
4. Set the environment to "Injected Web3"
5. Deploy with parameters:
   - `_owners`: Array of owner addresses
   - `_required`: Number of required confirmations

### 2. Deploy FibonToken Implementation

1. Load `FibonToken.sol` into Remix
2. Compile the contract
3. Deploy the contract (no constructor parameters needed)

### 3. Deploy FibonProxy

1. Load `FibonProxy.sol` into Remix
2. Compile the contract
3. In the "Deploy" section, provide:
   - `_logic`: Address of FibonToken implementation
   - `_data`: ABI-encoded `initialize` function call with multisig address

### 4. Deploy ICO Contract

1. Load `ICO.sol` into Remix
2. Compile the contract
3. Deploy with parameters:
   - `initialOwner`: Address of the contract owner
   - `_token`: Address of the FibonProxy contract
   - `_rate`: Token rate
   - `_startTime`: ICO start time
   - `_endTime`: ICO end time
   - `_hardCap`: Maximum amount to be raised

### 5. Deploy Vesting Contract

1. Load `Vesting.sol` into Remix
2. Compile the contract
3. Deploy with parameters:
   - `initialOwner`: Address of the contract owner
   - `_token`: Address of the FibonProxy contract
   - `_cliff`: Cliff period in seconds
   - `_duration`: Total vesting duration in seconds

## Post-Deployment Steps

1. Fund the ICO contract with tokens for sale
2. Set up vesting schedules in the Vesting contract
3. Transfer ownership of the FibonToken (via proxy) to the FibonMultiSig


## Upgradeability

The FibonToken uses the UUPS (Universal Upgradeable Proxy Standard) pattern. To upgrade:

1. Deploy a new implementation of FibonToken
2. Use the FibonMultiSig to call the upgrade function on the proxy
