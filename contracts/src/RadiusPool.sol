// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RadiusLPToken.sol";

/**
 * @title RadiusPool
 * @notice StableSwap AMM for USDC/EURC on Arc Testnet.
 *         Curve-style invariant for pegged stablecoins.
 *         Supports: exchange, add_liquidity, remove_liquidity, remove_liquidity_one_coin.
 */
contract RadiusPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Immutable config ---
    IERC20 public immutable token0; // USDC
    IERC20 public immutable token1; // EURC
    RadiusLPToken public immutable lpToken;

    // --- State ---
    uint256 public constant FEE_DENOMINATOR = 10_000;
    uint256 public fee = 30; // 0.30% (30/10000)
    uint256 public constant A = 100; // Amplification factor
    uint256 public constant N_COINS = 2;

    // --- Events ---
    event TokenSwapped(address indexed sender, uint256 inputIndex, uint256 outputIndex, uint256 inputAmount, uint256 outputAmount);
    event LiquidityAdded(address indexed provider, uint256[2] amounts, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, uint256[2] amounts, uint256 lpBurned);

    constructor(address _token0, address _token1, address _lpToken) {
        require(_token0 != address(0) && _token1 != address(0), "zero token");
        require(_lpToken != address(0), "zero LP");
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
        lpToken = RadiusLPToken(_lpToken);
    }

    // ==================== VIEW FUNCTIONS ====================

    function balances(uint256 index) public view returns (uint256) {
        if (index == 0) return token0.balanceOf(address(this));
        if (index == 1) return token1.balanceOf(address(this));
        revert("invalid index");
    }

    function totalSupply() external view returns (uint256) {
        return lpToken.totalSupply();
    }

    /**
     * @notice StableSwap D computation (Newton's method).
     *         Uses integer-only math without external precision scaling.
     *         For N=2: Ann * sum + D_P * N = D * (Ann - 1 + (N+1) * D_P / D)
     */
    function getD(uint256[2] memory xp, uint256 amp) public pure returns (uint256) {
        uint256 sumXp = xp[0] + xp[1];
        if (sumXp == 0) return 0;

        uint256 d = sumXp;
        uint256 ann = amp * N_COINS;

        for (uint256 i = 0; i < 255; i++) {
            uint256 dP = d;
            dP = dP * d / xp[0];
            dP = dP * d / xp[1];
            dP = dP / (N_COINS ** N_COINS);

            uint256 dPrev = d;
            d = (ann * sumXp + dP * N_COINS) * d / ((ann - 1) * d + (N_COINS + 1) * dP);

            if (d > dPrev) {
                if (d - dPrev <= 1) return d;
            } else {
                if (dPrev - d <= 1) return d;
            }
        }
        revert("D did not converge");
    }

    function get_y(uint256 i, uint256 j, uint256 x, uint256[2] memory xp) public view returns (uint256) {
        require(i != j && i < 2 && j < 2, "invalid indices");
        uint256 d = getD(xp, A);
        uint256 ann = A * N_COINS;

        uint256 c = d;
        uint256 s = 0;
        for (uint256 k = 0; k < 2; k++) {
            uint256 xp_k;
            if (k == i) {
                xp_k = x;
            } else if (k != j) {
                xp_k = xp[k];
            } else {
                continue;
            }
            s += xp_k;
            c = c * d / (xp_k * N_COINS);
        }
        c = c * d / (ann * N_COINS);
        uint256 b = s + d / ann;
        uint256 yPrev;
        uint256 y = d;

        for (uint256 iter = 0; iter < 255; iter++) {
            yPrev = y;
            y = (y * y + c) / (2 * y + b - d);
            if (y > yPrev) {
                if (y - yPrev <= 1) return y;
            } else {
                if (yPrev - y <= 1) return y;
            }
        }
        revert("y did not converge");
    }

    /**
     * @notice Get estimated output amount for a swap.
     */
    function get_dy(uint256 i, uint256 j, uint256 dx) external view returns (uint256) {
        uint256[2] memory xp;
        xp[0] = balances(0);
        xp[1] = balances(1);
        uint256 x = xp[i] + dx;
        uint256 y = get_y(i, j, x, xp);
        uint256 dy = xp[j] - y - 1;
        uint256 feeAmount = dy * fee / FEE_DENOMINATOR;
        return dy - feeAmount;
    }

    // ==================== SWAP ====================

    /**
     * @notice Swap token i for token j.
     * @param i Input token index (0 = USDC, 1 = EURC)
     * @param j Output token index
     * @param dx Amount of input token
     * @param minDy Minimum output (slippage protection)
     */
    function exchange(uint256 i, uint256 j, uint256 dx, uint256 minDy) external nonReentrant returns (uint256 dy) {
        require(i < 2 && j < 2 && i != j, "invalid indices");
        require(dx > 0, "zero amount");

        IERC20 inputToken = i == 0 ? token0 : token1;
        IERC20 outputToken = j == 0 ? token0 : token1;

        // Transfer input
        inputToken.safeTransferFrom(msg.sender, address(this), dx);

        // Calculate output
        uint256[2] memory xp;
        xp[0] = balances(0);
        xp[1] = balances(1);
        uint256 x = xp[i] + dx;
        uint256 y = get_y(i, j, x, xp);
        dy = xp[j] - y - 1;
        uint256 feeAmount = dy * fee / FEE_DENOMINATOR;
        dy -= feeAmount;

        require(dy >= minDy, "slippage exceeded");

        // Transfer output
        outputToken.safeTransfer(msg.sender, dy);

        emit TokenSwapped(msg.sender, i, j, dx, dy);
    }

    // ==================== LIQUIDITY ====================

    /**
     * @notice Add liquidity to the pool. Mints LP tokens proportional to deposit.
     * @param amounts [usdcAmount, eurcAmount]
     * @param minMintAmount Minimum LP tokens to receive
     */
    function add_liquidity(uint256[2] memory amounts, uint256 minMintAmount) external nonReentrant returns (uint256 minted) {
        require(amounts[0] > 0 || amounts[1] > 0, "zero amounts");

        uint256[2] memory oldBalances;
        oldBalances[0] = balances(0);
        oldBalances[1] = balances(1);

        // Transfer tokens in
        if (amounts[0] > 0) token0.safeTransferFrom(msg.sender, address(this), amounts[0]);
        if (amounts[1] > 0) token1.safeTransferFrom(msg.sender, address(this), amounts[1]);

        uint256[2] memory newBalances;
        newBalances[0] = balances(0);
        newBalances[1] = balances(1);

        uint256 oldD = (oldBalances[0] > 0 || oldBalances[1] > 0) ? getD(oldBalances, A) : 0;
        uint256 newD = getD(newBalances, A);

        if (oldD == 0) {
            // First deposit — mint D directly
            minted = newD;
        } else {
            // Proportional mint: minted = totalSupply * (newD - oldD) / oldD
            minted = lpToken.totalSupply() * (newD - oldD) / oldD;
        }

        require(minted >= minMintAmount, "slippage exceeded");
        require(minted > 0, "zero mint");

        lpToken.mint(msg.sender, minted);
        emit LiquidityAdded(msg.sender, amounts, minted);
    }

    /**
     * @notice Remove liquidity — receive both tokens proportionally.
     * @param amount LP tokens to burn
     * @param minAmounts Minimum [usdc, eurc] to receive
     */
    function remove_liquidity(uint256 amount, uint256[2] memory minAmounts) external nonReentrant returns (uint256[2] memory amounts) {
        require(amount > 0, "zero amount");

        uint256 totalLpSupply = lpToken.totalSupply();
        require(totalLpSupply > 0, "no liquidity");

        uint256 bal0 = balances(0);
        uint256 bal1 = balances(1);

        amounts[0] = bal0 * amount / totalLpSupply;
        amounts[1] = bal1 * amount / totalLpSupply;

        require(amounts[0] >= minAmounts[0] && amounts[1] >= minAmounts[1], "slippage exceeded");

        lpToken.burn(msg.sender, amount);
        if (amounts[0] > 0) token0.safeTransfer(msg.sender, amounts[0]);
        if (amounts[1] > 0) token1.safeTransfer(msg.sender, amounts[1]);

        emit LiquidityRemoved(msg.sender, amounts, amount);
    }

    /**
     * @notice Remove liquidity in a single token.
     * @param burnAmount LP tokens to burn
     * @param i Token index to receive
     * @param minReceived Minimum amount to receive
     */
    function remove_liquidity_one_coin(uint256 burnAmount, uint256 i, uint256 minReceived) external nonReentrant returns (uint256 received) {
        require(i < 2, "invalid index");
        require(burnAmount > 0, "zero amount");

        uint256[2] memory xp;
        xp[0] = balances(0);
        xp[1] = balances(1);

        uint256 d0 = getD(xp, A);
        uint256 totalLpSupply = lpToken.totalSupply();

        // Calculate new D after removing burnAmount
        uint256 d1 = d0 * (totalLpSupply - burnAmount) / totalLpSupply;

        // Calculate new balance of the remaining token
        // received = balance_i - new_balance_i
        received = (xp[i] - (xp[i] * d1 / d0)) - 1;

        // Apply fee on the received amount
        uint256 feeAmount = received * fee / FEE_DENOMINATOR;
        received -= feeAmount;

        require(received >= minReceived, "slippage exceeded");

        lpToken.burn(msg.sender, burnAmount);
        IERC20 outToken = i == 0 ? token0 : token1;
        outToken.safeTransfer(msg.sender, received);
    }

    /**
     * @notice Calculate how much of token i you'd get for burning LP.
     */
    function calc_withdraw_one_coin(uint256 burnAmount, uint256 i) external view returns (uint256) {
        require(i < 2, "invalid index");

        uint256[2] memory xp;
        xp[0] = balances(0);
        xp[1] = balances(1);

        uint256 d0 = getD(xp, A);
        uint256 totalLpSupply = lpToken.totalSupply();
        if (totalLpSupply == 0) return 0;

        uint256 d1 = d0 * (totalLpSupply - burnAmount) / totalLpSupply;
        uint256 received = (xp[i] - (xp[i] * d1 / d0)) - 1;
        uint256 feeAmount = received * fee / FEE_DENOMINATOR;
        return received - feeAmount;
    }

    // ==================== ADMIN ====================

    function setFee(uint256 _fee) external {
        // For testnet: no owner restriction. In production, add access control.
        require(_fee <= 1000, "fee too high"); // max 10%
        fee = _fee;
    }
}
