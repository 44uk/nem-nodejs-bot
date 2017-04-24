nem-nodejs-bot: Node.js Bot for the NEM blockchain
==================================================

This is a multi feature Bot written in Node.js for the NEM blockchain. This bot can be deployed to Heroku free tiers
or serving locally.

Main features of this bot include listening to account transactions income or account data modifications and cosigning
multi signature accounts transactions. The NEMBot aims to be hidden such that Websites using the Bot to get Payment
Updates, never **directly** communicate with the Bot. This helps secure the Signing features but also gives more Privacy
to any company which wishes to use the NEMBot to Listen to Incoming Transaction (example of NEMPay).

Socket.io is used to Proxy the Communication between the NEMBot and your Node.js express app. This is to avoid addressing
your NEMBot over HTTP or Websocket **directly**(traceable in the Network Console). I decided to implement a Proxying mechanism
using Socket.io that will be placed between the Frontend and the Bot such that **even reading** is kept private.

The multisignature co-signing features will not be using any other Communication protocol than the Blockchain itself! This is
possible with the Multi Signature Account Push Notification System right in the NEM blockchain core. Communicating only through
the NEM Blockchain is a security feature that will help not disclose the NEMBot(s) used for co-signing.

The NEMBot also provides a HTTP/JSON API for which the endpoints will be listed in this document. The HTTP/JSON API should only
provide with a READ API such that the database of the NEMBot(s) can be read.

Dependencies
------------

This package uses the ```nem-sdk``` package and the ```nem-api``` package as a showcase for both libraries. ```nem-sdk```
can be used to perform any kind of HTTP request to the blockchain API, while ```nem-api``` supports both HTTP requests
and Websockets (which we will use).

This project will implement a mix of both libraries. First, the nem-api package is used to connect to the Blockchain using
Websockets and the nem-sdk library is used as a second layer of security whenever websockets process relevant data.

Installation
------------

The bot can be configured to execute any of the following features:
 - Payment Channel Listening (mode **read**)
 - Balance Modifications Listening  (mode **read**)
 - Cosignatory Auditing (mode **read**)
 - Multi Signature Transaction Co-Signing (mode **sign**)
 - Tip Bots (HTTP/JSON API) (mode **tip**)

Only WRITE features need your Private Key, change the "mode" config to "read" or "sign" or "tip" or "all" to enable/disable read and write.
You can also use an array for configuring the bot to use ["read", "tip"] features for example. The tipper bot features also need a Private Key.

For a local installation, first install the dependencies of this package. Using the terminal works as follows:
```
    $ cd /path/to/this/clone
    $ npm install
```

You should now take a look at ```config/bot.json``` and configure your Bot instance. Editing the **walletAddress** is obligatory.

After configuration, you can start the Bot, locally this would be:
```
    $ npm run_bot.js
```

Your bot is now running on localhost! The API is published on port 29081 by default.

The config/bot.json file will only be removed in "production" mode. The environment is defined by the **APP_ENV** environment variables and
default to **development**.

Deploy on Heroku
----------------

This NEM Bot is compatible with heroku free tiers. This means you can deploy the source code (AFTER MODIFICATION of config/bot.json)
to your Heroku instance and the Bot will run on the heroku tier. Before you deploy to the Heroku app, you must configure following
```Config Variables``` in your Heroku App (Settings) :
```
    - Required:
        - APP_ENV : Environment of your NEMBot. Can be either production or development.
        - ENCRYPT_PASS : Should contain the configuration file encryption password.
        - PORT : Should contain the Port on which the Bot HTTP/JSON API & Websockets will be addressed.

    - Optional :
        - NEM_HOST : Mainnet default NEM node. (http://alice6.nem.ninja)
        - NEM_PORT : Mainnet default NEM node port. (7890)
        - NEM_HOST_TEST : Testnet default NEM node. (http://bob.nem.ninja)
        - NEM_PORT_TEST : Testnet default NEM node port. (7890)
```

HTTP Basic Authentication
-------------------------

You can specify basic HTTP auth parameters in the **nem-bot.htpasswd** file. Default username is **demo** and default password
is **opendev**. To enable basic HTTP auth you must set the option "bot.protectedAPI" to ```true```, the Bot will then
read the nem-bot.htpasswd file for HTTP/JSON API endpoints. Of course **you should not commit when you update the .htpasswd file.**

In case you plan to use the protectedAPI option, make sure to update the **nem-bot.htpasswd** file with your new username/password combination,
and also to disable the default login credentials, like so:
```
    $ htpasswd -D nem-bot.htpasswd demo
    $ htpasswd nem-bot.htpasswd yourSecureUsername
```

Usage Examples
--------------

This example implements following Flow:

    - FRONTEND creates an invoice for someone to pay something
    - BACKEND opens a payment channel with NEMBot to observe incoming transactions
    - NEMBot informs the BACKEND of payment status updates (when there is some)
    - BACKEND informs the FRONTEND of the payment status updates (when there is some)

This can be understood as follows:

```
    jQuery > Node.js > NEMBot > NEM Blockchain > NEMBot > Node.js > jQuery
```

So lets define the details about this scenario. Your BACKEND will use socket.io to send events
to your FRONTEND and then the BACKEND also uses socket.io to communicate with the NEMBot.

```
// BACKEND:
// This comes in your Node.js backend (usually app.js)
// and will configure the BACKEND to FRONTEND Websocket communication
// ----------------------------------------------------

var io = require("socket.io").listen(expressServer);

var frontends_connected_ = {};
io.sockets.on('connection', function(socket)
{
    console.log("a frontend client has connected with socket ID: " + socket.id + "!");
    frontends_connected_[socket.id] = socket;

    socket.on('disconnect', function () {
        console.log('a frontend client has disconnected [' + socket.id + ']');
        if (frontends_connected_.hasOwnProperty(socket.id))
            delete frontends_connected_[socket.id];
    });
});

var startPaymentChannel = function(clientSocketId, callback)
    {
        var client = require("socket.io-client");

        // connect BACKEND to your NEMBot
        // => your BACKEND will be notified by your bot, not your FRONTEND!
        var invoiceSocket = client.connect("ws://localhost:29081");

        // open a new payment channel. The "message" option should contain your invoices
        // UNIQUE message.
        var channelParams = {
            message: "MY-INVOICE-123",
            sender: "TATKHV5JJTQXCUCXPXH2WPHLAYE73REUMGDOZKUW",
            recipient: "TCTIMURL5LPKNJYF3OB3ACQVAXO3GK5IU2BJMPSU"
        };
        invoiceSocket.emit("nembot_open_payment_channel", JSON.stringify(channelParams));

        // register FORWARDING to FRONTEND
        // => notify the FRONTEND from your BACKEND, only the frontend => backend communication is disclosed.
        invoiceSocket.on("nembot_payment_status_update", function(rawdata)
            {
                var data = JSON.parse(rawdata);

                // forward to client.. "clientSocketId" is important here.
                io.sockets.to(clientSocketId)
                  .emit("myapp_payment_status_update", JSON.stringify({"status": data.status, "realData": rawdata}));
            });

        callback(invoiceSocket);
    };

// example is GET /create-invoice?client=XXX_sfwe2
expressApp.get("/create-invoice", function(req, res)
{
    var clientSocketId = req.query.client ? req.query.client : null;
    if (! clientSocketId || ! clientSocketId.length)
        res.send(JSON.stringify({"status": "error", "message": "Mandatory field `Client Socket ID` is invalid."}));

    // do your DB work ..

    // now start a payment channel with the bot.
    startPaymentChannel(clientSocketId, function(invoiceSocket)
        {
            // payment channel is now open, we can end the create-invoice response.
            res.send({"status": "ok"}, 200);
        });
});
```

```
// FRONTEND:
// this comes in your jQuery (or any other) Frontend HTML Templates
// and will print to the console everytime a payment status update
// is received from your backend. The Frontend nevers communicates
// with the NEMBot directly.
// ----------------------------------------------------------------

<script src="/socket.io/socket.io.js"></script>
<script type="text/javascript">
    // connect to our BACKEND using socket.io
    var frontendSocket = io.connect(window.location.protocol + '//' + window.location.host);

    frontendSocket.on("myapp_payment_status_update", function(rawdata)
    {
        // this will display in the Javascript Console of your Browser! (only for this frontendSocket!)
        console.log("received myapp_payment_status_update with: " + rawdata);
    });
</script>
```

Pot de vin
----------

If you like the initiative, and for the sake of good mood, I recommend you take a few minutes to Donate a beer or Three [because belgians like that] by sending some XEM (or whatever Mosaic you think pays me a few beers someday!) to my Wallet:
```
    NB72EM6TTSX72O47T3GQFL345AB5WYKIDODKPPYW
```

License
-------

This software is released under the [MIT](LICENSE) License.

© 2017 Grégory Saive greg@evias.be, All rights reserved.
