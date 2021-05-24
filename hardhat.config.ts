import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
import "solidity-coverage";
import "hardhat-prettier";

const config: HardhatUserConfig = {
  solidity: "0.7.3",
};

export default config;