// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const signers = await hre.ethers.getSigners();
  console.log(signers[70].address);

  const GOERLI_HOST = "0x22ff293e14F1EC3A09B137e9e06084AFd63adDF9";
  const POLYGON_HOST = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
  const OPTIMISM_HOST = "0x567c4B141ED61923967cA25Ef4906C8781069a10";

  // We get the contract to deploy
  const Rebounder = await hre.ethers.getContractFactory("StreamRebounder");
  const rebounder = await Rebounder.connect(signers[70]).deploy(
    POLYGON_HOST, // goerli host
    // <REGI KEY>
  );

  await rebounder.deployed();

  console.log("Rebounder deployed to:", rebounder.address);

  // // Transfer ownership
  // console.log("Transferring ownership to:", signers[1].address);

  // const ownershipTransferTx = await rebounder.connect(signers[0]).transferOwnership(signers[1].address);
  // await ownershipTransferTx.wait();
  
  // console.log("Ownership transferred to:", await rebounder.owner());

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
