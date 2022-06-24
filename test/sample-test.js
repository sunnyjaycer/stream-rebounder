const { assert, expect } = require("chai");

const { Framework } = require("@superfluid-finance/sdk-core");
const TestTokenABI =  require("@superfluid-finance/ethereum-contracts/build/contracts/TestToken.json");

const { ethers, web3 } = require("hardhat");

const deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
const deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
const deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");

// Instances
let sf;                          // Superfluid framework API object
let streamrebounder;             // spreader contract object
let dai;                         // underlying token of daix
let daix;                        // will act as `spreaderToken` - is a super token wrapper of dai
let usdc;                         // underlying token of usdcx
let usdcx;                        // will act as `spreaderToken` - is a super token wrapper of usdc


// Test Accounts
let admin;      
let alice;      
let bob;

const errorHandler = (err) => {
  if (err) throw err;
}

before(async function () {

    // get hardhat accounts
    [admin, alice, bob] = await ethers.getSigners();


    //// GETTING SUPERFLUID FRAMEWORK SET UP

    // deploy the framework locally
    await deployFramework(errorHandler, {
        web3: web3,
        from: admin.address,
        // newTestResolver:true
    });

    // initialize framework
    sf = await Framework.create({
        networkName: "custom",
        provider: web3,
        dataMode: "WEB3_ONLY",
        resolverAddress: process.env.RESOLVER_ADDRESS, // (empty)
        protocolReleaseVersion: "test",
    });


    //// DEPLOYING DAI and DAI wrapper super token (which will be our `spreaderToken`)

    // deploy a fake erc20 token
    await deployTestToken(errorHandler, [":", "fDAI"], {
        web3,
        from: admin.address,
    });

    // deploy a fake erc20 wrapper super token around the DAI token
    await deploySuperToken(errorHandler, [":", "fDAI"], {
        web3,
        from: admin.address,
    });

    // deploy a fake erc20 wrapper super token around the DAI token
    daix = await sf.loadSuperToken("fDAIx");

    dai = new ethers.Contract(
      daix.underlyingToken.address,
      TestTokenABI.abi,
      admin
    );


    //// DEPLOYING USDC and USDC wrapper super token (which will be our `spreaderToken`)

    // deploy a fake erc20 token
    await deployTestToken(errorHandler, [":", "fUSDC"], {
      web3,
      from: admin.address,
    });

    // deploy a fake erc20 wrapper super token around the DAI token
    await deploySuperToken(errorHandler, [":", "fUSDC"], {
        web3,
        from: admin.address,
    });

    // deploy a fake erc20 wrapper super token around the DAI token
    usdcx = await sf.loadSuperToken("fUSDCx");

    usdc = new ethers.Contract(
        usdcx.underlyingToken.address,
        TestTokenABI.abi,
        admin
    );


    //// SETTING UP NON-ADMIN ACCOUNTS WITH DAIx

    // minting test DAI
    await dai.connect(admin).mint(admin.address, ethers.utils.parseEther("10000"));
    await dai.connect(alice).mint(alice.address, ethers.utils.parseEther("10000"));
    await dai.connect(bob).mint(bob.address, ethers.utils.parseEther("10000"));

    // approving DAIx to spend DAI (Super Token object is not an ethers contract object and has different operation syntax)
    await dai.connect(admin).approve(daix.address, ethers.constants.MaxInt256);
    await dai.connect(alice).approve(daix.address, ethers.constants.MaxInt256);
    await dai.connect(bob).approve(daix.address, ethers.constants.MaxInt256);

    // Upgrading all DAI to DAIx
    const daiXUpgradeOperation = daix.upgrade({
      amount: ethers.utils.parseEther("10000").toString(),
    })
    await daiXUpgradeOperation.exec(admin);
    await daiXUpgradeOperation.exec(alice);
    await daiXUpgradeOperation.exec(bob);


    //// SETTING UP NON-ADMIN ACCOUNTS WITH DAIx

    // minting test DAI
    await usdc.connect(admin).mint(admin.address, ethers.utils.parseEther("10000"));
    await usdc.connect(alice).mint(alice.address, ethers.utils.parseEther("10000"));
    await usdc.connect(bob).mint(bob.address, ethers.utils.parseEther("10000"));

    // approving DAIx to spend DAI (Super Token object is not an ethers contract object and has different operation syntax)
    await usdc.connect(admin).approve(usdcx.address, ethers.constants.MaxInt256);
    await usdc.connect(alice).approve(usdcx.address, ethers.constants.MaxInt256);
    await usdc.connect(bob).approve(usdcx.address, ethers.constants.MaxInt256);

    // Upgrading all DAI to DAIx
    const usdcXUpgradeOperation = usdcx.upgrade({
      amount: ethers.utils.parseEther("10000").toString(),
    })
    await usdcXUpgradeOperation.exec(admin);
    await usdcXUpgradeOperation.exec(alice);
    await usdcXUpgradeOperation.exec(bob);

    
    //// INITIALIZING SPREADER CONTRACT

    const streamRebounderFactory = await ethers.getContractFactory(
        "StreamRebounder",
        admin
    );

    streamrebounder = await streamRebounderFactory.deploy(
        sf.settings.config.hostAddress,
    );

    // Transfer DAIx to Stream Rebounder contract
    const transferOp = daix.transfer({
      receiver: streamrebounder.address,
      amount: "1000000000"
    })
    await transferOp.exec(alice);

    // Transfer DAIx to Stream Rebounder contract
    const transferOp2 = usdcx.transfer({
      receiver: streamrebounder.address,
      amount: "1000000000"
    })
    await transferOp2.exec(alice);

    console.log("Set Up Complete! - TokenSpreader Contract Address:", streamrebounder.address);
});

describe("Stream Rebounder Tests", async () => {

  it("broad test", async function () {

    const cfOp = sf.cfaV1.createFlow({
      superToken: daix.address,
      receiver: streamrebounder.address,
      flowRate: "100000"
    });
    await cfOp.exec(alice);

    console.log("\nAlice -> App starts (dai)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    const cfOpu = sf.cfaV1.createFlow({
      superToken: usdcx.address,
      receiver: streamrebounder.address,
      flowRate: "100000"
    });
    await cfOpu.exec(alice);

    console.log("\nAlice -> App starts (usdc)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    
    const dfOp = await sf.cfaV1.deleteFlow({
      superToken: daix.address,
      sender: alice.address,
      receiver: streamrebounder.address
    });
    await dfOp.exec(alice);

    console.log("\nAlice -> App ends (dai)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    const dfOpu = await sf.cfaV1.deleteFlow({
      superToken: usdcx.address,
      sender: alice.address,
      receiver: streamrebounder.address
    });
    await dfOpu.exec(alice);

    console.log("\nAlice -> App ends (usdc)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );
   
    await cfOp.exec(alice);

    console.log("\nAlice -> App starts (dai)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    await cfOpu.exec(alice);

    console.log("\nAlice -> App starts (usdc)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    const df2Op = await sf.cfaV1.deleteFlow({
      superToken: daix.address,
      sender: streamrebounder.address,
      receiver: alice.address
    });
    await df2Op.exec(alice);

    console.log("\nApp -> Alice ends (dai)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    const df2Ou = await sf.cfaV1.deleteFlow({
      superToken: daix.address,
      sender: streamrebounder.address,
      receiver: alice.address
    });
    await df2Ou.exec(alice);

    console.log("\nApp -> Alice ends (usdc)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    await dfOp.exec(alice);

    console.log("\nAlice -> App ends (dai)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    await dfOpu.exec(alice);

    console.log("\nAlice -> App ends (usdc)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    const cf2Op = sf.cfaV1.createFlow({
      superToken: daix.address,
      receiver: streamrebounder.address,
      flowRate: "100000"
    });
    await cf2Op.exec(alice);

    console.log("\nAlice -> App starts (dai)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    const cf2Ou = sf.cfaV1.createFlow({
      superToken: usdcx.address,
      receiver: streamrebounder.address,
      flowRate: "100000"
    });
    await cf2Ou.exec(alice);

    console.log("\nAlice -> App starts (usdc)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    const ufOp = sf.cfaV1.updateFlow({
      superToken: daix.address,
      receiver: streamrebounder.address,
      flowRate: "200000"
    });
    await ufOp.exec(alice);

    console.log("\nAlice -> App updates (dai)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    const ufOpu = sf.cfaV1.updateFlow({
      superToken: usdcx.address,
      receiver: streamrebounder.address,
      flowRate: "200000"
    });
    await ufOpu.exec(alice);

    console.log("\nAlice -> App updates (usdc)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    await dfOp.exec(alice);

    console.log("\nAlice -> App ends (dai)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:daix.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );

    
    await dfOpu.exec(alice);

    console.log("\nAlice -> App ends (usdc)")
    console.log("To Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:streamrebounder.address,receiver:alice.address,providerOrSigner:alice}) ).flowRate );
    console.log("From Alice:", ( await sf.cfaV1.getFlow({superToken:usdcx.address,sender:alice.address,receiver:streamrebounder.address,providerOrSigner:alice}) ).flowRate );
  });
0x429eFCc0f2fC4eCee0b887E5eFAa6Fd27B706667
});