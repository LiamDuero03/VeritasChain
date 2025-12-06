// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VeritasToken.sol";
import "./MinerRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract VeritasCore is Ownable, ReentrancyGuard {

    // ============================
    // STATE VARIABLES
    // ============================
    
    VeritasToken public token;
    MinerRegistry public registry;
    
    // The address of your off-chain Node.js/Python script
    address public aggregator; 

    // Cost to verify one image (e.g., 10 VRT)
    uint256 public verificationFee;

    struct Request {
        uint256 id;
        address requester;
        string imageHash;     // IPFS hash of the image
        bool isFinalized;     // True once Aggregator responds
        bool isAI;            // The final verdict
        uint256 aiConfidence; // 0-100 score
    }

    // Lookup request by ID
    mapping(uint256 => Request) public requests;
    uint256 public nextRequestId;

    // ============================
    // EVENTS (The "API" for off-chain scripts)
    // ============================
    
    event NewRequest(uint256 indexed requestId, string imageHash, address requester);
    event RequestFinalized(uint256 indexed requestId, bool isAI, uint256 confidence);
    event RewardsDistributed(uint256 indexed requestId, uint256 totalPayout);

    // ============================
    // CONSTRUCTOR
    // ============================

    constructor(
        address _token, 
        address _registry, 
        address _aggregator,
        uint256 _fee
    ) Ownable(msg.sender) {
        token = VeritasToken(_token);
        registry = MinerRegistry(_registry);
        aggregator = _aggregator;
        verificationFee = _fee;
    }

    // ============================
    // USER FUNCTIONS
    // ============================

    /**
     * @dev User submits an image hash for verification.
     * They must approve the contract to spend 'verificationFee' VRT first.
     */
    function submitRequest(string memory _imageHash) external nonReentrant {
        // 1. Collect Payment
        bool success = token.transferFrom(msg.sender, address(this), verificationFee);
        require(success, "Payment failed: Check allowance and balance");

        // 2. Create Request
        uint256 reqId = nextRequestId++;
        requests[reqId] = Request({
            id: reqId,
            requester: msg.sender,
            imageHash: _imageHash,
            isFinalized: false,
            isAI: false,
            aiConfidence: 0
        });

        // 3. Emit Event (Aggregator is listening for this!)
        emit NewRequest(reqId, _imageHash, msg.sender);
    }

    // ============================
    // AGGREGATOR FUNCTIONS
    // ============================

    /**
     * @dev Called by your off-chain script after processing miners' results.
     * @param _requestId The ID of the request being finalized.
     * @param _isAI Final binary classification.
     * @param _confidence The weighted average confidence score (0-100).
     * @param _winningMiners List of miners who passed the Honeypot check.
     */
    function finalizeResult(
        uint256 _requestId,
        bool _isAI,
        uint256 _confidence,
        address[] calldata _winningMiners
    ) external nonReentrant {
        require(msg.sender == aggregator, "Only aggregator can finalize");
        Request storage req = requests[_requestId];
        require(!req.isFinalized, "Request already finalized");

        // 1. Update State
        req.isFinalized = true;
        req.isAI = _isAI;
        req.aiConfidence = _confidence;

        // 2. Distribute Rewards
        // Logic: 80% of fee goes to miners, 20% stays in protocol (revenue)
        uint256 minerPool = (verificationFee * 80) / 100;
        
        if (_winningMiners.length > 0) {
            uint256 rewardPerMiner = minerPool / _winningMiners.length;
            
            for (uint i = 0; i < _winningMiners.length; i++) {
                // Double check they are still registered
                if (registry.isMinerEligible(_winningMiners[i])) {
                    token.transfer(_winningMiners[i], rewardPerMiner);
                }
            }
            emit RewardsDistributed(_requestId, minerPool);
        }

        // 3. Emit Finalization Event
        emit RequestFinalized(_requestId, _isAI, _confidence);
    }

    // ============================
    // ADMIN FUNCTIONS
    // ============================

    function setAggregator(address _newAggregator) external onlyOwner {
        aggregator = _newAggregator;
    }

    function setFee(uint256 _newFee) external onlyOwner {
        verificationFee = _newFee;
    }

    /**
     * @dev Withdraw protocol revenue (the 20% remaining from fees).
     */
    function withdrawRevenue() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        token.transfer(owner(), balance);
    }
}