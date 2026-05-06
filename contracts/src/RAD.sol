// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title RAD
 * @notice Radius protocol token. 1 billion total supply.
 */
contract RAD is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;

    constructor() ERC20("Radius", "RAD") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }
}
