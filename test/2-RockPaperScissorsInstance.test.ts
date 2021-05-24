import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";

import {
  RockPaperScissorsCloneFactory,
  RockPaperScissorsCloneFactoryFactory,
  RockPaperScissorsInstanceFactory,
  RockPaperScissorsInstance,
  RpsTokenFactory,
  RpsToken,
} from "../typechain";

enum WithdrawalReason {
  EarlyWithdrawal,
  WinningWithdrawal,
  IncentivizedWithdrawal,
}

describe("RockPaperScissorsInstance Tests", () => {
  const INITIAL_BET_AMOUNT = 10;
  let contractCreator: SignerWithAddress;
  let playerA: SignerWithAddress;
  let playerB: SignerWithAddress;
  let rockPaperScissorsCloneFactoryFactory: RockPaperScissorsCloneFactoryFactory;
  let rockPaperScissorsCloneFactory: RockPaperScissorsCloneFactory;
  let rockPaperScissorsInstanceFactory: RockPaperScissorsInstanceFactory;
  let rockPaperScissorsTemplate: RockPaperScissorsInstance;
  let rockPaperScissorsInstance: RockPaperScissorsInstance;
  let rpsTokenFactory: RpsTokenFactory;
  let rpsToken: RpsToken;

  const approveTokenAndDepositBet = async (
    player: SignerWithAddress,
    amount: number
  ) => {
    await rpsToken
      .connect(player)
      .approve(rockPaperScissorsInstance.address, amount);
    return await rockPaperScissorsInstance.connect(player).depositBet(amount);
  };

  const createAndSetRPSInstance = async (
    player: SignerWithAddress,
    betAmount: number
  ) => {
    let contractTxn =
      await rockPaperScissorsCloneFactory.createRockPaperScissorsInstance(
        player.address,
        rpsToken.address,
        betAmount
      );
    const contractReceipt = await contractTxn.wait();

    const contractAddress = contractReceipt.logs[0].address;
    const factory = await ethers.getContractFactory(
      "RockPaperScissorsInstance"
    );
    rockPaperScissorsInstance = new ethers.Contract(
      contractAddress,
      factory.interface,
      player
    ) as RockPaperScissorsInstance;

    return rockPaperScissorsInstance.address;
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

  const submitMove = async (player: SignerWithAddress, move: number) => {
    const { hashedMove, salt } = await getHashedMove(move);
    await rockPaperScissorsInstance.connect(player).submitMove(hashedMove);

    return { hashedMove, salt };
  };
  const revealMove = async (
    player: SignerWithAddress,
    move: number,
    salt: string
  ) => {
    await rockPaperScissorsInstance.connect(player).revealMove(move, salt);
  };
  const submitMovesAndReveal = async (
    playerA: SignerWithAddress,
    playerB: SignerWithAddress,
    playerAMove: number,
    playerBMove: number
  ) => {
    const { salt: playerASalt } = await submitMove(playerA, playerAMove);
    const { salt: playerBSalt } = await submitMove(playerB, playerBMove);

    await revealMove(playerA, playerAMove, playerASalt);
    await revealMove(playerB, playerBMove, playerBSalt);
  };

  before(async () => {
    [contractCreator, playerA, playerB] = await ethers.getSigners();
    rpsTokenFactory = (await ethers.getContractFactory(
      "RPSToken",
      contractCreator
    )) as RpsTokenFactory;
    rpsToken = await rpsTokenFactory.deploy(10000);
    await rpsToken.deployed();
    await rpsToken.connect(contractCreator).transfer(playerA.address, 1000);
    await rpsToken.connect(contractCreator).transfer(playerB.address, 1000);

    rockPaperScissorsInstanceFactory = (await ethers.getContractFactory(
      "RockPaperScissorsInstance",
      contractCreator
    )) as RockPaperScissorsInstanceFactory;
    rockPaperScissorsTemplate = await rockPaperScissorsInstanceFactory.deploy();
    await rockPaperScissorsTemplate.deployed();

    rockPaperScissorsCloneFactoryFactory = (await ethers.getContractFactory(
      "RockPaperScissorsCloneFactory",
      contractCreator
    )) as RockPaperScissorsCloneFactoryFactory;
    rockPaperScissorsCloneFactory =
      await rockPaperScissorsCloneFactoryFactory.deploy(
        rockPaperScissorsTemplate.address
      );
    await rockPaperScissorsCloneFactory.deployed();
  });

  beforeEach(async () => {
    await createAndSetRPSInstance(playerA, INITIAL_BET_AMOUNT);
  });

  describe("Initialize Test", () => {
    it("Should emit the correct variables.", async () => {
      const contractTxn =
        await rockPaperScissorsCloneFactory.createRockPaperScissorsInstance(
          playerA.address,
          rpsToken.address,
          INITIAL_BET_AMOUNT
        );
      const contractReceipt = await contractTxn.wait();
      const contractAddress = contractReceipt.logs[0].address;
      const factory = await ethers.getContractFactory(
        "RockPaperScissorsInstance"
      );

      rockPaperScissorsInstance = new ethers.Contract(
        contractAddress,
        factory.interface,
        playerA
      ) as RockPaperScissorsInstance;

      await expect(contractTxn)
        .to.emit(rockPaperScissorsInstance, "GameInitialized")
        .withArgs(playerA.address, rpsToken.address, INITIAL_BET_AMOUNT);
    });
  });

  describe("Deposit Tests", () => {
    it("Should allow player A to deposit funds.", async () => {
      await expect(approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT))
        .to.emit(rockPaperScissorsInstance, "DepositCompleted")
        .withArgs(playerA.address, INITIAL_BET_AMOUNT);
    });

    it("Should not allow player to deposit funds twice.", async () => {
      await approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT);
      await expect(
        approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("You have already deposited.");
    });

    it("Should not allow player to deposit without token spend allowance.", async () => {
      await expect(
        rockPaperScissorsInstance
          .connect(playerA)
          .depositBet(INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("You don't have allowance");
    });

    it("Should not allow player to deposit incorrect token amount.", async () => {
      await expect(
        approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT * 2)
      ).to.be.revertedWith("You've submitted the incorrect bet amount.");
    });

    it("Should not allow a player to deposit when game is full.", async () => {
      await approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT);
      await approveTokenAndDepositBet(playerB, INITIAL_BET_AMOUNT);
      await expect(
        approveTokenAndDepositBet(contractCreator, INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("You are not allowed to deposit.");
    });

    it("Should allow both players to deposit funds.", async () => {
      await approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT);
      await approveTokenAndDepositBet(playerB, INITIAL_BET_AMOUNT);
      const playerAAddress = await rockPaperScissorsInstance.playerA();
      const playerBAddress = await rockPaperScissorsInstance.playerB();
      const playerADataMap = await rockPaperScissorsInstance.playerDataMap(
        playerA.address
      );
      const playerBDataMap = await rockPaperScissorsInstance.playerDataMap(
        playerB.address
      );

      expect([
        playerAAddress,
        playerBAddress,
        playerADataMap["deposited"],
        playerBDataMap["deposited"],
      ]).to.eql([playerA.address, playerB.address, true, true]);
    });

    it("Should emit DepositCompleted on successful deposit.", async () => {
      await expect(approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT))
        .to.emit(rockPaperScissorsInstance, "DepositCompleted")
        .withArgs(playerA.address, INITIAL_BET_AMOUNT);
    });

    it("Should start the game once both players have deposited.", async () => {
      await approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT);
      await expect(approveTokenAndDepositBet(playerB, INITIAL_BET_AMOUNT))
        .to.emit(rockPaperScissorsInstance, "GameStarted")
        .withArgs(playerA.address, playerB.address, INITIAL_BET_AMOUNT);
    });
  });

  describe("Submit/Reveal Move Tests", () => {
    beforeEach(async () => {
      await approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT);
      await approveTokenAndDepositBet(playerB, INITIAL_BET_AMOUNT);
    });

    it("Should allow the user to submit a move.", async () => {
      const { hashedMove } = await getHashedMove(0);
      await expect(
        rockPaperScissorsInstance.connect(playerA).submitMove(hashedMove)
      )
        .to.emit(rockPaperScissorsInstance, "MoveSubmitted")
        .withArgs(playerA.address, hashedMove);
    });

    it("Should not allow the user to change their move.", async () => {
      const { hashedMove: playerHashedMove } = await submitMove(playerA, 0);
      await expect(
        rockPaperScissorsInstance.connect(playerA).submitMove(playerHashedMove)
      ).to.be.revertedWith("You cannot change your move.");
    });

    it("Should allow both users to make their move.", async () => {
      const { hashedMove: playerAHashedMove } = await submitMove(playerA, 0);
      const { hashedMove: playerBHashedMove } = await submitMove(playerB, 1);
      const playerADataMap = await rockPaperScissorsInstance.playerDataMap(
        playerA.address
      );
      const playerBDataMap = await rockPaperScissorsInstance.playerDataMap(
        playerB.address
      );
      expect([playerAHashedMove, playerBHashedMove]).to.eql([
        playerADataMap["move"],
        playerBDataMap["move"],
      ]);
    });

    it("Should allow the user to reveal their move.", async () => {
      const hashedMove = ethers.utils.solidityKeccak256(["uint"], [0]);
      const { salt } = await submitMove(playerA, 0);
      await submitMove(playerB, 0);
      await expect(
        rockPaperScissorsInstance.connect(playerA).revealMove(0, salt)
      )
        .to.emit(rockPaperScissorsInstance, "MoveRevealed")
        .withArgs(playerA.address, hashedMove);
    });

    it("Should allow both users to reveal their moves.", async () => {
      const hashedMove = ethers.utils.solidityKeccak256(["uint"], [0]);
      const { salt: playerASalt } = await submitMove(playerA, 0);
      const { salt: playerBSalt } = await submitMove(playerB, 0);
      await rockPaperScissorsInstance
        .connect(playerA)
        .revealMove(0, playerASalt);
      await expect(
        rockPaperScissorsInstance.connect(playerB).revealMove(0, playerBSalt)
      )
        .to.emit(rockPaperScissorsInstance, "MoveRevealed")
        .withArgs(playerB.address, hashedMove);
    });

    it("Should not allow user to use wrong move when revealing.", async () => {
      await submitMove(playerA, 0);
      const { salt: playerBSalt } = await submitMove(playerB, 0);
      await expect(
        rockPaperScissorsInstance.connect(playerB).revealMove(1, playerBSalt)
      ).to.be.revertedWith(
        "It appears the move you entered isn't the same as before."
      );
    });

    it("Should not allow user to use wrong salt when revealing.", async () => {
      const { salt: playerASalt } = await submitMove(playerA, 0);
      await submitMove(playerB, 0);
      await expect(
        rockPaperScissorsInstance.connect(playerB).revealMove(0, playerASalt)
      ).to.be.revertedWith(
        "It appears the move you entered isn't the same as before."
      );
    });

    it("Should reset everyone's moves if one or more players submitted an incorrect move.", async () => {
      const { salt } = await submitMove(playerA, 3);
      await submitMove(playerB, 0);
      await expect(
        rockPaperScissorsInstance.connect(playerA).revealMove(3, salt)
      ).to.be.revertedWith("You must pick rock, paper or scissors.");
    });

    it("Should not allow non-player to submit a move.", async () => {
      const { hashedMove: playerHashedMove } = await getHashedMove(0);
      await expect(
        rockPaperScissorsInstance
          .connect(contractCreator)
          .submitMove(playerHashedMove)
      ).to.be.revertedWith("You are not a part of this game.");
    });
  });

  describe("Game Logic/Winner Tests", () => {
    beforeEach(async () => {
      await approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT);
      await approveTokenAndDepositBet(playerB, INITIAL_BET_AMOUNT);
    });

    it("Should be a tie if players use the same move", async () => {
      await submitMovesAndReveal(playerA, playerB, 0, 0);
      const winner = await rockPaperScissorsInstance.winner();
      const playerADataMap = await rockPaperScissorsInstance.playerDataMap(
        playerA.address
      );
      const playerBDataMap = await rockPaperScissorsInstance.playerDataMap(
        playerA.address
      );
      expect([winner, playerADataMap["move"], playerBDataMap["move"]]).to.eql([
        ethers.constants.AddressZero,
        ethers.constants.HashZero,
        ethers.constants.HashZero,
      ]);
    });

    it("Player A should win with a winning hand", async () => {
      await submitMovesAndReveal(playerA, playerB, 0, 2);
      const winner = await rockPaperScissorsInstance.winner();
      expect(winner).to.eql(playerA.address);
    });

    it("Player B should win with a winning hand", async () => {
      await submitMovesAndReveal(playerA, playerB, 0, 1);
      const winner = await rockPaperScissorsInstance.winner();
      expect(winner).to.eql(playerB.address);
    });
  });
  describe("Withdraw Edge Cases", () => {
    it("Player should be able to withdraw before game starts.", async () => {
      await approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT);
      await expect(rockPaperScissorsInstance.withdrawBeforeGameStarts())
        .to.emit(rockPaperScissorsInstance, "WithdrawFunds")
        .withArgs(
          playerA.address,
          INITIAL_BET_AMOUNT,
          WithdrawalReason.EarlyWithdrawal
        );
    });

    it("Player should not be able to withdraw before game starts if they haven't deposited.", async () => {
      await expect(
        rockPaperScissorsInstance.withdrawBeforeGameStarts()
      ).to.be.revertedWith("You haven't deposited yet.");
    });
  });
  describe("Withdraw Tests", () => {
    beforeEach(async () => {
      await approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT);
      await approveTokenAndDepositBet(playerB, INITIAL_BET_AMOUNT);
    });
    it("Player should not be able to withdraw before game starts if game has started.", async () => {
      await expect(
        rockPaperScissorsInstance.withdrawBeforeGameStarts()
      ).to.be.revertedWith("You can't withdraw once the game has started.");
    });

    it("Winner should be able to withdraw.", async () => {
      await submitMovesAndReveal(playerA, playerB, 0, 2);
      await expect(
        rockPaperScissorsInstance.connect(playerA).withdrawWinnings()
      )
        .to.emit(rockPaperScissorsInstance, "WithdrawFunds")
        .withArgs(
          playerA.address,
          INITIAL_BET_AMOUNT * 2,
          WithdrawalReason.WinningWithdrawal
        );
    });

    it("Loser should not be able to withdraw.", async () => {
      await submitMovesAndReveal(playerA, playerB, 2, 1);
      await expect(
        rockPaperScissorsInstance.connect(playerB).withdrawWinnings()
      ).to.be.revertedWith("You are not allowed to withdraw.");
    });

    it("Non-players should not be able to withdraw.", async () => {
      await submitMovesAndReveal(playerA, playerB, 1, 2);
      await expect(
        rockPaperScissorsInstance.connect(contractCreator).withdrawWinnings()
      ).to.be.revertedWith("You are not allowed to withdraw.");
    });

    it("Player should be able to incentivize uncooperative opponent.", async () => {
      await submitMove(playerA, 0);
      await rockPaperScissorsInstance.incentivizeUser();
      expect(
        await (await rockPaperScissorsInstance.incentiveStartTime()).toNumber()
      ).to.not.eql(0);
    });

    it("Player should not be able to incentivize if they haven't made a move.", async () => {
      await expect(
        rockPaperScissorsInstance.connect(playerA).incentivizeUser()
      ).to.be.revertedWith("You are not allowed to incentivize your opponent.");
    });

    it("Player should not be able to incentivize cooperative opponent.", async () => {
      await submitMove(playerA, 0);
      await submitMove(playerB, 1);
      await expect(
        rockPaperScissorsInstance.connect(playerA).incentivizeUser()
      ).to.be.revertedWith("You are not allowed to incentivize your opponent.");
    });

    it("Opponent can become cooperative.", async () => {
      await submitMove(playerA, 0);
      await rockPaperScissorsInstance.connect(playerA).incentivizeUser();
      await submitMove(playerB, 1);
      expect(
        await (await rockPaperScissorsInstance.incentiveStartTime()).toNumber()
      ).to.eql(0);
    });
  });

  describe("Rematch Tests", () => {
    beforeEach(async () => {
      await approveTokenAndDepositBet(playerA, INITIAL_BET_AMOUNT);
      await approveTokenAndDepositBet(playerB, INITIAL_BET_AMOUNT);
    });

    it("Winning player should be able to start a rematch with same amount.", async () => {
      await submitMovesAndReveal(playerA, playerB, 0, 2);
      await rockPaperScissorsInstance.connect(playerA).withdrawWinnings();
      await expect(
        rockPaperScissorsInstance
          .connect(playerA)
          .startRematch(INITIAL_BET_AMOUNT)
      )
        .to.emit(rockPaperScissorsInstance, "RematchRequested")
        .withArgs(playerA.address, INITIAL_BET_AMOUNT);
    });

    it("Losing player should be able to start a rematch with a different amount.", async () => {
      await submitMovesAndReveal(playerA, playerB, 0, 1);
      await rockPaperScissorsInstance.connect(playerB).withdrawWinnings();
      await expect(
        rockPaperScissorsInstance
          .connect(playerA)
          .startRematch(INITIAL_BET_AMOUNT * 2)
      )
        .to.emit(rockPaperScissorsInstance, "RematchRequested")
        .withArgs(playerA.address, INITIAL_BET_AMOUNT * 2);
    });

    it("Player should not be able to start a rematch if there are winnings.", async () => {
      await submitMovesAndReveal(playerA, playerB, 0, 2);
      await expect(
        rockPaperScissorsInstance
          .connect(playerA)
          .startRematch(INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("There are still funds to withdraw.");
    });

    it("Player should not be able to start a rematch if game hasn't finished.", async () => {
      await submitMove(playerA, 0);
      await expect(
        rockPaperScissorsInstance
          .connect(playerA)
          .startRematch(INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("The game hasn't finished yet.");
    });

    it("Winning player should be able to start a rematch with winnings.", async () => {
      await submitMovesAndReveal(playerA, playerB, 0, 2);
      await expect(
        rockPaperScissorsInstance.connect(playerA).startRematchWithWinnings()
      )
        .to.emit(rockPaperScissorsInstance, "RematchRequested")
        .withArgs(playerA.address, INITIAL_BET_AMOUNT * 2);
    });

    it("Losing player should not be able to start a rematch with winnings.", async () => {
      await submitMovesAndReveal(playerA, playerB, 0, 1);
      await expect(
        rockPaperScissorsInstance.connect(playerA).startRematchWithWinnings()
      ).to.be.revertedWith(
        "You must be the winner to start a rematch with the winnings."
      );
    });

    it("Game can be completed and funds withdrawn after rematch.", async () => {
      await submitMovesAndReveal(playerA, playerB, 0, 2);
    });
  });
});

// still have to test deposit rematch case (should allow deposits)
