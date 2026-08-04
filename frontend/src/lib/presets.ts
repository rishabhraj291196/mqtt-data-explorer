export interface TemplatePreset {
  id: string
  label: string
  hint: string
  topic: string
  intervalMs: number
  template: string
}

/** Ready-made device payloads — a starting point users can edit freely. */
export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'temperature',
    label: 'Temperature / humidity sensor',
    hint: 'Classic environment sensor with smooth drift',
    topic: 'sensors/{{deviceId}}/telemetry',
    intervalMs: 2000,
    template: `{
  "deviceId": "{{deviceId}}",
  "temperature": "{{walk:18:42:0.4}}",
  "humidity": "{{walk:35:85:1.5}}",
  "battery": "{{int:40:100}}",
  "timestamp": "{{iso}}"
}`,
  },
  {
    id: 'energy',
    label: 'Energy meter',
    hint: 'Three-phase readings plus a rising kWh counter',
    topic: 'energy/{{deviceId}}/reading',
    intervalMs: 5000,
    template: `{
  "meterId": "{{deviceId}}",
  "voltage": { "l1": "{{walk:225:240:1}}", "l2": "{{walk:225:240:1}}", "l3": "{{walk:225:240:1}}" },
  "current": { "l1": "{{walk:2:16:0.6}}", "l2": "{{walk:2:16:0.6}}", "l3": "{{walk:2:16:0.6}}" },
  "powerFactor": "{{float:0.82:0.99:2}}",
  "energyKwh": "{{counter:1000:1}}",
  "readingAt": "{{iso}}"
}`,
  },
  {
    id: 'machine-status',
    label: 'Factory machine status',
    hint: 'OEE-style status, cycle counts and fault codes',
    topic: 'factory/line-1/{{deviceId}}/status',
    intervalMs: 3000,
    template: `{
  "machine": "{{deviceId}}",
  "state": "{{oneOf:RUNNING|IDLE|SETUP|FAULT}}",
  "cycleCount": "{{counter:1:1}}",
  "spindleRpm": "{{int:800:12000}}",
  "loadPercent": "{{walk:10:98:3}}",
  "toolTemp": "{{sin:35:85:120}}",
  "faultCode": "{{oneOf:NONE|NONE|NONE|E102|E415}}",
  "operator": "{{oneOf:A-shift|B-shift|C-shift}}",
  "ts": "{{epoch}}"
}`,
  },
  {
    id: 'gps',
    label: 'GPS / vehicle tracker',
    hint: 'Location, speed and ignition state',
    topic: 'fleet/{{deviceId}}/position',
    intervalMs: 1000,
    template: `{
  "vehicleId": "{{deviceId}}",
  "lat": "{{walk:28.40:28.75:0.0008}}",
  "lng": "{{walk:76.90:77.35:0.0008}}",
  "speedKph": "{{walk:0:90:6}}",
  "heading": "{{int:0:359}}",
  "ignition": "{{bool:0.85}}",
  "fuelPercent": "{{walk:5:100:0.3}}",
  "fixTime": "{{iso}}"
}`,
  },
  {
    id: 'water-tank',
    label: 'Water tank / level sensor',
    hint: 'Level, flow and pump relay state',
    topic: 'utilities/tanks/{{deviceId}}',
    intervalMs: 4000,
    template: `{
  "tank": "{{deviceId}}",
  "levelPercent": "{{walk:10:100:1.2}}",
  "flowLpm": "{{float:0:120:1}}",
  "pump": "{{seq:ON|ON|OFF}}",
  "turbidityNtu": "{{float:0.1:5:2}}",
  "alarm": "{{bool:0.05}}",
  "ts": "{{iso}}"
}`,
  },
  {
    id: 'air-quality',
    label: 'Air quality monitor',
    hint: 'Device ID as the top-level key, readings array with value-matched colours',
    topic: 'airquality/{{deviceId}}/data',
    intervalMs: 15000,
    template: `{
  "{{deviceId}}": {
    "lastUpdated": "{{date}} {{time}}",
    "data": [
      { "type": "pm25", "value": "{{var:pm25:walk:8:180:3}}", "color": "{{range:pm25:30=#17AF35|60=#74CB40|90=#E1CB43|120=#E19343|*=#E14343}}", "label": "PM2.5", "unit": "µg/m3" },
      { "type": "pm10", "value": "{{var:pm10:walk:15:250:5}}", "color": "{{range:pm10:50=#17AF35|100=#74CB40|150=#E1CB43|200=#E19343|*=#E14343}}", "label": "PM10", "unit": "µg/m3" },
      { "type": "aqi", "value": "{{var:aqi:walk:20:220:4}}", "color": "{{range:aqi:50=#17AF35|100=#74CB40|150=#E1CB43|200=#E19343|*=#E14343}}", "label": "AQI", "unit": "" },
      { "type": "co2", "value": "{{var:co2:walk:400:1800:25}}", "color": "{{range:co2:800=#17AF35|1200=#74CB40|1600=#E1CB43|*=#E14343}}", "label": "CO2", "unit": "ppm" },
      { "type": "voc", "value": "{{var:voc:walk:20:600:15}}", "color": "{{range:voc:100=#17AF35|250=#74CB40|500=#E1CB43|*=#E14343}}", "label": "TVOC", "unit": "ppb" },
      { "type": "temperature", "value": "{{var:temp:walk:18:38:0.3}}", "color": "{{range:temp:24=#17AF35|30=#74CB40|34=#E1CB43|*=#E14343}}", "label": "Temperature", "unit": "°C" },
      { "type": "humidity", "value": "{{var:hum:walk:25:85:1}}", "color": "{{range:hum:40=#17AF35|60=#74CB40|75=#E1CB43|*=#E14343}}", "label": "Humidity", "unit": "%" },
      { "type": "battery", "value": "{{var:batt:walk:5:100:0.4}}", "color": "{{range:batt:20=#E14343|50=#E1CB43|*=#17AF35}}", "label": "Battery", "unit": "%" },
      { "type": "viral_index", "value": "{{var:viral:walk:20:95:2}}", "color": "{{range:viral:40=#17AF35|70=#74CB40|*=#E14343}}", "label": "Viral Index" }
    ],
    "battery": "{{var:batt}}"
  }
}`,
  },
  {
    id: 'heartbeat',
    label: 'Device heartbeat',
    hint: 'Minimal keep-alive with uptime and firmware info',
    topic: 'devices/{{deviceId}}/heartbeat',
    intervalMs: 10000,
    template: `{
  "deviceId": "{{deviceId}}",
  "seq": "{{counter}}",
  "uptimeSec": "{{counter:0:10}}",
  "rssi": "{{int:-95:-40}}",
  "ip": "{{ip}}",
  "mac": "{{mac}}",
  "firmware": "2.4.{{int:0:9}}",
  "ts": "{{iso}}"
}`,
  },
]

export const BLANK_TEMPLATE = `{
  "deviceId": "{{deviceId}}",
  "value": "{{int:0:100}}",
  "timestamp": "{{iso}}"
}`
