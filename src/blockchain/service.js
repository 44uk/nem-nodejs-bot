/**
 * Part of the evias/nem-nodejs-bot package.
 *
 * NOTICE OF LICENSE
 *
 * Licensed under MIT License.
 *
 * This source file is subject to the MIT License that is
 * bundled with this package in the LICENSE file.
 *
 * @package    evias/nem-nodejs-bot
 * @author     Grégory Saive <greg@evias.be> (https://github.com/evias)
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       https://github.com/evias/nem-nodejs-bot
 */

(function() {

var nemSDK = require("nem-sdk").default,
    nemAPI = require("nem-api"),
    PaymentChannel = require("./payment-channel.js").PaymentChannel;

/**
 * class service provide a business layer for
 * blockchain data queries used in the NEM bot.
 *
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var service = function(config, logger)
{
    // initialize the current running bot's blockchain service with
    // the NEM blockchain. This will create the endpoint for the given
    // network and port (testnet, mainnet, mijin) and will then initialize
    // a common object using the configured private key.
    var nem_  = nemSDK;
    var api_  = nemAPI;
    var conf_ = config;
    var logger_ = logger;

    var isTestMode = config.nem.isTestMode;
    var envSuffix  = isTestMode ? "_TEST" : "";
    var confSuffix = isTestMode ? "_test" : "";

    // connect to the blockchain with the NEM SDK
    var nemHost = process.env["NEM_HOST" + envSuffix] || conf_.nem["nodes" + confSuffix][0].host;
    var nemPort = process.env["NEM_PORT" + envSuffix] || conf_.nem["nodes" + confSuffix][0].port;
    var node_   = nem_.model.objects.create("endpoint")(nemHost, nemPort);

    // following is our bot's XEM wallet address
    var botWallet_ = (process.env["BOT_WALLET"] || conf_.bot.walletAddress).replace(/-/g, "");

    // define a helper for development debug of websocket
    this.socketLog = function(msg, type)
    {
        var logMsg = "[" + type + "] " + msg;
        logger_.info("src/blockchain/service.js", __line, logMsg);
    };

    // define a helper for ERROR of websocket
    this.socketError = function(msg, type)
    {
        var logMsg = "[" + type + "] " + msg;
        logger_.error("src/blockchain/service.js", __line, logMsg);
    };

    this.nem = function()
    {
        return nem_;
    };

    this.logger = function()
    {
        return logger_;
    };

    /**
     * Get this bot's Wallet Address
     *
     * @return string   XEM account address for the Bot
     */
    this.getBotWallet = function()
    {
        return botWallet_;
    };

    /**
     * Get the Network details. This will return the currently
     * used config for the NEM node (endpoint).
     *
     * @return Object
     */
    this.getNetwork = function()
    {
        var isTest  = conf_.nem.isTestMode;
        var isMijin = conf_.nem.isMijin;

        return {
            "host": node_.host,
            "port": node_.port,
            "label": isTest ? "Testnet" : isMijin ? "Mijin" : "Mainnet",
            "config": isTest ? nem_.model.network.data.testnet : isMijin ? nem_.model.network.data.mijin : nem_.model.network.data.mainnet,
            "isTest": isTest,
            "isMijin": isMijin
        };
    };

    this.openPaymentChannel = function(backendSocket, options, channelData)
    {
        var self = this;

        var backend_   = backendSocket;
        var websocket_ = new api_(nemHost + ":" + nemPort);
        var options_   = channelData || options;
        var invoiceNumber_ = channelData.message || options.message || "";
        var invoiceSender_  = channelData.sender ||  options.sender;
        var invoiceRecipient_ = channelData.recipient || options.recipient || self.getBotWallet();

        // open new payment channel
        var paymentChannel = new PaymentChannel(self, backendSocket, channelData);

        // define helper for websocket error handling
        var websocketErrorHandler = function(error)
        {
            var regexp_LostConn = new RegExp(/Lost connection to/);
            if (regexp_LostConn.test(error)) {
                // need to reconnect
                self.socketLog("Connection lost, re-connecting..", "DROP");
                self.openPaymentChannel(backend_, options_, channelData);
                return false;
            }

            // uncaught error happened
            self.socketError("Websocket Uncaught Error: " + error, "UNCAUGHT");
        };

        websocket_.connectWS(function()
            {
                // on connection we subscribe to the needed NEM blockchain websocket channels.

                websocket_.subscribeWS("/errors", function(message) {
                    self.socketError(message.body, "ERROR");
                });

                websocket_.subscribeWS("/unconfirmed/" + self.getBotWallet(), function(message) {

                    var transactionData = JSON.parse(message.body);
                    var transaction     = transactionData.transaction;

                    if (! transaction || transaction.recipient != self.getBotWallet())
                        return false;

                    var paymentData = {};
                    if (false === (paymentData = paymentChannel.extractPaymentData(transaction, "amountUnconfirmed")))
                        return false;

                    paymentChannel.sendPaymentStatusUpdate(paymentData, "unconfirmed");
                });

                websocket_.subscribeWS("/transactions/" + self.getBotWallet(), function(message) {
                    var transactionData = JSON.parse(message.body);
                    var transaction     = transactionData.transaction;

                    if (! transaction || transaction.recipient != self.getBotWallet())
                        return false;

                    var paymentData = {};
                    if (false === (paymentData = paymentChannel.extractPaymentData(transaction, "amountPaid")))
                        return false;

                    paymentChannel.sendPaymentStatusUpdate(paymentData, "confirmed");

                    if (paymentChannel.isPaid())
                        paymentChannel.finish();
                });

            }, websocketErrorHandler);

        return paymentChannel;
    };

    var self = this;
    {
        // nothing more done on instanciation
    }
};


module.exports.service = service;
}());