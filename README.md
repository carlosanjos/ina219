# Read values from the INA219 on UPS HAT (B)

This link also provides a Python version of this code where
[https://www.waveshare.com/wiki/UPS_HAT_(B)](https://www.waveshare.com/wiki/UPS_HAT_(B))

The schematics can be found at
[https://www.waveshare.com/w/upload/1/10/Ina219.pdf](https://www.waveshare.com/w/upload/1/10/Ina219.pdf)


**Note: if the current value is negative, it means that the batteries are feeding the Raspberry Pi. If the current value is positive, it means that the batteries are charging.**

## How to run this code.

#### First you need to install the depencies

`npm install`

#### Once the installations is complete use

`npm start`

## Considerations about the calculations

By default we use a pretty huge range for the input voltage,
which probably isn't the most appropriate choice for system
that don't use a lot of power.  But all of the calculations
are shown below if you want to change the settings.  You will
also need to change any relevant register settings, such as
setting the VBUS_MAX to 16V instead of 32V, etc.

```
VBUS_MAX = 32V             (Assumes 32V, can also be set to 16V)
VSHUNT_MAX = 0.32          (Assumes Gain 8, 320mV, can also be 0.16, 0.08, 0.04)
RSHUNT = 0.1               (Resistor value in ohms)
```
1. Determine max possible current
```
MaxPossible_I = VSHUNT_MAX / RSHUNT
MaxPossible_I = 3.2A
```

2. Determine max expected current
```
MaxExpected_I = 2.0A
```

3. Calculate possible range of LSBs (Min = 15-bit, Max = 12-bit)
```
MinimumLSB = MaxExpected_I/32767
MinimumLSB = 0.000061              (61uA per bit)
MaximumLSB = MaxExpected_I/4096
MaximumLSB = 0,000488              (488uA per bit)
```

4. Choose an LSB between the min and max values
```
(Preferrably a roundish number close to MinLSB)
CurrentLSB = 0.0001 (100uA per bit)
```

5. Compute the calibration register
```
Cal = trunc (0.04096 / (Current_LSB * RSHUNT))
Cal = 4096 (0x1000)
```

6. Calculate the power LSB
```
PowerLSB = 20 * CurrentLSB
PowerLSB = 0.002 (2mW per bit)
```

7. Compute the maximum current and shunt voltage values before overflow
```javascript
Max_Current = Current_LSB * 32767
Max_Current = 3.2767A before overflow

if (Max_Current > Max_Possible_I) {
    Max_Current_Before_Overflow = MaxPossible_I;
} else {
    Max_Current_Before_Overflow = Max_Current;
}

Max_ShuntVoltage = Max_Current_Before_Overflow * RSHUNT;
Max_ShuntVoltage = 0.32V;

if (Max_ShuntVoltage >= VSHUNT_MAX) {
    Max_ShuntVoltage_Before_Overflow = VSHUNT_MAX;
} else {
    Max_ShuntVoltage_Before_Overflow = Max_ShuntVoltage;
}
```
8. Compute the Maximum Power
```javascript
MaximumPower = Max_Current_Before_Overflow * VBUS_MAX;
MaximumPower = 3.2 * 32V;
MaximumPower = 102.4W;
```