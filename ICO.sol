// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title FibonICO
 * @dev A contract for conducting an ICO with multiple phases and vesting schedules.
 */
contract FibonICO is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The token being sold in the ICO.
    IERC20 public token;

    /// @notice The exchange rate between ETH and tokens.
    uint256 public rate;

    /// @notice The start time of the ICO.
    uint256 public startTime;

    /// @notice The end time of the ICO.
    uint256 public endTime;

    /// @notice The maximum amount of ETH to be raised.
    uint256 public hardCap;

    /// @notice The total amount of ETH raised so far.
    uint256 public totalRaised;

    /// @notice The cliff period before pre-launch tokens can be claimed.
    uint256 public constant PRELAUNCH_CLIFF = 90 days;

    /// @notice The vesting period over which pre-launch tokens are released.
    uint256 public constant PRELAUNCH_VESTING = 90 days;

    /// @notice Represents a phase in the ICO.
    struct Phase {
        uint256 supply;     // Total supply allocated to the phase.
        uint256 sold;       // Amount sold in the phase.
        uint256 startTime;  // Start time of the phase.
        uint256 endTime;    // End time of the phase.
    }

    /// @notice The pre-launch sale phase.
    Phase public preLaunchSale;

    /// @notice ICO phase 1.
    Phase public ico1;

    /// @notice ICO phase 2.
    Phase public ico2;

    /// @notice ICO phase 3.
    Phase public ico3;

    /// @notice Mapping of address to amount of tokens purchased during pre-launch.
    mapping(address => uint256) public preLaunchPurchases;

    /// @notice Mapping of address to the time after which they can start claiming tokens.
    mapping(address => uint256) public preLaunchClaimTime;

    /// @notice Mapping of address to the amount of tokens already claimed.
    mapping(address => uint256) public claimedTokens;

    /// @notice Event emitted when tokens are purchased.
    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost, uint8 phase);

    /// @notice Event emitted when tokens are claimed.
    event TokensClaimed(address indexed buyer, uint256 amount);

    /// @notice Event emitted when the rate is updated.
    event RateUpdated(uint256 newRate);

    /// @notice Event emitted when the ICO times are updated.
    event TimesUpdated(uint256 newStartTime, uint256 newEndTime);

    /// @notice Event emitted when ETH is received by the contract.
    event EthReceived(address indexed sender, uint256 amount);

    /**
     * @dev Initializes the contract with initial parameters.
     * @param _token The ERC20 token being sold.
     * @param _rate The exchange rate between ETH and tokens.
     * @param _startTime The start time of the ICO.
     * @param _endTime The end time of the ICO.
     * @param _hardCap The maximum amount of ETH to be raised.
     */
    constructor(
        IERC20 _token,
        uint256 _rate,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _hardCap
    ) Ownable(msg.sender) {
        token = _token;
        rate = _rate;
        startTime = _startTime;
        endTime = _endTime;
        hardCap = _hardCap;

        // Initialize phases
        preLaunchSale = Phase(58820000 * 10**18, 0, _startTime, _startTime + 30 days);
        ico1 = Phase(58820000 * 10**18, 0, _startTime + 30 days, _startTime + 60 days);
        ico2 = Phase(44000000 * 10**18, 0, _startTime + 60 days, _startTime + 90 days);
        ico3 = Phase(25176000 * 10**18, 0, _startTime + 90 days, _endTime);
    }

    /**
     * @notice Allows users to purchase tokens during the ICO phases.
     * @param _phase The phase during which tokens are being purchased (0 for pre-launch, 1-3 for ICO phases).
     */
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

        emit EthReceived(msg.sender, msg.value);

        if (_phase == 0) {
            preLaunchPurchases[msg.sender] += tokens;
            if (preLaunchClaimTime[msg.sender] == 0) {
                preLaunchClaimTime[msg.sender] = preLaunchSale.endTime + PRELAUNCH_CLIFF;
            }
        } else {
            token.safeTransfer(msg.sender, tokens);
        }

        emit TokensPurchased(msg.sender, tokens, msg.value, _phase);
    }

    /**
     * @notice Allows users to claim their vested pre-launch tokens after the cliff period.
     */
    function claimPreLaunchTokens() external nonReentrant {
        require(block.timestamp >= preLaunchClaimTime[msg.sender], "Cliff period not over");
        uint256 claimableAmount = calculateClaimableAmount(msg.sender);
        require(claimableAmount > 0, "No tokens to claim");

        claimedTokens[msg.sender] += claimableAmount;
        token.safeTransfer(msg.sender, claimableAmount);

        emit TokensClaimed(msg.sender, claimableAmount);
    }

    /**
     * @notice Calculates the amount of tokens a user can claim based on the vesting schedule.
     * @param _buyer The address of the user.
     * @return The amount of tokens that can be claimed.
     */
    function calculateClaimableAmount(address _buyer) public view returns (uint256) {
        if (block.timestamp < preLaunchClaimTime[_buyer]) {
            return 0;
        }

        uint256 totalVestingTime = PRELAUNCH_VESTING;
        uint256 elapsedTime = block.timestamp - preLaunchClaimTime[_buyer];

        uint256 totalVestedAmount;
        if (elapsedTime >= totalVestingTime) {
            totalVestedAmount = preLaunchPurchases[_buyer];
        } else {
            totalVestedAmount = (preLaunchPurchases[_buyer] * elapsedTime) / totalVestingTime;
        }

        return totalVestedAmount - claimedTokens[_buyer];
    }

    /**
     * @notice Retrieves the phase information based on the phase index.
     * @param _phase The index of the phase (0 for pre-launch, 1-3 for ICO phases).
     * @return The Phase struct corresponding to the phase index.
     */
    function getPhase(uint8 _phase) internal view returns (Phase storage) {
        if (_phase == 0) return preLaunchSale;
        if (_phase == 1) return ico1;
        if (_phase == 2) return ico2;
        if (_phase == 3) return ico3;
        revert("Invalid phase");
    }

    /**
     * @notice Allows the owner to withdraw the raised funds after the ICO has ended to a specified address.
     * @param _recipient The address to receive the withdrawn funds.
     */
    function withdrawFunds(address payable _recipient) external onlyOwner {
        require(block.timestamp > endTime, "ICO has not ended yet");
        require(_recipient != address(0), "Invalid recipient address");
        uint256 balance = address(this).balance;
        _recipient.transfer(balance);
    }

    /**
     * @notice Allows the owner to update the exchange rate between ETH and tokens.
     * @param newRate The new exchange rate.
     */
    function updateRate(uint256 newRate) external onlyOwner {
        rate = newRate;
        emit RateUpdated(newRate);
    }

    /**
     * @notice Allows the owner to extend the end time of the ICO.
     * @param newEndTime The new end time of the ICO.
     */
    function extendEndTime(uint256 newEndTime) external onlyOwner {
        require(newEndTime > endTime, "New end time must be after current end time");
        endTime = newEndTime;
        emit TimesUpdated(startTime, newEndTime);
    }

    /**
     * @notice Receive function to accept Ether.
     * @dev Emits a EthReceived event when ETH is received.
     */
    receive() external payable {
        emit EthReceived(msg.sender, msg.value);
    }

    /**
     * @notice Fallback function called for all messages sent to this contract, except plain Ether transfers.
     */
    fallback() external payable {
        revert("FibonICO: Function does not exist or invalid data sent");
    }
}
