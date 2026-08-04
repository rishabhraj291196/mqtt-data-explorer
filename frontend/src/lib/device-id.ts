import type { DeviceIdFormat } from './types'

const ALPHANUM = 'abcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Mirrors the backend generator so the form can show the id (and preview it)
 * before the machine is saved.
 */
export function generateDeviceId(format: DeviceIdFormat): string {
  if (format === 'alphanumeric') {
    let out = ''
    for (let index = 0; index < 12; index += 1) {
      out += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)]
    }
    return out
  }
  return String(Math.floor(1_000_000_000 + Math.random() * 9_000_000_000))
}

export const DEVICE_ID_FORMATS: {
  value: DeviceIdFormat
  label: string
  hint: string
}[] = [
  {
    value: 'numeric',
    label: 'Number',
    hint: '10-digit serial, e.g. 1206260070',
  },
  {
    value: 'alphanumeric',
    label: 'Alphanumeric',
    hint: '12 letters and digits, e.g. a3f9c2d1b7e4',
  },
  { value: 'custom', label: 'Custom', hint: 'Type your own device id' },
]
