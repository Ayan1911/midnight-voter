const fs = require('fs');
const config = JSON.parse(fs.readFileSync('./src/config/contract-config.json', 'utf8'));
const address = config.contractAddress;
console.log(`Config Address: ${address}`);

const query = `
query {
  contractStates(filter: { contractAddress: { equalTo: "${address}" } }) {
    nodes {
      contractAddress
    }
  }
}
`;
fetch("https://indexer.preview.midnight.network/api/v1/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query })
}).then(r => r.json()).then(res => {
  console.log("Indexer Response:");
  console.log(JSON.stringify(res, null, 2));
}).catch(console.error);
