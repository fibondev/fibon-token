# Fibon Token System Deployment Guide

This guide is created to help you deploy the Fibon Token system using Remix IDE.

## Prerequisites

- Access to [Remix IDE](https://remix.ethereum.org/)
- MetaMask or similar web3 wallet
- Sufficient ETH for gas fees
- Basic understanding of Ethereum and smart contract deployment

## Deployment Steps

### 1. Deploy FibonMultiSig

1. Open [Remix IDE](https://remix.ethereum.org/).
2. Create a new file named `FibonMultiSig.sol` and paste the code from `Multisig.sol`
3. Compile the contract by selecting the appropriate Solidity version.
4. Navigate to the "Deploy & Run Transactions" tab.
5. Set the environment to "Injected Web3" to connect with MetaMask.
6. Deploy the contract with the following parameters:
   - `_owners`: Array of owner addresses (e.g., `["0xOwner1", "0xOwner2"]`)
   - `_required`: Number of required confirmations (e.g., `2`)

### 2. Deploy FibonToken Implementation

1. Create a new file named `FibonToken.sol` and paste the code from `FibonToken.sol`
2. Compile the contract.
3. Deploy the contract (no constructor parameters needed).

### 3. Deploy FibonProxy

1. Create a new file named `FibonProxy.sol` and paste the code from `FibonProxy.sol`
2. Compile the contract.
3. In the "Deploy" section, provide the following parameters:
   - `_logic`: Address of the deployed FibonToken implementation.
   - `_data`: ABI-encoded `initialize` function call with the multisig address. You can get the ABI-encoded data using Remix's "At Address" feature or an online ABI encoder.

## Calculating Unix Timestamps

To convert a specific date and time to a Unix timestamp, you can use various online tools. One such tool is [Epoch Converter](https://www.epochconverter.com/).

### Steps to Calculate Unix Timestamp:

1. **Open Epoch Converter**: Go to [Epoch Converter](https://www.epochconverter.com/).

2. **Enter the Date and Time**:
   - In the "Human date to Timestamp" section, enter the date and time you want to convert. For example, enter `2024-09-01 00:00:00` for 1st September 2024 at midnight.

3. **Get the Unix Timestamp**:
   - The website will automatically convert the entered date and time to a Unix timestamp. For `2024-09-01 00:00:00`, the Unix timestamp is `1725148800`.
   
### 4. Deploy ICO Contract

1. Create a new file named `ICO.sol` and paste the code from `ICO.sol`
2. Compile the contract.
3. Deploy the contract with the following parameters:
   - `initialOwner`: Address of the contract owner (e.g., `0xYourMetaMaskAddress`).
   - `_token`: Address of the FibonProxy contract (e.g., `0xFibonProxyAddress`).
   - `_rate`: Token rate (e.g., `1000`).
   - `_startTime`: ICO start time (e.g., `1725148800` for 1st September 2024).
   - `_endTime`: ICO end time (e.g., `1727827200` for 1st October 2024).
   - `_hardCap`: Maximum amount to be raised (e.g., `100 ether`).

### 5. Deploy Vesting Contract

1. Create a new file named `Vesting.sol` and paste the code from `Vesting.sol`:
2. Compile the contract.
3. Deploy the contract with the following parameters:
   - `initialOwner`: Address of the contract owner (e.g., `0xYourMetaMaskAddress`).
   - `_token`: Address of the FibonProxy contract (e.g., `0xFibonProxyAddress`).
   - `_cliff`: Cliff period in seconds (e.g., `2592000` for 30 days).
   - `_duration`: Total vesting duration in seconds (e.g., `31536000` for 365 days).

## Post-Deployment Steps

1. Fund the ICO contract with tokens for sale.
2. Set up vesting schedules in the Vesting contract.
3. Transfer ownership of the FibonToken (via proxy) to the FibonMultiSig.

## Working with FibonMultiSig

### Submitting a Transaction

To submit a transaction, one of the owners needs to call the `submitTransaction` method. For example, to transfer 1 ETH to address `0xRecipient`:

1. Go to the deployed FibonMultiSig contract in Remix.
2. Call the `submitTransaction` method with the following parameters:
   - `destination`: `0xRecipient`
   - `value`: `1000000000000000000` (1 ETH in wei)
   - `data`: `0x` (empty data for a simple ETH transfer)

Example:
```solidity
uint transactionId = submitTransaction("0xRecipient", 1000000000000000000, "0x");
```

### Viewing the Transaction ID in Remix

1. After submitting the transaction, go to the "Logs" section in Remix.
2. Look for the `Submission` event. It will contain the `transactionId`.

Example Log:
```
{
    "event": "Submission",
    "args": {
        "transactionId": "0"
    }
}
```

### Confirming a Transaction

Once a transaction is submitted, it needs to be confirmed by the required number of owners. Each owner can confirm the transaction by calling the `confirmTransaction` method with the transaction ID.

1. Go to the deployed FibonMultiSig contract in Remix.
2. Call the `confirmTransaction` method with the transaction ID (e.g., `0`).

### Executing a Transaction

After the required number of confirmations, the transaction is automatically executed. 

### Example Workflow: Transferring 1 ETH

1. **Owner 1 Submits a Transaction:**
   - Open Remix IDE and load the deployed `FibonMultiSig` contract.
   - Go to the "Deployed Contracts" section and find your `FibonMultiSig` contract.
   - Expand the contract and find the `submitTransaction` function.
   - Enter the following parameters:
     - `destination`: `0xRecipient` (replace with the actual recipient address)
     - `value`: `1000000000000000000` (1 ETH in wei)
     - `data`: `0x` (empty data for a simple ETH transfer)
   - Click the "transact" button to submit the transaction.
   - Note the `transactionId` from the transaction receipt or the event log.

2. **Owner 2 Confirms the Transaction:**
   - Owner 2 should open Remix IDE and load the same `FibonMultiSig` contract.
   - Go to the "Deployed Contracts" section and find the `FibonMultiSig` contract.
   - Expand the contract and find the `confirmTransaction` function.
   - Enter the `transactionId` obtained from the previous step.
   - Click the "transact" button to confirm the transaction.

### Another Multisig Example: Minting Tokens

1. **Owner 1 Submits a Transaction to Mint Tokens:**
   - Open Remix IDE and load the deployed `FibonMultiSig` contract.
   - Go to the "Deployed Contracts" section and find your `FibonMultiSig` contract.
   - Expand the contract and find the `submitTransaction` function.
   - Enter the following parameters:
     - `destination`: Address of the `FibonToken` contract (replace with the actual contract address)
     - `value`: `0` (no ETH transfer)
     - `data`: Use Remix's "At Address" feature or an online ABI encoder to encode the function call `mint(address,uint256)` with parameters `0xRecipient` (recipient address) and `1000 * 10**18` (amount of tokens).
   - Click the "transact" button to submit the transaction.
   - Note the `transactionId` from the transaction receipt or the event log.

2. **Owner 2 Confirms the Transaction:**
   - Owner 2 should open Remix IDE and load the same `FibonMultiSig` contract.
   - Go to the "Deployed Contracts" section and find the `FibonMultiSig` contract.
   - Expand the contract and find the `confirmTransaction` function.
   - Enter the `transactionId` obtained from the previous step.
   - Click the "transact" button to confirm the transaction.

## Upgradeability

The FibonToken uses the UUPS (Universal Upgradeable Proxy Standard) pattern. To upgrade:

1. Deploy a new implementation of FibonToken.
2. Use the FibonMultiSig to call the upgrade function on the proxy.

## Method Explanations

### FibonProxy.sol

- **constructor(address _logic, bytes memory _data)**: Sets up the proxy with the initial logic contract and initialization data.

### FibonToken.sol

- **constructor()**: Disables initializers to prevent multiple initializations.
- **initialize(address initialAuthority)**: Sets up the token with its name, symbol, and initial authority.
- **pause()**: Pauses all token transfers.
- **unpause()**: Resumes token transfers.
- **mint(address to, uint256 amount)**: Creates new tokens and assigns them to an address.
- **_authorizeUpgrade(address newImplementation)**: Ensures only the authorized person can upgrade the contract.
- **_update(address from, address to, uint256 value)**: Updates balances during token transfers.

### Multisig.sol

- **constructor(address[] memory _owners, uint _required)**: Sets up the wallet with owners and required confirmations.
- **submitTransaction(address destination, uint value, bytes memory data)**: Proposes a new transaction.
- **confirmTransaction(uint transactionId)**: Approves a proposed transaction.
- **executeTransaction(uint transactionId)**: Executes a transaction if it has enough approvals.
- **isOwner(address addr)**: Checks if an address is one of the owners.

### ICO.sol

- **constructor(address initialOwner, IERC20 _token, uint256 _rate, uint256 _startTime, uint256 _endTime, uint256 _hardCap)**: Sets up the ICO with token, rate, start and end times, and hard cap.
- **buyTokens(uint8 _phase)**: Allows people to buy tokens during a specific phase.
- **claimPreLaunchTokens()**: Allows people to claim pre-purchased tokens after a certain period.
- **calculateClaimableAmount(address _buyer)**: Calculates how many tokens a buyer can claim based on time elapsed.
- **getPhase(uint8 _phase)**: Returns details of a specific phase.
- **withdrawFunds()**: Allows the owner to withdraw funds after the ICO ends.
- **updateRate(uint256 newRate)**: Updates the token rate.
- **updateTimes(uint256 newStartTime, uint256 newEndTime)**: Updates the start and end times of the ICO.
- **extendEndTime(uint256 newEndTime)**: Extends the end time of the ICO.

### Vesting.sol

- **constructor(address initialOwner, IERC20 _token, uint256 _cliff, uint256 _duration)**: Sets up the vesting contract with token, cliff period, and duration.
- **addBeneficiary(address _beneficiary, uint256 _amount)**: Adds a beneficiary and allocates tokens to them.
- **release()**: Allows a beneficiary to claim their vested tokens.
- **calculateReleasableAmount(address _beneficiary)**: Calculates how many tokens a beneficiary can claim based on time elapsed.
- **setToken(IERC20 _newToken)**: Changes the token used in the vesting contract.
- **revokeBeneficiary(address _beneficiary)**: Revokes a beneficiary's allocation and returns remaining tokens to the owner.
- **updateVestingSchedule(uint256 newCliff, uint256 newDuration)**: Updates the vesting schedule.

