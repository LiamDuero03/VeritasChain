// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./VERIToken.sol"; // Import the token contract

/**
 * @title ValidatorRegistry
 * @dev Manages the Proof of Validation (PoV) consensus mechanics,
 * including validator staking, accuracy recording, and slashing.
 * This contract is the core of the PoV mechanism.
 */
contract ValidatorRegistry is Ownable {
    // Structural constants as defined in the paper's mechanism
    uint256 public constant MIN_STAKE = 100_000 ether; // 100,000 VERI (using 18 decimal places)
    uint256 public constant UNBONDING_PERIOD = 7 days; // Stake is locked for 7 days after unbond request

    // --- State Variables ---

    struct Validator {
        uint256 stake;             // Amount of VERI staked
        uint256 lastEpochAccuracy; // Placeholder for the last recorded PoV accuracy (0 to 10000, representing 0% to 100.00%)
        uint256 unbondRequestTime; // Timestamp of the last unbond request (0 if not pending)
        bool isRegistered;         // Flag to confirm registration
    }

    // Mapping from validator address to their Validator struct
    mapping(address => Validator) public validators;
    // Array of registered validator addresses
    address[] public validatorAddresses;

    // Reference to the VERI Token contract
    VERIToken public veriToken;

    // --- Events ---

    event ValidatorRegistered(address indexed validator, uint256 stake);
    event StakeAdded(address indexed validator, uint256 newStake);
    event UnbondRequested(address indexed validator, uint256 requestTime);
    event StakeWithdrawn(address indexed validator, uint256 withdrawnAmount);
    event ValidatorSlashed(address indexed validator, uint256 slashedAmount);
    event AccuracyRecorded(address indexed validator, uint256 accuracy);

    // --- Errors ---

    error AlreadyRegistered();
    error NotRegistered();
    error StakeTooLow();
    error UnbondAlreadyPending();
    error UnbondNotPending();
    error UnbondingPeriodNotPassed();
    error InvalidAccuracy();
    error ZeroStake();

    /**
     * @dev Constructor sets the VERI token contract address.
     * @param _veriTokenAddress The address of the deployed VERIToken contract.
     */
    constructor(address _veriTokenAddress) Ownable(msg.sender) {
        veriToken = VERIToken(_veriTokenAddress);
    }

    // --- Public Functions ---

    /**
     * @dev Allows a user to register as a validator.
     * The user must approve this contract to spend at least MIN_STAKE VERI tokens beforehand.
     */
    function registerValidator() public {
        if (validators[msg.sender].isRegistered) revert AlreadyRegistered();

        // Transfer MIN_STAKE from the caller to this contract (the staking pool)
        if (!veriToken.transferFrom(msg.sender, address(this), MIN_STAKE)) {
            revert StakeTooLow();
        }

        validators[msg.sender] = Validator({
            stake: MIN_STAKE,
            lastEpochAccuracy: 0,
            unbondRequestTime: 0,
            isRegistered: true
        });

        validatorAddresses.push(msg.sender);

        emit ValidatorRegistered(msg.sender, MIN_STAKE);
    }

    /**
     * @dev Allows a validator to increase their stake.
     * @param amount The additional amount of VERI to stake.
     */
    function addStake(uint256 amount) public {
        if (!validators[msg.sender].isRegistered) revert NotRegistered();
        if (amount == 0) revert ZeroStake();

        // Transfer the additional stake from the caller
        if (!veriToken.transferFrom(msg.sender, address(this), amount)) {
            revert("Stake transfer failed");
        }

        validators[msg.sender].stake += amount;

        emit StakeAdded(msg.sender, validators[msg.sender].stake);
    }

    /**
     * @dev Starts the unbonding process for the full stake.
     */
    function requestUnbond() public {
        if (!validators[msg.sender].isRegistered) revert NotRegistered();
        if (validators[msg.sender].unbondRequestTime != 0) revert UnbondAlreadyPending();

        validators[msg.sender].unbondRequestTime = block.timestamp;

        emit UnbondRequested(msg.sender, block.timestamp);
    }

    /**
     * @dev Finalizes the unbonding process and withdraws the stake.
     * Can only be called after the UNBONDING_PERIOD has passed since the request.
     */
    function withdrawStake() public {
        Validator storage validator = validators[msg.sender];

        if (!validator.isRegistered) revert NotRegistered();
        if (validator.unbondRequestTime == 0) revert UnbondNotPending();

        if (block.timestamp < validator.unbondRequestTime + UNBONDING_PERIOD) {
            revert UnbondingPeriodNotPassed();
        }

        uint256 amountToWithdraw = validator.stake;
        address payable recipient = payable(msg.sender);

        // Reset validator state
        validator.stake = 0;
        validator.lastEpochAccuracy = 0;
        validator.unbondRequestTime = 0;
        validator.isRegistered = false;

        // Note: Removing from dynamic array is inefficient, but acceptable for an MVP
        // In a real protocol, a linked list or similar structure would be used.
        for (uint i = 0; i < validatorAddresses.length; i++) {
            if (validatorAddresses[i] == msg.sender) {
                // Swap the last element into the position of the deleted element
                // and pop the last element to maintain array structure efficiently.
                validatorAddresses[i] = validatorAddresses[validatorAddresses.length - 1];
                validatorAddresses.pop();
                break;
            }
        }

        // Return the full staked amount
        if (!veriToken.transfer(recipient, amountToWithdraw)) {
            revert("Withdrawal transfer failed");
        }

        emit StakeWithdrawn(msg.sender, amountToWithdraw);
    }

    // --- Protocol-Only Functions (Only Owner for MVP) ---

    /**
     * @dev Owner simulates the protocol recording a validator's accuracy score
     * after a Proof of Validation epoch.
     * @param validator The address of the validator.
     * @param accuracyScore The score (0 to 10000, e.g., 9400 for 94.00%).
     */
    function recordAccuracy(address validator, uint256 accuracyScore) public onlyOwner {
        if (!validators[validator].isRegistered) revert NotRegistered();
        if (accuracyScore > 10000) revert InvalidAccuracy();

        validators[validator].lastEpochAccuracy = accuracyScore;

        emit AccuracyRecorded(validator, accuracyScore);
    }

    /**
     * @dev Owner simulates the protocol slashing a validator for poor performance or malicious activity.
     * @param validator The address of the validator to slash.
     * @param percentage The percentage of the stake to slash (e.g., 50 for 50%).
     */
    function slashValidator(address validator, uint256 percentage) public onlyOwner {
        Validator storage v = validators[validator];
        if (!v.isRegistered) revert NotRegistered();
        if (percentage > 100) revert("Slash percentage cannot exceed 100");

        uint256 slashAmount = (v.stake * percentage) / 100;

        v.stake -= slashAmount;

        // Slash tokens by sending them to the zero address (burn)
        // In a real implementation, the tokens would be burned or sent to a treasury.
        address payable recipient = payable(0x000000000000000000000000000000000000dEaD);

        // Transfer the slashed amount out of the staking pool
        if (!veriToken.transfer(recipient, slashAmount)) {
            revert("Slash transfer failed");
        }

        emit ValidatorSlashed(validator, slashAmount);
    }

    /**
     * @dev Owner simulates the protocol distributing block rewards (newly minted tokens).
     * In a real system, this would be integrated into the epoch leader election logic.
     * @param validator The validator receiving the reward.
     * @param amount The amount of VERI to reward.
     */
    function distributeReward(address validator, uint256 amount) public onlyOwner {
        // This function assumes the owner has set the protocol address on the VERIToken contract
        // and is simulating the protocol's minting authority.
        veriToken.mint(validator, amount);
    }
}