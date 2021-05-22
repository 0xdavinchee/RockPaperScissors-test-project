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
    require(_address != address(0), "This is an empty address.");
    _;
  }

  modifier isNewPlayer() {
    require(msg.sender != playerA && msg.sender != playerB, "You are already a part of this game.");
    _;
  }

  modifier isValidPlayer(address _address) {
    require(msg.sender == playerA || msg.sender == playerB, "You are not a part of this game.");
    _;
  }
  
  modifier isOpenGame() {
    require(playerB == address(0), "This game is full.");
    _;
  }

  modifier canWithdrawWinnings() {
    require(msg.sender == winner && isActive == false, "You are not allowed to withdraw.");
    _;
  }


  function initialize(address _creatorPlayer, IERC20 _token, uint _betAmount) public initializer {
    token = _token;
    playerA = _creatorPlayer;
    betAmount = _betAmount;
    depositBet(_betAmount);
  }

  function enrollInGame(uint _betAmount) public isNewPlayer() isNonZeroAddress(msg.sender) isOpenGame() {
    require(_betAmount == betAmount, "you've submitted the incorrect bet amount.");
    depositBet(_betAmount);
    playerB = msg.sender;
    isActive = true;
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

  function withdrawWinnings() public canWithdrawWinnings() {
    uint winningAmount = betAmount * 2;
    require(winningAmount > 0, "There is nothing to withdraw.");
    token.approve(msg.sender, winningAmount);
    token.transferFrom(address(this), msg.sender, winningAmount);
  }

  function depositBet(uint _depositBetAmount) internal {
    if (betAmount > 0) {
      require(token.allowance(msg.sender, address(this)) == _depositBetAmount, "You don't have allowance.");
      token.transferFrom(msg.sender, address(this), _depositBetAmount);
    }
  }

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
    if (_winningAddress == address(0)) {
      delete playerAMove;
      delete playerBMove;
    }

    if (_winningAddress != address(0)) {
      isActive = false;
      winner = _winningAddress;
    }
  }

  function keccakUint(uint _int) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_int));
  }

}
