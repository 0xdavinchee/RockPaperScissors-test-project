import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { contract } from "../utils/constants";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy(contract.RPSToken, {
    from: deployer,
    args: [10000],
    log: true,
  });
};

export default func;
func.tags = [contract.RPSToken];
