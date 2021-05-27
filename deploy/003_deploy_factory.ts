import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { contract } from "../utils/constants";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const RPSTemplate = await deployments.get(contract.RockPaperScissorsInstance);

  await deploy(contract.RockPaperScissorsCloneFactory, {
    from: deployer,
    args: [RPSTemplate.address],
  });
};

export default func;
func.dependencies = [contract.RockPaperScissorsInstance];
func.tags = [contract.RockPaperScissorsCloneFactory];
