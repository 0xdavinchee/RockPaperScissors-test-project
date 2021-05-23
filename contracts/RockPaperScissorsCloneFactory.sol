//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;

import "./RockPaperScissorsInstance.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract RockPaperScissorsCloneFactory {
  address immutable rockPaperScissorsImplementationAddress;

  constructor(address _address) {
    rockPaperScissorsImplementationAddress = _address;
  }

  function createRockPaperScissorsInstance(address _creator, address _tokenAddress, uint _betAmount) external returns (address) {
    address clone = Clones.clone(rockPaperScissorsImplementationAddress);
    RockPaperScissorsInstance(clone).initialize(_creator, _tokenAddress, _betAmount);
    return clone;
  }

  function getImplementationAddress() public view returns (address) {
    return rockPaperScissorsImplementationAddress;
  }
}
