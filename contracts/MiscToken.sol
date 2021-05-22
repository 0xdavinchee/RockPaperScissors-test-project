//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MiscToken is ERC20 {
  constructor(uint _amount) ERC20("Misc", "MSC") {
    _mint(msg.sender, _amount * 10 ** decimals());
  }
}