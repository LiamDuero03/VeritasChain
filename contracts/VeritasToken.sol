// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Veritas Token (VRT)
 * @dev Standard ERC20 Token for the Veritas AI Verification Protocol.
 * Used for:
 * 1. Payment by users to verify images.
 * 2. Staking by miners to participate.
 * 3. Rewards distribution to successful miners.
 */
contract VeritasToken is ERC20, ERC20Burnable, Ownable {

    constructor(uint256 initialSupply) ERC20("Veritas Token", "VRT") Ownable(msg.sender) {
        // Mint the initial supply to the deployer (you)
        // decimals() is 18 by default, so we multiply to get the correct amount
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    /**
     * @dev Function to mint new tokens.
     * In a real production environment, this might be restricted to a specific
     * inflation schedule or governed by a DAO.
     * For this PoC, only the owner (deployer) can mint more for testing rewards.
     *
     * @param to The address that will receive the minted tokens.
     * @param amount The amount of tokens to mint (in wei).
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}