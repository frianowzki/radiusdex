// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

/**
 * @title RadiusVault
 * @notice ERC-4626 wrapper around a stablecoin asset.
 * @dev Uses OpenZeppelin ERC4626, which includes virtual asset/share accounting
 *      to reduce first-depositor donation/inflation attacks.
 */
contract RadiusVault is ERC4626 {
    constructor(
        string memory name_,
        string memory symbol_,
        address asset_
    ) ERC20(name_, symbol_) ERC4626(IERC20(asset_)) {
        require(asset_ != address(0), "zero asset");
    }

    /// @dev Larger offset makes empty-vault donation attacks materially more expensive.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }
}
