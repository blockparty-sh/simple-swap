let app = {};

app.query = (url, query) => new Promise((resolve, reject) => {
  if (! url || ! query) {
    return resolve(false);
  }

  url += btoa(JSON.stringify(query));
  console.log(url)

  resolve(
    fetch(url)
    .then((r) => r.json())
  );
});

app.query_bitdb = (q) => app.query("https://bitdb.fountainhead.cash/q/", q);
app.query_slpdb = (q) => app.query("https://slpdb.fountainhead.cash/q/", q);


app.subscribe_socket = (url, query, fn) => {
  let sse = new EventSource(url+b64);
  sse.onmessage = (e) => fn(e.data);
  return sse;
};

app.subscribe_bitsocket = (q, fn) =>
  app.subscribe_socket('https://bitsocket.fountainhead.cash/s/', q, fn);
app.subscribe_slpsocket = (q, fn) =>
  app.subscribe_socket('https://slpsocket.fountainhead.cash/s/', q, fn);

app.query_get_token_details = (token_id) => ({
  "v": 3,
  "q": {
    "db": ["t"],
    "find": {
      "tokenDetails.tokenIdHex": token_id
    },
    "limit": 10
  }
});

app.query_get_bitdb_swap_history = (cash_funding_address) => ({
  "v": 3,
  "q": {
    "find": {
      "out.e.a": cash_funding_address.split(':').pop(),
      "in.e.a": {
        "$ne": cash_funding_address.split(':').pop(),
      }
    },
    "limit": 1000
  },
  "r": {
    "f": "[ .[] | { txid: .tx.h, amount: .out[] | select((.e.a == \""+cash_funding_address.split(':').pop()+"\")) | .e.v, address: .out[] | select((.e.a != \""+cash_funding_address.split(':').pop()+"\")) | select(.e.a != null) | .e.a, timestamp: .blk.t } ]"
  }
});

app.query_get_slpdb_swap_history = (cash_funding_address, out_addresses) => ({
  "v": 3,
  "q": {
    "db": ["u", "c"],
    "find": {
      "in.e.a": cash_funding_address.split(':').pop(),
      "out.e.a": {
        "$in": out_addresses.map(v => v.split(':').pop())
      }
    },
    "limit": 1000
  },
  "r": {
    "f": "[ .[] | { txid: .tx.h, amount: .slp.detail.outputs[] | select((.address != \""+slpjs.Utils.toSlpAddress(cash_funding_address)+"\")) | .amount, address: .slp.detail.outputs[] | select((.address != \""+slpjs.Utils.toSlpAddress(cash_funding_address)+"\")) | .address, timestamp: .blk.t } ]"
  }
});


app.query_slpdb(app.query_get_token_details($('html').data('token_id')))
.then((token) => {
  token = token.t[0];
  console.log(token);

  $('#token_id a')
    .attr('href', 'https://simpleledger.info/#token/' + token.tokenDetails.tokenIdHex)
    .text(token.tokenDetails.tokenIdHex);

  $('#token_name').text(token.tokenDetails.name);
  $('#token_symbol').text(token.tokenDetails.symbol);
  $('#token_timestamp').text(token.tokenDetails.timestamp);
  $('#token_quantity').text(token.tokenDetails.genesisOrMintQuantity);
  $('#token_decimals').text(token.tokenDetails.decimals);
  $('#token_document_uri a')
      .attr('href', token.tokenDetails.documentUri)
      .text(token.tokenDetails.documentUri);
  $('#token_document_checksum').text(token.tokenDetails.documentSha256Hex);
});


app.query_bitdb(app.query_get_bitdb_swap_history($('html').data('cash_funding_address')))
.then((bitdb_history) => {
  bitdb_history = bitdb_history.u.concat(bitdb_history.c);
  console.log('swap bitdb_history');
  console.log(bitdb_history);

  app.query_slpdb(app.query_get_slpdb_swap_history($('html').data('cash_funding_address'), bitdb_history.map(v => v.address)))
  .then((slpdb_history) => {
    console.log(slpdb_history);
    slpdb_history = slpdb_history.u.concat(slpdb_history.c);

    let history = [];

    for (let o of bitdb_history) {
      o.type = 'BCH';
      history.push(o);
    }
    for (let o of slpdb_history) {
      o.type = 'SLP';
      history.push(o);
    }

    history = history.sort((a, b) => b.timestamp - a.timestamp);
    for (let o of history) {
      $('#swap-history-table tbody').append(`
        <tr>
          <td>${(new Date(o.timestamp * 1000)).toLocaleString()}</td>
          <td>${o.type}</td>
          <td><a href="https://simpleledger.info/#tx/${o.txid}">${o.txid}</a></td>
          <td>${o.amount}</td>
          <td><a href="https://simpleledger.info/#address/${o.address}">${o.address}</a></td>
        </tr>
      `);
    }
  });
});
