import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const template = await deployments.get("RPSTemplate");

  await deploy("RockPaperScissorsCloneFactory", {
    from: deployer,
    args: [template.address],
  });
};

export default func;
func.tags = ["RPSCloneFactory"];
func.dependencies = ["RPSTemplate"];