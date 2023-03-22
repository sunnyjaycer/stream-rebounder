const hre = require("hardhat");

async function main() {
  
  // Initial Attempt
  // Rebounder deployed to 0xF26Ce9749f29E61c25d0333bCE2301CB2DFd3a22 on Goerli, Mumbai, Optimism, Polygon
  // Deployer Address: 0x1006f1a5a511F822047F06F2e78c24244B0d4DB5

  const signers = await hre.ethers.getSigners();
  console.log("Deploying Address:", signers[2].address);

  // show eth balance of address
  const bal = await hre.ethers.provider.getBalance(signers[2].address);
  console.log("Deployer ETH Balance:", bal);

  const GOERLI_HOST = "0x22ff293e14F1EC3A09B137e9e06084AFd63adDF9";
  const MUMBAI_HOST = "0xEB796bdb90fFA0f28255275e16936D25d3418603";
  const POLYGON_HOST = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
  const OPTIMISM_HOST = "0x567c4B141ED61923967cA25Ef4906C8781069a10";

  // We get the contract to deploy
  const Rebounder = await hre.ethers.getContractFactory("StreamRebounder");
  const rebounder = await Rebounder.connect(signers[2]).deploy(
    POLYGON_HOST, // host address
    process.env.SUPER_APP_REGISTRATION_KEY
  );

  await rebounder.deployed();

  console.log("Rebounder deployed to:", rebounder.address);

  // // Transfer ownership
  // console.log("Transferring ownership to:", signers[0].address);

  // const ownershipTransferTx = await rebounder.connect(signers[70]).transferOwnership(signers[0].address);
  // await ownershipTransferTx.wait();
  
  // console.log("Ownership transferred to:", await rebounder.owner());

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});