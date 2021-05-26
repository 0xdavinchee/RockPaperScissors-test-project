//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./RockPaperScissorsInstance.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract RockPaperScissorsCloneFactory {
    address immutable rockPaperScissorsImplementationAddress;

    event GameCreated(
        address indexed _creator,
        address indexed _contractAddress,
        address indexed _tokenAddress,
        uint256 _betAmount
    );

    constructor(address _address) {
        rockPaperScissorsImplementationAddress = _address;
    }

    function createRockPaperScissorsInstance(
        address _creator,
        address _tokenAddress,
        uint256 _betAmount
    ) external returns (address) {
        address cloneAddress =
            Clones.clone(rockPaperScissorsImplementationAddress);
        RockPaperScissorsInstance(cloneAddress).initialize(
            _creator,
            _tokenAddress,
            _betAmount
        );

        emit GameCreated(_creator, cloneAddress, _tokenAddress, _betAmount);
        return cloneAddress;
    }

    function getImplementationAddress() external view returns (address) {
        return rockPaperScissorsImplementationAddress;
    }
}
