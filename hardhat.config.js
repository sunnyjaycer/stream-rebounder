require("dotenv").config();

require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-ethers");
require("hardhat-gas-reporter");
require("solidity-coverage");
// require( "hardhat-preprocessor");
// const fs = require("fs");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

function getRemappings() {
  return fs
    .readFileSync("remappings.txt", "utf8")
    .split("\n")
    .filter(Boolean) // remove empty lines
    .map((line) => line.trim().split("="));
}

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.14",
  networks: {
    goerli: {
      url: process.env.GOERLI_URL || "",
      // accounts:
      //   process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
        accounts: {
          mnemonic: process.env.MNEMONIC || "",
          initialIndex: 0,
          count: 100
        }
    },
    polygon: {
      url: process.env.POLYGON_URL || "",
      // accounts:
      //   process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
        accounts: {
          mnemonic: process.env.MNEMONIC || "",
          initialIndex: 0,
          count: 100
        }
    },
    optimism: {
      url: process.env.OPTIMISM_URL || "",
      // accounts:
      //   process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
        accounts: {
          mnemonic: process.env.MNEMONIC || "",
          initialIndex: 0,
          count: 100
        }
    },
  },
  mocha: {
    timeout: 50000000000
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  preprocess: {
    eachLine: (hre) => ({
      transform: (line) => {
        if (line.match(/^\s*import /i)) {
          for (const [from, to] of getRemappings()) {
            if (line.includes(from)) {
              line = line.replace(from, to);
              break;
            }
          }
        }
        return line;
      },
    }),
  },
  paths: {
    sources: "./contracts",
    cache: "./cache_hardhat",
    // contracts: "./contracts"
    // artifacts: "./artifacts"
  },

};
