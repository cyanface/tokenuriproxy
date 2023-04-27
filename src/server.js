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

const client = createClient({ url: "redis://" + process.env.REDIS_HOST });
client.on("error", (err) => console.log("Redis Client Error", err));

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
  if (!isValidEthereumAddress(contractAddress)) {
    return res.status(400).json({ error: "Invalid contractAddress" });
  }

  if (!validator.isInt(tokenId)) {
    return res.status(400).json({ error: "Invalid tokenId" });
  }

  try {
    console.log(chain_id, contractAddress, tokenId, "start");
    const web3 = new Web3(config["RPC_URL"]);

    let result = null;

    const rediskey = web3.utils.keccak256(chain_id + contractAddress + tokenId);
    //result = await client.get(rediskey);
    if (!result) {
      console.log("cache miss");
      const contract = new web3.eth.Contract(erc721abi, contractAddress);
      let tokenURI = await contract.methods.tokenURI(tokenId).call();

      if (tokenURI.substring(0, 28) == "data:application/json;base64") {
        const data = tokenURI.substring(29);
        let buff = Buffer.from(data, "base64");
        tokenURI = JSON.parse(buff.toString("ascii"));
      }

      if (isJson(tokenURI)) {
        result = tokenURI;
        console.log("dynamic nft");
      } else {
        const urldata = new URL(tokenURI);
        if (urldata.protocol == "ipfs:") {
          const options = {
            method: "GET",
            url: tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/"),
          };

          const data = await axios.request(options);
          result = data.data;
          console.log("ipfs", tokenURI);
        } else if (urldata.protocol == "http:" || urldata.protocol == "https:") {
          const options = {
            method: "GET",
            url: tokenURI,
          };

          const data = await axios.request(options);
          result = data.data;
          console.log("http", tokenURI);
        }
      }

      await client.set(rediskey, JSON.stringify(result), { EX: 3600 });
      console.log("set cache");
    } else {
      console.log("cache hit");
      result = JSON.parse(result);
    }

    res.status(200).json(result);
    console.log("done");
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

client.connect().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
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
