// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VERIToken
 * @dev The native ERC-20 token for the VeritasChain protocol.
 * Used for validator staking, certification fees, and rewards.
 * Includes a 'burn' function for the deflationary fee mechanism.
 */
contract VERIToken is ERC20, Ownable {
    // Only the protocol/registry contracts should be able to mint/burn tokens.
    // This address will be set to the ValidatorRegistry/Protocol contract address.
    address private _protocolAddress;

    // Error for unauthorized calls
    error UnauthorizedProtocolCall();
    // Error for zero address
    error ZeroAddress();

    /**
     * @dev Constructor mints the initial supply to the owner.
     * @param initialSupply The amount of tokens to mint initially.
     */
    constructor(uint256 initialSupply)
        ERC20("VeritasChain Token", "VERI")
        Ownable(msg.sender)
    {
        if (initialSupply == 0) revert("Initial supply must be greater than zero");
        _mint(msg.sender, initialSupply);
    }

    /**
     * @dev Sets the address of the main protocol contract (e.g., ValidatorRegistry)
     * which is authorized to mint and burn tokens.
     * This can only be called once by the contract owner.
     * @param protocolAddress_ The address of the ValidatorRegistry contract.
     */
    function setProtocolAddress(address protocolAddress_) public onlyOwner {
        if (protocolAddress_ == address(0)) revert ZeroAddress();
        _protocolAddress = protocolAddress_;
    }

    /**
     * @dev Internal check to ensure the caller is the authorized protocol contract.
     */
    modifier onlyProtocol() {
        if (msg.sender != _protocolAddress) revert UnauthorizedProtocolCall();
        _;
    }

    /**
     * @dev Mints new tokens. Restricted to the protocol contract.
     * Used for block rewards (inflationary schedule).
     */
    function mint(address account, uint256 amount) public onlyProtocol {
        _mint(account, amount);
    }

    /**
     * @dev Burns tokens. Restricted to the protocol contract.
     * Used for the deflationary fee burn mechanism.
     */
    function burn(uint256 amount) public onlyProtocol {
        _burn(msg.sender, amount);
    }
}