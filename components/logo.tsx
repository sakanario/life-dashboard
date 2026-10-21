/** Logo app: 4 kotak, yang kanan bawah oranye dicentang ("hari ini beres"). Versi kaca, gayanya di .logo (globals.css). */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <div className="logo" style={{ "--s": `${size}px` } as React.CSSProperties} aria-hidden="true">
      <i />
      <i />
      <i />
      <b>
        <svg viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </b>
    </div>
  );
}
