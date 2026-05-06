// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/RAD.sol";
import "../src/RadiusStaking.sol";

/**
 * @title DeployFresh
 * @notice Deploy fresh RAD + RadiusStaking with lower emission (10M RAD for 1 year).
 */
contract DeployFresh is Script {
    address constant LP_TOKEN = 0xb3958c9956a63047EE0A246f92A5eC9E404cdb8f;

    uint256 constant SEED_AMOUNT = 10_000_000 * 1e18;
    uint256 constant ONE_YEAR = 365 days;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        RAD rad = new RAD();
        console.log("RAD deployed at:", address(rad));

        RadiusStaking staking = new RadiusStaking(LP_TOKEN, address(rad));
        console.log("RadiusStaking deployed at:", address(staking));

        rad.approve(address(staking), SEED_AMOUNT);
        staking.notifyRewardAmount(SEED_AMOUNT, ONE_YEAR);
        console.log("Seeded 10M RAD for 1 year (~0.317 RAD/sec)");

        vm.stopBroadcast();
    }
}
