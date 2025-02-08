// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title FibonToken
 * @dev Implementation of the FibonToken, an ERC20 token with burnable and mintable functionalities.
 * It also supports ERC20Permit for gasless approvals and includes transfer fees.
 */
contract FibonToken is ERC20, ERC20Burnable, Ownable, ERC20Permit {

    /// @notice Mapping of blacklisted addresses
    mapping(address => bool) public isBlacklisted;

    /// @notice Fixed fee amount for transfers
    uint256 public transferFee;

    /// @notice Address where fees are collected
    address public immutable feeCollector;

    /// @notice Event emitted when an address is blacklisted
    event AddressBlacklisted(address indexed account);

    /// @notice Event emitted when an address is removed from blacklist
    event AddressUnblacklisted(address indexed account);

    /// @notice Event emitted when transfer fee is updated
    event TransferFeeUpdated(uint256 oldFee, uint256 newFee);

    /**
     * @dev Sets the token name, symbol, and initializes the permit functionality.
     * Also sets the initial owner and fee collector of the contract.
     * @param initialOwner The address of the initial owner of the token.
     * @param _feeCollector The address that will receive transfer fees.
     */
    constructor(address initialOwner, address _feeCollector)
        ERC20("FibonToken", "FIBON")
        ERC20Permit("FibonToken")
        Ownable(initialOwner)
    {
        require(_feeCollector != address(0), "Invalid fee collector");
        feeCollector = _feeCollector;
    }

    /**
     * @notice Allows the owner to mint new tokens.
     * @dev Only the contract owner can call this function.
     * @param to The address to receive the minted tokens.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) public onlyOwner {
        require(!isBlacklisted[to], "Recipient is blacklisted");
        _mint(to, amount);
    }

    /**
     * @notice Sets the fixed transfer fee
     * @param newFee The new fee amount in token units
     */
    function setTransferFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = transferFee;
        transferFee = newFee;
        emit TransferFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Allows the owner to blacklist an address
     * @param _account The address to blacklist
     */
    function blacklistAddress(address _account) external onlyOwner {
        require(_account != address(0), "Invalid address");
        require(!isBlacklisted[_account], "Address already blacklisted");

        isBlacklisted[_account] = true;
        emit AddressBlacklisted(_account);
    }

    /**
     * @notice Allows the owner to remove an address from blacklist
     * @param _account The address to unblacklist
     */
    function unblacklistAddress(address _account) external onlyOwner {
        require(_account != address(0), "Invalid address");
        require(isBlacklisted[_account], "Address not blacklisted");

        isBlacklisted[_account] = false;
        emit AddressUnblacklisted(_account);
    }

    /**
     * @dev Override transfer and transferFrom to add blacklist check and fee collection
     */
    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        require(!isBlacklisted[msg.sender], "Sender is blacklisted");
        require(!isBlacklisted[to], "Recipient is blacklisted");

        if (transferFee > 0 && msg.sender != feeCollector) {
            require(amount > transferFee, "Amount less than fee");
            
            uint256 feeAmount = transferFee;
            uint256 netAmount = amount - feeAmount;
            
            _transfer(msg.sender, feeCollector, feeAmount);
            _transfer(msg.sender, to, netAmount);
            return true;
        }

        return super.transfer(to, amount);
    }

    /**
     * @dev Override transferFrom to add fee collection
     */
    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        require(!isBlacklisted[from], "Sender is blacklisted");
        require(!isBlacklisted[to], "Recipient is blacklisted");

        if (transferFee > 0 && from != feeCollector) {
            require(amount > transferFee, "Amount too small for fee");
            
            uint256 feeAmount = transferFee;
            uint256 netAmount = amount - feeAmount;

            uint256 currentAllowance = allowance(from, msg.sender);
            require(currentAllowance >= amount, "Insufficient allowance");
            
            _spendAllowance(from, msg.sender, amount);
            _transfer(from, feeCollector, feeAmount);
            _transfer(from, to, netAmount);
            return true;
        }

        return super.transferFrom(from, to, amount);
    }

    /**
     * @dev Override burn to prevent burning by blacklisted addresses
     */
    function burn(uint256 amount) public virtual override {
        require(!isBlacklisted[msg.sender], "Sender is blacklisted");
        super.burn(amount);
    }

    /**
     * @dev Override burnFrom to prevent burning from blacklisted addresses
     */
    function burnFrom(address account, uint256 amount) public virtual override {
        require(!isBlacklisted[msg.sender], "Spender is blacklisted");
        require(!isBlacklisted[account], "Token owner is blacklisted");
        super.burnFrom(account, amount);
    }

    /**
     * @dev Override permit to prevent permits for blacklisted addresses
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual override {
        require(!isBlacklisted[owner], "Owner is blacklisted");
        require(!isBlacklisted[spender], "Spender is blacklisted");
        super.permit(owner, spender, value, deadline, v, r, s);
    }
}
