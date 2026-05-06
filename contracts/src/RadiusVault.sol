// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RadiusVault is ERC20, ERC20Permit, IERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable _asset;

    constructor(
        string memory _name,
        string memory _symbol,
        address asset_
    ) ERC20(_name, _symbol) ERC20Permit(_name) {
        require(asset_ != address(0), "zero asset");
        _asset = IERC20(asset_);
    }

    function asset() external view override returns (address) {
        return address(_asset);
    }

    function totalAssets() public view override returns (uint256) {
        return _asset.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view override returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return assets;
        return assets * supply / totalAssets();
    }

    function convertToAssets(uint256 shares) public view override returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return shares;
        return shares * totalAssets() / supply;
    }

    function maxDeposit(address) external pure override returns (uint256) {
        return type(uint256).max;
    }

    function maxMint(address) external pure override returns (uint256) {
        return type(uint256).max;
    }

    function maxWithdraw(address owner) external view override returns (uint256) {
        return convertToAssets(balanceOf(owner));
    }

    function maxRedeem(address owner) external view override returns (uint256) {
        return balanceOf(owner);
    }

    function previewDeposit(uint256 assets) external view override returns (uint256) {
        return convertToShares(assets);
    }

    function previewMint(uint256 shares) external view override returns (uint256) {
        uint256 supply = totalSupply();
        uint256 ta = totalAssets();
        if (supply == 0) return shares;
        return (shares * ta + supply - 1) / supply;
    }

    function previewWithdraw(uint256 assets) external view override returns (uint256) {
        uint256 supply = totalSupply();
        uint256 ta = totalAssets();
        if (supply == 0) return assets;
        return (assets * supply + ta - 1) / ta;
    }

    function previewRedeem(uint256 shares) external view override returns (uint256) {
        return convertToAssets(shares);
    }

    function deposit(uint256 assets, address receiver) external override nonReentrant returns (uint256 shares) {
        require(assets > 0, "zero deposit");
        shares = convertToShares(assets);
        require(shares > 0, "zero shares");
        _asset.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
    }

    function mint(uint256 shares, address receiver) external override nonReentrant returns (uint256 assets) {
        require(shares > 0, "zero mint");
        uint256 supply = totalSupply();
        uint256 ta = totalAssets();
        assets = supply == 0 ? shares : (shares * ta + supply - 1) / supply;
        _asset.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner) external override nonReentrant returns (uint256 shares) {
        require(assets > 0, "zero withdraw");
        uint256 supply = totalSupply();
        uint256 ta = totalAssets();
        shares = supply == 0 ? assets : (assets * supply + ta - 1) / ta;
        require(shares > 0, "zero shares");

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) {
                require(allowed >= shares, "insufficient allowance");
                _approve(owner, msg.sender, allowed - shares);
            }
        }

        _burn(owner, shares);
        _asset.safeTransfer(receiver, assets);
    }

    function redeem(uint256 shares, address receiver, address owner) external override nonReentrant returns (uint256 assets) {
        require(shares > 0, "zero redeem");
        assets = convertToAssets(shares);
        require(assets > 0, "zero assets");

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) {
                require(allowed >= shares, "insufficient allowance");
                _approve(owner, msg.sender, allowed - shares);
            }
        }

        _burn(owner, shares);
        _asset.safeTransfer(receiver, assets);
    }
}
