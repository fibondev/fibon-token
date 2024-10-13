// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title FibonToken
 * @dev Implementation of the FibonToken, an ERC20 token with burnable and mintable functionalities.
 * It also supports ERC20Permit for gasless approvals.
 */
contract FibonToken is ERC20, ERC20Burnable, Ownable, ERC20Permit {
    /**
     * @dev Sets the token name, symbol, and initializes the permit functionality.
     * Also sets the initial owner of the contract.
     * @param initialOwner The address of the initial owner of the token.
     */
    constructor(address initialOwner)
        ERC20("FibonToken", "FIBON")
        ERC20Permit("FibonToken")
        Ownable(initialOwner)
    {}

    /**
     * @notice Allows the owner to mint new tokens.
     * @dev Only the contract owner can call this function.
     * @param to The address to receive the minted tokens.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
