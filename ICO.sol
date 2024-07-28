// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract FibonICO is Ownable, ReentrancyGuard {
    IERC20 public token;
    uint256 public rate;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public hardCap;
    uint256 public totalRaised;

    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);

    constructor(
        address initialOwner,
        IERC20 _token,
        uint256 _rate,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _hardCap
    ) Ownable(initialOwner) {
        token = _token;
        rate = _rate;
        startTime = _startTime;
        endTime = _endTime;
        hardCap = _hardCap;
    }

    function buyTokens() external payable nonReentrant {
        require(block.timestamp >= startTime && block.timestamp <= endTime, "ICO is not active");
        require(msg.value > 0, "Must send ETH to buy tokens");
        require(totalRaised + msg.value <= hardCap, "Hard cap reached");

        uint256 tokens = msg.value * rate;
        require(token.balanceOf(address(this)) >= tokens, "Not enough tokens in the contract");

        totalRaised += msg.value;
        token.transfer(msg.sender, tokens);

        emit TokensPurchased(msg.sender, tokens, msg.value);
    }

    function withdrawFunds() external onlyOwner {
        require(block.timestamp > endTime, "ICO has not ended yet");
        payable(owner()).transfer(address(this).balance);
    }

    function updateRate(uint256 newRate) external onlyOwner {
        rate = newRate;
    }

    function updateTimes(uint256 newStartTime, uint256 newEndTime) external onlyOwner {
        require(newStartTime < newEndTime, "Invalid time range");
        startTime = newStartTime;
        endTime = newEndTime;
    }
}