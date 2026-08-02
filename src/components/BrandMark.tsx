type BrandMarkProps = {
  size?: number
  className?: string
}

/**
 * Evernet's "orbit" logomark: a network node with two orbiting satellites
 * (mint) and one copper satellite. The ring uses `currentColor` so it
 * adapts to the surrounding text color on both light and dark headers.
 */
export default function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="32" cy="32" r="19" stroke="currentColor" strokeWidth="3.2" />
      <circle cx="32" cy="32" r="10" fill="#3DB8A0" />
      <circle cx="32" cy="13" r="4.4" fill="#3DB8A0" />
      <circle cx="24" cy="49" r="3.8" fill="#3DB8A0" />
      <circle cx="46.5" cy="44.5" r="4.4" fill="#C46B3A" />
    </svg>
  )
}
