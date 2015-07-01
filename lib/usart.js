
var util = require('util');  
var events = require('events');
var async = require('async');
var when = require('when');
var com = require('serialport');
var SmartBuffer = require('smart-buffer');
var Serial = require('./serial');
var hex = require('hex');

function Device(devPath, baudrate) {
    events.EventEmitter.call(this);

    var thiz = this;

    this.serial = new Serial(devPath, { 
        baudrate: baudrate,
        rtscts: false
    });

    this.serial.on('open', this.serialOnOpen.bind(this));
}

util.inherits(Device, events.EventEmitter);

Device.prototype.serialOnOpen = function() {
    var self = this;
    async.waterfall([
        function(callback) {
            self.serial.set({
                rts: true, 
                dtr: false
            }, function(err, something) {
                console.log('DTR PULL DOWN (-3 --  12V), RESET');
                console.log('RTS PULL UP   (+3 -- +12V), BOOT TO BOOTLOADER');
                callback(err);
            });
        },

        function(callback) {
            setTimeout(function() {
                console.log('DELAY 100 MS');
                callback(null);
            }, 100);
        },

        function(callback) {
            self.serial.set({
                rts: true, 
                dtr: true
            }, function(err, something) {
                console.log('DTR PULL UP   (+3 -- +12V), CLEAR RESET');
                console.log('RTS PULL DOWN');
                callback(null);
            });
        },

        function(callback) {
            setTimeout(function() {
                console.log('DELAY 100 MS');
                callback(null);
            }, 100);
        },

        function(callback) {
            console.log('CONNECTED, WRITE 0x7f');
            self.write(new Buffer([0x7f]))
                .then(function() {
                    self.read(1).then(function(data) {
                        if (data.readUInt8(0) === 0x79) {
                            callback(null);
                        } else {
                            callback('NACK');
                        }
                    })
                })
                .else(function() {
                    console.log('FAILED !!');
                });
        },

        function(callback) {
            setTimeout(function() {
                console.log('DELAY 100 MS');
                callback(null);
            }, 200);
        }
    ], function (err, serialPort) {
        if (err) {
            throw new Error(err);
        } else {
            self.emit('open');
        }
    });
}

Device.prototype.read = function(size) {
    var promise = function(resolve, reject, notify) {
        this.serial.read(size, function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    };
    return when.promise(promise.bind(this));
}

Device.prototype.write = function(data) {
    var promise = function(resolve, reject, notify) {
        this.serial.write(data, function(err, results) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    };
    return when.promise(promise.bind(this));
}  

Device.prototype.writeDataACK = function(data) {
    var device = this;
    return when.promise(function(resolve, reject, notify) {
        device.write(data).then(function() {
            device.read(1).then(function(data) {
                if (data.readUInt8(0) === 0x79) {
                    resolve();
                } else {
                    reject(new Error('NACK'));
                }
            });
        });
    });
}

Device.prototype.writeCommandACK = function(command) {
    var self = this;
    return when.promise(function(resolve, reject, notify) {
        var cmdbuf = new Buffer([command, ~command]);
        // console.log(cmdbuf, cmdbuf.length);
        self.write(cmdbuf).then(function() {
            // console.log('Write done');
            self.read(1).then(function(data) {
                // console.log('Read done: 0x%x'.format(data.readUInt8(0)));
                if (data.readUInt8(0) === 0x79) {
                    resolve();
                } else {
                    reject(new Error('NACK'));
                }
            });
        });
    });
}

Device.prototype.close = function() {
    var self = this;
    setTimeout(function() {
        self.serial.set({
            rts: false, 
            dtr: true
        }, function(err, something) {
            self.serial.close();
        });
    }, 100);
}

Device.prototype.globalErase = function() {
    var device = this;
    return when.promise(function(resolve, reject, notify) {
        async.waterfall([
            function(callback) {
                // console.log('写入命令 0x43');
                device.writeCommandACK(0x43).then(function() {
                    callback(null);
                });
            },
            function(callback) {
                device.writeDataACK([0xff, 0x00]).then(function() {
                    callback(null);
                });
            }
        ], function(err) {
            if (err) {
                reject();
            } else {
                resolve();
            }
        });
    });
}

Device.prototype.writeMemory = function(address, data) {
    var device = this;
    return when.promise(function(resolve, reject, notify) {
        async.waterfall([
            // 写命令
            function(callback) {
                // console.log('写入命令 0x31');
                device.writeCommandACK(0x31).then(function() {
                    callback(null);
                });
            },
            // 写地址
            function(callback) {
                var addrbuf = new Buffer(5);
                addrbuf.writeUInt32BE(address, 0); // STM32.FLASHSTART
                var checksum = 0;
                for (var i = 0; i < 4; i++) {
                    checksum = checksum ^ addrbuf[i];
                }
                addrbuf.writeUInt8(checksum, 4);
                // console.log('写入地址');
                // hex(addrbuf);
                device.writeDataACK(addrbuf).then(function() {
                    callback(null);
                });
            },
            // 写数据
            function(callback) {
                var sb = new SmartBuffer();
                var n = data.length;
                sb.writeUInt8(n - 1);

                // number of bytes to write
                sb.writeBuffer(data);
                // sb.writeUInt8(0);

                var checksum = 0 ^ (n - 1);
                for (var i = 0; i < n; i++) {
                    checksum ^= data[i];
                }
                checksum ^= 0;

                sb.writeUInt8(checksum);
                var fbuf = sb.toBuffer();

                // console.log('实际 %d 字节, 写入 0x%x 地址 %d 字节'.format(n, address, fbuf.length));//, fbuf.toString('binary', 0, fbuf.length));
                // hex(fbuf);
                device.writeDataACK(fbuf).then(function() {
                    callback(null);
                });
            }
        ], function(err) {
            if (err) {
                reject();
            } else {
                resolve();
            }
        });
    });
}

Device.prototype.readMemory = function(address, size) {
    var device = this;
    return when.promise(function(resolve, reject, notify) {
        async.waterfall([
            // 写命令
            function(callback) {
                // console.log('写入命令 0x11');
                device.writeCommandACK(0x11).then(function() {
                    callback(null);
                });
            },
            // 写地址
            function(callback) {
                var addrbuf = new Buffer(5);
                addrbuf.writeUInt32BE(address, 0); // STM32.FLASHSTART
                var checksum = 0;
                for (var i = 0; i < 4; i++) {
                    checksum = checksum ^ addrbuf[i];
                }
                addrbuf.writeUInt8(checksum, 4);
                // console.log('写入地址');
                // hex(addrbuf);
                device.writeDataACK(addrbuf).then(function() {
                    callback(null);
                });
            },
            // 写数据
            function(callback) {
                var sb = new SmartBuffer();
                // number of bytes to read
                var n = size - 1;
                sb.writeUInt8(n);
                var checksum = 0;
                checksum = ~n & 0xff;
                sb.writeUInt8(checksum); // checksum
                var fbuf = sb.toBuffer();
                // console.log('从 0x%x 地址 读取 %d 字节'.format(address, size), "[%x %x]".format(n, checksum));
                device.writeDataACK(fbuf).then(function() {
                    callback(null);
                });
            },
            function(callback) {
                device.read(size).then(function(data) {
                    // hex(data);
                    callback(null, data);
                })
            }
        ], function(err, data) {
            if (err) {
                reject();
            } else {
                resolve(data);
            }
        });
    });
}

Device.prototype.go = function(address) {
    var device = this;
    return when.promise(function(resolve, reject, notify) {
        async.waterfall([
            // 写命令
            function(callback) {
                // console.log('写入命令 0x21');
                device.writeCommandACK(0x21).then(function() {
                    callback(null);
                });
            },
            // 写地址
            function(callback) {
                var addrbuf = new Buffer(5);
                addrbuf.writeUInt32BE(address, 0); // STM32.FLASHSTART
                var checksum = 0;
                for (var i = 0; i < 4; i++) {
                    checksum = checksum ^ addrbuf[i];
                }
                addrbuf.writeUInt8(checksum, 4);
                // console.log('跳转到 0x%x 地址执行'.format(address));
                // hex(addrbuf);
                device.writeDataACK(addrbuf).then(function() {
                    callback(null);
                });
            }
        ], function(err) {
            if (err) {
                reject();
            } else {
                resolve();
            }
        });
    });
}

module.exports = {
    open: function(devPath, baudrate) {
        return when.promise(function(resolve, reject, notify) {
            var device = new Device(devPath, baudrate);
            device.once('open', function() {
                resolve(device);
            });
        });
    }
}
