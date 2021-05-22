//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;

import "hardhat/console.sol";
import "./RockPaperScissorsInstance.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract RockPaperScissorsFactory {
  address immutable rockPaperScissorsImplementation;

  constructor(address _address) {
    rockPaperScissorsImplementation = _address;
  }

  function createRockPaperScissorsInstance() external returns (address) {
    address clone = Clones.clone(rockPaperScissorsImplementation);
    // RockPaperScissorsInstance(clone).initialize(_playerA, _playerB);
    return clone;
  }
}
