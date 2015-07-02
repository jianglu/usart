var fs = require('fs');
var SmartBuffer = require('smart-buffer');

module.exports = {
    parse: function(fileName) {
    	var fileBuffer = new SmartBuffer(fs.readFileSync(fileName));
        var address = 0x08000000;
        var blockSize = 0x80;
        blocks = [];
        while (true) {
            var lineBuffer = fileBuffer.readBuffer(blockSize);
            if (lineBuffer.length === 0) break;
            blocks.push({
                address: address,
                data: lineBuffer
            })
            address += blockSize;
        }
        return {
        	blocks: blocks
        };
    }
}
