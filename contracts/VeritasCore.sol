// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VeritasToken.sol";
import "./MinerRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract VeritasCore is Ownable, ReentrancyGuard {

    VeritasToken public token;
    MinerRegistry public registry;
    address public aggregator; 
    uint256 public verificationFee;

    struct Request {
        uint256 id;
        address requester;
        string imageHash;
        bool isFinalized;
        bool isAI;
        uint256 aiConfidence;
    }

    mapping(uint256 => Request) public requests;
    uint256 public nextRequestId;

    event NewRequest(uint256 indexed requestId, string imageHash, address requester);
    event RequestFinalized(uint256 indexed requestId, bool isAI, uint256 confidence);
    event RewardsDistributed(uint256 indexed requestId, uint256 totalPayout);

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

    function submitRequest(string memory _imageHash) external nonReentrant {
        bool success = token.transferFrom(msg.sender, address(this), verificationFee);
        require(success, "Payment failed: Check allowance and balance");

        uint256 reqId = nextRequestId++;
        requests[reqId] = Request({
            id: reqId,
            requester: msg.sender,
            imageHash: _imageHash,
            isFinalized: false,
            isAI: false,
            aiConfidence: 0
        });

        emit NewRequest(reqId, _imageHash, msg.sender);
    }

    /**
     * @dev UPDATED: Now accepts specific reward amounts for Proportional Distribution
     */
    function finalizeResult(
        uint256 _requestId,
        bool _isAI,
        uint256 _confidence,
        address[] calldata _winningMiners,
        uint256[] calldata _minerRewards // <--- NEW ARGUMENT
    ) external nonReentrant {
        require(msg.sender == aggregator, "Only aggregator can finalize");
        Request storage req = requests[_requestId];
        require(!req.isFinalized, "Request already finalized");
        require(_winningMiners.length == _minerRewards.length, "Miners and Rewards mismatch");
        require(_winningMiners.length <= 50, "Batch too large");

        req.isFinalized = true;
        req.isAI = _isAI;
        req.aiConfidence = _confidence;

        // Payout Loop
        uint256 totalPayout = 0;
        for (uint i = 0; i < _winningMiners.length; i++) {
            if (registry.isMinerEligible(_winningMiners[i])) {
                token.transfer(_winningMiners[i], _minerRewards[i]);
                totalPayout += _minerRewards[i];
            }
        }

        if (totalPayout > 0) {
            emit RewardsDistributed(_requestId, totalPayout);
        }

        emit RequestFinalized(_requestId, _isAI, _confidence);
    }

    // Admin Functions
    function setAggregator(address _newAggregator) external onlyOwner { aggregator = _newAggregator; }
    function setFee(uint256 _newFee) external onlyOwner { verificationFee = _newFee; }
    function withdrawRevenue() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        token.transfer(owner(), balance);
    }
}