import { expect } from "./chai-setup";
import {
  ethers,
  deployments,
  getNamedAccounts,
  getUnnamedAccounts,
} from "hardhat";

import { RockPaperScissorsCloneFactory, RpsToken } from "../typechain";
import { setupUser, setupUsers } from "./utils";
import { contract, INITIAL_BET_AMOUNT } from "../utils/constants";

const setup = async () => {
  await deployments.fixture([
    contract.RockPaperScissorsCloneFactory,
    contract.RPSToken,
  ]);
  const contracts = {
    RPSCloneFactory: (await ethers.getContract(
      contract.RockPaperScissorsCloneFactory
    )) as RockPaperScissorsCloneFactory,
    RPSToken: (await ethers.getContract(contract.RPSToken)) as RpsToken,
  };
  const { deployer } = await getNamedAccounts();
  const players = await getUnnamedAccounts();

  return {
    ...contracts,
    deployer: await setupUser(deployer, contracts),
    players: await setupUsers(players, contracts),
  };
};

describe("RPS Factory Contract Tests", async () => {
  describe("Deployment", async () => {
    it("Should have the correct contract creator", async () => {
      const { RPSCloneFactory } = await setup();
      const { deployer } = await getNamedAccounts();

      expect(await RPSCloneFactory.creator()).to.equal(deployer);
    });
  });

  describe("Initialize new proxies.", async () => {
    it("Should emit the correct variables for GameCreated.", async () => {
      const { players, RPSCloneFactory, RPSToken } = await setup();
      const contractTxn = RPSCloneFactory.createRockPaperScissorsInstance(
        players[0].address,
        RPSToken.address,
        INITIAL_BET_AMOUNT
      );
      const contractReceipt = await (await contractTxn).wait();
      const contractAddress = contractReceipt.logs[0].address;

      await expect(contractTxn)
        .to.emit(RPSCloneFactory, "GameCreated")
        .withArgs(
          players[0].address,
          contractAddress,
          RPSToken.address,
          INITIAL_BET_AMOUNT
        );
    });

    it("Should emit the correct variables for GameInitialized.", async () => {
      const { players, RPSCloneFactory, RPSToken } = await setup();
      const contractTxn = RPSCloneFactory.createRockPaperScissorsInstance(
        players[0].address,
        RPSToken.address,
        INITIAL_BET_AMOUNT
      );
      const contractReceipt = await (await contractTxn).wait();
      const contractAddress = contractReceipt.logs[0].address;
      const rpsInstance = await ethers.getContractAt(contract.RockPaperScissorsInstance, contractAddress);

      await expect(contractTxn)
        .to.emit(rpsInstance, "GameInitialized")
        .withArgs(
          players[0].address,
          RPSToken.address,
          INITIAL_BET_AMOUNT
        );
    });

    it("Should create multiple RPS games with same playerA.", async () => {
      const { players, RPSCloneFactory, RPSToken } = await setup();
      const rpsOne = RPSCloneFactory.createRockPaperScissorsInstance(
        players[0].address,
        RPSToken.address,
        INITIAL_BET_AMOUNT
      );
      const rpsOneReceipt = await (await rpsOne).wait();
      const rpsOneAddress = rpsOneReceipt.logs[0].address;

      const rpsTwo = RPSCloneFactory.createRockPaperScissorsInstance(
        players[0].address,
        RPSToken.address,
        INITIAL_BET_AMOUNT
      );
      const rpsTwoReceipt = await (await rpsTwo).wait();
      const rpsTwoAddress = rpsTwoReceipt.logs[0].address;

      expect(rpsOneAddress).to.not.be.eq(rpsTwoAddress);
    });

    it("Should create multiple RPSInstances from different callers.", async () => {
      const { players, RPSCloneFactory, RPSToken } = await setup();
      const rpsOne = RPSCloneFactory.createRockPaperScissorsInstance(
        players[0].address,
        RPSToken.address,
        INITIAL_BET_AMOUNT
      );
      const rpsOneReceipt = await (await rpsOne).wait();
      const rpsOneAddress = rpsOneReceipt.logs[0].address;

      const rpsTwo = players[1].RPSCloneFactory.createRockPaperScissorsInstance(
        players[0].address,
        RPSToken.address,
        INITIAL_BET_AMOUNT
      );
      const rpsTwoReceipt = await (await rpsTwo).wait();
      const rpsTwoAddress = rpsTwoReceipt.logs[0].address;

      expect(rpsOneAddress).to.not.be.eq(rpsTwoAddress);
    });

    it("Can create 0 betAmount RPSInstance.", async () => {
      const { players, RPSCloneFactory, RPSToken } = await setup();
      const rpsContract = await ethers.getContract(
        contract.RockPaperScissorsInstance
      );
      const rpsTxn = await RPSCloneFactory.createRockPaperScissorsInstance(
        players[0].address,
        RPSToken.address,
        0
      );
      const rpsOneReceipt = await (await rpsTxn).wait();
      const rpsOneAddress = rpsOneReceipt.logs[0].address;
      const rpsInstance = await ethers.getContractAt(
        contract.RockPaperScissorsInstance,
        rpsOneAddress
      );
      expect(await rpsInstance.betAmount()).to.be.eq(0);
    });
  });
});
