// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/RAD.sol";
import "../src/RadiusStaking.sol";

/**
 * @title DeployYield
 * @notice Deploy RAD token and RadiusStaking contract.
 *
 * Run: forge script script/DeployYield.s.sol:DeployYield --rpc-url https://rpc.testnet.arc.network --broadcast --private-key $PRIVATE_KEY
 */
contract DeployYield is Script {
    // Existing contracts
    address constant LP_TOKEN = 0xc349BCA5A206D52c2840f7BaBd4F72ee30C4127f;

    // Seed amount: 100M RAD (10% of supply) for 1 year of rewards
    uint256 constant SEED_AMOUNT = 100_000_000 * 1e18;
    uint256 constant ONE_YEAR = 365 days;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy RAD token (1B supply to deployer)
        RAD rad = new RAD();
        console.log("RAD deployed at:", address(rad));

        // 2. Deploy RadiusStaking
        RadiusStaking staking = new RadiusStaking(LP_TOKEN, address(rad));
        console.log("RadiusStaking deployed at:", address(staking));

        // 3. Approve and seed staking contract with RAD
        rad.approve(address(staking), SEED_AMOUNT);
        staking.notifyRewardAmount(SEED_AMOUNT, ONE_YEAR);
        console.log("Seeded RAD for 1 year");

        // 4. Transfer remaining RAD to deployer (already there from constructor)
        uint256 remaining = rad.balanceOf(msg.sender);
        console.log("Remaining RAD in deployer (millions):");
        console.log(remaining / 1e18 / 1_000_000);

        vm.stopBroadcast();
    }
}
