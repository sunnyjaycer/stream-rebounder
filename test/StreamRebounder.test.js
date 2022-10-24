const { assert, expect } = require("chai");

const { Framework } = require("@superfluid-finance/sdk-core");
const TestTokenABI =  require("@superfluid-finance/ethereum-contracts/build/contracts/TestToken.json");
const SuperTokenFactoryABI = require("@superfluid-finance/ethereum-contracts/build/contracts/SuperTokenFactory.json").abi;

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

let tx; 

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

    // deployment
    const streamRebounderFactory = await ethers.getContractFactory(
        "StreamRebounder",
        admin
    );

    streamrebounder = await streamRebounderFactory.connect(admin).deploy(
        sf.settings.config.hostAddress,
        ""
    );

    // permitted tokens
    await streamrebounder.connect(admin).setAllowListBatch(
        [usdcx.address, daix.address],
        [true, true]
    );

    /// 1 - Common      - 50% chance
    /// 2 - Uncommon    - 30% chance
    /// 3 - Rare        - 10% chance
    /// 4 - Epic        - 7%  chance
    /// 5 - Legendary   - 2%  chance
    /// 6 - Primordial  - 1%  chance
    // setting rarity array
    await streamrebounder.connect(admin).setRarity(
      [500,300,100,70,20,10]
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
});

xdescribe("Stream Rebounder Tests", async function () {

  it("broad test", async function () {

    // Alice starts DAI stream 
    const cfOp = sf.cfaV1.createFlow({
      superToken: daix.address,
      receiver: streamrebounder.address,
      flowRate: "100000"
    });

    await cfOp.exec(alice);

    // Alice starts USDC stream 
    const cfOpu = sf.cfaV1.createFlow({
      superToken: usdcx.address,
      receiver: streamrebounder.address,
      flowRate: "100000"
    });

    await cfOpu.exec(alice);
    
    // Alice deletes DAI stream  
    const dfOp = sf.cfaV1.deleteFlow({
      superToken: daix.address,
      sender: alice.address,
      receiver: streamrebounder.address
    });
    await dfOp.exec(alice);

    // Alice deletes USDC stream 
    const dfOpu = sf.cfaV1.deleteFlow({
      superToken: usdcx.address,
      sender: alice.address,
      receiver: streamrebounder.address
    });
    await dfOpu.exec(alice);

    // Alice creates DAI stream
    await cfOp.exec(alice);

    // Alice starts USDC stream
    await cfOpu.exec(alice);

    // Alice deletes incoming DAI stream (her outgoing DAI stream gets deleted by SR)
    const df2Ou = sf.cfaV1.deleteFlow({
      superToken: daix.address,
      sender: streamrebounder.address,
      receiver: alice.address
    });
    await df2Ou.exec(alice);

    // Verify Alice stream to Rebounder is zero (cancelled by Rebounder)
    assert(
      ( await sf.cfaV1.getFlow({
        superToken:daix.address,
        sender:alice.address,
        receiver:streamrebounder.address,
        providerOrSigner:alice}) ).flowRate == 0,
      "Alice outbound stream not zero"
    );

    // Alice deletes outgoing DAI stream (would revert as it doesn't exist)
    try {
      await dfOp.exec(alice);
    } catch {
      console.log("expected reversion - flow doesn't exist")
    }
    
    // await expect(await dfOp.exec(alice)).to.be.reverted;

    // Alice deletes outgoing USDC streams
    await dfOpu.exec(alice);

    // Alice creates DAI flow
    const cf2Op = sf.cfaV1.createFlow({
      superToken: daix.address,
      receiver: streamrebounder.address,
      flowRate: "100000"
    });
    await cf2Op.exec(alice);

    // Alice creates USDC flow
    const cf2Ou = sf.cfaV1.createFlow({
      superToken: usdcx.address,
      receiver: streamrebounder.address,
      flowRate: "100000"
    });
    await cf2Ou.exec(alice);

    // Alice increases DAI flow
    const ufOp = sf.cfaV1.updateFlow({
      superToken: daix.address,
      receiver: streamrebounder.address,
      flowRate: "200000"
    });
    await ufOp.exec(alice);

    // Alice increases USDC flow
    const ufOpu = sf.cfaV1.updateFlow({
      superToken: usdcx.address,
      receiver: streamrebounder.address,
      flowRate: "200000"
    });
    await ufOpu.exec(alice);

    // Alice deletes DAI flow
    await dfOp.exec(alice);

    // Alice deletes USDC flow
    await dfOpu.exec(alice);

  });

  it("protection tests", async function () {

    // Alice starts a DAI stream

    const aliceDaixFlow1 = sf.cfaV1.createFlow({
      superToken: daix.address,
      receiver: streamrebounder.address,
      flowRate: "100000"
    });
    await aliceDaixFlow1.exec(alice);

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

xdescribe("Poison Token Cannot Jail App", async function () {
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

describe("Test Randomness", async function () {

  it("", async function () {

    const res = await streamrebounder.connect(alice)._getRarity(779);

    console.log(res);

  })

});

xdescribe("NFT functionality", async function () {
  it("NFT received upon starting stream", async function () {
    
    // Alice starts a stream
    const aliceDaixFlow1 = sf.cfaV1.createFlow({
      superToken: daix.address,
      receiver: streamrebounder.address,
      flowRate: "100000"
    });
    await aliceDaixFlow1.exec(alice);

    // Assert to have one MOONSTONE
    expect( await streamrebounder.balanceOf(alice.address) ).to.equal(
      "1"
    );

    // Alice cancels a stream before 3 days

    // Assert to have no MOONSTONEs

    // Alice starts a stream again

    // Assert to have one MOONSTONE

  })

  it("NFT shouldn't be revealable when less than 3 days", async function () {

    // Alice tries to reveal MOONSTONE

    // Expect reversion

  });

  it("NFT should be revealable after 3 days", async function () {
  
    // Fast forward 3 days

    // Attempt to reveal

    // Expect reversion

  });

  it("NFT shouldn't be transferable upon cancellation of stream", async function () {

    // Attempt to transfer to Bob

    // Expect reversion

  });


  it("NFT quality should evolve through all stages of quality", async function () {

    // expect "Dull state"

    // Fast forward to 7th day, expect "Polished state"

    // Fast forward to 14th day, expect "Shiny state" 

    // Fast forward to 30th day, expect "Sparkling state"

    // Fast forward to 90th day, expect "Shimmering state"

    // Fast forward to 180th day, expect "Radiant state"

  })

  it("NFT should stay upon cancelling stream", async function () {

    // cancel stream

    // expect NFT to remain

  });

  it("Should be able to start another stream and get new NFT", async function () {

    // start stream

    // expect a second NFT

  });

});