// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title FibonVesting
 * @dev A token vesting contract that handles the vesting schedule for beneficiaries.
 */
contract FibonVesting is Ownable {
    using SafeERC20 for IERC20;

    /// @notice The ERC20 token being vested.
    IERC20 public token;

    /// @notice The cliff period in seconds.
    uint256 public cliff;

    /// @notice The total duration of the vesting period in seconds.
    uint256 public duration;

    /// @notice The start time of the vesting schedule.
    uint256 public startTime;

    /// @notice Mapping from beneficiary address to their total token allocation.
    mapping(address => uint256) public totalAllocation;

    /// @notice Mapping from beneficiary address to the amount of tokens they have released.
    mapping(address => uint256) public releasedAmount;

    /// @notice Emitted when tokens are released to a beneficiary.
    /// @param beneficiary The address receiving the tokens.
    /// @param amount The amount of tokens released.
    event TokensReleased(address indexed beneficiary, uint256 amount);

    /// @notice Emitted when a new beneficiary is added.
    /// @param beneficiary The address of the new beneficiary.
    /// @param amount The total token allocation for the beneficiary.
    event BeneficiaryAdded(address indexed beneficiary, uint256 amount);

    /**
     * @dev Initializes the vesting contract.
     * @param initialOwner The address of the contract owner.
     * @param _token The ERC20 token to be vested.
     * @param _cliff Duration in seconds of the cliff period.
     * @param _duration Total duration in seconds of the vesting period.
     */
    constructor(
        address initialOwner,
        IERC20 _token,
        uint256 _cliff,
        uint256 _duration
    ) Ownable(initialOwner) {
        require(_duration > _cliff, "Invalid vesting schedule");
        token = _token;
        cliff = _cliff;
        duration = _duration;
        startTime = block.timestamp;
    }

    /**
     * @notice Adds a beneficiary to the vesting schedule.
     * @dev Only callable by the owner.
     * @param _beneficiary The address of the beneficiary.
     * @param _amount The total amount of tokens allocated to the beneficiary.
     */
    function addBeneficiary(address _beneficiary, uint256 _amount) external onlyOwner {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(_amount > 0, "Amount must be greater than 0");

        totalAllocation[_beneficiary] += _amount;
        emit BeneficiaryAdded(_beneficiary, _amount);
    }

    /**
     * @notice Allows a beneficiary to release their vested tokens.
     */
    function release() external {
        uint256 releasableAmount = calculateReleasableAmount(msg.sender);
        require(releasableAmount > 0, "No tokens available for release");

        releasedAmount[msg.sender] += releasableAmount;
        token.safeTransfer(msg.sender, releasableAmount);

        emit TokensReleased(msg.sender, releasableAmount);
    }

    /**
     * @notice Calculates the amount of tokens that can be released for a beneficiary.
     * @param _beneficiary The address of the beneficiary.
     * @return The amount of tokens that can be released.
     */
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

    /**
     * @notice Allows the owner to revoke a beneficiary's unvested tokens.
     * @dev Transfers the remaining unvested tokens back to the owner.
     * @param _beneficiary The address of the beneficiary to revoke.
     */
    function revokeBeneficiary(address _beneficiary) external onlyOwner {
        uint256 remainingAllocation = totalAllocation[_beneficiary] - releasedAmount[_beneficiary];
        if (remainingAllocation > 0) {
            token.safeTransfer(owner(), remainingAllocation);
        }
        totalAllocation[_beneficiary] = releasedAmount[_beneficiary];
    }

    /**
     * @notice Allows the owner to update the vesting schedule.
     * @param newCliff The new cliff period in seconds.
     * @param newDuration The new total duration of the vesting period in seconds.
     */
    function updateVestingSchedule(uint256 newCliff, uint256 newDuration) external onlyOwner {
        require(newCliff > 0 && newDuration > newCliff, "Invalid vesting schedule");
        cliff = newCliff;
        duration = newDuration;
    }
}
