//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RockPaperScissorsInstance is Initializable {
  enum WithdrawalReason {
    EarlyWithdrawal,
    WinningWithdrawal,
    IncentivizedWithdrawal
  }

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

  event GameInitialized(address indexed _playerA, address indexed _tokenAddress, uint _betAmount);
  event GameStarted(address _playerA, address _playerB, uint _betAmount);
  event GameOutcome(address _winner, bytes32 _winningMove);
  event DepositCompleted(address _player, uint _amount);
  event MoveSubmitted(address _player, bytes32 _move);
  event MovesReset();
  event MoveRevealed(address _player, bytes32 _revealedMove);
  event WithdrawFunds(address _player, uint _amount, WithdrawalReason _reason);
  event RematchRequested(address _requester, uint _betAmount);

  modifier isValidPlayer(address _address) {
    require(msg.sender == playerA || msg.sender == playerB, "You are not a part of this game.");
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
   * 
   * Emits a {GameInitialized} event indicating the creator, address of the token to be used 
   * and the bet amount.
   */
  function initialize(address _creatorPlayer, address _tokenAddress, uint _betAmount) public initializer {
    token = IERC20(_tokenAddress);
    playerA = _creatorPlayer;
    betAmount = _betAmount;

    emit GameInitialized(_creatorPlayer, _tokenAddress, _betAmount);
  }

  /**
   * @dev Submits a move that is encrypted using a randomized salt on the client.
   * If the player who hasn't made a move yet (and was being uncooperative) makes a
   * move, the incentiveStartTime gets reset to 0.
   *
   * Emits a {MoveSubmitted} event indicating the move made and the player who made it.
   *
   * Requirements:
   * 
   * - the caller cannot change their move once they've submitted it.
   */
  function submitMove(bytes32 _move) public isValidPlayer(msg.sender) {
    require(
      msg.sender == playerA && playerDataMap[playerA].move[0] == 0
      || msg.sender == playerB && playerDataMap[playerB].move[0] == 0,
      "You cannot change your move."
    );
    
    if (incentiveStartTime != 0) {
      incentiveStartTime = 0;
    }

    msg.sender == playerA
      ? playerDataMap[playerA].move = _move
      : playerDataMap[playerB].move = _move;

    emit MoveSubmitted(msg.sender, _move);
  }

  /**
   * @dev Reveals the move the caller made and exposes it on the blockchain.
   * If both players have revealed their moves, the contract checks who won and declares
   * a winner. If a player reveals their move and it is an incorrect move, we must reset
   * everyone's moves.
   *
   * Emits a {MoveRevealed} event indicating the revealed move and the player who made it.
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

    if (_move >= 3) {
      resetPlayerMoves();
    }
    require(_move < 3, "You must pick rock, paper or scissors.");
    
    bytes32 revealedMoveHash = keccakUint(_move);

    playerDataMap[msg.sender].move = revealedMoveHash;
    playerDataMap[msg.sender].revealed = true;

    emit MoveRevealed(msg.sender, revealedMoveHash);

    if (playerDataMap[playerA].revealed == true && playerDataMap[playerB].revealed == true) {
      address winningAddress = getWinningAddress();
      endGameOrResetMoves(winningAddress);
    }
  }

  /**
   * @dev Allows the winner of the game to withdraw the tokens if there is something to withdraw.
   *
   * Emits a {WithdrawFunds} event indicating the player who withdrew, the amount and the reason.
   *
   */
  function withdrawWinnings() public {
    require(msg.sender == winner && isActive == false, "You are not allowed to withdraw.");
    uint winningAmount = token.balanceOf(address(this));
    token.transfer(msg.sender, winningAmount);

    emit WithdrawFunds(msg.sender, winningAmount, WithdrawalReason.WinningWithdrawal);
  }

  /**
   * @dev Deposits `_depositBetAmount` into the contract if it's greater than 0.
   * Also handles enrolling of `playerB` if they haven't enrolled yet.
   *
   * Emits a {DepositCompleted} event indicating the player who deposited and the amount.
   * Emits a {GameStarted} event indicating the players and the deposit amount.
   * 
   * Requirements:
   *
   * - the caller must be an existing player or there is still space for enrolling in the game.
   * - `playerHasDeposited[msg.sender]` must be false.
   * - `_depositBetAmount` must equal `betAmount` OR neither player has deposited yet AND
   *   both players are enrolled and in the game (rematch scenario).
   * - this contract requires allowance to transfer `_depositBetAmount` tokens
   */
  function depositBet(uint _depositBetAmount) public {
    require(playerDataMap[msg.sender].deposited == false, "You have already deposited.");
    require(token.allowance(
      msg.sender,
      address(this)) == _depositBetAmount,
      "You don't have allowance."
    );
    require(
      msg.sender == playerA
      || msg.sender == playerB
      || playerB == address(0),
      "You are not allowed to deposit."
    );
    require(
      _depositBetAmount == betAmount
      || (playerB != address(0)
      && (playerDataMap[playerA].deposited == false
      && playerDataMap[playerB].deposited == false)),
      "You've submitted the incorrect bet amount."
    );
    
    bool success = token.transferFrom(msg.sender, address(this), _depositBetAmount);
    if (success) {
      playerDataMap[msg.sender].deposited = true;

      // only used for enrolling playerB (playerA is enrolled when they pay for
      // contract creation)
      if (playerB == address(0) && msg.sender != playerA) {
        playerB = msg.sender;
      }

      emit DepositCompleted(msg.sender, _depositBetAmount);
    }

    if (playerDataMap[playerA].deposited == true && playerDataMap[playerB].deposited == true) {
      isActive = true;
      emit GameStarted(playerA, playerB, _depositBetAmount);
    }
  }

  /**
   * @dev Starts a rematch by resetting the state variables and setting a bet amount.
   *
   * Emits a {RematchRequested} event indicating the player who requested the rematch
   * and the new bet amount.
   * 
   * Requirements:
   *
   * - a rematch cannot be started if there are still funds to withdraw.
   * - a rematch can only begin once there is a winner and the game is no longer active.
   */
  function startRematch(uint _betAmount) public isValidPlayer(msg.sender) {
    require(winner != address(0) && isActive == false, "The game hasn't finished yet.");
    require(token.balanceOf(address(this)) == 0, "There are still funds to withdraw.");
    betAmount = _betAmount;
    winner = address(0);

    emit RematchRequested(msg.sender, _betAmount);
  }
  
  /**
   * @dev Allows the winner to start a rematch with their winnings.
   * 
   * Emits a {RematchRequested} event indicating the player who requested the rematch
   * and the new bet amount.
   * 
   * Requirements:
   * 
   * - only the winner can start the rematch with winnings
   */
  function startRematchWithWinnings() public isValidPlayer(msg.sender) {
    require(msg.sender == winner && isActive == false, "You must be the winner to start a rematch with the winnings.");
    
    uint previousWinningsAmount = token.balanceOf(address(this));
    betAmount = previousWinningsAmount;
    winner = address(0);
    playerDataMap[msg.sender].deposited = true;

    emit RematchRequested(msg.sender, previousWinningsAmount);
  }

  /**
   * @dev Allows a player to withdraw deposited tokens if done before the game has started.
   *
   * Emits a {WithdrawFunds} event indicating the player who withdrew, the amount and the reason.
   *
   * Requirements:
   * 
   * - the caller cannot withdraw if the game is active
   */
  function withdrawBeforeGameStarts() public {
    require(isActive == false, "You can't withdraw once the game has started.");
    require(playerDataMap[msg.sender].deposited == true, "You haven't deposited yet.");
    require(winner == address(0), "You can't withdraw when there's a winner.");
    uint contractTokenBalance = token.balanceOf(address(this));
    bool success = token.transfer(msg.sender, contractTokenBalance);
    if (success) {
      playerDataMap[msg.sender].deposited = false;
      emit WithdrawFunds(msg.sender, contractTokenBalance, WithdrawalReason.EarlyWithdrawal);
    }
  }

  /**
   * @dev Allows a player to incentivize an uncooperative opponent. Calling this function
   * gives the opponent an hour to make a move otherwise the caller will be able to 
   * withdraw the deposited funds.
   *
   * Emits a {WithdrawFunds} event indicating the player who withdrew, the amount and the reason.
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
      token.transfer(msg.sender, contractTokenBalance);
      emit WithdrawFunds(msg.sender, contractTokenBalance, WithdrawalReason.IncentivizedWithdrawal);
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
   *
   * Emits a {GameOutcome} event indicating the winning address and winning move.
   *
   */
  function endGameOrResetMoves(address _winningAddress) internal {
    if (_winningAddress == address(0)) {
      resetPlayerMoves();
    }

    if (_winningAddress != address(0)) {
      isActive = false;
      delete playerDataMap[playerA];
      delete playerDataMap[playerB];
      winner = _winningAddress;
    }

    emit GameOutcome(_winningAddress, playerDataMap[_winningAddress].move);
  }

  /**
   * @dev Resets players moves.
   *
   * Emits a {MovesReset} event indicating the all players moves have been reset.
   *
   */
  function resetPlayerMoves() internal {
      delete playerDataMap[playerA].move;
      delete playerDataMap[playerB].move;
      emit MovesReset();
  }

  /**
   * @dev Returns the keccak256 hash of an uint.
   */
  function keccakUint(uint _int) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_int));
  }
}
