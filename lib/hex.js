var events = require('events');
var util = require('util');
var fs = require('fs');
var SmartBuffer = require('smart-buffer');
var lineByLine = require('n-readlines');

function Hex(fileName) {
    events.EventEmitter.call(this);
    this.liner = new lineByLine(fileName);
    this.blocks = [];
    this.parse();
};

util.inherits(Hex, events.EventEmitter);

Hex.prototype.parse = function() {

    const DATA = 0;
    const END_OF_FILE = 1;
    const EXT_SEGMENT_ADDR = 2;
    const START_SEGMENT_ADDR = 3;
    const EXT_LINEAR_ADDR = 4;
    const START_LINEAR_ADDR = 5;

    var line;
    var highAddress = 0x0;

    while (line = this.liner.next()) {
        var sb = new SmartBuffer(line);
        var prefix = sb.readString(1); // 前缀 ":"
        var dataLength = parseInt(sb.readString(2), 16); // 本行数据长度
        var address = parseInt(sb.readString(4), 16); // 本行数据的起始地址
        var dataType = parseInt(sb.readString(2), 16); // 数据类型

        var data;
        if (dataLength !== 0) {
            data = new Buffer(sb.readString(dataLength * 2), 'hex'); // 数据
        }

        var checksum = parseInt(sb.readString(2), 16); // 校验码

        // console.log("dataLength: ", dataLength);
        // console.log("address: 0x%x".format(address));
        // console.log("dataType: ", dataType);
        // console.log("data: ", data);
        // console.log("checksum: ", checksum);

        switch (dataType) {
            case DATA: // 0
                var block = {
                    address: highAddress + address,
                    data: data
                };
                this.blocks.push(block);
                break;
            case END_OF_FILE: // 1
            case EXT_SEGMENT_ADDR: // 2
            case START_SEGMENT_ADDR: // 3
                break;
            case EXT_LINEAR_ADDR: // 4
                highAddress = data.readUInt16BE(0) << 16;
                break;
            case START_LINEAR_ADDR:
                break;
            default:
                throw new Error("Invalid record type (" + dataType + ")");
                break;
        }
    }

    // var newBlocks = [];
    // var size = this.blocks.length;

    // // for (var i = 0; i < size; i++) {
    // //     var address = this.blocks[i].address;
    // //     var data = this.blocks[i].data;
    // //     console.log('[0x%x]'.format(address), data);
    // // }

    // this.blocks.push({address: 0xdeadbeef, data: new Buffer(0)});
    // this.blocks.push({address: 0xdeadbeef, data: new Buffer(0)});
    // this.blocks.push({address: 0xdeadbeef, data: new Buffer(0)});

    // for (var i = 0; i < size; i += 4) {
    //     var block = {
    //         address: this.blocks[i].address,
    //         data: null
    //     };
    //     var data0 = this.blocks[i + 0].data;
    //     var data1 = this.blocks[i + 1].data;
    //     var data2 = this.blocks[i + 2].data;
    //     var data3 = this.blocks[i + 3].data;
    //     block.data = Buffer.concat([data0, data1, data2, data3]);
    //     newBlocks.push(block);
    // }

    // this.blocks = newBlocks;

    // // for (var i = 0; i < this.blocks.length; i++) {
    // //     var address = this.blocks[i].address;
    // //     var data = this.blocks[i].data;
    // //     console.log('[0x%x]'.format(address), data);
    // // }
}

module.exports = {
    parse: function(fileName) {
        return new Hex(fileName);
    }
}
