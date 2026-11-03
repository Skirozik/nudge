import { ImageResponse } from 'next/og'

// The link preview iMessage and GroupMe show when someone shares getseatsnipe.com
export const alt = 'SeatSnipe: get a text when a seat opens'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const HEADLINE = 'Get a text when a seat opens.'
const BUTTON = 'Text SeatSnipe'
const DOMAIN = 'getseatsnipe.com'

type Font = { name: string; data: ArrayBuffer; weight: 600 | 900; style: 'normal' }

// Inter Tight, the site's display face: 900 for the headline, 600 for the rest.
// Google Fonts trims each file to the letters asked for, so ask for every string
// drawn here. Built once at deploy; if it can't be reached the preview still
// renders in the default face.
async function interTight(): Promise<Font[]> {
  try {
    const text = encodeURIComponent(HEADLINE + BUTTON + DOMAIN)
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;900&text=${text}`)).text()
    const faces = [...css.matchAll(/font-weight: (\d+);[^}]*?src: url\((.+?)\) format/g)]
    return await Promise.all(
      faces.map(async ([, weight, url]) => ({
        name: 'Inter Tight',
        data: await (await fetch(url)).arrayBuffer(),
        weight: Number(weight) as 600 | 900,
        style: 'normal' as const,
      }))
    )
  } catch {
    return []
  }
}

export default async function Image() {
  const fonts = await interTight()
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#080808',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          color: '#fff',
          fontFamily: fonts.length ? 'Inter Tight' : undefined,
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em' }}>seatsnipe</div>
        <div
          style={{
            fontWeight: 900,
            fontSize: 104,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            maxWidth: 900,
          }}
        >
          {HEADLINE}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 30, fontWeight: 600, color: '#8E8E93' }}>
          <div style={{ background: '#007AFF', color: '#fff', padding: '14px 32px', borderRadius: 999 }}>{BUTTON}</div>
          {DOMAIN}
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  )
}
