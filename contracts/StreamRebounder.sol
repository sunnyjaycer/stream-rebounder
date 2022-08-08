//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.13;

import "hardhat/console.sol";

import {ISuperfluid, ISuperToken, ISuperApp, ISuperAgreement, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";

import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

contract StreamRebounder is SuperAppBase, Ownable {

    using CFAv1Library for CFAv1Library.InitData;

    CFAv1Library.InitData public cfaV1Lib;
    bytes32 constant public CFA_ID = keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");

    mapping(address => int96) flowRates;
    bool public locked;

   constructor(
        ISuperfluid host
    ) {
        assert(address(host) != address(0));


        cfaV1Lib = CFAv1Library.InitData(
            host,
            IConstantFlowAgreementV1(
                address(host.getAgreementClass(CFA_ID))
            )
        );

        uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
            // change from 'before agreement stuff to after agreement
            SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

        host.registerApp(configWord);
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
        override
        onlyExpected(_agreementClass)
        onlyHost
        notLocked
        returns (bytes memory newCtx)
    {
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

        flowRates[sender] = flowRate;

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
        override
        onlyExpected(_agreementClass)
        onlyHost
        returns (bytes memory newCtx)
    {
        newCtx = _ctx;

        // Get sender
        (address sender, ) = abi.decode(_agreementData, (address, address));

        // Get flow rate from sender to this
        (,int96 flowRate,,) = cfaV1Lib.cfa.getFlow(
            _superToken,
            sender,
            address(this)
        );

        flowRates[sender] = flowRate;

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
    ) external override onlyHost returns (bytes memory newCtx) {
        // According to the app basic law, we should never revert in a termination callback
        if (!_isCFAv1(_agreementClass)) {
            return _ctx;
        }

        newCtx = _ctx;

        // Get sender
        (address sender, address receiver) = abi.decode(_agreementData, (address, address));

        // If sender hasn't deleted flow to this then it must be replaced
        // If the sender of the flow being deleted is this, then it's a rogue beneficiary cancellation
        // In that case, receiver is actually the user, not this
        if (sender == address(this)) {
            newCtx = cfaV1Lib.createFlowWithCtx(_ctx, receiver, _superToken, flowRates[receiver]);
        } 

        // Otherwise, delete flow back to sender
        else {
            newCtx = cfaV1Lib.deleteFlowWithCtx(_ctx, address(this), sender, _superToken);
            delete flowRates[sender];
        } 

        return newCtx;

    }

    function _isCFAv1(address agreementClass) private view returns (bool) {
        return ISuperAgreement(agreementClass).agreementType() == CFA_ID;
    }

    modifier onlyHost() {
        require(
            msg.sender == address(cfaV1Lib.host),
            "RedirectAll: support only one host"
        );
        _;
    }

    modifier onlyExpected(address agreementClass) {
        require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
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

    /// @dev Batch close several inbound streams and corresponding outbound streams
    function emergencyCloseStream(address[] memory streamers, ISuperToken[] memory supertoken) external onlyOwner { 

        for (uint i=0; i<streamers.length; i++) {

            // Get flow into Rebounder
            (,int96 inFlow,,) = cfaV1Lib.cfa.getFlow(supertoken[i], streamers[i], address(this));
            // Delete stream into Rebounder, if needed
            if(inFlow != 0) {
                cfaV1Lib.deleteFlow(streamers[i], address(this), supertoken[i]);
            }
            
            // Get flow out from Rebounder
            (,int96 outFlow,,) = cfaV1Lib.cfa.getFlow(supertoken[i], address(this), streamers[i]);
            // Delete stream out from Rebounder, if needed
            if(outFlow != 0) {
                cfaV1Lib.deleteFlow(address(this), streamers[i], supertoken[i]);
            }
            
            delete flowRates[streamers[i]];

        }

    }

}