const express = require("express");
const validator = require("validator");
const Web3 = require("web3");
const ethUtil = require("ethereumjs-util");
const axios = require("axios");
const { createClient } = require("redis");
const erc721abi = require("../abi/IERC721.json");
const configs = require("../data/config.json");

const app = express();
const PORT = process.env.PORT || 3001;

const client = createClient("redis://redis:6379");
client.on("error", (err) => console.log("Redis Client Error", err));
client.connect();

app.use(express.json());

app.get("/:chain_id/:contractAddress/:tokenId", async (req, res) => {
  const { chain_id, contractAddress, tokenId } = req.params;

  // 验证chain_id是否为有效的整数
  if (!validator.isInt(chain_id)) {
    return res.status(400).json({ error: "Invalid chain_id" });
  }

  if (!configs[chain_id]) {
    return res.status(400).json({ error: "Invalid chain_id" });
  }

  const config = configs[chain_id];
  console.log(contractAddress);
  if (!isValidEthereumAddress(contractAddress)) {
    return res.status(400).json({ error: "Invalid contractAddress" });
  }

  if (!validator.isInt(tokenId)) {
    return res.status(400).json({ error: "Invalid tokenId" });
  }

  try {
    const web3 = new Web3(config["RPC_URL"]);
    const contract = new web3.eth.Contract(erc721abi, contractAddress);
    const tokenURI = await contract.methods.tokenURI(tokenId).call();

    let result = null;
    if (isJson(tokenURI)) {
      result = tokenURI;
    } else {
      const urldata = new URL(tokenURI);
      if (urldata.protocol == "ipfs:") {
        const options = {
          method: "GET",
          url: tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/"),
        };

        const data = await axios.request(options);
        result = data.data;
      } else if (urldata.protocol == "http:" || urldata.protocol == "https:") {
        const options = {
          method: "GET",
          url: tokenURI,
        };

        const data = await axios.request(options);
        result = data.data;
      }
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

function isValidEthereumAddress(address) {
  // 检查地址是否符合基本要求，如长度和前缀
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address)) {
    return false;
  }

  // 转换为校验和地址并进行比较，以确保地址符合EIP-55规范
  const checksumAddress = ethUtil.toChecksumAddress(address);
  return address === checksumAddress.toLowerCase();
}

function isJson(item) {
  let value = typeof item !== "string" ? JSON.stringify(item) : item;
  try {
    value = JSON.parse(value);
  } catch (e) {
    return false;
  }

  return typeof value === "object" && value !== null;
}
