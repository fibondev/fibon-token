// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Context.sol";

/**
 * @title FibonMultiSig
 * @dev A multisignature wallet contract that allows multiple owners to confirm transactions before execution.
 */
contract FibonMultiSig is Context {
    /// @notice List of wallet owners.
    address[] public owners;

    /// @notice Mapping to check if an address is an owner.
    mapping(address => bool) public isOwner;

    /// @notice Number of required confirmations for transactions.
    uint public required;

    /// @notice Counter for transaction IDs.
    uint public transactionCount;

    /// @notice Struct to store transaction details.
    struct Transaction {
        address destination;   // Address to which the transaction is sent.
        uint value;            // Amount of Ether to send.
        bytes data;            // Data payload for the transaction.
        bool executed;         // Whether the transaction has been executed.
        uint confirmations;    // Number of confirmations received.
    }

    /// @notice Mapping of transaction ID to Transaction object.
    mapping(uint => Transaction) public transactions;

    /// @notice Mapping of transaction ID to owner confirmations.
    mapping(uint => mapping(address => bool)) public confirmations;

    /// @notice Event emitted when a transaction is submitted.
    event Submission(uint indexed transactionId);

    /// @notice Event emitted when a transaction is confirmed.
    event Confirmation(address indexed sender, uint indexed transactionId);

    /// @notice Event emitted when a transaction is executed.
    event Execution(uint indexed transactionId);

    /// @notice Event emitted when a transaction execution fails.
    event ExecutionFailure(uint indexed transactionId);

    /**
     * @dev Throws if called by any account other than an owner.
     */
    modifier onlyOwner() {
        require(isOwner[_msgSender()], "Not an owner");
        _;
    }

    /**
     * @dev Throws if the transaction does not exist.
     * @param transactionId Transaction ID to check.
     */
    modifier transactionExists(uint transactionId) {
        require(transactions[transactionId].destination != address(0), "Transaction does not exist");
        _;
    }

    /**
     * @dev Throws if the transaction has already been executed.
     * @param transactionId Transaction ID to check.
     */
    modifier notExecuted(uint transactionId) {
        require(!transactions[transactionId].executed, "Transaction already executed");
        _;
    }

    /**
     * @dev Throws if the transaction has already been confirmed by the sender.
     * @param transactionId Transaction ID to check.
     */
    modifier notConfirmed(uint transactionId) {
        require(!confirmations[transactionId][_msgSender()], "Transaction already confirmed");
        _;
    }

    /**
     * @dev Initializes the contract by setting the owners and required number of confirmations.
     * @param _owners List of initial owners.
     * @param _required Number of required confirmations.
     */
    constructor(address[] memory _owners, uint _required) {
        require(_owners.length >= _required && _required > 0 && _owners.length > 0, "Invalid required number of owners");
        for (uint i = 0; i < _owners.length; i++) {
            require(!isOwner[_owners[i]], "Duplicate owner");
            isOwner[_owners[i]] = true;
        }
        owners = _owners;
        required = _required;
    }

    /**
     * @notice Submits and confirms a transaction.
     * @dev Only an owner can call this function. The transaction must include the correct ETH value.
     * @param destination Address to send the transaction to.
     * @param value Amount of Ether to send.
     * @param data Data payload for the transaction.
     * @return transactionId The ID of the submitted transaction.
     */
    function submitTransaction(address destination, uint value, bytes memory data) public payable onlyOwner returns (uint transactionId) {
        require(msg.value == value, "ETH value must match transaction value");

        transactionId = transactionCount;
        transactions[transactionId] = Transaction({
            destination: destination,
            value: value,
            data: data,
            executed: false,
            confirmations: 0
        });
        transactionCount += 1;
        emit Submission(transactionId);
        confirmTransaction(transactionId);
    }

    /**
     * @notice Confirms a transaction.
     * @dev Only an owner can call this function. The transaction must exist, not be executed, and not already be confirmed by the sender.
     * @param transactionId The ID of the transaction to confirm.
     */
    function confirmTransaction(uint transactionId) public onlyOwner transactionExists(transactionId) notExecuted(transactionId) notConfirmed(transactionId) {
        Transaction storage transaction = transactions[transactionId];
        transaction.confirmations += 1;
        confirmations[transactionId][_msgSender()] = true;
        emit Confirmation(_msgSender(), transactionId);
        if (transaction.confirmations == required) {
            executeTransaction(transactionId);
        }
    }

    /**
     * @notice Submits a withdrawal transaction.
     * @dev Only an owner can call this function.
     * @param destination Address to send the ETH to.
     * @param amount Amount of ETH to withdraw.
     * @return transactionId The ID of the submitted withdrawal transaction.
     */
    function submitWithdrawal(address payable destination, uint amount) public onlyOwner returns (uint transactionId) {
        require(address(this).balance >= amount, "Insufficient balance");

        transactionId = transactionCount;
        transactions[transactionId] = Transaction({
            destination: destination,
            value: amount,
            data: "",
            executed: false,
            confirmations: 0
        });
        transactionCount += 1;
        emit Submission(transactionId);
        confirmTransaction(transactionId);
    }

    /**
     * @notice Executes a transaction if it has enough confirmations.
     * @dev The transaction must exist, not be executed, and have enough confirmations.
     * @param transactionId The ID of the transaction to execute.
     */
    function executeTransaction(uint transactionId) public transactionExists(transactionId) notExecuted(transactionId) {
        Transaction storage transaction = transactions[transactionId];
        if (transaction.confirmations >= required) {
            transaction.executed = true;
            (bool success, ) = transaction.destination.call{value: transaction.value}(transaction.data);
            if (success)
                emit Execution(transactionId);
            else {
                emit ExecutionFailure(transactionId);
                transaction.executed = false;
            }
        }
    }

    /**
     * @notice Receive function to accept Ether.
     * @dev Emits a Deposit event when ETH is received.
     */
    event Deposit(address indexed sender, uint amount);

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @notice Fallback function called for all messages sent to this contract, except plain Ether transfers.
     */
    fallback() external payable {
        revert("FibonMultiSig: Function does not exist or invalid data sent");
    }
}
