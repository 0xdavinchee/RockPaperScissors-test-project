//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;

import "./RockPaperScissorsInstance.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract RockPaperScissorsCloneFactory {
  address immutable rockPaperScissorsImplementation;

  constructor(address _address) {
    rockPaperScissorsImplementation = _address;
  }

  function createRockPaperScissorsInstance(address _creator, address _tokenAddress, uint _betAmount) external returns (address) {
    address clone = Clones.clone(rockPaperScissorsImplementation);
    RockPaperScissorsInstance(clone).initialize(_creator, _tokenAddress, _betAmount);
    return clone;
  }
}
