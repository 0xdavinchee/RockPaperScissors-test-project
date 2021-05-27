import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "./chai-setup";

import {
  RockPaperScissorsCloneFactory,
  RockPaperScissorsCloneFactoryFactory,
  RockPaperScissorsInstanceFactory,
  RockPaperScissorsInstance,
  RpsTokenFactory,
  RpsToken,
} from "../typechain";

describe("RockPaperScissorsCloneFactory Happy Path", function () {
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

  it("Should reference the correct template.", async () => {
    expect(
      await rockPaperScissorsCloneFactory.getImplementationAddress()
    ).to.be.eq(rockPaperScissorsTemplate.address);
  });

  it("RPSInstance playerA should be correct.", async () => {
    expect(await rockPaperScissorsInstance.playerA()).to.be.eq(playerA.address);
  });

  it("RPSInstance betAmount should be correct.", async () => {
    expect(await rockPaperScissorsInstance.betAmount()).to.be.eq(
      INITIAL_BET_AMOUNT
    );
  });

  it("Should emit the correct variables.", async () => {
    const contractTxn =
      await rockPaperScissorsCloneFactory.createRockPaperScissorsInstance(
        playerA.address,
        rpsToken.address,
        INITIAL_BET_AMOUNT
      );
    const contractReceipt = await contractTxn.wait();
    const contractAddress = contractReceipt.logs[0].address;

    await expect(contractTxn)
      .to.emit(rockPaperScissorsCloneFactory, "GameCreated")
      .withArgs(
        playerA.address,
        contractAddress,
        rpsToken.address,
        INITIAL_BET_AMOUNT
      );
  });

  it("Can create multiple RPSInstances from same caller.", async () => {
    const initialInstanceAddress = rockPaperScissorsInstance.address;
    const secondInstanceAddress = await createAndSetRPSInstance(
      playerA,
      INITIAL_BET_AMOUNT
    );
    expect(initialInstanceAddress).to.not.be.eq(secondInstanceAddress);
  });

  it("Can create multiple RPSInstances from different callers.", async () => {
    const initialInstanceAddress = rockPaperScissorsInstance.address;
    const secondInstanceAddress = await createAndSetRPSInstance(
      playerB,
      INITIAL_BET_AMOUNT
    );
    expect(initialInstanceAddress).to.not.be.eq(secondInstanceAddress);
  });

  it("Can create 0 betAmount RPSInstance.", async () => {
    await createAndSetRPSInstance(playerA, 0);
    expect(await rockPaperScissorsInstance.betAmount()).to.be.eq(0);
  });
});
