import { ethers } from "hardhat";

import {
  RockPaperScissorsCloneFactoryFactory,
  RockPaperScissorsInstanceFactory,
  RpsTokenFactory,
} from "../typechain";

async function main() {
  const [contractCreator] = await ethers.getSigners();

  // Deploy Token Contract
  let rpsTokenFactory = (await ethers.getContractFactory(
    "RPSToken",
    contractCreator
  )) as RpsTokenFactory;
  let rpsToken = await rpsTokenFactory.deploy(10000);
  await rpsToken.deployed();
  
  // Deploy RPSInstanceTemplate (will be used by clones)
  let rpsInstanceFactory = (await ethers.getContractFactory(
    "RockPaperScissorsInstance",
    contractCreator
  )) as RockPaperScissorsInstanceFactory;
  let rpsTemplate = await rpsInstanceFactory.deploy();
  await rpsTemplate.deployed();

  // Deploy RPSCloneFactory using the deployed RPSInstanceTemplate
  let rpsCloneFactoryFactory = (await ethers.getContractFactory(
    "RockPaperScissorsCloneFactory",
    contractCreator
  )) as RockPaperScissorsCloneFactoryFactory;
  let rpsCloneFactory = await rpsCloneFactoryFactory.deploy(rpsTemplate.address);
  await rpsCloneFactory.deployed();
}
  

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
