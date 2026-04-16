import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Lumina productivity workspace';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #131316 0%, #1e1e24 50%, #131316 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle gradient orb */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-80px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(109,89,224,0.25) 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-100px',
            left: '-60px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(109,89,224,0.15) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Wordmark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          {/* Icon square */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #6D59E0, #8B7AE8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '36px',
              fontWeight: 700,
              color: '#F7F5F0',
            }}
          >
            L
          </div>
          <span
            style={{
              fontSize: '56px',
              fontWeight: 700,
              color: '#F7F5F0',
              letterSpacing: '-1px',
            }}
          >
            Lumina
          </span>
        </div>

        {/* Tagline */}
        <p
          style={{
            fontSize: '26px',
            color: '#8A8591',
            maxWidth: '700px',
            textAlign: 'center',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Calendar, tasks, and focus in one place
        </p>

        {/* Feature pills */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '40px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {['Calendar', 'Tasks', 'Pomodoro', 'Goals', 'AI Insights'].map(
            (label) => (
              <div
                key={label}
                style={{
                  padding: '10px 22px',
                  borderRadius: '999px',
                  border: '1px solid rgba(109,89,224,0.35)',
                  color: '#B0ABB8',
                  fontSize: '18px',
                  display: 'flex',
                }}
              >
                {label}
              </div>
            ),
          )}
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, transparent, #6D59E0, transparent)',
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size },
  );
}
