// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VeritasToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MinerRegistry is Ownable {
    
    VeritasToken public token;
    uint256 public minimumStake;

    struct Miner {
        bool isRegistered;
        uint256 stakedAmount;
        uint256 reputationScore;
        uint256 totalRequestsProcessed;
        uint256 successfulJobs;
        uint256 failedJobs;
    }

    mapping(address => Miner) public miners;
    address[] public minerList; 

    event MinerRegistered(address indexed miner, uint256 amount);
    event MinerDeregistered(address indexed miner, uint256 amount);
    event MinerSlashed(address indexed miner, uint256 amount, string reason);
    event ReputationUpdated(address indexed miner, uint256 newScore, bool passedHoneypot);

    constructor(address _tokenAddress, uint256 _minStake) Ownable(msg.sender) {
        token = VeritasToken(_tokenAddress);
        minimumStake = _minStake;
    }

    function registerMiner(uint256 _amount) external {
        require(_amount >= minimumStake, "Insufficient stake amount");
        require(!miners[msg.sender].isRegistered, "Already registered");

        bool success = token.transferFrom(msg.sender, address(this), _amount);
        require(success, "Token transfer failed");

        miners[msg.sender] = Miner({
            isRegistered: true,
            stakedAmount: _amount,
            reputationScore: 50,
            totalRequestsProcessed: 0,
            successfulJobs: 0,
            failedJobs: 0
        });

        minerList.push(msg.sender);
        emit MinerRegistered(msg.sender, _amount);
    }

    function deregisterMiner() external {
        require(miners[msg.sender].isRegistered, "Not a registered miner");
        
        uint256 amountToReturn = miners[msg.sender].stakedAmount;
        delete miners[msg.sender];

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

    function updateMinerPerformance(address _minerAddress, bool _passedHoneypot) external onlyOwner {
        require(miners[_minerAddress].isRegistered, "Miner not found");
        
        Miner storage m = miners[_minerAddress];
        m.totalRequestsProcessed++;

        if (_passedHoneypot) {
            m.successfulJobs++;
            if (m.reputationScore < 100) m.reputationScore += 1;
        } else {
            m.failedJobs++;
            if (m.reputationScore >= 5) m.reputationScore -= 5;
            else m.reputationScore = 0;
        }
        
        emit ReputationUpdated(_minerAddress, m.reputationScore, _passedHoneypot);
    }

    function getMinerStats(address _miner) external view returns (uint256 score, uint256 wins, uint256 losses) {
        return (miners[_miner].reputationScore, miners[_miner].successfulJobs, miners[_miner].failedJobs);
    }

    function isMinerEligible(address _miner) external view returns (bool) {
        return miners[_miner].isRegistered && 
               miners[_miner].stakedAmount >= minimumStake &&
               miners[_miner].reputationScore > 20; 
    }
}