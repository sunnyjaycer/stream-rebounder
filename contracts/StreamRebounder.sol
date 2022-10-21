//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.13;

import {ISuperfluid, ISuperToken, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";

import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";


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
        uint256 start;
        // record when stream ended to finalize rendering of moonstone
        uint256 end;
    }

    /// @notice Mapping Token IDs to NFT Properties
    mapping(uint256 => Properties) tokenIdToProperties;

    /// @notice An address may have multiple old revealed moonstone NFTs. 
    ///         We only want to deal with the NFT that's and evolving due to streams
    mapping(address => uint256) userToActiveMoonstone; 

    /// @notice duration moonrock must be streamed to in order to reveal
    uint256 public revealDuration;

    /// @notice the probability of each rarity appearing
    uint256[6] public rarityArray;

    /// @notice The current Token ID, incremented with each mint
    uint256 public tokenId;

    /// @notice The base URL for querying NFT metadata
    string public baseUrl;

    /// @notice false if rainbow moonstone has been minted
    bool public rainbowMinted;

    /// @notice when a moonstone is revealed
    event Revealed(uint256 id, address holder);

    /// @notice when someone stops streaming to their moonstone
    event Stopped(uint256 id, address holder, uint256 duration);

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
    // Revealing
    //------------------------------------
    
    /// @notice If moonstone has been streamed to for long enough, reveal it
    function reveal(uint256 id) public {
        Properties memory properties = tokenIdToProperties[id];

        uint256 streamDuration = properties.end == 0 ? 
                                    properties.end - properties.start :
                                    block.timestamp - properties.start;

        // if stream duration is greater than needed reveal duration
        if( streamDuration > revealDuration ) {
            // Set NFT properties
            tokenIdToProperties[id] = Properties(
                // revealed - true
                true,
                // rarity - randomly set
                _getRarity(id),
                // color - randomly set
                _getColor(id),
                // set the start to now as this is from when on the rock starts growing
                block.timestamp,
                // time stream was deleted - not set
                0
            );
        }

    }

    /// @notice Set duration needed to stream in order to reveal moonrock
    function setRevealDuration(uint256 _revealDuration) external onlyOwner {
        
        revealDuration = _revealDuration;

    }

    //------------------------------------
    // ERC721
    //------------------------------------

    /// @notice Override _beforeTokenTransfer to refine transfer control
    /// @dev only allow for transfer if not streaming for this NFT
    function _beforeTokenTransfer(address from, address to, uint256 id) internal view override {
        
        // if it's not a mint, a burn, or moonrock that's not being actively streamed to, then revert
        if( from != address(0) || to != address(0) || userToActiveMoonstone[from] != id ) {

            revert INVALIDTRANSFER();
            
        }

    }

    /// @notice Allows for internal minting of ASTRO upon agreement creation
    /// @dev Randomly selects rarity and color
    function mint(address _to) internal {

        // Increment token IDs
        tokenId++;

        // Set the userToActiveMoonstone
        userToActiveMoonstone[_to] = tokenId;

        // set the time where the moonstone was minted
        tokenIdToProperties[tokenId].start = block.timestamp;

        // mint the NFT
        _mint(_to, tokenId);
        
    }

    //------------------------------------
    // Metadata
    //------------------------------------

    /// @notice sets metadata base url
    function setBaseURL(string calldata newBaseUrl) public onlyOwner {
        
        baseUrl = newBaseUrl;

    }

    /// @notice Set rarity array
    /// @dev rarity set as a number out of 1000
    /// @param _rarityArray probabilities for each rarity tier from common to primordial
    function setRarity(uint256[6] memory _rarityArray) external onlyOwner {
        rarityArray = _rarityArray;
    }

    // NOTE: set to internal before deployment
    /// @notice Randomly selects rarity (number from 1 to 6)
    /// @param tokenId that rarity is being retrieved for
    /// 1 - Common      - 50% chance
    /// 2 - Uncommon    - 30% chance
    /// 3 - Rare        - 10% chance
    /// 4 - Epic        - 7%  chance
    /// 5 - Legendary   - 2%  chance
    /// 6 - Primordial  - 1%  chance
    function _getRarity(uint tokenId) internal view returns (uint256) {
        // get random number from 1 to 1000
        uint256 randomNumber = ( 1 + uint256(
            keccak256(
                abi.encodePacked(
                    block.difficulty,
                    blockhash(block.number - 1), 
                    tokenId, 
                    msg.sender
                )
            )
        ) ) % 1000;

        // iterate down levels and see which rarity tier the token id reaches
        uint256 probabilitySum = rarityArray[0];
        for( uint256 i = 1; i < 7; ) {

            // if random number is under probability level
            if (randomNumber < probabilitySum) {
                // it's within that tier, return tier identifier
                return i;
            // else, the random number is above probability level
            } else {
                // increase probability sum to include next level
                probabilitySum += rarityArray[i];
            }

            // then we'll see if it's under that, and if not, the cycle repeats

            unchecked{ i++; }

        }


    }

    // NOTE: set to internal before deployment
    /// @notice Randomly selects color (number from 1-8)
    /// @param tokenId that color is being retrieved for
    /// 1 - Red         - 1/7 chance
    /// 2 - Orange      - 1/7 chance
    /// 3 - Yellow      - 1/7 chance
    /// 4 - Green       - 1/7 chance
    /// 5 - Blue        - 1/7 chance
    /// 6 - Indigo      - 1/7 chance
    /// 7 - Violet      - 1/7 chance
    /// 8 - Rainbow     - occurs once upon 777 
    function _getColor(uint tokenId) internal returns (uint256) {
        // get a random number from 1 to 1000
        uint256 randomNumber = ( 1 + uint256(
            keccak256(
                abi.encodePacked(
                    block.difficulty,
                    blockhash(block.number - 1), 
                    tokenId, 
                    msg.sender
                )
            )
        ) ) % 1000;

        // if the number returns 777 and rainbowMinted is false, flip rainbowMinted to true and return 8
        if (randomNumber == 777 && !rainbowMinted) {
            rainbowMinted = true;
            return 8;
        // else, return modulus 7
        } else {
            return 1 + (randomNumber % 7);
        }        
    }

    // function _random(uint tokenId) public view returns (uint256) {
    //     bytes32 blckhash = blockhash(block.number - 1); 

    //     return ( 1 + uint256(
    //         keccak256(
    //             abi.encodePacked(
    //                 block.difficulty,
    //                 blckhash, 
    //                 tokenId, 
    //                 msg.sender
    //             )
    //         )
    //     ) ) % 7;
    // }

    /// @notice Provides NFT Metadata
    function tokenURI(uint256 id) public view override returns (string memory) {
        Properties memory properties = tokenIdToProperties[id];

        // if not revealed, just show revealed=false, otherwise...
        //   revealed=true, rarity=whaterver, color=whatever, duration=whatever
        return string(abi.encodePacked(
            baseUrl,
            !properties.revealed ? '?revealed=false' :
            '?revealed=true',
            '&rarity=', properties.rarity,
            '&color=', properties.color,
            // if stream is active, then return now minus start time for length. otherwise, get recorded end time less start time for length
            '&streamTime=', properties.end == 0 ? block.timestamp - properties.start : properties.end - properties.start
        ));

    }

    //------------------------------------
    // Superfluid Callbacks
    //------------------------------------

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
        require(acceptedToken[_superToken], "invalid token");

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
        mint(sender);

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

            // set the sender to the receiver for the NFT actions
            sender = receiver;
        } 

        else {

            // Otherwise, delete flow back to sender
            newCtx = cfaV1Lib.deleteFlowWithCtx(_ctx, address(this), sender, _superToken);

        } 

        // get the sender's time streamed
        uint256 timeStreamed = block.timestamp - tokenIdToProperties[userToActiveMoonstone[sender]].start;

        // set the end time of stream
        tokenIdToProperties[userToActiveMoonstone[sender]].end = block.timestamp;        
        
        // if time streamed is less than 3 days (86400 * 3 = 259200)
        if( timeStreamed > 259200) {

            // burn the sender's active NFT
            _burn(userToActiveMoonstone[sender]);
        
        }

        // set the sender's active NFT ID to zero 
        userToActiveMoonstone[sender] = 0;

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
