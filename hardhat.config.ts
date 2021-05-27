import { HardhatUserConfig } from "hardhat/config";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "hardhat-typechain";
import "solidity-coverage";
import "hardhat-prettier";

const config: HardhatUserConfig = {
  solidity: "0.8.0",
  namedAccounts: {
    deployer: 0,
  },
};

export default config;
