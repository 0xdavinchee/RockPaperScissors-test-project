import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
import "solidity-coverage";
import "hardhat-prettier";

const config: HardhatUserConfig = {
  solidity: "0.8.0",
};

export default config;