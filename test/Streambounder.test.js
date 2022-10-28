const { assert, expect } = require("chai");

const { Framework } = require("@superfluid-finance/sdk-core");
const TestTokenABI =  require("@superfluid-finance/ethereum-contracts/build/contracts/TestToken.json");
const SuperTokenFactoryABI = require("@superfluid-finance/ethereum-contracts/build/contracts/SuperTokenFactory.json").abi;

const { getFlowOps } = require("./utils/FlowOps");
const { flowIntoIntermediateEqualsFlowOut } = require("./utils/FlowAssertions");

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

// Flow Rates
const flowHigh = "100000";
const flowMed = "90000";
const flowLow = "80000";


const errorHandler = (err) => {
  if (err) throw err;
}

before(async function () {

    // get hardhat accounts
    [admin, alice, bob, sunny] = await ethers.getSigners();


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
        ""
    );

    await streamrebounder.setAllowListBatch(
        [usdcx.address, daix.address],
        [true, true]
    );

    // Transfer DAIx to Stream Rebounder contract
    const transferOp = daix.transfer({
      receiver: streamrebounder.address,
      amount: "1000000000"
    })
    await transferOp.exec(alice);

    // Transfer USDCx to Stream Rebounder contract
    const transferOp2 = usdcx.transfer({
      receiver: streamrebounder.address,
      amount: "1000000000"
    })
    await transferOp2.exec(alice);

    console.log("Set Up Complete! - StreamRebounder Contract Address:", streamrebounder.address);

    //// FLOWOPS EXPERIMENTATION

    aliceFlowOps = await getFlowOps(sf, daix, usdcx, streamrebounder, alice);
    bobFlowOps = await getFlowOps(sf, daix, usdcx, streamrebounder, bob);

});

describe("Stream Rebounder Tests", async function () {

  it("create flow", async function () {

    // Alice starts DAI stream 
    await(await aliceFlowOps.daix_create_med).exec(alice);

    // Alice starts USDC stream 
    await(await aliceFlowOps.usdcx_create_med).exec(alice);

    // Bob starts DAI stream 
    await(await bobFlowOps.daix_create_med).exec(bob);

    // Bob starts USDC stream 
    await(await bobFlowOps.usdcx_create_med).exec(bob); 
    

    // Alice's DAIx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, daix, alice, streamrebounder, alice);

    // Alice's USDCx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, usdcx, alice, streamrebounder, alice);

    // Bob's DAIx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, daix, bob, streamrebounder, bob);

    // Bob's USDCx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, usdcx, bob, streamrebounder, bob);

  });

  it("update flow - increase", async function () {

    // Alice increase DAIx stream
    await(await aliceFlowOps.daix_update_high).exec(alice);

    // Alice increase USDCx stream
    await(await aliceFlowOps.usdcx_update_high).exec(alice);

    // Bob increase DAIx stream
    await(await bobFlowOps.daix_update_high).exec(bob);

    // Bob increase USDCx stream
    await(await bobFlowOps.usdcx_update_high).exec(bob);


    // Alice's DAIx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, daix, alice, streamrebounder, alice);

    // Alice's USDCx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, usdcx, alice, streamrebounder, alice);

    // Bob's DAIx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, daix, bob, streamrebounder, bob);

    // Bob's USDCx rebounds properlyj
    await flowIntoIntermediateEqualsFlowOut(sf, usdcx, bob, streamrebounder, bob);

  })

  it("update flow - decrease", async function () {

    // Alice decrease DAIx stream
    await(await aliceFlowOps.daix_update_low).exec(alice);

    // Alice decrease USDCx stream
    await(await aliceFlowOps.usdcx_update_low).exec(alice);

    // Bob decrease DAIx stream
    await(await bobFlowOps.daix_update_low).exec(bob);

    // Bob decrease USDCx stream
    await(await bobFlowOps.usdcx_update_low).exec(bob);


    // Alice's DAIx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, daix, alice, streamrebounder, alice);

    // Alice's USDCx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, usdcx, alice, streamrebounder, alice);

    // Bob's DAIx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, daix, bob, streamrebounder, bob);

    // Bob's USDCx rebounds properlyj
    await flowIntoIntermediateEqualsFlowOut(sf, usdcx, bob, streamrebounder, bob);

  })

  it("delete flow - outbound", async function () {

    // Alice delete DAIx stream
    await(await aliceFlowOps.daix_delete).exec(alice);

    // Alice delete USDCx stream
    await(await aliceFlowOps.usdcx_delete).exec(alice);

    // Bob delete DAIx stream
    await(await bobFlowOps.daix_delete).exec(bob);

    // Bob delete USDCx stream
    await(await bobFlowOps.usdcx_delete).exec(bob);


    // Alice's DAIx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, daix, alice, streamrebounder, alice);

    // Alice's USDCx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, usdcx, alice, streamrebounder, alice);

    // Bob's DAIx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, daix, bob, streamrebounder, bob);

    // Bob's USDCx rebounds properlyj
    await flowIntoIntermediateEqualsFlowOut(sf, usdcx, bob, streamrebounder, bob);

  })

  it("delete flow - inbound (rogue beneficiary)", async function () {

    //// restart flows first

    // Alice starts DAI stream 
    await(await aliceFlowOps.daix_create_med).exec(alice);

    // Alice starts USDC stream 
    await(await aliceFlowOps.usdcx_create_med).exec(alice);

    // Bob starts DAI stream 
    await(await bobFlowOps.daix_create_med).exec(bob);

    // Bob starts USDC stream 
    await(await bobFlowOps.usdcx_create_med).exec(bob); 

    //// delete inbound flows (rogue)

    // Alice delete DAIx stream
    await(await aliceFlowOps.daix_delete_rogue).exec(alice);

    // Alice delete USDCx stream
    await(await aliceFlowOps.usdcx_delete_rogue).exec(alice);

    // Bob delete DAIx stream
    await(await bobFlowOps.daix_delete_rogue).exec(bob);

    // Bob delete USDCx stream
    await(await bobFlowOps.usdcx_delete_rogue).exec(bob);


    // Alice's DAIx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, daix, alice, streamrebounder, alice);

    // Alice's USDCx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, usdcx, alice, streamrebounder, alice);

    // Bob's DAIx rebounds properly
    await flowIntoIntermediateEqualsFlowOut(sf, daix, bob, streamrebounder, bob);

    // Bob's USDCx rebounds properlyj
    await flowIntoIntermediateEqualsFlowOut(sf, usdcx, bob, streamrebounder, bob);

  })

  it("locking rebounder with no streams going", async function () {

    // lock rebounder
    await streamrebounder.connect(admin).setLock(true);

    // attempt opening a stream, expect reversion
    try {
      await aliceFlowOps.daix_create_med.exec(alice);
      throw null;
    } catch (err) {
      assert( err != null , "Did not error as expected");
    }

    // unlock rebounder
    await streamrebounder.connect(admin).setLock(false);

  });

  it("lock rebounder with streams going", async function () {

    // Alice starts stream
    await aliceFlowOps.daix_create_med.exec(alice);

    // lock rebounder
    await streamrebounder.connect(admin).setLock(true);

    // Bob attempts opening a stream, expect reversion
    try {
      await bobFlowOps.daix_create_med.exec(bob);
      throw null;
    } catch (err) {
      assert( err != null , "Did not error as expected");
    }

    // unlock rebounder
    await streamrebounder.connect(admin).setLock(false);

  })

  it("protection tests", async function () {

    // Bob starts a USDC stream

    const bobUsdcxFlow1 = sf.cfaV1.createFlow({
      superToken: usdcx.address,
      receiver: streamrebounder.address,
      flowRate: "100000"
    });
    await bobUsdcxFlow1.exec(bob);

    // emergency close on Alice, Bob, and Sunny

    const emergencyCloseStreamTx = await streamrebounder.connect(admin).emergencyCloseStream(
      [alice.address, bob.address, sunny.address],
      [daix.address, usdcx.address, usdcx.address]
    );
    await emergencyCloseStreamTx.wait();
  
    const host = await ethers.getContractAt(
      [
        "function getSuperTokenFactory() view returns (address)",
        "function isAppJailed(address) view returns (bool)"
      ],
      sf.settings.config.hostAddress
    );

    assert(!await host.isAppJailed(streamrebounder.address), "app was jailed");

    // Verify Alice stream to Rebounder is zero
    assert(
      ( await sf.cfaV1.getFlow({
        superToken:daix.address,
        sender:alice.address,
        receiver:streamrebounder.address,
        providerOrSigner:alice}) ).flowRate == 0,
      "Alice outbound stream not zero"
    );

    // Verify Alice stream from Rebounder is zero
    assert(
      ( await sf.cfaV1.getFlow({
        superToken:daix.address,
        sender:streamrebounder.address,
        receiver:alice.address,
        providerOrSigner:alice}) ).flowRate == 0,
      "Alice inbound stream not zero"
    );

    // Verify Bob  stream to Rebounder is zero
    assert(
      ( await sf.cfaV1.getFlow({
        superToken:usdcx.address,
        sender:bob.address,
        receiver:streamrebounder.address,
        providerOrSigner:bob}) ).flowRate == 0,
      "Bob outbound stream not zero"
    );

    // Verify Bob  stream from Rebounder is zero
    assert(
      ( await sf.cfaV1.getFlow({
        superToken:usdcx.address,
        sender:streamrebounder.address,
        receiver:bob.address,
        providerOrSigner:bob}) ).flowRate == 0,
      "Bob inbound stream not zero"
    );

  });

  it("allow list tests", async function () {

    await deployTestToken(errorHandler, [":", "WETH"], {
      web3,
      from: admin.address,
    });

    // deploy a fake erc20 wrapper super token around the DAI token
    await deploySuperToken(errorHandler, [":", "WETH"], {
      web3,
      from: admin.address,
    });

    // deploy a fake erc20 wrapper super token around the DAI token
    const wethx = await sf.loadSuperToken("WETHx");

    const weth = new ethers.Contract(
        wethx.underlyingToken.address,
        TestTokenABI.abi,
        alice
    );

    const mintAmount = ethers.utils.parseEther("1000");
    const initialFlowRate = "100000";

    await weth.mint(alice.address, mintAmount);

    await weth.approve(wethx.address, ethers.constants.MaxUint256);
    const upgradeOp = wethx.upgrade({ amount: mintAmount });

    await upgradeOp.exec(alice);

    const createFlowOp = sf.cfaV1.createFlow({
      superToken: wethx.address,
      receiver: streamrebounder.address,
      flowRate: initialFlowRate,
      overrides: { gasLimit: 3000000 } // this is expected to fail.
    });

    try {
      await createFlowOp.exec(alice);
      // if we haven't thrown by now, fail the test.
      throw null;
    } catch (error) {
      assert(error != null, "expected error");
    }

    await streamrebounder.setAllowListBatch([wethx.address], [true]);

    await createFlowOp.exec(alice);

    const { flowRate } = await sf.cfaV1.getFlow({
      superToken: wethx.address,
      sender: alice.address,
      receiver: streamrebounder.address,
      providerOrSigner: alice
    });

    assert(flowRate.toString() == initialFlowRate, "flow was not created");

    // Got rid of recordings
    // assert(
    //   initialFlowRate == (await streamrebounder.flowRates(alice.address)).toString(),
    //   "flow was not recorded"
    // );
  });

});

describe("Poison Token Cannot Jail App", async function () {
  it("Should not jail app", async function () {
    try {
      // Deploy token
      const SuperPoisonFactory = await ethers.getContractFactory("SuperPoison", alice);
      const superToken = await SuperPoisonFactory.deploy();

      // Register Super Token With Factory
      const superTokenFactory = await ethers.getContractAt(
        SuperTokenFactoryABI,
        await host.getSuperTokenFactory() // sf.host.contract.getSuperTokenFactory() throws, unknown reason
      );
      await superTokenFactory.initializeCustomSuperToken(superToken.address);

      // Initialize
      await superToken.initialize("Super Poison", "SPxxx");

      // Create stream
      await sf.cfaV1.createFlow({
        superToken: superToken.address,
        receiver: streamrebounder.address,
        flowRate: "100000",
        overrides: { gasLimit: 3000000 }
      }).exec(alice);

      // set up poison ID:
      await superToken.setPoisonFlowId(streamrebounder.address, alice.address);

      // Delete Stream, jail app
      await sf.cfaV1.deleteFlow({
        superToken: superToken.address,
        sender: alice.address,
        receiver: streamrebounder.address,
        overrides: { gasLimit: 3000000 }
      }).exec(alice);
    } catch (_) {
      // If anything reverts, the app is safe.
    }

    // unknown issue with host in sdk, so we init an ethers contract with the methods here.
    const host = await ethers.getContractAt(
      [
        "function getSuperTokenFactory() view returns (address)",
        "function isAppJailed(address) view returns (bool)"
      ],
      sf.settings.config.hostAddress
    );

    // Assert that the app does not jail
    const isAppJailed = await host.isAppJailed(streamrebounder.address)
    assert(!isAppJailed, "APP IS JAILED");
  });
});