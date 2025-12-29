const HEX_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

type RGB = { r: number; g: number; b: number }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const expandHex = (hex: string) => {
  const value = hex.startsWith('#') ? hex.slice(1) : hex
  if (value.length === 3) {
    return `${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`
  }
  return value
}

const normalizeHex = (hex: string | undefined, fallback: string) => {
  if (!hex) return fallback
  const trimmed = hex.trim()
  if (!HEX_REGEX.test(trimmed)) {
    return fallback
  }
  return `#${expandHex(trimmed.toLowerCase())}`
}

const hexToRgb = (hex: string): RGB => {
  const value = expandHex(hex)
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return { r, g, b }
}

const rgbToHex = ({ r, g, b }: RGB) => {
  const toHex = (val: number) => {
    const clamped = clamp(Math.round(val), 0, 255)
    return clamped.toString(16).padStart(2, '0')
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const mix = (colorA: string, colorB: string, weight: number) => {
  const ratio = clamp(weight, 0, 1)
  const a = hexToRgb(colorA)
  const b = hexToRgb(colorB)
  return rgbToHex({
    r: a.r * (1 - ratio) + b.r * ratio,
    g: a.g * (1 - ratio) + b.g * ratio,
    b: a.b * (1 - ratio) + b.b * ratio,
  })
}

const tint = (hex: string, amount: number) => mix(hex, '#ffffff', amount)
const shade = (hex: string, amount: number) => mix(hex, '#000000', amount)

export const sanitizeHexColor = (hex: string | undefined, fallback: string) => normalizeHex(hex, fallback)

import type { MantineColorsTuple } from '@mantine/core'

export const buildBrandScale = (lightHex: string, darkHex: string): MantineColorsTuple => {
  const light = normalizeHex(lightHex, '#4338ca')
  const dark = normalizeHex(darkHex, '#312e81')
  return [
    tint(light, 0.15),
    tint(light, 0.25),
    tint(light, 0.35),
    tint(light, 0.45),
    tint(light, 0.55),
    light,
    mix(light, dark, 0.45),
    mix(light, dark, 0.7),
    shade(dark, 0.2),
    shade(dark, 0.35),
  ] as MantineColorsTuple
}
