// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RadiusStaking
 * @notice Stake RadiusLPToken, earn RAD rewards.
 *         Synthetix StakingRewards pattern — battle-tested.
 *         Owner deposits RAD for distribution. 1 RAD/second emission.
 */
contract RadiusStaking is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Immutable ---
    IERC20 public immutable stakingToken;   // RadiusLPToken
    IERC20 public immutable rewardsToken;   // RAD

    // --- State ---
    uint256 public rewardRatePerSecond = 1e18; // 1 RAD/second
    uint256 public periodFinish;               // when current reward period ends
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    uint256 public totalStaked;

    mapping(address => uint256) public staked;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    // --- Events ---
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(uint256 reward, uint256 duration);

    constructor(address _stakingToken, address _rewardsToken) {
        require(_stakingToken != address(0) && _rewardsToken != address(0), "zero address");
        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_rewardsToken);
    }

    // ==================== VIEW ====================

    function earned(address account) public view returns (uint256) {
        uint256 rt = rewardPerToken();
        return staked[account] * (rt - userRewardPerTokenPaid[account]) / 1e18 + rewards[account];
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) {
            return rewardPerTokenStored;
        }
        uint256 last = block.timestamp > periodFinish ? periodFinish : block.timestamp;
        return rewardPerTokenStored + (last - lastUpdateTime) * rewardRatePerSecond * 1e18 / totalStaked;
    }

    // ==================== MUTATIVE ====================

    /**
     * @notice Deposit RAD for distribution. Call after deploying.
     * @param amount Amount of RAD to add
     * @param duration How many seconds to spread distribution over
     */
    function notifyRewardAmount(uint256 amount, uint256 duration) external {
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);
        if (block.timestamp >= periodFinish) {
            rewardRatePerSecond = amount / duration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRatePerSecond;
            rewardRatePerSecond = (leftover + amount) / duration;
        }
        uint256 balance = rewardsToken.balanceOf(address(this));
        require(rewardRatePerSecond <= balance / duration, "reward too high");
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + duration;
        emit RewardAdded(amount, duration);
    }

    /**
     * @notice Stake LP tokens.
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "zero amount");
        _updateRewards(msg.sender);
        totalStaked += amount;
        staked[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Withdraw LP tokens.
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "zero amount");
        require(staked[msg.sender] >= amount, "insufficient stake");
        _updateRewards(msg.sender);
        totalStaked -= amount;
        staked[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Claim RAD rewards.
     */
    function claim() external nonReentrant {
        _updateRewards(msg.sender);
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    /**
     * @notice Withdraw LP + claim in one tx.
     */
    function exit() external nonReentrant {
        _updateRewards(msg.sender);
        
        uint256 amount = staked[msg.sender];
        if (amount > 0) {
            totalStaked -= amount;
            staked[msg.sender] = 0;
            stakingToken.safeTransfer(msg.sender, amount);
            emit Withdrawn(msg.sender, amount);
        }

        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    // ==================== INTERNAL ====================

    function _updateRewards(address account) internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp > periodFinish ? periodFinish : block.timestamp;
        rewards[account] = earned(account);
        userRewardPerTokenPaid[account] = rewardPerTokenStored;
    }
}
