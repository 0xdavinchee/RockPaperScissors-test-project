//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RockPaperScissorsInstance is Initializable {
  address public playerA;
  address public playerB;
  bool public isActive;
  uint public betAmount;
  address public winner;

  bytes32 public playerAMove;
  bytes32 public playerBMove;
  IERC20 public token;

  // TODO: Maybe have events so that client can see all RPS games.

  modifier isNonZeroAddress(address _address) {
    require(_address != address(0));
    _;
  }

  modifier isNewPlayer() {
    require(msg.sender != playerA && msg.sender != playerB);
    _;
  }

  modifier isValidPlayer(address _address) {
    require(msg.sender == playerA || msg.sender == playerB);
    _;
  }


  function initialize(address _creatorPlayer, uint _betAmount) public initializer {
    playerA = _creatorPlayer;
    betAmount = _betAmount;
    depositBet(_betAmount);
  }

  function enrollInGame(uint _betAmount) public isNewPlayer() isNonZeroAddress(msg.sender) {
    require(playerB == address(0));
    require(_betAmount == betAmount);
    depositBet(_betAmount);
    playerB = msg.sender;
  }

  function submitMove(uint move) public isValidPlayer(msg.sender) {
    bytes32 hashedMove = keccakUint(move);
    msg.sender == playerA
      ? playerAMove = hashedMove
      : playerBMove = hashedMove;

    if (playerAMove[0] != 0 && playerBMove[0] != 0) {
      address winningAddress = calculateGameState();
      endGame(winningAddress);
    }
  }

  function withdrawWinnings() public {
  }

  function depositBet(uint _depositBetAmount) internal {
    if (betAmount > 0) {
      token.approve(msg.sender, _depositBetAmount);
      token.transferFrom(msg.sender, address(this), _depositBetAmount);
    }
  }

  // 0 = rock
  // 1 = paper
  // 2 = scissors
  function calculateGameState() internal view returns (address) {
    bytes32 hashedRock = keccakUint(0);
    bytes32 hashedPaper = keccakUint(1);
    bytes32 hashedScissors = keccakUint(2);
    
    if (playerAMove == playerBMove) {
      return address(0);
    }

    if (playerAMove == hashedRock && playerBMove == hashedScissors
      || playerAMove == hashedPaper && playerBMove == hashedRock
      || playerAMove == hashedScissors && playerBMove == hashedPaper) {
        return playerA;
    } else {
      return playerB;
    }
  }

  function endGame(address _winningAddress) internal {
    // the logic for ending the game
    // based on the winning address, we allow this person to withdraw the tokens deposited into this contract
    // for their victory    
  }

  function keccakUint(uint _int) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_int));
  }

}
