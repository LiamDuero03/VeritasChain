// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./VERIToken.sol"; // Import the token contract

/**
 * @title CertificationRegistry
 * @dev Manages the content certification workflow, fee collection,
 * and immutable storage of attestation records.
 *
 * MODIFICATIONS FOR POC:
 * - Added CertificationStatus to track PENDING vs. CERTIFIED states.
 * - Added finalClassification to store the Proof of Validation outcome.
 * - Added finalizeCertification to simulate the PoV consensus result.
 */
contract CertificationRegistry is Ownable {
    // Fees for different content types (using 18 decimal places for VERI)
    uint256 public constant IMAGE_FEE = 0.01 ether; // 0.01 VERI
    uint256 public constant VIDEO_FEE_PER_MINUTE = 0.10 ether; // 0.10 VERI
    uint256 public constant PROTOCOL_FEE_BURN_PERCENTAGE = 20; // 20% of fees are burned

    // --- Data Structures ---
    enum ContentType { Image, Video }
    enum CertificationStatus { Pending, CertifiedAuthentic, CertifiedAI }

    struct Certification {
        bytes32 contentHash;              // Unique identifier for the content
        address requester;                // Address that requested the certification
        ContentType contentType;          // Type of content
        uint256 submissionTimestamp;      // Time of fee payment
        CertificationStatus status;       // Current status (Pending, Authentic, AI)
        address finalValidator;           // The validator (leader) who finalized this result
        uint256 finalizationTimestamp;    // Time when consensus was reached
    }

    // Mapping from content hash to its certification details
    mapping(bytes32 => Certification) public certifications;
    // Array to store all content hashes in order
    bytes32[] public certifiedContentHashes;

    // --- State Variables ---

    VERIToken public veriToken;
    address public validatorRegistryAddress; // For distributing the 80% validator share

    // --- Events ---

    event ContentCertifiedSubmitted(bytes32 indexed contentHash, address indexed requester, uint256 totalFee);
    event ContentCertifiedFinalized(bytes32 indexed contentHash, CertificationStatus indexed status, address finalValidator);
    event FeeBurned(uint256 amount);
    event ValidatorShareDistributed(uint256 amount);

    // --- Errors ---

    error AlreadyCertified();
    error FeeTooLow(uint256 requiredFee);
    error ZeroAddress();
    error NotPending();
    error InvalidStatus();

    /**
     * @dev Constructor sets the token and validator registry addresses.
     */
    constructor(address _veriTokenAddress, address _validatorRegistryAddress) Ownable(msg.sender) {
        if (_veriTokenAddress == address(0) || _validatorRegistryAddress == address(0)) revert ZeroAddress();
        veriToken = VERIToken(_veriTokenAddress);
        validatorRegistryAddress = _validatorRegistryAddress;
    }

    // --- Public Functions ---

    /**
     * @dev Allows a Requester to submit content for validation.
     * Content enters the PENDING state upon successful fee payment.
     */
    function submitCertification(
        bytes32 contentHash,
        ContentType contentType,
        uint256 videoMinutes,
        uint256 feeAmount
    ) public {
        // 1. Check if already certified
        if (certifications[contentHash].requester != address(0)) revert AlreadyCertified();

        // 2. Calculate required fee
        uint256 requiredFee;
        if (contentType == ContentType.Image) {
            requiredFee = IMAGE_FEE;
        } else if (contentType == ContentType.Video) {
            // Assume videoMinutes is > 0 for video types
            requiredFee = VIDEO_FEE_PER_MINUTE * videoMinutes;
        }

        // 3. Validate fee amount
        if (feeAmount < requiredFee) {
            revert FeeTooLow(requiredFee);
        }

        // 4. Transfer the fee from the Requester to this contract
        if (!veriToken.transferFrom(msg.sender, address(this), feeAmount)) {
            revert("Fee transfer failed");
        }

        // 5. Distribute fees (Burn and Validator Share)
        distributeFees(feeAmount);

        // 6. Record the PENDING certification
        certifications[contentHash] = Certification({
            contentHash: contentHash,
            requester: msg.sender,
            contentType: contentType,
            submissionTimestamp: block.timestamp,
            status: CertificationStatus.Pending, // Initial state is PENDING
            finalValidator: address(0),
            finalizationTimestamp: 0
        });

        certifiedContentHashes.push(contentHash);

        emit ContentCertifiedSubmitted(contentHash, msg.sender, feeAmount);
    }

    // --- Protocol (Owner) Functions ---

    /**
     * @dev Owner (simulating the Protocol Leader/Block Producer) finalizes a certification
     * after the Proof of Validation consensus has determined the true classification.
     * This function models the block production phase of PoV.
     * @param contentHash The cryptographic hash of the content being certified.
     * @param finalStatus The final classification (2=Authentic, 3=AI).
     * @param leaderAddress The address of the validator who was elected leader and finalized this block.
     */
    function finalizeCertification(
        bytes32 contentHash,
        CertificationStatus finalStatus,
        address leaderAddress
    ) public onlyOwner {
        Certification storage cert = certifications[contentHash];

        // 1. Check if the certification is still pending
        if (cert.requester == address(0)) revert("Certification not found");
        if (cert.status != CertificationStatus.Pending) revert NotPending();

        // 2. Validate status integrity (must be an outcome, not Pending)
        if (finalStatus == CertificationStatus.Pending || finalStatus > CertificationStatus.CertifiedAI) {
            revert InvalidStatus();
        }

        // 3. Update the certification record with the consensus outcome
        cert.status = finalStatus;
        cert.finalValidator = leaderAddress;
        cert.finalizationTimestamp = block.timestamp;

        emit ContentCertifiedFinalized(contentHash, finalStatus, leaderAddress);

        // NOTE: The reward distribution for this specific task is handled by
        // the separate reward distribution in ValidatorRegistry, tied to the leader's overall accuracy.
    }

    // --- Internal/Getter Functions ---

    /**
     * @dev Internal function to handle the fee distribution logic:
     * 80% to Validator Share (sent to ValidatorRegistry), 20% Burn.
     */
    function distributeFees(uint256 totalFee) internal {
        // Calculate the burn amount (20% of totalFee)
        uint256 burnAmount = (totalFee * PROTOCOL_FEE_BURN_PERCENTAGE) / 100;
        // The remaining 80% is the validator share
        uint256 validatorShare = totalFee - burnAmount;

        // 1. Burn the 20% share by sending to the dead address
        address payable deadAddress = payable(0x000000000000000000000000000000000000dEaD);

        if (!veriToken.transfer(deadAddress, burnAmount)) {
            revert("Burn transfer failed");
        }

        emit FeeBurned(burnAmount);

        // 2. Send the 80% validator share to the ValidatorRegistry
        if (!veriToken.transfer(validatorRegistryAddress, validatorShare)) {
            revert("Validator share transfer failed");
        }

        emit ValidatorShareDistributed(validatorShare);
    }

    function getCertifiedContentCount() public view returns (uint256) {
        return certifiedContentHashes.length;
    }
}