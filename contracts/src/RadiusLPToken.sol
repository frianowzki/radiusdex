// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RadiusLPToken
 * @notice ERC-20 LP token for the Radius StableSwap pool.
 *         Only the pool contract can mint/burn.
 */
contract RadiusLPToken is ERC20, Ownable {
    constructor() ERC20("Radius LP", "radLP") Ownable(msg.sender) {}

    /// @notice Grant mint/burn authority to the pool
    function setPool(address pool) external onlyOwner {
        require(pool != address(0), "zero address");
        _pool = pool;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == _pool, "only pool");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == _pool, "only pool");
        _burn(from, amount);
    }

    address private _pool;
}
