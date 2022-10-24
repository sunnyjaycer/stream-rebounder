import "forge-std/Test.sol";
import "../../contracts/StreamRebounder.sol";
import {ISuperfluid} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {
    SuperfluidFrameworkDeployer,
    TestGovernance,
    Superfluid,
    ConstantFlowAgreementV1,
    CFAv1Library,
    InstantDistributionAgreementV1,
    IDAv1Library,
    SuperTokenFactory
} from "@superfluid-finance/ethereum-contracts/contracts/utils/SuperfluidFrameworkDeployer.sol";

contract StreamRebounderRandomTest is Test {

    StreamRebounder public streamRebounder;
    
    struct Framework {
        TestGovernance governance;
        Superfluid host;
        ConstantFlowAgreementV1 cfa;
        CFAv1Library.InitData cfaLib;
        InstantDistributionAgreementV1 ida;
        IDAv1Library.InitData idaLib;
        SuperTokenFactory superTokenFactory;
    }

    SuperfluidFrameworkDeployer.Framework sf;
    
    function setUp() public {

        SuperfluidFrameworkDeployer sfd = new SuperfluidFrameworkDeployer();
        sf = sfd.getFramework();

        streamRebounder = new StreamRebounder(
            sf.host,
            "meh"
        );

    }

    function testFuzz_getRarity(uint256 tokenId) public {

        uint256[6] memory rarityArray;

        rarityArray[0] = 500;
        rarityArray[1] = 300;
        rarityArray[2] = 100;
        rarityArray[3] = 70;
        rarityArray[4] = 20;
        rarityArray[5] = 10;

        streamRebounder.setRarity(
            rarityArray
        );

        // Get rarity with given token ID
        uint256 rarity = streamRebounder._getRarity(tokenId);

        // Assert rarity is between 1 and 6

        if (rarity > 0) {

            assertGe(
                rarity,
                1
            );

            assertLe(
                rarity,
                6
            );

        }

    }

    //function testFuzz_get

}