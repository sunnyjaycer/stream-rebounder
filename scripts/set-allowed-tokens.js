const { ethers } = require("hardhat");
const hre = require("hardhat");
const rebounderABI = require("../artifacts/contracts/StreamRebounder.sol/StreamRebounder.json");

async function main() {

    // Initial Attempt
    // Rebounder deployed to 0xF26Ce9749f29E61c25d0333bCE2301CB2DFd3a22 on Goerli, Mumbai, Optimism, Polygon
    // Deployer Address: 0x1006f1a5a511F822047F06F2e78c24244B0d4DB5

    const signers = await hre.ethers.getSigners();
    console.log("Deploying Address:", signers[2].address);

    // show eth balance of address
    const bal = await hre.ethers.provider.getBalance(signers[2].address);
    console.log("Deployer ETH Balance:", bal);

    // const Rebounder = await hre.ethers.getContractFactory("StreamRebounder");
    const rebounderAddress = "0xF26Ce9749f29E61c25d0333bCE2301CB2DFd3a22";
    const rebounder = await hre.ethers.getContractAt(rebounderABI.abi, rebounderAddress, signers[2]);

    console.log("Ready to setAllowListBatch");

    // set the allowed tokens (DAIx, USDCx)
    const mumbaiTokensToModerate  = ["0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f", "0x42bb40bF79730451B11f6De1CbA222F17b87Afd7"];
    const goerliTokensToModerate  = ["0xF2d68898557cCb2Cf4C10c3Ef2B034b2a69DAD00", "0x8aE68021f6170E5a766bE613cEA0d75236ECCa9a"];
    const opTokensToModerate      = ["0x7d342726b69c28d942ad8bfe6ac81b972349d524", "0x8430f084b939208e2eded1584889c9a66b90562f"];
    const polygonTokensToModerate = ["0x1305F6B6Df9Dc47159D12Eb7aC2804d4A33173c2", "0xCAa7349CEA390F89641fe306D93591f87595dc1F"];
    const modStatus = [true, true]
    const allowListTx = await rebounder.connect(signers[2]).setAllowListBatch(
        polygonTokensToModerate,
        modStatus
    );
    await allowListTx.wait();

    console.log("Successfully set tokens", polygonTokensToModerate, "to status", modStatus);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});