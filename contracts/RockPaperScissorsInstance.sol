//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract RockPaperScissorsInstance is Initializable {

  function initialize(address _playerA, address _playerB) public initializer {
    // TODO: constructor, should initialize the contract and other necessary state variables

  }

  function enrollInGame(uint _amount) public {
    // TODO: a function to start the game, the user must deposit the amount set at initialization
    // otherwise they are not allowed to enroll
  }

  function submitMove(uint move) public {
    // TODO: a function for the user to submit the move they would like to make for the game
    // this must be obfuscated, but then retrievable by the code later when the game has ended
  }

  function endGame() public returns (address) {
    // TODO: a function to end the game, this will be called after submitMove if the previous player has made a move
  }
}
