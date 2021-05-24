//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
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
  uint256 public betAmount;
  address public winner;
  uint256 public incentiveStartTime;

  IERC20 public token;

  mapping(address => PlayerData) public playerDataMap;

  event GameInitialized(
    address indexed _playerA,
    address indexed _tokenAddress,
    uint256 _betAmount
  );
  event GameStarted(
    address indexed _playerA,
    address indexed _playerB,
    uint256 _betAmount
  );
  event WithdrawFunds(
    address indexed _player,
    uint256 _amount,
    WithdrawalReason _reason
  );
  event DepositCompleted(address indexed _player, uint256 _amount);
  event GameOutcome(address indexed _winner, bytes32 _winningMove);
  event MovesReset();
  event MoveRevealed(address indexed _player, bytes32 _revealedMove);
  event MoveSubmitted(address indexed _player, bytes32 _move);
  event RematchRequested(address indexed _requester, uint256 _betAmount);

  modifier isValidPlayer(address _address) {
    require(
      msg.sender == playerA || msg.sender == playerB,
      "You are not a part of this game."
    );
    _;
  }

  modifier canIncentivizeOpponent() {
    address opponentAddress = msg.sender == playerA ? playerB : playerA;

    require(
      playerDataMap[msg.sender].move[0] != 0 &&
        playerDataMap[opponentAddress].move[0] == 0,
      "You are not allowed to incentivize your opponent."
    );
    _;
  }

  /**
   * @dev Initializes the game with an ERC20 token, the caller who started the game
   * and a bet amount.
   */
  function initialize(
    address _creatorPlayer,
    address _tokenAddress,
    uint256 _betAmount
  ) external initializer {
    token = IERC20(_tokenAddress);
    playerA = _creatorPlayer;
    betAmount = _betAmount;

    emit GameInitialized(_creatorPlayer, _tokenAddress, _betAmount);
  }

  /**
   * @dev Submits a move that is encrypted using a randomized salt on the client.
   * If the player who hasn't made a move yet (and was being uncooperative) makes a
   * move, the incentiveStartTime gets reset to 0.
   */
  function submitMove(bytes32 _move) external isValidPlayer(msg.sender) {
    require(
      (msg.sender == playerA && playerDataMap[playerA].move[0] == 0) ||
        (msg.sender == playerB && playerDataMap[playerB].move[0] == 0),
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
   */
  function revealMove(uint8 _move, bytes32 _salt)
    external
    isValidPlayer(msg.sender)
  {
    require(isActive == true, "The game is no longer active.");
    require(
      playerDataMap[playerA].move[0] != 0 &&
        playerDataMap[playerB].move[0] != 0,
      "Both players have yet to make a move."
    );

    bytes32 revealedHash = keccak256(abi.encodePacked(_move, _salt));
    require(
      revealedHash == playerDataMap[msg.sender].move,
      "It appears the move you entered isn't the same as before."
    );

    if (_move >= 3) {
      resetPlayerMoves();
    }
    require(_move < 3, "You must pick rock, paper or scissors.");

    bytes32 revealedMoveHash = keccakUint(_move);

    playerDataMap[msg.sender].move = revealedMoveHash;
    playerDataMap[msg.sender].revealed = true;

    emit MoveRevealed(msg.sender, revealedMoveHash);

    if (
      playerDataMap[playerA].revealed == true &&
      playerDataMap[playerB].revealed == true
    ) {
      address winningAddress = getWinningAddress();
      endGameOrResetMoves(winningAddress);
    }
  }

  /**
   * @dev Allows the winner of the game to withdraw the tokens if there is something to withdraw.
   */
  function withdrawWinnings() external {
    require(
      msg.sender == winner && isActive == false,
      "You are not allowed to withdraw."
    );
    uint256 winningAmount = token.balanceOf(address(this));
    token.transfer(msg.sender, winningAmount);

    emit WithdrawFunds(
      msg.sender,
      winningAmount,
      WithdrawalReason.WinningWithdrawal
    );
  }

  /**
   * @dev Deposits `_depositBetAmount` into the contract if it's greater than 0.
   * Also handles enrolling of `playerB` if they haven't enrolled yet.
   */
  function depositBet(uint256 _depositBetAmount) external {
    require(
      playerDataMap[msg.sender].deposited == false,
      "You have already deposited."
    );
    require(
      token.balanceOf(msg.sender) >= _depositBetAmount,
      "You don't have enough tokens."
    );
    require(
      token.allowance(msg.sender, address(this)) == _depositBetAmount,
      "You don't have allowance."
    );
    require(
      msg.sender == playerA || msg.sender == playerB || playerB == address(0),
      "You are not allowed to deposit."
    );
    require(
      _depositBetAmount == betAmount ||
        (playerB != address(0) &&
          (playerDataMap[playerA].deposited == false &&
            playerDataMap[playerB].deposited == false)),
      "You've submitted the incorrect bet amount."
    );

    bool success =
      token.transferFrom(msg.sender, address(this), _depositBetAmount);
    if (success) {
      playerDataMap[msg.sender].deposited = true;

      // only used for enrolling playerB (playerA is enrolled when they pay for
      // contract creation)
      if (playerB == address(0) && msg.sender != playerA) {
        playerB = msg.sender;
      }

      emit DepositCompleted(msg.sender, _depositBetAmount);
    }

    if (
      playerDataMap[playerA].deposited == true &&
      playerDataMap[playerB].deposited == true
    ) {
      isActive = true;
      emit GameStarted(playerA, playerB, _depositBetAmount);
    }
  }

  /**
   * @dev Starts a rematch by resetting the state variables and setting a bet amount.
   */
  function startRematch(uint256 _betAmount) external isValidPlayer(msg.sender) {
    require(
      winner != address(0) && isActive == false,
      "The game hasn't finished yet."
    );
    require(
      token.balanceOf(address(this)) == 0,
      "There are still funds to withdraw."
    );
    betAmount = _betAmount;
    winner = address(0);

    emit RematchRequested(msg.sender, _betAmount);
  }

  /**
   * @dev Allows the winner to start a rematch with their winnings.
   */
  function startRematchWithWinnings() external {
    require(
      msg.sender == winner && isActive == false,
      "You must be the winner to start a rematch with the winnings."
    );

    uint256 previousWinningsAmount = token.balanceOf(address(this));
    betAmount = previousWinningsAmount;
    winner = address(0);
    playerDataMap[msg.sender].deposited = true;

    emit RematchRequested(msg.sender, previousWinningsAmount);
  }

  /**
   * @dev Allows a player to withdraw deposited tokens if done before the game has started.
   */
  function withdrawBeforeGameStarts() external {
    require(isActive == false, "You can't withdraw once the game has started.");
    require(
      playerDataMap[msg.sender].deposited == true,
      "You haven't deposited yet."
    );
    require(winner == address(0), "You can't withdraw when there's a winner.");
    uint256 contractTokenBalance = token.balanceOf(address(this));
    bool success = token.transfer(msg.sender, contractTokenBalance);
    if (success) {
      playerDataMap[msg.sender].deposited = false;
      emit WithdrawFunds(
        msg.sender,
        contractTokenBalance,
        WithdrawalReason.EarlyWithdrawal
      );
    }
  }

  /**
   * @dev Allows a player to incentivize an uncooperative opponent. Calling this function
   * gives the opponent an hour to make a move otherwise the caller will be able to
   * withdraw the deposited funds.
   */
  function incentivizeUser() external canIncentivizeOpponent() {
    uint256 contractTokenBalance = token.balanceOf(address(this));

    if (incentiveStartTime == 0) {
      incentiveStartTime = block.timestamp;
    }

    // this is set to 1 seconds for testing purposes, it would make sense
    // to give your opponent much more time to respond.
    if (
      incentiveStartTime != 0 &&
      ((block.timestamp - incentiveStartTime) > 1 seconds)
    ) {
      isActive = false;
      winner = msg.sender;
      token.transfer(msg.sender, contractTokenBalance);
      emit WithdrawFunds(
        msg.sender,
        contractTokenBalance,
        WithdrawalReason.IncentivizedWithdrawal
      );
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

    if (
      (playerDataMap[playerA].move == hashedRock &&
        playerDataMap[playerB].move == hashedScissors) ||
      (playerDataMap[playerA].move == hashedPaper &&
        playerDataMap[playerB].move == hashedRock) ||
      (playerDataMap[playerA].move == hashedScissors &&
        playerDataMap[playerB].move == hashedPaper)
    ) {
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
   */
  function resetPlayerMoves() internal {
    delete playerDataMap[playerA].move;
    delete playerDataMap[playerB].move;
    emit MovesReset();
  }

  /**
   * @dev Returns the keccak256 hash of an uint.
   */
  function keccakUint(uint256 _int) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_int));
  }
}
