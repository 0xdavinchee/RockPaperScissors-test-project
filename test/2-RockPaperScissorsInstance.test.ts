import { expect } from "./chai-setup";
import hre, { deployments, ethers } from "hardhat";

import {
  RockPaperScissorsCloneFactory,
  RockPaperScissorsInstance,
  RpsToken,
} from "../typechain";
import { setupUser, setupUsers } from "./utils";
import { contract, INITIAL_BET_AMOUNT } from "../utils/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

enum WithdrawalReason {
  EarlyWithdrawal,
  WinningWithdrawal,
  IncentivizedWithdrawal,
}

const setup = deployments.createFixture(
  async (
    { deployments, getNamedAccounts, getUnnamedAccounts, ethers },
    shouldEnroll?: boolean
  ) => {
    await deployments.fixture([
      contract.RockPaperScissorsCloneFactory,
      contract.RPSToken,
    ]);
    const RPSCloneFactory = (await ethers.getContract(
      contract.RockPaperScissorsCloneFactory
    )) as RockPaperScissorsCloneFactory;
    const RPSToken = (await ethers.getContract(contract.RPSToken)) as RpsToken;

    const { deployer } = await getNamedAccounts();
    const players = await getUnnamedAccounts();
    await RPSToken.transfer(players[0], 1000);
    await RPSToken.transfer(players[1], 1000);
    const rpsInstanceTxn = RPSCloneFactory.createRockPaperScissorsInstance(
      deployer,
      RPSToken.address,
      INITIAL_BET_AMOUNT
    );
    const rpsInstanceReceipt = await (await rpsInstanceTxn).wait();
    const rpsInstanceAddress = rpsInstanceReceipt.logs[0].address;
    const RPSInstance = (await ethers.getContractAt(
      contract.RockPaperScissorsInstance,
      rpsInstanceAddress
    )) as RockPaperScissorsInstance;
    const contracts = {
      RPSCloneFactory,
      RPSInstance,
      RPSToken,
    };

    const formattedDeployer = await setupUser(deployer, contracts);
    const formattedPlayers = await setupUsers(players, contracts);

    if (shouldEnroll) {
      await approveTokenAndDepositBet(formattedDeployer, INITIAL_BET_AMOUNT);
      await approveTokenAndDepositBet(formattedPlayers[0], INITIAL_BET_AMOUNT);
    }

    return {
      ...contracts,
      deployer: formattedDeployer,
      players: formattedPlayers,
    };
  }
);

const approveTokenAndDepositBet = async <
  T extends {
    [contractName: string]: Contract | RockPaperScissorsInstance | RpsToken;
  }
>(
  player: { address: string } & T,
  amount: number
) => {
  await player.RPSToken.approve(player.RPSInstance.address, amount);
  return player.RPSInstance.depositBet(amount);
};

const getHashedMove = async (move: number) => {
  const now = new Date().getMilliseconds();
  const salt = ethers.utils.id(now.toString());
  const hashedMove = ethers.utils.solidityKeccak256(
    ["uint8", "bytes32"],
    [move, salt]
  );
  return { hashedMove, salt };
};

const submitMove = async <
  T extends {
    [contractName: string]: Contract | RockPaperScissorsInstance | RpsToken;
  }
>(
  player: { address: string } & T,
  move: number
) => {
  const { hashedMove, salt } = await getHashedMove(move);
  const txn: ContractTransaction = await player.RPSInstance.submitMove(hashedMove);
  await txn.wait();

  return { hashedMove, salt };
};

const revealMove = async <
  T extends {
    [contractName: string]: Contract | RockPaperScissorsInstance | RpsToken;
  }
>(
  player: { address: string } & T,
  move: number,
  salt: string
) => {
  const txn: ContractTransaction = await player.RPSInstance.revealMove(move, salt);
  await txn.wait();
};

const submitMovesAndReveal = async <
  T extends {
    [contractName: string]: Contract | RockPaperScissorsInstance | RpsToken;
  }
>(
  playerA: { address: string } & T,
  playerB: { address: string } & T,
  playerAMove: number,
  playerBMove: number
) => {
  const promiseA = submitMove(playerA, playerAMove);
  const promiseB = submitMove(playerB, playerBMove);
  const [{ salt: playerASalt }, { salt: playerBSalt }] = await Promise.all([
    promiseA,
    promiseB,
  ]);

  await revealMove(playerA, playerAMove, playerASalt);
  await revealMove(playerB, playerBMove, playerBSalt);
};

describe("RockPaperScissorsInstance Tests", () => {
  describe("Deposit Tests", () => {
    it("Should allow player A to deposit funds.", async () => {
      const { players, RPSInstance } = await setup();
      await players[0].RPSToken.approve(
        RPSInstance.address,
        INITIAL_BET_AMOUNT
      );
      await expect(approveTokenAndDepositBet(players[0], INITIAL_BET_AMOUNT))
        .to.emit(RPSInstance, "DepositCompleted")
        .withArgs(players[0].address, INITIAL_BET_AMOUNT);
    });

    it("Should not allow player to deposit funds twice.", async () => {
      const { players } = await setup();
      approveTokenAndDepositBet(players[0], INITIAL_BET_AMOUNT);

      await expect(
        approveTokenAndDepositBet(players[0], INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("You have already deposited.");
    });

    it("Should not allow player to deposit without token spend allowance.", async () => {
      const { players } = await setup();
      await expect(
        players[0].RPSInstance.depositBet(INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("You don't have allowance");
    });

    it("Should not allow player to deposit incorrect token amount.", async () => {
      const { players } = await setup();
      await expect(
        approveTokenAndDepositBet(players[0], INITIAL_BET_AMOUNT * 2)
      ).to.be.revertedWith("You've submitted the incorrect bet amount.");
    });

    it("Should not allow a player to deposit when game is full.", async () => {
      const { players } = await setup();
      await approveTokenAndDepositBet(players[0], INITIAL_BET_AMOUNT);

      await expect(
        approveTokenAndDepositBet(players[1], INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("You are not allowed to deposit.");
    });

    it("Should emit DepositCompleted on successful deposit.", async () => {
      const { players, RPSInstance } = await setup();
      await expect(approveTokenAndDepositBet(players[0], INITIAL_BET_AMOUNT))
        .to.emit(RPSInstance, "DepositCompleted")
        .withArgs(players[0].address, INITIAL_BET_AMOUNT);
    });

    it("Should start the game once both players have deposited.", async () => {
      const { deployer, players, RPSInstance, RPSToken } = await setup();
      await approveTokenAndDepositBet(deployer, INITIAL_BET_AMOUNT);

      await expect(approveTokenAndDepositBet(players[0], INITIAL_BET_AMOUNT))
        .to.emit(RPSInstance, "GameStarted")
        .withArgs(deployer.address, players[0].address, INITIAL_BET_AMOUNT);
    });
  });

  describe("Submit/Reveal Move Tests", () => {
    it("Should allow the user to submit a move.", async () => {
      const { deployer, RPSInstance } = await setup(true);
      const { hashedMove } = await getHashedMove(0);

      await expect(RPSInstance.submitMove(hashedMove))
        .to.emit(RPSInstance, "MoveSubmitted")
        .withArgs(deployer.address, hashedMove);
    });

    it("Should not allow the user to change their move.", async () => {
      const { deployer } = await setup(true);

      const { hashedMove: playerHashedMove } = await submitMove(deployer, 0);
      await expect(
        deployer.RPSInstance.submitMove(playerHashedMove)
      ).to.be.revertedWith("You cannot change your move.");
    });

    it("Should allow both users to make their move.", async () => {
      const { deployer, players, RPSInstance } = await setup(true);

      const { hashedMove: playerAHashedMove } = await submitMove(deployer, 0);
      const { hashedMove: playerBHashedMove } = await submitMove(players[0], 1);

      const playerADataMap = await RPSInstance.playerDataMap(deployer.address);
      const playerBDataMap = await RPSInstance.playerDataMap(
        players[0].address
      );
      expect([playerAHashedMove, playerBHashedMove]).to.eql([
        playerADataMap["move"],
        playerBDataMap["move"],
      ]);
    });

    it("Should allow the user to reveal their move.", async () => {
      const { deployer, players, RPSInstance } = await setup(true);

      const hashedMove = ethers.utils.solidityKeccak256(["uint"], [0]);
      const { salt } = await submitMove(deployer, 0);
      await submitMove(players[0], 0);
      await expect(RPSInstance.revealMove(0, salt))
        .to.emit(RPSInstance, "MoveRevealed")
        .withArgs(deployer.address, hashedMove);
    });

    it("Should allow both users to reveal their moves.", async () => {
      const { deployer, players, RPSInstance } = await setup(true);

      const hashedMove = ethers.utils.solidityKeccak256(["uint"], [0]);
      const { salt: playerASalt } = await submitMove(deployer, 0);
      const { salt: playerBSalt } = await submitMove(players[0], 0);
      await RPSInstance.revealMove(0, playerASalt);
      await expect(players[0].RPSInstance.revealMove(0, playerBSalt))
        .to.emit(RPSInstance, "MoveRevealed")
        .withArgs(players[0].address, hashedMove);
    });

    it("Should not allow user to use wrong move when revealing.", async () => {
      const { deployer, players } = await setup(true);

      await submitMove(deployer, 0);
      const { salt: playerBSalt } = await submitMove(players[0], 0);
      await expect(
        players[0].RPSInstance.revealMove(1, playerBSalt)
      ).to.be.revertedWith(
        "It appears the move you entered isn't the same as before."
      );
    });

    it("Should not allow user to use wrong salt when revealing.", async () => {
      const { deployer, players } = await setup(true);

      const { salt: playerASalt } = await submitMove(deployer, 0);
      await submitMove(players[0], 0);
      await expect(
        players[0].RPSInstance.revealMove(0, playerASalt)
      ).to.be.revertedWith(
        "It appears the move you entered isn't the same as before."
      );
    });

    it("Should reset everyone's moves if one or more players submitted an incorrect move.", async () => {
      const { deployer, players } = await setup(true);

      const { salt } = await submitMove(deployer, 3);
      await submitMove(players[0], 0);
      await expect(deployer.RPSInstance.revealMove(3, salt)).to.be.revertedWith(
        "You must pick rock, paper or scissors."
      );
    });

    it("Should not allow non-player to submit a move.", async () => {
      const { players } = await setup(true);

      const { hashedMove: playerHashedMove } = await getHashedMove(0);
      await expect(
        players[1].RPSInstance.submitMove(playerHashedMove)
      ).to.be.revertedWith("You are not a part of this game.");
    });
  });

  describe("Game Logic/Winner Tests", () => {
    it("Should be a tie if players use the same move", async () => {
      const { deployer, players, RPSInstance } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 0, 0);
      const winner = await RPSInstance.winner();
      const playerADataMap = await RPSInstance.playerDataMap(deployer.address);
      const playerBDataMap = await RPSInstance.playerDataMap(
        players[0].address
      );
      expect([winner, playerADataMap["move"], playerBDataMap["move"]]).to.eql([
        ethers.constants.AddressZero,
        ethers.constants.HashZero,
        ethers.constants.HashZero,
      ]);
    });

    it("Player A should win with a winning hand", async () => {
      const { deployer, players, RPSInstance } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 0, 2);
      const winner = await RPSInstance.winner();
      expect(winner).to.eql(deployer.address);
    });

    it("Player B should win with a winning hand", async () => {
      const { deployer, players, RPSInstance } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 0, 1);
      const winner = await RPSInstance.winner();
      expect(winner).to.eql(players[0].address);
    });
  });

  describe("Withdraw Edge Cases", () => {
    it("Player should be able to withdraw before game starts.", async () => {
      const { deployer, RPSInstance } = await setup();
      await approveTokenAndDepositBet(deployer, INITIAL_BET_AMOUNT);
      await expect(deployer.RPSInstance.withdrawBeforeGameStarts())
        .to.emit(RPSInstance, "WithdrawFunds")
        .withArgs(
          deployer.address,
          INITIAL_BET_AMOUNT,
          WithdrawalReason.EarlyWithdrawal
        );
    });

    it("Player should not be able to withdraw before game starts if they haven't deposited.", async () => {
      const { deployer } = await setup();
      await expect(
        deployer.RPSInstance.withdrawBeforeGameStarts()
      ).to.be.revertedWith("You haven't deposited yet.");
    });
  });


  describe("Withdraw Tests", () => {
    it("Player should not be able to withdraw before game starts if game has started.", async () => {
      const { deployer } = await setup(true);
      await expect(deployer.RPSInstance.withdrawBeforeGameStarts()).to.be.revertedWith(
        "You can't withdraw once the game has started."
      );
    });

    it("Winner should be able to withdraw.", async () => {
      const { deployer, players, RPSInstance } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 0, 2);
      await expect(deployer.RPSInstance.withdrawWinnings())
        .to.emit(RPSInstance, "WithdrawFunds")
        .withArgs(
          deployer.address,
          INITIAL_BET_AMOUNT * 2,
          WithdrawalReason.WinningWithdrawal
        );
    });

    it("Loser should not be able to withdraw.", async () => {
      const { deployer, players } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 2, 1);
      await expect(
        players[0].RPSInstance.withdrawWinnings()
      ).to.be.revertedWith("You are not allowed to withdraw.");
    });

    it("Non-players should not be able to withdraw.", async () => {
      const { deployer, players } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 1, 2);
      await expect(
        players[1].RPSInstance.withdrawWinnings()
      ).to.be.revertedWith("You are not allowed to withdraw.");
    });

    it("Player should be able to incentivize uncooperative opponent.", async () => {
      const { deployer } = await setup(true);
      await submitMove(deployer, 0);
      await deployer.RPSInstance.incentivizeUser();
      expect((await deployer.RPSInstance.incentiveStartTime()).toNumber()
      ).to.not.eql(0);
    });

    it("Player should not be able to incentivize if they haven't made a move.", async () => {
      const { deployer } = await setup(true);
      await expect(
        deployer.RPSInstance.incentivizeUser()
      ).to.be.revertedWith("You are not allowed to incentivize your opponent.");
    });

    it("Player should not be able to incentivize cooperative opponent.", async () => {
      const { deployer, players } = await setup(true);
      await submitMove(deployer, 0);
      await submitMove(players[0], 1);
      await expect(deployer.RPSInstance.incentivizeUser()
      ).to.be.revertedWith("You are not allowed to incentivize your opponent.");
    });

    it("Opponent can become cooperative.", async () => {
      const { deployer, players } = await setup(true);
      await submitMove(deployer, 0);
      await deployer.RPSInstance.incentivizeUser();
      await submitMove(players[0], 1);
      expect((await deployer.RPSInstance.incentiveStartTime()).toNumber()).to.eql(
        0
      );
    });

    // use evm_increase_time
    it("Player should be able to withdraw funds once time condition is met.", async () => {
      const { deployer, RPSInstance } = await setup(true);
      await submitMove(deployer, 0);
      await deployer.RPSInstance.incentivizeUser();
      await hre.network.provider.send("evm_increaseTime", [3600001]);
      await expect(deployer.RPSInstance.incentivizeUser()).to.emit(
        RPSInstance,
        "WithdrawFunds"
      );
    });

    it("Player should not be able to withdraw funds if time condition isn't met.", async () => {
      const { deployer, RPSToken } = await setup(true);
      await submitMove(deployer, 0);
      await deployer.RPSInstance.incentivizeUser();
      await deployer.RPSInstance.incentivizeUser();
      expect(
        (await RPSToken.balanceOf(deployer.RPSInstance.address)).toNumber()
      ).to.be.greaterThan(0);
    });
  });

  describe("Rematch Tests", () => {
    it("Winning player should be able to start a rematch with same amount.", async () => {
      const { deployer, players, RPSInstance } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 0, 2);
      await RPSInstance.withdrawWinnings();
      await expect(
        RPSInstance.startRematch(INITIAL_BET_AMOUNT)
      )
        .to.emit(RPSInstance, "RematchRequested")
        .withArgs(deployer.address, INITIAL_BET_AMOUNT);
    });

    it("Losing player should be able to start a rematch with a different amount.", async () => {
      const { deployer, players, RPSInstance } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 0, 1);
      await players[0].RPSInstance.withdrawWinnings();
      await expect(
        RPSInstance.startRematch(INITIAL_BET_AMOUNT * 2)
      )
        .to.emit(RPSInstance, "RematchRequested")
        .withArgs(deployer.address, INITIAL_BET_AMOUNT * 2);
    });

    it("Player should not be able to start a rematch if there are winnings.", async () => {
      const { deployer, players } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 0, 2);
      await expect(
        deployer.RPSInstance.startRematch(INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("There are still funds to withdraw.");
    });

    it("Player should not be able to start a rematch if game hasn't finished.", async () => {
      const { deployer } = await setup(true);
      await submitMove(deployer, 0);
      await expect(
        deployer.RPSInstance.startRematch(INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("The game hasn't finished yet.");
    });

    it("Winning player should be able to start a rematch with winnings.", async () => {
      const { deployer, players, RPSInstance } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 0, 2);
      await expect(deployer.RPSInstance.startRematchWithWinnings())
        .to.emit(RPSInstance, "RematchRequested")
        .withArgs(deployer.address, INITIAL_BET_AMOUNT * 2);
    });

    it("Losing player should not be able to start a rematch with winnings.", async () => {
      const { deployer, players } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 0, 1);
      await expect(
        deployer.RPSInstance.startRematchWithWinnings()
      ).to.be.revertedWith(
        "You must be the winner to start a rematch with the winnings."
      );
    });

    it("Game can be completed and funds withdrawn after regular rematch.", async () => {
      const { deployer, players, RPSInstance } = await setup(true);
      const NEW_BET_AMOUNT = INITIAL_BET_AMOUNT * 2;
      await submitMovesAndReveal(deployer, players[0], 0, 2);
      await deployer.RPSInstance.withdrawWinnings();
      await deployer.RPSInstance.startRematch(NEW_BET_AMOUNT);

      await approveTokenAndDepositBet(deployer, NEW_BET_AMOUNT);
      await approveTokenAndDepositBet(players[0], NEW_BET_AMOUNT);
      await submitMovesAndReveal(deployer, players[0], 0, 2);
      await expect(deployer.RPSInstance.withdrawWinnings())
        .to.emit(RPSInstance, "WithdrawFunds")
        .withArgs(
          deployer.address,
          NEW_BET_AMOUNT * 2,
          WithdrawalReason.WinningWithdrawal
        );
    });

    it("Game can be completed and funds withdrawn after winnings rematch.", async () => {
      const { deployer, players, RPSInstance, RPSToken } = await setup(true);
      await submitMovesAndReveal(deployer, players[0], 0, 2);
      await deployer.RPSInstance.startRematchWithWinnings();
      const winningsBet = (await RPSToken.balanceOf(RPSInstance.address)).toNumber();

      await approveTokenAndDepositBet(players[0], winningsBet);
      await submitMovesAndReveal(deployer, players[0], 0, 1);
      await expect(players[0].RPSInstance.withdrawWinnings())
        .to.emit(RPSInstance, "WithdrawFunds")
        .withArgs(
          players[0].address,
          winningsBet * 2,
          WithdrawalReason.WinningWithdrawal
        );
    });
  });
});