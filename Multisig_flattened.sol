
// File: @openzeppelin/contracts/utils/Context.sol


// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.20;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

// File: contracts/Multisig.sol


pragma solidity ^0.8.20;


contract FibonMultiSig is Context {
    address[] public owners;
    uint public required;
    uint public transactionCount;

    struct Transaction {
        address destination;
        uint value;
        bytes data;
        bool executed;
        uint confirmations;
    }

    mapping(uint => Transaction) public transactions;
    mapping(uint => mapping(address => bool)) public confirmations;

    event Submission(uint indexed transactionId);
    event Confirmation(address indexed sender, uint indexed transactionId);
    event Execution(uint indexed transactionId);
    event ExecutionFailure(uint indexed transactionId);

    modifier onlyOwner() {
        require(isOwner(_msgSender()), "Not an owner");
        _;
    }

    modifier transactionExists(uint transactionId) {
        require(transactions[transactionId].destination != address(0), "Transaction does not exist");
        _;
    }

    modifier notExecuted(uint transactionId) {
        require(!transactions[transactionId].executed, "Transaction already executed");
        _;
    }

    modifier notConfirmed(uint transactionId) {
        require(!confirmations[transactionId][_msgSender()], "Transaction already confirmed");
        _;
    }

    constructor(address[] memory _owners, uint _required) {
        require(_owners.length >= _required && _required > 0 && _owners.length > 0, "Invalid required number of owners");
        owners = _owners;
        required = _required;
    }

    function submitTransaction(address destination, uint value, bytes memory data) public onlyOwner returns (uint transactionId) {
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

    function confirmTransaction(uint transactionId) public onlyOwner transactionExists(transactionId) notExecuted(transactionId) notConfirmed(transactionId) {
        Transaction storage transaction = transactions[transactionId];
        transaction.confirmations += 1;
        confirmations[transactionId][_msgSender()] = true;
        emit Confirmation(_msgSender(), transactionId);
        executeTransaction(transactionId);
    }

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

    function isOwner(address addr) public view returns (bool) {
        for (uint i = 0; i < owners.length; i++) {
            if (owners[i] == addr) {
                return true;
            }
        }
        return false;
    }
}