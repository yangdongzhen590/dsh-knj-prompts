/**
 * 统一 SVG 图标集（16px stroke 线形，currentColor）。不依赖 emoji。
 */
import { createElement as h } from 'react'
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base(size: number): SVGProps<SVGSVGElement> {
  return {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
}

export const IconSparkles = ({ size = 16, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></svg>
)

export const IconChevronDown = ({ size = 16, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}><path d="m6 9 6 6 6-6" /></svg>
)

export const IconPlus = ({ size = 16, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}><path d="M12 5v14M5 12h14" /></svg>
)

export const IconStar = ({ size = 16, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>
)

export const IconTrash = ({ size = 16, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
)

export const IconClose = ({ size = 16, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
