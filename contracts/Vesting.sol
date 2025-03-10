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

    /// @notice Emitted when a vesting schedule is disabled.
    /// @param beneficiary The address of the beneficiary whose schedule is disabled.
    event VestingScheduleDisabled(address indexed beneficiary);

    /// @notice Flag to track if vesting schedules have been initialized
    bool public vestingInitialized;

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
            totalPercentage += phases[i].percentage;
        }
        require(totalPercentage == 100, "Total percentages must equal 100");

        for (uint256 i = 0; i < phases.length; i++) {
            vestingTypes[typeId].push(phases[i]);
        }

        emit VestingTypeAdded(typeId);
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
     * @notice Allows the owner to disable a vesting schedule, release any currently vested tokens to the beneficiary, and revoke their claim to unvested tokens.
     * @dev Only the owner can call this function. This will release any currently vested tokens
     *      to the beneficiary and remove their claim to any unvested tokens.
     * @param _beneficiary The address of the beneficiary whose schedule is to be disabled.
     */
    function disableVestingSchedule(address _beneficiary) external onlyOwner {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        require(schedule.startTime != 0, "No vesting schedule for beneficiary");
        require(!schedule.isDisabled, "Schedule already disabled");

        (uint256 totalVested, uint256 totalReleased, uint256 releasable) = getVestedAmount(_beneficiary);
        
        if (releasable > 0) {
            schedule.releasedAmount += releasable;
            token.safeTransfer(_beneficiary, releasable);
            emit TokensReleased(_beneficiary, releasable);
        }

        uint256 remainingTokens = totalAllocation[_beneficiary] - totalVested;
        totalAllocated -= remainingTokens;
        totalAllocation[_beneficiary] = totalVested;

        schedule.isDisabled = true;
        emit VestingScheduleDisabled(_beneficiary);
    }

    function getSchedulePhases(address beneficiary) public view returns (VestingPhase[] memory) {
        return vestingSchedules[beneficiary].phases;
    }

    /**
     * @notice Internal function to create a vesting schedule for a beneficiary.
     * @param _beneficiary The address of the beneficiary.
     * @param _amount The total token allocation for the beneficiary.
     * @param _typeId The ID of the vesting type to use.
     * @param _startTime The start time of the vesting schedule.
     */
    function _createVestingSchedule(
        address _beneficiary,
        uint256 _amount,
        uint8 _typeId,
        uint256 _startTime
    ) internal {
        require(_beneficiary != address(0), "Beneficiary cannot be zero address");
        require(_amount > 0, "Amount must be greater than 0");
        require(vestingTypes[_typeId].length > 0, "Invalid vesting type");
        require(vestingSchedules[_beneficiary].startTime == 0, "Vesting schedule already exists");
        
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        schedule.startTime = _startTime;
        schedule.releasedAmount = 0;
        schedule.isDisabled = false;
        
        VestingPhase[] storage phases = vestingTypes[_typeId];
        for (uint256 i = 0; i < phases.length; i++) {
            schedule.phases.push(phases[i]);
        }
        
        totalAllocation[_beneficiary] = _amount;
        totalAllocated += _amount;
        
        emit VestingScheduleCreated(_beneficiary, _amount);
    }

    /**
     * @notice Allows the owner to create multiple vesting schedules in a single transaction.
     * @dev Can only be called once by the owner.
     * @param _beneficiaries Array of beneficiary addresses.
     * @param _amounts Array of token allocations.
     * @param _typeIds Array of vesting type IDs.
     * @param _startTime The start time for all vesting schedules (0 for current time).
     */
    function initializeVestingSchedules(
        address[] calldata _beneficiaries,
        uint256[] calldata _amounts,
        uint8[] calldata _typeIds,
        uint256 _startTime
    ) external onlyOwner {
        require(!vestingInitialized, "Vesting already initialized");
        require(_beneficiaries.length == _amounts.length, "Arrays length mismatch");
        require(_beneficiaries.length == _typeIds.length, "Arrays length mismatch");
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < _amounts.length; i++) {
            totalAmount += _amounts[i];
        }
        
        uint256 contractBalance = token.balanceOf(address(this));
        require(contractBalance >= totalAllocated + totalAmount, "Insufficient token balance");
        
        uint256 startTime = _startTime == 0 ? block.timestamp : _startTime;
        
        for (uint256 i = 0; i < _beneficiaries.length; i++) {
            _createVestingSchedule(_beneficiaries[i], _amounts[i], _typeIds[i], startTime);
        }
        
        vestingInitialized = true;
    }
}
