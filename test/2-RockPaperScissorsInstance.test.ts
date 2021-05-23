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

  before(async () => {
    [contractCreator, playerA, playerB] = await ethers.getSigners();
    rpsTokenFactory = (await ethers.getContractFactory(
      "RPSToken",
      contractCreator
    )) as RpsTokenFactory;
    rpsToken = await rpsTokenFactory.deploy(1000);
    await rpsToken.deployed();
    await rpsToken.connect(contractCreator).transfer(playerA.address, 100);
    await rpsToken.connect(contractCreator).transfer(playerB.address, 100);

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

  describe("Enroll Tests", () => {
    it("Should allow another player to enroll in game", async () => {
      await rpsToken
        .connect(playerB)
        .approve(rockPaperScissorsInstance.address, 10);
      await expect(
        rockPaperScissorsInstance
          .connect(playerB)
          .enrollInGame(INITIAL_BET_AMOUNT)
      )
        .to.emit(rockPaperScissorsInstance, "PlayerEnrolled")
        .withArgs(playerB.address);
    });

    it("Shouldn't allow the same player to enroll in game", async () => {
      await rpsToken
        .connect(playerA)
        .approve(rockPaperScissorsInstance.address, 10);
      await expect(
        rockPaperScissorsInstance
          .connect(playerA)
          .enrollInGame(INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("You are already a part of this game.");
    });

    it("Shouldn't allow a player to enroll in a full game", async () => {
      await rpsToken
        .connect(playerB)
        .approve(rockPaperScissorsInstance.address, 10);

      await rockPaperScissorsInstance
        .connect(playerB)
        .enrollInGame(INITIAL_BET_AMOUNT);
      await expect(
        rockPaperScissorsInstance
          .connect(contractCreator)
          .enrollInGame(INITIAL_BET_AMOUNT)
      ).to.be.revertedWith("This game is full.");
    });
  });
});
