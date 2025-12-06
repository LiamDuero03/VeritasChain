// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VeritasToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Miner Registry
 * @dev Manages miner identities, staking, and reputation.
 * - Miners must stake VRT to participate.
 * - The 'Owner' (Aggregator/Core Contract) can slash stakes for poor performance.
 */
contract MinerRegistry is Ownable {
    
    VeritasToken public token;

    // Minimum amount of VRT required to be a miner
    uint256 public minimumStake;

    struct Miner {
        bool isRegistered;
        uint256 stakedAmount;
        uint256 reputationScore; // 0 to 100
        uint256 totalRequestsProcessed;
    }

    mapping(address => Miner) public miners;
    address[] public minerList; // To iterate/select miners off-chain

    // Events
    event MinerRegistered(address indexed miner, uint256 amount);
    event MinerDeregistered(address indexed miner, uint256 amount);
    event MinerSlashed(address indexed miner, uint256 amount, string reason);
    event ReputationUpdated(address indexed miner, uint256 newScore);

    constructor(address _tokenAddress, uint256 _minStake) Ownable(msg.sender) {
        token = VeritasToken(_tokenAddress);
        minimumStake = _minStake;
    }

    /**
     * @dev Allows a user to register as a miner by staking VRT.
     * User must have approved the contract to spend their tokens first.
     */
    function registerMiner(uint256 _amount) external {
        require(_amount >= minimumStake, "Insufficient stake amount");
        require(!miners[msg.sender].isRegistered, "Already registered");

        // Transfer tokens from Miner to this Contract
        // NOTE: The miner must call `approve()` on the Token contract first!
        bool success = token.transferFrom(msg.sender, address(this), _amount);
        require(success, "Token transfer failed");

        miners[msg.sender] = Miner({
            isRegistered: true,
            stakedAmount: _amount,
            reputationScore: 100, // Start with perfect score (or neutral 50)
            totalRequestsProcessed: 0
        });

        minerList.push(msg.sender);
        emit MinerRegistered(msg.sender, _amount);
    }

    /**
     * @dev Allows a miner to leave the network and retrieve their stake.
     * Can only withdraw if they are not currently locked (logic can be expanded).
     */
    function deregisterMiner() external {
        require(miners[msg.sender].isRegistered, "Not a registered miner");
        
        uint256 amountToReturn = miners[msg.sender].stakedAmount;
        
        // Reset miner data
        delete miners[msg.sender];

        // Remove from list (swap and pop method for gas efficiency)
        // Note: For a simple PoC, we might just leave the address or filter off-chain
        // This is a simplified removal:
        for (uint i = 0; i < minerList.length; i++) {
            if (minerList[i] == msg.sender) {
                minerList[i] = minerList[minerList.length - 1];
                minerList.pop();
                break;
            }
        }

        // Return tokens
        bool success = token.transfer(msg.sender, amountToReturn);
        require(success, "Token transfer failed");

        emit MinerDeregistered(msg.sender, amountToReturn);
    }

    // ==========================================
    // ADMIN / AGGREGATOR FUNCTIONS
    // ==========================================

    /**
     * @dev Called by the Aggregator (Owner) when a miner fails the Honeypot check repeatedly.
     * Slashed tokens are burned to reduce supply (deflationary).
     */
    function slashMiner(address _minerAddress, uint256 _amount, string memory _reason) external onlyOwner {
        require(miners[_minerAddress].isRegistered, "Miner not found");
        require(miners[_minerAddress].stakedAmount >= _amount, "Stake too low to slash");

        miners[_minerAddress].stakedAmount -= _amount;

        // Burn the slashed tokens
        token.burn(_amount);

        // If stake drops below minimum, kick them out
        if (miners[_minerAddress].stakedAmount < minimumStake) {
            miners[_minerAddress].isRegistered = false;
        }

        emit MinerSlashed(_minerAddress, _amount, _reason);
    }

    /**
     * @dev Updates the reputation score based on Honeypot performance.
     */
    function updateReputation(address _minerAddress, uint256 _newScore) external onlyOwner {
        require(miners[_minerAddress].isRegistered, "Miner not found");
        miners[_minerAddress].reputationScore = _newScore;
        miners[_minerAddress].totalRequestsProcessed++;
        
        emit ReputationUpdated(_minerAddress, _newScore);
    }

    /**
     * @dev Helper for the front-end to see if a miner is eligible
     */
    function isMinerEligible(address _miner) external view returns (bool) {
        return miners[_miner].isRegistered && miners[_miner].stakedAmount >= minimumStake;
    }
}