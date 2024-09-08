// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract FibonICO is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public token;
    uint256 public rate;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public hardCap;
    uint256 public totalRaised;

    uint256 public constant PRELAUNCH_CLIFF = 90 days;
    uint256 public constant PRELAUNCH_VESTING = 90 days;

    struct Phase {
        uint256 supply;
        uint256 sold;
        uint256 startTime;
        uint256 endTime;
    }

    Phase public preLaunchSale;
    Phase public ico1;
    Phase public ico2;
    Phase public ico3;

    mapping(address => uint256) public preLaunchPurchases;
    mapping(address => uint256) public preLaunchClaimTime;

    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost, uint8 phase);
    event TokensClaimed(address indexed buyer, uint256 amount);
    event RateUpdated(uint256 newRate);
    event TimesUpdated(uint256 newStartTime, uint256 newEndTime);

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

        preLaunchSale = Phase(58820000 * 10**18, 0, _startTime, _startTime + 30 days);
        ico1 = Phase(58820000 * 10**18, 0, _startTime + 30 days, _startTime + 60 days);
        ico2 = Phase(44000000 * 10**18, 0, _startTime + 60 days, _startTime + 90 days);
        ico3 = Phase(25176000 * 10**18, 0, _startTime + 90 days, _endTime);
    }

    function buyTokens(uint8 _phase) external payable nonReentrant {
        require(block.timestamp >= startTime && block.timestamp <= endTime, "ICO is not active");
        require(msg.value > 0, "Must send ETH to buy tokens");
        require(totalRaised + msg.value <= hardCap, "Hard cap reached");

        Phase storage phase = getPhase(_phase);
        require(block.timestamp >= phase.startTime && block.timestamp <= phase.endTime, "Phase is not active");

        uint256 tokens = msg.value * rate;
        require(phase.sold + tokens <= phase.supply, "Exceeds phase supply");

        phase.sold += tokens;
        totalRaised += msg.value;

        if (_phase == 0) {
            preLaunchPurchases[msg.sender] += tokens;
            preLaunchClaimTime[msg.sender] = block.timestamp + PRELAUNCH_CLIFF;
        } else {
            token.safeTransfer(msg.sender, tokens);
        }

        emit TokensPurchased(msg.sender, tokens, msg.value, _phase);
    }

    function claimPreLaunchTokens() external nonReentrant {
        require(block.timestamp >= preLaunchClaimTime[msg.sender], "Cliff period not over");
        uint256 claimableAmount = calculateClaimableAmount(msg.sender);
        require(claimableAmount > 0, "No tokens to claim");

        preLaunchPurchases[msg.sender] -= claimableAmount;
        token.safeTransfer(msg.sender, claimableAmount);

        emit TokensClaimed(msg.sender, claimableAmount);
    }

    function calculateClaimableAmount(address _buyer) public view returns (uint256) {
        if (block.timestamp < preLaunchClaimTime[_buyer]) {
            return 0;
        }
        uint256 totalVestingTime = PRELAUNCH_VESTING;
        uint256 elapsedTime = block.timestamp - preLaunchClaimTime[_buyer];
        if (elapsedTime >= totalVestingTime) {
            return preLaunchPurchases[_buyer];
        } else {
            return (preLaunchPurchases[_buyer] * elapsedTime) / totalVestingTime;
        }
    }

    function getPhase(uint8 _phase) internal view returns (Phase storage) {
        if (_phase == 0) return preLaunchSale;
        if (_phase == 1) return ico1;
        if (_phase == 2) return ico2;
        if (_phase == 3) return ico3;
        revert("Invalid phase");
    }

    function withdrawFunds() external onlyOwner {
        require(block.timestamp > endTime, "ICO has not ended yet");
        payable(owner()).transfer(address(this).balance);
    }

    function updateRate(uint256 newRate) external onlyOwner {
        rate = newRate;
        emit RateUpdated(newRate);
    }

    function extendEndTime(uint256 newEndTime) external onlyOwner {
        require(newEndTime > endTime, "New end time must be after current end time");
        endTime = newEndTime;
        emit TimesUpdated(startTime, newEndTime);
    }
}
