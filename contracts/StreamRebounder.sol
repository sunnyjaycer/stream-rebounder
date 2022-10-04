//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.13;

import {ISuperfluid, ISuperToken, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";

import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// Transfer attempted that was not a burn or mint
error INVALIDTRANSFER();

contract StreamRebounder is Ownable, ERC721 {

    using CFAv1Library for CFAv1Library.InitData;

    CFAv1Library.InitData public cfaV1Lib;
    bytes32 constant public CFA_ID = keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");

    mapping(ISuperToken => bool) public acceptedToken;

    mapping(address => int96) public flowRates;

    bool public locked;

    /// @notice Properties of Moonstone NFT
    /// @dev The quality property is read based off time streamed so far
    struct Properties {
        // if streaming has occured for 3 days, reveal() can set this to true
        bool revealed;
        // set randomly upon reveal()
        uint256 rarity;
        // set randomly upon reveal()
        uint256 color;
        // tracking time stream was created to understand time streamed so far
        uint256 streamCreated;
    }

    /// @notice Mapping Token IDs to NFT Properties
    mapping(uint256 => Properties) tokenIdToProperties;

    /// @notice An address may have multiple old revealed moonstone NFTs. 
    ///         We only want to deal with the NFT that's and evolving due to streams
    mapping(address => uint256) userToActiveMoonstone; 

    /// @notice The current Token ID, incremented with each mint
    uint256 public tokenIds;

    constructor(
        ISuperfluid host,
        string memory registrationKey
    ) ERC721(
      "MOONSTONE",
      "Mysterious Moonstone"  
    ) {

        cfaV1Lib = CFAv1Library.InitData(
            host,
            IConstantFlowAgreementV1(
                address(host.getAgreementClass(CFA_ID))
            )
        );

        uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
            SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

        if (bytes(registrationKey).length > 0) {
            host.registerApp(configWord);
        } else {
            host.registerAppWithKey(configWord, registrationKey);
        }
    }

    //------------------------------------
    // ERC721 Function Features
    //------------------------------------

    /// @notice Override _beforeTokenTransfer to prevent transfers beyond mint or burn
    /// @dev only allow for transfer if 3 days of streaming have elapsed
    function _beforeTokenTransfer(address from,address to,uint256) internal pure override {
        
        // if it's not a mint or a burn
        if( from != address(0) && to != address(0) ) {
            // revert
            revert INVALIDTRANSFER();
        }

    }

    /// @notice Allows for internal minting of ASTRO upon agreement creation
    /// @dev Randomly selects rarity and color
    function mint(address to) internal {

        // Increment token IDs
        tokenIds++;

        // Set the userToActiveMoonstone
        

        // mint the NFT
        
    }

    function afterAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId
        bytes calldata _agreementData, //_agreementData
        bytes calldata, //_cbdata
        bytes calldata _ctx
    )
        external
        onlyExpected(_agreementClass)
        onlyHost
        notLocked
        returns (bytes memory newCtx)
    {
        require(acceptedToken[_superToken], "RedirectAll: invalid token");

        newCtx = _ctx;

        // Get sender
        (address sender, ) = abi.decode(_agreementData, (address, address));

        // Get flow rate from sender to this
        (,int96 flowRate,,) = cfaV1Lib.cfa.getFlow(
            _superToken,
            sender,
            address(this)
        );

        // start equal flow rate back
        newCtx = cfaV1Lib.createFlowWithCtx(_ctx, sender, _superToken, flowRate);

        // mint NFT to sender

        // set active NFT ID

        return newCtx;
    }

    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, // _agreementId,
        bytes calldata _agreementData, // _agreementData,
        bytes calldata, // _cbdata,
        bytes calldata _ctx
    )
        external
        onlyExpected(_agreementClass)
        onlyHost
        returns (bytes memory newCtx)
    {
        require(acceptedToken[_superToken], "RedirectAll: invalid token");

        newCtx = _ctx;

        // Get sender
        (address sender, ) = abi.decode(_agreementData, (address, address));

        // Get flow rate from sender to this
        (,int96 flowRate,,) = cfaV1Lib.cfa.getFlow(
            _superToken,
            sender,
            address(this)
        );

        // update to equal flow rate back
        newCtx = cfaV1Lib.updateFlowWithCtx(_ctx, sender, _superToken, flowRate);

    }

    function afterAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, // _agreementId,
        bytes calldata _agreementData, // _agreementData
        bytes calldata, // _cbdata,
        bytes calldata _ctx
    ) external onlyHost returns (bytes memory newCtx) {
        // According to the app basic law, we should never revert in a termination callback
        if (!_isCFAv1(_agreementClass) || !acceptedToken[_superToken]) {
            return _ctx;
        }

        newCtx = _ctx;

        // Get sender
        (address sender, address receiver) = abi.decode(_agreementData, (address, address));

        if (sender == address(this)) {
                
            // If the sender of the flow being deleted is this, then it's a rogue beneficiary cancellation
            // In that case, receiver is actually the user, not this
            // We'll just delete the inflow we're receiving from them and not try to be sticky
            newCtx = cfaV1Lib.deleteFlowWithCtx(_ctx, receiver, address(this), _superToken);
        } 

        else {

            // Otherwise, delete flow back to sender
            newCtx = cfaV1Lib.deleteFlowWithCtx(_ctx, address(this), sender, _superToken);

            // get the sender's time streamed
            
            // if time streamed is less than 3 days

                // burn the sender's active NFT

            // set the sender's active NFT ID to zero 

        } 

        return newCtx;
    }

    function _isCFAv1(address agreementClass) private view returns (bool) {
        return agreementClass == address(cfaV1Lib.cfa);
    }

    modifier onlyHost() {
        require(
            msg.sender == address(cfaV1Lib.host),
            "RedirectAll: disallowed host"
        );
        _;
    }

    modifier onlyExpected(address agreementClass) {
        require(_isCFAv1(agreementClass), "RedirectAll: disallowed agreement");
        _;
    }


    /**************************************************************************
     * Protection Functions
     *************************************************************************/

    modifier notLocked() {
        require(!locked, "Rebounder is locked");
        _;
    }

    /// @dev Set the lock status of the Rebounder to true to prevent new inbound streams
    function setLock(bool lockStatus) external onlyOwner {
        locked = lockStatus;
    }

    /// @dev Sets token allow list in batch. Generic to allow blocking bad tokens.
    /// @param tokens ISuperToken(address) array.
    /// @param allowed Boolean array. True if token at the respective index should be allowed.
    function setAllowListBatch(
        ISuperToken[] calldata tokens,
        bool[] calldata allowed
    ) external onlyOwner {
        uint256 i;
        uint256 length = tokens.length;
        require(length == allowed.length, "array mismatch");
        // There is not enough compute in the universe to overflow an array iterator.
        unchecked {
            for (i; i < length; ++i) {
                acceptedToken[tokens[i]] = allowed[i];
            }
        }
    }

    /// @dev Batch close several inbound streams and corresponding outbound streams
    function emergencyCloseStream(address[] memory streamers, ISuperToken[] memory supertoken) external onlyOwner { 

        for (uint i=0; i<streamers.length; i++) {

            // Get flow out from Rebounder
            (,int96 outFlow,,) = cfaV1Lib.cfa.getFlow(supertoken[i], address(this), streamers[i]);
            // Delete stream out from Rebounder, if needed
            if(outFlow != 0) {
                cfaV1Lib.deleteFlow(address(this), streamers[i], supertoken[i]);
            }

            // Get flow into Rebounder
            (,int96 inFlow,,) = cfaV1Lib.cfa.getFlow(supertoken[i], streamers[i], address(this));
            // Delete stream into Rebounder, if needed
            if(inFlow != 0) {
                cfaV1Lib.deleteFlow(streamers[i], address(this), supertoken[i]);
            }

            delete flowRates[streamers[i]];

        }

    }
}
