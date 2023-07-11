import { openPromisified } from 'i2c-bus';

// Config Register (R/W)
const _REG_CONFIG = 0x00;

// SHUNT VOLTAGE REGISTER (R)
const _REG_SHUNTVOLTAGE = 0x01;

// BUS VOLTAGE REGISTER (R)
const _REG_BUSVOLTAGE = 0x02;

// POWER REGISTER (R)
const _REG_POWER = 0x03;

// CURRENT REGISTER (R)
const _REG_CURRENT = 0x04;

// CALIBRATION REGISTER (R/W)
const _REG_CALIBRATION = 0x05;

class BusVoltageRange {
    static RANGE_16V = 0x00; // set bus voltage range to 16V
    static RANGE_32V = 0x01; // set bus voltage range to 32V (default)
}

class Gain {
    static DIV_1_40MV = 0x00; // shunt prog. gain set to  1, 40 mV range
    static DIV_2_80MV = 0x01; // shunt prog. gain set to /2, 80 mV range
    static DIV_4_160MV = 0x02; // shunt prog. gain set to /4, 160 mV range
    static DIV_8_320MV = 0x03; // shunt prog. gain set to /8, 320 mV range
}

class ADCResolution {
    /**
     * Constants for bus_adc_resolution or shunt_adc_resolution
     */
    static ADCRES_9BIT_1S = 0x00; //  9bit,   1 sample,     84us
    static ADCRES_10BIT_1S = 0x01; // 10bit,   1 sample,    148us
    static ADCRES_11BIT_1S = 0x02; // 11 bit,  1 sample,    276us
    static ADCRES_12BIT_1S = 0x03; // 12 bit,  1 sample,    532us
    static ADCRES_12BIT_2S = 0x09; // 12 bit,  2 samples,  1.06ms
    static ADCRES_12BIT_4S = 0x0A; // 12 bit,  4 samples,  2.13ms
    static ADCRES_12BIT_8S = 0x0B; // 12bit,   8 samples,  4.26ms
    static ADCRES_12BIT_16S = 0x0C; // 12bit,  16 samples,  8.51ms
    static ADCRES_12BIT_32S = 0x0D; // 12bit,  32 samples, 17.02ms
    static ADCRES_12BIT_64S = 0x0E; // 12bit,  64 samples, 34.05ms
    static ADCRES_12BIT_128S = 0x0F; // 12bit, 128 samples, 68.10ms
}

class Mode {
    /**
     * Consts for mode
     */
    static POWERDOW = 0x00; // power down
    static SVOLT_TRIGGERED = 0x01; // shunt voltage triggered
    static BVOLT_TRIGGERED = 0x02; // bus voltage triggered
    static SANDBVOLT_TRIGGERED = 0x03; // shunt and bus voltage triggered
    static ADCOFF = 0x04; // ADC off
    static SVOLT_CONTINUOUS = 0x05; // shunt voltage continuous
    static BVOLT_CONTINUOUS = 0x06; // bus voltage continuous
    static SANDBVOLT_CONTINUOUS = 0x07; // shunt and bus voltage continuous
}

class INA219 {
    bus = null;
    addr = null;

    // Set chip to known config values to start
    _cal_value = 0;
    _current_lsb = 0;
    _power_lsb = 0;

    constructor(i2c_bus = 1, addr = 0x42) {
        this.bus = openPromisified(i2c_bus);
        this.addr = addr;

        this.setCalibration32V2A();
    }

    read(address) {
        const readBuffer = Buffer.alloc(2);

        return this.bus
            .then((socket) => socket.readI2cBlock(this.addr, address, 2, readBuffer)
                .then((cb, err) => {
                    if (err) {
                        throw err
                    };

                    const temp = [...cb.buffer];
                    return (temp[0] * 256) + temp[1];
                })
                .then(() => readBuffer.readUInt16BE())
            );
    }

    write(address, data) {
        let temp = [0, 0];

        temp[1] = data & 0xFF;
        temp[0] = (data & 0xFF00) >> 8;
        let writeBuffer = Buffer.from(temp);

        this.bus
            .then((socket) => socket.writeI2cBlock(this.addr, address, writeBuffer.length, writeBuffer))
            .catch((err) => console.log(err));
    }

    setCalibration32V2A() {
        /**
         * Configures to INA219 to be able to measure up to 32V and 2A of current. Counter
         * overflow occurs at 3.2A.
         * These calculations assume a 0.1 shunt ohm resistor is present
         */
        this._current_lsb = .1;
        this._cal_value = 4096;
        this._power_lsb = .002;

        this.write(_REG_CALIBRATION, this._cal_value);

        /**
         * bus voltage range << 13
         * gain << 11
         * bus ADC resoltion << 7
         * shunt ADC resoluton << 3
         * mode
         */
        const config = BusVoltageRange.RANGE_32V << 13
            | Gain.DIV_8_320MV << 11
            | ADCResolution.ADCRES_12BIT_32S << 7
            | ADCResolution.ADCRES_12BIT_32S << 3
            | Mode.SANDBVOLT_CONTINUOUS;

        this.write(_REG_CONFIG, config);
    }

    async getShuntVoltage() {
        this.write(_REG_CALIBRATION, this._cal_value);
        let value = await this.read(_REG_SHUNTVOLTAGE);

        if (value > 32767) {
            value -= 65535;
        }

        return value * 0.01;
    }

    async getBusVoltage() {
        this.write(_REG_CALIBRATION, this._cal_value);

        const busVoltage = await this.read(_REG_BUSVOLTAGE);

        return (busVoltage >> 3) * 0.004;
    }

    async getCurrentmA() {
        let value = await this.read(_REG_CURRENT);

        if (value > 32767) {
            value -= 65535;
        }

        return value * this._current_lsb;
    }

    async getPowerW() {
        this.write(_REG_CALIBRATION, this._cal_value);
        let value = await this.read(_REG_POWER);

        if (value > 32767) {
            value -= 65535;
        }

        return value * this._power_lsb;
    }
}

const ina = new INA219(1, 0x42);

async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    })
}

try {
    while (true) {
        const busVoltage = await ina.getBusVoltage(); // voltage on V- (load side)
        const shuntVoltage = await ina.getShuntVoltage() / 1000; // voltage between V+ and V- across the shunt
        const current = await ina.getCurrentmA(); // current in mA
        const power = await ina.getPowerW(); // power in W

        let percentage = (busVoltage - 6) / 2.4 * 100;

        if (percentage > 100) {
            percentage = 100;
        }

        if (percentage < 0) {
            percentage = 0;
        }

        // INA219 measures bus voltage on the load side. So PSU voltage = busVoltage + shuntVoltage
        console.log('PSU voltage', (busVoltage + shuntVoltage));
        console.log('Load Voltage', busVoltage);
        console.log('Current', current / 1000);
        console.log('Power', power);
        console.log('Percentage', percentage);
        console.log('shuntVoltage', shuntVoltage);

        await sleep(5000);
    }
} catch (e) {
    console.log(e, 'could not read required values');
}
