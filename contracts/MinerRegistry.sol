// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VeritasToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Miner Registry
 * @dev Manages miner identities, staking, and on-chain reputation.
 * - Miners must stake VRT to participate.
 * - The 'Owner' (Aggregator/Core) automatically updates reputation based on performance.
 */
contract MinerRegistry is Ownable {
    
    VeritasToken public token;

    // Minimum amount of VRT required to be a miner
    uint256 public minimumStake;

    struct Miner {
        bool isRegistered;
        uint256 stakedAmount;
        uint256 reputationScore;       // 0 to 100 (Current "Credit Score")
        uint256 totalRequestsProcessed;
        uint256 successfulJobs;        // Permanent Record of Wins
        uint256 failedJobs;            // Permanent Record of Losses
    }

    mapping(address => Miner) public miners;
    address[] public minerList; 

    // Events
    event MinerRegistered(address indexed miner, uint256 amount);
    event MinerDeregistered(address indexed miner, uint256 amount);
    event MinerSlashed(address indexed miner, uint256 amount, string reason);
    event ReputationUpdated(address indexed miner, uint256 newScore, bool passedHoneypot);

    constructor(address _tokenAddress, uint256 _minStake) Ownable(msg.sender) {
        token = VeritasToken(_tokenAddress);
        minimumStake = _minStake;
    }

    /**
     * @dev Allows a user to register as a miner by staking VRT.
     */
    function registerMiner(uint256 _amount) external {
        require(_amount >= minimumStake, "Insufficient stake amount");
        require(!miners[msg.sender].isRegistered, "Already registered");

        bool success = token.transferFrom(msg.sender, address(this), _amount);
        require(success, "Token transfer failed");

        miners[msg.sender] = Miner({
            isRegistered: true,
            stakedAmount: _amount,
            reputationScore: 50, // Start neutral (50/100) instead of perfect
            totalRequestsProcessed: 0,
            successfulJobs: 0,
            failedJobs: 0
        });

        minerList.push(msg.sender);
        emit MinerRegistered(msg.sender, _amount);
    }

    /**
     * @dev Allows a miner to leave the network and retrieve their stake.
     */
    function deregisterMiner() external {
        require(miners[msg.sender].isRegistered, "Not a registered miner");
        
        uint256 amountToReturn = miners[msg.sender].stakedAmount;
        
        delete miners[msg.sender];

        // Simplified array removal
        for (uint i = 0; i < minerList.length; i++) {
            if (minerList[i] == msg.sender) {
                minerList[i] = minerList[minerList.length - 1];
                minerList.pop();
                break;
            }
        }

        bool success = token.transfer(msg.sender, amountToReturn);
        require(success, "Token transfer failed");

        emit MinerDeregistered(msg.sender, amountToReturn);
    }

    // ==========================================
    // ADMIN / AGGREGATOR FUNCTIONS
    // ==========================================

    /**
     * @dev Called by Aggregator/Core when a job is finished. 
     * This moves the "Reputation Logic" ON-CHAIN.
     */
    function updateMinerPerformance(address _minerAddress, bool _passedHoneypot) external onlyOwner {
        require(miners[_minerAddress].isRegistered, "Miner not found");
        
        Miner storage m = miners[_minerAddress];
        m.totalRequestsProcessed++;

        if (_passedHoneypot) {
            // --- SUCCESS LOGIC ---
            m.successfulJobs++;
            
            // Gain +1 reputation, capped at 100
            if (m.reputationScore < 100) {
                m.reputationScore += 1;
            }
        } else {
            // --- FAILURE LOGIC ---
            m.failedJobs++;

            // Lose -5 reputation (Heavy penalty for getting it wrong)
            // Safety check to prevent underflow (going below 0)
            if (m.reputationScore >= 5) {
                m.reputationScore -= 5;
            } else {
                m.reputationScore = 0;
            }
        }
        
        emit ReputationUpdated(_minerAddress, m.reputationScore, _passedHoneypot);
    }

    /**
     * @dev Called by Aggregator to slash tokens for malicious behavior.
     */
    function slashMiner(address _minerAddress, uint256 _amount, string memory _reason) external onlyOwner {
        require(miners[_minerAddress].isRegistered, "Miner not found");
        require(miners[_minerAddress].stakedAmount >= _amount, "Stake too low to slash");

        miners[_minerAddress].stakedAmount -= _amount;
        token.burn(_amount);

        // Auto-kick if stake is too low
        if (miners[_minerAddress].stakedAmount < minimumStake) {
            miners[_minerAddress].isRegistered = false;
        }

        emit MinerSlashed(_minerAddress, _amount, _reason);
    }

    /**
     * @dev View function for DApps to show miner stats
     */
    function getMinerStats(address _miner) external view returns (uint256 score, uint256 wins, uint256 losses) {
        return (miners[_miner].reputationScore, miners[_miner].successfulJobs, miners[_miner].failedJobs);
    }

    function isMinerEligible(address _miner) external view returns (bool) {
        // Example: Must be registered AND have a reputation score > 20 to work
        return miners[_miner].isRegistered && 
               miners[_miner].stakedAmount >= minimumStake &&
               miners[_miner].reputationScore > 20; 
    }
}