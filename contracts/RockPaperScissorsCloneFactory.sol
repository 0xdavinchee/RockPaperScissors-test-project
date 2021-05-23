//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;

import "./RockPaperScissorsInstance.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract RockPaperScissorsCloneFactory {
  address immutable rockPaperScissorsImplementationAddress;

  event GameCreated(
    address indexed _creator,
    address _contractAddress,
    address _tokenAddress,
    uint _betAmount
  );

  constructor(address _address) {
    rockPaperScissorsImplementationAddress = _address;
  }

  function createRockPaperScissorsInstance(address _creator, address _tokenAddress, uint _betAmount) external returns (address) {
    address cloneAddress = Clones.clone(rockPaperScissorsImplementationAddress);
    RockPaperScissorsInstance(cloneAddress).initialize(_creator, _tokenAddress, _betAmount);

    emit GameCreated(_creator, cloneAddress, _tokenAddress, _betAmount);
    return cloneAddress;
  }

  function getImplementationAddress() public view returns (address) {
    return rockPaperScissorsImplementationAddress;
  }
}
