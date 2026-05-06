// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/RadiusStaking.sol";
import "../src/RAD.sol";

/**
 * @title DeployStakingOnly
 * @notice Redeploy RadiusStaking with lower emission. Seed 10M RAD for 1 year.
 *
 * Run: DEPLOYER_PRIVATE_KEY=0x... forge script script/DeployStakingOnly.s.sol:DeployStakingOnly --rpc-url https://rpc.testnet.arc.network --broadcast --private-key $DEPLOYER_PRIVATE_KEY
 */
contract DeployStakingOnly is Script {
    // Existing contracts
    address constant LP_TOKEN = 0xb3958c9956a63047EE0A246f92A5eC9E404cdb8f;
    address constant RAD_TOKEN = 0xB438D4b19b7032335aBcf2398Ee6162900ad94CE;

    // Lower emission: 10M RAD for 1 year (~0.317 RAD/sec instead of ~3.17)
    uint256 constant SEED_AMOUNT = 10_000_000 * 1e18;
    uint256 constant ONE_YEAR = 365 days;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy RadiusStaking
        RadiusStaking staking = new RadiusStaking(LP_TOKEN, RAD_TOKEN);
        console.log("RadiusStaking deployed at:", address(staking));

        // 2. Approve and seed staking contract with RAD
        RAD rad = RAD(RAD_TOKEN);
        rad.approve(address(staking), SEED_AMOUNT);
        staking.notifyRewardAmount(SEED_AMOUNT, ONE_YEAR);
        console.log("Seeded 10M RAD for 1 year (~0.317 RAD/sec)");

        vm.stopBroadcast();
    }
}
