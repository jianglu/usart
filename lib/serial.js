var SerialPort = require('serialport').SerialPort;
var events = require('events');
var util = require('util');

function Serial(path, options) {
    events.EventEmitter.call(this);
    this.currentBuffer = null;
    this.readCallback = null;
    this.readSize = 0;
    this.timeoutHandler = null;

    this.stream = new SerialPort(path, options);
    this.stream.pause();

    this.openHandler = this.onOpen.bind(this);
    this.dataHandler = this.onData.bind(this);
    this.closeHandler = this.onClose.bind(this);

    this.stream.on('open', this.openHandler);
    this.stream.on('data', this.dataHandler);
    this.stream.on('close', this.closeHandler);
};

util.inherits(Serial, events.EventEmitter);

Serial.prototype.set = function(options, callback) {
    this.stream.set(options, callback);
}

Serial.prototype.write = function(data, callback) {
    var afterDrain = function(err, results) {
        callback(err, results);
    };
    var afterWrite = function(err, results) {
        if (err) {
            callback(err, null);
        } else {
            this.stream.drain(afterDrain.bind(this));
        }
    };
    // console.log('Serial write: ', data);
    this.stream.write(data, afterWrite.bind(this));
}

Serial.prototype.read = function(readsize, callback, timeout) {
    if (this.readCallback) {
        callback({message: "Another read operation is already in progress"}, null);
    }

    if (readsize === 0) {
        callback(null, new Buffer(0));
    } else if (readsize > 0 && this.currentBuffer && this.currentBuffer.length >= readsize) {
        var requestedBuffer = new Buffer(this.currentBuffer.slice(0, readsize) );
        this.currentBuffer = new Buffer(this.currentBuffer.slice(readsize, this.currentBuffer.length));
        callback(null, requestedBuffer);
    } else {
        this.readSize = readsize;
        this.readCallback = callback;
        if (timeout) {
            if (this.stream.setTimeout) {
                this.timeoutHandler = this.onTimeout.bind(this);
                this.stream.setTimeout(timeout, this.timeoutHandler);
            } else {
                console.warn("Stream does not support timeout");
            }
        }
        // console.log('READ: this.readSize: ', this.readSize);
        this.stream.resume();
    }
}

Serial.prototype.close = function() {
    this.stream.pause();
    this.removeListeners();
    this.currentBuffer = null;
    this.stream.close();
}

Serial.prototype.removeListeners = function() {
    this.stream.removeListener('data', this.dataHandler);
    if (this.timeoutHandler) {
        this.stream.removeListener("timeout", this.timeoutHandler);
        this.timeoutHander = null;
    }
    this.stream.removeListener('close', this.closeHandler);
}

Serial.prototype.onOpen = function() {
    this.emit('open');
}

Serial.prototype.onTimeout = function() {
    this.removeListeners();
    if (this.readCallback) {
        var callback = this.readCallback;
        this.readCallback = null;
        if (this.currentBuffer) {
            this.stream.unshift(this.currentBuffer);
            this.currentBuffer = null;
        }
        callback({message: 'stream timeout'}, null);
    } else {
        console.error('No stream read callback was installed');
    }
}

Serial.prototype.onData = function(chunk) {
    // console.log('onData: ', chunk);

    if (this.currentBuffer) {
        this.currentBuffer = Buffer.concat([this.currentBuffer, chunk]);
    } else {
        this.currentBuffer = chunk;
    }

    if (this.readCallback) {
        // console.log('this.currentBuffer.length: ', this.currentBuffer.length);
        // console.log('this.readSize: ', this.readSize);
        if (this.currentBuffer.length === this.readSize) {
            this.stream.pause();
            var callback = this.readCallback;
            this.readCallback = null;
            var requestedBuffer = this.currentBuffer;
            this.currentBuffer = null;
            // console.log('requestedBuffer: ', requestedBuffer);
            callback(null, requestedBuffer); 
        } else if (this.currentBuffer.length > this.readSize) {
            this.stream.pause();
            var requestedBuffer = new Buffer(this.currentBuffer.slice(0, this.readSize));
            var remainingBuffer = new Buffer(this.currentBuffer.slice(this.readSize, this.currentBuffer.length));
            // this.stream.unshift(remainingBuffer);
            var callback = this.readCallback;
            this.readCallback = null;
            this.currentBuffer = remainingBuffer;
            // console.log('requestedBuffer: ', requestedBuffer);
            callback(null, requestedBuffer);
        } else {
            // Still waiting for more data before the read can be satisfied
        }
    }
}

Serial.prototype.onClose = function() {
    this.removeListeners();
    if (this.readCallback) {
        var callback = this.readCallback;
        this.readCallback = null;
        callback({message: "stream closed"}, null);
    }
}

module.exports = Serial;
