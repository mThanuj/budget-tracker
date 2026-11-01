// The app icon (installed app, home screen): the brand mark (src/components/app/brand.tsx)
// drawn full-bleed, so phones can round or crop it into their own shape. Rendered
// by next/og at build time; flexbox only, as ImageResponse needs.

const TEAL = "#0f6e66"; // --primary (light), src/app/globals.css
const PAPER = "#f4fbf9"; // --primary-foreground (light)

/** The mark at `size` pixels: three lines on teal, as in BrandMark's 24-unit grid. */
export function BrandIcon({ size }: { size: number }) {
  const unit = size / 24;
  const line = (width: number) => (
    <div style={{ width: width * unit, height: 1.7 * unit, borderRadius: unit, background: PAPER }} />
  );
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: 1.8 * unit,
        paddingLeft: 7.5 * unit,
        background: TEAL,
      }}
    >
      {line(9)}
      {line(9)}
      {line(5)}
    </div>
  );
}
