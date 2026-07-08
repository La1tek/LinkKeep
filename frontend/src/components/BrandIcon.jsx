export default function BrandIcon({ className = '', decorative = true, alt = 'LinkAtlas icon' }) {
  return (
    <img
      src="/linkatlas-icon.svg"
      className={className}
      alt={decorative ? '' : alt}
      aria-hidden={decorative ? 'true' : undefined}
      draggable="false"
    />
  )
}
