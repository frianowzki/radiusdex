// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/RadiusLPToken.sol";
import "../src/RadiusPool.sol";
import "../src/RadiusVault.sol";

/**
 * @title DeployRadius
 * @notice Deploy RadiusPool, RadiusLPToken, and two RadiusVaults (radUSDC, radEURC) to Arc Testnet.
 *
 * Run: forge script script/Deploy.s.sol:DeployRadius --rpc-url https://rpc.testnet.arc.network --broadcast --private-key $PRIVATE_KEY
 */
contract DeployRadius is Script {
    // Arc Testnet addresses
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy LP Token
        RadiusLPToken lpToken = new RadiusLPToken();
        console.log("RadiusLPToken deployed at:", address(lpToken));

        // 2. Deploy Pool
        RadiusPool pool = new RadiusPool(USDC, EURC, address(lpToken));
        console.log("RadiusPool deployed at:", address(pool));

        // 3. Set pool address on LP token
        lpToken.setPool(address(pool));
        console.log("LP Token pool set to:", address(pool));

        // 4. Deploy radUSDC Vault
        RadiusVault radUSDC = new RadiusVault("Radius USDC", "radUSDC", USDC);
        console.log("radUSDC vault deployed at:", address(radUSDC));

        // 5. Deploy radEURC Vault
        RadiusVault radEURC = new RadiusVault("Radius EURC", "radEURC", EURC);
        console.log("radEURC vault deployed at:", address(radEURC));

        vm.stopBroadcast();
    }
}
