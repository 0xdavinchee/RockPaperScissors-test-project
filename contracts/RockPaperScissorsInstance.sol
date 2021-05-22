//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RockPaperScissorsInstance is Initializable {
  struct PlayerData {
    bool deposited;
    bool revealed;
    bytes32 move;
  }

  address public playerA;
  address public playerB;
  bool public isActive;
  uint public betAmount;
  address public winner;
  uint public incentiveStartTime;

  IERC20 public token;

  mapping (address => PlayerData) public playerDataMap;

  // TODO: Maybe have events so that client can see all RPS games.
  // CreateGame, GameEnded,

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

  modifier canIncentivizeOpponent() {
    address opponentAddress = msg.sender == playerA
      ? playerB
      : playerA;

    require(
      playerDataMap[msg.sender].move[0] != 0
      && playerDataMap[opponentAddress].move[0] == 0,
      "You are not allowed to incentivize your opponent."
    );
    _;
  }

  /**
   * @dev Initializes the game with an ERC20 token, the caller who started the game 
   * and a bet amount. 
   */
  function initialize(address _creatorPlayer, IERC20 _token, uint _betAmount) public initializer {
    token = _token;
    playerA = _creatorPlayer;
    betAmount = _betAmount;
  }

  /**
   * @dev Enroll in the game by submitting the correct `_betAmount`.
   */
  function enrollInGame(uint _betAmount) public isNewPlayer() isNonZeroAddress(msg.sender) isOpenGame() {
    depositBet(_betAmount);
    playerB = msg.sender;
  }

  /**
   * @dev Submits a move that is encrypted using a randomized salt on the client.
   *
   * Requirements:
   * 
   * - the caller cannot change their move once they've submitted it.
   */
  function submitMove(bytes32 _move) public isValidPlayer(msg.sender) {
    require(
      msg.sender == playerA && playerDataMap[playerA].move[0] != 0
      || msg.sender == playerB && playerDataMap[playerB].move[0] != 0,
      "You cannot change your move."
    );
    msg.sender == playerA
      ? playerDataMap[playerA].move = _move
      : playerDataMap[playerB].move = _move;
  }

  /**
   * @dev Reveals the move the caller made and exposes it on the blockchain.
   * If both players have revealed their moves, we can check who won.
   *
   * Requirements:
   * 
   * - both players have to make their moves before either can reveal
   * - the user must pass the move they submitted initially with the same salt used for encryption
   */
  function revealMove(uint8 _move, bytes32 _salt) public isValidPlayer(msg.sender) {
    require(
      playerDataMap[playerA].move[0] != 0
      && playerDataMap[playerB].move[0] != 0,
      "Both players have yet to make a move."
    );
    
    bytes32 revealedHash = keccak256(abi.encodePacked(_move, _salt));
    require(revealedHash == playerDataMap[msg.sender].move, "It appears the move you entered isn't the same as before.");
    
    playerDataMap[msg.sender].move = keccakUint(_move);
    playerDataMap[msg.sender].revealed = true;

    if (playerDataMap[playerA].revealed == true && playerDataMap[playerB].revealed == true) {
      address winningAddress = getWinningAddress();
      endGameOrResetMoves(winningAddress);
    }
  }

  /**
   * @dev Allows the winner of the game to withdraw the tokens if there is something to withdraw.
   */
  function withdrawWinnings() public canWithdrawWinnings() {
    uint winningAmount = token.balanceOf(address(this));
    token.approve(msg.sender, winningAmount);
    token.transferFrom(address(this), msg.sender, winningAmount);
  }

  /**
   * @dev Deposits `_depositBetAmount` into the contract if it's greater than 0.
   * 
   * Requirements:
   *
   * - `playerHasDeposited[msg.sender]` must be false.
   * - `_depositBetAmount` must equal `betAmount` OR neither player has deposited yet.
   * - this contract requires allowance to transfer `_depositBetAmount` tokens
   */
  function depositBet(uint _depositBetAmount) public isValidPlayer(msg.sender) {
    require(playerDataMap[msg.sender].deposited == false, "You have already deposited.");
    require(
      _depositBetAmount == betAmount
      || (playerDataMap[playerA].deposited == false
      && playerDataMap[playerB].deposited == false), "You've submitted the incorrect bet amount."
    );
    require(token.allowance(msg.sender, address(this)) == _depositBetAmount, "You don't have allowance.");
    
    bool success = token.transferFrom(msg.sender, address(this), _depositBetAmount);
    if (success) {
      playerDataMap[msg.sender].deposited = true;
    }

    if (playerDataMap[playerA].deposited == true && playerDataMap[playerB].deposited == true) {
      isActive = true;
    }
  }

  /**
   * @dev Starts a rematch by resetting the state variables and setting a bet amount.
   * 
   * Requirements:
   *
   * - a rematch cannot be started if there are still funds to withdraw.
   * - a rematch can only begin once there is a winner and the game is no longer active.
   */
  function startRematch(uint _betAmount) public isValidPlayer(msg.sender) {
    require(token.balanceOf(address(this)) == 0, "There are still funds to withdraw.");
    require(winner != address(0) && isActive == false, "The game hasn't finished yet.");
    delete playerDataMap[playerA].move;
    delete playerDataMap[playerB].move;
    playerDataMap[playerA].deposited = false;
    playerDataMap[playerB].deposited = false;
    playerDataMap[playerA].revealed = false;
    playerDataMap[playerB].revealed = false;
    betAmount = _betAmount;
    winner = address(0);
  }
  
  /**
   * @dev Allows the winner to start a rematch with their winnings.
   * Calls {startRematch} to reset state variables for a rematch.
   *
   * Requirements:
   * 
   * - only the winner can start the rematch with winnings
   */
  function startRematchWithWinnings() public {
    require(msg.sender == winner, "You must be the winner to start a rematch with the winnings.");
    startRematch(token.balanceOf(address(this)));
    playerDataMap[msg.sender].deposited = true;
  }

  /**
   * @dev Allows a player to withdraw deposited tokens if done before the game has started.
   *
   * Requirements:
   * 
   * - the caller cannot withdraw if the game is active
   */
  function withdrawBeforeGameStarts() public {
    require(isActive == false, "You can't withdraw once the game has started.");
    require(playerDataMap[msg.sender].deposited == true, "You haven't deposited yet.");
    uint contractTokenBalance = token.balanceOf(address(this));
    
    token.approve(msg.sender, contractTokenBalance);
    bool success = token.transferFrom(address(this), msg.sender, contractTokenBalance);
    if (success) {
      playerDataMap[msg.sender].deposited = false;
    }
  }

  /**
   * @dev Allows a player to incentivize an uncooperative opponent. Calling this function
   * gives the opponent an hour to make a move otherwise the caller will be able to 
   * withdraw the deposited funds.
   *
   * Requirements:
   * 
   * - the caller has to have made a move AND their opponent has not yet
   */
  function incentivizeUser() public isValidPlayer(msg.sender) canIncentivizeOpponent() {
    uint contractTokenBalance = token.balanceOf(address(this));

    if (incentiveStartTime == 0) {
      incentiveStartTime = block.timestamp;
    }
    if (incentiveStartTime != 0 && ((block.timestamp - incentiveStartTime) > 1 hours)) {
      isActive = false;
      winner = msg.sender;
      token.approve(msg.sender, contractTokenBalance);
      token.transferFrom(address(this), msg.sender, contractTokenBalance);
    }
  }

  /**
   * @dev Returns `address(0)` in the event of a tie or the winner's address.
   */
  function getWinningAddress() internal view returns (address) {
    bytes32 hashedRock = keccakUint(0);
    bytes32 hashedPaper = keccakUint(1);
    bytes32 hashedScissors = keccakUint(2);
    
    if (playerDataMap[playerA].move == playerDataMap[playerB].move) {
      return address(0);
    }

    if (playerDataMap[playerA].move == hashedRock && playerDataMap[playerB].move == hashedScissors
      || playerDataMap[playerA].move == hashedPaper && playerDataMap[playerB].move == hashedRock
      || playerDataMap[playerA].move == hashedScissors && playerDataMap[playerB].move == hashedPaper) {
        return playerA;
    } else {
      return playerB;
    }
  }

  /**
   * @dev Resets the game in the event of a tie or ends the game and declares
   * a winner if someone has won.
   */
  function endGameOrResetMoves(address _winningAddress) internal {
    if (_winningAddress == address(0)) {
      delete playerDataMap[playerA].move;
      delete playerDataMap[playerB].move;
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
