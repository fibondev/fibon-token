// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FibonVesting is Ownable {
    IERC20 public token;
    uint256 public cliff;
    uint256 public duration;
    uint256 public startTime;

    mapping(address => uint256) public totalAllocation;
    mapping(address => uint256) public releasedAmount;

    event TokensReleased(address beneficiary, uint256 amount);
    event BeneficiaryAdded(address beneficiary, uint256 amount);

    constructor(
        address initialOwner,
        IERC20 _token,
        uint256 _cliff,
        uint256 _duration
    ) Ownable(initialOwner) {
        token = _token;
        cliff = _cliff;
        duration = _duration;
        startTime = block.timestamp;
    }

    function addBeneficiary(address _beneficiary, uint256 _amount) external onlyOwner {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(_amount > 0, "Amount must be greater than 0");

        totalAllocation[_beneficiary] += _amount;
        emit BeneficiaryAdded(_beneficiary, _amount);
    }

    function release() external {
        uint256 releasableAmount = calculateReleasableAmount(msg.sender);
        require(releasableAmount > 0, "No tokens available for release");

        releasedAmount[msg.sender] += releasableAmount;
        token.transfer(msg.sender, releasableAmount);

        emit TokensReleased(msg.sender, releasableAmount);
    }

    function calculateReleasableAmount(address _beneficiary) public view returns (uint256) {
        if (block.timestamp < startTime + cliff) {
            return 0;
        }

        uint256 elapsedTime = block.timestamp - startTime;
        uint256 totalVestingTime = duration;

        if (elapsedTime >= totalVestingTime) {
            return totalAllocation[_beneficiary] - releasedAmount[_beneficiary];
        } else {
            uint256 vestedAmount = (totalAllocation[_beneficiary] * elapsedTime) / totalVestingTime;
            return vestedAmount - releasedAmount[_beneficiary];
        }
    }
}