require('dotenv').config();

const path        = require('path');
const express     = require('express');
const qrcode      = require('qrcode-generator');
const btoa        = require('btoa');
const fetch       = require('node-fetch');
const EventSource = require('eventsource');
const SLPSDK      = require('slp-sdk');
let SLP = new SLPSDK();
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
  const b64 = btoa(JSON.stringify(query));
  let sse = new EventSource(url+b64);
  sse.onmessage = (e) => fn(JSON.parse(e.data));
  return sse;
};

app.subscribe_bitsocket = (q, fn) =>
  app.subscribe_socket('https://bitsocket.fountainhead.cash/s/', q, fn);
app.subscribe_slpsocket = (q, fn) =>
  app.subscribe_socket('https://slpsocket.fountainhead.cash/s/', q, fn);


app.broadcast_tx = (tx, safe=true) => new Promise((resolve, reject) => {
    app.call_before('broadcast_tx', [tx]);

    const insight = new explorer.Insight(app.rpc);

    let tx_data = "";
    if (safe) {
        tx_data = tx.serialize();
    } else {
        tx_data = tx.toString();
    }
    insight.broadcast(tx_data, (err, txid) => {
        app.call_after('broadcast_tx', [tx]);

        if (err) {
            return reject(err);
        }

        resolve(txid);
    });
})


const incoming_watcher = app.subscribe_bitsocket({
  "v": 3,
  "q": {
    "find": {
      "out.e.a": process.env.cash_funding_address.split(':').pop()
    }
  }
}, (data) => {
  console.log(data);

  if (data.type != "mempool" || data.data.length === 0) {
    console.log('SKIPPING');
    return;
  }

  for (let o of data.data[0].in) {
    if (o.e.a === process.env.cash_funding_address.split(':').pop()) {
      console.log('SKIPPING SELF SEND');
      return;
    }
  }

  console.log('INCOMING');
  console.log(data);

  let amnt      = null;
  let recv_addr = null;

  for (let o of data.data[0].out) {
    if (o.e.a === process.env.cash_funding_address.split(':').pop()) {
      amnt = o.e.v;
    }
  }

  if (amnt === null) {
    console.error('ERROR: amnt not found');
    return;
  }

  for (let o of data.data[0].in) {
    recv_addr = o.e.a;
    break;
  }

  if (recv_addr === null) {
    console.error('ERROR: recv_addr not found');
    return;
  }

  const token_amount = amnt / process.env.send_rate;

  (async () => {
    console.log('SEND:', recv_addr, token_amount);

    const send = await SLP.TokenType1.send({
      fundingAddress:           process.env.cash_funding_address,
      fundingWif:               process.env.funding_wif,
      tokenReceiverAddress:     recv_addr,
      bchChangeReceiverAddress: process.env.cash_funding_address,
      tokenId:                  process.env.token_id,
      amount:                   token_amount,
    })
    console.log(send)
  })();

});


const web  = express();
const port = process.env.port;

web.set('views', path.join(__dirname, 'views'));
web.set('view engine', 'ejs');
web.use(express.static('public'));


web.get('/', (req, res) => {
  const type_number = 0;
  const error_correction_level = 'H';

  const qr = qrcode(type_number, error_correction_level);
  qr.addData(process.env.cash_funding_address);
  qr.make();

  res.render('index_page', {
    'cash_funding_address': process.env.cash_funding_address,
    'token_id':             process.env.token_id,
    'send_rate':            process.env.send_rate,
    'contact_email':        process.env.contact_email,
    'qr':                   qr.createImgTag(),
  });
})

web.listen(port, () => console.log(`app listening on port ${port}!`))
