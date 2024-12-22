// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title FibonVesting
 * @dev A token vesting contract that handles vesting schedules with non-cumulative percentages over specific periods.
 */
contract FibonVesting is Ownable {
    using SafeERC20 for IERC20;

    /// @notice The ERC20 token being vested.
    IERC20 public token;

    /// @notice Total tokens allocated for vesting.
    uint256 public totalAllocated;

    /// @notice Struct to store vesting schedule for each beneficiary.
    struct VestingSchedule {
        uint256 startTime;       // Vesting start time
        uint256 releasedAmount;  // Amount of tokens already released
        VestingPhase[] phases;   // Array of vesting phases
        bool isDisabled;         // Flag to disable the schedule
    }

    /// @notice Struct to define a vesting phase.
    struct VestingPhase {
        uint256 start;      // Phase start time (seconds from startTime)
        uint256 end;        // Phase end time (seconds from startTime)
        uint256 percentage; // Percentage of total tokens allocated to this phase (non-cumulative)
    }

    /// @notice Mapping from beneficiary address to their vesting schedule.
    mapping(address => VestingSchedule) public vestingSchedules;

    /// @notice Mapping from beneficiary address to their total token allocation.
    mapping(address => uint256) public totalAllocation;

    /// @notice Mapping from vesting type ID to VestingPhase array.
    mapping(uint8 => VestingPhase[]) public vestingTypes;

    /// @notice Emitted when tokens are released to a beneficiary.
    /// @param beneficiary The address receiving the tokens.
    /// @param amount The amount of tokens released.
    event TokensReleased(address indexed beneficiary, uint256 amount);

    /// @notice Emitted when a new vesting schedule is created for a beneficiary.
    /// @param beneficiary The address of the new beneficiary.
    /// @param amount The total token allocation for the beneficiary.
    event VestingScheduleCreated(address indexed beneficiary, uint256 amount);

    /// @notice Emitted when a new vesting type is added.
    /// @param typeId The ID of the vesting type.
    event VestingTypeAdded(uint8 typeId);

    /// @notice Emitted when a beneficiary's vesting is revoked.
    /// @param beneficiary The address of the beneficiary whose vesting is revoked.
    /// @param amount The amount of tokens revoked.
    event VestingRevoked(address indexed beneficiary, uint256 amount);

    /// @notice Emitted when a vesting schedule is disabled.
    /// @param beneficiary The address of the beneficiary whose schedule is disabled.
    event VestingScheduleDisabled(address indexed beneficiary);

    /// @notice Emitted when a vesting schedule is enabled.
    /// @param beneficiary The address of the beneficiary whose schedule is enabled.
    event VestingScheduleEnabled(address indexed beneficiary);

    /**
     * @dev Initializes the vesting contract.
     * @param _token The ERC20 token to be vested.
     */
    constructor(IERC20 _token, address initialOwner) Ownable(initialOwner) {
        token = _token;

        // Initialize predefined vesting types
        _addPredefinedVestingTypes();
    }

    /**
     * @dev Internal function to add predefined vesting types.
     */
    function _addPredefinedVestingTypes() internal {
        // 1. Shareholders (Type ID: 1)
        vestingTypes[1].push(VestingPhase({
            start: 0,
            end: 6 * 30 days,
            percentage: 20
        }));
        vestingTypes[1].push(VestingPhase({
            start: 6 * 30 days,
            end: 18 * 30 days,
            percentage: 35
        }));
        vestingTypes[1].push(VestingPhase({
            start: 18 * 30 days,
            end: 36 * 30 days,
            percentage: 45
        }));
        emit VestingTypeAdded(1);

        // 2. Pre-launch Sale (Type ID: 2)
        // Cliff: 3 months
        vestingTypes[2].push(VestingPhase({
            start: 3 * 30 days, // After cliff at month 3
            end: 3 * 30 days,   // Immediate release at month 3
            percentage: 20
        }));
        vestingTypes[2].push(VestingPhase({
            start: 3 * 30 days,
            end: 6 * 30 days,
            percentage: 35
        }));
        vestingTypes[2].push(VestingPhase({
            start: 6 * 30 days,
            end: 6 * 30 days, // Immediate release at month 6
            percentage: 45
        }));
        emit VestingTypeAdded(2);

        // 3. Bonus for ICO 1 (Type ID: 3)
        // Cliff: 3 months
        vestingTypes[3].push(VestingPhase({
            start: 3 * 30 days,
            end: 4 * 30 days,
            percentage: 20
        }));
        vestingTypes[3].push(VestingPhase({
            start: 4 * 30 days,
            end: 8 * 30 days,
            percentage: 35
        }));
        vestingTypes[3].push(VestingPhase({
            start: 8 * 30 days,
            end: 12 * 30 days,
            percentage: 45
        }));
        emit VestingTypeAdded(3);

        // 4. Bonus for ICO 2 (Type ID: 4)
        // Cliff: 6 months
        vestingTypes[4].push(VestingPhase({
            start: 6 * 30 days, // After cliff at month 6
            end: 6 * 30 days,   // Immediate release at month 6
            percentage: 20
        }));
        vestingTypes[4].push(VestingPhase({
            start: 6 * 30 days,
            end: 9 * 30 days,
            percentage: 35
        }));
        vestingTypes[4].push(VestingPhase({
            start: 9 * 30 days,
            end: 12 * 30 days,
            percentage: 45
        }));
        emit VestingTypeAdded(4);

        // 5. Liquidity Provision and DEX (Type ID: 5)
        vestingTypes[5].push(VestingPhase({
            start: 0,
            end: 6 * 30 days,
            percentage: 20
        }));
        vestingTypes[5].push(VestingPhase({
            start: 6 * 30 days,
            end: 12 * 30 days,
            percentage: 35
        }));
        vestingTypes[5].push(VestingPhase({
            start: 12 * 30 days,
            end: 24 * 30 days,
            percentage: 45
        }));
        emit VestingTypeAdded(5);

        // 6. Marketing (Type ID: 6)
        vestingTypes[6].push(VestingPhase({
            start: 0,
            end: 6 * 30 days,
            percentage: 20
        }));
        vestingTypes[6].push(VestingPhase({
            start: 6 * 30 days,
            end: 18 * 30 days,
            percentage: 35
        }));
        vestingTypes[6].push(VestingPhase({
            start: 18 * 30 days,
            end: 36 * 30 days,
            percentage: 45
        }));
        emit VestingTypeAdded(6);

        // 7. Research & Development (Type ID: 7)
        vestingTypes[7].push(VestingPhase({
            start: 0,
            end: 2 * 30 days,
            percentage: 20
        }));
        vestingTypes[7].push(VestingPhase({
            start: 2 * 30 days,
            end: 4 * 30 days,
            percentage: 35
        }));
        vestingTypes[7].push(VestingPhase({
            start: 4 * 30 days,
            end: 6 * 30 days,
            percentage: 45
        }));
        emit VestingTypeAdded(7);

        // 8. Strategic Partnerships (Type ID: 8)
        // Cliff: 6 months
        vestingTypes[8].push(VestingPhase({
            start: 6 * 30 days, // After cliff at month 6
            end: 6 * 30 days,   // Immediate release at month 6
            percentage: 20
        }));
        vestingTypes[8].push(VestingPhase({
            start: 6 * 30 days,
            end: 12 * 30 days,
            percentage: 35
        }));
        vestingTypes[8].push(VestingPhase({
            start: 12 * 30 days,
            end: 24 * 30 days,
            percentage: 45
        }));
        emit VestingTypeAdded(8);
    }

    /**
     * @notice Allows the owner to add a new vesting type.
     * @param typeId The ID of the vesting type.
     * @param phases The array of VestingPhase structs.
     */
    function addVestingType(
        uint8 typeId,
        VestingPhase[] memory phases
    ) external onlyOwner {
        require(vestingTypes[typeId].length == 0, "Vesting type already exists");

        _validatePhases(phases);

        uint256 totalPercentage;
        for (uint256 i = 0; i < phases.length; i++) {
            require(phases[i].end >= phases[i].start, "Phase end must be after or equal to start");
            totalPercentage += phases[i].percentage;
        }
        require(totalPercentage == 100, "Total percentages must equal 100");

        for (uint256 i = 0; i < phases.length; i++) {
            vestingTypes[typeId].push(phases[i]);
        }

        emit VestingTypeAdded(typeId);
    }

    /**
     * @notice Creates a new vesting schedule for a beneficiary using a predefined vesting type.
     * @dev Only the owner can call this function.
     * @param _beneficiary The address of the beneficiary.
     * @param typeId The ID of the predefined vesting type.
     * @param _amount The total amount of tokens allocated to the beneficiary.
     */
    function createVestingSchedule(
        address _beneficiary,
        uint8 typeId,
        uint256 _amount
    ) external onlyOwner {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(_amount > 0, "Amount must be greater than 0");
        require(vestingSchedules[_beneficiary].startTime == 0, "Vesting schedule already exists");

        VestingPhase[] storage vtPhases = vestingTypes[typeId];
        require(vtPhases.length > 0, "Invalid vesting type");

        require(token.balanceOf(address(this)) >= _amount, "Insufficient contract balance");

        vestingSchedules[_beneficiary].startTime = block.timestamp;
        vestingSchedules[_beneficiary].releasedAmount = 0;
        vestingSchedules[_beneficiary].isDisabled = false;

        for (uint256 i = 0; i < vtPhases.length; i++) {
            vestingSchedules[_beneficiary].phases.push(vtPhases[i]);
        }

        totalAllocation[_beneficiary] = _amount;
        totalAllocated += _amount;

        emit VestingScheduleCreated(_beneficiary, _amount);
    }

    /**
     * @notice Allows a beneficiary to release their vested tokens.
     * @dev The function will revert if no tokens are available for release.
     */
    function release() external {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        require(schedule.startTime != 0, "No vesting schedule for caller");
        require(!schedule.isDisabled, "Vesting schedule is disabled");

        uint256 releasableAmount = calculateReleasableAmount(msg.sender);
        require(releasableAmount > 0, "No tokens available for release");

        schedule.releasedAmount += releasableAmount;
        token.safeTransfer(msg.sender, releasableAmount);

        emit TokensReleased(msg.sender, releasableAmount);
    }

    /**
     * @notice Calculates the amount of tokens that can be released for a beneficiary.
     * @param _beneficiary The address of the beneficiary.
     * @return The amount of tokens that can be released.
     */
    function calculateReleasableAmount(address _beneficiary) public view returns (uint256) {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        if (schedule.startTime == 0 || schedule.isDisabled) {
            return 0;
        }

        uint256 totalVested;
        uint256 currentTime = block.timestamp;
        uint256 startTime = schedule.startTime;
        uint256 allocation = totalAllocation[_beneficiary];

        for (uint256 i = 0; i < schedule.phases.length; i++) {
            VestingPhase storage phase = schedule.phases[i];
            uint256 phaseStartTime = startTime + phase.start;
            uint256 phaseEndTime = startTime + phase.end;

            if (currentTime < phaseStartTime) {
                continue;
            } else if (currentTime >= phaseEndTime) {
                totalVested += (allocation * phase.percentage) / 100;
            } else {
                uint256 phaseDuration = phaseEndTime - phaseStartTime;
                require(phaseDuration > 0, "Invalid phase duration");
                uint256 timeInPhase = currentTime - phaseStartTime;

                uint256 progress = (timeInPhase * 1e18) / phaseDuration;
                uint256 vestedInPhase = (allocation * phase.percentage * progress) / (100 * 1e18);

                totalVested += vestedInPhase;
            }
        }

        return totalVested - schedule.releasedAmount;
    }

    /**
     * @notice Allows the owner to revoke a beneficiary's unvested tokens.
     * @dev Only the owner can call this function.
     *      The function will revert if there are no tokens to revoke.
     * @param _beneficiary The address of the beneficiary to revoke.
     */
    function revokeBeneficiary(address _beneficiary) external onlyOwner {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        require(schedule.startTime != 0, "No vesting schedule for beneficiary");

        uint256 remainingAllocation = totalAllocation[_beneficiary] - schedule.releasedAmount;
        require(remainingAllocation > 0, "No tokens to revoke");

        totalAllocated -= remainingAllocation;
        totalAllocation[_beneficiary] = schedule.releasedAmount;
        delete vestingSchedules[_beneficiary];

        token.safeTransfer(owner(), remainingAllocation);

        emit VestingRevoked(_beneficiary, remainingAllocation);
    }

    /**
     * @notice Allows the owner to withdraw mistakenly sent tokens.
     * @dev Only the owner can call this function.
     *      Cannot withdraw tokens that are allocated for vesting.
     * @param _token The address of the token to withdraw.
     * @param _amount The amount of tokens to withdraw.
     */
    function recoverERC20(address _token, uint256 _amount) external onlyOwner {
        require(_token != address(token), "Cannot recover vested token");
        IERC20(_token).safeTransfer(owner(), _amount);
    }

    /**
     * @notice Returns the total amount of tokens earned (vested) at the current moment
     * @param _beneficiary The address of the beneficiary
     * @return totalVested The total amount of tokens vested so far
     * @return totalReleased The total amount already released to the beneficiary
     * @return releasable The amount that can be released now
     */
    function getVestedAmount(address _beneficiary)
        public
        view
        returns (
            uint256 totalVested,
            uint256 totalReleased,
            uint256 releasable
        )
    {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        if (schedule.startTime == 0 || schedule.isDisabled) {
            return (0, 0, 0);
        }

        uint256 currentTime = block.timestamp;
        uint256 startTime = schedule.startTime;
        uint256 allocation = totalAllocation[_beneficiary];

        for (uint256 i = 0; i < schedule.phases.length; i++) {
            VestingPhase storage phase = schedule.phases[i];
            uint256 phaseStartTime = startTime + phase.start;
            uint256 phaseEndTime = startTime + phase.end;

            if (currentTime < phaseStartTime) {
                continue;
            } else if (currentTime >= phaseEndTime) {
                totalVested += (allocation * phase.percentage) / 100;
            } else {
                uint256 phaseDuration = phaseEndTime - phaseStartTime;
                uint256 timeInPhase = currentTime - phaseStartTime;

                uint256 progress = (timeInPhase * 1e18) / phaseDuration;
                uint256 vestedInPhase = (allocation * phase.percentage * progress) / (100 * 1e18);

                totalVested += vestedInPhase;
            }
        }

        totalReleased = schedule.releasedAmount;
        releasable = totalVested - totalReleased;

        return (totalVested, totalReleased, releasable);
    }

    /**
     * @notice Returns the percentage of tokens vested at the current moment
     * @param _beneficiary The address of the beneficiary
     * @return percentage The percentage of total allocation vested (in basis points, e.g., 5000 = 50%)
     */
    function getVestedPercentage(address _beneficiary) public view returns (uint256 percentage) {
        (uint256 totalVested, , ) = getVestedAmount(_beneficiary);
        if (totalAllocation[_beneficiary] == 0) return 0;

        return (totalVested * 10000) / totalAllocation[_beneficiary];
    }

    function _validatePhases(VestingPhase[] memory phases) internal pure {
        require(phases.length > 0, "Empty phases array");

        for (uint256 i = 1; i < phases.length; i++) {
            require(
                phases[i].start >= phases[i-1].end,
                "Phases must be sequential"
            );
        }
    }

    /**
     * @notice Allows the owner to disable a vesting schedule and create a new one with remaining time.
     * @dev Only the owner can call this function.
     * @param _beneficiary The address of the beneficiary whose schedule is to be disabled.
     */
    function disableVestingSchedule(address _beneficiary, bool _disabled) external onlyOwner {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        require(schedule.startTime != 0, "No vesting schedule for beneficiary");
        require(!schedule.isDisabled, "Schedule already disabled");
        require(_disabled, "Can only disable schedules");

        (uint256 totalVested, uint256 totalReleased, ) = getVestedAmount(_beneficiary);

        uint256 remainingTokens = totalAllocation[_beneficiary] - totalVested;
        uint256 totalAmount = totalAllocation[_beneficiary];

        uint256 originalEndTime = schedule.startTime + schedule.phases[schedule.phases.length - 1].end;
        uint256 currentTime = block.timestamp;
        uint256 remainingTime = originalEndTime > currentTime ? originalEndTime - currentTime : 0;

        if (remainingTime > 0 && remainingTokens > 0) {
            uint256 basePhaseLength = remainingTime / 3;
            uint256 timeRemainder = remainingTime % 3;

            uint256 phase1Length = basePhaseLength;
            uint256 phase2Length = basePhaseLength + (timeRemainder > 0 ? 1 : 0);
            uint256 phase3Length = basePhaseLength + (timeRemainder > 1 ? 1 : 0);

            delete vestingSchedules[_beneficiary].phases;

            uint256 earnedPercentage = (totalVested * 100) / totalAmount;
            uint256 remainingPercentage = 100 - earnedPercentage;

            uint256 baseEarnedPerPhase = earnedPercentage / 3;
            uint256 earnedRemainder = earnedPercentage % 3;

            uint256 phase1EarnedPercentage = baseEarnedPerPhase;
            uint256 phase2EarnedPercentage = baseEarnedPerPhase + (earnedRemainder > 0 ? 1 : 0);

            uint256 phase1Percentage = phase1EarnedPercentage + (remainingPercentage * 20) / 100;
            uint256 phase2Percentage = phase2EarnedPercentage + (remainingPercentage * 35) / 100;
            uint256 phase3Percentage = 100 - phase1Percentage - phase2Percentage;

            vestingSchedules[_beneficiary].phases.push(VestingPhase({
                start: 0,
                end: phase1Length,
                percentage: phase1Percentage
            }));

            vestingSchedules[_beneficiary].phases.push(VestingPhase({
                start: phase1Length,
                end: phase1Length + phase2Length,
                percentage: phase2Percentage
            }));

            vestingSchedules[_beneficiary].phases.push(VestingPhase({
                start: phase1Length + phase2Length,
                end: phase1Length + phase2Length + phase3Length,
                percentage: phase3Percentage
            }));

            vestingSchedules[_beneficiary].startTime = currentTime;
            vestingSchedules[_beneficiary].releasedAmount = totalReleased;
        }

        schedule.isDisabled = true;
        emit VestingScheduleDisabled(_beneficiary);
    }

    function getSchedulePhases(address beneficiary) public view returns (VestingPhase[] memory) {
        return vestingSchedules[beneficiary].phases;
    }

}
