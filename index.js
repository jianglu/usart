#! /usr/bin/env node

require('string-format-js');

var cli = require('cli');
var async = require('async');
var SmartBuffer = require('smart-buffer');
var pipeline = require('when/pipeline');
var usart = require('./lib/usart');
var hex = require('./lib/hex');
var when = require('when');
var ProgressBar = require('progress');

cli.option_width = 30;

cli.parse({
    dev:       ['d',    'Set serial port device', 'string', '/dev/ttyUSB0'],
    // file:      ['f',    'Set file to load', 'string'],
    baudrate:  ['b',    'Set baud rate', 'number', 230400],
    verify:    ['v',    'Verify the data'],
});


cli.main(function (args, options) {

    if (args.length <= 0) {
        console.error('The file must be specified')
        return;
    }

    var devPath = options.dev || '/dev/ttyUSB0';
    var baudrate = options.baudrate || 230400;

    var hexObj = hex.parse(args[0]);

    var bar = new ProgressBar(':bar :percent', {
        width: 40,
        total: hexObj.blocks.length
    });

    usart.open(devPath, baudrate).then(function(device) {
        console.log('START UPLOADING ...');

        function unspool(seed) {
            return [seed, seed + 1];
        }

        function predicate(index) {
            return index >= hexObj.blocks.length;
        }

        function writeBlock(value) {
            return when.promise(function(resolve, reject, notify) {
                var block = hexObj.blocks[value];
                var address = block.address;
                var data = block.data;
                device.writeMemory(address, data).then(function() {
                    device.readMemory(address, data.length).then(function(data) {
                        bar.tick();
                        resolve();
                    });
                });
            });
        }

        function go() {
            var address = hexObj.blocks[0].address;
            device.go(address).then(function() {
                console.log('UPLOAD COMPLETED, RTS PULL DOWN');
                device.close();
            });
        }

        device.globalErase().then(function() {
            when.unfold(unspool, predicate, writeBlock, 0).then(go).done();
        });
    });
});

