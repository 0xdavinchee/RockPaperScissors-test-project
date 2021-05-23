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
      await rpsToken
        .connect(playerA)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await expect(
        rockPaperScissorsInstance
          .connect(playerA)
          .depositBet(INITIAL_BET_AMOUNT)
      )
        .to.emit(rockPaperScissorsInstance, "DepositCompleted")
        .withArgs(playerA.address, INITIAL_BET_AMOUNT);
    });

    it("Should not allow player to deposit funds twice.", async () => {
      await rpsToken
        .connect(playerA)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await rockPaperScissorsInstance
        .connect(playerA)
        .depositBet(INITIAL_BET_AMOUNT);

      await rpsToken
        .connect(playerA)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await expect(
        rockPaperScissorsInstance
          .connect(playerA)
          .depositBet(INITIAL_BET_AMOUNT)
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
      await rpsToken
        .connect(playerA)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT * 2);

      await expect(
        rockPaperScissorsInstance
          .connect(playerA)
          .depositBet(INITIAL_BET_AMOUNT * 2)
      ).to.be.revertedWith("You've submitted the incorrect bet amount.");
    });

    it("Should not allow a player to deposit when game is full.", async () => {
      await rpsToken
        .connect(playerA)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await rockPaperScissorsInstance
        .connect(playerA)
        .depositBet(INITIAL_BET_AMOUNT);

      await rpsToken
        .connect(playerB)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await rockPaperScissorsInstance
        .connect(playerB)
        .depositBet(INITIAL_BET_AMOUNT);

      await rpsToken
        .connect(contractCreator)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await expect(
        rockPaperScissorsInstance
          .connect(contractCreator)
          .depositBet(INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("You are not allowed to deposit.");
    });

    it("Should allow both players to deposit funds.", async () => {
      await rpsToken
        .connect(playerA)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await rockPaperScissorsInstance
        .connect(playerA)
        .depositBet(INITIAL_BET_AMOUNT);

      await rpsToken
        .connect(playerB)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await rockPaperScissorsInstance
        .connect(playerB)
        .depositBet(INITIAL_BET_AMOUNT);
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
      ]).to.be.eql([playerA.address, playerB.address, true, true]);
    });

    it("Should emit DepositCompleted on successful deposit.", async () => {
      await rpsToken
        .connect(playerA)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await expect(
        rockPaperScissorsInstance
          .connect(playerA)
          .depositBet(INITIAL_BET_AMOUNT)
      )
        .to.emit(rockPaperScissorsInstance, "DepositCompleted")
        .withArgs(playerA.address, INITIAL_BET_AMOUNT);
    });

    it("Should start the game once both players have deposited.", async () => {
      await rpsToken
        .connect(playerA)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await rockPaperScissorsInstance
        .connect(playerA)
        .depositBet(INITIAL_BET_AMOUNT);

      await rpsToken
        .connect(playerB)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await expect(
        rockPaperScissorsInstance
          .connect(playerB)
          .depositBet(INITIAL_BET_AMOUNT)
      )
        .to.emit(rockPaperScissorsInstance, "GameStarted")
        .withArgs(playerA.address, playerB.address, INITIAL_BET_AMOUNT);
    });
  });

  describe("Submit/Reveal Move Tests", () => {
    beforeEach(async () => {
      await rpsToken
        .connect(playerA)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await rockPaperScissorsInstance
        .connect(playerA)
        .depositBet(INITIAL_BET_AMOUNT);

      await rpsToken
        .connect(playerB)
        .approve(rockPaperScissorsInstance.address, INITIAL_BET_AMOUNT);
      await rockPaperScissorsInstance
        .connect(playerB)
        .depositBet(INITIAL_BET_AMOUNT);
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
      const { hashedMove } = await getHashedMove(0);
      await rockPaperScissorsInstance.connect(playerA).submitMove(hashedMove);
      await expect(
        rockPaperScissorsInstance.connect(playerA).submitMove(hashedMove)
      ).to.be.revertedWith("You cannot change your move.");
    });

    it("Should allow both users to make their move.", async () => {
      const { hashedMove: playerAHashedMove } = await getHashedMove(0);
      const { hashedMove: playerBHashedMove } = await getHashedMove(1);
      await rockPaperScissorsInstance
        .connect(playerA)
        .submitMove(playerAHashedMove);
      await rockPaperScissorsInstance
        .connect(playerB)
        .submitMove(playerBHashedMove);
      const playerADataMap = await rockPaperScissorsInstance.playerDataMap(
        playerA.address
      );
      const playerBDataMap = await rockPaperScissorsInstance.playerDataMap(
        playerB.address
      );
      expect([playerAHashedMove, playerBHashedMove]).to.be.eql([
        playerADataMap["move"],
        playerBDataMap["move"],
      ]);
    });

    it("Should allow the user to reveal their move.", async () => {
      const { hashedMove: playerAHashedMove, salt } = await getHashedMove(0);
      const hashedMove = ethers.utils.solidityKeccak256(["uint"], [0]);
      await rockPaperScissorsInstance
        .connect(playerA)
        .submitMove(playerAHashedMove);
      await rockPaperScissorsInstance
        .connect(playerB)
        .submitMove(playerAHashedMove);
      await expect(
        rockPaperScissorsInstance.connect(playerA).revealMove(0, salt)
      )
        .to.emit(rockPaperScissorsInstance, "MoveRevealed")
        .withArgs(playerA.address, hashedMove);
    });

    it("Should allow both users to reveal their moves.", async () => {
      const { hashedMove: playerAHashedMove, salt } = await getHashedMove(0);
      const hashedMove = ethers.utils.solidityKeccak256(["uint"], [0]);
      await rockPaperScissorsInstance
        .connect(playerA)
        .submitMove(playerAHashedMove);
      await rockPaperScissorsInstance
        .connect(playerB)
        .submitMove(playerAHashedMove);
      await rockPaperScissorsInstance.connect(playerA).revealMove(0, salt);
      await expect(
        rockPaperScissorsInstance.connect(playerB).revealMove(0, salt)
      )
        .withArgs(playerB.address, hashedMove);
    });
  });
});

// still have to test deposit rematch case (should allow deposits)
